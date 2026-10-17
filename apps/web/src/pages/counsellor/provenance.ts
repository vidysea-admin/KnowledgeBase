import type { AskResponse, AskInternalSource } from "../../api/types.js";

export interface Quote { id: string; turnId: string; speakerRef: string; tStart: number; tEnd: number; quote: string; origin: string }
export function sessionRef(source: AskInternalSource): string | null {
  return typeof source.evidence?.sessionRef === "string" && source.evidence.sessionRef.trim() ? source.evidence.sessionRef : null;
}
export function sourceQuotes(source: AskInternalSource): Quote[] {
  const quotes = source.evidence?.sourceQuotes;
  return Array.isArray(quotes) ? quotes.filter((quote): quote is Quote => quote !== null && typeof quote === "object"
    && typeof quote.id === "string" && typeof quote.turnId === "string" && Boolean(quote.turnId.trim())
    && typeof quote.speakerRef === "string" && typeof quote.quote === "string" && typeof quote.origin === "string"
    && Number.isFinite(quote.tStart) && quote.tStart >= 0 && Number.isFinite(quote.tEnd) && quote.tEnd >= quote.tStart) : [];
}
export function coverageNote(result: AskResponse): string {
  if (!result.insufficient_coverage) return "";
  if (result.web_used) return "Internal knowledge was insufficient; this answer also uses web sources.";
  const unavailable = result.auditLog.some((event) => event.step.startsWith("web_fallback_unavailable"));
  return unavailable ? "Internal knowledge was insufficient and the web fallback is unavailable."
    : "Internal knowledge was insufficient; no supporting web answer was returned.";
}
export function spokenAnswer(result: AskResponse): string {
  return [coverageNote(result), result.answer].filter(Boolean).join(" ");
}
