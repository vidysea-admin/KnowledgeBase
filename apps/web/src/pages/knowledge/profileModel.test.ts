import { expect, test } from "vitest";
import type { Graph, SessionSummary } from "../../api/types.js";
import type { ClaimListRow } from "../../api/claims.js";
import { buildProfile, owningSession, themeCollections } from "./profileModel.js";

const st = { transcribe: "done", index: "done" };
const sessions: SessionSummary[] = [{ _id: "s1", title: "Admissions webinar", date: "2026-10-01", status: st }, { _id: "s2", title: "Other", date: "2026-09-01", status: st }];
const graph: Graph = {
  nodes: [
    { id: "topic:study-abroad", label: "Study abroad", kind: "topic", sources: ["graph_edges"] },
    { id: "person:a", label: "Asha", kind: "person", sources: ["graph_edges"] },
    { id: "session:s1", label: "Admissions webinar", kind: "session", ref: "s1", sources: ["tree_index"] },
  ],
  edges: [
    { source: "person:a", target: "topic:study-abroad", type: "discussed", inferred: true, confidence: 0.6, origin: "graph_edges", sessionRef: "s1", evidence: [{ turnId: "t1", tStart: 5 }, { turnId: "t2", sessionId: "s2" }] },
    { source: "topic:study-abroad", target: "session:s1", type: "in", inferred: false, origin: "tree_index", evidence: [{ turnId: "t9", sessionId: "s-unknown" }] },
  ],
  stats: { sessionsTotal: 2, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 1 } },
};
const claim = (topicRefs: string[]): ClaimListRow => ({ _id: "c1", text: "Deadline is March", status: "verified", topicRefs, evidence: [{ turnId: "t1", sessionId: "s1", sessionTitle: "Admissions webinar" }] });

test("conflicting or unknown ownership withholds evidence; only the single known session links", () => {
  const p = buildProfile(sessions, graph, [], "person:a", ["person"])!;
  expect(p.evidence.map(e => `${e.sessionId}/${e.turnId}`)).toEqual(["s1/t1"]);
  expect(p.unresolvedEvidence).toBe(1);
  expect(p.evidence[0]).toMatchObject({ inferred: true, confidence: 0.6, origin: "graph_edges", tStart: 5 });
  expect(owningSession(graph, new Set(["s1"]), graph.edges[1]!, graph.edges[1]!.evidence![0])).toBeNull();
});
test("topic claims match by slug after last colon (tenant-namespaced); speakers get no claims", () => {
  expect(buildProfile(sessions, graph, [claim(["topic:study-abroad"])], "topic:study-abroad", ["topic"])!.claims).toHaveLength(1);
  expect(buildProfile(sessions, graph, [claim(["toc:study-abroad"])], "topic:study-abroad", ["topic"])!.claims).toHaveLength(1);
  expect(buildProfile(sessions, graph, [claim(["toc:study-abroad-x"])], "topic:study-abroad", ["topic"])!.claims).toHaveLength(0);
  expect(buildProfile(sessions, graph, [claim(["person:a"])], "person:a", ["person"])!.claims).toHaveLength(0);
});
test("wrong kind or missing node returns null; sessions link only when unambiguous", () => {
  expect(buildProfile(sessions, graph, [], "person:a", ["topic"])).toBeNull();
  expect(buildProfile(sessions, graph, [], "nope", ["topic"])).toBeNull();
  expect(buildProfile(sessions, graph, [], "topic:study-abroad", ["topic"])!.sessions.map(s => s._id)).toEqual(["s1"]);
});
test("theme collections are label-match lenses with only returned sessions", () => {
  const themes = themeCollections(sessions, graph);
  const abroad = themes.find(t => t.label === "Study abroad")!;
  expect(abroad.topics.map(t => t.id)).toEqual(["topic:study-abroad"]);
  expect(abroad.sessions.map(s => s._id)).toEqual(["s1"]);
  expect(themes.find(t => t.label === "Admissions")!.sessions).toEqual([]);
});
