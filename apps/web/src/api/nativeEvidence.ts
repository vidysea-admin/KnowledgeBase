import { apiFetch, ApiError } from "./client.js";

// Wire mirror of @lkb/core SourceLocator; web does not import packages/*.
interface Passage { start: number; end: number; sha256: string }
export type NativeSourceLocator = {
  kind: "document-page"; documentId: string; sourceId: string; documentSourceId: string;
  headRevision: number; revisionHash: string; pageNumber: number; passage: Passage;
} | {
  kind: "message"; sourceId: string; revisionHash: string; threadId: string; messageId: string; passage: Passage;
};
export interface NativeEvidence { sourceLocator: NativeSourceLocator; quote: string; title?: string }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function id(v: unknown): v is string {
  if (typeof v !== "string" || !v || v !== v.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(v)) return false;
  try { return new TextEncoder().encode(v).length <= 4096 && Boolean(encodeURIComponent(v)); } catch { return false; }
}
export function parseNativeSourceLocator(v: unknown): NativeSourceLocator | null {
  if (!object(v) || !id(v.sourceId) || !hash(v.revisionHash) || !object(v.passage)) return null;
  const p = v.passage;
  if (!exact(p, ["start", "end", "sha256"]) || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end)
    || Number(p.start) < 0 || Number(p.end) <= Number(p.start) || Number(p.end) - Number(p.start) > 4000 || !hash(p.sha256)) return null;
  const passage = { start: Number(p.start), end: Number(p.end), sha256: p.sha256 };
  if (v.kind === "document-page" && exact(v, ["kind", "documentId", "sourceId", "documentSourceId", "headRevision", "revisionHash", "pageNumber", "passage"])
    && id(v.documentId) && id(v.documentSourceId) && Number.isSafeInteger(v.headRevision) && Number(v.headRevision) >= 1
    && Number.isSafeInteger(v.pageNumber) && Number(v.pageNumber) >= 1) {
    return { kind: v.kind, documentId: v.documentId, sourceId: v.sourceId, documentSourceId: v.documentSourceId,
      headRevision: Number(v.headRevision), revisionHash: v.revisionHash, pageNumber: Number(v.pageNumber), passage };
  }
  if (v.kind === "message" && exact(v, ["kind", "sourceId", "revisionHash", "threadId", "messageId", "passage"])
    && id(v.threadId) && id(v.messageId)) return { kind: v.kind, sourceId: v.sourceId, revisionHash: v.revisionHash,
      threadId: v.threadId, messageId: v.messageId, passage };
  return null;
}

/** Reload current tenant/source authority on every call; never cache citation evidence. */
export async function resolveNativeEvidence(apiKey: string | null, sourceLocator: NativeSourceLocator): Promise<NativeEvidence> {
  const requested = parseNativeSourceLocator(sourceLocator);
  if (!requested) throw new ApiError(400, "This source citation is invalid.");
  const response = await apiFetch<unknown>("/citations/native/resolve", apiKey, { method: "POST", body: { sourceLocator: requested } });
  const evidence = object(response) && response.evidence;
  const resolved = object(evidence) && parseNativeSourceLocator(evidence.sourceLocator);
  if (!object(evidence) || !resolved || JSON.stringify(resolved) !== JSON.stringify(requested)
    || typeof evidence.quote !== "string" || !evidence.quote.trim()
    || evidence.quote.length !== requested.passage.end - requested.passage.start
    || evidence.title !== undefined && (typeof evidence.title !== "string" || evidence.title.length > 500)) {
    throw new ApiError(503, "This source passage is unavailable.");
  }
  return { sourceLocator: resolved, quote: evidence.quote, ...(typeof evidence.title === "string" ? { title: evidence.title } : {}) };
}
