/** D-180 ruling 1 (T-052): tenant-scoped registration-link approval records. Every query names its tenant
 * explicitly; the raw link is never stored, only its sha256. Records are never deleted, only revoked. */
import type { Db } from "mongodb";
import type { RegistrationLinkApprovals } from "../../../../packages/core/src/generated/registration_link_approvals.js";
import { assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";

export type RegistrationApprovalRow = RegistrationLinkApprovals;
export const REGISTRATION_APPROVAL_COLLECTION = "registration_link_approvals";
export const REGISTRATION_APPROVAL_MAX_TTL_MS = 30 * 86400000;
/** Resolver match: the exact link, resolution scope and current policy revision hash. */
export interface LinkApprovalMatch { kind: "link"; linkHash: string; scopeHash: string; policyHash: string }
/** Zoom proof match: the exact bound attempt, policy revision and confirmation host scope. */
export interface ProofApprovalMatch { kind: "proof"; bindingHash: string; policyHash: string; policyRevision: number; hostScopeHash: string }
export type ApprovalMatch = LinkApprovalMatch | ProofApprovalMatch;
export interface RegistrationApprovalStore {
  create(row: RegistrationApprovalRow): Promise<void>;
  get(tenantId: string, decisionId: string): Promise<RegistrationApprovalRow | null>;
  revoke(tenantId: string, decisionId: string, at: Date): Promise<boolean>;
  /** Only an unexpired, unrevoked record of the SAME tenant whose every hash matches. */
  findMatching(tenantId: string, match: ApprovalMatch, now: Date): Promise<RegistrationApprovalRow | null>;
}
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
type Filter = Record<string, unknown>;
interface ApprovalCollection {
  findOne(filter: Filter): Promise<unknown>;
  insertOne(row: RegistrationApprovalRow): Promise<unknown>;
  updateOne(filter: Filter, update: Filter): Promise<{ modifiedCount: number }>;
}

function hashes(match: ApprovalMatch): Filter | null {
  if (!match || typeof match !== "object") return null;
  if (match.kind === "link" && sha(match.linkHash) && sha(match.scopeHash) && sha(match.policyHash))
    return { linkHash: match.linkHash, scopeHash: match.scopeHash, policyHash: match.policyHash };
  if (match.kind === "proof" && sha(match.bindingHash) && sha(match.policyHash) && sha(match.hostScopeHash) &&
    Number.isSafeInteger(match.policyRevision) && match.policyRevision >= 1)
    return { bindingHash: match.bindingHash, policyHash: match.policyHash, policyRevision: match.policyRevision, hostScopeHash: match.hostScopeHash };
  return null;
}
const stamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

export function createRegistrationApprovalStore(db: Pick<Db, "collection">): RegistrationApprovalStore {
  // Lazy: composition never touches Mongo until an authenticated route or a caller uses the store.
  const rows = () => db.collection(REGISTRATION_APPROVAL_COLLECTION) as unknown as ApprovalCollection;
  return {
    async create(row) {
      assertValidTenantId(row?.tenantId, "registration approval create");
      if (row._id !== row.decisionId || !stamp(row.approvedAt) || !stamp(row.expiresAt) || (row.bindingHash === undefined) !== (row.hostScopeHash === undefined) ||
        (row.bindingHash === undefined) !== (row.policyRevision === undefined) || Date.parse(row.expiresAt) - Date.parse(row.approvedAt) > REGISTRATION_APPROVAL_MAX_TTL_MS ||
        !(Date.parse(row.expiresAt) > Date.parse(row.approvedAt))) throw new Error("Invalid registration approval");
      await rows().insertOne({ ...row, revokedAt: null });
    },
    async get(tenantId, decisionId) {
      assertValidTenantId(tenantId, "registration approval get");
      return await rows().findOne({ tenantId, _id: decisionId }) as RegistrationApprovalRow | null;
    },
    async revoke(tenantId, decisionId, at) {
      assertValidTenantId(tenantId, "registration approval revoke");
      return (await rows().updateOne({ tenantId, _id: decisionId, revokedAt: null }, { $set: { revokedAt: at.toISOString() } })).modifiedCount === 1;
    },
    async findMatching(tenantId, match, now) {
      assertValidTenantId(tenantId, "registration approval lookup");
      const exact = hashes(match);
      if (!exact || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
      // The query is the single authority here; consumers (meeting-bot approval authority) re-check independently.
      return await rows().findOne({ tenantId, ...exact, revokedAt: null, expiresAt: { $gt: now.toISOString() } }) as RegistrationApprovalRow | null;
    },
  };
}
