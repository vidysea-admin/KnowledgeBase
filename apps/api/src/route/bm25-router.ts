/**
 * apps/api/src/route/bm25-router.ts - D-206 /route step A. The operating brain's retrieval shape applied to the
 * PageIndex tree: the tree's session and topic nodes are the short "pages", a BM25 index over their
 * title + summary (+ derived facet tokens) decides WHERE to look, and only then are 1-3 sessions read in full.
 * Deterministic, no LLM, no I/O; the tree only routes, answer text always comes from `turns` rows.
 */
import type { RouteIndexDoc, TreeIndexNode } from "@lkb/core";
import { bm25Scores, buildBm25, tokenize, type Bm25Index } from "./bm25.js";
import { facetTokens, facetsOf, queryFacetTokens, type Facets } from "./facets.js";

export interface RouteDoc { nodeId: string; title: string; level: "session" | "topic"; sessionIds: string[]; facets: Facets; node: TreeIndexNode }
export interface RouteIndex { docs: RouteDoc[]; bm25: Bm25Index; sessionIds: string[]; builtAt: number }
export interface RankedSession { sessionId: string; score: number }
export interface StepA { sessions: RankedSession[]; docs: { doc: RouteDoc; score: number }[]; confident: boolean; margin: number }

/** Step A is confident when the kept sessions beat the best session left out by this ratio (or nothing was left out). */
export const CONFIDENCE_MARGIN = 1.25;
export const MAX_SESSIONS = 3;
const MAX_NODES = 10_000;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
export const refsOf = (n: TreeIndexNode): string[] => { const r = strings(n.evidence?.sessionRefs); return r.length ? r : strings([n.evidence?.sessionRef]); };
const leaf = (n: TreeIndexNode): TreeIndexNode => ({ ...n, children: [] });

/** Indexes the transcript branches (session + topic nodes) of one tenant's tree. Native-source branches are not routed here. */
export function buildRouteIndex(tree: TreeIndexNode, tenantId: string, now = Date.now()): RouteIndex {
  const docs: RouteDoc[] = [], texts: string[] = [], sessionIds = new Set<string>();
  const seen = new Set<string>();
  const stack: { node: TreeIndexNode; session?: TreeIndexNode; depth: number }[] = [{ node: tree, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { node, session, depth } = stack.pop()!;
    if (++visited > MAX_NODES || depth > 64 || !Array.isArray(node.children) || seen.has(node.node_id)) throw new Error("invalid route tree");
    if (node.tenantId !== undefined && node.tenantId !== tenantId) throw new Error("route tree tenant mismatch");
    seen.add(node.node_id);
    if (node.level === "native-source" || node.level === "native-passage") continue;
    const ref = node.evidence?.sessionRef;
    if (node.level === "session" && typeof ref === "string") {
      sessionIds.add(ref);
      const kids = node.children.filter((c) => c.level === "topic" || c.level === "org").map((c) => c.title).join(" ; ");
      const text = [node.title, node.summary, kids].join(" ");
      texts.push(text);
      docs.push({ nodeId: node.node_id, title: node.title, level: "session", sessionIds: [ref], facets: facetsOf(text), node: leaf(node) });
    } else if (node.level === "topic" && typeof ref === "string" && session) {
      const refs = refsOf(node);
      const text = [node.title, node.summary, session.title].join(" ");
      texts.push(text);
      docs.push({ nodeId: node.node_id, title: node.title, level: "topic", sessionIds: refs.length ? refs : [ref], facets: facetsOf(text), node: leaf(node) });
    }
    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push({ node: node.children[i]!, session: node.level === "session" ? node : session, depth: depth + 1 });
  }
  const bm25 = buildBm25(docs.map((d, i) => [...tokenize(texts[i]!), ...facetTokens(d.facets)]));
  return { docs, bm25, sessionIds: [...sessionIds], builtAt: now };
}

/** What a persisted index was built from: the shared visibility fingerprint (search-cache) and the tree root's `indexRevision`. */
export interface RouteStamp { fingerprint: string; treeRevision: number | null }

/** D-208 item 2: the `route_index` document for one tenant (JSON-safe: postings become [term, pairs] entries, builtAt an ISO string). */
export function routeIndexToDoc(index: RouteIndex, tenantId: string, stamp: RouteStamp): RouteIndexDoc {
  return {
    _id: tenantId, tenantId, schemaVersion: 1, fingerprint: stamp.fingerprint, treeRevision: stamp.treeRevision, builtAt: new Date(index.builtAt).toISOString(),
    sessionIds: [...index.sessionIds],
    docs: index.docs.map((d) => ({ nodeId: d.nodeId, title: d.title, level: d.level, sessionIds: d.sessionIds, facets: d.facets, node: d.node })),
    bm25: { n: index.bm25.n, avgLen: index.bm25.avgLen, lens: index.bm25.lens, postings: [...index.bm25.postings].map(([term, pairs]) => [term, pairs]) },
  } as unknown as RouteIndexDoc;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/**
 * The persisted document back into a RouteIndex, or `null` when it must NOT be served: wrong tenant (document or any node), another
 * schema version, a stamp that differs from the CURRENT one (the stale-index guard), or any structural damage. `null` always means
 * "rebuild from the tree"; this never throws and never returns a partly valid index.
 */
export function routeIndexFromDoc(raw: unknown, tenantId: string, current: RouteStamp, now: number): RouteIndex | null {
  if (!isObj(raw) || raw._id !== tenantId || raw.tenantId !== tenantId || raw.schemaVersion !== 1) return null;
  if (raw.fingerprint !== current.fingerprint || raw.treeRevision !== current.treeRevision) return null;
  const { docs, bm25, sessionIds } = raw;
  if (!Array.isArray(docs) || !isObj(bm25) || !isStrings(sessionIds) || docs.length > MAX_NODES) return null;
  const out: RouteDoc[] = [];
  for (const d of docs) {
    if (!isObj(d) || typeof d.nodeId !== "string" || typeof d.title !== "string" || (d.level !== "session" && d.level !== "topic")) return null;
    const { facets, node } = d;
    if (!isStrings(d.sessionIds) || d.sessionIds.length === 0 || !isObj(facets) || !isStrings(facets.countries) || !isStrings(facets.axes) || !isStrings(facets.universities)) return null;
    if (!isObj(node) || typeof node.node_id !== "string" || !Array.isArray(node.children) || (node.tenantId !== undefined && node.tenantId !== tenantId)) return null;
    out.push({ nodeId: d.nodeId, title: d.title, level: d.level, sessionIds: d.sessionIds, facets: { countries: facets.countries, axes: facets.axes, universities: facets.universities }, node: node as unknown as TreeIndexNode });
  }
  const { n, avgLen, lens, postings } = bm25;
  if (n !== out.length || !isCount(n) || typeof avgLen !== "number" || !Number.isFinite(avgLen) || !Array.isArray(lens) || lens.length !== n || !lens.every(isCount) || !Array.isArray(postings)) return null;
  const map = new Map<string, [number, number][]>();
  for (const entry of postings) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1]) || map.has(entry[0])) return null;
    const pairs: [number, number][] = [];
    for (const p of entry[1] as unknown[]) {
      if (!Array.isArray(p) || p.length !== 2 || !isCount(p[0]) || p[0] >= n || !isCount(p[1]) || p[1] < 1) return null;
      pairs.push([p[0], p[1]]);
    }
    map.set(entry[0], pairs);
  }
  return { docs: out, bm25: { n, avgLen, lens: lens as number[], postings: map }, sessionIds: [...sessionIds], builtAt: now };
}

