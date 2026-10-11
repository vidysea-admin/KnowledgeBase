import { apiFetch, ApiError } from "./client.js";

export const CLAIM_STATUS_VALUES = ["verified", "needs-review", "conflicting"] as const;
export type ClaimStatus = (typeof CLAIM_STATUS_VALUES)[number];
export interface ClaimEvidenceRef { turnId: string; sessionId: string; sessionTitle: string | null }
export interface ClaimListRow { _id: string; text: string; status: ClaimStatus; confidence?: number; topicRefs?: string[]; evidence: ClaimEvidenceRef[] }
export interface ClaimsListPage { claims: ClaimListRow[]; limit: number; offset: number; truncated: boolean }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isEvidence = (v: unknown): v is ClaimEvidenceRef => isObject(v) && typeof v.turnId === "string" && typeof v.sessionId === "string" &&
  (v.sessionTitle === null || typeof v.sessionTitle === "string");
const isRow = (v: unknown): v is ClaimListRow => isObject(v) && typeof v._id === "string" && typeof v.text === "string" &&
  (CLAIM_STATUS_VALUES as readonly string[]).includes(v.status as string) &&
  (v.confidence === undefined || typeof v.confidence === "number") &&
  (v.topicRefs === undefined || (Array.isArray(v.topicRefs) && v.topicRefs.every((t) => typeof t === "string"))) &&
  Array.isArray(v.evidence) && v.evidence.length > 0 && v.evidence.every(isEvidence);

/** Read-only: one GET. `limit`/`offset` are validated here so a bad value never reaches the network. */
export async function listClaims(apiKey: string | null, opts: { status?: ClaimStatus; limit?: number; offset?: number } = {}): Promise<ClaimsListPage> {
  const limit = opts.limit ?? 25, offset = opts.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new ApiError(400, "Invalid claims paging.");
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts.status) params.set("status", opts.status);
  const r = await apiFetch<unknown>(`/claims?${params.toString()}`, apiKey);
  if (!isObject(r) || !Array.isArray(r.claims) || r.limit !== limit || r.offset !== offset || typeof r.truncated !== "boolean" ||
    r.claims.length > limit || !r.claims.every(isRow)) throw new ApiError(503, "Invalid claims response.");
  return r as unknown as ClaimsListPage;
}
