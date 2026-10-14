/** T-054 review planning only. No persistence, canonical writes or refresh execution. */
import { createHash } from "node:crypto";

export interface ReviewTurn {
  _id: string; tenantId: string; sessionId: string; tStart: number; tEnd: number;
  text: string; speakerRef: string; speakerLabel?: string;
}
export interface ReviewSnapshot { tenantId: string; sessionId: string; revision: string; turns: readonly ReviewTurn[] }
export interface ReviewRequest {
  expectedRevision: string; reason: string; corrections: { turnId: string; text: string }[];
  mapping?: { turnIds: string[]; speakerRef: string; speakerLabel: string };
}
export interface ReviewChange {
  turnId: string;
  before: { text: string; speakerRef: string; speakerLabel?: string };
  after: { text: string; speakerRef: string; speakerLabel?: string };
}
export interface ReviewPlan {
  expectedRevision: string; nextRevision: string; nextTurns: ReviewTurn[];
  audit: { tenantId: string; sessionId: string; actorRef: string; reviewedAt: string; reason: string; changes: ReviewChange[] };
  refresh: { status: "pending"; revision: string; targets: readonly string[] };
}
export class ReviewPlanningError extends Error {
  constructor(public readonly code: "invalid" | "conflict" | "scope" | "no_changes", message: string) { super(message); }
}
const clean = (v: unknown, max = 400): v is string => typeof v === "string" && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 20000 && !v.includes("\u0000");
const revision = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._:-]{1,400}$/.test(v);
const invalid = (): never => { throw new ReviewPlanningError("invalid", "Invalid transcript review request"); };

/** Parses the wire request; auth/actor/tenant and timestamps cannot be supplied by a client. */
export function parseReviewRequest(value: unknown): ReviewRequest {
  if (!record(value) || !fields(value, ["expectedRevision", "reason", "corrections", "mapping"]) ||
      !revision(value.expectedRevision) || !text(value.reason) || value.reason.length > 2000 || !Array.isArray(value.corrections) || value.corrections.length > 100) return invalid();
  const corrections = value.corrections.map((c) => {
    if (!record(c) || !fields(c, ["turnId", "text"]) || !clean(c.turnId) || !text(c.text)) return invalid();
    return { turnId: c.turnId, text: c.text };
  });
  let mapping: ReviewRequest["mapping"];
  if (value.mapping !== undefined) {
    const m = value.mapping;
    if (!record(m) || !fields(m, ["turnIds", "speakerRef", "speakerLabel"]) || !Array.isArray(m.turnIds) ||
        !m.turnIds.length || m.turnIds.length > 100 || !m.turnIds.every((id) => clean(id)) || !clean(m.speakerRef) || !clean(m.speakerLabel)) return invalid();
    mapping = { turnIds: [...m.turnIds], speakerRef: m.speakerRef, speakerLabel: m.speakerLabel };
  }
  return { expectedRevision: value.expectedRevision, reason: value.reason, corrections, ...(mapping ? { mapping } : {}) };
}

/** Caller must commit nextTurns, audit and pending-refresh atomically under expectedRevision.
 * A successful plan is never evidence of a durable commit or completed downstream refresh. */
export function planTranscriptReview(snapshot: ReviewSnapshot, requestValue: unknown,
  trusted: { tenantId: string; sessionId: string; actorRef: string; reviewedAt: string }): ReviewPlan {
  const request = parseReviewRequest(requestValue);
  if (!clean(trusted.tenantId) || !clean(trusted.sessionId) || !clean(trusted.actorRef) ||
      !clean(trusted.reviewedAt) || !Number.isFinite(Date.parse(trusted.reviewedAt)) || !revision(snapshot.revision)) return invalid();
  if (snapshot.tenantId !== trusted.tenantId || snapshot.sessionId !== trusted.sessionId || snapshot.turns.some((t) =>
      t.tenantId !== trusted.tenantId || t.sessionId !== trusted.sessionId)) throw new ReviewPlanningError("scope", "Transcript scope mismatch");
  if (request.expectedRevision !== snapshot.revision) throw new ReviewPlanningError("conflict", "Transcript changed; reload before saving");
  const positions = new Map<string, number>();
  snapshot.turns.forEach((t, i) => {
    if (!clean(t._id) || !text(t.text) || !clean(t.speakerRef) || (t.speakerLabel !== undefined && !clean(t.speakerLabel)) ||
        !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart ||
        (i > 0 && t.tStart < snapshot.turns[i - 1]!.tStart) || positions.has(t._id)) return invalid();
    positions.set(t._id, i);
  });
  const ids = request.corrections.map((c) => c.turnId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !positions.has(id))) return invalid();
  if (request.mapping) {
    const indices = request.mapping.turnIds.map((id) => positions.get(id));
    if (new Set(request.mapping.turnIds).size !== indices.length || indices.some((i) => i === undefined)) return invalid();
    const sorted = (indices as number[]).sort((a, b) => a - b);
    if (sorted.some((i, n) => i !== sorted[0]! + n || snapshot.turns[i]!.speakerRef !== snapshot.turns[sorted[0]!]!.speakerRef)) return invalid();
  }
  const corrections = new Map(request.corrections.map((c) => [c.turnId, c.text]));
  const mapped = new Set(request.mapping?.turnIds ?? []);
  const changes: ReviewChange[] = [];
  const nextTurns = snapshot.turns.map((turn) => {
    const next = { ...turn };
    if (corrections.has(turn._id)) next.text = corrections.get(turn._id)!;
    if (mapped.has(turn._id)) { next.speakerRef = request.mapping!.speakerRef; next.speakerLabel = request.mapping!.speakerLabel; }
    const view = (t: ReviewTurn) => ({ text: t.text, speakerRef: t.speakerRef, ...(t.speakerLabel !== undefined ? { speakerLabel: t.speakerLabel } : {}) });
    if (next.text !== turn.text || next.speakerRef !== turn.speakerRef || next.speakerLabel !== turn.speakerLabel)
      changes.push({ turnId: turn._id, before: view(turn), after: view(next) });
    return next;
  });
  if (!changes.length) throw new ReviewPlanningError("no_changes", "No transcript changes to save");
  const nextRevision = createHash("sha256").update(JSON.stringify([trusted.tenantId, trusted.sessionId, snapshot.revision, changes])).digest("hex");
  return { expectedRevision: snapshot.revision, nextRevision, nextTurns,
    audit: { ...trusted, reason: request.reason, changes },
    refresh: { status: "pending", revision: nextRevision, targets: ["claims", "session-page", "chunks", "tree", "graph"] } };
}
