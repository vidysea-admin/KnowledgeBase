import { apiFetch, ApiError } from "./client.js";
export interface TranscriptReviewTurn { _id: string; text: string; speakerRef: string; speakerLabel?: string; tStart: number; tEnd: number }
export type TranscriptRefresh = "pending" | "complete" | "failed";
export interface TranscriptReviewSnapshot { sessionId: string; revision: string; turns: TranscriptReviewTurn[]; refresh: TranscriptRefresh; orphanedTurnIds?: string[] }
export interface TranscriptReviewRequest {
  expectedRevision: string; reason: string; corrections: { turnId: string; text: string }[];
  mapping?: { turnIds: string[]; speakerRef: string; speakerLabel: string };
}
export interface TranscriptReviewCommit { sessionId: string; revision: string; commit: "committed"; refresh: TranscriptRefresh }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 400 && !/[\u0000-\u001f\u007f]/.test(v);
const revision = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._:-]{1,400}$/.test(v);
const refresh = (v: unknown): v is TranscriptRefresh => v === "pending" || v === "complete" || v === "failed";
const invalid = (): never => { throw new ApiError(503, "Invalid transcript review response"); };
const base = (id: string) => `/sessions/${encodeURIComponent(id)}/transcript-review`;
export async function getTranscriptReview(apiKey: string | null, sessionId: string): Promise<TranscriptReviewSnapshot> {
  const v = await apiFetch<unknown>(base(sessionId), apiKey);
  if (!obj(v) || v.sessionId !== sessionId || !revision(v.revision) || !refresh(v.refresh) || !Array.isArray(v.turns)) return invalid();
  const ids = new Set<string>();
  const turns = v.turns.map((t) => {
    if (!obj(t) || !str(t._id) || ids.has(t._id) || typeof t.text !== "string" || !t.text.trim() || t.text.length > 20000 || t.text.includes("\u0000") || !str(t.speakerRef) ||
        (t.speakerLabel !== undefined && !str(t.speakerLabel)) || typeof t.tStart !== "number" || typeof t.tEnd !== "number" ||
        !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart) return invalid();
    ids.add(t._id);
    return { _id: t._id, text: t.text, speakerRef: t.speakerRef, tStart: t.tStart, tEnd: t.tEnd,
      ...(t.speakerLabel !== undefined ? { speakerLabel: t.speakerLabel } : {}) };
  });
  if (turns.some((t, i) => i > 0 && t.tStart < turns[i - 1]!.tStart)) return invalid();
  if (v.orphanedTurnIds !== undefined && (!Array.isArray(v.orphanedTurnIds) || !v.orphanedTurnIds.every(str) || new Set(v.orphanedTurnIds).size !== v.orphanedTurnIds.length || v.orphanedTurnIds.some((id) => ids.has(id)))) return invalid();
  return { sessionId, revision: v.revision, turns, refresh: v.refresh,
    ...(v.orphanedTurnIds !== undefined ? { orphanedTurnIds: v.orphanedTurnIds as string[] } : {}) };
}
export async function saveTranscriptReview(apiKey: string | null, sessionId: string, request: TranscriptReviewRequest): Promise<TranscriptReviewCommit> {
  if (!revision(request.expectedRevision)) throw new ApiError(400, "Invalid transcript revision");
  const v = await apiFetch<unknown>(base(sessionId), apiKey, { method: "POST", headers: { "If-Match": `"${request.expectedRevision}"` }, body: request });
  if (!obj(v) || v.sessionId !== sessionId || !revision(v.revision) || v.revision === request.expectedRevision ||
      v.commit !== "committed" || !refresh(v.refresh)) return invalid();
  return { sessionId, revision: v.revision, commit: "committed", refresh: v.refresh };
}

export interface TranscriptReviewChange { turnId: string; before: { text: string; speakerRef: string; speakerLabel?: string }; after: { text: string; speakerRef: string; speakerLabel?: string } }
export interface TranscriptReviewRevision { revision: string; parentRevision: string; actorRef: string; reviewedAt: string; reason: string; changes: TranscriptReviewChange[] }
const changeView = (v: unknown): v is TranscriptReviewChange["before"] => obj(v) && typeof v.text === "string" && !!v.text.trim() && v.text.length <= 20000 && str(v.speakerRef) && (v.speakerLabel === undefined || str(v.speakerLabel));
export async function getTranscriptReviewHistory(apiKey: string | null, sessionId: string): Promise<TranscriptReviewRevision[]> {
  const v = await apiFetch<unknown>(`${base(sessionId)}/history`, apiKey);
  if (!obj(v) || v.sessionId !== sessionId || !Array.isArray(v.revisions)) return invalid();
  const seen = new Set<string>();
  return v.revisions.map((r) => {
    if (!obj(r) || !revision(r.revision) || seen.has(r.revision) || !revision(r.parentRevision) || !str(r.actorRef) ||
        typeof r.reviewedAt !== "string" || !Number.isFinite(Date.parse(r.reviewedAt)) || typeof r.reason !== "string" || !r.reason.trim() || r.reason.length > 2000 ||
        !Array.isArray(r.changes) || !r.changes.length || r.changes.length > 200) return invalid();
    seen.add(r.revision);
    const turnIds = new Set<string>();
    const changes = r.changes.map((c) => {
      if (!obj(c) || !str(c.turnId) || turnIds.has(c.turnId) || !changeView(c.before) || !changeView(c.after)) return invalid();
      turnIds.add(c.turnId);
      return { turnId: c.turnId, before: { ...c.before }, after: { ...c.after } };
    });
    return { revision: r.revision, parentRevision: r.parentRevision, actorRef: r.actorRef, reviewedAt: r.reviewedAt, reason: r.reason, changes };
  });
}
export async function refreshTranscriptReview(apiKey: string | null, sessionId: string, expectedRevision: string): Promise<TranscriptRefresh> {
  if (!revision(expectedRevision)) throw new ApiError(400, "Invalid transcript revision");
  const v = await apiFetch<unknown>(`${base(sessionId)}/refresh`, apiKey, { method: "POST", body: {}, headers: { "If-Match": `"${expectedRevision}"` } });
  if (!obj(v) || v.sessionId !== sessionId || v.revision !== expectedRevision || !refresh(v.refresh) || !Array.isArray(v.completed) || !v.completed.every(str)) return invalid();
  const targets = ["claims", "session-page", "chunks", "tree", "graph"];
  if (v.completed.some((name, i) => name !== targets[i]) || v.refresh === "complete" && v.completed.length !== targets.length) return invalid();
  return v.refresh;
}
