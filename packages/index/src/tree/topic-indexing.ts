/** U2.3: tenant-scoped preparation for the synchronous build/regenerate extractFn seam.
 * No persistence or provider construction. Semantic quality and rollout remain gated by U2.2.
 */
import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { buildTree, treeIndexRootFilter } from "./build.js";
import { regenerate } from "./regenerate.js";
import type { ExtractTopicRefs } from "./extract-topics.js";
import { isLlmTopicsEnabled, prepareTopicExtractFn, type TopicExtraction, type TopicsCompleteFn } from "./extract-topics-llm.js";

export interface TopicIndexOptions {
  existingRoot?: TreeIndexNode;
  changedSessionIds?: string[];
  enabled?: boolean;
  timeoutMs?: number;
}

/** Refuse a foreign or unresolvable existing subtree before inference or rebuilding. */
function assertScopedRoot(root: TreeIndexNode, tenantId: string, sessionIds: Set<string>): void {
  const stampedTenant = (root as TreeIndexNode & { tenantId?: unknown }).tenantId;
  if (root.level !== "tenant" || root.node_id !== treeIndexRootFilter(tenantId).node_id ||
      (stampedTenant !== undefined && stampedTenant !== tenantId)) throw new Error("topic index: foreign root");
  const visit = (node: TreeIndexNode): void => {
    if (node !== root && !node.node_id.startsWith(`${tenantId}/`)) throw new Error("topic index: foreign subtree");
    const nodeTenant = (node as TreeIndexNode & { tenantId?: unknown }).tenantId;
    if (nodeTenant !== undefined && nodeTenant !== tenantId) throw new Error("topic index: foreign subtree stamp");
    if (node.level === "session" && ![...sessionIds].some((id) => node.node_id.endsWith(`/session:${id}`)))
      throw new Error("topic index: unresolved session node");
    if ((node.level === "topic" || node.level === "org") &&
        ![...sessionIds].some((id) => node.node_id.includes(`/session:${id}/${node.level}:`)))
      throw new Error("topic index: unresolved entity parent");
    const refs = node.evidence?.sessionRefs;
    if (refs !== undefined && (!Array.isArray(refs) || refs.some((id) => typeof id !== "string" || !sessionIds.has(id))))
      throw new Error("topic index: unresolved session evidence");
    const ref = node.evidence?.sessionRef;
    if (ref !== undefined && !sessionIds.has(ref)) throw new Error("topic index: unresolved session evidence");
    for (const child of node.children) visit(child);
  };
  visit(root);
}

/**
 * A cached transcript year may be reused only if every node still matches what buildTree would
 * emit from the CURRENT safe sessions and pages. buildTree never writes text above the session
 * level, a session summary is exactly its page summary, and topic/org titles come only from the
 * page or session, so any divergence (stale rejected-page text, a mixed ancestor summary, a
 * topic or org with no current source) means the cache carries knowledge that is no longer
 * supported. Such a root is dropped whole, never partially served. Extra fields (bindings) and
 * cross-year sessionRefs are not compared; unresolved refs are already refused by assertScopedRoot.
 */
function cachedRootMatchesCurrent(root: TreeIndexNode, tenantId: string, sessions: Sessions[],
  pages: SessionPages[], extractFn: ExtractTopicRefs, changed: Set<string>): boolean {
  if (root.summary !== "") return false;
  // regenerate rebuilds these years from the current inputs anyway; only reused years need proof.
  const rebuiltYears = new Set(sessions.filter((s) => changed.has(s._id)).map((s) => s.date.slice(0, 4)));
  const holdsChanged = (node: TreeIndexNode): boolean =>
    (node.level === "session" && [...changed].some((id) => node.node_id.endsWith(`/session:${id}`))) || node.children.some(holdsChanged);
  const expected = new Map<string, TreeIndexNode>();
  const index = (node: TreeIndexNode): void => { expected.set(node.node_id, node); node.children.forEach(index); };
  const fresh = buildTree(sessions, pages, undefined, extractFn)[tenantId];
  if (fresh) index(fresh);
  const check = (node: TreeIndexNode): boolean => {
    const want = expected.get(node.node_id);
    if (!want || want.level !== node.level || want.title !== node.title || want.summary !== node.summary ||
        want.evidence?.sessionRef !== node.evidence?.sessionRef) return false;
    return node.children.every(check);
  };
  // Non-transcript branches (for example native sources) are owned and gated elsewhere.
  return root.children.every((year) => year.level !== "year" || rebuiltYears.has(year.title) ||
    holdsChanged(year) || check(year));
}

export async function buildTopicIndex(tenantId: string, sessions: Sessions[], pages: SessionPages[],
  complete: TopicsCompleteFn, opts: TopicIndexOptions = {}):
  Promise<{ root: TreeIndexNode | undefined; results: Map<string, TopicExtraction> }> {
  const scopedSessions = sessions.filter((session) => session.tenantId === tenantId);
  const sessionIds = new Set(scopedSessions.map((session) => session._id));
  if (sessionIds.size !== scopedSessions.length) throw new Error("topic index: duplicate session identity");
  const scopedPages = pages.filter((page) => page.tenantId === tenantId && sessionIds.has(page.sessionId));
  const pageSessionIds = new Set<string>();
  const pageIds = new Set<string>();
  for (const page of scopedPages) {
    if (pageSessionIds.has(page.sessionId)) throw new Error("topic index: ambiguous session page");
    if (pageIds.has(page._id)) throw new Error("topic index: duplicate page identity");
    pageSessionIds.add(page.sessionId);
    pageIds.add(page._id);
  }
  if (opts.existingRoot) assertScopedRoot(opts.existingRoot, tenantId, sessionIds);
  const enabled = opts.enabled ?? isLlmTopicsEnabled();
  const prepared = await prepareTopicExtractFn(scopedPages, complete, { enabled, timeoutMs: opts.timeoutMs });
  // Refresh every existing year when enabled: mixing old heuristic years with newly inferred
  // years would make shared topic evidence depend on which session happened to trigger indexing.
  const changed = enabled ? [...sessionIds] : opts.changedSessionIds ?? [...sessionIds];
  const existingRoot = opts.existingRoot &&
    cachedRootMatchesCurrent(opts.existingRoot, tenantId, scopedSessions, scopedPages, prepared.extractFn, new Set(changed))
    ? opts.existingRoot : undefined;
  const root = existingRoot
    ? regenerate(existingRoot, changed, scopedSessions, scopedPages, prepared.extractFn)
    : buildTree(scopedSessions, scopedPages, undefined, prepared.extractFn)[tenantId];
  return { root, results: prepared.results };
}
