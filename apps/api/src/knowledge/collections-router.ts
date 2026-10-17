import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { requireScope, isValidTenantId } from "../auth.js";
import { producePageDocument } from "../../../../packages/ingest/src/sources/document-pages.js";
import { buildPageIndex } from "../../../../packages/index/src/pipeline/page-evidence/page-segments.js";
import { validateHighlight } from "../../../../packages/index/src/pipeline/page-evidence/highlight-validator.js";
import { collectionId, type CollectionMember, type KnowledgeStore } from "./collections-store.js";
import { createKnowledgeCatalogRouter } from "./catalog-router.js";
import type { KnowledgeCatalog } from "./catalog-store.js";
import type { createNativeDocumentHeadStore } from "../native-evidence/head-store.js";

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 400): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
const exact = (v: Obj, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
function send(res: Response, status: number, value: unknown) { res.status(status).set("Cache-Control", "private, no-store").json(value); }
function tenant(req: Request): string { if (!isValidTenantId(req.auth?.tenantId)) throw new Error("No verified tenant"); return req.auth.tenantId; }
function members(value: unknown): CollectionMember[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const out: CollectionMember[] = []; const seen = new Set<string>();
  for (const v of value) {
    if (!obj(v) || !exact(v, ["kind", "id"]) || !["session", "document", "topic", "speaker"].includes(v.kind as string) || !text(v.id)) return null;
    const key = JSON.stringify([v.kind, v.id]); if (!seen.has(key)) { seen.add(key); out.push(v as unknown as CollectionMember); }
  }
  return out;
}
export type NativeDocumentLifecycle = Pick<ReturnType<typeof createNativeDocumentHeadStore>,
  "registerLogicalSource" | "publish" | "tombstone" | "loadPublished">;
export interface KnowledgeDeps { store: KnowledgeStore; catalog?: KnowledgeCatalog; renderDocxToPdf?: (bytes: Uint8Array) => Promise<Uint8Array>; clock?: () => string; nativeDocuments?: NativeDocumentLifecycle }

function nativeFailure(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "native_document_head_conflict") return send(res, 409, { error: "document_head_conflict" });
  if (code === "native_document_source_unavailable") return send(res, 404, { error: "not_found" });
  if (["native_document_invalid_binding", "native_document_unstable_source"].includes(code)) return send(res, 422, { error: "invalid_document_binding" });
  return send(res, 503, { error: "native_documents_unavailable" });
}

