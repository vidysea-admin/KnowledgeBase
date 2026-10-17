import { createHash } from "node:crypto";
import type { DocumentPageSourceLocator } from "@lkb/core";
import type { PageDocument } from "./document-pages.js";

export interface NativeDocumentPassage {
  text: string;
  locator: DocumentPageSourceLocator;
}
export interface NativeDocumentBinding { sourceId: string; headRevision: number }

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const sha = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/** Pure extraction only. A locator is not authority: publishers/readers must verify the current head. */
export function documentPagePassages(
  document: PageDocument, binding: NativeDocumentBinding, maxBytes = 1024,
): NativeDocumentPassage[] {
  if (!document || !binding || !nonempty(binding.sourceId) || !Number.isSafeInteger(binding.headRevision)
      || binding.headRevision < 1 || !nonempty(document._id) || !nonempty(document.sourceId)
      || !nonempty(document.tenantId) || !/^[a-f0-9]{64}$/.test(document.version)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > 1024
      || !Array.isArray(document.pages) || document.pages.length < 1 || document.pages.length > 500) {
    throw new Error("Invalid native document passage input");
  }
  const result: NativeDocumentPassage[] = [];
  const seen = new Set<number>();
  for (const page of document.pages) {
    if (!page || !Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1
        || seen.has(page.pageNumber) || typeof page.text !== "string") throw new Error("Invalid native document page");
    seen.add(page.pageNumber);
    let start = 0, end = 0, bytes = 0;
    const flush = () => {
      if (end === start) return;
      const text = page.text.slice(start, end);
      result.push({ text, locator: {
        kind: "document-page", sourceId: binding.sourceId, documentId: document._id,
        documentSourceId: document.sourceId, headRevision: binding.headRevision,
        revisionHash: document.version, pageNumber: page.pageNumber,
        passage: { start, end, sha256: sha(text) },
      } });
      start = end; bytes = 0;
    };
    // Iteration advances by Unicode code point; offsets remain JS UTF-16 slice offsets.
    for (const character of page.text) {
      const code = character.charCodeAt(0);
      if (character.length === 1 && code >= 0xd800 && code <= 0xdfff) throw new Error("Invalid native document Unicode");
      const size = Buffer.byteLength(character, "utf8");
      if (bytes + size > maxBytes) flush();
      end += character.length; bytes += size;
    }
    flush();
  }
  return result;
}
