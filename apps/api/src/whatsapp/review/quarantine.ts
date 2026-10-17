/** Quarantine audit: unreviewed WhatsApp content must not appear in any trusted collection. */
import type { Db } from "mongodb";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { whatsAppClaimId } from "./materializer.js";
import { isDeepStrictEqual } from "node:util";
import { createWhatsAppNativeAuthority } from "../../native-evidence/whatsapp-authority.js";
import { parseNativeSourceLocator } from "../../native-evidence/resolver.js";
import { messageBranch } from "../../native-evidence/message-revision.js";

export interface QuarantineViolation { collection: string; id: string; reason: string }
type Row = { _id: string; waReview?: { candidateId?: string } };
const scoped = (tenantId: string, filter: object): never => withTenant<{ tenantId: string }>(tenantId, filter as never) as never;

export async function whatsAppScope(db: Db, tenantId: string): Promise<{ sourceIds: string[]; sessionIds: string[] }> {
  assertValidTenantId(tenantId, "whatsapp.quarantine");
  const sources = await db.collection<{ _id: string; tenantId: string; kind: string }>("sources")
    .find(scoped(tenantId, { kind: "whatsapp-batch" })).toArray();
  const sourceIds = sources.filter(s => s.tenantId === tenantId).map(s => s._id);
  if (!sourceIds.length) return { sourceIds, sessionIds: [] };
  const sessions = await db.collection<{ _id: string; tenantId: string }>("sessions")
    .find(scoped(tenantId, { sourceId: { $in: sourceIds } })).toArray();
  return { sourceIds, sessionIds: sessions.filter(s => s.tenantId === tenantId).map(s => s._id) };
}

/** Every trusted collection row derived from a WhatsApp session that is not an approved candidate's own claim. */
async function auditSnapshot(db: Db, tenantId: string, authority: ReturnType<typeof createWhatsAppNativeAuthority>): Promise<QuarantineViolation[]> {
  const { sourceIds, sessionIds } = await whatsAppScope(db, tenantId);
  if (!sessionIds.length) return [];
  const approved = await db.collection<{ _id: string; status: string }>("whatsapp_candidates").find(scoped(tenantId, { status: "approved" })).toArray();
  const allowed = new Map(approved.map(c => [whatsAppClaimId(c._id), c._id]));
  const out: QuarantineViolation[] = [];
  // An approved claim is only trusted while its exact quote still equals the live source turn (ISS-WA-REVIEW-WIRE-002).
  const approvedClaims = await db.collection<Row & { source?: string; evidence?: { turnId: string; sessionId: string; quote?: string }[] }>("claims")
    .find(scoped(tenantId, { "waReview.candidateId": { $in: [...allowed.values()] } })).toArray();
  for (const c of approvedClaims) {
    if (c.source !== "whatsapp") out.push({ collection: "claims", id: c._id, reason: "approved WhatsApp claim lacks source=whatsapp provenance" });
    for (const e of c.evidence ?? []) {
      const turn = await db.collection<{ text: string }>("turns").findOne(scoped(tenantId, { _id: e.turnId, sessionId: e.sessionId }));
      if (!turn || turn.text !== e.quote) out.push({ collection: "claims", id: c._id, reason: "approved claim evidence no longer matches its source turn" });
    }
  }
  const claims = await db.collection<Row>("claims").find(scoped(tenantId, { "evidence.sessionId": { $in: sessionIds } })).toArray();
  for (const c of claims) if (allowed.get(c._id) !== c.waReview?.candidateId || !c.waReview?.candidateId) out.push({ collection: "claims", id: c._id, reason: "unapproved WhatsApp claim" });
  const chunks = await db.collection<Row>("chunks").find(scoped(tenantId, { sourceRef: { $in: [...sessionIds, ...sourceIds] } })).toArray();
  for (const c of chunks) out.push({ collection: "chunks", id: c._id, reason: "WhatsApp chunk in trusted vector index" });
  const pages = await db.collection<Row>("session_pages").find(scoped(tenantId, { sessionId: { $in: sessionIds } })).toArray();
  for (const p of pages) out.push({ collection: "session_pages", id: p._id, reason: "WhatsApp session summary page" });
  const trees = await db.collection<Row>("tree_index").find(scoped(tenantId, {})).toArray();
  for (const t of trees) {
    const prune = async (value: unknown): Promise<unknown> => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const node = value as Record<string, unknown>;
      if ((node.nativePublication as { kind?: unknown } | undefined)?.kind === "message") {
        const children = Array.isArray(node.children) ? node.children : [];
        const locator = parseNativeSourceLocator((children[0] as { evidence?: { sourceLocator?: unknown } } | undefined)?.evidence?.sourceLocator);
        const unit = locator?.kind === "message" ? await authority.loadCurrent(tenantId, locator) : null;
        if (unit && isDeepStrictEqual(node, messageBranch(tenantId, unit.candidateId, {
          sourceId: unit.sourceId, revisionHash: unit.revisionHash, threadId: unit.threadId, messageId: unit.messageId,
        }, unit.text))) return null;
        out.push({ collection: "tree_index", id: String(t._id), reason: "unapproved, stale or malformed native WhatsApp branch" });
      }
      const children: unknown[] = [];
      if (Array.isArray(node.children)) for (const child of node.children) { const safe = await prune(child); if (safe !== null) children.push(safe); }
      return { ...node, ...(Array.isArray(node.children) ? { children } : {}) };
    };
    const text = JSON.stringify(await prune(t));
    if (sessionIds.some(id => text.includes(id))) out.push({ collection: "tree_index", id: String(t._id), reason: "tree references a WhatsApp session" });
  }
  return out;
}

/** One snapshot covers raw audit reads and every canonical native authority check. */
export async function auditWhatsAppQuarantine(db: Db, tenantId: string): Promise<QuarantineViolation[]> {
  assertValidTenantId(tenantId, "whatsapp.quarantine");
  const session = db.client.startSession();
  try {
    const out = await session.withTransaction(async () => {
      if (typeof session.inTransaction !== "function" || !session.inTransaction()) throw new Error("WhatsApp quarantine: snapshot unavailable");
      const reads = new Proxy(db, { get(target, key) {
        if (key !== "collection") throw new Error("WhatsApp quarantine: read capability only");
        return (name: string) => { const coll = target.collection(name); return {
          findOne: (filter: object, options: object = {}) => coll.findOne(filter, { ...options, session }),
          find: (filter: object, options: object = {}) => coll.find(filter, { ...options, session }),
        }; };
      } });
      return { value: await auditSnapshot(reads, tenantId, createWhatsAppNativeAuthority(db, { session })) };
    }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    if (!out) throw new Error("WhatsApp quarantine: snapshot unavailable");
    return out.value;
  } finally { await session.endSession(); }
}
