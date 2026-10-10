/**
 * packages/meeting-bot/src/calendar/alert-text.ts — allowlist title rendering for attention alerts.
 * PURE. Event titles come from invitations written by strangers, so nothing is trusted by default:
 *   1. normalise (NFKC, percent-decode, look-alike punctuation, separators -> space, strip every
 *      invisible/format/control/private/unassigned character) BEFORE any pattern match;
 *   2. mask by structure (URL/domain, email, long digit runs, key shapes, mixed alphanumerics,
 *      the word after a secret keyword);
 *   3. keep only an allowlist of characters, then repeat 2-3 until stable (removing a character can
 *      join text into something maskable), then cap by code point.
 * Every pattern is linear: no quantifier is nested over an overlapping class, tokens are found with
 * split(" ") and simple anchored tests, and the digit/segment/keyword regexes cannot backtrack across
 * their own matches.
 */
const LINK = "(link)";
const EMAIL = "(email)";
const HIDDEN = "(hidden)";

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\u{34f}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{3164}\u{ffa0}\u{2800}\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]/gu;
const SLASHES = /[\u{2044}\u{2215}\u{2216}\u{2571}\u{29f5}\u{29f8}\u{29f9}\\]/gu;
const COLONS = /[\u{2236}\u{a789}\u{589}\u{2f8}]/gu;
const DOTS = /[\u{3002}\u{2024}]/gu;
const DECORATIVE = /[^\p{L}\p{M}\p{Nd} .,:;'"!?()/&+\-%=@#_[\]{}<>$]/gu; // * ~ ` | ^ symbols, emoji: dropped before matching so "p*a*s*s" cannot split a keyword
const ALLOWED_ONLY = /[^\p{L}\p{M}\p{Nd} .,:;'"!?()/&+\-%]/gu;

/** Step 1. Order matters: decode, fold look-alikes, whitespace, THEN strip invisibles. */
export function normalise(raw: string): string {
  let s = raw.normalize("NFKC");
  for (let i = 0; i < 3; i++) {
    const d = s.replace(/%([0-7][0-9a-f])/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (d === s) break;
    s = d;
  }
  s = s.replace(SLASHES, "/").replace(COLONS, ":").replace(DOTS, ".");
  s = s.replace(/[^\S\u{feff}]|\x85/gu, " ").replace(INVISIBLE, "").replace(DECORATIVE, "");
  return s.replace(/ {2,}/g, " ").trim();
}

const SCHEME = /^(?:javascript|data|vbscript|file|mailto|tel|sms|hxxps?|https?|ftps?|wss?|blob|about|ssh|sip|zoommtg|zoomus|msteams|webex|skype):/i;
const DOMAINISH = /[a-z0-9]\.[a-z]{2,}/i;
function isUrl(t: string): boolean {
  if (t.includes(":/") || SCHEME.test(t) || /(?:^|[^a-z0-9])www\./i.test(t)) return true;
  const idx = t.search(/[/?#]/);
  return idx >= 0 && DOMAINISH.test(t.slice(0, idx));
}
const OBFUSCATED = /[[({<](?:at|dot)[\])}>]/i;
const isDotWord = (t: string | undefined) => t !== undefined && /^[[({<]?dot[\])}>]?$/i.test(t);
const ENDS_AT = /[[({<]at[\])}>]$/i;
const BRACKET_AT = /^[[({<]at[\])}>]$/i;
const MIXED_A = /[A-Za-z]/;
const MIXED_B = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** Token-level structural masks: URLs, emails, mixed-script look-alike words. */
function maskTokens(s: string): string {
  const toks = s.split(" ");
  const out: string[] = [];
  let carry = false; // a URL ending in = ? & : / , ; may have its value on the next token
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] ?? "";
    if (carry) { out.push(HIDDEN); carry = false; continue; }
    if (t === "") { out.push(t); continue; }
    if (isUrl(t)) { out.push(LINK); carry = /[=&?:/,;]$/.test(t); continue; }
    const next = toks[i + 1];
    if (out.length > 0 && next !== undefined
      && (BRACKET_AT.test(t) || (t.toLowerCase() === "at" && (DOMAINISH.test(next) || isDotWord(toks[i + 2]))))) {
      out[out.length - 1] = EMAIL;
      i++;
      while (isDotWord(toks[i + 1]) && toks[i + 2] !== undefined) i += 2;
      continue;
    }
    if (t.includes("@") || OBFUSCATED.test(t)) { out.push(EMAIL); carry = ENDS_AT.test(t); continue; }
    if (MIXED_A.test(t) && MIXED_B.test(t)) { out.push(HIDDEN); carry = true; continue; }
    out.push(t);
  }
  return out.join(" ");
}

const KEY_SHAPES = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{6,}|\b(?:AKIA|ASIA)[A-Z0-9]{8,}|\bgh[pousr]_[A-Za-z0-9]{6,}|\bxox[a-z]-[A-Za-z0-9-]*|\beyJ[A-Za-z0-9_-]*|\bAIza[A-Za-z0-9_-]{8,}/g;
const DIGIT_GROUP = /\p{Nd}+(?:[ .-]\p{Nd}+)*/gu;
const SEGMENT = /[\p{L}\p{Nd}]{8,}/gu;
function digitGroup(m: string): string {
  const digits = m.replace(/[^\p{Nd}]/gu, "");
  let longest = 0;
  for (const run of m.split(/[^\p{Nd}]/u)) longest = Math.max(longest, run.length);
  return digits.length >= 6 || longest >= 3 ? HIDDEN : m;
}
function segment(m: string): string {
  return (/\p{Nd}/u.test(m) && /\p{L}/u.test(m)) || m.length >= 24 ? HIDDEN : m;
}

const SEP = `[\\s:=,;"'()\\[\\]{}<>#_.\\-]*`;
const FILL = `(?:(?:is|are|was|be|will|set|to|as|equals|the|your|my|our)[\\s:=,"']+){0,3}`;
const TAIL = `${SEP}${FILL}\\S+`;
const AFTER = `(?![A-Za-z])${TAIL}`; // short keywords need a right boundary ("keynote", "spin")
const KEYWORDS: RegExp[] = [
  new RegExp(`(?<![A-Za-z])(pass[ _-]?(?:code|word|phrase)|passwd|pwd|pin|otp|code|token|tk|key|secret|credentials?|auth)${AFTER}`, "gi"),
  new RegExp(`(?<=[a-z])(Password|Passcode|Passphrase|Passwd|Pwd|Pin|Otp|Code|Token|Key|Secret|Auth)${AFTER}`, "g"),
  new RegExp(`(password|passcode|passphrase|passwd|pwd)${TAIL}`, "gi"), // unambiguous: no boundary, so "passcodeHello" is caught
];
const REPEAT = /(\((?:link|email|hidden)\))(?: ?\1)+/g;

/** Step 2: structural masking of normalised text. */
export function maskText(s: string): string {
  let t = maskTokens(s).replace(KEY_SHAPES, HIDDEN).replace(DIGIT_GROUP, digitGroup).replace(SEGMENT, segment);
  for (const re of KEYWORDS) t = t.replace(re, `$1 ${HIDDEN}`);
  return t.replace(REPEAT, "$1");
}

/** Steps 1-3 without a length cap; unsliced, so tests can feed it megabytes. */
export function sanitize(input: string): string {
  let s = normalise(input);
  for (let i = 0; i < 5; i++) {
    const t = maskText(s).replace(ALLOWED_ONLY, "").replace(/ {2,}/g, " ").trim();
    if (t === s) return t;
    s = t;
  }
  return HIDDEN; // did not converge: refuse rather than echo
}

/** Plain-text, single-line, bounded, allowlisted rendering of attacker-controlled text. */
export function neutralizeText(raw: unknown, max = 80): string {
  const s = sanitize(typeof raw === "string" ? raw.slice(0, 4000) : "");
  if (!s) return "(untitled)";
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  let end = max - 1;
  while (end > 0 && /\p{M}/u.test(chars[end] ?? "")) end--; // never cut inside a combining sequence
  return chars.slice(0, end).join("").trimEnd() + "\u{2026}";
}
