/** Real Mongo candidate persistence. Unmounted until all trusted readers enforce quarantine. */
import type { ClientSession, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import type { Sources, Sessions, Turns } from "@lkb/core";
import { assertValidTenantId, scopedCollection, withTenant } from "@lkb/db";
import { detectWhatsAppReviewCandidates, whatsAppReviewCandidateId, whatsAppReviewContentHash, type WhatsAppReviewCandidate } from "./detection.js";
import { assertWhatsAppReviewCandidateSchema } from "./validation.js";

export type WhatsAppReviewAction = "approved" | "rejected";
export type WhatsAppReviewResult =
  | { result: "ok"; changed: boolean; candidate: WhatsAppReviewCandidate }
  | { result: "not_found" | "conflict" | "excluded" | "publish_unavailable" };
export interface WhatsAppReviewRepository {
  list(tenantId: string): Promise<WhatsAppReviewCandidate[]>;
  get(tenantId: string, id: string): Promise<WhatsAppReviewCandidate | null>;
  insert(tenantId: string, candidates: readonly WhatsAppReviewCandidate[]): Promise<number>;
  decide(tenantId: string, id: string, action: WhatsAppReviewAction, actor: string): Promise<WhatsAppReviewResult>;
}
/** All materialisation writes MUST use this database and session. No indexSession/batch publish.
 * The retried transaction callback must not perform provider requests or external side effects. */
export type WhatsAppReviewMaterializer = (context: {
  candidate: Readonly<WhatsAppReviewCandidate>; db: Db; session: ClientSession;
}) => Promise<void>;

export const isWhatsAppReviewId = (id: unknown): id is string => typeof id === "string" && /^wa-review:[a-f0-9]{64}$/u.test(id);

/** A real same-source write serializes publication with consent withdrawal.
 * Fresh UUID per transaction attempt avoids no-op writes. Mongo retries conflicting
 * transactions, which must then revalidate current source consent and evidence. */
async function fenceApproval(db: Db, tenantId: string, row: WhatsAppReviewCandidate, session: ClientSession): Promise<void> {
  const result = await db.collection<Sources>("sources").updateOne(withTenant<Sources>(tenantId, {
    _id: row.sourceId, kind: "whatsapp-batch", path: row.groupJid, "consent.given": { $ne: false },
  }), { $set: { "sourceMeta.whatsappReviewFence": randomUUID() } }, { session });
  if (result.acknowledged !== true || result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new Error("WhatsApp review: source authorization fence unavailable");
  }
}

export async function checkEvidence(db: Db, tenantId: string, row: WhatsAppReviewCandidate, session?: ClientSession): Promise<void> {
  assertWhatsAppReviewCandidateSchema(row);
  if (row.tenantId !== tenantId || !isWhatsAppReviewId(row._id)
      || row._id !== whatsAppReviewCandidateId(row) || row.contentHash !== whatsAppReviewContentHash(row.text)
      || !row.evidence.length) throw new Error("WhatsApp review: invalid candidate identity or evidence");
  const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: row.sourceId }), { session });
  const sourceSession = await db.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: row.sessionId }), { session });
  // An old pending/approved row is not authority to override withdrawn source consent.
  // This is checked in the same Mongo transaction as approval and publication; trusted
  // readers independently recheck current consent after the transaction commits.
  if (!source || source.tenantId !== tenantId || source.kind !== "whatsapp-batch" || source.path !== row.groupJid || source.consent?.given === false
      || !sourceSession || sourceSession.tenantId !== tenantId || sourceSession.sourceId !== row.sourceId) {
    throw new Error("WhatsApp review: source/session evidence unavailable");
  }
  const turns: Turns[] = [];
  for (const evidence of row.evidence) {
    if (evidence.sessionId !== row.sessionId) throw new Error("WhatsApp review: evidence session mismatch");
    const turn = await db.collection<Turns>("turns").findOne(withTenant<Turns>(tenantId, { _id: evidence.turnId, sessionId: row.sessionId }), { session });
    if (!turn || turn.tenantId !== tenantId || turn.sessionId !== row.sessionId || turn.text !== evidence.quote
        || turn.speakerRef !== evidence.speakerRef || turn.occurredAt !== evidence.occurredAt
        || turn.speakerLabel !== evidence.speakerLabel) throw new Error("WhatsApp review: exact turn evidence unavailable");
    turns.push(turn);
  }
  const canonical = detectWhatsAppReviewCandidates(tenantId, { source, session: sourceSession, turns,
    ...(row.attachment ? { attachments: [{ turnId: row.evidence[0].turnId, ...row.attachment }] } : {}) }, row.createdAt)
    .find(proposal => proposal._id === row._id);
  if (!canonical) throw new Error("WhatsApp review: proposed content is not grounded in source evidence");
  for (const flag of canonical.flags.filter(flag => flag.kind !== "duplicate")) {
    if (!row.flags.some(actual => actual.kind === flag.kind && actual.turnId === flag.turnId && actual.reason === flag.reason)) {
      throw new Error("WhatsApp review: required sensitive/exclusion flag missing");
    }
  }
}

