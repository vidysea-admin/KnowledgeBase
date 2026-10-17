/** D-180 ruling 1: the trusted `authorize` source for the read-only registration-link resolver and the Zoom proof.
 * A link/attempt is authorized only by a human-created `registration_link_approvals` record of the SAME tenant that is
 * unexpired, unrevoked and matches every hash. The lookup is the API store (apps/api registration-approvals/store.ts);
 * this module re-checks each returned record independently and never trusts request-supplied approval data. */
import { privateEvidenceHash, registrationResolutionScopeHash, type LinkResolutionInput, type ResolutionAuthorization } from "./registration-link-resolver.js";
import { zoomConfirmationHostScopeHash, type BoundZoomAttempt, type ProofAuthorization } from "./zoom-registration-proof.js";

export const APPROVAL_MAX_TTL_MS = 30 * 86400000;
export interface RegistrationApprovalRecord {
  tenantId: string; decisionId: string; linkHash: string; scopeHash: string; policyHash: string;
  bindingHash?: string; policyRevision?: number; hostScopeHash?: string;
  approvedBy: string; approvedAt: string; expiresAt: string; revokedAt?: string | null;
}
export type RegistrationApprovalMatch =
  | {kind: "link"; linkHash: string; scopeHash: string; policyHash: string}
  | {kind: "proof"; bindingHash: string; policyHash: string; policyRevision: number; hostScopeHash: string};
/** Structural port of the API store's findMatching (tenant predicate, expiry and revocation in the query). */
export interface RegistrationApprovalLookup {
  findMatching(tenantId: string, match: RegistrationApprovalMatch, now: Date): Promise<RegistrationApprovalRecord | null>;
}
const decision = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(v);
/** Same canonical form the approval route hashes; a non-canonical link is never approvable. */
export function canonicalApprovalLink(link: string): string | undefined {
  try { const url = new URL(link); return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.port ? url.href : undefined; }
  catch { return undefined; }
}
function current(record: RegistrationApprovalRecord | null, tenantId: string, now: number): record is RegistrationApprovalRecord {
  if (!record || record.tenantId !== tenantId || record.revokedAt || !decision(record.decisionId) || typeof record.approvedBy !== "string" || !record.approvedBy) return false;
  const approved = Date.parse(record.approvedAt), expires = Date.parse(record.expiresAt);
  return Number.isFinite(approved) && Number.isFinite(expires) && approved <= now && expires > now && expires - approved <= APPROVAL_MAX_TTL_MS;
}

/** Resolver `authorize`: the exact link, scope and policy must be approved for this tenant. */
export function approvalResolverAuthorize(lookup: RegistrationApprovalLookup, now: () => number = Date.now) {
  return async (input: LinkResolutionInput): Promise<ResolutionAuthorization | undefined> => {
    if (canonicalApprovalLink(input.link) !== input.link) return undefined;
    const at = now(), linkHash = privateEvidenceHash(input.link), scopeHash = registrationResolutionScopeHash(input);
    const record = await lookup.findMatching(input.tenantId, {kind: "link", linkHash, scopeHash, policyHash: input.policyHash}, new Date(at));
    if (!current(record, input.tenantId, at) || record.linkHash !== linkHash || record.scopeHash !== scopeHash || record.policyHash !== input.policyHash) return undefined;
    return {tenantId: record.tenantId, sourceId: input.sourceId, messageId: input.messageId, sourceHash: input.sourceHash,
      policyHash: record.policyHash, linkHash: record.linkHash, scopeHash: record.scopeHash, decisionId: record.decisionId};
  };
}

/** The proof is synchronous, so approvals for every candidate attempt are loaded first; the returned `authorize`
 * answers only from those trusted records and refuses anything it did not load. */
export async function prepareApprovalProofAuthorize(lookup: RegistrationApprovalLookup, tenantId: string, attempts: BoundZoomAttempt[],
  allowedZoomHosts: string[] = ["zoom.us"], now: () => number = Date.now): Promise<(attempt: BoundZoomAttempt) => ProofAuthorization | undefined> {
  const at = now(), hostScopeHash = zoomConfirmationHostScopeHash(allowedZoomHosts), approved = new Map<string, ProofAuthorization>();
  for (const attempt of attempts.slice(0, 20000)) {
    if (!attempt || attempt.tenantId !== tenantId || approved.has(attempt.bindingHash)) continue;
    const record = await lookup.findMatching(tenantId, {kind: "proof", bindingHash: attempt.bindingHash, policyHash: attempt.policyHash,
      policyRevision: attempt.policyRevision, hostScopeHash}, new Date(at));
    if (!current(record, tenantId, at) || record.bindingHash !== attempt.bindingHash || record.policyHash !== attempt.policyHash ||
      record.policyRevision !== attempt.policyRevision || record.hostScopeHash !== hostScopeHash) continue;
    approved.set(attempt.bindingHash, Object.freeze({tenantId: record.tenantId, sourceId: attempt.sourceId, bindingHash: attempt.bindingHash,
      policyHash: record.policyHash, policyRevision: attempt.policyRevision, hostScopeHash, decisionId: record.decisionId}));
  }
  return attempt => {
    const found = approved.get(attempt?.bindingHash);
    return found && found.tenantId === attempt.tenantId && found.sourceId === attempt.sourceId ? found : undefined;
  };
}
