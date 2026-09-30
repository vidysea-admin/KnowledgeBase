/**
 * apps/web/src/api/types.ts — response shapes mirrored by hand from apps/api's real routes, NOT
 * imported from @lkb/core. apps/web imports zero packages/* (dependency-cruiser boundary +
 * project decision: a frontend only talks HTTP/JSON to apps/api, never the domain packages
 * directly) — a small amount of duplication here is the accepted cost of keeping that boundary
 * real instead of nominal.
 */
export interface SessionSummary {
  _id: string;
  title: string;
  date: string;
  org?: string;
  participants?: string[];
  status: { transcribe: string; index: string; [k: string]: unknown };
}

export interface Claim {
  _id: string;
  text: string;
  status: "verified" | "needs-review" | "conflicting";
}

export interface Turn {
  _id: string;
  speakerRef: string;
  tStart: number;
  tEnd: number;
  text: string;
  /** Real human-readable speaker name, when the source already knows one (e.g. a WhatsApp
   * message's real pushName/savedName). Absent for sources with no real name (audio -> spk:N). */
  speakerLabel?: string;
  /** Real wall-clock ISO datetime the turn occurred (e.g. a WhatsApp message's real send time).
   * `tStart`/`tEnd` stay relative-offset seconds; this is the absolute moment, when known. */
  occurredAt?: string;
}

export interface SessionDetail {
  session: SessionSummary;
  page: { summary: string } | null;
  claims: Claim[];
  turns: Turn[];
  media?: { available: boolean; bytes: number; mime: string };
  notes?: { text: string; kind: string; tStart: number; turnId?: string; frameId?: string }[];
  frames?: { id: string; tStart: number; text: string }[];
}
export interface WebinarOperation {
  id: string; title: string; status: "queued" | "recording" | "processing" | "failed" | "ready" | "action_required";
  attempts: number; reason?: string; updatedAt?: string; startTime?: string; endTime?: string;
}
export interface WebinarDiscoveryHealth { status: "healthy" | "failed"; checkedAt: string; lastSuccessAt?: string }

export interface Source {
  _id: string;
  kind: string;
  captureMode: string;
  path?: string;
  url?: string;
  createdAt: string;
}

export interface Gap {
  _id: string;
  kind: string;
  description?: string;
  status: "open" | "received" | "expired";
}

/**
 * `GET /graph` — the UNION payload (U-BRAIN [C1]). Mirrors `@lkb/index`'s `KnowledgeGraph*`
 * types by hand, per this file's boundary rule. Ids are canonical `<kind>:<slug>`; `ref` carries
 * the raw entity id so a session node can deep-link to `/sessions/<ref>`. NOTE the edge field is
 * `type` (the `graph_edges` field name), not the pre-union `kind`.
 */
export type GraphNodeKind =
  | "session" | "topic" | "org" | "person" | "country" | "date" | "month" | "user" | "other";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  ref?: string;
  sources: ("tree_index" | "graph_edges")[];
}

export interface GraphEvidence {
  turnId: string;
  sessionId?: string;
  tStart?: number;
  occurredAt?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  /** Derived rather than asserted — tree co-occurrence, or any row with `confidence` < 1. */
  inferred: boolean;
  confidence?: number;
  weight?: number;
  sessionRef?: string;
  evidence?: GraphEvidence[];
  origin: "tree_index" | "graph_edges";
}

/** [C7] — what the graph does NOT contain, so /brain can say so instead of looking complete. */
export interface GraphStats {
  sessionsTotal: number;
  sessionsInGraph: number;
  sessionsMissing: { id: string; title: string }[];
  edgeSources: { treeIndex: number; entityEdges: number };
}

export interface UpcomingMeeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingUrl?: string;
  organizer?: string;
}

export interface MeetingCandidate {
  _id: string;
  messageId: string;
  subject: string;
  senderEmail: string;
  senderDomain: string;
  meetingUrl?: string;
  status: "pending" | "approved" | "rejected" | "auto_approved";
  detectedAt: string;
  decidedAt?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

/**
 * `POST /ask` response — mirrors `AskV2Result` from `@lkb/ask` (packages/ask/src/ask-v2.ts:47,
 * extending `AskResult` at router.ts:23). Declared structurally here rather than imported so
 * apps/web keeps no build-time dependency on the ask package; the shape is asserted against the
 * real route in the unit's evidence manifest.
 */
export interface AskInternalSource {
  node_id: string;
  evidence?: { sessionRef?: string; [k: string]: unknown };
}

export interface AskWebSource {
  [k: string]: unknown;
}

export interface AskScored {
  node_id?: string;
  score?: number;
  reason?: string;
  [k: string]: unknown;
}

export interface AskResponse {
  answer: string;
  verdict: string;
  reason: string;
  scored: AskScored[];
  web_used: boolean;
  insufficient_coverage: boolean;
  sources: { internal: AskInternalSource[]; web: AskWebSource[] };
  auditLog: { step: string; provider?: string; model?: string; costUsd?: number }[];
}
