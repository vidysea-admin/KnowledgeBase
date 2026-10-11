/**
 * packages/index/src/pipeline/quote-verify.ts — T-040 slice: a STRICT verbatim-quote verifier.
 * Pure, unwired, total (never throws), no model, no I/O. Not called from summarize.ts.
 *
 * Given source turns and quotes a model CLAIMS are verbatim, report for each quote either where it
 * occurs (turn id + UTF-16 offsets into that turn's ORIGINAL text) or a typed refusal reason.
 *
 * MATCH RULES
 *  1. Exact substring match on normalised text. No case folding, no stemming, no fuzzy matching.
 *  2. The ONLY normalisation (applied identically to source and quote, loss-free for meaning):
 *     a. Unicode NFC, per grapheme cluster (canonically equivalent encodings compare equal).
 *     b. Every run of whitespace (/\s/u) becomes ONE space. A run never disappears, so word
 *        boundaries and word order are preserved; leading/trailing whitespace of a quote or turn
 *        is trimmed.
 *     c. Curly single quotes (U+2018 U+2019 U+201A U+201B) become ' and curly double quotes
 *        (U+201C U+201D U+201E U+201F) become " (typography only, an ASR/LLM round trip changes them).
 *     d. Dash variants (U+2010..U+2015, U+2212) become "-" (typography only).
 *     Nothing touches letters or digits and nothing deletes a non-space character, so two strings
 *     with a different letter, digit, word order or word count never become equal.
 *     NOT normalised on purpose: case, NFKC compatibility forms, zero-width characters, accents.
 *  3. A quote is searched per turn. A quote that only matches across a turn boundary is REFUSED
 *     ("spans-turn-boundary"); a match never crosses speakers.
 *  4. A quote containing an ellipsis ("..." or U+2026) is verified only if that exact ellipsis
 *     occurs in the source; otherwise it is REFUSED ("ellipsis-stitched"); passages are never stitched.
 *  5. Minimum length: 12 code points AND 2 tokens after normalisation, so a one-word "quote"
 *     cannot pass. Maximum 2000 UTF-16 units.
 *  6. A match must start and end on a grapheme-cluster boundary and on a TOKEN boundary: it may not
 *     begin or end inside a word, number, e-mail, URL, handle or hyphenated/apostrophe word, so
 *     "reven" is not a quote of "revenue" and "the price is 3" is not a quote of "the price is 3.5"
 *     (clauses C1-C4 in quote-token-rule.ts; refuses when in doubt).
 *  7. A quote occurring in several places reports the locations BY THE CLAIMED SPEAKER (all of them
 *     when no speaker is claimed), in source order, up to MAX_LOCATIONS, then `truncated: true`.
 *     The speaker filter runs BEFORE the cap, so a hit by the claimed speaker is never hidden.
 *  8. WRAPPERS: if the quote as given does not verify and it is wrapped in ONE matching pair of
 *     quotation marks (" or ', curly forms included) with no further mark of that kind inside, the
 *     inside is verified instead (length rules apply to the inside) and the verdict says
 *     `unwrapped: true`. Nothing else is stripped: no full stop, no ellipsis, no inner whitespace
 *     change beyond the normal trim. A quote verbatim WITH its marks in the source verifies as given.
 *
 * COMPLEXITY: building the index is O(n) in source length, each quote is one KMP pass
 * O(n + m); there is no backtracking, so no quadratic or exponential input exists.
 */
import { cutInsideToken } from "./quote-token-rule.js";

export interface QuoteSourceTurn { id: string; text: string; speakerRef?: string }
export type ClaimedQuote = string | { text: string; speakerRef?: string };
export type QuoteRefusal =
  | "not-a-string" | "empty" | "too-short" | "too-long" | "invalid-characters"
  | "ellipsis-stitched" | "spans-turn-boundary" | "partial-word" | "wrong-speaker" | "not-found";
export interface QuoteLocation { turnId: string; turnIndex: number; start: number; end: number; speakerRef?: string }
export type QuoteVerdict =
  | { ok: true; quote: string; locations: QuoteLocation[]; truncated: boolean; unwrapped: boolean }
  | { ok: false; quote: string; reason: QuoteRefusal };

export const MIN_QUOTE_CODE_POINTS = 12;
export const MIN_QUOTE_TOKENS = 2;
export const MAX_QUOTE_LENGTH = 2000;
export const MAX_LOCATIONS = 20;

