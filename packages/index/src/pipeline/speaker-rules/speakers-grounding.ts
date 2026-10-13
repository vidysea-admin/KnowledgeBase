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
  /** The quote carries a forward cue ("over to X"): it may only be paired with evidence about the SAME block. */
  forward?: boolean;
}

/** Distinct OTHER person names in a span: mid-sentence capitalised words (or known names) outside `name`. */
export function otherNamesIn(spanRaw: string, nameRaw: string, known: Set<string>): string[] {
  // ISS-U24SMART5-001: compare in NFC with joiners stripped, so a decomposed or ZWJ-laden Devanagari word equals its composed form.
  const span = fold(spanRaw);
  const name = fold(nameRaw);
  const own = new Set(personTokens(name).map((t) => t.toLowerCase()));
  const knownN = new Set([...known].map((k) => fold(k).toLowerCase()));
  const found = new Set<string>();
  const re = /\p{Lu}[\p{L}'’-]*/gu;
  for (let m = re.exec(span); m; m = re.exec(span)) {
    const w = m[0];
    const lw = w.toLowerCase();
    if (own.has(lw) || w === "I" || /^I['’]/.test(w) || isDiscourseOnly(w)) continue;
    const sentenceInitial = /(?:^|[.!?]["')\]]*\s+)$/u.test(span.slice(0, m.index));
    const vocative = /^\s*,/u.test(span.slice(m.index + w.length));   // "Rashi, can you..." opens with a person
    if (sentenceInitial && !knownN.has(lw) && !vocative) continue;
    if (looksLikeAName(w)) found.add(lw);
  }
  // ISS-U24SMART-005: a second name needs no capital. Any word that is a session candidate name (case-insensitive), or the
  // word after a Hinglish conjunction ("aap aur ruby"), is a second person -> abstain (a false abstain is cheap).
  // ISS-U24SMART5-001: words are letters PLUS combining marks (Devanagari vowel signs/viramas are \p{M}, not \p{L}).
  const wordRe = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
  const words: { w: string; at: number }[] = [];
  for (let m = wordRe.exec(span); m; m = wordRe.exec(span)) words.push({ w: m[0].toLowerCase(), at: m.index });
  for (const { w: lw } of words) {
    if (!own.has(lw) && lw.length >= 3 && knownN.has(lw) && !isDiscourseOnly(lw) && !NOT_A_SECOND_NAME.has(lw)) found.add(lw);
  }
  const isConj = (w: string) => LATIN_CONJ.has(w) || DEVA_CONJ.has(w);
  const isNameLike = (w: string): boolean => {
    if (own.has(w) || isDiscourseOnly(w) || NOT_A_SECOND_NAME.has(w)) return false;
    return DEVANAGARI.test(w) ? w.length >= 2 : w.length >= 3;
  };
  for (let i = 0; i + 1 < words.length; i++) {
    const [cur, nxt] = [words[i]?.w ?? "", words[i + 1]?.w ?? ""];
    // "<conj> X": X, in any script, is a second person unless it is a function word. The English conjunctions only count
    // before a Devanagari word ("Rashi and प्रिया"): "and the" / "or if" are ordinary prose, and Latin names already hit the capital rule.
    if (isConj(cur) && (!ENGLISH_CONJ.has(cur) || DEVANAGARI.test(nxt)) && isNameLike(nxt)) found.add(nxt);
    // "X <conj> OWN": the Devanagari token BEFORE a Devanagari conjunction is a second person too, when the token after the
    // conjunction is the proposed name or a known candidate ("प्रिया और Rashi").
    if (DEVA_CONJ.has(nxt) && words[i + 2] && DEVANAGARI.test(cur) && isNameLike(cur)) {
      const after = words[i + 2]?.w ?? "";
      if (own.has(after) || knownN.has(after)) found.add(cur);
    }
  }
  return [...found];
}
const DEVANAGARI = /[\u0900-\u097F]/u;
/** NFC + strip zero-width joiners/non-joiners and soft hyphens. */
const fold = (s: string): string => s.normalize("NFC").replace(/[\u200B-\u200D\u00AD\uFEFF]/gu, "");
const ENGLISH_CONJ = new Set(["and", "or", "with"]);
const LATIN_CONJ = new Set(["aur", "ya", "evam", "tatha", ...ENGLISH_CONJ]);
const DEVA_CONJ = new Set(["और", "या", "एवं", "तथा", "व"].map((c) => c.normalize("NFC")));
/** Hinglish / Hindi function words that follow a conjunction without being a person. */
const NOT_A_SECOND_NAME = new Set(["main", "mein", "hum", "aap", "yeh", "woh", "ese", "kal", "aaj", "sab", "sabhi", "kuch", "koi", "mere", "apne", "hamare", "humare", "unka", "unki", "uska", "uski", "bhi", "phir", "abhi", "ek", "kya", "kaise", "thoda", "zyada", "bahut", "isse", "usse", "isko", "usko", "unko", "inko", "mujhe", "tumhe", "aapko", "humein",
  ...["मैं", "मै", "हम", "आप", "तुम", "यह", "ये", "वह", "वो", "यहाँ", "वहाँ", "कल", "आज", "सब", "सभी", "कुछ", "कोई", "मेरे", "मेरा", "मेरी", "अपने", "अपना", "अपनी", "हमारे", "हमारा", "हमारी", "उनका", "उनकी", "उसका", "उसकी", "भी", "फिर", "अभी", "एक", "क्या", "कैसे", "थोड़ा", "ज़्यादा", "ज्यादा", "बहुत", "इसे", "उसे", "इसको", "उसको", "उनको", "इनको", "मुझे", "तुम्हें", "आपको", "हमें", "यह", "इस", "उस", "तो", "ही", "नहीं", "है", "हैं", "था", "थी", "थे", "को", "से", "में", "पर", "का", "की", "के", "ने", "कि", "जो", "जी", "सर", "मैम", "सवाल", "जवाब", "बात", "काम", "समय", "आगे", "पहले", "बाद", "अब", "अच्छा", "ठीक", "धन्यवाद", "शुक्रिया", "कृपया", "बताइए", "बताइये", "बताओ", "बोलिए", "बोलिये", "सुनिए", "देखिए", "आइए", "चलिए"].map((c) => c.normalize("NFC"))]);

/** A FORWARD cue ("over to X", "hand over", "next speaker", "invite"): a name after it is the NEXT speaker; a name before it is the addressee. */
const FORWARD_CUE = /\b(?:over to|hand(?:ing|s)? over|pass(?:ing)? (?:it |the mic )?(?:on )?to|next speaker|next presenter|next up|coming up next|welcome our next|invit(?:e|ed|es|ing))\b/iu;
/** "before" = the quote may only describe a block that FOLLOWS it; null = the quote names the addressee, bind nothing. */
export function forwardDirection(span: string, name: string): "before" | "any" | null {
  const cue = FORWARD_CUE.exec(span);
  if (!cue) return "any";
  const lower = span.toLowerCase();
  const refs = [name, ...personTokens(name).filter((t) => t.length >= 3)].map((r) => r.toLowerCase());
  const named = refs.flatMap((r) => { const at: number[] = []; for (let i = lower.indexOf(r); i >= 0; i = lower.indexOf(r, i + 1)) at.push(i); return at; });
  if (named.some((at) => at < cue.index)) return null;                              // "Rashi, over to our next speaker": Rashi is the one being addressed
  return "before";
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

    const mk = (block: Block, side: Candidate["side"]): Candidate => ({ label, name: en.name, kind: en.kind, quote: en.quote, turnIdx: k, turnId: turn._id, sessionId: turn.sessionId, speaker: turn.speakerRef, block, side, run, ...(FORWARD_CUE.test(span) ? { forward: true } : {}) });
    if (en.kind === "self-intro") {
      const inBlock = labelBlocks.find((b) => k >= b.startTurnIndex && k <= b.endTurnIndex);
      if (inBlock && turn.speakerRef === label && refs[0] === en.name && citesNameAsSelfIdentification(turn.text ?? "", en.name)) out.push(mk(inBlock, "inside"));
      continue;
    }
    if (turn.speakerRef === label) continue;                                       // a speaker is not identified by their own words
    if (otherNamesIn(span, en.name, known).length > 0) continue;                   // two people in one quote: abstain
    const dir = forwardDirection(span, en.name);
    if (dir === null) continue;
    const before = labelBlocks.filter((b) => b.startTurnIndex > k && b.startTurnIndex - k <= MAX_DISTANCE).sort((a, b) => a.startTurnIndex - b.startTurnIndex)[0];
    const after = labelBlocks.filter((b) => b.endTurnIndex < k && k - b.endTurnIndex <= MAX_DISTANCE).sort((a, b) => b.endTurnIndex - a.endTurnIndex)[0];
    if (before) out.push(mk(before, "before"));
    if (after && dir === "any") out.push(mk(after, "after"));
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
  return !((a.forward || b.forward) && a.block.startTurnIndex !== b.block.startTurnIndex) && a.turnIdx !== b.turnIdx && a.speaker !== b.speaker && a.side !== b.side && a.side !== "inside" && b.side !== "inside";
}
