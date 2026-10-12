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
const MARKER = new RegExp(
  "(?<![\p{L}\p{N}_])(?:not|never|no|none|nobody|nothing|nowhere|neither|nor|without|cannot|nahi|nahin|if|unless|until|only|except|hardly|barely|rarely|seldom)(?![\p{L}\p{N}_])"
  + "|n['’]t(?![\p{L}\p{N}_])",
  "iu",
);

/** Start of the sentence containing `at`: just after the last strong mark that is followed by whitespace (so "3.5" is not a break). */
function sentenceStart(t: string, at: number): number {
  for (let i = at - 1; i >= 0; i--) if (STRONG.has(t[i]!) && (i + 1 >= t.length || WS.test(t[i + 1]!))) return i + 1;
  return 0;
}
function sentenceEnd(t: string, at: number): number {
  for (let i = at; i < t.length; i++) if (STRONG.has(t[i]!) && (i + 1 >= t.length || WS.test(t[i + 1]!))) return i + 1;
  return t.length;
}

export type SpanProblem = "starts-mid-sentence" | "ends-mid-sentence" | "omits-qualifier";

/** `null` = the slice text[start,end) is a whole sentence/clause and its sentence has no omitted marker. */
export function sentenceSpanProblem(text: string, start: number, end: number): SpanProblem | null {
  let i = start - 1;
  while (i >= 0 && (WS.test(text[i]!) || OPENERS.has(text[i]!))) i--;
  if (i >= 0 && !MARKS.has(text[i]!)) return "starts-mid-sentence";
  if (!MARKS.has(text[end - 1] ?? "")) {
    let j = end;
    while (j < text.length && (WS.test(text[j]!) || CLOSERS.has(text[j]!))) j++;
    if (j < text.length && !MARKS.has(text[j]!)) return "ends-mid-sentence";
  }
  const endsSentence = end > 0 && STRONG.has(text[end - 1]!) && (end >= text.length || WS.test(text[end]!));
  const before = text.slice(sentenceStart(text, start), start), after = endsSentence ? "" : text.slice(end, sentenceEnd(text, end));
  if (MARKER.test(before) || MARKER.test(after)) return "omits-qualifier";
  return null;
}
