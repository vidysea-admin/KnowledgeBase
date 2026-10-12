/**
 * T-040 / D-144: the negation-safety JUDGE. Negation safety moved from lexical rules to a second
 * model that reads (note, cited source sentence(s)) and answers same | different | unsure, polarity and negation
 * included. Only "same" ships; "different" and "unsure" are dropped and recorded, with the reason, in a sidecar.
 * Deterministic grounding is NOT replaced: a note with a missing/invalid citation never reaches the judge
 * (resolveEvidence rejects it first). The judge is injectable (NoteJudge), the LLM adapter takes an injected
 * `complete` (routed by job kind "note-judge" through config/ai-routing.yaml), and per-session cost is recorded.
 * Fail closed: a judge call that throws, a malformed reply, a missing id or an exhausted cost cap yields "unsure".
 */
import { writeFileSync } from "node:fs";
import type { Turns, QuotedEvidence } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { parseJsonLoose } from "@lkb/ai";

export type NoteVerdict = "same" | "different" | "unsure";
export interface NoteJudgeSource { turnId: string; speakerRef: string; /** the cited sentence plus a little surrounding turn text */ text: string }
export interface NoteJudgeInput { id: string; kind: string; note: string; sources: NoteJudgeSource[] }
export interface NoteJudgeOutput { id: string; verdict: NoteVerdict; reason: string }
export interface NoteJudgeBatch { verdicts: NoteJudgeOutput[]; costUsd?: number; inputTokens?: number; outputTokens?: number; model?: string }
/** The injectable judge: a batch of (note, sources) in, a verdict per id out. */
export type NoteJudge = (batch: NoteJudgeInput[]) => Promise<NoteJudgeBatch>;

export interface JudgeSidecarEntry { id: string; kind: string; verdict: "different" | "unsure"; reason: string; note: string; turnIds: string[] }
/** Written beside the notes: what the judge dropped, why, and what it cost this session. */
export interface JudgeSidecar {
  judged: number; kept: number; dropped: number; unsure: number; calls: number;
  costUsd: number; inputTokens: number; outputTokens: number; models: string[];
  entries: JudgeSidecarEntry[];
}
export const emptySidecar = (): JudgeSidecar => ({ judged: 0, kept: 0, dropped: 0, unsure: 0, calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, models: [], entries: [] });
export function writeJudgeSidecar(file: string, sidecar: JudgeSidecar): void { writeFileSync(file, JSON.stringify(sidecar, null, 2) + "\n", "utf8"); }

/** What the pipeline threads through: the judge, the sidecar it fills, and an optional per-session cost cap. */
export interface JudgeContext { judge: NoteJudge; sidecar: JudgeSidecar; maxCostUsd?: number; batchSize: number }
export function makeJudgeContext(judge: NoteJudge, opts: { maxCostUsd?: number; batchSize?: number } = {}): JudgeContext {
  return { judge, sidecar: emptySidecar(), ...(opts.maxCostUsd !== undefined ? { maxCostUsd: opts.maxCostUsd } : {}), batchSize: opts.batchSize ?? 8 };
}

const CONTEXT_CHARS = 400;
/** The cited sentence(s) for one evidence entry: every occurrence of the quote (max 3) with surrounding turn text. */
export function sourcesFor(evidence: ReadonlyArray<QuotedEvidence>, turns: Turns[]): NoteJudgeSource[] {
  const out: NoteJudgeSource[] = [];
  for (const e of evidence) {
    const turn = turns.find((t) => t._id === e.turnId && t.sessionId === e.sessionId);
    if (!turn) continue;
    let from = 0, n = 0;
    for (;;) {
      const at = turn.text.indexOf(e.quote, from);
      if (at < 0 || n >= 3) break;
      out.push({ turnId: turn._id, speakerRef: turn.speakerRef, text: turn.text.slice(Math.max(0, at - CONTEXT_CHARS), Math.min(turn.text.length, at + e.quote.length + CONTEXT_CHARS)) });
      n++; from = at + 1;
    }
  }
  return out;
}

/** One note to judge: its id, kind, text and cited evidence. */
export interface JudgeCandidate { id: string; kind: string; note: string; evidence: ReadonlyArray<QuotedEvidence> }

/**
 * Judge candidates; returns the set of ids that may ship ("same") and fills the sidecar for the rest.
 * A candidate with no resolvable source (missing citation) is "different" without ever calling the judge.
 */
