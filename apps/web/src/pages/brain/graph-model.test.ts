/**
 * apps/web/src/pages/brain/graph-model.test.ts — U-BRAIN [C3]/[C5]/[I4], on the pure helpers.
 */
import { describe, test, expect } from "vitest";
import type { Graph } from "../../api/types.js";
import {
  activeFilterCount, evidenceFor, evidenceHref, filterGraph, highestDegreeSubgraph, neighboursByType,
} from "./graph-model.js";

const GRAPH: Graph = {
  nodes: [
    { id: "session:s1", label: "Study in Hungary", kind: "session", ref: "s1", sources: ["tree_index", "graph_edges"] },
    { id: "topic:scholarships", label: "Scholarships", kind: "topic", ref: "scholarships", sources: ["tree_index"] },
    { id: "person:anita", label: "Anita", kind: "person", ref: "anita", sources: ["graph_edges"] },
    { id: "country:hungary", label: "Hungary", kind: "country", ref: "hungary", sources: ["graph_edges"] },
    { id: "session:s2", label: "Unrelated Session", kind: "session", ref: "s2", sources: ["tree_index"] },
  ],
  edges: [
    { source: "session:s1", target: "topic:scholarships", type: "session-topic", inferred: false, origin: "tree_index" },
    { source: "person:anita", target: "session:s1", type: "spoke_in", inferred: false, confidence: 1, sessionRef: "s1", evidence: [{ turnId: "t-7", sessionId: "s1" }], origin: "graph_edges" },
    { source: "session:s1", target: "country:hungary", type: "covers", inferred: true, confidence: 0.8, sessionRef: "s1", evidence: [{ turnId: "t-9" }], origin: "graph_edges" },
  ],
  stats: { sessionsTotal: 2, sessionsInGraph: 2, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 2 } },
};

describe("neighboursByType [C3]", () => {
  test("groups every neighbour by edge type and keeps the direction", () => {
    const groups = neighboursByType(GRAPH, "session:s1");
    expect([...groups.keys()].sort()).toEqual(["covers", "session-topic", "spoke_in"]);
    expect(groups.get("spoke_in")![0]!.node.id).toBe("person:anita");
    expect(groups.get("spoke_in")![0]!.direction).toBe("in");
    expect(groups.get("covers")![0]!.direction).toBe("out");
  });

  test("a topic reaches its session, which is what makes topic -> speaker -> session navigable", () => {
    const groups = neighboursByType(GRAPH, "topic:scholarships");
    expect(groups.get("session-topic")![0]!.node.id).toBe("session:s1");
  });

  test("a node with no edges yields no groups rather than throwing", () => {
    expect(neighboursByType(GRAPH, "session:s2").size).toBe(0);
  });
});

describe("evidence links [C3]", () => {
  test("resolve to a real turn anchor on the session page", () => {
    const edge = GRAPH.edges[1]!;
    expect(evidenceHref(edge, edge.evidence![0]!)).toBe("/sessions/s1#turn-t-7");
  });

  test("fall back to the edge's own sessionRef when the evidence row omits sessionId", () => {
    const edge = GRAPH.edges[2]!;
    expect(evidenceHref(edge, edge.evidence![0]!)).toBe("/sessions/s1#turn-t-9");
  });

  test("return null — not a dead link — when nothing names a session", () => {
    expect(evidenceHref({ source: "a", target: "b", type: "x", inferred: false, origin: "graph_edges" }, { turnId: "t-1" })).toBeNull();
  });

  test("evidenceFor de-duplicates by turn across a node's edges", () => {
    const all = [...neighboursByType(GRAPH, "session:s1").values()].flat();
    expect(evidenceFor(all).map((e) => e.evidence.turnId).sort()).toEqual(["t-7", "t-9"]);
  });
});

describe("filterGraph [C5]", () => {
  test("no filters is the identity", () => {
    const out = filterGraph(GRAPH, { kinds: new Set(), sessionId: null, query: "" });
    expect(out.nodes).toHaveLength(5);
    expect(out.edges).toHaveLength(3);
  });

  test("kind filter is strict and drops edges whose endpoint left", () => {
    const out = filterGraph(GRAPH, { kinds: new Set(["person"]), sessionId: null, query: "" });
    expect(out.nodes.map((n) => n.id)).toEqual(["person:anita"]);
    expect(out.edges).toHaveLength(0);
  });

  test("session filter keeps that session's subgraph only", () => {
    const out = filterGraph(GRAPH, { kinds: new Set(), sessionId: "session:s1", query: "" });
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["country:hungary", "person:anita", "session:s1", "topic:scholarships"]);
    expect(out.nodes.some((n) => n.id === "session:s2")).toBe(false);
  });

  test("label search keeps matches AND their direct neighbours so the match has context", () => {
    const out = filterGraph(GRAPH, { kinds: new Set(), sessionId: null, query: "hungary" });
    // "Study in Hungary" (session) and "Hungary" (country) both match; the edge between them
    // survives, and the unrelated session does not.
    expect(out.nodes.some((n) => n.id === "country:hungary")).toBe(true);
    expect(out.nodes.some((n) => n.id === "session:s2")).toBe(false);
    expect(out.edges.some((e) => e.type === "covers")).toBe(true);
  });

  test("search is case-insensitive and can produce an empty result", () => {
    expect(filterGraph(GRAPH, { kinds: new Set(), sessionId: null, query: "ANITA" }).nodes.length).toBeGreaterThan(0);
    expect(filterGraph(GRAPH, { kinds: new Set(), sessionId: null, query: "zzzz" }).nodes).toHaveLength(0);
  });

  test("filters combine: session + kind", () => {
    const out = filterGraph(GRAPH, { kinds: new Set(["country"]), sessionId: "session:s1", query: "" });
    expect(out.nodes.map((n) => n.id)).toEqual(["country:hungary"]);
  });

  test("activeFilterCount counts each applied filter once", () => {
    expect(activeFilterCount({ kinds: new Set(), sessionId: null, query: "  " })).toBe(0);
    expect(activeFilterCount({ kinds: new Set(["person"]), sessionId: "session:s1", query: "x" })).toBe(3);
  });
});

describe("highestDegreeSubgraph [I4]", () => {
  test("is a no-op under the ceiling", () => {
    expect(highestDegreeSubgraph(GRAPH.nodes, GRAPH.edges, 400).nodes).toHaveLength(5);
  });

  test("past the ceiling keeps the most connected nodes, not an arbitrary prefix", () => {
    const out = highestDegreeSubgraph(GRAPH.nodes, GRAPH.edges, 2);
    expect(out.nodes[0]!.id).toBe("session:s1");
    expect(out.nodes).toHaveLength(2);
    expect(out.edges.every((e) => out.nodes.some((n) => n.id === e.source) && out.nodes.some((n) => n.id === e.target))).toBe(true);
  });
});
