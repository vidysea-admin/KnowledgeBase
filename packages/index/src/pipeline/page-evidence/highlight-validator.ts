import type { PageIndex } from "./page-segments.js";

export interface PageHighlight { quote: string; page: number; start: number; end: number }
export type HighlightRejection = "empty-quote" | "invalid-page" | "page-out-of-range" | "quote-absent-on-page" | "offsets-mismatch";
export type HighlightResult = { ok: true; highlight: PageHighlight } | { ok: false; reason: HighlightRejection };

/** Accepts only a verbatim quote on the cited real page whose document offsets also match. */
export function validateHighlight(index: PageIndex, input: unknown): HighlightResult {
  const h = input as Partial<PageHighlight> | null;
  if (!h || typeof h.quote !== "string" || !h.quote.trim()) return { ok: false, reason: "empty-quote" };
  if (typeof h.page !== "number" || !Number.isInteger(h.page) || h.page < 1) return { ok: false, reason: "invalid-page" };
  if (h.page > index.pageCount) return { ok: false, reason: "page-out-of-range" };
  const seg = index.segments.find(s => s.page === h.page);
  if (!seg) return { ok: false, reason: "page-out-of-range" };
  if (!seg.text.includes(h.quote)) return { ok: false, reason: "quote-absent-on-page" };
  const { start, end } = h;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)
    || start < seg.start || end > seg.end || end - start !== h.quote.length || index.text.slice(start, end) !== h.quote)
    return { ok: false, reason: "offsets-mismatch" };
  return { ok: true, highlight: { quote: h.quote, page: h.page, start, end } };
}
