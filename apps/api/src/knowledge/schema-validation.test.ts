import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertCanonicalKnowledgeRow, resolveKnowledgeSchemaDirectory } from "./schema-validation.js";
import type { DocumentDocuments, KnowledgeCollections } from "@lkb/core";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const collection: KnowledgeCollections = { _id: "a".repeat(64), tenantId: "a", title: "Admissions", members: [], revision: 1, updatedAt: "2026-10-14T00:00:00.000Z" };
test("canonical schema resolution works from the API package working directory without configured override", () => {
  const prior = process.env.LKB_SCHEMA_DIR; const cwd = process.cwd(); delete process.env.LKB_SCHEMA_DIR;
  try { process.chdir(resolve(repo, "apps/api")); assert.equal(resolveKnowledgeSchemaDirectory(), resolve(repo, "schema")); assert.doesNotThrow(() => assertCanonicalKnowledgeRow("knowledge_collections", collection)); }
  finally { process.chdir(cwd); if (prior === undefined) delete process.env.LKB_SCHEMA_DIR; else process.env.LKB_SCHEMA_DIR = prior; }
});
test("canonical schema and crossfield guards refuse malformed collection/page provenance before storage", () => {
  assert.throws(() => assertCanonicalKnowledgeRow("knowledge_collections", { ...collection, revision: 0 }));
  const document: DocumentDocuments = { _id: `a:${"a".repeat(64)}`, sourceId: `a:${"a".repeat(64)}`, tenantId: "a", version: "a".repeat(64), title: "Admissions", format: "pdf", pages: [{ pageNumber: 1, text: "Exact evidence" }], highlights: [], createdAt: "2026-10-14T00:00:00.000Z" };
  assert.doesNotThrow(() => assertCanonicalKnowledgeRow("document_documents", document));
  for (const patch of [{ pages: [] }, { sourceId: "different" }, { pages: [{ pageNumber: 2, text: "Exact evidence" }] }, { highlights: [{ id: "a".repeat(64), pageNumber: 1, quote: "Made up", text: "Made up", verification: "unverified" as const }] }]) assert.throws(() => assertCanonicalKnowledgeRow("document_documents", { ...document, ...patch } as DocumentDocuments));
});