export function createMongoWhatsAppReviewRepository(db: Db, options: {
  materialize?: WhatsAppReviewMaterializer; now?: () => string;
} = {}): WhatsAppReviewRepository {
  const now = options.now ?? (() => new Date().toISOString());
  const collection = (tenantId: string) => scopedCollection<WhatsAppReviewCandidate>(db, "whatsapp_candidates")(tenantId);
  const load = async (tenantId: string, id: string, session?: ClientSession): Promise<WhatsAppReviewCandidate | null> => {
    assertValidTenantId(tenantId, "whatsapp.review.get");
    if (!isWhatsAppReviewId(id)) return null;
    const row = await db.collection<WhatsAppReviewCandidate>("whatsapp_candidates").findOne(withTenant<WhatsAppReviewCandidate>(tenantId, { _id: id }), { session });
    return row?.tenantId === tenantId ? row : null;
  };
  return {
    async list(tenantId) {
      const rows = await collection(tenantId).find({ status: "needs-review" }).toArray();
      const own = rows.filter(row => row.tenantId === tenantId && row.status === "needs-review");
      for (const row of own) await checkEvidence(db, tenantId, row);
      return own.sort((a, b) => a._id.localeCompare(b._id));
    },
    async get(tenantId, id) {
      const row = await load(tenantId, id);
      if (row) await checkEvidence(db, tenantId, row);
      return row;
    },
    async insert(tenantId, candidates) {
      assertValidTenantId(tenantId, "whatsapp.review.insert");
      // Validate the entire proposal batch before any database effects.
      for (const row of candidates) {
        assertWhatsAppReviewCandidateSchema(row);
        if (row.tenantId !== tenantId || row.status !== "needs-review" || row.decision
            || !isWhatsAppReviewId(row._id) || row._id !== whatsAppReviewCandidateId(row)) {
          throw new Error("WhatsApp review: only this tenant's pending proposals may be inserted");
        }
      }
      if (!candidates.length) return 0;
      const session = db.client.startSession();
      try {
        const inserted = await session.withTransaction(async () => {
          let count = 0;
          for (const row of candidates) {
            await checkEvidence(db, tenantId, row, session);
            const { _id, tenantId: _tenant, ...body } = row;
            const result = await collection(tenantId).updateOne({ _id }, { $setOnInsert: body }, { upsert: true, session });
            count += result.upsertedCount;
          }
          return count;
        });
        return inserted ?? 0;
      } finally { await session.endSession(); }
    },
    async decide(tenantId, id, action, actor) {
      assertValidTenantId(tenantId, "whatsapp.review.decide");
      if (action !== "approved" && action !== "rejected") throw new Error("WhatsApp review: invalid decision action");
      if (typeof actor !== "string" || !actor.trim()) throw new Error("WhatsApp review: verified decision actor required");
      if (!isWhatsAppReviewId(id)) return { result: "not_found" };
      const at = now();
      if (!Number.isFinite(Date.parse(at))) throw new Error("WhatsApp review: invalid decision time");
      const session = db.client.startSession();
      try {
        const result = await session.withTransaction<WhatsAppReviewResult>(async () => {
          const row = await load(tenantId, id, session);
          if (!row) return { result: "not_found" };
          if (row.status === action) {
            await checkEvidence(db, tenantId, row, session);
            if (action === "approved") await fenceApproval(db, tenantId, row, session);
            return { result: "ok", changed: false, candidate: row };
          }
          if (row.status !== "needs-review") return { result: "conflict" };
          if (action === "approved" && row.flags.some(flag => flag.kind === "personal-excluded")) return { result: "excluded" };
          if (action === "approved" && !options.materialize) return { result: "publish_unavailable" };
          await checkEvidence(db, tenantId, row, session);
          if (action === "approved") await fenceApproval(db, tenantId, row, session);
          const candidate: WhatsAppReviewCandidate = { ...row, status: action, decision: { action, actor, at } };
          assertWhatsAppReviewCandidateSchema(candidate);
          const changed = await collection(tenantId).updateOne({ _id: id, status: "needs-review" }, { $set: { status: action, decision: candidate.decision } }, { session });
          if (changed.modifiedCount !== 1) throw new Error("WhatsApp review: concurrent decision changed; retry");
          if (action === "approved") await options.materialize!({ candidate: structuredClone(candidate), db, session });
          return { result: "ok", changed: true, candidate };
        });
        if (!result) throw new Error("WhatsApp review: transaction did not complete");
        return result;
      } finally { await session.endSession(); }
    },
  };
}
