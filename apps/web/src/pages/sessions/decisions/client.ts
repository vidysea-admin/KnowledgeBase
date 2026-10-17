import { apiFetch } from "../../../api/client.js";

export interface DecisionEvidenceView {
  turnId: string; sessionId: string; text: string; speaker: string;
  tStart: number; tEnd: number; unit: "seconds" | "characters";
}
export interface SessionDecisionView {
  _id: string; text: string; status: "proposed" | "verified" | "needs-review";
  owner?: string; tStart: number; tEnd: number; evidence: DecisionEvidenceView[];
}
export interface SessionDecisionsView { sessionId: string; decisions: SessionDecisionView[] }

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && v === v.trim()
  && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const span = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= a;

/** Validate and minimally project the shared HTTP response before rendering any source text. */
export async function getSessionDecisions(apiKey: string | null, sessionId: string): Promise<SessionDecisionsView> {
  if (!id(sessionId)) throw new Error("Invalid session identity");
  const body = await apiFetch<unknown>(`/sessions/${encodeURIComponent(sessionId)}/decisions`, apiKey);
  const fail = () => { throw new Error("Stored decision response is unavailable or does not match this session"); };
  if (!record(body) || body.sessionId !== sessionId || !Array.isArray(body.decisions)) return fail();
  const decisions: SessionDecisionView[] = [];
  for (const d of body.decisions) {
    if (!record(d) || !id(d._id) || !text(d.text) || typeof d.status !== "string" || !["proposed", "verified", "needs-review"].includes(d.status)
      || !span(d.tStart, d.tEnd) || (d.owner !== undefined && !id(d.owner)) || !Array.isArray(d.evidence) || !d.evidence.length) return fail();
    const evidence: DecisionEvidenceView[] = [];
    for (const e of d.evidence) {
      if (!record(e) || !id(e.turnId) || e.sessionId !== sessionId || !text(e.text) || !text(e.speaker)
        || !span(e.tStart, e.tEnd) || typeof e.unit !== "string" || !["seconds", "characters"].includes(e.unit)) return fail();
      evidence.push({ turnId: e.turnId, sessionId, text: e.text, speaker: e.speaker,
        tStart: e.tStart as number, tEnd: e.tEnd as number, unit: e.unit as DecisionEvidenceView["unit"] });
    }
    if (new Set(evidence.map((e) => e.turnId)).size !== evidence.length) return fail();
    if (d.tStart !== Math.min(...evidence.map((e) => e.tStart)) || d.tEnd !== Math.max(...evidence.map((e) => e.tEnd))) return fail();
    decisions.push({ _id: d._id, text: d.text, status: d.status as SessionDecisionView["status"],
      ...(typeof d.owner === "string" ? { owner: d.owner } : {}), tStart: d.tStart as number, tEnd: d.tEnd as number, evidence });
  }
  if (new Set(decisions.map((d) => d._id)).size !== decisions.length) return fail();
  return { sessionId, decisions };
}