/** Mount after requireAuth. Existing sessions read scope and ingest write scope are checked separately. */
export function createKnowledgeRouter(deps: KnowledgeDeps): Router {
  const router = Router(); const now = deps.clock ?? (() => new Date().toISOString());
  router.use(createKnowledgeCatalogRouter(deps.catalog));
  router.use("/knowledge", (req, res, next) => { if (!isValidTenantId(req.auth?.tenantId)) return send(res, 401, { error: "unauthorized" }); next(); });
  router.post("/knowledge/document-sources", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body;
    if (!obj(b) || !exact(b, ["consentGiven", "note"]) || b.consentGiven !== true
        || (b.note !== undefined && !text(b.note, 2000))) return send(res, 400, { error: "invalid_document_consent" });
    if (!text(req.auth?.keyId)) return send(res, 401, { error: "verified_key_identity_required" });
    if (!deps.nativeDocuments) return send(res, 503, { error: "native_documents_unavailable" });
    try {
      const result = await deps.nativeDocuments.registerLogicalSource(tenant(req), {
        recordedBy: req.auth!.keyId!, ...(typeof b.note === "string" ? { note: b.note } : {}),
      });
      send(res, 201, { sourceId: result.sourceId });
    } catch (error) { nativeFailure(res, error); }
  });
  router.put("/knowledge/document-sources/:sourceId", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body; const sourceId = req.params.sourceId;
    if (!text(sourceId) || !obj(b) || !exact(b, ["documentId", "documentSourceId", "revisionHash", "expectedHeadRevision"])
        || !text(b.documentId) || !text(b.documentSourceId) || typeof b.revisionHash !== "string" || !/^[a-f0-9]{64}$/.test(b.revisionHash)
        || !(b.expectedHeadRevision === null || (Number.isSafeInteger(b.expectedHeadRevision) && Number(b.expectedHeadRevision) >= 1))) {
      return send(res, 400, { error: "invalid_document_binding" });
    }
    if (!deps.nativeDocuments) return send(res, 503, { error: "native_documents_unavailable" });
    try {
      const head = await deps.nativeDocuments.publish(tenant(req), {
        sourceId, documentId: b.documentId, documentSourceId: b.documentSourceId, revisionHash: b.revisionHash,
        expectedHeadRevision: b.expectedHeadRevision === null ? null : Number(b.expectedHeadRevision),
      });
      send(res, 200, { sourceId, head });
    } catch (error) { nativeFailure(res, error); }
  });
  const tombstone = (status: "revoked" | "deleted") => async (req: Request, res: Response) => {
    const b: unknown = req.body; const sourceId = req.params.sourceId;
    if (!text(sourceId) || !obj(b) || !exact(b, ["expectedHeadRevision"])
        || !Number.isSafeInteger(b.expectedHeadRevision) || Number(b.expectedHeadRevision) < 1) {
      return send(res, 400, { error: "invalid_document_revision" });
    }
    if (!deps.nativeDocuments) return send(res, 503, { error: "native_documents_unavailable" });
    try {
      const head = await deps.nativeDocuments.tombstone(tenant(req), { sourceId, expectedHeadRevision: Number(b.expectedHeadRevision), status });
      send(res, 200, { sourceId, head });
    } catch (error) { nativeFailure(res, error); }
  };
  router.delete("/knowledge/document-sources/:sourceId", requireScope("ingest"), tombstone("deleted"));
  router.post("/knowledge/document-sources/:sourceId/revoke", requireScope("ingest"), tombstone("revoked"));
  router.get("/knowledge/documents", requireScope("sessions"), async (req, res) => {
    try { const rows = await deps.store.listDocuments(tenant(req)); send(res, 200, { documents: rows.slice(0, 100).map(r => ({ id: r._id, sourceId: r.sourceId, version: r.version, title: r.title, format: r.format, pageCount: r.pages.length })), truncated: rows.length > 100 }); }
    catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.post("/knowledge/documents", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body;
    if (!obj(b) || !exact(b, ["title", "format", "contentBase64"]) || !text(b.title, 200) || !["pdf", "docx"].includes(b.format as string) || typeof b.contentBase64 !== "string" || b.contentBase64.length > 683_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.contentBase64)) return send(res, 400, { error: "invalid_document" });
    if (b.format === "docx" && !deps.renderDocxToPdf) return send(res, 503, { error: "docx_renderer_unavailable" });
    try {
      const row = await producePageDocument({ tenantId: tenant(req), title: b.title, format: b.format as "pdf" | "docx", bytes: Buffer.from(b.contentBase64, "base64"), createdAt: now() }, deps.renderDocxToPdf);
      const saved = await deps.store.saveDocument(tenant(req), { ...row, highlights: [] });
      send(res, 200, { id: saved._id, sourceId: saved.sourceId, version: saved.version, pageCount: saved.pages.length });
    } catch { send(res, 422, { error: "document_not_imported", message: "Document extraction or persistence failed; no imported document is claimed." }); }
  });
  router.get("/knowledge/documents/:id", requireScope("sessions"), async (req, res) => {
    try { const row = await deps.store.getDocument(tenant(req), req.params.id as string); if (!row) return send(res, 404, { error: "not_found" });
      if (await deps.store.sourceWithdrawn(tenant(req), row.sourceId)) return send(res, 403, { error: "source_consent_withdrawn" });
      send(res, 200, { id: row._id, sourceId: row.sourceId, version: row.version, title: row.title, format: row.format, pageCount: row.pages.length,
        highlights: row.highlights.map(({ id, pageNumber, quote, text, verification }) => ({ id, pageNumber, quote, text, verification })) }); }
    catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.get("/knowledge/documents/:id/pages/:page", requireScope("sessions"), async (req, res) => {
    if (!/^[1-9][0-9]{0,2}$/.test(req.params.page as string)) return send(res, 400, { error: "invalid_page" });
    try { const row = await deps.store.getDocument(tenant(req), req.params.id as string); const page = row?.pages.find(p => p.pageNumber === Number(req.params.page));
      if (!row || !page) return send(res, 404, { error: "not_found" });
      if (await deps.store.sourceWithdrawn(tenant(req), row.sourceId)) return send(res, 403, { error: "source_consent_withdrawn" });
      send(res, 200, { id: row._id, sourceId: row.sourceId, version: row.version, title: row.title, pageNumber: page.pageNumber, text: page.text }); }
    catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.post("/knowledge/documents/:id/highlights", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body;
    if (!obj(b) || !exact(b, ["sourceId", "version", "pageNumber", "quote", "charStart", "charEnd"]) || (b.charStart === undefined) !== (b.charEnd === undefined) || (b.charStart !== undefined && (!Number.isInteger(b.charStart) || !Number.isInteger(b.charEnd))) || !text(b.sourceId) || !text(b.version, 64) || !Number.isInteger(b.pageNumber) || Number(b.pageNumber) < 1 || typeof b.quote !== "string" || !b.quote.trim() || b.quote.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(b.quote)) return send(res, 400, { error: "invalid_highlight" });
    try { const t = tenant(req); const row = await deps.store.getDocument(t, req.params.id as string);
      if (!row) return send(res, 404, { error: "not_found" });
      if (await deps.store.sourceWithdrawn(t, row.sourceId)) return send(res, 403, { error: "source_consent_withdrawn" });
      if (b.sourceId !== row.sourceId || b.version !== row.version) return send(res, 422, { error: "evidence_unavailable" });
      // Page index from the tenant-owned row; offsets default to the first verbatim occurrence on the cited page, and validateHighlight decides.
      const index = buildPageIndex({ tenantId: t, sourceId: row.sourceId, version: row.version, title: row.title, format: row.format, pages: row.pages });
      const seg = index.segments.find(s => s.page === b.pageNumber); const at = seg ? seg.text.indexOf(b.quote) : -1;
      const start = b.charStart !== undefined ? Number(b.charStart) : seg && at >= 0 ? seg.start + at : -1;
      const verdict = validateHighlight(index, { quote: b.quote, page: b.pageNumber, start, end: b.charEnd !== undefined ? Number(b.charEnd) : start + b.quote.length });
      if (!verdict.ok) return send(res, 422, { error: "evidence_unavailable", reason: verdict.reason });
      const id = createHash("sha256").update(JSON.stringify([row._id, row.version, b.pageNumber, b.quote])).digest("hex");
      const highlight = { id, pageNumber: Number(b.pageNumber), quote: b.quote, text: b.quote, verification: "unverified" as const };
      if (!await deps.store.saveHighlight(t, row._id, highlight)) return send(res, 409, { error: "evidence_changed" }); send(res, 200, { highlight });
    } catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.get("/knowledge/collections", requireScope("sessions"), async (req, res) => {
    try { const t = tenant(req); const rows = await deps.store.listCollections(t);
      const collections = await Promise.all(rows.slice(0, 100).map(async r => {
        const eligibility = await Promise.all(r.members.map(m => deps.store.memberExists(t, m)));
        const safe = r.members.filter((_, i) => eligibility[i]);
        return { id: r._id, title: r.title, revision: r.revision, updatedAt: r.updatedAt, unavailableMembers: safe.length !== r.members.length,
          members: await Promise.all(safe.map(async m => ({ kind: m.kind, id: m.id, available: true,
            ...(m.kind === "speaker" ? { personId: await deps.store.speakerPersonId(t, m) } : {}) }))) };
      }));
      send(res, 200, { collections, truncated: rows.length > 100 }); } catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.get("/knowledge/members", requireScope("sessions"), async (req, res) => {
    try { const all = await deps.store.listMembers(tenant(req)); const kept = all.filter((m, i) => all.slice(0, i).filter(x => x.kind === m.kind).length < 100);
      send(res, 200, { members: kept, truncated: kept.length < all.length }); }
    catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.put("/knowledge/collections/:id", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body; const id = req.params.id as string;
    if (!text(id, 64) || !obj(b) || !exact(b, ["title", "members", "expectedRevision"]) || !text(b.title, 200) || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision) < 0 || Number(b.expectedRevision) >= Number.MAX_SAFE_INTEGER) return send(res, 400, { error: "invalid_collection" });
    const parsed = members(b.members); if (!parsed) return send(res, 400, { error: "invalid_members" });
    try { const t = tenant(req); const key = Number(b.expectedRevision) === 0 ? collectionId(t, id) : id;
      if (!(await Promise.all(parsed.map(m => deps.store.memberExists(t, m)))).every(Boolean)) return send(res, 422, { error: "member_unavailable" });
      const row = { _id: key, tenantId: t, title: b.title, members: parsed, revision: Number(b.expectedRevision) + 1, updatedAt: now() };
      if (Number(b.expectedRevision) === 0) { const old = await deps.store.getCollection(t, key);
        if (old && old.revision === 1 && old.title === row.title && JSON.stringify(old.members) === JSON.stringify(row.members)) return send(res, 200, { id: old._id, title: old.title, revision: old.revision, members: old.members }); }
      if (!await deps.store.writeCollection(t, row, Number(b.expectedRevision))) return send(res, 409, { error: "collection_changed" });
      send(res, 200, { id: row._id, title: row.title, revision: row.revision, members: row.members });
    } catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  router.delete("/knowledge/collections/:id", requireScope("ingest"), async (req, res) => {
    const b: unknown = req.body;
    if (!obj(b) || !exact(b, ["expectedRevision"]) || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision) < 1) return send(res, 400, { error: "invalid_revision" });
    try { const t = tenant(req); if (!await deps.store.getCollection(t, req.params.id as string)) return send(res, 404, { error: "not_found" });
      if (!await deps.store.deleteCollection(t, req.params.id as string, Number(b.expectedRevision))) return send(res, 409, { error: "collection_changed" }); send(res, 200, { deleted: true }); }
    catch { send(res, 503, { error: "knowledge_unavailable" }); }
  });
  return router;
}