const CURLY_SINGLE = /[‘’‚‛]/g;
const CURLY_DOUBLE = /[“”„‟]/g;
const DASHES = /[‐-―−]/g;
const WS = /^\s+$/u;
const NON_ASCII = /[^\x00-\x7f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const ELLIPSIS = /\.{3}|…/;
let segmenter: Intl.Segmenter | undefined;

function normPiece(g: string): string {
  const n = g.normalize("NFC");
  return n.replace(CURLY_SINGLE, "'").replace(CURLY_DOUBLE, '"').replace(DASHES, "-");
}

interface Piece { nStart: number; nEnd: number; oStart: number; oEnd: number }
interface Range { turnIndex: number; gStart: number; gEnd: number; p0: number; p1: number }
interface Index { g: string; pieces: Piece[]; ranges: Range[]; turns: QuoteSourceTurn[] }

function graphemes(text: string): string[] {
  if (!NON_ASCII.test(text)) return Array.from(text);
  segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
  const out: string[] = [];
  for (const s of segmenter.segment(text)) out.push(s.segment);
  return out;
}

/** Normalise one string into pieces (one per grapheme or whitespace run) with original offsets. */
function normaliseWithMap(text: string): { str: string; pieces: Piece[] } {
  const pieces: Piece[] = [];
  const parts: string[] = [];
  let n = 0;
  let o = 0;
  let lastWs = false;
  for (const g of graphemes(text)) {
    const oEnd = o + g.length;
    if (WS.test(g)) {
      if (lastWs) { pieces[pieces.length - 1]!.oEnd = oEnd; }
      else { pieces.push({ nStart: n, nEnd: n + 1, oStart: o, oEnd }); parts.push(" "); n += 1; lastWs = true; }
    } else {
      const s = normPiece(g);
      pieces.push({ nStart: n, nEnd: n + s.length, oStart: o, oEnd });
      parts.push(s); n += s.length; lastWs = false;
    }
    o = oEnd;
  }
  while (pieces.length && parts[parts.length - 1] === " ") { pieces.pop(); parts.pop(); }
  let lead = 0;
  while (lead < pieces.length && parts[lead] === " ") lead++;
  const kept = pieces.slice(lead);
  const shift = lead ? kept[0]?.nStart ?? 0 : 0;
  for (const p of kept) { p.nStart -= shift; p.nEnd -= shift; }
  return { str: parts.slice(lead).join(""), pieces: kept };
}

function buildIndex(turns: QuoteSourceTurn[]): Index {
  const chunks: string[] = [];
  const pieces: Piece[] = [];
  const ranges: Range[] = [];
  let g = 0;
  turns.forEach((t, turnIndex) => {
    const text = typeof t?.text === "string" ? t.text : "";
    const { str, pieces: ps } = normaliseWithMap(text);
    if (ps.length === 0) return;
    if (chunks.length) { chunks.push(" "); g += 1; }
    const p0 = pieces.length;
    for (const p of ps) pieces.push({ nStart: p.nStart + g, nEnd: p.nEnd + g, oStart: p.oStart, oEnd: p.oEnd });
    ranges.push({ turnIndex, gStart: g, gEnd: g + str.length, p0, p1: pieces.length });
    chunks.push(str); g += str.length;
  });
  return { g: chunks.join(""), pieces, ranges, turns };
}

/** Normalise a quote (same rules as the source). Returns undefined when it is not even checkable. */
function normaliseQuote(q: string): { str: string } | QuoteRefusal {
  if (q.length > MAX_QUOTE_LENGTH) return "too-long";
  if (LONE_SURROGATE.test(q)) return "invalid-characters";
  for (const ch of q) if (/\p{Cc}/u.test(ch) && !/\s/.test(ch)) return "invalid-characters";
  const { str } = normaliseWithMap(q);
  if (str === "") return "empty";
  return { str };
}
const tooShort = (s: string): boolean => [...s].length < MIN_QUOTE_CODE_POINTS || s.split(" ").length < MIN_QUOTE_TOKENS;

/** The inside of ONE matching pair of wrapping quotation marks (normalised form), else undefined. */
function unwrap(str: string): string | undefined {
  const o = str.charAt(0);
  if (str.length < 3 || (o !== '"' && o !== "'") || str.charAt(str.length - 1) !== o) return undefined;
  const inner = str.slice(1, -1);
  return inner.includes(o) ? undefined : inner.trim();
}

/** KMP: all (possibly overlapping) start offsets of `pat` in `text`, up to `cap`. O(n + m). */
function findAll(text: string, pat: string, cap: number): number[] {
  const m = pat.length;
  const fail = new Int32Array(m);
  for (let i = 1, k = 0; i < m; i++) {
    while (k > 0 && pat.charCodeAt(i) !== pat.charCodeAt(k)) k = fail[k - 1]!;
    if (pat.charCodeAt(i) === pat.charCodeAt(k)) k++;
    fail[i] = k;
  }
  const hits: number[] = [];
  for (let i = 0, k = 0; i < text.length; i++) {
    while (k > 0 && text.charCodeAt(i) !== pat.charCodeAt(k)) k = fail[k - 1]!;
    if (text.charCodeAt(i) === pat.charCodeAt(k)) k++;
    if (k === m) { hits.push(i - m + 1); if (hits.length >= cap) break; k = fail[k - 1]!; }
  }
  return hits;
}

function pieceContaining(ix: Index, r: Range, idx: number): number {
  let lo = r.p0, hi = r.p1 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = ix.pieces[mid]!;
    if (idx < p.nStart) hi = mid - 1; else if (idx >= p.nEnd) lo = mid + 1; else return mid;
  }
  return -1;
}
function rangeContaining(ix: Index, a: number): Range | undefined {
  let lo = 0, hi = ix.ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ix.ranges[mid]!;
    if (a < r.gStart) hi = mid - 1; else if (a >= r.gEnd) lo = mid + 1; else return r;
  }
  return undefined;
}

