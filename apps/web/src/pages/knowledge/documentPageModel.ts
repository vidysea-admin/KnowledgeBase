import { safePublicResourceUrl } from "../../safe-url.js";
export interface DocumentSummary { id: string; sourceId: string; version: string; title: string; format: "pdf" | "docx"; pageCount: number }
export interface DocumentHighlight { id: string; pageNumber: number; quote: string; text: string; verification: "unverified" }
export interface DocumentDetail extends DocumentSummary { highlights: DocumentHighlight[] }
export interface DocumentPageEvidence { id: string; sourceId: string; version: string; title: string; pageNumber: number; text: string }
const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export const validDocumentSummary = (v: unknown): v is DocumentSummary => obj(v) && typeof v.id === "string" && v.id.length > 0 && v.sourceId === v.id && typeof v.version === "string" && /^[a-f0-9]{64}$/.test(v.version) && typeof v.title === "string" && ["pdf", "docx"].includes(v.format as string) && Number.isInteger(v.pageCount) && Number(v.pageCount) >= 1 && Number(v.pageCount) <= 500;
export const validDocumentDetail = (v: unknown): v is DocumentDetail => validDocumentSummary(v) && Array.isArray((v as DocumentDetail).highlights) && (v as DocumentDetail).highlights.every(h => obj(h) && typeof h.id === "string" && Number.isInteger(h.pageNumber) && h.pageNumber >= 1 && h.pageNumber <= v.pageCount && typeof h.quote === "string" && h.quote.length > 0 && h.text === h.quote && h.verification === "unverified");
const CITATION_ORIGIN = "https://citation.invalid";
/** In-app page citation target, gated through safePublicResourceUrl: the path is checked as an absolute http(s) URL on a fixed placeholder origin, so control characters, credentials and unsafe schemes yield null and callers render inert text. */
export function safePageCitationHref(id: string, pageNumber: number): string | null {
  if (typeof id !== "string" || !id || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const path = documentPageHref(id, pageNumber);
  const safe = safePublicResourceUrl(CITATION_ORIGIN + path);
  return safe && safe.host === "citation.invalid" && safe.href === CITATION_ORIGIN + path ? path : null;
}
export const documentPageHref = (id: string, pageNumber: number): string => `/knowledge/documents/${encodeURIComponent(id)}/pages/${pageNumber}`;
/** Every highlight is resolved against the exact document version/page before rendering as source evidence. */
export function validPageEvidence(v: unknown, document: DocumentSummary, pageNumber: number): v is DocumentPageEvidence {
  return obj(v) && v.id === document.id && v.sourceId === document.sourceId && v.version === document.version && v.pageNumber === pageNumber && v.title === document.title && typeof v.text === "string";
}
