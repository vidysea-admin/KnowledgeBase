/**
 * apps/api/src/user-accounts/email.ts -- unit `ua-credentials`, spec UA-2 (email normalisation).
 *
 * Normalisation and validation ONLY. v1 sends no email (D-206), so there is nothing here that composes or
 * sends a message; the strict character rules below exist so a value that passes can later be put in a
 * header or a link without further escaping (CR/LF, control and format characters, list separators and
 * display-name syntax are all refused).
 *
 * The canonical form is the uniqueness key (a unique index on it, not an application check): trim, Unicode
 * NFKC, lowercase, NFKC again (lowercasing can produce a sequence that is not NFKC-stable, so the last pass
 * makes the function idempotent), trim again (NFKC turns U+3000 into a space).
 */

export const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX = 64;
const DOMAIN_MAX = 253;

/** True when the string holds an unpaired surrogate (not encodable as UTF-8). String.prototype.isWellFormed needs lib es2024, which this package does not target. */
export function hasLoneSurrogate(s: string): boolean {
  return /\p{Surrogate}/u.test(s);
}

export type EmailRejectReason = "invalid" | "empty" | "too_long" | "control" | "format";
export type ParsedEmail = { ok: true; email: string; local: string; domain: string } | { ok: false; reason: EmailRejectReason };

// Cc control, Cf format (zero-width, bidi overrides), Zl/Zp line and paragraph separators, unassigned/private use.
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/u;
// Characters that make an address a list, a display-name form or a quoted/commented form.
const SYNTAX_CHARS = /[\s<>(),;:\\"[\]]/u;

export function parseEmail(input: unknown): ParsedEmail {
  if (typeof input !== "string") return { ok: false, reason: "invalid" };
  // Bound the work before any Unicode processing; NFKC can expand a character, so the post-normalisation length is checked again.
  if (input.length > EMAIL_MAX_LENGTH * 4) return { ok: false, reason: "too_long" };
  if (hasLoneSurrogate(input)) return { ok: false, reason: "invalid" };
  const trimmed = input.trim();
  // Control characters are judged on the raw text: trim() would otherwise hide a trailing CR/LF/TAB.
  if (FORBIDDEN_CHARS.test(input.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, ""))) return { ok: false, reason: "control" };
  if (trimmed === "") return { ok: false, reason: "empty" };
  const email = trimmed.normalize("NFKC").toLowerCase().normalize("NFKC").trim();
  if (email === "") return { ok: false, reason: "empty" };
  if (FORBIDDEN_CHARS.test(email)) return { ok: false, reason: "control" };
  if (email.length > EMAIL_MAX_LENGTH) return { ok: false, reason: "too_long" };
  const parts = email.split("@");
  if (parts.length !== 2) return { ok: false, reason: "format" };
  const [local, domain] = parts as [string, string];
  if (local === "" || domain === "" || SYNTAX_CHARS.test(email)) return { ok: false, reason: "format" };
  if (local.length > LOCAL_MAX || domain.length > DOMAIN_MAX) return { ok: false, reason: "too_long" };
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return { ok: false, reason: "format" };
  return { ok: true, email, local, domain };
}

/** The canonical email, or null when the input is not an acceptable address. Idempotent. */
export function normalizeEmail(input: unknown): string | null {
  const r = parseEmail(input);
  return r.ok ? r.email : null;
}

/** The part before the single `@` of an already normalised address. */
export function emailLocalPart(normalizedEmail: string): string {
  return normalizedEmail.slice(0, normalizedEmail.indexOf("@"));
}
