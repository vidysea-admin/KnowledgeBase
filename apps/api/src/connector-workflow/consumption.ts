import type { TreeIndexNode } from "@lkb/core";

/** A persisted tenant tree must contain this exact session, not merely some tenant root. */
export function connectorTreeContainsSession(root: TreeIndexNode | null, sessionId: string): boolean {
  if (!root) return false;
  const pending = [root];
  let visited = 0;
  while (pending.length && visited++ < 10000) {
    const node = pending.pop()!;
    if (node.level === "session" && node.evidence?.sessionRef === sessionId) return true;
    if (Array.isArray(node.children)) pending.push(...node.children);
  }
  return false;
}
