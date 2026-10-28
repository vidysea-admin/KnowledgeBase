/**
 * apps/api/src/source-intake/store.ts — T-045 persistence sink + intake deps for `POST /ingest/source`.
 * `createMongoIntakeSink` implements `@lkb/ingest`'s `IntakeSink` over the tenant-scoped collections
 * (`scopedCollection`, via `@lkb/db`): every read and write is pinned to the caller's tenant. `save` is
 * all-or-nothing by compensation (no cross-collection transaction here): it records what it inserted
 * and, on a later failure, deletes exactly those rows by `_id`, never rows another writer created.
 * D-135: a repeat ingest of the same source id never reaches `save` (the planner returns "already-ingested").
 * D-136: the source id is the tenant-scoped id the planner already verified.
 */
import { randomUUID } from "node:crypto";
import { assertValidTenantId, scopedCollection, getDb, sources as sourcesColl, sessions as sessionsColl, turns as turnsColl } from "@lkb/db";
import type { Media, Sessions, Sources, Turns } from "@lkb/core";
import { intakeFromSource, type ConsentContext, type IntakePlan, type IntakeResult, type IntakeSink, type Source } from "@lkb/ingest";
import { assertTurnTimings } from "../turn-timing.js";
import type { BoundIndexer } from "../indexing/session.js";
import type { IndexSessionResult } from "../indexing/types.js";

export interface ScopedColl<T> {
  findOne(filter?: Record<string, unknown>): Promise<unknown>;
  insertOne(doc: Omit<T, "tenantId">): Promise<unknown>;
  insertMany(docs: Omit<T, "tenantId">[]): Promise<unknown>;
  deleteMany(filter?: Record<string, unknown>): Promise<unknown>;
}

/** Tenant-scoped collection accessors; tests inject in-memory fakes. */
export interface IntakeCollections {
  sources(tenantId: string): ScopedColl<Sources>;
  media(tenantId: string): ScopedColl<Media>;
  sessions(tenantId: string): ScopedColl<Sessions>;
  turns(tenantId: string): ScopedColl<Turns>;
}

export function mongoIntakeCollections(): IntakeCollections {
  return {
    sources: (t) => sourcesColl(t) as unknown as ScopedColl<Sources>,
    media: (t) => scopedCollection<Media>(getDb(), "media")(t) as unknown as ScopedColl<Media>,
    sessions: (t) => sessionsColl(t) as unknown as ScopedColl<Sessions>,
    turns: (t) => turnsColl(t) as unknown as ScopedColl<Turns>,
  };
}

export function createMongoIntakeSink(colls: IntakeCollections = mongoIntakeCollections()): IntakeSink {
  return {
    async findSessionBySource(tenantId, sourceId) {
      assertValidTenantId(tenantId, "intakeSink.findSessionBySource");
      const row = (await colls.sessions(tenantId).findOne({ sourceId })) as { _id?: unknown } | null;
      return row && typeof row._id === "string" ? { sessionId: row._id } : undefined;
    },
    async save(plan: IntakePlan) {
      const tenantId = plan.session.tenantId;
      assertValidTenantId(tenantId, "intakeSink.save");
      // Refuse invalid turn timing BEFORE the first write (/ask refuses a whole request on one bad row).
      assertTurnTimings(plan.turns, plan.session._id);
      const undo: Array<() => Promise<unknown>> = [];
      try {
        // insertOne is atomic, so its undo is registered after it succeeds (a duplicate-key loss of the source-id
        // race must NOT delete the winner's row). insertMany can write a prefix and then throw, so its undo is
        // registered BEFORE the call, keyed by the ids about to be written (ISS-W045-002); a never-written id is a
        // no-op delete, and every delete is pinned to the tenant by the scoped collection.
        await colls.sources(tenantId).insertOne(plan.source);
        undo.push(() => colls.sources(tenantId).deleteMany({ _id: plan.source._id }));
        if (plan.media.length > 0) {
          undo.push(() => colls.media(tenantId).deleteMany({ _id: { $in: plan.media.map((m) => m._id) } }));
          await colls.media(tenantId).insertMany(plan.media);
        }
        await colls.sessions(tenantId).insertOne(plan.session);
        undo.push(() => colls.sessions(tenantId).deleteMany({ _id: plan.session._id }));
        if (plan.turns.length > 0) {
          undo.push(() => colls.turns(tenantId).deleteMany({ _id: { $in: plan.turns.map((t) => t._id) } }));
          await colls.turns(tenantId).insertMany(plan.turns);
        }
      } catch (err) {
        for (const step of undo.reverse()) {
          try { await step(); } catch { /* best effort; the original error is what matters */ }
        }
        throw err;
      }
    },
  };
}

