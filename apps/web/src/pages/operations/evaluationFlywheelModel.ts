import { apiFetch } from "../../api/client.js";

export type FlywheelStage = "awaiting-source" | "captured" | "indexed" | "retested";
export interface FlywheelView {
  gapId: string; originalEvalRunId: string; question: string;
  gapStatus: "open" | "received" | "expired"; stage: FlywheelStage; revision: number;
  originalScore: { ai: number; counsellor: number };
  credibility: "internal" | "independent-human" | "calibrated-llm";
  captureSessionId?: string; childEvalRunId?: string;
  failure?: { stage: string; requestId: string; at: string };
  lock?: { requestId: string; expiresAt: string };
}
export interface RetestView {
  childEvalRunId: string; originalEvalRunId: string; gapId: string; requestId: string;
  question: string; answer: string; sources: unknown;
  score?: { ai: number; counsellor: number };
  comparison: "needs-review"; credibility: "internal";
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const id = (v: unknown): v is string => text(v) && v.length <= 200 && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
const requestId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const score = (v: unknown): v is { ai: number; counsellor: number } => object(v) && typeof v.ai === "number" && Number.isFinite(v.ai)
  && typeof v.counsellor === "number" && Number.isFinite(v.counsellor);
const invalid = (): never => { throw new Error("Invalid evaluation recovery response"); };
export function readFlywheelHead(raw: unknown, expectedOriginalId: string): FlywheelView {
  if (!object(raw) || !id(raw._id) || raw.kind !== "source-pending" || !object(raw.flywheel)) return invalid();
  const head = raw.flywheel, loss = head.loss;
  if (head.version !== 1 || head.originalEvalRunId !== expectedOriginalId || !id(expectedOriginalId)
    || !object(loss) || !text(loss.question) || !score(loss.score) || loss.score.ai >= loss.score.counsellor
    || !["internal", "independent-human", "calibrated-llm"].includes(String(loss.credibility))
    || !Number.isSafeInteger(head.revision) || (head.revision as number) < 0
    || !["open", "received", "expired"].includes(String(raw.status))
    || !["awaiting-source", "captured", "indexed", "retested"].includes(String(head.stage))) return invalid();
  const result: FlywheelView = { gapId: raw._id, originalEvalRunId: expectedOriginalId, question: loss.question,
    originalScore: { ai: loss.score.ai, counsellor: loss.score.counsellor }, credibility: loss.credibility as FlywheelView["credibility"],
    gapStatus: raw.status as FlywheelView["gapStatus"], stage: head.stage as FlywheelStage, revision: head.revision as number };
  if (head.capture !== undefined) {
    if (!object(head.capture) || !id(head.capture.sessionId) || !id(head.capture.sourceId)
      || raw.sourceRef !== head.capture.sourceId || raw.status === "open") return invalid();
    result.captureSessionId = head.capture.sessionId;
  } else if (raw.status === "received" || head.stage !== "awaiting-source") return invalid();
  if (["indexed", "retested"].includes(result.stage) && (!object(head.index) || !id(head.index.generation)
    || head.index.sessionId !== result.captureSessionId || !text(head.index.treeDigest) || !text(head.index.chunksDigest))) return invalid();
  if (head.lastRetestId !== undefined) {
    if (!id(head.lastRetestId) || head.lastRetestId === expectedOriginalId) return invalid();
    result.childEvalRunId = head.lastRetestId;
  }
  if (head.stage === "retested" && !result.childEvalRunId) return invalid();
  if (head.failure !== undefined) {
    const failure = head.failure;
    if (!object(failure) || !["capture", "index", "retest", "persist"].includes(String(failure.stage))
      || !requestId(failure.requestId) || !date(failure.at)) return invalid();
    result.failure = { stage: failure.stage as string, requestId: failure.requestId, at: failure.at };
  }
  if (head.lock !== undefined) {
    if (!object(head.lock) || !requestId(head.lock.requestId) || !date(head.lock.expiresAt)) return invalid();
    result.lock = { requestId: head.lock.requestId, expiresAt: head.lock.expiresAt };
  }
  return result;
}
export function readRetestResult(raw: unknown, originalId: string, expectedRequestId: string): RetestView {
  if (!object(raw) || !id(raw._id) || raw._id === originalId || !text(raw.question) || raw.credibility !== "internal"
    || !object(raw.aiAnswer) || typeof raw.aiAnswer.text !== "string" || !object(raw.aiAnswer.sources)
    || !object(raw.flywheel)) return invalid();
  const lineage = raw.flywheel;
  if (lineage.version !== 1 || lineage.originalEvalRunId !== originalId || !id(originalId)
    || !id(lineage.gapId) || lineage.comparison !== "needs-review" || !requestId(expectedRequestId)
    || lineage.requestId !== expectedRequestId || !object(lineage.index) || !id(lineage.index.sessionId)
    || !id(lineage.index.generation) || raw.score !== undefined && !score(raw.score)) return invalid();
  return { childEvalRunId: raw._id, originalEvalRunId: originalId, gapId: lineage.gapId, requestId: expectedRequestId,
    question: raw.question, answer: raw.aiAnswer.text, sources: raw.aiAnswer.sources,
    ...(score(raw.score) ? { score: { ai: raw.score.ai, counsellor: raw.score.counsellor } } : {}),
    comparison: "needs-review", credibility: "internal" };
}
function path(originalId: string, action: string): string {
  if (!id(originalId)) throw new Error("Enter the exact original evaluation ID (1–200 characters)");
  return `/evaluations/${encodeURIComponent(originalId)}/${action}`;
}
export async function loadFlywheel(apiKey: string, originalId: string): Promise<FlywheelView> {
  return readFlywheelHead(await apiFetch(path(originalId, "flywheel"), apiKey), originalId);
}
export async function openFlywheel(apiKey: string, originalId: string): Promise<FlywheelView> {
  return readFlywheelHead(await apiFetch(path(originalId, "gap"), apiKey, { method: "POST", body: {} }), originalId);
}
export async function retestFlywheel(apiKey: string, originalId: string, sourceUrl: string, attemptId: string): Promise<RetestView> {
  const endpoint = path(originalId, "retest");
  if (!requestId(attemptId)) throw new Error("Use a request ID of 1–80 letters, digits, hyphens or underscores");
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error("Enter an HTTP or HTTPS source URL"); }
  if (sourceUrl.length > 4096 || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Enter an HTTP or HTTPS source URL without embedded credentials");
  return readRetestResult(await apiFetch(endpoint, apiKey, { method: "POST", body: { sourceUrl, requestId: attemptId } }), originalId, attemptId);
}
