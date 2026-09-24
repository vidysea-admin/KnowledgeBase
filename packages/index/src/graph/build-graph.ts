/**
 * packages/index/src/graph/build-graph.ts — U-BRAIN [C1]/[C4]/[C6]/[C7]. Pure, no I/O (same seam
 * pattern as `tree/flatten-graph.ts`): the caller does the three tenant-scoped reads, this builds
 * the payload.
 *
 * WHY THIS EXISTS. `GET /graph` used to read `tree_index` ONLY, and `routes/graph.ts:5-11` said
 * `graph_edges` "hold ZERO real rows and no pipeline writes them". That stopped being true on
 * 2026-09-24, when `scripts/webinar/sync-session.mjs` wrote 94 real rows for tenant `toc` — so
 * the richest relational data in the product (people, orgs, countries, dates, each with
 * `evidence[].turnId` and a `confidence`) was reachable by no route, and a session that has
 * `graph_edges` but no `tree_index` entry (exactly the 2026-09-24 webinar) appeared nowhere on
 * /brain. This unions the two.
 *
 * [I2] NOTHING IS INVENTED HERE. Every edge out of this function is either a literal `graph_edges`
 * row or a `tree_index` structural edge; the only derivation is the tree flattener's own
 * topic-cooccurrence, which was already flagged `inferred`. Nodes are created only because an
 * edge endpoint or a tree node named them.
 */
import type { TreeIndexNode } from "@lkb/core";
import { flattenTreeToGraph, type GraphNode as TreeGraphNode } from "../tree/flatten-graph.js";
import type {
  KnowledgeGraph, KnowledgeGraphEdge, KnowledgeGraphEvidence, KnowledgeGraphNode,
  KnowledgeGraphNodeKind, KnowledgeGraphSource,
} from "./types.js";

/** The `sessions` fields this builder needs — a title to label a node with, and the id to match
 * on. Deliberately structural, so callers pass real session documents unchanged. */
export interface KnowledgeGraphSessionRef {
  _id: string;
  title?: string;
  date?: string;
}

export interface BuildKnowledgeGraphInput {
  /** `tree_index` root for the tenant, or `null` when none has been built. */
  treeRoot: TreeIndexNode | null;
  /** Raw `graph_edges` rows. Untyped on purpose: the collection's JSON Schema pins only
   * `_id/tenantId/from/to/type` and allows extra properties, so every other field is read
   * defensively rather than trusted. */
  entityEdges: readonly Record<string, unknown>[];
  sessions: readonly KnowledgeGraphSessionRef[];
}

const KNOWN_KINDS = new Set<string>(["session", "topic", "org", "person", "country", "date", "month", "user"]);
const DATE_LIKE = /^\d{4}-\d{2}(-\d{2})?$/;

function kindOf(id: string): KnowledgeGraphNodeKind {
  const prefix = id.slice(0, id.indexOf(":"));
  return KNOWN_KINDS.has(prefix) ? (prefix as KnowledgeGraphNodeKind) : "other";
}

/** `<kind>:<slug>` -> `<slug>`. Entity ids never nest a second colon today; if one ever does, the
 * whole remainder is kept rather than truncated. */
function refOf(id: string): string {
  const idx = id.indexOf(":");
  return idx === -1 ? id : id.slice(idx + 1);
}

/** A readable fallback label — `country:hungary` -> "Hungary". This is FORMATTING of an id we
 * already have, not invented content: no label is ever guessed from something the data does not
 * say. Date-shaped refs are left verbatim (a "2026-09-24" reads worse title-cased). */
