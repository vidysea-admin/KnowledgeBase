/**
 * packages/meeting-bot/src/calendar/join-rules-normalize.ts — ISS-367: pure email/domain normalisers
 * split out of join-rules.ts (file-length budget). Re-exported from join-rules.ts; behaviour unchanged.
 */

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lower-cased, trimmed domain, or undefined when it is not a plausible multi-label hostname. */
export function normalizeDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let d = value.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  return DOMAIN_RE.test(d) ? d : undefined;
}

/** Lower-cased, trimmed `local@domain` (exactly one `@`, no whitespace), or undefined. */
export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const e = value.trim().toLowerCase();
  const parts = e.split("@");
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return undefined;
  const domain = normalizeDomain(parts[1]);
  return domain ? `${parts[0]}@${domain}` : undefined;
}

/**
 * Strict sender parse for trust decisions (ISS-CAPTURE-001). Accepts only a bare `local@domain`
 * that is already in canonical form up to letter case: printable ASCII only (no whitespace, control
 * or non-ASCII characters), none of `<>(),;:"` or backslash, exactly one `@`, non-empty local part, a valid
 * multi-label domain with no trailing dot. Returns the lower-cased email and its domain, or
 * undefined. Unlike `normalizeEmail` it never repairs input (no trimming, no dot stripping).
 */
export function parseStrictEmail(value: unknown): { email: string; domain: string } | undefined {
  if (typeof value !== "string" || value.length > 320 || !/^[!-~]+$/.test(value) || /[<>(),;:"\\]/.test(value)) return undefined;
  const lower = value.toLowerCase();
  const n = normalizeEmail(lower);
  if (n === undefined || n !== lower) return undefined;
  return { email: n, domain: n.slice(n.indexOf("@") + 1) };
}
