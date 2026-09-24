/**
 * packages/index/src/graph/build-graph.test.ts — U-BRAIN [C1]/[C2]/[C4]/[C6]/[C7].
 *
 * These are written against the REAL shapes: the tree half is a `tree_index` root exactly as
 * `buildTree` emits it, and the entity half is a `graph_edges` row exactly as
 * `scripts/webinar/sync-session.mjs:67-107` writes it (`from`/`to`/`type`, NOT `kind`, with
 * `evidence[].turnId`, `confidence`, `sessionRef`). The union is the whole point of the unit:
 * before it, `GET /graph` read `tree_index` only and the 94 real `graph_edges` rows were read by
 * no route at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import { buildKnowledgeGraph } from "./build-graph.js";

function node(nodeId: string, title: string, level: TreeIndexNode["level"], children: TreeIndexNode[] = [], evidence?: TreeIndexNode["evidence"]): TreeIndexNode {
  const n: TreeIndexNode = { node_id: nodeId, title, level, summary: "", children };
  if (evidence) n.evidence = evidence;
  return n;
}

const TREE = node("tenant:toc", "toc", "tenant", [
  node("toc/session:s1", "Session One", "session", [
    node("toc/session:s1/topic:visas", "Visas", "topic"),
    node("toc/session:s1/org:toc-org", "TOC", "org"),
  ], { sessionRef: "s1" }),
]);

const WEBINAR_EDGES = [
  { from: "session:zoho-2026", to: "date:2026-09-24", type: "held_on", weight: 1, confidence: 1, sessionRef: "zoho-2026", date: "2026-09-24", evidence: [] },
  { from: "person:anita", to: "session:zoho-2026", type: "spoke_in", weight: 12, confidence: 1, sessionRef: "zoho-2026", evidence: [{ turnId: "t-7", tStart: 30 }] },
  { from: "session:zoho-2026", to: "country:hungary", type: "covers", weight: 3, confidence: 0.8, sessionRef: "zoho-2026", evidence: [{ turnId: "t-9", tStart: 61 }] },
  { from: "person:anita", to: "topic:scholarships", type: "discussed", weight: 2, confidence: 0.7, sessionRef: "zoho-2026", evidence: [{ turnId: "t-11" }] },
];

test("[C1] nodes and edges come from BOTH tree_index and graph_edges in one payload", () => {
  const g = buildKnowledgeGraph({ treeRoot: TREE, entityEdges: WEBINAR_EDGES, sessions: [] });
  assert.ok(g.nodes.some((n) => n.id === "session:s1"), "tree session node present");
  assert.ok(g.nodes.some((n) => n.id === "topic:visas"), "tree topic node present");
  assert.ok(g.nodes.some((n) => n.id === "session:zoho-2026"), "graph_edges session node present");
  assert.ok(g.edges.some((e) => e.type === "session-topic"), "tree edge present");
  assert.ok(g.edges.some((e) => e.type === "spoke_in"), "graph_edges edge present");
  assert.equal(g.stats.edgeSources.treeIndex, 2);
  assert.equal(g.stats.edgeSources.entityEdges, 4);
});

test("[C1] every node carries {id,label,kind} and kind covers session|topic|org|person|country|date", () => {
  const g = buildKnowledgeGraph({ treeRoot: TREE, entityEdges: WEBINAR_EDGES, sessions: [] });
  for (const n of g.nodes) {
    assert.equal(typeof n.id, "string");
    assert.ok(n.label.length > 0, `node ${n.id} must carry a non-empty label (C2 renders one <text> per node)`);
    assert.ok(n.kind.length > 0);
  }
  const kinds = new Set(g.nodes.map((n) => n.kind));
  for (const k of ["session", "topic", "org", "person", "country", "date"]) {
    assert.ok(kinds.has(k as never), `expected a ${k} node`);
  }
});

test("[C1] every edge carries {source,target,type,inferred}", () => {
  const g = buildKnowledgeGraph({ treeRoot: TREE, entityEdges: WEBINAR_EDGES, sessions: [] });
  for (const e of g.edges) {
    assert.ok(g.nodes.some((n) => n.id === e.source), `edge source ${e.source} must be a node`);
    assert.ok(g.nodes.some((n) => n.id === e.target), `edge target ${e.target} must be a node`);
    assert.equal(typeof e.type, "string");
    assert.equal(typeof e.inferred, "boolean");
  }
});

test("[C4] confidence < 1 is flagged inferred; confidence 1 is not", () => {
  const g = buildKnowledgeGraph({ treeRoot: null, entityEdges: WEBINAR_EDGES, sessions: [] });
  const spokeIn = g.edges.find((e) => e.type === "spoke_in")!;
  const covers = g.edges.find((e) => e.type === "covers")!;
  assert.equal(spokeIn.inferred, false, "confidence 1 is a literal asserted row");
  assert.equal(covers.inferred, true, "confidence 0.8 is keyword-derived, not literal");
  assert.equal(covers.confidence, 0.8);
});

test("[I2] no edge is invented — edge count equals tree edges + distinct entity rows", () => {
  const g = buildKnowledgeGraph({ treeRoot: TREE, entityEdges: WEBINAR_EDGES, sessions: [] });
  assert.equal(g.edges.length, 2 + WEBINAR_EDGES.length);
});

test("[C3] evidence turnIds survive onto the wire edge, with the session they belong to", () => {
  const g = buildKnowledgeGraph({ treeRoot: null, entityEdges: WEBINAR_EDGES, sessions: [] });
  const spokeIn = g.edges.find((e) => e.type === "spoke_in")!;
  assert.equal(spokeIn.sessionRef, "zoho-2026");
  assert.deepEqual(spokeIn.evidence?.map((ev) => ev.turnId), ["t-7"]);
});

test("[C6] a session present ONLY in graph_edges still reaches the graph, labelled from sessions", () => {
  const g = buildKnowledgeGraph({
    treeRoot: TREE,
    entityEdges: WEBINAR_EDGES,
    sessions: [
      { _id: "s1", title: "Session One", date: "2026-04-21" },
      { _id: "zoho-2026", title: "Zoho: Next European Study Destinations", date: "2026-09-24" },
    ],
  });
  const zoho = g.nodes.find((n) => n.id === "session:zoho-2026");
  assert.ok(zoho, "the tree-less session must still be a node — this is the 2026-09-24 acceptance case");
  assert.equal(zoho!.label, "Zoho: Next European Study Destinations");
  assert.equal(zoho!.ref, "zoho-2026", "ref carries the raw sessionId so the UI can deep-link");
});

test("[C7] a session in `sessions` but in neither source is reported as missing, not hidden", () => {
  const g = buildKnowledgeGraph({
    treeRoot: TREE,
    entityEdges: [],
    sessions: [
      { _id: "s1", title: "Session One", date: "2026-04-21" },
      { _id: "ghost", title: "Never Indexed", date: "2026-09-01" },
    ],
  });
  assert.equal(g.stats.sessionsTotal, 2);
  assert.equal(g.stats.sessionsInGraph, 1);
  assert.deepEqual(g.stats.sessionsMissing, [{ id: "ghost", title: "Never Indexed" }]);
});

test("[C8] no tree and no edges builds an empty-but-honest graph rather than throwing", () => {
  const g = buildKnowledgeGraph({ treeRoot: null, entityEdges: [], sessions: [{ _id: "s1", title: "S1", date: "2026-01-01" }] });
  assert.deepEqual(g.nodes, []);
  assert.deepEqual(g.edges, []);
  assert.equal(g.stats.sessionsMissing.length, 1);
});

test("the same entity in both sources is ONE node, tagged with both sources", () => {
  const g = buildKnowledgeGraph({
    treeRoot: TREE,
    entityEdges: [{ from: "session:s1", to: "topic:visas", type: "covers", confidence: 0.8, sessionRef: "s1", evidence: [{ turnId: "t-1" }] }],
    sessions: [],
  });
  assert.equal(g.nodes.filter((n) => n.id === "session:s1").length, 1);
  const s1 = g.nodes.find((n) => n.id === "session:s1")!;
  assert.deepEqual([...s1.sources].sort(), ["graph_edges", "tree_index"]);
});

test("duplicate graph_edges rows collapse to one edge (idempotent re-sync is not a denser graph)", () => {
  const row = { from: "person:anita", to: "session:zoho-2026", type: "spoke_in", confidence: 1, sessionRef: "zoho-2026", evidence: [{ turnId: "t-7" }] };
  const g = buildKnowledgeGraph({ treeRoot: null, entityEdges: [row, { ...row }], sessions: [] });
  assert.equal(g.edges.length, 1);
});

test("labels for entity nodes are humanised from the id, never invented", () => {
  const g = buildKnowledgeGraph({ treeRoot: null, entityEdges: WEBINAR_EDGES, sessions: [] });
  assert.equal(g.nodes.find((n) => n.id === "country:hungary")!.label, "Hungary");
  assert.equal(g.nodes.find((n) => n.id === "date:2026-09-24")!.label, "2026-09-24");
  assert.equal(g.nodes.find((n) => n.id === "person:anita")!.label, "Anita");
});

test("a malformed graph_edges row (missing from/to) is skipped, not rendered as a broken node", () => {
  const g = buildKnowledgeGraph({
    treeRoot: null,
    entityEdges: [{ from: "person:x", type: "spoke_in" } as unknown as Record<string, unknown>, { from: "person:y", to: "session:z", type: "spoke_in" }],
    sessions: [],
  });
  assert.equal(g.edges.length, 1);
  assert.ok(!g.nodes.some((n) => n.id === "person:x"));
});
