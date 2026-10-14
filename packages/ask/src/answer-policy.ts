/** T-056: immutable draft policies and a read-only simulation over an authenticated Ask result.
 * This does not change Ask execution, persist policy versions, or certify citation truth.
 * Callers must obtain the result through tenant-scoped retrieval before attaching its tenant.
 */
import type { AskV2Result } from "./ask-shared.js";

export type AnswerPolicyMode = "internal-only" | "internal-and-web";
export interface AnswerPolicyVersion {
  readonly tenantId: string;
  readonly policyId: string;
  readonly version: number;
  readonly mode: AnswerPolicyMode;
}
export interface AnswerPolicySimulation {
  policyId: string;
  version: number;
  decision: "allow" | "review" | "refuse";
  reason: "covered" | "insufficient-coverage" | "missing-provenance" | "web-disallowed" | "no-sources" | "invalid-result";
  internalSources: number;
  webSources: number;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}
function validPolicy(policy: AnswerPolicyVersion): boolean {
  return !!policy && identifier(policy.tenantId) && identifier(policy.policyId)
    && Number.isSafeInteger(policy.version) && policy.version > 0
    && (policy.mode === "internal-only" || policy.mode === "internal-and-web");
}

/** Creates a detached frozen value; previous versions remain unchanged. No storage implied. */
export function createAnswerPolicyVersion(tenantId: string, policyId: string, mode: AnswerPolicyMode,
  previous?: AnswerPolicyVersion): AnswerPolicyVersion {
  if (!identifier(tenantId) || !identifier(policyId)
    || (mode !== "internal-only" && mode !== "internal-and-web")) throw new Error("invalid answer policy");
  if (previous && (!validPolicy(previous) || previous.tenantId !== tenantId || previous.policyId !== policyId
    || previous.version === Number.MAX_SAFE_INTEGER)) throw new Error("invalid previous answer policy");
  return Object.freeze({ tenantId, policyId, version: previous ? previous.version + 1 : 1, mode });
}

/** Returns metadata only. A refusal/review never returns or rewrites an answer. */
export function simulateAnswerPolicy(tenantId: string, policy: AnswerPolicyVersion,
  envelope: { tenantId: string; result: AskV2Result }): AnswerPolicySimulation {
  if (!identifier(tenantId) || !validPolicy(policy) || !envelope
    || policy.tenantId !== tenantId || envelope.tenantId !== tenantId) throw new Error("answer policy tenant mismatch");
  const result = envelope.result;
  const internal = result?.sources?.internal;
  const web = result?.sources?.web;
  const reply = (decision: AnswerPolicySimulation["decision"], reason: AnswerPolicySimulation["reason"]): AnswerPolicySimulation => ({
    policyId: policy.policyId, version: policy.version, decision, reason,
    internalSources: Array.isArray(internal) ? internal.length : 0,
    webSources: Array.isArray(web) ? web.length : 0,
  });
  if (!result || !Array.isArray(internal) || !Array.isArray(web) || typeof result.answer !== "string"
    || result.answer.trim() === "" || typeof result.web_used !== "boolean"
    || typeof result.insufficient_coverage !== "boolean"
    || !["correct", "ambiguous", "incorrect"].includes(result.verdict)) return reply("refuse", "invalid-result");
  if (policy.mode === "internal-only" && (result.web_used || web.length > 0)) return reply("refuse", "web-disallowed");
  if (internal.length + web.length === 0) return reply("refuse", "no-sources");
  if (internal.some((source) => !source || !identifier(source.node_id) || !identifier(source.evidence?.sessionRef))) {
    return reply("review", "missing-provenance");
  }
  if (web.some((source) => {
    try { return !source || typeof source.url !== "string" || !["http:", "https:"].includes(new URL(source.url).protocol); }
    catch { return true; }
  })) return reply("review", "missing-provenance");
  if (result.insufficient_coverage || (!result.web_used && result.verdict !== "correct")
    || (result.web_used && web.length === 0) || (!result.web_used && web.length > 0)) return reply("review", "insufficient-coverage");
  return reply("allow", "covered");
}
