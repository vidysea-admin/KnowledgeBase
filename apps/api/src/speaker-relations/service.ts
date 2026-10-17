import { createHash } from "node:crypto";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import type { SpeakerKnowledgeRelation } from "../../../../packages/index/src/graph/speaker-knowledge.js";
import type { RelationshipAuthority, RelationshipContext, RelationshipProposal, RelationshipReview, RelationshipRow, RelationshipReceipt, SpeakerRelationshipService, SpeakerRelationshipStore } from "./types.js";

export class SpeakerRelationshipError extends Error {
  constructor(public readonly code: "forbidden" | "invalid" | "conflict" | "unavailable" | "not_found") { super(`speaker_relationship_${code}`); }
}
const fail = (code: SpeakerRelationshipError["code"]): never => { throw new SpeakerRelationshipError(code); };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const id = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(s);
const sha = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const own = (object: object, name: string): unknown => Object.prototype.hasOwnProperty.call(object, name) ? (object as Record<string, unknown>)[name] : undefined;
const evidenceKey = (e: { sessionId: string; turnId: string }) => JSON.stringify([e.sessionId, e.turnId]);
const receipt = (r: RelationshipRow, replayed: boolean): RelationshipReceipt => ({ id: r._id, revision: r.revision, status: r.status, replayed });
const proposalKey = (r: RelationshipRow) => JSON.stringify([r._id, r.tenantId, r.type, r.from, r.to, r.evidence, r.createdBy, r.sourceRevisionDigest]);
function context(c: RelationshipContext): void {
  assertValidTenantId(c.tenantId, "speaker relationship");
  if (!id(c.actorId) || !c.canPropose && !c.canReview) fail("forbidden");
}
function validateProposal(p: RelationshipProposal): void {
  if (!id(p.id) || !id(p.personId) || !p.personId.startsWith("person:") || !id(p.fromClaimId) || !id(p.toClaimId) || p.fromClaimId === p.toClaimId ||
      !["agrees_with", "contradicts", "supersedes"].includes(p.type) || !sha(p.sourceRevisionDigest) || !Array.isArray(p.evidence) || !p.evidence.length || p.evidence.length > 20) fail("invalid");
  for (const e of p.evidence) if (!id(e.sessionId) || !id(e.turnId) || typeof e.quote !== "string" || !e.quote.trim() || e.quote.length > 12000 || !sha(e.transcriptHash)) fail("invalid");
  if (new Set(p.evidence.map(evidenceKey)).size !== p.evidence.length) fail("invalid");
}
/** Both endpoints and every quotation must survive the exact current attributed source view.
 * Identity is consumed, never written or upgraded by this workflow. */
function current(r: RelationshipRow, authority: RelationshipAuthority | null): boolean {
  if (!authority || authority.view.tenantId !== r.tenantId || authority.view.personId !== r.from.personId || r.from.personId !== r.to.personId ||
      authority.view.identityStatus !== "human-confirmed" || authority.view.revision !== r.sourceRevisionDigest) return false;
  const from = authority.view.statements.filter(c => c.id === r.from.claimId);
  const to = authority.view.statements.filter(c => c.id === r.to.claimId);
  if (from.length !== 1 || to.length !== 1) return false;
  // Each endpoint needs its own surviving evidence, even if a proposal cites only a shared turn.
  for (const claim of [from[0]!, to[0]!]) if (!claim.evidence.length || claim.evidence.some(e => typeof own(authority.transcriptHashes, e.sessionId) !== "string")) return false;
  const allowed = [...from[0]!.evidence, ...to[0]!.evidence];
  return r.evidence.length > 0 && r.evidence.every(e => sha(e.transcriptHash) && own(authority.transcriptHashes, e.sessionId) === e.transcriptHash &&
    allowed.some(c => evidenceKey(c) === evidenceKey(e) && typeof e.quote === "string" && e.quote.trim().length > 0 && c.quote.includes(e.quote)));
}

