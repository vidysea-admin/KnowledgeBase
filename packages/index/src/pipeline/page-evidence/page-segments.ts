import { createHash } from "node:crypto";

/** Structural shape of a page-aware reader's output (matches DocumentDocuments pages). */
export interface ReaderPage { pageNumber: number; text: string }
export interface PageSourceDocument {
  tenantId: string; sourceId: string; version: string; title: string;
  format: "pdf" | "docx"; pages: readonly ReaderPage[];
}
/** `page` is the reader's real page number. start/end are document char offsets and never derive from `page`. */
export interface PageSegment { page: number; start: number; end: number; text: string }
export interface PageIndex {
  tenantId: string; sourceId: string; version: string; title: string; format: "pdf" | "docx";
  pageCount: number; segments: readonly PageSegment[]; text: string; digest: string;
}
/** Single newline joins page texts into the document stream; offsets count it but pages never do. */
export const PAGE_JOINER = "\n";

/** Normalises reader pages into segments. Pure and deterministic, so repeat ingestion is idempotent. */
export function buildPageIndex(doc: PageSourceDocument): PageIndex {
  if (!doc.pages.length) throw new Error("Document has no pages");
  const seen = new Set<number>(); const segments: PageSegment[] = []; let cursor = 0;
  for (const p of doc.pages) {
    if (!Number.isInteger(p.pageNumber) || p.pageNumber < 1) throw new Error("Invalid page number from reader");
    if (seen.has(p.pageNumber)) throw new Error("Duplicate page number from reader");
    if (typeof p.text !== "string") throw new Error("Invalid page text");
    seen.add(p.pageNumber);
    segments.push({ page: p.pageNumber, start: cursor, end: cursor + p.text.length, text: p.text });
    cursor += p.text.length + PAGE_JOINER.length;
  }
  const text = segments.map(s => s.text).join(PAGE_JOINER);
  const digest = createHash("sha256").update(JSON.stringify([doc.tenantId, doc.sourceId, doc.version, segments])).digest("hex");
  return { tenantId: doc.tenantId, sourceId: doc.sourceId, version: doc.version, title: doc.title, format: doc.format,
    pageCount: segments.length, segments, text, digest };
}
