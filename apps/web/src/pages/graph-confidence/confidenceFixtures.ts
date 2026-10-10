import type { Graph } from "../../api/types.js";

export const graph: Graph = {
  nodes: [
    { id: "session:s/1", ref: "s/1", label: "First session", kind: "session", sources: ["graph_edges", "tree_index"] },
    { id: "person:one", label: "Speaker one", kind: "person", sources: ["graph_edges"] },
    { id: "topic:high", label: "Higher confidence topic", kind: "topic", sources: ["graph_edges"] },
    { id: "topic:low", label: "Lower confidence topic", kind: "topic", sources: ["graph_edges"] },
    { id: "org:unknown", label: "Unscored organization", kind: "org", sources: ["tree_index"] },
    { id: "topic:invalid", label: "Invalid score topic", kind: "topic", sources: ["graph_edges"] },
  ],
  edges: [
    { source: "person:one", target: "session:s/1", type: "spoke_in", inferred: false, origin: "graph_edges", confidence: 1, sessionRef: "s/1", evidence: [{ turnId: "t/high", tStart: 30 }] },
    { source: "session:s/1", target: "topic:high", type: "covers", inferred: true, origin: "graph_edges", confidence: 0.8, evidence: [{ turnId: "t/topic", sessionId: "s/1", tStart: 61 }] },
    { source: "session:s/1", target: "topic:low", type: "discussed", inferred: true, origin: "graph_edges", confidence: 0.7, sessionRef: "s/1", evidence: [{ turnId: "t/low" }] },
    { source: "session:s/1", target: "org:unknown", type: "session-org", inferred: false, origin: "tree_index" },
    { source: "session:s/1", target: "topic:invalid", type: "covers", inferred: false, origin: "graph_edges", confidence: 2 },
  ],
  stats: { sessionsTotal: 1, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 1, entityEdges: 4 } },
};
