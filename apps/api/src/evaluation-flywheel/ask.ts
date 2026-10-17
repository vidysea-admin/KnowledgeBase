import { askV2, type AskV2Deps } from "@lkb/ask";
import type { AskRouteDeps } from "../routes/ask/ask.js";
import { fingerprint, FlywheelError, type FlywheelDeps } from "./types.js";

/** Mandatory request-bound hydration: uses the same source/policy/router deps as actual /ask. */
export function buildFlywheelAsk(deps: AskRouteDeps): FlywheelDeps["ask"] {
  return async (tenantId, question, receipt) => {
    const tree = await deps.tree.load(tenantId);
    if (!tree || tree.node_id !== `tenant:${tenantId}` || fingerprint(tree) !== receipt.treeDigest || !deps.requestDepsFor)
      throw new FlywheelError("unavailable", 503);
    const scoped: Omit<AskV2Deps, "tenantId"> = await deps.requestDepsFor(tenantId);
    if (!scoped || [scoped.complete, scoped.scoreFn, scoped.treeSearchFn, scoped.write, scoped.sourceContext?.hydrate]
      .some((value) => typeof value !== "function")) throw new FlywheelError("unavailable", 503);
    const result = await askV2(question, tree, { ...scoped, tenantId });
    if (fingerprint(await deps.tree.load(tenantId)) !== receipt.treeDigest) throw new FlywheelError("input_drift", 409);
    return { text: result.answer, ...result };
  };
}
