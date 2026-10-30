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

const REVISION_PATH = "sourceMeta.authorizationRevision";
const MAX_WITHDRAWAL_ATTEMPTS = 8;
// The generated Sources type indexes sourceMeta as unknown, which Mongo's numeric-$inc typing rejects.
const INCREMENT_REVISION = { [REVISION_PATH]: 1 } as unknown as { _id?: never };
/** Absent revision means 0. Anything else that is not a non-negative safe integer fails closed. */
function revisionOf(source: Sources): number {
  const revision = (source.sourceMeta as Record<string, unknown> | undefined)?.authorizationRevision;
  if (revision === undefined || revision === null) return 0;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("WhatsApp review: source authorization revision invalid");
  }
  return revision;
}
/** A revision-0 source may legitimately lack the field; every other revision matches exactly. */
const revisionFilter = (revision: number) => (revision === 0 ? { $in: [null, 0] } : revision);

/** Compare-and-swap on the source authorization revision (ISS-WAVECTORLESS-002). Succeeds only if
 * the source still carries the revision this approval validated and consent is still given, and
 * increments it. A withdrawal committed after the evidence read changed the revision, so this
 * matches nothing and approval aborts; the shared write also makes Mongo serialize concurrent
 * transactions on the same source row. The UUID keeps the legacy fence field changing. */
async function fenceApproval(db: Db, tenantId: string, row: WhatsAppReviewCandidate, revision: number, session: ClientSession): Promise<void> {
  const result = await db.collection<Sources>("sources").updateOne(withTenant<Sources>(tenantId, {
    _id: row.sourceId, kind: "whatsapp-batch", path: row.groupJid, "consent.given": true, [REVISION_PATH]: revisionFilter(revision),
  }), { $set: { "sourceMeta.whatsappReviewFence": randomUUID() }, $inc: INCREMENT_REVISION }, { session });
  if (result.acknowledged !== true || result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new Error("WhatsApp review: source authorization fence unavailable");
  }
}

/** The one writer protocol for withdrawing a WhatsApp source's consent. Conditional on the revision it
 * read; increments the revision; on a lost CAS it re-reads and retries (a withdrawal is monotonic, so it
 * is never dropped). Exhausted retries throw rather than report success. Idempotent once withdrawn. */
export async function withdrawWhatsAppSourceConsent(db: Db, tenantId: string, sourceId: string, recordedBy: string, note?: string): Promise<void> {
  assertValidTenantId(tenantId, "whatsapp.review.withdraw");
  if (typeof recordedBy !== "string" || !recordedBy.trim()) throw new Error("WhatsApp review: withdrawal actor required");
  const coll = db.collection<Sources>("sources");
  for (let attempt = 0; attempt < MAX_WITHDRAWAL_ATTEMPTS; attempt++) {
    const source = await coll.findOne(withTenant<Sources>(tenantId, { _id: sourceId, kind: "whatsapp-batch" }));
    if (!source || source.tenantId !== tenantId) throw new Error("WhatsApp review: source not found for withdrawal");
    if (source.consent?.given === false) return;
    const result = await coll.updateOne(withTenant<Sources>(tenantId, { _id: sourceId, kind: "whatsapp-batch", [REVISION_PATH]: revisionFilter(revisionOf(source)) }), {
      $set: { consent: { given: false, recordedBy, ...(note ? { note } : {}) } }, $inc: INCREMENT_REVISION,
    });
    if (result.acknowledged !== true) throw new Error("WhatsApp review: withdrawal not acknowledged");
    if (result.matchedCount === 1) return;
  }
  throw new Error("WhatsApp review: withdrawal lost the revision race repeatedly; retry");
}

