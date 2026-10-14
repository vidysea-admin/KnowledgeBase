/** Conflict detector: two live policies in one tenant that give contradictory guidance for the same question class. */
import type { ConflictDimension, ConflictFinding, PolicyRevision } from "./types.js";

const DIMENSIONS: ConflictDimension[] = ["mode", "onInsufficient", "style"];
const WHY: Record<ConflictDimension, (c: string, a: PolicyRevision, b: PolicyRevision) => string> = {
  mode: (c, a, b) => `For "${c}", ${a.policyId} says ${a.mode} but ${b.policyId} says ${b.mode}: one forbids web sources the other permits, so the same question would be answered from different evidence.`,
  onInsufficient: (c, a, b) => `For "${c}", when coverage is thin ${a.policyId} says ${a.onInsufficient} but ${b.policyId} says ${b.onInsufficient}: the same weak answer would be held for review or refused depending on which policy wins.`,
  style: (c, a, b) => `For "${c}", ${a.policyId} asks for ${a.style} answers but ${b.policyId} asks for ${b.style}: the answer length guidance contradicts.`,
};

/** Only exact (normalized) question-class matches overlap; there is no wildcard or precedence rule. Retired policies are ignored. */
export function detectConflicts(revisions: readonly PolicyRevision[]): ConflictFinding[] {
  const live = revisions.filter((r) => !r.retired).sort((x, y) => x.policyId.localeCompare(y.policyId));
  const out: ConflictFinding[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!;
      if (a.tenantId !== b.tenantId || a.questionClass !== b.questionClass) continue;
      for (const dim of DIMENSIONS) {
        if (a[dim] === b[dim]) continue;
        out.push({
          key: `${a.policyId}@${a.version}|${b.policyId}@${b.version}|${dim}`,
          questionClass: a.questionClass, dimension: dim, severity: dim === "mode" ? "high" : "medium",
          a: { policyId: a.policyId, version: a.version, value: a[dim] },
          b: { policyId: b.policyId, version: b.version, value: b[dim] },
          explanation: WHY[dim](a.questionClass, a, b),
        });
      }
    }
  }
  return out;
}
