/**
 * T-054 persistence. The original `turns` rows are NEVER written by this module: a correction lives in a separate
 * `transcript_reviews` head (one row per tenant+session: current revision, the overlay of corrected turns, the audit entry
 * of the head revision, refresh state) plus an append-only `transcript_review_revisions` history. Every access goes through
 * `scopedCollection`, so a tenant-less query cannot compile. The head is the only mutable row and is swapped by a
 * compare-and-set on `revision`. Head mutations and a real sessions publication fence increment
 * commit together; standalone Mongo refuses these joint writes.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { runNativePublicationTransaction, bumpNativePublicationRevision } from "@lkb/db";
import { getDb } from "../../../../packages/db/src/client.js";
import { scopedCollection } from "../../../../packages/db/src/lib/tenantScope.js";
import type { ReviewChange, ReviewTurn } from "./planner.js";

export type RefreshStatus = "pending" | "complete" | "failed";
export interface RefreshState { status: RefreshStatus; revision: string; targets: string[]; completed: string[]; failedTarget?: string }
export interface OverlayTurn { turnId: string; text: string; speakerRef: string; speakerLabel?: string }
export interface AuditEntry { actorRef: string; reviewedAt: string; reason: string; changes: ReviewChange[] }
export interface ReviewHead {
  _id: string; tenantId: string; sessionId: string; revision: string; parentRevision: string;
  overlay: OverlayTurn[]; audit: AuditEntry; refresh: RefreshState; committedAt: string;
}
export interface RevisionRow extends AuditEntry {
  _id: string; tenantId: string; sessionId: string; revision: string; parentRevision: string; refreshTargets: string[];
}

/** Deterministic, collision-free across tenants (a hash of the JSON tuple, not a delimiter join). */
export const headId = (tenantId: string, sessionId: string): string => createHash("sha256").update(JSON.stringify(["head", tenantId, sessionId])).digest("hex");
export const revisionRowId = (tenantId: string, sessionId: string, revision: string): string =>
  createHash("sha256").update(JSON.stringify(["rev", tenantId, sessionId, revision])).digest("hex");

export interface ReviewStore {
  originalTurns(tenantId: string, sessionId: string): Promise<ReviewTurn[]>;
  head(tenantId: string, sessionId: string): Promise<ReviewHead | null>;
  /** First review of a session. false when a head already exists (a concurrent first commit won). */
  insertHead(tenantId: string, head: ReviewHead): Promise<boolean>;
  /** Compare-and-set: replaces the head only while its revision is still `expectedRevision`. false = lost the race. */
  replaceHead(tenantId: string, expectedRevision: string, next: ReviewHead): Promise<boolean>;
  /** Idempotent by deterministic _id: recording a revision twice leaves the first row untouched. */
  recordRevision(tenantId: string, row: RevisionRow): Promise<void>;
  listRevisions(tenantId: string, sessionId: string): Promise<RevisionRow[]>;
  /** Writes refresh progress only while the head is still at `revision`. false = a newer revision superseded it. */
  setRefresh(tenantId: string, sessionId: string, revision: string, refresh: RefreshState, options?: { unlessComplete?: boolean }): Promise<boolean>;
}

const isDuplicate = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === 11000;
const strip = <T extends { _id: string; tenantId: string }>(doc: T): Omit<T, "_id" | "tenantId"> => {
  const { _id: _i, tenantId: _t, ...rest } = doc;
  return rest;
};

export function createMongoReviewStore(db?: Db): ReviewStore {
  const d = (): Db => db ?? getDb();
  const turnsOf = (t: string) => scopedCollection<ReviewTurn>(d(), "turns")(t);
  const heads = (t: string) => scopedCollection<ReviewHead>(d(), "transcript_reviews")(t);
  const revisions = (t: string) => scopedCollection<RevisionRow>(d(), "transcript_review_revisions")(t);
  const mutate = async (tenant: string, sessionId: string, work: (database: Db) => Promise<boolean>): Promise<boolean> => {
    return runNativePublicationTransaction(d(), tenant, async tx => {
      await bumpNativePublicationRevision(tx, tenant, sessionId);
      if (!await work(tx)) throw Object.assign(new Error("Transcript review superseded"), { reviewConflict: true });
      return true;
    }).catch(error => {
      if ((error as { reviewConflict?: boolean }).reviewConflict || (error as { code?: number }).code === 112) return false;
      throw error;
    });
  };
  return {
    async originalTurns(tenantId, sessionId) {
      const rows = await turnsOf(tenantId).find({ sessionId }).toArray();
      return rows.filter((r) => r.tenantId === tenantId && r.sessionId === sessionId)
        .sort((a, b) => (a.tStart - b.tStart) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
    },
    async head(tenantId, sessionId) {
      const row = await heads(tenantId).findOne({ _id: headId(tenantId, sessionId) });
      return row && row.tenantId === tenantId && row.sessionId === sessionId ? row : null;
    },
    async insertHead(tenantId, head) {
      try { return await mutate(tenantId, head.sessionId, async database => {
        await scopedCollection<ReviewHead>(database, "transcript_reviews")(tenantId).insertOne(head); return true;
      }); } catch (e) { if (isDuplicate(e)) return false; throw e; }
    },
    async replaceHead(tenantId, expectedRevision, next) {
      return mutate(tenantId, next.sessionId, async database => {
        const r = await scopedCollection<ReviewHead>(database, "transcript_reviews")(tenantId)
          .updateOne({ _id: next._id, sessionId: next.sessionId, revision: expectedRevision }, { $set: strip(next) });
        return r.matchedCount === 1;
      });
    },
    async recordRevision(tenantId, row) {
      await revisions(tenantId).updateOne({ _id: row._id }, { $setOnInsert: strip(row) }, { upsert: true });
    },
    async listRevisions(tenantId, sessionId) {
      const rows = await revisions(tenantId).find({ sessionId }).toArray();
      return rows.filter((r) => r.tenantId === tenantId && r.sessionId === sessionId)
        .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.revision.localeCompare(b.revision));
    },
    async setRefresh(tenantId, sessionId, revision, refresh, options) {
      return mutate(tenantId, sessionId, async database => {
        const r = await scopedCollection<ReviewHead>(database, "transcript_reviews")(tenantId)
          .updateOne({ _id: headId(tenantId, sessionId), sessionId, revision,
            ...(options?.unlessComplete ? { "refresh.status": { $ne: "complete" } } : {}) }, { $set: { refresh } });
        return r.matchedCount === 1;
      });
    },
  };
}
