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
  // fold Latin diacritics and dotless i / long s so "pın", "kód", "contraseña" meet the keyword list; other scripts keep their marks
  s = s.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").replace(/\u{131}/gu, "i").replace(/\u{17f}/gu, "s").normalize("NFKC");
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
    // a Latin+Cyrillic/Greek token is a look-alike keyword ("pаsscode"): treat it as one, hide the rest of the title
    if (MIXED_A.test(t) && MIXED_B.test(t)) { out.push(HIDDEN); break; }
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
  const runs = m.split(/[^\p{Nd}]/u);
  for (const run of runs) longest = Math.max(longest, run.length);
  return digits.length >= 6 || longest >= 3 || (runs.length >= 2 && digits.length >= 5) ? HIDDEN : m; // "1 2 3 4 5" is a code, "IELTS 7.5" is not
}
function segment(m: string): string {
  return (/\p{Nd}/u.test(m) && /\p{L}/u.test(m)) || m.length >= 24 ? HIDDEN : m;
}

/**
 * Secret keywords. SHAPE: once one is recognised, EVERYTHING from it to the end of the title is hidden
 * (a passcode follows the topic and may be several words or digit groups, so a one-token mask leaks).
 * A keyword at the very start therefore hides the whole title; the alert stays identifiable by its
 * headline, start time and hashed id. This is a deny-list: a secret with no keyword and no digit/shape
 * pattern ("Webinar tiger") is NOT caught (ISS-R1ALERTS-009, open by design).
 */
const SP = "[ .\\-_]"; // separators allowed inside a keyword: "pass code", "p i n", "P.I.N.", "pass_word"
const lit = (w: string) => w.split(" ").join(`${SP}*`);
const spaced = (w: string) => Array.from(w).join(`${SP}+`);
const STRONG = ["password", "pass word", "passcode", "pass code", "passphrase", "passwd", "passwrd", "passwort", "passkey", "pwd", "pswd", "paasvard",
  "paasword", "paascode", "passvard", "kennwort", "mot de passe", "motdepasse", "contrasena"]; // no word boundary: "meetingPassword", "passcodeHello"
const BOUNDED = ["pw", "psw", "pass", "pin", "otp", "code", "kood", "kod", "secret", "key", "token", "tk", "credential", "credentials", "auth", "login", "clave"];
const DEVANAGARI = ["पासकोड", "पासवर्ड", "पास कोड", "पास वर्ड", "पिन", "कोड", "ओटीपी", "कुंजी", "टोकन", "सीक्रेट"];
const EDGE = (body: string) => new RegExp(`(?<![\\p{L}\\p{M}])(?:${body})(?![\\p{L}\\p{M}])`, "iu"); // JS \b is ASCII-only; these also work for Devanagari
const KEYWORD_RES: RegExp[] = [
  new RegExp(STRONG.map(lit).join("|"), "iu"),
  EDGE([...BOUNDED, ...DEVANAGARI].map(lit).concat([...BOUNDED, ...STRONG.filter((w) => !w.includes(" "))].map(spaced)).join("|")),
  new RegExp(`(?<=\\p{Ll})(?:${["Pw", "Psw", "Pass", "Pin", "Otp", "Code", "Kood", "Secret", "Key", "Token", "Auth", "Login"].join("|")})(?![\\p{Ll}\\p{M}])`, "u"), // camelCase: "apiKey"
];
const REPEAT = /(\((?:link|email|hidden)\))(?: ?\1)+/g;

/** Index of the earliest secret keyword, or -1. */
export function keywordIndex(s: string): number {
  let best = -1;
  for (const re of KEYWORD_RES) { const i = s.search(re); if (i >= 0 && (best < 0 || i < best)) best = i; }
  return best;
}

/** Step 2: structural masking of normalised text. */
export function maskText(s: string): string {
  const cut = keywordIndex(s);
  const head = cut < 0 ? s : s.slice(0, cut);
  let t = maskTokens(head).replace(KEY_SHAPES, HIDDEN).replace(DIGIT_GROUP, digitGroup).replace(SEGMENT, segment);
  if (cut >= 0) t = `${t.trimEnd()} ${HIDDEN}`.trimStart();
  return t.replace(REPEAT, "$1");
}

/** Steps 1-3 without a length cap; unsliced, so tests can feed it megabytes. `rounds` is the fixed-point cap. */
export function sanitize(input: string, rounds = 5): string {
  let s = normalise(input);
  for (let i = 0; i < rounds; i++) {
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
