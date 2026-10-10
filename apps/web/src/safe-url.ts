/**
 * apps/web/src/safe-url.ts — the one place API-supplied text becomes an `href`.
 * Only absolute http(s) URLs pass; `javascript:`, `data:`, `vbscript:`, protocol-relative `//x`,
 * relative paths, unparseable text and anything carrying control characters or surrounding
 * whitespace return null, and callers must then render inert text rather than a link.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value) || value !== value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null; // not an absolute URL at all
  }
}
