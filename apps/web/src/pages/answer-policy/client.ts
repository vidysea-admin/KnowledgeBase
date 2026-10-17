import { apiFetch, ApiError } from "../../api/client.js";
import type { AskResponse } from "../../api/types.js";

export type DraftPolicyMode = "internal-only" | "internal-and-web";
export interface PolicySimulationResponse {
  draft: { policyId: string; version: number; mode: DraftPolicyMode };
  simulation: { policyId: string; version: number; decision: "allow" | "review" | "refuse";
    reason: string; internalSources: number; webSources: number };
  result: AskResponse;
}
export function simulateDraftPolicy(apiKey: string | null, query: string,
  draft: { policyId: string; version: number; mode: DraftPolicyMode }): Promise<PolicySimulationResponse> {
  return apiFetch("/answer-policy/simulate", apiKey, { method: "POST", body: { query, draft } });
}

export interface SavedPolicy {
  tenantId: string; policyId: string; version: number; questionClass: string; mode: DraftPolicyMode;
  style: "concise" | "detailed"; onInsufficient: "review" | "refuse"; citations: "required";
  retired: boolean; note: string; changedAt: string; changedBy: { actor: string; claimedBy?: string };
}
export interface PolicyConflict { key: string; questionClass: string; dimension: string; severity: string; explanation: string }
export interface EvidenceBinding { id: string; origin: "internal" | "web"; fingerprint: string; source: Record<string, unknown>; excerpt: string }
export type AppliedPolicy = Pick<SavedPolicy, "policyId" | "version" | "questionClass" | "mode" | "style" | "onInsufficient" | "citations">;
export interface AppliedAnswer extends AskResponse {
  runId: string; state: string; policy: AppliedPolicy | null; candidateDigest: string; evidenceDigest: string;
  confidence: { basis: string; score: number | null; calibrated: false }; followUps: string[]; sourceEvidence: EvidenceBinding[];
}
export interface AskInput { query: string; questionClass: string; policyId?: string; policyVersion?: number;
  evidenceMode: boolean; filters: { sessionIds: string[]; sources: "all" | "internal"; speakerRefs?: string[]; topicRefs?: string[] }; resolutionId?: string }
export interface HistoryItem { id: string; query: string; questionClass: string; createdAt: string; reason: string;
  filters: AskInput["filters"]; evidenceMode: boolean; result: AppliedAnswer }
export interface AnswerReview { id: string; query: string; questionClass: string; createdAt: string; state: string; reason: string;
  candidate: AskResponse; policy: SavedPolicy | null; candidateDigest: string; evidenceDigest: string; evidence: EvidenceBinding[];
  review?: { decision: string; note: string; by: { actor: string }; at: string } }
export interface SourceConflict { id: string; runId: string; explanation: string; evidenceDigest: string; status: string;
  a: EvidenceBinding; b: EvidenceBinding; resolution?: { keepSourceId: string; excludeSourceId: string; note: string; by: { actor: string }; at: string } }
