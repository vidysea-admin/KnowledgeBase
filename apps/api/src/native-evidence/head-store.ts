import { randomUUID as uuid } from "node:crypto";
import type { Db, Filter } from "mongodb";
import type { PageDocument } from "../../../../packages/ingest/src/sources/document-pages.js";
import { isValidTenantId } from "../auth.js";

export interface NativeDocumentHead {
  documentId: string; currentRevisionHash: string; status: "published" | "revoked" | "deleted"; headRevision: number;
}
export interface NativeDocumentBinding {
  sourceId: string; documentId: string; documentSourceId: string; revisionHash: string; headRevision: number;
}
export interface NativeDocumentCandidate extends NativeDocumentBinding { tenantId: string; document: PageDocument }
export interface NativeDocumentHeadDeps {
  db: Pick<Db, "collection">;
  loadDocument(tenantId: string, documentId: string): Promise<PageDocument | null>;
  /** Writes quarantined candidate rows. Consumers MUST recheck isCurrent before using any row. */
  indexCandidate(candidate: Readonly<NativeDocumentCandidate>): Promise<void>;
  randomUUID?(): string;
  now?(): string;
  indexTimeoutMs?: number;
}
interface SourceRow {
  _id: string; tenantId: string; kind: "document"; hash: string; consent: { given: boolean; recordedBy: string; note?: string };
  createdAt: string; captureMode: "provided"; status?: unknown; sourceMeta?: { nativeDocumentHead?: unknown };
}
const fail = (reason: string): never => { throw new Error("native_document_" + reason); };
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 400 && v.trim() === v && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function tenant(value: string) { if (!isValidTenantId(value)) fail("invalid_tenant"); }
function head(value: unknown): NativeDocumentHead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const h = value as NativeDocumentHead;
  return id(h.documentId) && hash(h.currentRevisionHash) && ["published", "revoked", "deleted"].includes(h.status)
    && Number.isSafeInteger(h.headRevision) && h.headRevision > 0 ? h : null;
}
function eligible(row: SourceRow | null, tenantId: string, sourceId: string): row is SourceRow {
  return !!row && row._id === sourceId && row.tenantId === tenantId && row.kind === "document"
    && row.consent?.given === true && id(row.consent.recordedBy) && !["revoked", "deleted"].includes(row.status as string);
}
function binding(document: PageDocument | null, tenantId: string, input: Pick<NativeDocumentBinding, "documentId" | "documentSourceId" | "revisionHash">): document is PageDocument {
  if (!document || document._id !== input.documentId || document.tenantId !== tenantId || document.sourceId !== input.documentSourceId
    || document.version !== input.revisionHash || !hash(document.version) || !id(document.sourceId)
    || !Array.isArray(document.pages) || document.pages.length < 1 || document.pages.length > 500) return false;
  let size = 0;
  return document.pages.every((page, i) => page.pageNumber === i + 1 && typeof page.text === "string" && (size += page.text.length) <= 2_000_000);
}
/** Stable logical source first; immutable byte revisions never become their own current-head authority. */
export function createNativeDocumentHeadStore(deps: NativeDocumentHeadDeps) {
  const timeout = deps.indexTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) fail("invalid_timeout");
  const sources = () => deps.db.collection<SourceRow>("sources");
  async function read(tenantId: string, sourceId: string) {
    tenant(tenantId); if (!id(sourceId)) fail("invalid_source");
    return sources().findOne({ _id: sourceId, tenantId });
  }
  function filter(row: SourceRow, expected: number | null): Filter<SourceRow> {
    return { _id: row._id, tenantId: row.tenantId, kind: "document", hash: row.hash,
      "consent.given": true, "consent.recordedBy": row.consent.recordedBy,
      status: { $nin: ["revoked", "deleted"] },
      ...(expected === null ? { "sourceMeta.nativeDocumentHead": { $exists: false } }
        : { "sourceMeta.nativeDocumentHead.headRevision": expected }) };
  }
  async function loadPublished(tenantId: string, sourceId: string) {
    const row = await read(tenantId, sourceId), current = head(row?.sourceMeta?.nativeDocumentHead);
    if (!eligible(row, tenantId, sourceId) || !current || current.status !== "published") return null;
    const document = await deps.loadDocument(tenantId, current.documentId);
    if (!document || !binding(document, tenantId, { documentId: current.documentId, documentSourceId: document.sourceId, revisionHash: current.currentRevisionHash })) return null;
    const fresh = await read(tenantId, sourceId), after = head(fresh?.sourceMeta?.nativeDocumentHead);
    if (!eligible(fresh, tenantId, sourceId) || !after || JSON.stringify(after) !== JSON.stringify(current)) return null;
    return { sourceId, document, head: { ...current } };
  }
  return {
    async registerLogicalSource(tenantId: string, consent: { recordedBy: string; note?: string }) {
      tenant(tenantId); if (!id(consent.recordedBy) || (consent.note !== undefined && (typeof consent.note !== "string" || consent.note.length > 2000))) fail("invalid_consent");
      const sourceId = "document-source:" + (deps.randomUUID ?? uuid)();
      if (!id(sourceId)) fail("invalid_source");
      const createdAt = (deps.now ?? (() => new Date().toISOString()))();
      if (!Number.isFinite(Date.parse(createdAt))) fail("invalid_time");
      await sources().insertOne({ _id: sourceId, tenantId, kind: "document", hash: sourceId,
        consent: { given: true, ...consent }, createdAt, captureMode: "provided" });
      return { sourceId };
    },
    async publish(tenantId: string, input: { sourceId: string; documentId: string; documentSourceId: string; revisionHash: string; expectedHeadRevision: number | null }) {
      const row = await read(tenantId, input.sourceId);
      if (!eligible(row, tenantId, input.sourceId)) return fail("source_unavailable");
      if (!id(input.documentId) || !id(input.documentSourceId) || !hash(input.revisionHash)
        || (input.expectedHeadRevision !== null && (!Number.isSafeInteger(input.expectedHeadRevision) || input.expectedHeadRevision < 1))) return fail("invalid_binding");
      if (input.sourceId === input.documentId || input.sourceId === input.documentSourceId) return fail("unstable_source");
      const raw = row.sourceMeta?.nativeDocumentHead, current = head(raw);
      if (raw !== undefined && !current) return fail("invalid_head");
      const document = await deps.loadDocument(tenantId, input.documentId);
      if (!binding(document, tenantId, input)) return fail("invalid_binding");
      if (current?.status === "published" && current.documentId === input.documentId && current.currentRevisionHash === input.revisionHash) {
        const fresh = await read(tenantId, input.sourceId);
        if (!eligible(fresh, tenantId, input.sourceId) || JSON.stringify(head(fresh.sourceMeta?.nativeDocumentHead)) !== JSON.stringify(current)) return fail("head_conflict");
        return { ...current };
      }
      if ((current?.headRevision ?? null) !== input.expectedHeadRevision) return fail("head_conflict");
      const headRevision = (current?.headRevision ?? 0) + 1;
      if (!Number.isSafeInteger(headRevision)) return fail("head_conflict");
      const candidate = Object.freeze({ tenantId, sourceId: input.sourceId, documentId: document._id,
        documentSourceId: document.sourceId, revisionHash: document.version, headRevision, document: structuredClone(document) });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([deps.indexCandidate(candidate), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("native_document_index_timeout")), timeout);
      })]); } finally { if (timer) clearTimeout(timer); }
      const next: NativeDocumentHead = { documentId: document._id, currentRevisionHash: document.version, status: "published", headRevision };
      const wrote = await sources().updateOne(filter(row, input.expectedHeadRevision), { $set: { "sourceMeta.nativeDocumentHead": next } });
      if (wrote.modifiedCount !== 1) return fail("head_conflict");
      return next;
    },
    async tombstone(tenantId: string, input: { sourceId: string; expectedHeadRevision: number; status: "revoked" | "deleted" }) {
      const row = await read(tenantId, input.sourceId), current = head(row?.sourceMeta?.nativeDocumentHead);
      if (!eligible(row, tenantId, input.sourceId) || !current) return fail("source_unavailable");
      if (!["revoked", "deleted"].includes(input.status) || !Number.isSafeInteger(input.expectedHeadRevision) || current.headRevision !== input.expectedHeadRevision || !Number.isSafeInteger(current.headRevision + 1)) return fail("head_conflict");
      const next: NativeDocumentHead = { ...current, status: input.status, headRevision: current.headRevision + 1 };
      const wrote = await sources().updateOne(filter(row, input.expectedHeadRevision), { $set: { "sourceMeta.nativeDocumentHead": next } });
      if (wrote.modifiedCount !== 1) return fail("head_conflict");
      return next;
    },
    loadPublished,
    async isCurrent(tenantId: string, candidate: NativeDocumentBinding) {
      const current = await loadPublished(tenantId, candidate.sourceId);
      return !!current && current.head.documentId === candidate.documentId && current.head.headRevision === candidate.headRevision
        && current.head.currentRevisionHash === candidate.revisionHash && current.document.sourceId === candidate.documentSourceId;
    },
  };
}
