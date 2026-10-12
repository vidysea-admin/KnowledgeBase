/**
 * T-040: evidence resolution through the strict quote verifier (quote/quote-verify.ts).
 *
 * `grounded.ts` accepts a quote with `turn.text.includes(quote)`. This module is the stricter gate used by
 * the drop-unverified path: a quote counts only if `verifyQuote` verifies it inside the CITED turn (word and
 * token boundaries, 12 code points / 2 tokens minimum, no stitched ellipsis, no cross-turn match), and, when
 * windows were submitted, entirely inside a submitted span. The emitted quote is always the exact slice of the
 * source turn (`turn.text.slice(start, end)`), never the model's string, so typography differences cannot
 * smuggle in a non-source quote. It proves occurrence, not that the excerpt keeps the speaker's meaning.
 */
import type { Turns, QuotedEvidence, CitedItem, QaEntry } from "@lkb/core";
import { verifyQuote, normaliseForQuote } from "../quote/quote-verify.js";
import { runtimeOrigin, type RuntimeSpan } from "../grounded.js";

export type NonEmptyEvidence = [QuotedEvidence, ...QuotedEvidence[]];
export type Resolved = { ok: true; evidence: NonEmptyEvidence; claimed: string[] } | { ok: false; reason: string };
export const MAX_EVIDENCE_PER_ITEM = 8;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Resolve model-claimed evidence against the source turns; never throws. */
export function resolveEvidence(value: unknown, turns: Turns[], spans?: RuntimeSpan[]): Resolved {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, reason: "no evidence" };
  if (value.length > MAX_EVIDENCE_PER_ITEM) return { ok: false, reason: "too many evidence entries" };
  const evidence: QuotedEvidence[] = [], claimed: string[] = [], seen = new Set<string>();
  for (const raw of value) {
    if (!isObj(raw) || typeof raw.turnId !== "string" || typeof raw.sessionId !== "string" || typeof raw.quote !== "string") return { ok: false, reason: "malformed evidence entry" };
    const turn = turns.find((t) => t._id === raw.turnId && t.sessionId === raw.sessionId);
    if (!turn) return { ok: false, reason: "cited turn is not in this session" };
    const verdict = verifyQuote([{ id: turn._id, text: turn.text, speakerRef: turn.speakerRef }], { text: raw.quote, speakerRef: turn.speakerRef });
    if (!verdict.ok) return { ok: false, reason: `quote refused: ${verdict.reason}` };
    const where = verdict.locations.find((l) => l.turnId === turn._id && (!spans || spans.some((s) => s.turnId === turn._id && s.from <= l.start && l.end <= s.to)));
    if (!where) return { ok: false, reason: "quote lies outside the submitted spans" };
    const quote = turn.text.slice(where.start, where.end);
    const key = JSON.stringify([turn._id, quote]);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({ turnId: turn._id, sessionId: turn.sessionId, quote });
    claimed.push(raw.quote);
  }
  return { ok: true, evidence: evidence as NonEmptyEvidence, claimed };
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
export function auditGroundedNotes(page: { citedItems?: CitedItem[]; qa?: QaEntry[] }, turns: Turns[]): string[] {
  const problems: string[] = [], ids = new Set<string>();
  const check = (label: string, text: string, ev: ReadonlyArray<QuotedEvidence>) => {
    const r = resolveEvidence(ev, turns);
    if (!r.ok) return void problems.push(`${label}: ${r.reason}`);
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
    check(`qa ${q.id} question`, q.question, q.questionEvidence);
    if (q.status === "unanswered") { if (q.answer !== null || q.answerEvidence.length) problems.push(`qa ${q.id}: unanswered carries an answer`); }
    else if (q.answer === null) problems.push(`qa ${q.id}: answered without answer`);
    else check(`qa ${q.id} answer`, q.answer, q.answerEvidence);
  }
  return problems;
}
