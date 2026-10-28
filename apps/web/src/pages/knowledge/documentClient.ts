import { apiFetch, ApiError } from "../../api/client.js";
import { validDocumentSummary, validDocumentDetail, validPageEvidence, type DocumentSummary, type DocumentDetail, type DocumentPageEvidence } from "./documentPageModel.js";
const bad = () => new ApiError(503, "Invalid document evidence response.");
export async function listPageDocuments(key: string): Promise<{ documents: DocumentSummary[]; truncated: boolean }> {
  const r = await apiFetch<{ documents: unknown[]; truncated: boolean }>("/knowledge/documents", key);
  if (!r || !Array.isArray(r.documents) || r.documents.length > 100 || !r.documents.every(validDocumentSummary) || typeof r.truncated !== "boolean") throw bad();
  return r as { documents: DocumentSummary[]; truncated: boolean };
}
export async function getPageDocument(key: string, id: string): Promise<DocumentDetail> {
  const r = await apiFetch<unknown>(`/knowledge/documents/${encodeURIComponent(id)}`, key);
  if (!validDocumentDetail(r) || r.id !== id) throw bad(); return r;
}
export async function getDocumentPage(key: string, document: DocumentSummary, page: number): Promise<DocumentPageEvidence> {
  const r = await apiFetch<unknown>(`/knowledge/documents/${encodeURIComponent(document.id)}/pages/${page}`, key);
  if (!validPageEvidence(r, document, page)) throw bad(); return r;
}
export async function importPageDocument(key: string, file: File, title: string): Promise<string> {
  const format = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".docx") ? "docx" : null;
  if (!format || file.size < 1 || file.size > 512_000) throw new ApiError(400, "Choose a PDF or DOCX up to 512 KB.");
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  const r = await apiFetch<{ id: string; sourceId: string; version: string; pageCount: number }>("/knowledge/documents", key, { method: "POST", body: { title, format, contentBase64: btoa(binary) } });
  if (!r || typeof r.id !== "string" || r.sourceId !== r.id || typeof r.version !== "string" || !/^[a-f0-9]{64}$/.test(r.version) || !r.id.endsWith(`:${r.version}`) || !Number.isInteger(r.pageCount) || r.pageCount < 1 || r.pageCount > 500) throw bad(); return r.id;
}
export async function saveDocumentHighlight(key: string, d: DocumentSummary, pageNumber: number, quote: string): Promise<void> {
  const r = await apiFetch<{ highlight: { id: string; pageNumber: number; quote: string; text: string; verification: string } }>(`/knowledge/documents/${encodeURIComponent(d.id)}/highlights`, key, { method: "POST", body: { sourceId: d.sourceId, version: d.version, pageNumber, quote } });
  if (!r?.highlight || typeof r.highlight.id !== "string" || !/^[a-f0-9]{64}$/.test(r.highlight.id) || r.highlight.pageNumber !== pageNumber || r.highlight.quote !== quote || r.highlight.text !== quote || r.highlight.verification !== "unverified") throw bad();
}
