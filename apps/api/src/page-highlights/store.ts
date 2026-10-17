import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection, assertValidTenantId } from "@lkb/db";
import type { PageHighlights } from "../../../../packages/core/src/generated/page_highlights.js";
import { buildPageIndex, type PageIndex } from "../../../../packages/index/src/pipeline/page-evidence/page-segments.js";

export type PageHighlightRow = PageHighlights;
/** ok: readable and writable. withdrawn: consent not given / revoked / deleted. absent: unknown, foreign or non-document. */
export type SourceState = "ok" | "withdrawn" | "absent";
export interface PageHighlightStore {
  sourceState(tenantId: string, sourceId: string): Promise<SourceState>;
  /** Page index of the source's current document; null when no document with real pages exists. */
  loadPageIndex(tenantId: string, sourceId: string): Promise<PageIndex | null>;
  list(tenantId: string, sourceId: string, documentHash: string): Promise<PageHighlightRow[]>;
  /** Idempotent on the natural id: a repeat returns the stored row with created=false. */
  insert(tenantId: string, row: PageHighlightRow): Promise<{ created: boolean; row: PageHighlightRow }>;
}

/** Stable natural identifier; identical highlights in two tenants never share an id. */
export function highlightId(tenantId: string, sourceId: string, documentHash: string, page: number, charStart: number, charEnd: number, quote: string): string {
  return createHash("sha256").update(JSON.stringify([tenantId, sourceId, documentHash, page, charStart, charEnd, quote])).digest("hex");
}

interface SourceRow { _id: string; tenantId: string; kind: string; status?: unknown; consent?: { given?: unknown }; sourceMeta?: { nativeDocumentHead?: { status?: unknown; currentRevisionHash?: unknown } } }
interface DocRow { _id: string; tenantId: string; sourceId: string; version: string; title: string; format: "pdf" | "docx"; createdAt: string; pages: Array<{ pageNumber: number; text: string }> }
const WITHDRAWN = new Set(["revoked", "deleted"]);
const MAX_LIST = 500;

/** Every read and write goes through the tenant-scoped accessor, and every returned row is re-checked against the caller's tenant. */
export function createMongoPageHighlightStore(db: Db): PageHighlightStore {
  const sources = (t: string) => scopedCollection<SourceRow>(db, "sources")(t);
  const docs = (t: string) => scopedCollection<DocRow>(db, "document_documents")(t);
  const highlights = (t: string) => scopedCollection<PageHighlightRow>(db, "page_highlights")(t);
  async function sourceRow(t: string, sourceId: string): Promise<SourceRow | null> {
    const row = await sources(t).findOne({ _id: sourceId });
    return row && row.tenantId === t && row._id === sourceId && row.kind === "document" ? row : null;
  }
  const withdrawn = (row: SourceRow) => row.consent?.given !== true || WITHDRAWN.has(row.status as string)
    || WITHDRAWN.has(row.sourceMeta?.nativeDocumentHead?.status as string);
  return {
    async sourceState(t, sourceId) {
      assertValidTenantId(t, "pageHighlights.sourceState");
      const row = await sourceRow(t, sourceId);
      return !row ? "absent" : withdrawn(row) ? "withdrawn" : "ok";
    },
    async loadPageIndex(t, sourceId) {
      assertValidTenantId(t, "pageHighlights.loadPageIndex");
      const source = await sourceRow(t, sourceId);
      if (!source || withdrawn(source)) return null;
      const rows = (await docs(t).find({ sourceId }).toArray()).filter(r => r.tenantId === t && r.sourceId === sourceId);
      const head = source.sourceMeta?.nativeDocumentHead;
      const pinned = typeof head?.currentRevisionHash === "string" ? head.currentRevisionHash : null;
      const row = pinned ? rows.find(r => r.version === pinned)
        : [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
      if (!row) return null;
      return buildPageIndex({ tenantId: t, sourceId, version: row.version, title: row.title, format: row.format, pages: row.pages });
    },
    async list(t, sourceId, documentHash) {
      assertValidTenantId(t, "pageHighlights.list");
      const rows = await highlights(t).find({ sourceId, documentHash }).toArray();
      return rows.filter(r => r.tenantId === t && r.sourceId === sourceId && r.documentHash === documentHash)
        .sort((a, b) => a.page - b.page || a.charStart - b.charStart || (a._id < b._id ? -1 : 1)).slice(0, MAX_LIST);
    },
    async insert(t, row) {
      assertValidTenantId(t, "pageHighlights.insert");
      if (row.tenantId !== t) throw new Error("Foreign page highlight");
      const { _id, ...fields } = row;
      const result = await highlights(t).updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
      const stored = await highlights(t).findOne({ _id });
      if (!stored || stored.tenantId !== t || stored.sourceId !== row.sourceId || stored.documentHash !== row.documentHash) throw new Error("Page highlight persistence unavailable");
      return { created: result.upsertedCount === 1, row: stored };
    },
  };
}
