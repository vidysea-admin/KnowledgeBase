/**
 * packages/index/src/pipeline/speaker-rules/speakers-grounding.ts -- the DETERMINISTIC grounding layer of U2.4 (D-132).
 * Split out of speakers-grounded.ts unchanged: parses proposer output and keeps only entries whose label, name and
 * verbatim quote survive the checks documented at the top of speakers-grounded.ts. No model, no verifier.
 */
import type { Turns } from "@lkb/core";
import { containsNameVerbatim, isDiscourseOnly, looksLikeAName, nameOccurrences } from "../speaker-name-rules.js";
import { citesNameAsSelfIdentification } from "../speaker-relation-rules.js";
import { isReportedAt } from "./speaker-reported-rules.js";

export type EvidenceKind = "self-intro" | "called-on" | "address" | "handover" | "thanks" | "role-continuity";
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ["self-intro", "called-on", "address", "handover", "thanks", "role-continuity"];

export const POSITIONAL = /^spk:\d+$/;
const MIN_QUOTE_WORDS = 3;
const MAX_QUOTE_CHARS = 500;
/** A quote must be this many turns from a block of the label (1 = the immediately adjacent turn; a backchannel in between breaks the binding). */
export const MAX_DISTANCE = 1;

type Block = { startTurnIndex: number; endTurnIndex: number };

function blocksByLabel(turns: Turns[]): Map<string, Block[]> {
  const out = new Map<string, Block[]>();
  let cur: { label: string; s: number; e: number } | null = null;
  const close = () => { if (cur) out.set(cur.label, [...(out.get(cur.label) ?? []), { startTurnIndex: cur.s, endTurnIndex: cur.e }]); cur = null; };
  for (let i = 0; i < turns.length; i++) {
    const ref = turns[i]?.speakerRef ?? "";
    if (!POSITIONAL.test(ref)) { close(); continue; }
    if (cur && cur.label === ref) cur.e = i; else { close(); cur = { label: ref, s: i, e: i }; }
  }
  close();
  return out;
}

/** Case-fold, straighten apostrophes/quotes, collapse whitespace; `map[i]` = original index of normalized char i. */
export function normalizeWithMap(raw: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i] ?? "";
    if (/\s/u.test(ch)) { if (norm.length > 0) pendingSpace = true; continue; }
    if (ch === "’" || ch === "‘") ch = "'";
    if (ch === "“" || ch === "”") ch = '"';
    if (pendingSpace) { norm += " "; map.push(i); pendingSpace = false; }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

const normQuote = (q: string): string => normalizeWithMap(q).norm;
export const personTokens = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);
export const tokenOverlap = (a: string, b: string): boolean => {
  const [x, y] = [personTokens(a.toLowerCase()), personTokens(b.toLowerCase())];
  const sub = (s: string[], big: string[]) => { for (let i = 0; i + s.length <= big.length; i++) if (s.every((t, k) => big[i + k] === t)) return true; return false; };
  return x.length > 0 && y.length > 0 && (sub(x, y) || sub(y, x));
};