function humanise(ref: string): string {
  if (DATE_LIKE.test(ref)) return ref;
  const words = ref.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return ref;
  return words.map((w) => (/^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function readEvidence(v: unknown, sessionId: string | undefined): KnowledgeGraphEvidence[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: KnowledgeGraphEvidence[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const turnId = str(row.turnId);
    if (!turnId) continue;
    const ev: KnowledgeGraphEvidence = { turnId };
    const sid = str(row.sessionId) ?? sessionId;
    if (sid) ev.sessionId = sid;
    const tStart = num(row.tStart);
    if (tStart !== undefined) ev.tStart = tStart;
    const occurredAt = str(row.occurredAt);
    if (occurredAt) ev.occurredAt = occurredAt;
    out.push(ev);
  }
  return out.length > 0 ? out : undefined;
}

/** The tree half emits bare slugs (`visas`) and a sessionRef as the session id; canonicalise both
 * into `<kind>:<slug>` so a topic named in `tree_index` and the same topic named in `graph_edges`
 * land on ONE node instead of two. */
function canonicalTreeId(n: TreeGraphNode): string {
  return `${n.kind}:${n.id}`;
}

class NodeAccumulator {
  private readonly nodes = new Map<string, KnowledgeGraphNode>();

  add(id: string, source: KnowledgeGraphSource, label?: string): void {
    const existing = this.nodes.get(id);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (label && existing.label === humanise(existing.ref ?? id)) existing.label = label;
      return;
    }
    const ref = refOf(id);
    this.nodes.set(id, { id, label: label ?? humanise(ref), kind: kindOf(id), ref, sources: [source] });
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Re-label session nodes from the real `sessions` documents — the graph's own sources carry a
   * title for tree sessions but only an id for edge-only ones ([C6]'s acceptance case). */
  relabelSession(id: string, title: string): void {
    const n = this.nodes.get(id);
    if (n) n.label = title;
  }

  values(): KnowledgeGraphNode[] {
    return [...this.nodes.values()];
  }
}

export function buildKnowledgeGraph(input: BuildKnowledgeGraphInput): KnowledgeGraph {
  const nodes = new NodeAccumulator();
  const edges = new Map<string, KnowledgeGraphEdge>();
  let treeEdgeCount = 0;
  let entityEdgeCount = 0;

  function addEdge(edge: KnowledgeGraphEdge): void {
    const key = `${edge.source}|${edge.target}|${edge.type}`;
    if (!edges.has(key)) edges.set(key, edge);
  }

  // --- tree half (unchanged flattener, canonicalised ids) -------------------------------------
  if (input.treeRoot) {
    const tree = flattenTreeToGraph(input.treeRoot);
    const canonical = new Map<string, string>();
    for (const n of tree.nodes) {
      const id = canonicalTreeId(n);
      canonical.set(n.id, id);
      nodes.add(id, "tree_index", n.label);
    }
    for (const e of tree.edges) {
      const source = canonical.get(e.source);
      const target = canonical.get(e.target);
      if (!source || !target) continue;
      addEdge({ source, target, type: e.kind, inferred: e.inferred, origin: "tree_index" });
      treeEdgeCount++;
    }
  }

  // --- entity half (the 94 real `graph_edges` rows) -------------------------------------------
  for (const raw of input.entityEdges) {
    const from = str(raw.from);
    const to = str(raw.to);
    const type = str(raw.type);
    if (!from || !to || !type) continue; // a row missing its required fields is skipped, not faked
    const confidence = num(raw.confidence);
    const sessionRef = str(raw.sessionRef);
    nodes.add(from, "graph_edges");
    nodes.add(to, "graph_edges");
    const edge: KnowledgeGraphEdge = {
      source: from, target: to, type,
      // [C4]: anything below full confidence is keyword-derived, not an asserted fact.
      inferred: confidence !== undefined && confidence < 1,
      origin: "graph_edges",
    };
    if (confidence !== undefined) edge.confidence = confidence;
    const weight = num(raw.weight);
    if (weight !== undefined) edge.weight = weight;
    if (sessionRef) edge.sessionRef = sessionRef;
    const evidence = readEvidence(raw.evidence, sessionRef);
    if (evidence) edge.evidence = evidence;
    const before = edges.size;
    addEdge(edge);
    if (edges.size > before) entityEdgeCount++;
  }

  // --- labels + staleness ([C6]/[C7]) ---------------------------------------------------------
  const sessionsMissing: { id: string; title: string }[] = [];
  let sessionsInGraph = 0;
  for (const s of input.sessions) {
    const id = `session:${s._id}`;
    if (nodes.has(id)) {
      sessionsInGraph++;
      if (s.title) nodes.relabelSession(id, s.title);
    } else {
      sessionsMissing.push({ id: s._id, title: s.title ?? s._id });
    }
  }

  return {
    nodes: nodes.values(),
    edges: [...edges.values()],
    stats: {
      sessionsTotal: input.sessions.length,
      sessionsInGraph,
      sessionsMissing,
      edgeSources: { treeIndex: treeEdgeCount, entityEdges: entityEdgeCount },
    },
  };
}
