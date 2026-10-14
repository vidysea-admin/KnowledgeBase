import { apiFetch, ApiError } from "./client.js";
export interface TranscriptReviewTurn { _id: string; text: string; speakerRef: string; speakerLabel?: string; tStart: number; tEnd: number }
export type TranscriptRefresh = "pending" | "complete" | "failed";
export interface TranscriptReviewSnapshot { sessionId: string; revision: string; turns: TranscriptReviewTurn[]; refresh: TranscriptRefresh }
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
  return { sessionId, revision: v.revision, turns, refresh: v.refresh };
}
export async function saveTranscriptReview(apiKey: string | null, sessionId: string, request: TranscriptReviewRequest): Promise<TranscriptReviewCommit> {
  if (!revision(request.expectedRevision)) throw new ApiError(400, "Invalid transcript revision");
  const v = await apiFetch<unknown>(base(sessionId), apiKey, { method: "POST", headers: { "If-Match": `"${request.expectedRevision}"` }, body: request });
  if (!obj(v) || v.sessionId !== sessionId || !revision(v.revision) || v.revision === request.expectedRevision ||
      v.commit !== "committed" || !refresh(v.refresh)) return invalid();
  return { sessionId, revision: v.revision, commit: "committed", refresh: v.refresh };
}
