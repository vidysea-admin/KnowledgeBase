/**
 * T-040 cycle 1 (ISS-T040GEN-002): the sentence/clause-span rule for emitted quotes.
 *
 * Written rule (qa/manifests/t040-strict-quote-verifier-and-windowing.md:82): "require the quote to span a whole
 * sentence or clause (start at turn start or after sentence punctuation, end at sentence punctuation or turn
 * end) ... and drop or flag quotes that fail."
 * `verifyQuote` proves only occurrence, so a quote that starts after "not" or ends before ", not down" verifies.
 * This module adds (1) that span rule and (2) a safety floor: the part of the SAME sentence the quote leaves out
 * must not contain a negation, modal or qualifier marker, even when the cut sits on a clause mark.
 */

/** Sentence and clause marks (the verifier's CLOSING set minus brackets/quotes): . , ; : ! ? … danda, double danda. */
const MARKS = new Set([".", ",", ";", ":", "!", "?", "…", "।", "॥"]);
/** Marks that END a sentence (clause marks `, ; :` do not). */
const STRONG = new Set([".", "!", "?", "…", "।", "॥"]);
const OPENERS = new Set(["\"", "'", "“", "‘", "«", "‹", "(", "[", "{"]);
const CLOSERS = new Set(["\"", "'", "”", "’", "»", "›", ")", "]", "}"]);
const WS = /\s/u;

