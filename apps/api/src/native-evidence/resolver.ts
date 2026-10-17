import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { NativeSourceLocator } from "@lkb/core";
import { isValidTenantId } from "../auth.js";

type CurrentBase = {
  tenantId: string; sourceId: string; revisionHash: string;
  /** Independently read from the authoritative current source head, never inferred from an immutable body. */
  currentRevisionHash: string;
  /** The source owner has checked current publication, consent and visibility in its read snapshot. */
  eligible: true;
  text: string; title?: string;
};
export type NativeCurrentUnit = CurrentBase & (
  { kind: "document-page"; documentId: string; documentSourceId: string; headRevision: number; pageNumber: number } |
  { kind: "message"; threadId: string; messageId: string }
);
export interface ResolvedNativeEvidence { sourceLocator: NativeSourceLocator; quote: string; title?: string }
export interface NativeEvidenceResolver {
  resolve(tenantId: string, locator: NativeSourceLocator): Promise<ResolvedNativeEvidence | null>;
  revalidate(tenantId: string, evidence: ResolvedNativeEvidence): Promise<ResolvedNativeEvidence | null>;
  /** Trusted read-phase capability. The bound resolver must stay inside the supplied snapshot callback. */
  forReadView?(view: Pick<Db, "collection">): NativeEvidenceResolver;
}
export interface NativeEvidenceResolverDeps {
  /** Trusted capability: tenant-authorized CURRENT source/head/eligibility and body, in one owner snapshot.
   * Missing head, deleted/revoked/ineligible sources return null. Infrastructure failures must throw.
   * This resolver does not upgrade an ordinary immutable-document lookup into that capability. */
  loadCurrent(tenantId: string, locator: NativeSourceLocator): Promise<NativeCurrentUnit | null>;
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function id(v: unknown): v is string {
  if (typeof v !== "string" || !v || v !== v.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(v) || Buffer.byteLength(v, "utf8") > 4096) return false;
  try { encodeURIComponent(v); return true; } catch { return false; }
}
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const splitsPair = (text: string, at: number) => at > 0 && at < text.length
  && text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff
  && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff;

/** Single runtime locator validator shared by source hydration and HTTP resolution. */
export function parseNativeSourceLocator(value: unknown): NativeSourceLocator | null {
  if (!record(value) || !id(value.sourceId) || !hash(value.revisionHash) || !record(value.passage)) return null;
  const p = value.passage;
  if (!exact(p, ["start", "end", "sha256"]) || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end)
    || Number(p.start) < 0 || Number(p.end) <= Number(p.start) || Number(p.end) - Number(p.start) > 4000 || !hash(p.sha256)) return null;
  const passage = Object.freeze({ start: Number(p.start), end: Number(p.end), sha256: p.sha256 });
  if (value.kind === "document-page" && exact(value, ["kind", "documentId", "documentSourceId", "headRevision", "sourceId", "revisionHash", "pageNumber", "passage"])
    && id(value.documentId) && id(value.documentSourceId) && Number.isSafeInteger(value.headRevision) && Number(value.headRevision) >= 1
    && Number.isSafeInteger(value.pageNumber) && Number(value.pageNumber) >= 1) {
    return Object.freeze({ kind: "document-page", documentId: value.documentId, sourceId: value.sourceId,
      documentSourceId: value.documentSourceId, headRevision: Number(value.headRevision),
      revisionHash: value.revisionHash, pageNumber: Number(value.pageNumber), passage });
  }
  if (value.kind === "message" && exact(value, ["kind", "sourceId", "revisionHash", "threadId", "messageId", "passage"])
    && id(value.threadId) && id(value.messageId)) {
    return Object.freeze({ kind: "message", sourceId: value.sourceId, revisionHash: value.revisionHash,
      threadId: value.threadId, messageId: value.messageId, passage });
  }
  return null;
}

/** No cache, fake turn, audio time or source-owner authorization fallback. */
export function createNativeEvidenceResolver(deps: NativeEvidenceResolverDeps): NativeEvidenceResolver {
  const resolve: NativeEvidenceResolver["resolve"] = async (tenantId, input) => {
    if (!isValidTenantId(tenantId)) return null;
    const locator = parseNativeSourceLocator(input);
    if (!locator) return null;
    const unit = await deps.loadCurrent(tenantId, locator);
    if (!unit || unit.tenantId !== tenantId || unit.eligible !== true || unit.kind !== locator.kind
      || unit.sourceId !== locator.sourceId || !hash(unit.currentRevisionHash)
      || unit.currentRevisionHash !== locator.revisionHash || unit.revisionHash !== locator.revisionHash
      || typeof unit.text !== "string" || unit.text.length > 2_000_000 || locator.passage.end > unit.text.length) return null;
    if (locator.kind === "document-page" && (unit.kind !== "document-page" || unit.documentId !== locator.documentId
      || unit.documentSourceId !== locator.documentSourceId || unit.headRevision !== locator.headRevision || unit.pageNumber !== locator.pageNumber)) return null;
    if (locator.kind === "message" && (unit.kind !== "message" || unit.threadId !== locator.threadId || unit.messageId !== locator.messageId)) return null;
    if (splitsPair(unit.text, locator.passage.start) || splitsPair(unit.text, locator.passage.end)) return null;
    const quote = unit.text.slice(locator.passage.start, locator.passage.end);
    if (!quote.trim() || createHash("sha256").update(quote, "utf8").digest("hex") !== locator.passage.sha256) return null;
    return { sourceLocator: locator, quote, ...(typeof unit.title === "string" && unit.title.length <= 500 ? { title: unit.title } : {}) };
  };
  return { resolve, async revalidate(tenantId, evidence) {
    if (!record(evidence) || typeof evidence.quote !== "string") return null;
    const current = await resolve(tenantId, evidence.sourceLocator);
    return current?.quote === evidence.quote ? current : null;
  } };
}
