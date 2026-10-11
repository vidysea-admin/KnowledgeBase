/**
 * Shared normaliser for a search query that may come from the URL (attacker-craftable) or a text box.
 * Neither GET /search nor searchTranscripts bounds the query length, so this client-side bound is
 * the only one: 512 code points, applied BEFORE the text reaches state, the request or the DOM.
 */
export const MAX_QUERY_CHARS = 512;
// C0/C1 controls, bidi marks/embeddings/overrides/isolates (can reorder displayed text).
const UNSAFE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function normalizeQuery(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  // Slice before the replace so a 10,000-char value is never scanned in full more than needed.
  const head = Array.from(raw.slice(0, MAX_QUERY_CHARS * 2)).slice(0, MAX_QUERY_CHARS).join("");
  return head.replace(UNSAFE, " ").trim();
}