/** Negations, modals and qualifiers (English + the Hinglish negators that occur in data/toc-migrated: "nahi", "nahin"). */
const MARKER = /(?<![\p{L}\p{N}_])(?:not|never|no|none|nobody|nothing|nowhere|neither|nor|without|cannot|nahi|nahin|if|unless|until|only|except|hardly|barely|rarely|seldom)(?![\p{L}\p{N}_])|n['’]t(?![\p{L}\p{N}_])/iu;
/** A SHORT reply that negates the sentence before it ("Absolutely not.", "No.", "Nahi."): the next sentence is a negation, not a marker like "if". */
const NEG_REPLY = /(?<![\p{L}\p{N}_])(?:not|no|never|nope|nah|none|nothing|nowhere|neither|nor|cannot|nahi|nahin)(?![\p{L}\p{N}_])|n['’]t(?![\p{L}\p{N}_])/iu;
const MAX_REPLY_WORDS = 5;

/**
 * Known LOWER-CASE abbreviations (no dot). This list is NOT the safety mechanism any more (cycle 3, ISS-T040GEN-008): a "." breaks a sentence only
 * after an ordinary lower-case word or a sentence-final number, so every capitalised, mixed-case, digit-bearing, single-letter or dotted token
 * ("Pvt.", "Univ.", "Q1.", "U.S.", "J.") is a non-break by construction. The list only catches abbreviations that are typed in lower case.
 */
const LOWER_ABBREVIATIONS = new Set([
  "etc", "vs", "viz", "cf", "approx", "est", "dept", "govt", "inc", "ltd", "co", "corp", "jr", "sr", "dr", "mr", "mrs", "ms", "mx", "prof", "st", "mt", "fig", "eq",
  "min", "max", "avg", "sec", "hrs", "yrs", "rs", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
]);
const LOWER = /\p{Ll}/u;
const APOS = new Set(["'", "’"]);
const OPEN_OR_WS = (c: string) => WS.test(c) || OPENERS.has(c);

/**
 * Is the mark at t[i] a real sentence break? ! ? ... danda: yes (when followed by whitespace or the end).
 * "." is a break ONLY IF followed by whitespace/end AND the token before it is
 *   (a) an ordinary lower-case word: all lower-case letters (inner apostrophes allowed), length >= 2, not a known lower-case abbreviation; or
 *   (b) a plain number (digits only) that is not a list number opening a sentence ("1. Apply"),
 * AND the next word does not start in lower case. Anything else (capitalised, mixed case, digits with letters, single letter, dotted) NEVER breaks:
 * an unknown token fails closed, the sentence just gets longer and the negation floor sees more of it.
 */
function isBoundary(t: string, i: number): boolean {
  if (!STRONG.has(t[i]!) || !(i + 1 >= t.length || WS.test(t[i + 1]!))) return false;
  if (t[i] !== ".") return true;
  let s = i; while (s > 0 && (/[\p{L}\p{N}.]/u.test(t[s - 1]!) || (APOS.has(t[s - 1]!) && s > 1 && /\p{L}/u.test(t[s - 2]!) && /\p{L}/u.test(t[s]!)))) s--;
  const word = t.slice(s, i);
  const letters = [...word].filter((c) => !APOS.has(c)).join("");
  const ordinary = [...letters].length >= 2 && !word.includes(".") && [...letters].every((c) => LOWER.test(c)) && !LOWER_ABBREVIATIONS.has(word);
  const number = /^\p{Nd}+$/u.test(word);
  if (!ordinary && !number) return false;
  if (number && /^\p{Nd}{1,2}$/u.test(word)) { // "1. Apply" / "2. Fees": a list number opening a sentence; a number ending one ("detail 3. Next") is a real break
    let p = s - 1; while (p >= 0 && WS.test(t[p]!)) p--;
    if (p < 0 || STRONG.has(t[p]!) || OPENERS.has(t[p]!)) return false;
  }
  let n = i + 1; while (n < t.length && OPEN_OR_WS(t[n]!)) n++;
  if (word === "no" && n < t.length && /\p{N}/u.test(t[n]!)) return false;
  if (n < t.length && LOWER.test(t[n]!)) return false;
  return true;
}

/** Start of the sentence containing `at`: just after the last real boundary. */
function sentenceStart(t: string, at: number): number {
  for (let i = at - 1; i >= 0; i--) if (isBoundary(t, i)) return i + 1;
  return 0;
}
function sentenceEnd(t: string, at: number): number {
  for (let i = at; i < t.length; i++) if (isBoundary(t, i)) return i + 1;
  return t.length;
}
/** Is the mark at t[i] acceptable as a quote edge? Clause marks and real boundaries yes; a "." after an abbreviation no. */
const isEdgeMark = (t: string, i: number) => MARKS.has(t[i]!) && (t[i] !== "." || i + 1 >= t.length || !WS.test(t[i + 1]!) || isBoundary(t, i));

export type SpanProblem = "starts-mid-sentence" | "ends-mid-sentence" | "omits-qualifier" | "negated-by-reply" | "is-question";

/** `null` = the slice text[start,end) is a whole sentence/clause and its sentence has no omitted marker. */
export function sentenceSpanProblem(text: string, start: number, end: number, opts: { allowQuestion?: boolean } = {}): SpanProblem | null {
  let i = start - 1;
  while (i >= 0 && (WS.test(text[i]!) || OPENERS.has(text[i]!))) i--;
  if (i >= 0 && !isEdgeMark(text, i)) return "starts-mid-sentence";
  if (!isEdgeMark(text, end - 1)) {
    let j = end;
    while (j < text.length && (WS.test(text[j]!) || CLOSERS.has(text[j]!))) j++;
    if (j < text.length && !isEdgeMark(text, j)) return "ends-mid-sentence";
  }
  // ISS-T040GEN-009: a question is not a statement of fact. A quote inside a sentence that contains a "?" can be evidence only for a question item.
  if (!opts.allowQuestion && text.slice(sentenceStart(text, start), sentenceEnd(text, Math.max(start, end - 1))).includes("?")) return "is-question";
  const endsSentence = end > 0 && isBoundary(text, end - 1);
  const before = text.slice(sentenceStart(text, start), start), after = endsSentence ? "" : text.slice(end, sentenceEnd(text, end));
  if (MARKER.test(before) || MARKER.test(after)) return "omits-qualifier";
  if (endsSentence) {
    let k = end; while (k < text.length && (WS.test(text[k]!) || CLOSERS.has(text[k]!))) k++;
    const reply = text.slice(k, sentenceEnd(text, k)), words = reply.trim().split(/\s+/u).filter(Boolean).length;
    if (words > 0 && words <= MAX_REPLY_WORDS && NEG_REPLY.test(reply)) return "negated-by-reply";
  }
  return null;
}
