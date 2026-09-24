/**
 * packages/index/src/graph/types.ts — the WIRE shape of `GET /graph` after U-BRAIN.
 *
 * Distinct from `tree/flatten-graph.ts`'s `Graph`, which stays exactly as it was: that one is the
 * tree half's internal shape (bare slugs, an edge `kind`), this one is the tenant's whole
 * knowledge graph (canonical prefixed ids, an edge `type`, provenance, evidence and staleness
 * stats). Keeping them as two types is deliberate — the tree flattener's contract and its tests
 * are untouched by the union, and `lint-dupes` keeps one exported name per concept.
 *
 * Canonical node ids are ALWAYS `<kind>:<slug>` (`session:2026-09-24-zoho…`, `topic:visas`,
 * `person:anita`). `graph_edges` rows already use exactly that convention
 * (`scripts/webinar/sync-session.mjs:66-82`); the tree half's bare slugs are lifted into it by
 * `build-graph.ts`, which is what makes the two sources merge into one node instead of two.
 */

/** Prefix vocabulary in the real data today. `other` is the honest bucket for an unknown prefix —
 * a new edge kind must show up as a visible node, never be dropped for not being enumerated. */
export type KnowledgeGraphNodeKind =
  | "session" | "topic" | "org" | "person" | "country" | "date" | "month" | "user" | "other";

/** Where a node/edge was observed. Rendered in the UI so "real row" vs "tree structure" is never
 * a guess the reader has to make. */
export type KnowledgeGraphSource = "tree_index" | "graph_edges";

/** A pointer back into the transcript. `turnId` is the only required part (H3: no fact without
 * provenance); `sessionId` is filled from the owning edge's `sessionRef` so the UI can build
 * `/sessions/<id>#turn-<turnId>` without a second lookup. */
export interface KnowledgeGraphEvidence {
  turnId: string;
  sessionId?: string;
  tStart?: number;
  occurredAt?: string;
}

export interface KnowledgeGraphNode {
  /** Canonical `<kind>:<slug>`. */
  id: string;
  label: string;
  kind: KnowledgeGraphNodeKind;
  /** The raw underlying entity id (a `sessionId` for `kind: "session"`), for deep links. */
  ref?: string;
  sources: KnowledgeGraphSource[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  /** `graph_edges.type` verbatim (`held_on`, `spoke_in`, `covers`, `discussed`, …) or the tree
   * half's structural kind (`session-topic`, `session-org`, `topic-cooccurrence`). */
  type: string;
  /** True when this edge is DERIVED rather than asserted — tree co-occurrence, or any row whose
   * own `confidence` is below 1 (the keyword-regex `covers`/`discussed` rows). Never a styling
   * choice: [I2] forbids presenting a derived edge as a literal one. */
  inferred: boolean;
  confidence?: number;
  weight?: number;
  sessionRef?: string;
  evidence?: KnowledgeGraphEvidence[];
  origin: KnowledgeGraphSource;
}

/** [C7] — what the graph does NOT contain, stated with a count instead of rendering a graph that
 * looks complete. */
export interface KnowledgeGraphStats {
  sessionsTotal: number;
  sessionsInGraph: number;
  sessionsMissing: { id: string; title: string }[];
  edgeSources: { treeIndex: number; entityEdges: number };
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: KnowledgeGraphStats;
}