/** `spk:2`, `[spk:2]`, `Speaker 2`, `speaker_2` -> `spk:2`; anything else is returned trimmed. */
export function normalizeLabel(raw: string): string {
  const m = /^\W*(?:spk|speaker)[\s:_#-]*(\d+)\W*$/iu.exec(raw.trim());
  return m ? `spk:${m[1]}` : raw.trim();
}

interface Entry { label: string; name: string; quote: string; kind: EvidenceKind }
function readEntry(e: unknown): Entry | null {
  if (typeof e !== "object" || e === null) return null;
  const r = e as Record<string, unknown>;
  if (typeof r.label !== "string" || typeof r.name !== "string" || typeof r.evidenceQuote !== "string" || typeof r.evidenceKind !== "string") return null;
  if (!EVIDENCE_KINDS.includes(r.evidenceKind as EvidenceKind)) return null;
  const [name, quote] = [r.name.trim(), r.evidenceQuote.trim()];
  if (!name || !quote || quote.length > MAX_QUOTE_CHARS) return null;
  return { label: normalizeLabel(r.label), name, quote, kind: r.evidenceKind as EvidenceKind };
}

/** A candidate piece of evidence that passed the deterministic layer. */
export interface Candidate {
  label: string; name: string; kind: EvidenceKind; quote: string;
  turnIdx: number; turnId: string; sessionId: string; speaker: string;
  block: Block; side: "inside" | "before" | "after"; run: number;
}

/** Distinct OTHER person names in a span: mid-sentence capitalised words (or known names) outside `name`. */
export function otherNamesIn(span: string, name: string, known: Set<string>): string[] {
  const own = new Set(personTokens(name).map((t) => t.toLowerCase()));
  const found = new Set<string>();
  const re = /\p{Lu}[\p{L}'’-]*/gu;
  for (let m = re.exec(span); m; m = re.exec(span)) {
    const w = m[0];
    const lw = w.toLowerCase();
    if (own.has(lw) || w === "I" || /^I['’]/.test(w) || isDiscourseOnly(w)) continue;
    const sentenceInitial = /(?:^|[.!?]["')\]]*\s+)$/u.test(span.slice(0, m.index));
    const vocative = /^\s*,/u.test(span.slice(m.index + w.length));   // "Rashi, can you..." opens with a person
    if (sentenceInitial && !known.has(lw) && !vocative) continue;
    if (looksLikeAName(w)) found.add(lw);
  }
  return [...found];
}

function candidatesFor(turns: Turns[], blocks: Map<string, Block[]>, fullText: string, ambiguous: Set<string>, known: Set<string>, positional: Set<string>, en: Entry, run: number): Candidate[] {
  if (!looksLikeAName(en.name) || isDiscourseOnly(en.name)) return [];
  if (!containsNameVerbatim(fullText, en.name)) return [];                        // the whole name is spoken somewhere
  if (en.quote.split(/\s+/).filter(Boolean).length < MIN_QUOTE_WORDS) return [];
  const q = normQuote(en.quote);
  const out: Candidate[] = [];
  for (let k = 0; k < turns.length; k++) {
    const turn = turns[k];
    if (!turn) continue;
    const { norm, map } = normalizeWithMap(turn.text ?? "");
    const at0 = norm.indexOf(q);
    if (at0 === -1) continue;                                                      // quote must sit inside ONE turn
    const [spanStart, spanEnd] = [map[at0] ?? 0, (map[at0 + q.length - 1] ?? 0) + 1];
    const text = (turn.text ?? "").replaceAll("’", "'");
    const span = text.slice(spanStart, spanEnd);

    // Label: a bare-name or "[Name]" label means "the speaker of this quote", valid only for a self-intro.
    let label = en.label;
    if (!positional.has(label)) {
      const bare = label.replace(/^\W+|\W+$/gu, "");
      if (en.kind !== "self-intro" || !bare || !tokenOverlap(bare, en.name) || !POSITIONAL.test(turn.speakerRef ?? "")) continue;
      label = turn.speakerRef;
    }
    const labelBlocks = blocks.get(label);
    if (!labelBlocks) continue;

    const refs = containsNameVerbatim(span, en.name)
      ? [en.name]
      : personTokens(en.name).filter((t) => t.length >= 3 && !ambiguous.has(t.toLowerCase()) && looksLikeAName(t) && !isDiscourseOnly(t) && containsNameVerbatim(span, t));
    if (refs.length === 0) continue;
    if (!refs.some((r) => nameOccurrences(text, r).some((at) => at >= spanStart && at + r.length <= spanEnd && !isReportedAt(text, r, at)))) continue;

    const mk = (block: Block, side: Candidate["side"]): Candidate => ({ label, name: en.name, kind: en.kind, quote: en.quote, turnIdx: k, turnId: turn._id, sessionId: turn.sessionId, speaker: turn.speakerRef, block, side, run });
    if (en.kind === "self-intro") {
      const inBlock = labelBlocks.find((b) => k >= b.startTurnIndex && k <= b.endTurnIndex);
      if (inBlock && turn.speakerRef === label && refs[0] === en.name && citesNameAsSelfIdentification(turn.text ?? "", en.name)) out.push(mk(inBlock, "inside"));
      continue;
    }
    if (turn.speakerRef === label) continue;                                       // a speaker is not identified by their own words
    if (otherNamesIn(span, en.name, known).length > 0) continue;                   // two people in one quote: abstain
    const before = labelBlocks.filter((b) => b.startTurnIndex > k && b.startTurnIndex - k <= MAX_DISTANCE).sort((a, b) => a.startTurnIndex - b.startTurnIndex)[0];
    const after = labelBlocks.filter((b) => b.endTurnIndex < k && k - b.endTurnIndex <= MAX_DISTANCE).sort((a, b) => b.endTurnIndex - a.endTurnIndex)[0];
    if (before) out.push(mk(before, "before"));
    if (after) out.push(mk(after, "after"));
  }
  return out;
}

/** The deterministic layer, per proposer run. Exported for tests and offline replay. */
export function groundCandidates(turns: Turns[], runs: unknown[]): { candidates: Candidate[][]; positional: string[] } {
  const positional = [...new Set(turns.map((t) => t.speakerRef).filter((r): r is string => POSITIONAL.test(r ?? "")))].sort();
  const pos = new Set(positional);
  const blocks = blocksByLabel(turns);
  const fullText = turns.map((t) => t.text ?? "").join("\n").replaceAll("’", "'");
  const parsed = runs.map((run) => (Array.isArray(run) ? run : []).map(readEntry).filter((e): e is Entry => e !== null));

  // A name token proposed under two different names cannot stand alone as a reference.
  const tokenOwners = new Map<string, Set<string>>();
  for (const e of parsed.flat()) for (const t of personTokens(e.name)) tokenOwners.set(t.toLowerCase(), (tokenOwners.get(t.toLowerCase()) ?? new Set()).add(e.name.toLowerCase()));
  const ambiguous = new Set([...tokenOwners].filter(([, owners]) => owners.size > 1).map(([t]) => t));
  // Known person names: everything proposed, plus every non-positional speaker label.
  const known = new Set<string>([...tokenOwners.keys()]);
  for (const t of turns) if (t.speakerRef && !POSITIONAL.test(t.speakerRef)) for (const tok of personTokens(t.speakerRef)) known.add(tok.toLowerCase());

  return { positional, candidates: parsed.map((run, ri) => run.flatMap((en) => candidatesFor(turns, blocks, fullText, ambiguous, known, pos, en, ri))) };
}

/** Two pieces are independent witnesses: different quote speakers AND opposite sides of the block (host + cohost are one handover). */
export function independent(a: Candidate, b: Candidate): boolean {
  return a.turnIdx !== b.turnIdx && a.speaker !== b.speaker && a.side !== b.side && a.side !== "inside" && b.side !== "inside";
}
