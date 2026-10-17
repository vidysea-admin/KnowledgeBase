/**
 * packages/index/src/tree/build.ts — vectorless tree-index generator (port of
 * tree_index/build_tree.py, T-004 → T-016; extended T-004b with topic/org child levels).
 *
 * Builds a hierarchical tree (tenant -> year -> month -> session -> topic|org) from `sessions`
 * and `session_pages` documents (schema/sessions.schema.json, schema/session_pages.schema.json).
 * No dense-vector math, no similarity search, no network calls: structure IS the index; an LLM
 * (or, for tests, a plain fallback) supplies each node's summary.
 *
 * `summarize` is an injectable seam — pass a function to have an LLM write node summaries;
 * omit it and the session_page's own `summary` field is used verbatim (network-free, testable).
 *
 * `extractFn` is the same kind of seam for topic children — defaults to the heuristic
 * `extractTopicRefs` (extract-topics.ts); an LLM-backed extractor can be injected with the same
 * signature. Topic node ids/shape follow schema/topics.schema.json; org node ids/shape follow
 * schema/orgs.schema.json. A topic can span sessions, so each topic node's
 * `evidence.sessionRefs` lists every session (in this `sessions` call) that surfaced it — not
 * just the one it's nested under — while `evidence.sessionRef` keeps pointing at its own parent
 * session (same field T-004 already used for session nodes).
 *
 * `topicContextSessions` (T-004c, optional, defaults to `sessions`): used ONLY for the
 * cross-session topic-map pass (which sessions share a topic slug) — rendering (which sessions
 * actually get year/month/session nodes built) still comes from `sessions` alone. This lets
 * `regenerate.ts` rebuild just the touched years while still computing accurate cross-year
 * `sessionRefs` on those years' topic nodes, without touching (and so without invalidating the
 * `===`-preservation of) untouched years.
 */
import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import { extractTopicRefs, type ExtractTopicRefs } from "./extract-topics.js";

export type Summarize = (session: Sessions, page: SessionPages | null) => string;
export type { ExtractTopicRefs };

/**
 * A tenant's whole tree lives under one root document whose `node_id` is `tenant:<id>`, the
 * convention this function defines and every other reader must use verbatim (ISS-063: before
 * this, `apps/api/src/indexing.ts` and TWO call sites in `apps/api/src/store.ts` each hand-wrote
 * the same filter; `store.ts`'s copy had already been caught wrong once, live, on 2026-09-04).
 * This is the ONE place that convention is written; every reader imports it rather than
 * re-deriving it.
 *
 * Also returns a real `tenantId` term (ISS-062): `schema/tree_index.schema.json`'s root document
 * now declares `tenantId` as a required field, so a tenant's tree is no longer separated ONLY by
 * the `node_id` string prefix a query could theoretically match against a differently-tenanted
 * row if the prefix convention were ever violated — the filter now matches on the real field too.
 * `treeIndexMigration.mjs` (`migrations/`) backfills this field onto any document written before
 * this change.
 */
export function treeIndexRootFilter(tenantId: string): { node_id: string; level: "tenant"; tenantId: string } {
  return { node_id: `tenant:${tenantId}`, level: "tenant", tenantId };
}

/** Lowercases, replaces runs of non-alphanumerics with "-", trims leading/trailing "-". */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function node(nodeId: string, title: string, level: TreeIndexNode["level"], summary = "",
  evidence?: TreeIndexNode["evidence"]): TreeIndexNode {
  const n: TreeIndexNode = { node_id: nodeId, title, level, summary, children: [] };
  if (evidence !== undefined) n.evidence = evidence;
  return n;
}

function sessionPageFor(sessionId: string, sessionPages: SessionPages[]): SessionPages | null {
  return sessionPages.find((p) => p.sessionId === sessionId) ?? null;
}

function childById(parent: TreeIndexNode, nodeId: string): TreeIndexNode | undefined {
  return parent.children.find((c) => c.node_id === nodeId);
}

/**
 * Returns `{ [tenantId]: <root tree node> }` — one root per distinct tenant found in `sessions`.
 * Each root nests year -> month -> session nodes underneath it.
 *
 * `summarize(session, page)`, if provided, produces the summary text for a session node.
 * If omitted, falls back to `page.summary` (or "" if no page exists for that session yet).
 *
 * `extractFn(page)`, if provided, overrides the default heuristic `extractTopicRefs` used to
 * derive each session's topic children (see module doc above).
 */
export function buildTree(sessions: Sessions[], sessionPages: SessionPages[],
  summarize?: Summarize, extractFn: ExtractTopicRefs = extractTopicRefs,
  topicContextSessions: Sessions[] = sessions):
  Record<string, TreeIndexNode> {
  const roots: Record<string, TreeIndexNode> = {};

  // Pass 1: cross-session topic map (slug -> {displayName, sessionIds}) so a topic node nested
  // under any one session can still report every session that shares it. Iterates
  // `topicContextSessions` (T-004c) rather than `sessions` so a caller can widen the topic-sharing
  // context (e.g. regenerate.ts passing the full tenant) without also widening which sessions get
  // rendered.
  const topicSessionIds = new Map<string, Set<string>>();
  const topicDisplayName = new Map<string, string>();
  for (const session of topicContextSessions) {
    const page = sessionPageFor(session._id, sessionPages);
    for (const name of extractFn(page)) {
      const slug = slugify(name);
      if (slug === "") continue;
      if (!topicSessionIds.has(slug)) topicSessionIds.set(slug, new Set());
      topicSessionIds.get(slug)!.add(session._id);
      if (!topicDisplayName.has(slug)) topicDisplayName.set(slug, name);
    }
  }

  for (const session of sessions) {
    const tenantId = session.tenantId;
    const year = session.date.slice(0, 4);
    const month = session.date.slice(5, 7);

    const root = (roots[tenantId] ??= node(treeIndexRootFilter(tenantId).node_id, tenantId, "tenant"));

    const yearId = `${tenantId}/year:${year}`;
    let yearNode = childById(root, yearId);
    if (yearNode === undefined) {
      yearNode = node(yearId, year, "year");
      root.children.push(yearNode);
    }

    const monthId = `${yearId}/month:${month}`;
    let monthNode = childById(yearNode, monthId);
    if (monthNode === undefined) {
      monthNode = node(monthId, month, "month");
      yearNode.children.push(monthNode);
    }

    const page = sessionPageFor(session._id, sessionPages);
    const summary = summarize !== undefined ? summarize(session, page) : page?.summary ?? "";

    const sessionId = `${monthId}/session:${session._id}`;
    const sessionNode = node(sessionId, session.title, "session", summary,
      { sessionRef: session._id });
    monthNode.children.push(sessionNode);

    // Topic children (schema/topics.schema.json id shape: tenant-scoped slug of the name).
    const seenSlugs = new Set<string>();
    for (const name of extractFn(page)) {
      const slug = slugify(name);
      if (slug === "" || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      const sessionRefs = [...(topicSessionIds.get(slug) ?? [session._id])].sort();
      sessionNode.children.push(node(`${sessionId}/topic:${slug}`,
        topicDisplayName.get(slug) ?? name, "topic", "",
        { sessionRef: session._id, sessionRefs }));
    }

    // Org child (schema/orgs.schema.json id shape: tenant-scoped slug of the name).
    if (session.org !== undefined && session.org !== "") {
      const orgSlug = slugify(session.org);
      if (orgSlug !== "") {
        sessionNode.children.push(node(`${sessionId}/org:${orgSlug}`, session.org, "org", "",
          { sessionRef: session._id }));
      }
    }
  }

  return roots;
}
