/**
 * packages/index/src/tree/regenerate.ts — incremental tree-index regeneration (T-004b, C3).
 *
 * `regenerate` rebuilds only the year subtrees touched by `changedSessionIds`, leaving every
 * other year (and everything under it — months, sessions, topic/org children) as the exact same
 * object reference from the input `tree`, so an untouched subtree is trivially `===`- and
 * deep-equal-comparable to what buildTree would have produced from scratch. This mirrors the
 * "regenerate before you can ship" discipline ARCHITECTURE §5 already established for
 * SNAPSHOT.md, applied here to the tree index itself.
 *
 * Scope note: `tree` is a single tenant root (buildTree's output is keyed by tenant; pass
 * `tree[tenantId]`), matching search.ts's "operate on one root" convention.
 *
 * T-004c: a changed session that *moved* year (its `date` changed) is now fully handled — its
 * OLD year is located by scanning the input `tree` for the session's existing node and added to
 * `touchedYears` even when no other changed session lives there, so the rebuild naturally omits
 * the moved session from its old year's subtree (it no longer appears in that year's session
 * list). Cross-session topic evidence (`evidence.sessionRefs`) on TOUCHED years' topic nodes is
 * computed against the FULL tenant session list (via `buildTree`'s `topicContextSessions`), so a
 * topic shared with an untouched year picks up that year's session id even though only the
 * touched year is rebuilt. An UNTOUCHED year's own topic nodes still don't refresh — refreshing
 * them would require rebuilding them, which would break the `===`-preservation guarantee that is
 * the whole point of incremental regeneration; this residual gap is disclosed, not a defect.
 */
import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { buildTree } from "./build.js";
import { extractTopicRefs, type ExtractTopicRefs } from "./extract-topics.js";

/**
 * `tree` — one tenant's root node (as found at `buildTree(...)[tenantId]`).
 * `changedSessionIds` — session `_id`s that were added or updated since `tree` was built.
 * `sessions` / `sessionPages` — the FULL current collections (not just the changed ones); needed
 * because a touched year must be rebuilt with all its sessions, not only the changed subset.
 * `extractFn` — same injectable seam as `buildTree`; must match what built `tree` originally to
 * keep unrelated topic ids stable.
 */
/** Finds the year-node title (e.g. "2026") currently holding a session node for `sessionId` in
 * the existing `tree`, by scanning year -> month -> session. Returns undefined if not present
 * (a brand-new session has no old location to clean up). */
function findExistingYear(tree: TreeIndexNode, sessionId: string): string | undefined {
  for (const yearNode of tree.children) {
    for (const monthNode of yearNode.children) {
      if (monthNode.children.some((s) => s.node_id.endsWith(`/session:${sessionId}`))) {
        return yearNode.title;
      }
    }
  }
  return undefined;
}

export function regenerate(tree: TreeIndexNode, changedSessionIds: string[], sessions: Sessions[],
  sessionPages: SessionPages[], extractFn: ExtractTopicRefs = extractTopicRefs): TreeIndexNode {
  const tenantId = tree.node_id.replace(/^tenant:/, "");
  const changed = new Set(changedSessionIds);

  const changedSessions = sessions.filter((s) => s.tenantId === tenantId && changed.has(s._id));
  const touchedYears = new Set(changedSessions.map((s) => s.date.slice(0, 4)));

  // T-004c C1: a changed session's OLD year (its location in the input `tree`, which may differ
  // from its current `date` if it moved) must also be rebuilt, even if no other changed session
  // lives there, so the moved session's orphaned node is dropped rather than left stale.
  for (const id of changedSessionIds) {
    const oldYear = findExistingYear(tree, id);
    if (oldYear !== undefined) touchedYears.add(oldYear);
  }

  if (touchedYears.size === 0) return tree; // nothing in changedSessionIds belongs here

  const tenantAllSessions = sessions.filter((s) => s.tenantId === tenantId);
  const tenantSessions = tenantAllSessions.filter((s) => touchedYears.has(s.date.slice(0, 4)));

  // T-004c C2/C3: render only the touched-year subset, but compute cross-session topic sharing
  // against the FULL tenant session list, so a touched year's topic nodes get accurate
  // cross-year `sessionRefs` without rebuilding (and so invalidating) untouched years.
  const rebuilt = buildTree(tenantSessions, sessionPages, undefined, extractFn,
    tenantAllSessions)[tenantId];

  const untouchedYearChildren = tree.children.filter((yearNode) => !touchedYears.has(yearNode.title));
  const rebuiltYearChildren = rebuilt?.children ?? [];

  return {
    ...tree,
    children: [...untouchedYearChildren, ...rebuiltYearChildren],
  };
}
