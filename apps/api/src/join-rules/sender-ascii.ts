/**
 * apps/api/src/join-rules/sender-ascii.ts — ISS-WEBHIGH-001. Printable-ASCII gate for sender values on the join-rules WRITE paths
 * (POST /approvals kind "sender", and `match.email` in a PUT rule set).
 *
 * The engine's trust path (`parseStrictEmail` in packages/meeting-bot, and `parseSender` in packages/core sender-authentication) accepts
 * only printable ASCII (`/^[!-~]+$/`), so a sender holding U+200B, U+202E or a Cyrillic look-alike can never match a captured sender;
 * storing one is inert but confusing and unsafe. `.dependency-cruiser.cjs` forbids apps/* -> packages/meeting-bot, so the same character
 * class is restated here (the identical expression), exactly as the web editor restates it. Surrounding ASCII whitespace is tolerated
 * (the engine's normalizeEmail trims it); anything else outside `!`..`~` is refused.
 */
const PRINTABLE_ASCII = /^[!-~]+$/;
const ASCII_PAD = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/** True when `value` (trimmed of ASCII whitespace only) consists solely of printable ASCII. Non-strings are not this gate's concern. */
export function isPrintableAsciiSender(value: string): boolean {
  return PRINTABLE_ASCII.test(value.replace(ASCII_PAD, ""));
}

/** Typed error code for the 400 body: `{ error: "sender_not_printable_ascii", message }`. */
export const SENDER_NOT_ASCII = "sender_not_printable_ascii";
export const SENDER_NOT_ASCII_MESSAGE = "sender must be plain printable ASCII (no invisible, bidirectional or look-alike characters); punycode domains are accepted";

/** Every `rules[].match.email` string in a raw (unvalidated) rule-set body, tolerant of any shape. */
export function ruleEmailMatchers(input: unknown): string[] {
  const rules = (input as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules)) return [];
  const out: string[] = [];
  for (const r of rules) {
    const email = ((r as { match?: { email?: unknown } } | null)?.match)?.email;
    if (typeof email === "string") out.push(email);
  }
  return out;
}
