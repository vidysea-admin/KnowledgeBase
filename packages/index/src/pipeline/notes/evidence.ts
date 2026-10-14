/**
 * T-040: evidence resolution through the strict quote verifier (quote/quote-verify.ts).
 *
 * `grounded.ts` accepts a quote with `turn.text.includes(quote)`. This module is the stricter gate used by
 * the drop-unverified path: a quote counts only if `verifyQuote` verifies it inside the CITED turn (word and
 * token boundaries, 12 code points / 2 tokens minimum, no stitched ellipsis, no cross-turn match), and, when
 * windows were submitted, entirely inside a submitted span. The emitted quote is always the exact slice of the
 * source turn (`turn.text.slice(start, end)`), never the model's string, so typography differences cannot
 * smuggle in a non-source quote. Cycle 1: the quote must also be a whole sentence/clause with no omitted negation or qualifier (sentence-span.ts).
 */
import type { Turns, QuotedEvidence, CitedItem, QaEntry } from "@lkb/core";
import { verifyQuote, normaliseForQuote } from "../quote/quote-verify.js";
import { sentenceSpanProblem, lexicalNegationProblem, type SpanProblem } from "./sentence-span.js";
import { runtimeOrigin, type RuntimeSpan } from "../grounded.js";

export type NonEmptyEvidence = [QuotedEvidence, ...QuotedEvidence[]];
/** `lexical` (judged mode only, D-151 pending append): the first lexical negation problem the rules found; the caller drops the note, after the judge has also seen it. */
export type Resolved = { ok: true; evidence: NonEmptyEvidence; claimed: string[]; lexical?: SpanProblem } | { ok: false; reason: string };
export const MAX_EVIDENCE_PER_ITEM = 8;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Resolve model-claimed evidence against the source turns; never throws. */
export function resolveEvidence(value: unknown, turns: Turns[], spans?: RuntimeSpan[], opts: { allowQuestion?: boolean; judged?: boolean } = {}): Resolved {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, reason: "no evidence" };
  if (value.length > MAX_EVIDENCE_PER_ITEM) return { ok: false, reason: "too many evidence entries" };
  const evidence: QuotedEvidence[] = [], claimed: string[] = [], seen = new Set<string>();
  let lexical: SpanProblem | undefined;
  for (const raw of value) {
    if (!isObj(raw) || typeof raw.turnId !== "string" || typeof raw.sessionId !== "string" || typeof raw.quote !== "string") return { ok: false, reason: "malformed evidence entry" };
    const turn = turns.find((t) => t._id === raw.turnId && t.sessionId === raw.sessionId);
    if (!turn) return { ok: false, reason: "cited turn is not in this session" };
    const verdict = verifyQuote([{ id: turn._id, text: turn.text, speakerRef: turn.speakerRef }], { text: raw.quote, speakerRef: turn.speakerRef });
    if (!verdict.ok) return { ok: false, reason: `quote refused: ${verdict.reason}` };
    const inSpan = verdict.locations.filter((l) => l.turnId === turn._id && (!spans || spans.some((s) => s.turnId === turn._id && s.from <= l.start && l.end <= s.to)));
    if (!inSpan.length) return { ok: false, reason: "quote lies outside the submitted spans" };
    // ISS-T040GEN-002: sentence/clause-span rule (manifest t040-strict-quote-verifier-and-windowing.md:82) + omitted-qualifier floor.
    const problems = inSpan.map((l) => sentenceSpanProblem(turn.text, l.start, l.end, opts));
    // D-151: in judged mode the structural rules above still gate; the lexical rules are evaluated too, preferring a location they accept.
    const structural = inSpan.filter((_, i) => problems[i] === null);
    const lex = opts.judged ? structural.map((l) => lexicalNegationProblem(turn.text, l.start, l.end)) : [];
    const pick = opts.judged ? Math.max(0, lex.indexOf(null)) : 0;
    const where = opts.judged ? structural[pick] : inSpan[problems.indexOf(null)];
    if (where && opts.judged && lex[pick] && !lexical) lexical = lex[pick]!;
    if (!where) return { ok: false, reason: `quote is not a whole sentence or clause: ${problems[0]}` };
    const quote = turn.text.slice(where.start, where.end);
    const key = JSON.stringify([turn._id, quote]);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({ turnId: turn._id, sessionId: turn.sessionId, quote });
    claimed.push(raw.quote);
  }
  return { ok: true, evidence: evidence as NonEmptyEvidence, claimed, ...(lexical ? { lexical } : {}) };
}

