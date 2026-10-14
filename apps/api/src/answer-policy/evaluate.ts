/** Applying a persisted policy to an Ask result. A policy can only tighten a decision, never loosen the grounding checks. */
import type { AskV2Result } from "../../../../packages/ask/src/ask-shared.js";
import { simulateAnswerPolicy, type AnswerPolicySimulation } from "../../../../packages/ask/src/answer-policy.js";
import type { PolicyRevision } from "./types.js";

export interface PolicyEvaluation extends AnswerPolicySimulation { citationsRequired: true; style: PolicyRevision["style"] }

export function evaluatePolicy(tenantId: string, policy: PolicyRevision, result: AskV2Result): PolicyEvaluation {
  if (policy.retired) throw new Error("retired answer policy cannot be applied");
  const sim = simulateAnswerPolicy(tenantId, { tenantId: policy.tenantId, policyId: policy.policyId, version: policy.version, mode: policy.mode },
    { tenantId, result });
  const tightened = sim.decision === "review" && policy.onInsufficient === "refuse"
    ? { ...sim, decision: "refuse" as const } : sim;
  return { ...tightened, citationsRequired: true, style: policy.style };
}
