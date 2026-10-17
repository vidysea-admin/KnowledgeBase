import path from "node:path";
import type { JoinRulesDeps } from "../../join-rules/deps.js";
import { createJoinPolicyDeps } from "@lkb/ingest";

/** Explicit opt-in; construction binds functions only and never creates files or starts capture. */
export function buildCapturePolicyIntegrations({root, env}: {root: string; env: Record<string, string | undefined>}): {joinRules?: JoinRulesDeps} {
  if (env.LKB_JOIN_RULES_ENABLED !== "1" || typeof root !== "string" || !path.isAbsolute(root) ||
    /[\x00-\x1f\x7f]/.test(root) || root !== root.trim()) return {};
  const repository = path.resolve(root), stateDir = path.resolve(repository, "raw", "webinars");
  if (path.relative(repository, stateDir) !== path.join("raw", "webinars")) return {};
  return {joinRules: createJoinPolicyDeps({stateDir})};
}