export const listPolicies = (key: string | null) => apiFetch<{ policies: SavedPolicy[] }>("/answer-policies", key);
export const listPolicyConflicts = (key: string | null) => apiFetch<{ conflicts: PolicyConflict[] }>("/answer-policies/conflicts", key);
export const policyHistory = (key: string | null, id: string) => apiFetch<{ history: SavedPolicy[] }>(`/answer-policies/${encodeURIComponent(id)}/history`, key);
export const loadPolicyYaml = (key: string | null, id: string) => apiFetch<{ yaml: string; revision: SavedPolicy }>(`/answer-policies/${encodeURIComponent(id)}/yaml`, key);
export const savePolicyYaml = (key: string | null, id: string, yaml: string) => apiFetch<{ revision: SavedPolicy }>(`/answer-policies/${encodeURIComponent(id)}/yaml`, key, { method: "PUT", body: { yaml } });
export const retirePolicy = (key: string | null, policy: SavedPolicy, note: string) => apiFetch(`/answer-policies/${encodeURIComponent(policy.policyId)}/retire`, key, { method: "POST", body: { expectedVersion: policy.version, note } });
export const simulateYamlPolicy = (key: string | null, policyId: string, yaml: string, query: string) => apiFetch<{ transient: true; draft: SavedPolicy; simulation: PolicySimulationResponse["simulation"]; result: AskResponse }>("/answer-policy/simulate-yaml", key, { method: "POST", body: { policyId, yaml, query } });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function readAppliedAnswer(value: unknown): AppliedAnswer {
  const invalid = (): never => { throw new ApiError(502, "Saved-answer response could not be read."); };
  if (!record(value) || typeof value.runId !== "string" || !value.runId || typeof value.answer !== "string"
    || !["allowed", "review", "refused", "approved", "rejected", "conflicted", "stale"].includes(value.state as string)
    || !["correct", "ambiguous", "incorrect"].includes(value.verdict as string)
    || typeof value.web_used !== "boolean" || typeof value.insufficient_coverage !== "boolean"
    || typeof value.candidateDigest !== "string" || typeof value.evidenceDigest !== "string"
    || !record(value.sources) || !Array.isArray(value.sources.internal) || !Array.isArray(value.sources.web)
    || value.sources.internal.some((s) => !record(s) || typeof s.node_id !== "string") || value.sources.web.some((s) => !record(s))
    || !record(value.confidence) || typeof value.confidence.basis !== "string" || value.confidence.calibrated !== false
    || (value.confidence.score !== null && (typeof value.confidence.score !== "number" || !Number.isFinite(value.confidence.score)))
    || !Array.isArray(value.auditLog) || value.auditLog.some((a) => !record(a) || typeof a.step !== "string")
    || !Array.isArray(value.sourceEvidence) || value.sourceEvidence.some((s) => !record(s) || typeof s.id !== "string" || typeof s.excerpt !== "string")
    || !Array.isArray(value.followUps) || value.followUps.some((q) => typeof q !== "string")) return invalid();
  if (value.policy !== null && (!record(value.policy) || typeof value.policy.policyId !== "string" || typeof value.policy.questionClass !== "string"
    || !Number.isSafeInteger(value.policy.version) || (value.policy.version as number) < 1)) return invalid();
  if (!["allowed", "approved"].includes(value.state as string) && value.answer.trim()) return invalid();
  return value as unknown as AppliedAnswer;
}
export async function askWithPolicy(key: string | null, input: AskInput): Promise<AppliedAnswer> {
  return readAppliedAnswer(await apiFetch<unknown>("/ask", key, { method: "POST", body: input }));
}
export async function answerHistory(key: string | null): Promise<{ history: HistoryItem[] }> {
  const value = await apiFetch<unknown>("/answer-history", key);
  if (!record(value) || !Array.isArray(value.history)) throw new ApiError(502, "Saved history could not be read.");
  const history = value.history.map((item) => {
    if (!record(item) || typeof item.id !== "string" || typeof item.query !== "string" || typeof item.createdAt !== "string"
      || typeof item.questionClass !== "string" || typeof item.evidenceMode !== "boolean" || !record(item.filters)
      || !Array.isArray(item.filters.sessionIds) || item.filters.sessionIds.some((id) => typeof id !== "string")
      || !["all", "internal"].includes(item.filters.sources as string)) throw new ApiError(502, "Saved history could not be read.");
    const result = readAppliedAnswer(item.result);
    if (result.runId !== item.id) throw new ApiError(502, "Saved history identity is inconsistent.");
    return { ...item, result } as unknown as HistoryItem;
  });
  return { history };
}
export const answerSuggestions = (key: string | null) => apiFetch<{ questions: string[] }>("/answer-history/suggestions", key);
/** Direct reads retain publication guards; missing legacy input metadata is never defaulted. */
export async function directAnswer(key: string | null, id: string): Promise<HistoryItem> {
  if (!key || !id || id.length > 200 || /[\x00-\x20\x7f]/.test(id)) throw new ApiError(400, "Invalid saved answer selection.");
  const value = await apiFetch<unknown>(`/answer-history/${encodeURIComponent(id)}`, key);
  if (record(value) && value.replayAvailable === false) throw new ApiError(409, "Original answer inputs are unavailable; this saved answer cannot be reopened or rebuilt.");
  if (!record(value) || value.id !== id || value.replayAvailable !== true || typeof value.query !== "string" || !value.query.trim() || value.query.length > 4000
    || typeof value.createdAt !== "string" || typeof value.reason !== "string" || typeof value.questionClass !== "string" || !value.questionClass.trim() || value.questionClass.length > 80
    || typeof value.evidenceMode !== "boolean" || !record(value.filters) || !Array.isArray(value.filters.sessionIds) || value.filters.sessionIds.length > 20
    || Object.keys(value.filters).some(field => !["sessionIds", "sources", "speakerRefs", "topicRefs"].includes(field))
    || value.filters.sessionIds.some(s => typeof s !== "string" || !s.trim() || s.length > 200) || !["all", "internal"].includes(value.filters.sources as string))
    throw new ApiError(502, "Saved-answer inputs could not be read.");
  const filters = value.filters;
  for (const field of ["speakerRefs", "topicRefs"]) {
    const ids = filters[field];
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 16 || ids.some(s => typeof s !== "string")))
      throw new ApiError(502, "Saved-answer inputs could not be read.");
  }
  const result = readAppliedAnswer(value.result);
  if (result.runId !== id) throw new ApiError(502, "Saved history identity is inconsistent.");
  return { ...value, result } as unknown as HistoryItem;
}
export const saveAnswerFeedback = (key: string | null, id: string, rating: string, note: string) => apiFetch(`/answer-history/${encodeURIComponent(id)}/feedback`, key, { method: "POST", body: { rating, note } });
export const reportAnswerConflict = (key: string | null, id: string, a: string, b: string, explanation: string) => apiFetch(`/answer-history/${encodeURIComponent(id)}/conflicts`, key, { method: "POST", body: { a, b, explanation } });
export const answerReviews = (key: string | null) => apiFetch<{ items: AnswerReview[] }>("/answer-reviews", key);
export const sourceConflicts = (key: string | null) => apiFetch<{ conflicts: SourceConflict[] }>("/answer-evidence-conflicts", key);
export const resolveAnswerReview = (key: string | null, item: AnswerReview, decision: string, note: string) => apiFetch(`/answer-reviews/${encodeURIComponent(item.id)}/resolve`, key, { method: "POST", body: { decision, note, candidateDigest: item.candidateDigest, evidenceDigest: item.evidenceDigest } });
export const resolveSourceConflict = (key: string | null, item: SourceConflict, keepSourceId: string, note: string) => apiFetch(`/answer-evidence-conflicts/${encodeURIComponent(item.id)}/resolve`, key, { method: "POST", body: { keepSourceId, note, evidenceDigest: item.evidenceDigest } });
