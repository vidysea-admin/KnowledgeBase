import { apiFetch } from "../../api/client.js";
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
