import { expect, test } from "vitest";
import { displayConfidenceGraph, filterConfidenceGraph, parseMinimumConfidence } from "./confidenceModel.js";
import { graph } from "./confidenceFixtures.js";

test("inclusive threshold uses relationship scores and preserves evidence/provenance without mutating source", () => {
  const before = JSON.stringify(graph), filtered = filterConfidenceGraph(graph, 0.8);
  expect(filtered.edges).toEqual(graph.edges.slice(0, 2));
  expect(filtered.edges[1]).toBe(graph.edges[1]);
  expect(filtered.nodes.map(node => node.id)).toEqual(["session:s/1", "person:one", "topic:high"]);
  expect(filtered).toMatchObject({ recorded: 3, missing: 1, invalid: 1 });
  expect(JSON.stringify(graph)).toBe(before);
  expect(filterConfidenceGraph(graph, 0.8001).edges).toEqual([graph.edges[0]]);
  expect(filterConfidenceGraph(graph, null).edges).toEqual(graph.edges);
});
test("zero/one bounds do not replace absent, invalid, nonfinite or string scores with defaults", () => {
  const input = { ...graph, edges: [0, 1, undefined, null, -0.1, 1.01, NaN, Infinity, "0.9"].map((confidence, i) => ({ ...graph.edges[0]!, type: `case-${i}`, confidence })) } as unknown as typeof graph;
  expect(filterConfidenceGraph(input, 0).edges.map(edge => edge.confidence)).toEqual([0, 1]);
  expect(filterConfidenceGraph(input, 1).edges.map(edge => edge.confidence)).toEqual([1]);
  expect(filterConfidenceGraph(input, null)).toMatchObject({ recorded: 2, missing: 1, invalid: 6 });
});
test("empty and disconnected graphs remain truthful; node metadata is never a relationship score", () => {
  const input = { ...graph, nodes: graph.nodes.map(node => ({ ...node, confidence: 1 })), edges: [] };
  expect(filterConfidenceGraph(input, 0)).toMatchObject({ nodes: [], edges: [], disconnected: 6 });
});
test("layout cap preserves exactly displayed edge endpoints and cannot retain hidden inspector neighbours", () => {
  const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `topic:${i}`, label: String(i), kind: "topic" as const, sources: ["graph_edges" as const] }));
  const edges = [0, 2, 4].map(i => ({ source: `topic:${i}`, target: `topic:${i + 1}`, type: "paired", inferred: false, origin: "graph_edges" as const, confidence: 1 }));
  const filtered = filterConfidenceGraph({ ...graph, nodes, edges }, 1), shown = displayConfidenceGraph(filtered, 3);
  expect(filtered.edges).toHaveLength(3); expect(shown.edges).toHaveLength(1);
  expect(shown.nodes.map(node => node.id)).toEqual(["topic:0", "topic:1"]);
  expect(shown.nodes.every(node => shown.edges.some(edge => edge.source === node.id || edge.target === node.id))).toBe(true);
});
test("threshold URL parsing accepts finite decimals only; invalid input and malformed graph fail closed", () => {
  expect(parseMinimumConfidence("0.80")).toBe(0.8); expect(parseMinimumConfidence(null)).toBeNull();
  for (const value of ["-1", "1.001", "NaN", "Infinity", "0x1", "1e-1", "private"]) expect(() => parseMinimumConfidence(value)).toThrow();
  expect(() => filterConfidenceGraph({ ...graph, nodes: null } as unknown as typeof graph, 0)).toThrow();
  expect(() => filterConfidenceGraph({ ...graph, edges: [{ ...graph.edges[0]!, target: "missing" }] }, 0)).toThrow();
});