/** BM25 over the page index; sessions ranked by their best-scoring node. No LLM. */
export function routeStepA(index: RouteIndex, query: string, maxSessions = MAX_SESSIONS): StepA {
  const q = [...tokenize(query), ...queryFacetTokens(query)];
  const scores = q.length ? bm25Scores(index.bm25, q) : [];
  const ranked = index.docs.map((doc, i) => ({ doc, score: scores[i] ?? 0 })).filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.doc.nodeId < b.doc.nodeId ? -1 : 1));
  const best = new Map<string, number>();
  for (const { doc, score } of ranked) for (const id of doc.sessionIds) if (!best.has(id)) best.set(id, score);
  const sessions = [...best].map(([sessionId, score]) => ({ sessionId, score }))
    .sort((a, b) => b.score - a.score || (a.sessionId < b.sessionId ? -1 : 1));
  const kept = sessions[maxSessions - 1]?.score ?? 0, next = sessions[maxSessions]?.score ?? 0;
  const margin = sessions.length === 0 ? 0 : next === 0 ? Infinity : kept / next;
  return { sessions, docs: ranked, confident: sessions.length > 0 && margin >= CONFIDENCE_MARGIN, margin };
}

/** A flat synthetic root for one `selectNodes` round: the top BM25 nodes padded with session nodes, leaves only. */
export function frontierRoot(index: RouteIndex, step: StepA, allowed: ReadonlySet<string>, tenantId: string, limit = 40): TreeIndexNode {
  const ok = (d: RouteDoc) => d.sessionIds.every((s) => allowed.has(s));
  const picked = new Map<string, TreeIndexNode>();
  for (const { doc } of step.docs) { if (picked.size >= limit) break; if (ok(doc)) picked.set(doc.nodeId, doc.node); }
  for (const doc of index.docs) { if (picked.size >= limit) break; if (doc.level === "session" && ok(doc)) picked.set(doc.nodeId, doc.node); }
  return { node_id: `tenant:${tenantId}`, tenantId, title: "route frontier", level: "tenant", summary: "", children: [...picked.values()] };
}

/** The topic/country view: country slug -> topic node ids, derived from node text only. */
export function topicCountryView(index: RouteIndex): Record<string, string[]> {
  const view: Record<string, string[]> = {};
  for (const d of index.docs) if (d.level === "topic") for (const c of d.facets.countries) (view[c] ??= []).push(d.nodeId);
  return view;
}
