import type { Graph, SessionSummary, Source } from "../../api/types.js";
export const directorySessions: SessionSummary[] = [{ _id: "session/one", title: "Career session", date: "2026-10-13", status: { transcribe: "done", index: "done" } }];
export const directorySources: Source[] = [{ _id: "resource-one", kind: "document", captureMode: "provided", createdAt: "2026-10-13", path: "C:/private/path.txt", url: "https://example.com/document" }] as unknown as Source[]; // legacy rows may still carry path; pages must not show it
export const directoryGraph: Graph = {
  nodes: [
    { id: "topic:career", label: "Careers", kind: "topic", sources: ["graph_edges"] },
    { id: "person:one", label: "Speaker name", kind: "person", sources: ["graph_edges"] },
    { id: "session:one", label: "Career session", kind: "session", ref: "session/one", sources: ["tree_index"] },
  ],
  edges: [
    { source: "topic:career", target: "person:one", type: "discussed", inferred: true, confidence: 0.7, origin: "graph_edges", sessionRef: "session/one", evidence: [{ turnId: "turn /#one", sessionId: "session/one", tStart: 12 }] },
    { source: "person:one", target: "session:one", type: "spoke_in", inferred: false, confidence: 1, origin: "graph_edges", evidence: [{ turnId: "turn-2" }] },
  ],
  stats: { sessionsTotal: 2, sessionsInGraph: 1, sessionsMissing: [{ id: "missing", title: "Not indexed" }], edgeSources: { treeIndex: 0, entityEdges: 2 } },
};
