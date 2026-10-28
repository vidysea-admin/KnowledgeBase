import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import type { DocumentDocuments, KnowledgeCollections } from "@lkb/core";
import { tenantSourceId } from "../../../../packages/ingest/src/source.js";
import { createHash } from "node:crypto";
const validators = new Map<string, ValidateFunction>();
// The pinned package exports a CommonJS function; validate that boundary before using its declared plugin type.
const loadedFormats: unknown = createRequire(import.meta.url)("ajv-formats");
if (typeof loadedFormats !== "function") throw new Error("Canonical knowledge format validator unavailable");
const addFormats = loadedFormats as FormatsPlugin;
export function resolveKnowledgeSchemaDirectory(): string {
  const configured = process.env.LKB_SCHEMA_DIR;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) throw new Error("LKB_SCHEMA_DIR must be absolute");
    return resolve(configured);
  }
  // Both source (apps/api/src/knowledge) and bundled (apps/api/dist) execution locate shipped schemas by module ancestry.
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let level = 0; level < 8; level++) {
    const candidate = resolve(directory, "schema");
    if (existsSync(resolve(candidate, "document_documents.schema.json")) && existsSync(resolve(candidate, "knowledge_collections.schema.json"))) return candidate;
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  throw new Error("Canonical knowledge schemas unavailable");
}
export function assertCanonicalKnowledgeRow(name: "document_documents", row: DocumentDocuments): void;
export function assertCanonicalKnowledgeRow(name: "knowledge_collections", row: KnowledgeCollections): void;
/** Canonical schema is loaded from shipped schema/, not copied into a hand-maintained application validator. */
export function assertCanonicalKnowledgeRow(name: "document_documents" | "knowledge_collections", row: DocumentDocuments | KnowledgeCollections): void {
  const directory = resolveKnowledgeSchemaDirectory(); const key = `${directory}/${name}`;
  let validator = validators.get(key);
  if (!validator) {
    const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
    validator = ajv.compile(JSON.parse(readFileSync(resolve(directory, `${name}.schema.json`), "utf8"))); validators.set(key, validator);
  }
  if (!validator(row)) throw new Error("Canonical knowledge schema validation failed");
  if (name === "document_documents") {
    const doc = row as DocumentDocuments;
    if (doc.sourceId !== doc._id || doc._id !== tenantSourceId(doc.tenantId, doc.version) || doc.pages.length < 1 || doc.pages.length > 500 || doc.pages.some((p, i) => p.pageNumber !== i + 1)) throw new Error("Invalid document source/page identity");
    for (const h of doc.highlights) {
      const page = doc.pages.find(p => p.pageNumber === h.pageNumber);
      const id = createHash("sha256").update(JSON.stringify([doc._id, doc.version, h.pageNumber, h.quote])).digest("hex");
      if (!page || !h.quote || h.text !== h.quote || !page.text.includes(h.quote) || h.id !== id) throw new Error("Invalid document highlight provenance");
    }
  }
}
