import { createHash } from "node:crypto";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { AcceptedAttributes, AttributeAuthority, AttributeContext, AttributeProposal, AttributeReceipt, AttributeRow, AttributeTransaction, SpeakerAttributeService, SpeakerAttributeStore } from "./types.js";

export class SpeakerAttributeError extends Error {
  constructor(public readonly code: "forbidden" | "invalid" | "conflict" | "unavailable" | "not_found") { super(`speaker_attribute_${code}`); }
}
const fail = (c: SpeakerAttributeError["code"]): never => { throw new SpeakerAttributeError(c); };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const id = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(s);
const sha = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const person = (s: unknown): s is string => id(s) && s.startsWith("person:");
const statuses = ["suggested", "accepted", "rejected", "revoked"];
const key = (r: AttributeRow) => JSON.stringify([r._id, r.tenantId, r.personId, r.field, r.value, r.evidence, r.createdBy, r.sourceRevisionDigest]);
const receipt = (r: AttributeRow, replayed: boolean): AttributeReceipt => ({ id: r._id, revision: r.revision, status: r.status, replayed });
const requestHash = (tenant: string, actor: string, row: string, base: number, decision: string) => hash(JSON.stringify([tenant, actor, row, base, decision]));
function context(c: AttributeContext): void {
  assertValidTenantId(c.tenantId, "speaker attribute");
  if (!id(c.actorId) || typeof c.canPropose !== "boolean" || typeof c.canReview !== "boolean" || !["human", "automation"].includes(c.reviewerKind)) fail("forbidden");
}
function validate(p: AttributeProposal): void {
  if (!id(p.id) || !person(p.personId) || !["org", "role"].includes(p.field) || typeof p.value !== "string" || !p.value.trim() || p.value !== p.value.trim() || p.value.length > 300 ||
    !sha(p.sourceRevisionDigest) || !Array.isArray(p.evidence) || p.evidence.length < 1 || p.evidence.length > 20) fail("invalid");
  for (const e of p.evidence) if (!e || !id(e.sessionId) || !id(e.turnId) || !id(e.speakerRef) || typeof e.quote !== "string" || !e.quote.trim() || e.quote.length > 12000 ||
    !e.quote.includes(p.value) || !sha(e.transcriptHash) || !Number.isSafeInteger(e.startTurnIndex) || !Number.isSafeInteger(e.endTurnIndex) || e.startTurnIndex < 0 || e.endTurnIndex < e.startTurnIndex) fail("invalid");
  if (new Set(p.evidence.map(e => JSON.stringify([e.sessionId, e.turnId]))).size !== p.evidence.length) fail("invalid");
}
function current(r: AttributeRow, a: AttributeAuthority | null): boolean {
  if (!a || a.view.tenantId !== r.tenantId || a.view.personId !== r.personId || a.view.identityStatus !== "human-confirmed" || a.view.ambiguity ||
    a.view.revision !== r.sourceRevisionDigest || !Array.isArray(a.attributedTurns)) return false;
  try { validate({ id: r._id, personId: r.personId, field: r.field, value: r.value, evidence: r.evidence, sourceRevisionDigest: r.sourceRevisionDigest }); } catch { return false; }
  return r.evidence.every(e => Object.prototype.hasOwnProperty.call(a.transcriptHashes, e.sessionId) && a.transcriptHashes[e.sessionId] === e.transcriptHash &&
    a.attributedTurns.filter(t => t.sessionId === e.sessionId && t.turnId === e.turnId && t.speakerRef === e.speakerRef &&
      t.startTurnIndex === e.startTurnIndex && t.endTurnIndex === e.endTurnIndex && t.text.includes(e.quote)).length === 1);
}
function acceptedReceipt(r: AttributeRow): boolean {
  const h = r.reviewHistory; const summary = r.review;
  if (!summary || summary.decision !== "accepted" || !Array.isArray(h) || h.length !== 1 || r.revision !== 2 || summary.baseRevision !== 1 || !id(summary.actorId) || !Number.isFinite(Date.parse(summary.at))) return false;
  const first = h[0]!;
  return first.decision === "accept" && first.actorId === summary.actorId && first.at === summary.at && first.baseRevision === 1 && first.resultRevision === 2 && id(first.requestId) &&
    first.requestHash === requestHash(r.tenantId, first.actorId, r._id, first.baseRevision, first.decision);
}
/** Reuse only inside the caller's existing snapshot; never opens a nested transaction. */
export async function acceptedSpeakerAttributes(tx: AttributeTransaction, tenantId: string, personId: string): Promise<AcceptedAttributes> {
  assertValidTenantId(tenantId, "speaker attributes reader"); if (!person(personId)) fail("invalid");
  const authority = await tx.authority(personId); const rows = await tx.list(personId, "accepted");
  if (rows.length > 100) fail("unavailable");
  const valid = rows.filter(r => r.tenantId === tenantId && r.personId === personId && r.status === "accepted" && current(r, authority) && acceptedReceipt(r));
  const fields: AcceptedAttributes["fields"] = {}; const withheldFields: AcceptedAttributes["withheldFields"] = [];
  for (const field of ["org", "role"] as const) {
    const selected = valid.filter(r => r.field === field).sort((a, b) => a._id.localeCompare(b._id));
    const values = new Set(selected.map(r => r.value));
    if (values.size > 1) { withheldFields.push(field); continue; }
    if (selected[0]) fields[field] = { value: selected[0].value, evidence: selected.flatMap(r => r.evidence) as AttributeRow["evidence"] };
  }
  return { fields, withheldFields, revision: hash(JSON.stringify([authority?.view.revision ?? null, valid.sort((a, b) => a._id.localeCompare(b._id)).map(r => [r._id, r.revision, r.field, r.value, r.evidence]), withheldFields])) };
}
export function createSpeakerAttributeService(store: SpeakerAttributeStore, now: () => string = () => new Date().toISOString()): SpeakerAttributeService {
  return {
    async propose(c, p) {
      context(c); if (!c.canPropose) fail("forbidden"); validate(p);
      const row: AttributeRow = { _id: `attr:${hash(JSON.stringify([c.tenantId, p.id]))}`, tenantId: c.tenantId, personId: p.personId, field: p.field, value: p.value,
        revision: 1, status: "suggested", evidence: p.evidence.map(e => ({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote, transcriptHash: e.transcriptHash,
          speakerRef: e.speakerRef, startTurnIndex: e.startTurnIndex, endTurnIndex: e.endTurnIndex })) as AttributeRow["evidence"], createdBy: c.actorId, sourceRevisionDigest: p.sourceRevisionDigest, reviewHistory: [] };
      return store.transaction(c.tenantId, async tx => {
        const existing = await tx.get(row._id);
        if (existing) { if (existing.tenantId !== c.tenantId || key(existing) !== key(row)) fail("conflict"); return receipt(existing, true); }
        if (!current(row, await tx.authority(p.personId))) fail("unavailable");
        await tx.insert(row); return receipt(row, false);
      });
    },
    async review(c, input) {
      context(c); if (!c.canReview || c.reviewerKind !== "human") fail("forbidden");
      if (!id(input.id) || !id(input.requestId) || !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1 || !["accept", "reject", "revoke"].includes(input.decision)) fail("invalid");
      const digest = requestHash(c.tenantId, c.actorId, input.id, input.baseRevision, input.decision);
      return store.transaction(c.tenantId, async tx => {
        const row = await tx.get(input.id); if (!row || row.tenantId !== c.tenantId) return fail("not_found");
        const replay = row.reviewHistory?.find(h => h.requestId === input.requestId);
        if (replay) { if (replay.requestHash !== digest || replay.actorId !== c.actorId) fail("conflict");
          return { id: row._id, revision: replay.resultRevision, status: ({ accept: "accepted", reject: "rejected", revoke: "revoked" } as const)[replay.decision], replayed: true }; }
        if (row.revision !== input.baseRevision || (row.reviewHistory?.length ?? 0) >= 2 || (input.decision === "revoke" ? row.status !== "accepted" : row.status !== "suggested")) fail("conflict");
        // Withdrawal/deletion must never prevent a human from rejecting or revoking a row.
        if (input.decision === "accept" && !current(row, await tx.authority(row.personId))) fail("unavailable");
        const status = ({ accept: "accepted", reject: "rejected", revoke: "revoked" } as const)[input.decision]; const at = now();
        if (!Number.isFinite(Date.parse(at))) fail("unavailable");
        const next: AttributeRow = { ...row, revision: row.revision + 1, status, review: { actorId: c.actorId, decision: status, at, baseRevision: row.revision },
          reviewHistory: [...(row.reviewHistory ?? []), { requestId: input.requestId, requestHash: digest, actorId: c.actorId, decision: input.decision, at, baseRevision: row.revision, resultRevision: row.revision + 1 }] as AttributeRow["reviewHistory"] };
        if (!await tx.replaceCAS(row._id, row.revision, next)) fail("conflict"); return receipt(next, false);
      });
    },
    async list(c, personId, status) {
      context(c); if (!person(personId) || !statuses.includes(status)) fail("invalid");
      return store.transaction(c.tenantId, async tx => { const authority = await tx.authority(personId); const rows = await tx.list(personId, status);
        if (rows.length > 100) fail("unavailable"); return rows.filter(r => r.tenantId === c.tenantId && r.personId === personId && r.status === status && current(r, authority)); });
    },
    async accepted(c, personId) { context(c); return store.transaction(c.tenantId, tx => acceptedSpeakerAttributes(tx, c.tenantId, personId)); },
  };
}
