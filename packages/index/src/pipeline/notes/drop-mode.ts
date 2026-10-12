/**
 * T-040 drop-unverified mode. In the default strict mode a single bad item degrades the whole page. Here an
 * item that fails the strict verifier, extractiveness, origin or the independent judge is DROPPED (and
 * reported), never emitted; an answer that fails becomes `unanswered` per the schema rule. Protocol failures
 * (coverage acknowledgement, incomplete or malformed judge, an informative window left with no verified item)
 * still throw, so the caller degrades the whole page exactly as before.
 */
import type { Turns, CitedItem, QaEntry } from "@lkb/core";
import { runtimeArray, runtimeDigest, runtimeEvidenceOrigin, runtimeVerdicts, verdictPasses, type RuntimeComplete, type RuntimeSpan, type RuntimeVerdict } from "../grounded.js";
import { resolveEvidence, extractiveText } from "./evidence.js";

export interface DroppedNote { what: "insight" | "decision" | "action" | "qa" | "qa-answer" | "claim" | "unknown"; reason: string; excerpt: string }
const KINDS = new Set(["insight", "decision", "action"]);
const rec = (v: unknown): Record<string, unknown> | undefined => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const excerpt = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");

/** Build one grounded item from a raw proposal, or undefined (and a log entry) when it cannot be fully verified. */
export function tryItem(raw: unknown, turns: Turns[], spans: RuntimeSpan[] | undefined, log: DroppedNote[]): CitedItem | undefined {
  const r = rec(raw), drop = (reason: string) => (log.push({ what: r && KINDS.has(String(r.kind)) ? (r.kind as DroppedNote["what"]) : "unknown", reason, excerpt: excerpt(r?.text) }), undefined);
  if (!r) return drop("not an object");
  if (!KINDS.has(String(r.kind))) return drop("unknown extraction category");
  const ev = resolveEvidence(r.evidence, turns, spans);
  if (!ev.ok) return drop(ev.reason);
  let origin;
  try { origin = runtimeEvidenceOrigin(ev.evidence, turns); } catch (e) { return drop(e instanceof Error ? e.message : "origin unavailable"); }
  if (r.origin !== origin || r.verification !== "unverified") return drop("source origin/verification mismatch");
  const text = extractiveText(r.text, ev);
  if (text === undefined) return drop("display text is not the verified quotes");
  const kind = r.kind as CitedItem["kind"];
  return { id: runtimeDigest([kind, ev.evidence]), kind, text, origin, verification: "unverified", evidence: ev.evidence };
}

/** Build one Q&A entry. A bad question drops it; a bad or incoherent answer leaves it unanswered. */
export function tryQA(raw: unknown, turns: Turns[], questionSpans: RuntimeSpan[] | undefined, answerSpans: RuntimeSpan[] | undefined, log: DroppedNote[]): QaEntry | undefined {
  const r = rec(raw), drop = (what: DroppedNote["what"], reason: string) => (log.push({ what, reason, excerpt: excerpt(r?.question) }), undefined);
  if (!r) return drop("qa", "not an object");
  const q = resolveEvidence(r.questionEvidence, turns, questionSpans);
  if (!q.ok) return drop("qa", `question: ${q.reason}`);
  const question = extractiveText(r.question, q);
  if (question === undefined) return drop("qa", "question text is not the verified quotes");
  const base = { id: runtimeDigest(["question", q.evidence]), question, questionEvidence: q.evidence };
  const unanswered = (): QaEntry => ({ ...base, answer: null, answerEvidence: [], status: "unanswered" });
  if (r.status !== "answered" || r.answer === null || r.answer === undefined) {
    if (r.status !== "answered" && r.status !== "unanswered") return drop("qa", "invalid question status");
    return unanswered();
  }
  const a = resolveEvidence(r.answerEvidence, turns, answerSpans), answer = a.ok ? extractiveText(r.answer, a) : undefined;
  if (!a.ok || answer === undefined) { drop("qa-answer", a.ok ? "answer text is not the verified quotes" : `answer: ${a.reason}`); return unanswered(); }
  return { ...base, answer, answerEvidence: a.evidence, status: "answered" };
}

export const unansweredCopy = (q: QaEntry): QaEntry => ({ id: q.id, question: q.question, questionEvidence: q.questionEvidence, answer: null, answerEvidence: [], status: "unanswered" });

/** Window-extract helper: build every proposal, dedupe by id, run the judge, and drop what it flags. */
export async function collectWindow(complete: RuntimeComplete, turns: Turns[], spans: RuntimeSpan[], rawItems: unknown, rawQa: unknown, log: DroppedNote[]): Promise<{ items: CitedItem[]; qa: QaEntry[] }> {
  const items = new Map<string, CitedItem>(), qa = new Map<string, QaEntry>();
  for (const raw of runtimeArray(rawItems)) { const i = tryItem(raw, turns, spans, log); if (i) items.set(i.id, i); }
  for (const raw of runtimeArray(rawQa)) { const q = tryQA(raw, turns, spans, spans, log); if (q) qa.set(q.id, q); }
  const verdicts = await runtimeVerdicts(complete, "summarize", turns, spans, [...items.values(), ...qa.values()]);
  return applyVerdicts(verdicts, items, qa, log);
}

function applyVerdicts(verdicts: RuntimeVerdict[], items: Map<string, CitedItem>, qa: Map<string, QaEntry>, log: DroppedNote[]): { items: CitedItem[]; qa: QaEntry[] } {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  for (const [id, item] of items) if (!verdictPasses(byId.get(id))) { log.push({ what: item.kind, reason: "independent judge rejected the item", excerpt: item.text.slice(0, 120) }); items.delete(id); }
  for (const [id, q] of qa) {
    const v = byId.get(id);
    if (verdictPasses(v)) continue;
    if (v?.supported === true && v.categoryCorrect === true && q.status === "answered") { log.push({ what: "qa-answer", reason: "judge: answer not relevant to its question", excerpt: q.question.slice(0, 120) }); qa.set(id, unansweredCopy(q)); }
    else { log.push({ what: "qa", reason: "independent judge rejected the question", excerpt: q.question.slice(0, 120) }); qa.delete(id); }
  }
  return { items: [...items.values()], qa: [...qa.values()] };
}

/** Judge pending-question candidates; a candidate the judge rejects is discarded and the prior unanswered question stands. */
export async function judgePendingCandidates(complete: RuntimeComplete, turns: Turns[], spans: RuntimeSpan[], candidates: QaEntry[], log: DroppedNote[]): Promise<QaEntry[]> {
  const verdicts = await runtimeVerdicts(complete, "summarize", turns, spans, candidates, "pending-qa");
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  return candidates.filter((c) => c.status === "unanswered" || (verdictPasses(byId.get(c.id)) || (log.push({ what: "qa-answer", reason: "judge rejected the late answer", excerpt: c.question.slice(0, 120) }), false)));
}
