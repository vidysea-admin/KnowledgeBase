/**
 * packages/index/src/pipeline/quote-token-rule.ts — T-040 slice: the TOKEN-boundary rule of the strict
 * quote verifier (fix cycle 1, ISS-T040QUOTE-001). Pure, total, no I/O.
 *
 * A quote may not start or end INSIDE a token. One predicate, `cutInsideToken(s, p)`, judges the
 * cut between s[p-1] and s[p] of the NORMALISED joined text, and is applied to both ends of a quote.
 * Neighbours are read over code points (surrogate pairs whole) and skip format characters (Cf,
 * zero-width/bidi/soft hyphen), so an invisible character cannot hide a joint.
 *
 * L = the character before the cut, R = the character after it ("alnum" = letter, digit or mark).
 *  C1  alnum | alnum                     "reven|ue", "3|rd", "5|k", "1,0|00"
 *  C2  alnum | joiner + alnum/currency   "3|.5", "1|,000", "5|-10", "24|/7", "10|:30", "bob|@x.com",
 *                                        "e|-mail", "don|'t", "x|.com/path", "5|-$10"
 *      digit | percent sign              "50|%"   (a cut before the sign changes the quantity)
 *  C3  joiner | alnum, joiner glued to a previous alnum      "3.|5", "e-|mail", "bob@|x.com", "don'|t"
 *  C4  prefix | alnum, prefix = currency symbol or one of + - . , @ #   "$|5", "₹|500", "-|5", "+|91"
 * Joiners: . , - / : @ _ ' % (also fullwidth forms, Arabic decimal/thousands separators, fraction slash).
 * Anything with whitespace on either side, or the start/end of the text, is a boundary.
 * A joiner followed by whitespace, a non-alnum or the end is SENTENCE punctuation: "is 3" of
 * "is 3. Next" and of "is 3, and" is a legal cut, "is 3" of "is 3.5" is not.
 * Scripts without spaces: ideographs/kana/Thai are alnum, so C1 still refuses cuts between two of
 * them (unchanged from cycle 0); the Devanagari danda (U+0964) is punctuation, not a joiner, so a
 * quote may end before it (unchanged). When in doubt the rule refuses.
 */
const ALNUM = /[\p{L}\p{N}\p{M}]/u;
const CF = /\p{Cf}/u;
const CUR = /\p{Sc}/u;
const WS = /\s/u;
const JOINERS = new Set([".", ",", "-", "/", ":", "@", "_", "'", "%", "．", "，", "：", "／", "＠", "＿", "％", "＇", "٫", "٬", "⁄"]);
const PREFIXES = new Set([..."+-.,@#", "＋", "＃"]);
const PERCENTS = new Set(["%", "％", "‰", "٪"]);

/** Code point starting at/after index `i` (skipping format chars), with the index after it. */
function after(s: string, i: number): [string, number] | undefined {
  while (i < s.length) {
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    i += ch.length;
    if (!CF.test(ch)) return [ch, i];
  }
  return undefined;
}
/** Code point ending at index `i` (skipping format chars), with its start index. */
function before(s: string, i: number): [string, number] | undefined {
  while (i > 0) {
    let j = i - 1;
    if (j > 0 && /[\udc00-\udfff]/.test(s.charAt(j)) && /[\ud800-\udbff]/.test(s.charAt(j - 1))) j--;
    const ch = s.slice(j, i);
    i = j;
    if (!CF.test(ch)) return [ch, j];
  }
  return undefined;
}

export function cutInsideToken(s: string, p: number): boolean {
  const l = before(s, p), r = after(s, p);
  if (!l || !r) return false;
  const [L, lStart] = l, [R, rEnd] = r;
  if (WS.test(L) || WS.test(R)) return false;
  const la = ALNUM.test(L), ra = ALNUM.test(R);
  if (la && ra) return true; // C1
  if (la && PERCENTS.has(R) && /\p{N}/u.test(L)) return true; // C2 percent
  if (la && JOINERS.has(R)) { // C2
    const n = after(s, rEnd);
    return n !== undefined && (ALNUM.test(n[0]) || CUR.test(n[0]));
  }
  if (ra && JOINERS.has(L)) { // C3
    const b = before(s, lStart);
    if (b !== undefined && ALNUM.test(b[0])) return true;
  }
  if (ra && (CUR.test(L) || PREFIXES.has(L))) return true; // C4
  return false;
}
