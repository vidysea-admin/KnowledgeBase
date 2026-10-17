import type { Graph, SessionSummary } from "../../api/types.js";
export const sessions: SessionSummary[] = [
  { _id: "s/1", title: "First", date: "2026-07-30", status: { transcribe: "done", index: "done" } },
  { _id: "s2", title: "Second", date: "2025-02-28", status: { transcribe: "done", index: "pending" } },
  { _id: "s3", title: "Unknown date", date: "2026-02-30", status: { transcribe: "pending", index: "pending" } },
];
export const graph: Graph = {
  nodes: [
    { id: "session:first", ref: "s/1", label: "First", kind: "session", sources: ["tree_index"] },
    { id: "topic:one", label: "Scholarships", kind: "topic", sources: ["tree_index"] },
    { id: "topic:other", label: "Unrelated topic", kind: "topic", sources: ["tree_index"] },
    { id: "person:one", label: "Speaker one", kind: "person", sources: ["graph_edges"] },
    { id: "org:one", label: "Organization one", kind: "org", sources: ["graph_edges"] },
  ],
  edges: [
    { source: "session:first", target: "topic:one", type: "session-topic", inferred: true, origin: "tree_index" },
    { source: "person:one", target: "topic:one", type: "spoke_about", inferred: false, origin: "graph_edges", sessionRef: "s/1" },
    { source: "org:one", target: "person:one", type: "affiliation", inferred: false, origin: "graph_edges", evidence: [{ turnId: "t1", sessionId: "s/1" }] },
    { source: "topic:one", target: "topic:other", type: "related", inferred: true, origin: "graph_edges", sessionRef: "s2" },
  ],
  stats: { sessionsTotal: 3, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 3 } },
};
