/** Durable tenant-filtered answer history, candidate reviews and evidence conflicts. */
import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { isRefusedWorkDb } from "../db-name.js";
import type { AnswerRecordStore, AnswerRun, SourceConflict } from "./answer-records.js";

export const ANSWER_RUNS = "answer_runs", SOURCE_CONFLICTS = "answer_source_conflicts";
const identity = (tenantId: string, id: string) => createHash("sha256").update(JSON.stringify([tenantId, id])).digest("hex");
const strip = <T>(doc: Document): T => { const { _id, ...rest } = doc; void _id; return rest as T; };

export function createMongoAnswerRecordStore(db: Db, opts: { production?: boolean } = {}): AnswerRecordStore {
  if (!opts.production && isRefusedWorkDb(db.databaseName)) throw new Error(`answer records refuse database "${db.databaseName}"`);
  const runs = db.collection(ANSWER_RUNS), conflicts = db.collection(SOURCE_CONFLICTS);
  const filter = (tenantId: string, id: string): Document => {
    assertValidTenantId(tenantId, "answerRecordStore"); return { _id: identity(tenantId, id) as never, tenantId };
  };
  return {
    async create(t, run) {
      if (t !== run.tenantId) throw new Error("Answer record tenant mismatch");
      await runs.insertOne({ ...run, ...filter(t, run.id) });
    },
    async get(t, id) { const row = await runs.findOne(filter(t, id)); return row ? strip<AnswerRun>(row) : null; },
    async list(t, limit) { filter(t, ""); return (await runs.find({ tenantId: t }).sort({ createdAt: -1, id: 1 }).limit(limit).toArray()).map((r) => strip<AnswerRun>(r)); },
    async reviewItems(t, limit) {
      filter(t, "");
      const pending = await runs.find({ tenantId: t, state: "review" }).sort({ createdAt: 1, id: 1 }).limit(limit).toArray();
      const remaining = limit - pending.length;
      const closed = remaining > 0 ? await runs.find({ tenantId: t, state: { $in: ["approved", "rejected"] } }).sort({ createdAt: -1, id: 1 }).limit(remaining).toArray() : [];
      return [...pending, ...closed].map((r) => strip<AnswerRun>(r));
    },
    async review(t, id, digest, review) {
      if (review.candidateDigest !== digest || !["approved", "rejected"].includes(review.decision)) return false;
      const result = await runs.updateOne({ ...filter(t, id), state: "review", candidateDigest: digest, evidenceDigest: review.evidenceDigest }, { $set: { state: review.decision, review } });
      return result.modifiedCount === 1;
    },
    async feedback(t, id, item) {
      const result = await runs.updateOne({ ...filter(t, id), "feedback.99": { $exists: false } }, { $push: { feedback: item } } as never);
      return result.modifiedCount === 1;
    },
    async addConflict(t, conflict) {
      if (t !== conflict.tenantId) throw new Error("Answer conflict tenant mismatch");
      const pair = [conflict.a.id, conflict.b.id].sort();
      const _id = identity(t, JSON.stringify([conflict.runId, pair]));
      filter(t, "");
      try { await conflicts.insertOne({ ...conflict, _id: _id as never }); return conflict; }
      catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
        const existing = await conflicts.findOne({ _id: _id as never, tenantId: t });
        if (!existing) throw error;
        return strip<SourceConflict>(existing);
      }
    },
    async conflicts(t, runId) {
      filter(t, ""); return (await conflicts.find({ tenantId: t, ...(runId ? { runId } : {}) }).sort({ createdAt: 1 }).toArray()).map((r) => strip<SourceConflict>(r));
    },
    async getConflict(t, id) { filter(t, ""); const row = await conflicts.findOne({ tenantId: t, id }); return row ? strip<SourceConflict>(row) : null; },
    async resolveConflict(t, id, resolution) {
      filter(t, ""); const result = await conflicts.updateOne({ tenantId: t, id, status: "open" }, { $set: { status: "resolved", resolution } });
      return result.modifiedCount === 1;
    },
  };
}
