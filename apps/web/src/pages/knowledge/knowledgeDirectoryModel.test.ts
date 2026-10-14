import { expect, test } from "vitest";
import { buildKnowledgeDirectory } from "./knowledgeDirectoryModel.js";
import { directoryGraph as graph, directorySessions as sessions, directorySources as sources } from "./knowledgeDirectoryFixtures.js";

test("returned evidence preserves source ids and exact encoded downstream anchors", () => {
  const model = buildKnowledgeDirectory(sessions, sources, graph, "topic:career");
  expect(model.selected?.label).toBe("Careers");
  expect(model.relationships[0]?.evidence[0]?.href).toBe("/sessions/session%2Fone#turn-turn%20%2F%23one");
  expect(model.relationships[0]?.edge).toBe(graph.edges[0]);
  expect(model.missingGraphSessions).toBe(1);
  expect(model.resources[0]).not.toHaveProperty("path");
  expect(model.collections[0]?.label).toBe("2026-10");
});
test("session endpoint provides an unambiguous evidence binding without inventing a turn", () => {
  const model = buildKnowledgeDirectory(sessions, sources, graph, "session:one");
  expect(model.relationships[0]?.evidence[0]?.href).toBe("/sessions/session%2Fone#turn-turn-2");
});
test.each(["conflicting", "unknown", "missing", "contradictory endpoint"])("%s evidence bindings remain unlinked", caseName => {
  const changed = structuredClone(graph);
  const edge = changed.edges[0]!;
  if (caseName === "conflicting") edge.evidence![0]!.sessionId = "foreign";
  if (caseName === "unknown") { edge.sessionRef = "foreign"; edge.evidence![0]!.sessionId = "foreign"; }
  if (caseName === "missing") { delete edge.sessionRef; delete edge.evidence![0]!.sessionId; }
  if (caseName === "contradictory endpoint") { edge.target = "session:one"; changed.nodes[2]!.ref = "foreign"; }
  expect(buildKnowledgeDirectory(sessions, sources, changed, "topic:career").relationships[0]?.evidence[0]?.href).toBeNull();
});
test("missing node references never become invented neighbors", () => {
  const changed = structuredClone(graph); changed.edges[0]!.target = "absent";
  expect(buildKnowledgeDirectory(sessions, sources, changed, "topic:career").relationships[0]?.neighbour).toBeNull();
  expect(buildKnowledgeDirectory(sessions, sources, graph, "absent").selectionMissing).toBe(true);
});
test.each(["javascript:alert(1)", "//example.com/", "https://user:pass@example.com/x", " https://example.com/"])("unsafe resource URL %s is inert", url => {
  expect(buildKnowledgeDirectory(sessions, [{ ...sources[0]!, url }], graph).resources[0]?.href).toBeNull();
});
test("invalid recorded dates stay separate; source objects remain unchanged", () => {
  const original = JSON.stringify([sessions, sources, graph]);
  const model = buildKnowledgeDirectory([{ ...sessions[0]!, date: "2026-02-30" }], sources, graph);
  expect(model.collections[0]?.label).toBe("Date unavailable");
  expect(JSON.stringify([sessions, sources, graph])).toBe(original);
});
test("month collections retain recorded local dates across timezone boundaries", () => {
  expect(buildKnowledgeDirectory([{ ...sessions[0]!, date: "2026-10-01T00:30:00+05:30" }], sources, graph).collections[0]?.label).toBe("2026-10");
});
test.each(["nodes", "confidence", "timing", "duplicate sessions", "source url", "stats"])("malformed %s refuses the entire view", field => {
  const changed = structuredClone(graph); const changedSessions = structuredClone(sessions); const changedSources = structuredClone(sources);
  if (field === "nodes") changed.nodes = null as never;
  if (field === "confidence") changed.edges[0]!.confidence = NaN;
  if (field === "timing") changed.edges[0]!.evidence![0]!.tStart = -1;
  if (field === "duplicate sessions") changedSessions.push(changedSessions[0]!);
  if (field === "source url") changedSources[0]!.url = 123 as never;
  if (field === "stats") changed.stats = null as never;
  expect(() => buildKnowledgeDirectory(changedSessions, changedSources, changed)).toThrow("Invalid knowledge directory response");
});
