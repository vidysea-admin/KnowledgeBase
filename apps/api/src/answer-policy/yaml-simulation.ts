/** Unsaved YAML simulation runs the actual bounded Ask provider; never stores or applies a draft to other requests. */
import { askV2 } from "@lkb/ask";
import type { AskRouteDeps } from "../routes/ask/ask.js";
import { AnswerWorkflowError } from "./answer-workflow.js";
import { policyAskDeps } from "./application.js";
import { evaluatePolicy } from "./evaluate.js";
import { validPolicyId } from "./rules.js";
import { parsePolicyYaml } from "./yaml.js";
import type { PolicyRevision } from "./types.js";

export async function simulateYamlPolicy(tenantId: string, raw: unknown, deps: AskRouteDeps) {
  const input = raw as { query?: unknown; yaml?: unknown; policyId?: unknown } | null;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !["query", "yaml", "policyId"].includes(k))
    || typeof input.query !== "string" || !input.query.trim() || input.query.length > 4000 || !validPolicyId(input.policyId))
    throw new AnswerWorkflowError("bad_request", "Provide a question, policy ID and flat YAML draft.");
  const draft = parsePolicyYaml(input.yaml);
  const policy: PolicyRevision = { ...draft.body, policyId: input.policyId, version: (draft.expectedVersion ?? 0) + 1, tenantId,
    action: "save", retired: false, changedBy: { actor: `api-key:${tenantId}` }, changedAt: new Date().toISOString(),
    note: draft.note, previousVersion: draft.expectedVersion };
  const tree = await deps.tree.load(tenantId);
  if (!tree) throw new AnswerWorkflowError("not_found", "No tree index is available for this tenant.");
  const requestDeps = { ...deps.askDeps, ...(deps.requestDepsFor ? deps.requestDepsFor(tenantId) : {}), tenantId,
    ...(!deps.requestDepsFor && deps.extraCandidateArmsFor ? { extraCandidateArmsFn: deps.extraCandidateArmsFor(tenantId) } : {}) };
  if (!requestDeps.sourceContext) throw new AnswerWorkflowError("evidence_unavailable", "Bounded source retrieval is unavailable.");
  const result = await askV2(input.query.trim(), tree, policyAskDeps(requestDeps, policy));
  return { transient: true, draft: policy, simulation: evaluatePolicy(tenantId, policy, result), result };
}
