import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { tenantSourceId } from "../source.js";
import type { DocumentDocuments } from "@lkb/core";

export type DocumentPage = DocumentDocuments["pages"][number];
export type PageDocument = Pick<DocumentDocuments, "_id" | "tenantId" | "sourceId" | "version" | "title" | "format" | "pages" | "createdAt">;
export const DOCUMENT_BYTE_LIMIT = 512_000;
export const DOCUMENT_PAGE_LIMIT = 500;

/** PDF text is extracted separately from each real PDF page. Paragraphs never determine page numbers. */
export async function readPdfPages(bytes: Uint8Array): Promise<DocumentPage[]> {
  if (!bytes.length || bytes.length > DOCUMENT_BYTE_LIMIT) throw new Error("Document byte limit exceeded");
  // PDFJS 6 exposes no evaluation toggle. This reader requests text only and disables XFA/font rendering.
  const task = getDocument({ data: Uint8Array.from(bytes), enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > DOCUMENT_PAGE_LIMIT) throw new Error("Document page limit exceeded");
    const pages: DocumentPage[] = []; let total = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
      total += text.length;
      if (total > 2_000_000) throw new Error("Document text limit exceeded");
      pages.push({ pageNumber, text }); page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
}

/** Version identifies original bytes, including DOCX bytes. DOCX pagination comes only from an actual renderer. */
export async function producePageDocument(input: {
  tenantId: string; title: string; format: "pdf" | "docx"; bytes: Uint8Array; createdAt: string;
}, renderDocxToPdf?: (bytes: Uint8Array) => Promise<Uint8Array>): Promise<PageDocument> {
  if (!input.tenantId || input.tenantId !== input.tenantId.trim() || /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(input.tenantId)) throw new Error("Invalid tenant");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) throw new Error("Invalid document title");
  if (!input.bytes.length || input.bytes.length > DOCUMENT_BYTE_LIMIT) throw new Error("Document byte limit exceeded");
  if (input.format !== "pdf" && input.format !== "docx") throw new Error("Unsupported document format");
  if (input.format === "docx" && !renderDocxToPdf) throw new Error("DOCX page renderer unavailable");
  const version = createHash("sha256").update(input.bytes).digest("hex");
  const id = tenantSourceId(input.tenantId, version);
  const pdfBytes = input.format === "pdf" ? input.bytes : await renderDocxToPdf!(input.bytes);
  const pages = await readPdfPages(pdfBytes);
  return { _id: id, tenantId: input.tenantId, sourceId: id, version, title: input.title.trim(), format: input.format, pages: pages as PageDocument["pages"], createdAt: input.createdAt };
}
