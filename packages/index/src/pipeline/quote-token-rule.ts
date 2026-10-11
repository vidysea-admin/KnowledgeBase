/**
 * packages/index/src/pipeline/quote-token-rule.ts — T-040 slice: where a verified quote MAY begin and
 * end (fix cycle 2, ISS-T040QUOTE-002/-003). Pure, total, no I/O.
 *
 * ALLOW-LIST, not deny-list. Everything that is not named below is INSIDE a token, so a symbol nobody
 * thought of ("+", "&", "×", "°", an emoji, a Cf character, a Hangul filler) refuses the cut by default.
 *
 *  START at index a of the joined normalised text is legal iff, scanning backwards from a over at most
 *  MAX_RUN OPENING characters, the next character back is whitespace or the text start.
 *  END at index b is legal iff, scanning forwards from b over at most MAX_RUN CLOSING characters, the
 *  next character is whitespace or the text end. Turn edges are whitespace/edges because turns are
 *  joined with one space. A quotation mark directly after a digit is a unit mark (5', 5"), not closing.
 *
 *  WHITESPACE (explicit; never JS \s, which also contains U+FEFF): TAB LF VT FF CR, SPACE, NBSP U+00A0,
 *  U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000 (= Unicode Zs plus the line breaks).
 *  CF (format characters: U+FEFF, zero-width, bidi, soft hyphen, ...) are not whitespace, not opening,
 *  not closing and are NOT stripped: text containing one never equals text without it, and a cut next
 *  to one is refused.
 *  Scripts written without spaces (Han, Hiragana, Katakana, Thai, ...) have no interior boundary, so
 *  only whole-turn or whitespace-delimited quotes of them verify (fail closed; a documented limit).
 */
const WS_CLASS = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const WS_ALL = new RegExp(`^[${WS_CLASS}]+$`);
/** True when `s` is non-empty and made only of whitespace in the explicit set above. */
export const isWhitespace = (s: string): boolean => WS_ALL.test(s);

/** Opening punctuation: a quotation mark (curly forms are normalised to these two) or opening bracket. */
const OPENING = new Set([..."\"'([{«‹"]);
/** Closing punctuation: sentence marks, ellipsis, danda and double danda, closing quote/bracket. */
const CLOSING = new Set([..."\"'.,;:!?)]}»›…।॥"]);
const MAX_RUN = 8;
const DIGIT = /\p{N}/u;

function codePointBefore(s: string, i: number): string {
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
    const hi = s.charCodeAt(i - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(i - 2, i);
  }
  return s.charAt(i - 1);
}

/** May a quote begin at index `a` of `s`? */
export function quoteMayStart(s: string, a: number): boolean {
  let i = a;
  for (let n = 0; n <= MAX_RUN; n++) {
    if (i <= 0) return true;
    const ch = codePointBefore(s, i);
    if (isWhitespace(ch)) return true;
    if (!OPENING.has(ch)) return false;
    i -= ch.length;
  }
  return false;
}

/** May a quote end just before index `b` of `s`? */
export function quoteMayEnd(s: string, b: number): boolean {
  let i = b;
  for (let n = 0; n <= MAX_RUN; n++) {
    if (i >= s.length) return true;
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    if (isWhitespace(ch)) return true;
    if (!CLOSING.has(ch)) return false;
    if (n === 0 && (ch === '"' || ch === "'") && b > 0 && DIGIT.test(codePointBefore(s, b))) return false;
    i += ch.length;
  }
  return false;
}