export interface SourceIntakeRequest { tenantId: string; url: string }
export interface SourceIntakeDeps {
  intake(req: SourceIntakeRequest): Promise<SourceIntakeResult>;
}

export type SourceIntakeResult = IntakeResult & {
  /** HTTP creation/dedupe describes raw intake, never implicit downstream success. */
  indexing?: { status: "done" | "failed" | "pending"; receipt?: IndexSessionResult; reason?: "indexing-incomplete" | "not-requested" | "already-ingested" };
};

function completeIntakeIndex(receipt: IndexSessionResult, sessionId: string): boolean {
  return receipt.sessionId === sessionId && receipt.completion?.version === 2 && typeof receipt.completion.strict === "boolean" && receipt.completion.complete === true &&
    receipt.completion.treeWritten === true && Number.isSafeInteger(receipt.completion.turnCount) && receipt.completion.turnCount > 0 &&
    typeof receipt.completion.generation === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(receipt.completion.generation) &&
    receipt.summary?.degraded === null && receipt.claims?.degraded === null &&
    receipt.chunks?.skipped === null && Number.isSafeInteger(receipt.chunks.written) && receipt.chunks.written > 0 && !receipt.entities?.skipped;
}

function safeIntakeIndexReceipt(receipt: IndexSessionResult): IndexSessionResult {
  // Optional provider-stage diagnostics can contain secrets even when required indexing succeeded.
  return { sessionId: receipt.sessionId, summary: { degraded: null }, claims: { degraded: null },
    chunks: { written: receipt.chunks.written, skipped: null }, entities: null, gapRecorded: receipt.gapRecorded,
    completion: { version: 2, strict: receipt.completion!.strict === true, complete: true,
      generation: receipt.completion!.generation, turnCount: receipt.completion!.turnCount, treeWritten: true } };
}

/** Thrown by deps that are mounted but not configured (e.g. no STT); the route answers 503. */
export class SourceIntakeUnconfiguredError extends Error {
  constructor(message: string) { super(message); this.name = "SourceIntakeUnconfiguredError"; }
}

export interface SourceIntakeOptions {
  adapters: Source[];
  sink?: IntakeSink;
  indexSession?: BoundIndexer;
  newId?: () => string;
  now?: () => string;
  consentFor?: (request: SourceIntakeRequest) => ConsentContext;
}

export function createSourceIntakeDeps(opts: SourceIntakeOptions): SourceIntakeDeps {
  const sink = opts.sink ?? createMongoIntakeSink();
  return {
    async intake({ tenantId, url }) {
      assertValidTenantId(tenantId, "sourceIntake"); // before any fetch or write
      // Same stance as ingestUrl: the caller explicitly handed us a public/provided URL; never the D-008 silent mode.
      const consent: ConsentContext = opts.consentFor?.({ tenantId, url }) ?? { captureMode: "public", given: true, recordedBy: "web-ingest" };
      const result = await intakeFromSource({ kind: "url", url, tenantId }, consent, {
        adapters: opts.adapters,
        sink,
        newId: opts.newId ?? randomUUID,
        now: opts.now ?? (() => new Date().toISOString()),
      });
      if (result.status === "created" && opts.indexSession) {
        try {
          const receipt = await opts.indexSession(tenantId, result.sessionId);
          return completeIntakeIndex(receipt, result.sessionId)
            ? { ...result, indexing: { status: "done", receipt: safeIntakeIndexReceipt(receipt) } }
            : { ...result, indexing: { status: "failed", reason: "indexing-incomplete" } };
        } catch {
          return { ...result, indexing: { status: "failed", reason: "indexing-incomplete" } };
        }
      }
      // D135: a duplicate never re-indexes or writes. Its prior index state requires a separate verified consumer.
      return { ...result, indexing: { status: "pending", reason: result.status === "already-ingested" ? "already-ingested" : "not-requested" } };
    },
  };
}