export async function judgeCandidates(jc: JudgeContext, turns: Turns[], candidates: JudgeCandidate[]): Promise<Set<string>> {
  const keep = new Set<string>(), sc = jc.sidecar;
  const record = (c: JudgeCandidate, verdict: NoteVerdict, reason: string) => {
    sc.judged++;
    if (verdict === "same") { sc.kept++; keep.add(c.id); return; }
    if (verdict === "different") sc.dropped++; else sc.unsure++;
    sc.entries.push({ id: c.id, kind: c.kind, verdict, reason, note: c.note.slice(0, 200), turnIds: [...new Set(c.evidence.map((e) => e.turnId))] });
  };
  const ready: { c: JudgeCandidate; input: NoteJudgeInput }[] = [];
  for (const c of candidates) {
    const sources = sourcesFor(c.evidence, turns);
    if (!sources.length) record(c, "different", "no cited source sentence could be resolved");
    else ready.push({ c, input: { id: c.id, kind: c.kind, note: c.note, sources } });
  }
  for (let i = 0; i < ready.length; i += jc.batchSize) {
    const batch = ready.slice(i, i + jc.batchSize);
    if (jc.maxCostUsd !== undefined && sc.costUsd >= jc.maxCostUsd) { for (const r of batch) record(r.c, "unsure", "judge cost cap reached; note not judged"); continue; }
    let result: NoteJudgeBatch | undefined, failure = "";
    try { result = await jc.judge(batch.map((r) => r.input)); sc.calls++; } catch (e) { failure = `judge call failed: ${e instanceof Error ? e.message : String(e)}`; }
    if (result) {
      sc.costUsd += Number.isFinite(result.costUsd) ? result.costUsd! : 0;
      sc.inputTokens += Number.isFinite(result.inputTokens) ? result.inputTokens! : 0;
      sc.outputTokens += Number.isFinite(result.outputTokens) ? result.outputTokens! : 0;
      if (result.model && !sc.models.includes(result.model)) sc.models.push(result.model);
    }
    const byId = new Map<string, NoteJudgeOutput[]>();
    for (const v of result?.verdicts ?? []) byId.set(v?.id, [...(byId.get(v?.id) ?? []), v]);
    for (const r of batch) {
      const vs = byId.get(r.c.id);
      if (failure) record(r.c, "unsure", failure);
      else if (!vs || vs.length !== 1) record(r.c, "unsure", vs ? "judge returned duplicate verdicts for this note" : "judge returned no verdict for this note");
      else if (vs[0]!.verdict !== "same" && vs[0]!.verdict !== "different" && vs[0]!.verdict !== "unsure") record(r.c, "unsure", "judge returned an invalid verdict");
      else record(r.c, vs[0]!.verdict, typeof vs[0]!.reason === "string" && vs[0]!.reason.trim() ? vs[0]!.reason.slice(0, 300) : "no reason given");
    }
  }
  return keep;
}

export const NOTE_JUDGE_JOB_KIND = "note-judge";
export const NOTE_JUDGE_PROMPT = [
  "You are a strict meaning checker for a knowledge base. For each item you get a generated NOTE and the SOURCE sentence(s) it cites",
  "(a quote with surrounding transcript text). Decide whether the NOTE, read on its own, asserts the same thing the source asserts.",
  "Pay particular attention to polarity and negation: not, never, no, n't, without, nahi; modals and conditions: if, unless, only, except, might;",
  "a retraction or correction in the following sentence (\"Wrong.\", \"I disagree.\", \"Not for freshers though.\"); a quote cut off before the word that negates or",
  "qualifies it; a question presented as a statement; a proposal or suggestion presented as a decision or a fact.",
  "Answer \"same\" ONLY if a reader of the note alone would believe exactly what the source says. Answer \"different\" if the meaning, polarity, scope or",
  "condition differs. Answer \"unsure\" if you cannot tell. Never guess \"same\".",
  'Reply with ONLY JSON: {"verdicts":[{"id":"<id>","verdict":"same|different|unsure","reason":"<one short sentence>"}]} with exactly one verdict per id.',
].join(" ");

/** The LLM adapter: `complete` is injected and routed by job kind "note-judge" (config/ai-routing.yaml). Malformed output becomes "unsure" per note. */
export function createLlmNoteJudge(complete: (job: Job) => Promise<CompleteResult>): NoteJudge {
  return async (batch) => {
    const r = await complete({ kind: NOTE_JUDGE_JOB_KIND, messages: [{ role: "system", content: NOTE_JUDGE_PROMPT }, { role: "user", content: JSON.stringify({ items: batch }) }] });
    let parsed: unknown;
    try { parsed = r.json ?? parseJsonLoose(r.text); } catch { parsed = undefined; }
    const rows = typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { verdicts?: unknown }).verdicts) ? (parsed as { verdicts: unknown[] }).verdicts : [];
    const verdicts: NoteJudgeOutput[] = [];
    for (const row of rows) {
      const o = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : undefined;
      if (o && typeof o.id === "string" && batch.some((b) => b.id === o.id)) verdicts.push({ id: o.id, verdict: o.verdict as NoteVerdict, reason: typeof o.reason === "string" ? o.reason : "" });
    }
    return { verdicts, costUsd: r.costUsd, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, model: `${r.provider}/${r.model}` };
  };
}