/** Extractive display text: equals the joined verified quotes (or the joined claimed quotes) modulo normalisation. */
export function extractiveText(text: unknown, r: Extract<Resolved, { ok: true }>): string | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const joined = r.evidence.map((e) => e.quote).join("\n"), n = normaliseForQuote(text);
  return n === normaliseForQuote(joined) || n === normaliseForQuote(r.claimed.join("\n")) ? joined : undefined;
}

/** Timestamp citations: every evidence entry resolved to its turn's start/end seconds. */
export function citationTimes(evidence: ReadonlyArray<QuotedEvidence>, turns: Turns[]): { turnId: string; tStart: number; tEnd: number }[] {
  return evidence.flatMap((e) => { const t = turns.find((x) => x._id === e.turnId && x.sessionId === e.sessionId); return t ? [{ turnId: t._id, tStart: t.tStart, tEnd: t.tEnd }] : []; });
}

/**
 * Independent post-hoc audit of an emitted page against its transcript: re-verifies every quote with the strict
 * verifier, checks extractiveness, the origin, the answered/unanswered coupling and id uniqueness.
 * Returns problems (empty = clean). Legacy pages (no citedItems/qa) audit clean.
 */
export function auditGroundedNotes(page: { citedItems?: CitedItem[]; qa?: QaEntry[] }, turns: Turns[], auditOpts: { judged?: boolean } = {}): string[] {
  const problems: string[] = [], ids = new Set<string>();
  const check = (label: string, text: string, ev: ReadonlyArray<QuotedEvidence>, allowQuestion = false) => {
    const r = resolveEvidence(ev, turns, undefined, { allowQuestion, ...(auditOpts.judged ? { judged: true } : {}) });
    if (!r.ok) return void problems.push(`${label}: ${r.reason}`);
    if (r.lexical) problems.push(`${label}: lexical negation check: ${r.lexical}`);
    if (r.evidence.some((e, i) => e.quote !== ev[i]!.quote) || r.evidence.length !== ev.length) problems.push(`${label}: quote is not the verbatim source slice`);
    if (extractiveText(text, r) !== text) problems.push(`${label}: text is not the joined quotes`);
    return r;
  };
  for (const it of page.citedItems ?? []) {
    if (ids.has(it.id)) problems.push(`${it.id}: duplicate id`); ids.add(it.id);
    const r = check(`item ${it.id}`, it.text, it.evidence);
    try { if (r && new Set(it.evidence.map((e) => runtimeOrigin(turns.find((t) => t._id === e.turnId)!))).size !== 1) problems.push(`item ${it.id}: mixed origins`); else if (r && runtimeOrigin(turns.find((t) => t._id === it.evidence[0].turnId)!) !== it.origin) problems.push(`item ${it.id}: origin mismatch`); }
    catch { problems.push(`item ${it.id}: origin unavailable`); }
    if (it.verification !== "unverified") problems.push(`item ${it.id}: verification`);
  }
  for (const q of page.qa ?? []) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`); ids.add(q.id);
    check(`qa ${q.id} question`, q.question, q.questionEvidence, true);
    if (q.status === "unanswered") { if (q.answer !== null || q.answerEvidence.length) problems.push(`qa ${q.id}: unanswered carries an answer`); }
    else if (q.answer === null) problems.push(`qa ${q.id}: answered without answer`);
    else check(`qa ${q.id} answer`, q.answer, q.answerEvidence);
  }
  return problems;
}
