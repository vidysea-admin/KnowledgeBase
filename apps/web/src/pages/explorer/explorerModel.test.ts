import { expect, test } from "vitest";
import type { Graph } from "../../api/types.js";
import { buildExplorer } from "./explorerModel.js";
import { sessions, graph } from "./explorerFixtures.js";
test("exact calendar dates produce nested years/months, invalid/missing dates never guessed from titles", () => {
  const result = buildExplorer([...sessions, { ...sessions[0]!, _id: "leap", date: "2024-02-29" }, { ...sessions[0]!, _id: "missing", title: "2026-08-01", date: "" }], graph);
  expect(result.years.map(year => year.year)).toEqual(["2026", "2025", "2024"]);
  expect(result.years[0]?.months[0]?.sessions[0]?._id).toBe("s/1");
  expect(result.undated.map(session => session._id)).toEqual(["s3", "missing"]);
  expect(result.sessionsCount).toBe(5);
});
test("selected session includes only direct or explicit provenance-bound graph entities; no transitive leakage", () => {
  const result = buildExplorer(sessions, graph, "s/1");
  expect(result.topics.map(node => node.id)).toEqual(["topic:one"]);
  expect(result.speakers.map(node => node.id)).toEqual(["person:one"]);
  expect(result.orgs.map(node => node.id)).toEqual(["org:one"]);
  expect(result.links).toHaveLength(3);
  expect(buildExplorer(sessions, graph, "s3").topics).toEqual([]);
  expect(buildExplorer(sessions, graph).topics).toHaveLength(2);
});
test("model preserves source records and refuses poisoned, duplicate or unknown selection inputs", () => {
  const before = JSON.stringify({ sessions, graph }); buildExplorer(sessions, graph); expect(JSON.stringify({ sessions, graph })).toBe(before);
  expect(() => buildExplorer([...sessions, sessions[0]!], graph)).toThrow();
  expect(() => buildExplorer(sessions, { ...graph, edges: null } as unknown as Graph)).toThrow();
  expect(() => buildExplorer(sessions, graph, "foreign")).toThrow();
});
test("conflicting explicit session provenance cannot leak through a direct node edge", () => {
  const conflict = { ...graph, edges: [...graph.edges, { source: "session:first", target: "topic:other", type: "conflict", inferred: false, origin: "graph_edges" as const, sessionRef: "s2" }] };
  expect(buildExplorer(sessions, conflict, "s/1").topics.map(node => node.id)).toEqual(["topic:one"]);
  expect(buildExplorer([{ ...sessions[0]!, date: "2026-07-30Tgarbage" }], graph).undated).toHaveLength(1);
});