function locate(ix: Index, a: number, b: number): "ok" | "cross" | "partial" | { loc: QuoteLocation } {
  const r = rangeContaining(ix, a);
  if (!r) return "cross";
  if (b > r.gEnd) return "cross";
  const firstP = pieceContaining(ix, r, a);
  const lastP = pieceContaining(ix, r, b - 1);
  if (firstP < 0 || lastP < 0 || ix.pieces[firstP]!.nStart !== a || ix.pieces[lastP]!.nEnd !== b) return "partial";
  if (cutInsideToken(ix.g, a) || cutInsideToken(ix.g, b)) return "partial";
  const t = ix.turns[r.turnIndex]!;
  const loc: QuoteLocation = { turnId: String(t.id), turnIndex: r.turnIndex, start: ix.pieces[firstP]!.oStart, end: ix.pieces[lastP]!.oEnd };
  if (t.speakerRef !== undefined) loc.speakerRef = t.speakerRef;
  return { loc };
}

/** Verify one NORMALISED string. `speaker` filters BEFORE the location cap. */
function attempt(ix: Index, str: string, speaker: string | undefined, text: string): QuoteVerdict {
  const fail = (reason: QuoteRefusal): QuoteVerdict => ({ ok: false, quote: text, reason });
  if (tooShort(str)) return fail("too-short");
  const locations: QuoteLocation[] = [];
  let cross = false, partial = false, otherSpeaker = false, truncated = false;
  for (const a of findAll(ix.g, str, Infinity)) {
    const res = locate(ix, a, a + str.length);
    if (res === "cross") cross = true;
    else if (res === "partial") partial = true;
    else if (typeof res === "object") {
      if (speaker !== undefined && res.loc.speakerRef !== speaker) { otherSpeaker = true; continue; }
      if (locations.length >= MAX_LOCATIONS) { truncated = true; break; }
      locations.push(res.loc);
    }
  }
  if (locations.length > 0) return { ok: true, quote: text, locations, truncated, unwrapped: false };
  if (otherSpeaker) return fail("wrong-speaker");
  if (ELLIPSIS.test(str) && !cross && !partial) return fail("ellipsis-stitched");
  return fail(cross ? "spans-turn-boundary" : partial ? "partial-word" : ELLIPSIS.test(str) ? "ellipsis-stitched" : "not-found");
}

function verifyOne(ix: Index, claimed: ClaimedQuote): QuoteVerdict {
  const text = typeof claimed === "string" ? claimed : claimed?.text;
  if (typeof text !== "string") return { ok: false, quote: "", reason: "not-a-string" };
  const speaker = typeof claimed === "string" ? undefined : claimed.speakerRef;
  const nq = normaliseQuote(text);
  if (typeof nq === "string") return { ok: false, quote: text, reason: nq };
  const whole = attempt(ix, nq.str, speaker, text);
  if (whole.ok) return whole;
  const inner = unwrap(nq.str);
  if (inner === undefined) return whole;
  const stripped = attempt(ix, inner, speaker, text);
  if (stripped.ok) return { ...stripped, unwrapped: true };
  return stripped.reason === "too-short" ? stripped : whole;
}

/** Total: never throws; one verdict per input quote, in order. */
export function verifyQuotes(turns: QuoteSourceTurn[], quotes: ClaimedQuote[]): QuoteVerdict[] {
  let ix: Index;
  try { ix = buildIndex(Array.isArray(turns) ? turns : []); }
  catch { return (Array.isArray(quotes) ? quotes : []).map((q) => ({ ok: false as const, quote: typeof q === "string" ? q : "", reason: "not-found" as const })); }
  return (Array.isArray(quotes) ? quotes : []).map((q) => {
    try { return verifyOne(ix, q); }
    catch { return { ok: false as const, quote: typeof q === "string" ? q : "", reason: "invalid-characters" as const }; }
  });
}

export function verifyQuote(turns: QuoteSourceTurn[], quote: ClaimedQuote): QuoteVerdict {
  return verifyQuotes(turns, [quote])[0]!;
}

/** Exposed for tests/proofs: the normalised form used for comparison. */
export function normaliseForQuote(text: string): string {
  try { return normaliseWithMap(String(text)).str; } catch { return ""; }
}