/** Validates current evidence and returns the source authorization revision it was validated against. */
export async function checkEvidence(db: Db, tenantId: string, row: WhatsAppReviewCandidate, session?: ClientSession): Promise<number> {
  assertWhatsAppReviewCandidateSchema(row);
  if (row.tenantId !== tenantId || !isWhatsAppReviewId(row._id)
      || row._id !== whatsAppReviewCandidateId(row) || row.contentHash !== whatsAppReviewContentHash(row.text)
      || !row.evidence.length) throw new Error("WhatsApp review: invalid candidate identity or evidence");
  const source = await db.collection<Sources>("sources").findOne(withTenant<Sources>(tenantId, { _id: row.sourceId }), { session });
  const sourceSession = await db.collection<Sessions>("sessions").findOne(withTenant<Sessions>(tenantId, { _id: row.sessionId }), { session });
  // An old pending/approved row is not authority to override withdrawn source consent.
  // This is checked in the same Mongo transaction as approval and publication; trusted
  // readers independently recheck current consent after the transaction commits.
  if (!source || source.tenantId !== tenantId || source.kind !== "whatsapp-batch" || source.path !== row.groupJid || source.consent?.given !== true
      || !sourceSession || sourceSession.tenantId !== tenantId || sourceSession.sourceId !== row.sourceId) {
    throw new Error("WhatsApp review: source/session evidence unavailable");
  }
  const revision = revisionOf(source);
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
  return revision;
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
            const seen = await checkEvidence(db, tenantId, row, session);
            if (action === "approved") await fenceApproval(db, tenantId, row, seen, session);
            return { result: "ok", changed: false, candidate: row };
          }
          if (row.status !== "needs-review") return { result: "conflict" };
          if (action === "approved" && row.flags.some(flag => flag.kind === "personal-excluded")) return { result: "excluded" };
          if (action === "approved" && !options.materialize) return { result: "publish_unavailable" };
          const seen = await checkEvidence(db, tenantId, row, session);
          if (action === "approved") await fenceApproval(db, tenantId, row, seen, session);
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

/** W8 (R-7): the whatsapp-batch sources a link owns - stamped `sourceMeta.whatsappLinkId` (W7), plus unstamped legacy rows whose consent was recorded by the link's
 * archiver owner (`whatsapp-owner:<id>`). A source stamped with ANOTHER link is never returned. Tenant-scoped; read only. Lives here, not in quarantine.ts, so store.ts
 * does not import quarantine.ts (that import closes a cycle through the materializer). */
export async function whatsAppLinkSourceIds(db: Db, tenantId: string, linkId: string, archiverOwnerId?: string): Promise<string[]> {
  assertValidTenantId(tenantId, "whatsapp.review.link-sources");
  type Src = { _id: string; tenantId: string; sourceMeta?: { whatsappLinkId?: string } };
  const coll = db.collection<Src>("sources");
  const found = await coll.find(withTenant<Src>(tenantId, { kind: "whatsapp-batch", "sourceMeta.whatsappLinkId": linkId } as never)).toArray();
  if (archiverOwnerId) found.push(...(await coll.find(withTenant<Src>(tenantId, { kind: "whatsapp-batch", "consent.recordedBy": `whatsapp-owner:${archiverOwnerId}` } as never)).toArray())
    .filter(s => s.sourceMeta?.whatsappLinkId === undefined));
  return [...new Set(found.filter(s => s.tenantId === tenantId).map(s => s._id))];
}

/** W8 (R-7/R-8): the link-scoped data steps of an unlink or revoke. Quarantine = every still-`needs-review` candidate of the link's sources becomes `rejected` by
 * `system:wa-unlink` (compare-and-set on the status, so it loses cleanly to a racing approval, and the approval's own check then fails closed); the schema has no
 * separate quarantined status. Consent is withdrawn per source through `withdrawWhatsAppSourceConsent` exactly as it is. Both steps are idempotent. */
export function createLinkDataPort(db: Db, options: { now?: () => string } = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async quarantineCandidates(tenantId: string, linkId: string, archiverOwnerId: string | undefined): Promise<number> {
      const sourceIds = await whatsAppLinkSourceIds(db, tenantId, linkId, archiverOwnerId);
      if (!sourceIds.length) return 0;
      const coll = scopedCollection<WhatsAppReviewCandidate>(db, "whatsapp_candidates")(tenantId);
      const pending = await coll.find({ status: "needs-review", sourceId: { $in: sourceIds } } as never).toArray();
      let moved = 0;
      for (const row of pending) {
        if (row.tenantId !== tenantId || !sourceIds.includes(row.sourceId)) continue;
        const r = await coll.updateOne({ _id: row._id, status: "needs-review" } as never, { $set: { status: "rejected", decision: { action: "rejected", actor: "system:wa-unlink", at: now() } } } as never);
        moved += r.modifiedCount;
      }
      return moved;
    },
    async withdrawSources(tenantId: string, linkId: string, archiverOwnerId: string | undefined, recordedBy: string): Promise<number> {
      const sourceIds = await whatsAppLinkSourceIds(db, tenantId, linkId, archiverOwnerId);
      for (const id of sourceIds) await withdrawWhatsAppSourceConsent(db, tenantId, id, recordedBy, "link_unlinked");
      return sourceIds.length;
    },
  };
}
