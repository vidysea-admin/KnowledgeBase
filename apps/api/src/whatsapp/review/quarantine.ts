/** Quarantine audit: unreviewed WhatsApp content must not appear in any trusted collection. */
import type { Db } from "mongodb";
import { assertValidTenantId, withTenant } from "@lkb/db";
import { whatsAppClaimId } from "./materializer.js";

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
export async function auditWhatsAppQuarantine(db: Db, tenantId: string): Promise<QuarantineViolation[]> {
  const { sourceIds, sessionIds } = await whatsAppScope(db, tenantId);
  if (!sessionIds.length) return [];
  const approved = await db.collection<{ _id: string; status: string }>("whatsapp_candidates").find(scoped(tenantId, { status: "approved" })).toArray();
  const allowed = new Map(approved.map(c => [whatsAppClaimId(c._id), c._id]));
  const out: QuarantineViolation[] = [];
  const claims = await db.collection<Row>("claims").find(scoped(tenantId, { "evidence.sessionId": { $in: sessionIds } })).toArray();
  for (const c of claims) if (allowed.get(c._id) !== c.waReview?.candidateId || !c.waReview?.candidateId) out.push({ collection: "claims", id: c._id, reason: "unapproved WhatsApp claim" });
  const chunks = await db.collection<Row>("chunks").find(scoped(tenantId, { sourceRef: { $in: [...sessionIds, ...sourceIds] } })).toArray();
  for (const c of chunks) out.push({ collection: "chunks", id: c._id, reason: "WhatsApp chunk in trusted vector index" });
  const pages = await db.collection<Row>("session_pages").find(scoped(tenantId, { sessionId: { $in: sessionIds } })).toArray();
  for (const p of pages) out.push({ collection: "session_pages", id: p._id, reason: "WhatsApp session summary page" });
  const trees = await db.collection<Row>("tree_index").find(scoped(tenantId, {})).toArray();
  for (const t of trees) {
    const text = JSON.stringify(t);
    if (sessionIds.some(id => text.includes(id))) out.push({ collection: "tree_index", id: String(t._id), reason: "tree references a WhatsApp session" });
  }
  return out;
}
