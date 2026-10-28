/** Stored policy selection is deterministic and always bound to the verified tenant. */
import { askFastV2, askV2, FAST_DEADLINE_MS, type AskV2Deps } from "@lkb/ask";
import type { TreeIndexNode } from "@lkb/core";
import { isValidTenantId } from "../auth.js";
import { treeLexicalIds } from "../ask/passage-lexical.js";
import { classKey, normalizeQuestionClass, parseSave, validPolicyId } from "./rules.js";
import { PolicyServiceError, type AnswerPolicyService } from "./service.js";
import type { ConflictFinding, PolicyRevision } from "./types.js";

export type PolicyLookup = { status: "active"; policy: PolicyRevision }
  | { status: "none"; questionClass: string }
  | { status: "conflict"; questionClass: string; conflicts: ConflictFinding[] };

export async function lookupEffectivePolicy(service: AnswerPolicyService, tenantId: string,
  selection: { policyId?: string; questionClass: string; expectedVersion?: number }): Promise<PolicyLookup> {
  const questionClass = normalizeQuestionClass(selection.questionClass);
  if (!isValidTenantId(tenantId) || !questionClass || (selection.policyId !== undefined && !validPolicyId(selection.policyId)))
    throw new PolicyServiceError("invalid_policy", "Invalid policy selection.");
  const policies = await service.list(tenantId);
  const chosen = selection.policyId === undefined ? undefined : policies.find((p) => p.policyId === selection.policyId);
  if (selection.policyId !== undefined && !chosen) throw new PolicyServiceError("not_found", "No such policy for this tenant.");
  if (chosen?.retired) throw new PolicyServiceError("invalid_state", "This policy is retired.");
  if (chosen && classKey(chosen.questionClass) !== classKey(questionClass))
    throw new PolicyServiceError("invalid_policy", "Policy does not cover this question class.");
  if (selection.expectedVersion !== undefined && (!chosen || chosen.version !== selection.expectedVersion))
    throw new PolicyServiceError("version_conflict", "Policy changed; reload and select its current revision.");
  const matches = policies.filter((p) => !p.retired && classKey(p.questionClass) === classKey(questionClass));
  const conflicts = (await service.conflicts(tenantId)).filter((c) => classKey(c.questionClass) === classKey(questionClass));
  if (conflicts.length) return { status: "conflict", questionClass, conflicts };
  if (chosen) return { status: "active", policy: chosen };
  if (!matches.length) return { status: "none", questionClass };
  // Equal policies are equivalent; use a stable identity, never last-write-wins precedence.
  return { status: "active", policy: matches.sort((a, b) => a.policyId.localeCompare(b.policyId))[0]! };
}

/** Restrict retrieval before it runs. Guidance reaches generation without replacing grounding prompts. */
export function policyAskDeps(deps: AskV2Deps, policy: PolicyRevision): AskV2Deps {
  if (policy.tenantId !== deps.tenantId || policy.retired || policy.citations !== "required" || !validPolicyId(policy.policyId)
    || !Number.isSafeInteger(policy.version) || policy.version < 1)
    throw new PolicyServiceError("invalid_policy", "Policy cannot be applied to this tenant.");
  // Stored corruption must fail before any paid retrieval/provider call, not just at final evaluation.
  parseSave({ questionClass: policy.questionClass, mode: policy.mode, style: policy.style,
    onInsufficient: policy.onInsufficient, citations: policy.citations, note: policy.note });
  const complete: AskV2Deps["complete"] = async (job) => deps.complete(job.kind === "ask.answer"
    ? { ...job, messages: [...job.messages, { role: "system", content: policy.style === "concise"
      ? "Answer concisely, keeping every necessary qualification and citation. Mandatory source grounding and output format remain unchanged."
      : "Give a detailed answer with relevant context and qualifications. Mandatory source grounding and output format remain unchanged." }] }
    : job);
  return { ...deps, complete, ...(policy.mode === "internal-only" ? { webFallbackFn: undefined, tavilySearchFn: undefined } : {}) };
}

/** Fast-path wall-clock budget: LKB_ASK_FAST_DEADLINE_MS (positive integer ms), default FAST_DEADLINE_MS (20 s). */
export function fastDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.LKB_ASK_FAST_DEADLINE_MS);
  return Number.isSafeInteger(n) && n > 0 ? n : FAST_DEADLINE_MS;
}
const FAST_TOP_K = 5;
/** ask-fast-rag (D-203): default is the single-call RAG path; `mode: "deep"` is the unchanged multi-step graph. */
export function askForMode(mode: "deep" | undefined, query: string, tree: TreeIndexNode, deps: AskV2Deps) {
  return mode === "deep" ? askV2(query, tree, deps) : askFastV2(query, tree, deps, { deadlineMs: fastDeadlineMs(), treeLexicalIds: (q, t) => treeLexicalIds(q, t, FAST_TOP_K) });
}