export function createSpeakerRelationshipService(store: SpeakerRelationshipStore, now: () => string = () => new Date().toISOString()): SpeakerRelationshipService {
  const list: SpeakerRelationshipService["list"] = async (c, personId, status) => {
    context(c);
    if (!id(personId) || !personId.startsWith("person:") || !["suggested", "accepted", "rejected", "revoked"].includes(status)) fail("invalid");
    return store.transaction(c.tenantId, async tx => {
      const authority = await tx.authority(personId);
      const rows = await tx.list(personId, status);
      if (rows.length > 100) fail("unavailable");
      return rows.filter(r => r.tenantId === c.tenantId && r.status === status && r.from.personId === personId && current(r, authority));
    });
  };
  return {
    async propose(c, p) {
      context(c); if (!c.canPropose) fail("forbidden"); validateProposal(p);
      // Explicit field construction prevents request extras from entering canonical persistence.
      const candidate: RelationshipRow = { _id: `rel:${hash(JSON.stringify([c.tenantId, p.id]))}`, tenantId: c.tenantId, revision: 1, status: "suggested", type: p.type,
        from: { claimId: p.fromClaimId, personId: p.personId }, to: { claimId: p.toClaimId, personId: p.personId },
        evidence: p.evidence.map(e => ({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote, transcriptHash: e.transcriptHash })) as RelationshipRow["evidence"],
        createdBy: c.actorId, sourceRevisionDigest: p.sourceRevisionDigest, reviewHistory: [] };
      return store.transaction(c.tenantId, async tx => {
        if (!current(candidate, await tx.authority(p.personId))) fail("unavailable");
        const existing = await tx.get(candidate._id);
        if (existing) {
          if (existing.tenantId !== c.tenantId || proposalKey(existing) !== proposalKey(candidate)) fail("conflict");
          return receipt(existing, true);
        }
        await tx.insert(candidate); return receipt(candidate, false);
      });
    },
    async review(c, request: RelationshipReview) {
      context(c); if (!c.canReview || c.reviewerKind !== "human") fail("forbidden");
      if (!id(request.id) || !id(request.requestId) || !Number.isSafeInteger(request.baseRevision) || request.baseRevision < 1 || !["accept", "reject", "revoke"].includes(request.decision)) fail("invalid");
      const requestHash = hash(JSON.stringify([c.tenantId, c.actorId, request.id, request.baseRevision, request.decision]));
      return store.transaction(c.tenantId, async tx => {
        const row = await tx.get(request.id);
        if (!row || row.tenantId !== c.tenantId) return fail("not_found");
        const replay = row.reviewHistory?.find(h => h.requestId === request.requestId);
        if (replay) {
          if (replay.requestHash !== requestHash || replay.actorId !== c.actorId) fail("conflict");
          const status = { accept: "accepted", reject: "rejected", revoke: "revoked" }[replay.decision] as RelationshipRow["status"];
          return { id: row._id, revision: replay.resultRevision, status, replayed: true };
        }
        if (row.revision !== request.baseRevision || (row.reviewHistory?.length ?? 0) >= 2) fail("conflict");
        const allowed = request.decision === "revoke" ? row.status === "accepted" : row.status === "suggested";
        if (!allowed) fail("conflict");
        if (!current(row, await tx.authority(row.from.personId))) fail("unavailable");
        const status = { accept: "accepted", reject: "rejected", revoke: "revoked" }[request.decision] as "accepted" | "rejected" | "revoked";
        const at = now(); if (!Number.isFinite(Date.parse(at))) fail("unavailable");
        const next: RelationshipRow = { ...row, revision: row.revision + 1, status, review: { actorId: c.actorId, decision: status, at, baseRevision: row.revision },
          reviewHistory: [...(row.reviewHistory ?? []), { requestId: request.requestId, requestHash, actorId: c.actorId, decision: request.decision, at, baseRevision: row.revision, resultRevision: row.revision + 1 }] as RelationshipRow["reviewHistory"] };
        if (!await tx.replaceCAS(row._id, row.revision, next)) fail("conflict");
        return receipt(next, false);
      });
    },
    list,
    async accepted(c, personId): Promise<SpeakerKnowledgeRelation[]> {
      const rows = await list(c, personId, "accepted");
      return rows.filter(r => r.review?.decision === "accepted" && r.reviewHistory?.some(h => h.decision === "accept" && h.resultRevision === r.revision && h.actorId === r.review?.actorId))
        .map(r => ({ id: r._id, tenantId: r.tenantId, status: "accepted", fromClaimId: r.from.claimId, toClaimId: r.to.claimId, type: r.type, evidence: r.evidence }));
    },
  };
}
