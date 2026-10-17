import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createServer } from "../server.js";
import { buildTestDeps } from "../fixtures.js";
import { createMongoKnowledgeStore } from "./collections-store.js";
import { samplePdf } from "./pdf-fixture.js";
import { createMongoKnowledgeCatalog } from "./catalog-store.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

type Row = Record<string, any>;
function database() {
  const rows: Record<string, Row[]> = { sessions: [{ _id: "shared", tenantId: "a", title: "Own session", sourceId: "source" }, { _id: "foreign", tenantId: "b", title: "Hidden" }], sources: [{ _id: "source", tenantId: "a", kind: "recording", createdAt: "2026-10-14" }], topics: [], speakers: [], knowledge_collections: [], document_documents: [] };
  const calls: Array<{ collection: string; operation: string; filter: Row }> = [];
  const value = (row: Row, key: string): any => key === "highlights.id" ? (row.highlights ?? []).map((h: Row) => h.id) : row[key];
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([k, v]) => v && typeof v === "object" && "$elemMatch" in v ? Array.isArray(value(row, k)) && value(row, k).some((m: Row) => matches(m, v.$elemMatch)) : v && typeof v === "object" && "$ne" in v ? !value(row, k)?.includes(v.$ne) : Array.isArray(value(row, k)) ? value(row, k).includes(v) : value(row, k) === v);
  const db = { databaseName: "test-t055", collection(name: string) {
    const data = rows[name] ??= []; const record = (operation: string, filter: Row) => { calls.push({ collection: name, operation, filter: structuredClone(filter) }); assert.equal(typeof filter.tenantId, "string"); };
    return {
      find(filter: Row) { record("find", filter); return { toArray: async () => structuredClone(data.filter(r => matches(r, filter))) }; },
      async findOne(filter: Row) { record("findOne", filter); return structuredClone(data.find(r => matches(r, filter)) ?? null); },
      async insertOne(row: Row) { assert.equal(typeof row.tenantId, "string"); if (data.some(r => r._id === row._id)) throw { code: 11000 }; data.push(structuredClone(row)); return {}; },
      async updateOne(filter: Row, update: Row, opts: Row) {
        record("updateOne", filter); let row = data.find(r => matches(r, filter));
        if (!row && opts.upsert) { row = structuredClone(filter); Object.assign(row, update.$setOnInsert); data.push(row!); }
        if (!row) return { matchedCount: 0 };
        if (update.$set) Object.assign(row, structuredClone(update.$set));
        if (update.$push) for (const [key, value] of Object.entries(update.$push)) (row[key] ??= []).push(structuredClone(value));
        return { matchedCount: 1 };
      },
      async deleteMany(filter: Row) { record("deleteMany", filter); const count = data.filter(r => matches(r, filter)).length; rows[name] = data.filter(r => !matches(r, filter)); data.splice(0, data.length, ...rows[name]!); return { deletedCount: count }; },
    };
  } } as unknown as Db;
  return { db, rows, calls };
}
async function run(fn: (call: (method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body: any }>, fx: ReturnType<typeof database>) => Promise<void>) {
  const fx = database();
  const app = createServer(buildTestDeps({
    keyStore: { verify: async k => !["writer", "foreign", "reader"].includes(k) ? null : { tenantId: k === "foreign" ? "b" : "a", scopes: k === "reader" ? ["sessions"] : ["sessions", "ingest", "sources"] } },
    knowledge: { store: createMongoKnowledgeStore(fx.db), catalog: createMongoKnowledgeCatalog(fx.db), clock: () => "2026-10-14T00:00:00.000Z" },
  }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const call = async (method: string, path: string, body?: unknown, key = "writer") => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try { await fn(call, fx); } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
test("actual storage/router collections CRUD persists reload, dedupes and requires exact tenant membership/revision", async () => run(async (call, fx) => {
  const create = { title: "Admissions", members: [{ kind: "session", id: "shared" }, { kind: "session", id: "shared" }], expectedRevision: 0 };
  const made = await call("PUT", "/knowledge/collections/client-id", create); assert.equal(made.status, 200); assert.equal(made.body.members.length, 1);
  const again = await call("PUT", "/knowledge/collections/client-id", create); assert.equal(again.body.id, made.body.id); assert.equal(again.status, 200);
  const sibling = await call("PUT", "/knowledge/collections/sibling-key", { ...create, title: "Sibling" }); assert.equal(sibling.status, 200);
  const siblingBeforeTargetUpdate = structuredClone(fx.rows.knowledge_collections!.find(r => r._id === sibling.body.id));
  const read = await call("GET", "/knowledge/collections"); assert.equal(read.body.collections[0].title, "Admissions"); assert.equal(read.body.collections[0].members[0].available, true);
  assert.equal(read.body.collections.find((r: Row) => r.id === sibling.body.id).title, "Sibling");
  assert.equal((await call("GET", "/knowledge/collections", undefined, "foreign")).body.collections.length, 0);
  assert.equal((await call("PUT", "/knowledge/collections/other", { ...create, members: [{ kind: "session", id: "foreign" }] })).status, 422);
  assert.equal((await call("PUT", "/knowledge/collections/other", { ...create, tenantId: "b" })).status, 400);
  const targetUpdate = await call("PUT", `/knowledge/collections/${made.body.id}`, { ...create, title: "Updated", expectedRevision: 1 });
  assert.equal(targetUpdate.status, 200);
  const target = fx.rows.knowledge_collections!.find(r => r._id === made.body.id)!;
  assert.equal(target.revision, 2); assert.equal(target.title, "Updated"); assert.deepEqual(target.members, [{ kind: "session", id: "shared" }]);
  assert.deepEqual(fx.rows.knowledge_collections!.find(r => r._id === sibling.body.id), siblingBeforeTargetUpdate);
  if (process.env.LKB_T055_EVIDENCE_DIR) await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "collection-ledger-control.json"), JSON.stringify({ issueId: "ISS-T055COLLECTIONS-001", proofClass: "actual-mounted-api-concrete-store-filter-enforcing-fake-db", caseId: "C", status: targetUpdate.status, target, siblingBefore: siblingBeforeTargetUpdate, siblingAfter: fx.rows.knowledge_collections!.find(r => r._id === sibling.body.id), siblingUnchanged: true }, null, 2));
  assert.equal((await call("PUT", `/knowledge/collections/${made.body.id}`, { ...create, expectedRevision: 1 })).status, 409);
  assert.equal((await call("DELETE", `/knowledge/collections/${made.body.id}`, { expectedRevision: 1 })).status, 409);
  assert.equal((await call("DELETE", `/knowledge/collections/${made.body.id}`, { expectedRevision: 2 })).status, 200);
  const afterDelete = await call("GET", "/knowledge/collections"); assert.equal(afterDelete.body.collections.length, 1); assert.equal(afterDelete.body.collections[0].id, sibling.body.id);
  assert.ok(fx.calls.every(c => ["a", "b"].includes(c.filter.tenantId)));
}));
test("revoked/read-only credentials cannot write; document highlights refuse wrong source/version/page/quote", async () => run(async (call, fx) => {
  assert.equal((await call("GET", "/knowledge/documents", undefined, "revoked")).status, 401);
  assert.equal((await call("GET", "/knowledge/documents", undefined, "unknown")).status, 401);
  assert.equal((await call("GET", "/knowledge/documents", undefined, "")).status, 401);
  assert.equal((await call("PUT", "/knowledge/collections/x", {}, "reader")).status, 403);
  const documentId = `a:${"a".repeat(64)}`; const path = `/knowledge/documents/${encodeURIComponent(documentId)}`;
  fx.rows.document_documents!.push({ _id: documentId, sourceId: documentId, tenantId: "a", version: "a".repeat(64), title: "Admissions", format: "pdf", pages: [{ pageNumber: 1, text: "Keep exact evidence." }, { pageNumber: 2, text: "Different text." }], highlights: [], createdAt: "2026-10-14T00:00:00.000Z" });
  const highlight = { sourceId: documentId, version: "a".repeat(64), pageNumber: 1, quote: "Keep exact evidence." };
  for (const patch of [{ sourceId: "other" }, { version: "b".repeat(64) }, { pageNumber: 2 }, { quote: "Made up" }]) assert.equal((await call("POST", `${path}/highlights`, { ...highlight, ...patch })).status, 422);
  assert.equal((await call("POST", `${path}/highlights`, highlight)).status, 200);
  assert.equal((await call("POST", `${path}/highlights`, highlight)).status, 200);
  assert.equal(fx.rows.document_documents![0]!.highlights.length, 1);
  const view = await call("GET", `${path}/pages/1`); assert.equal(view.body.text, highlight.quote); assert.equal(view.body.pageNumber, 1);
  assert.equal((await call("GET", `${path}/pages/1`, undefined, "foreign")).status, 404);
}));
test("actual PDF producer flows through durable store and source-page/highlight API without DTO fixture substitution", async () => run(async (call, fx) => {
  const bytes = samplePdf(); const request = { title: "Sample admissions document", format: "pdf", contentBase64: Buffer.from(bytes).toString("base64") };
  const first = await call("POST", "/knowledge/documents", request); assert.equal(first.status, 200); assert.equal(first.body.pageCount, 2);
  const repeat = await call("POST", "/knowledge/documents", request); assert.equal(repeat.body.id, first.body.id); assert.equal(fx.rows.document_documents!.length, 1);
  const id = encodeURIComponent(first.body.id);
  const page = await call("GET", `/knowledge/documents/${id}/pages/2`); assert.equal(page.status, 200); assert.equal(page.body.text, "Scholarships need evidence.");
  const highlight = { sourceId: first.body.sourceId, version: first.body.version, pageNumber: 2, quote: page.body.text };
  assert.equal((await call("POST", `/knowledge/documents/${id}/highlights`, highlight)).status, 200);
  assert.equal((await call("POST", "/knowledge/documents", request)).body.id, first.body.id);
  const detail = await call("GET", `/knowledge/documents/${id}`); assert.equal(detail.body.highlights[0].pageNumber, 2); assert.equal(detail.body.highlights[0].quote, page.body.text);
  const list = await call("GET", "/knowledge/documents"); assert.equal(list.status, 200);
  assert.equal((await call("GET", `/knowledge/documents/${id}/pages/2`, undefined, "foreign")).status, 404);
  assert.ok(fx.calls.filter(c => c.collection === "document_documents").every(c => typeof c.filter.tenantId === "string"));
  if (process.env.LKB_T055_EVIDENCE_DIR) {
    await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "actual-document-row.json"), JSON.stringify(fx.rows.document_documents![0], null, 2));
    await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "actual-page-response.json"), JSON.stringify(page.body, null, 2));
    await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "actual-sample.pdf"), bytes);
    await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "actual-api-output.json"), JSON.stringify({ provenance: "Actual PDF parser -> actual scoped storage adapter with filter-enforcing fake DB -> authenticated API routes. Synthetic source PDF; no live corpus or real DB claim.", documentsList: list.body, documentDetail: detail.body, page: page.body }, null, 2));
  }
}));
test("actual topic/resource routes preserve exact topic identity, own source references and existing sources scope", async () => run(async (call, fx) => {
  fx.rows.topics!.push({ _id: "a:visas", tenantId: "a", name: "Visas", sessionRefs: ["shared"] });
  fx.rows.turns = [{ _id: "turn", tenantId: "a", sessionId: "shared", speakerRef: "expert", text: "Exact topic quote", tStart: 4, tEnd: 9 }];
  fx.rows.claims = [{ _id: "claim", tenantId: "a", text: "Topic claim", status: "needs-review", topicRefs: ["a:visas"], evidence: [{ turnId: "turn", sessionId: "shared", quote: "Exact topic quote" }] },
    { _id: "wrong-prefix", tenantId: "a", text: "Do not expose", status: "verified", topicRefs: ["b:visas"], evidence: [{ turnId: "turn", sessionId: "shared" }] }];
  fx.rows.sources = [{ _id: "source", tenantId: "a", kind: "url", createdAt: "2026-10-14", url: "https://example.org", path: "PRIVATE_PATH" }]; fx.rows.programs = [];
  const result = await call("GET", "/knowledge/topics/a%3Avisas"); assert.equal(result.status, 200); assert.equal(result.body.claims.length, 1); assert.equal(result.body.claims[0].id, "claim"); assert.equal(result.body.sessions.length, 1);
  assert.equal((await call("GET", "/knowledge/topics/a%3Avisas", undefined, "foreign")).status, 404);
  assert.equal((await call("GET", "/knowledge/resources", undefined, "reader")).status, 403);
  const resources = await call("GET", "/knowledge/resources"); assert.equal(resources.status, 200); assert.equal(resources.body.resources.length, 1); assert.ok(!JSON.stringify(resources.body).includes("PRIVATE_PATH"));
}));

test("collections refuse raw WhatsApp members and cached names with a mixed unsafe source", async () => run(async (call, fx) => {
  fx.rows.sources!.push({ _id: "wa-source", tenantId: "a", kind: "whatsapp-batch", path: "PRIVATE_GROUP", createdAt: "2026-10-14" });
  fx.rows.sessions!.push({ _id: "wa-session", tenantId: "a", sourceId: "wa-source", title: "PRIVATE_GROUP_TITLE" });
  fx.rows.topics!.push({ _id: "mixed-topic", tenantId: "a", name: "PRIVATE_TOPIC", sessionRefs: ["shared", "wa-session"] });
  fx.rows.speakers!.push({ _id: "mixed-speaker", tenantId: "a", personId: "PRIVATE_PERSON", aliases: ["PRIVATE_ALIAS"], evidence: [{ sessionId: "shared" }, { sessionId: "wa-session" }] });
  const choices = await call("GET", "/knowledge/members"); assert.equal(choices.status, 200); assert.ok(!JSON.stringify(choices.body).includes("PRIVATE"));
  for (const member of [{ kind: "session", id: "wa-session" }, { kind: "topic", id: "mixed-topic" }, { kind: "speaker", id: "mixed-speaker" }]) {
    assert.equal((await call("PUT", "/knowledge/collections/unsafe", { title: "Collection", members: [member], expectedRevision: 0 })).status, 422);
  }
  assert.equal(fx.rows.knowledge_collections!.length, 0);
  fx.rows.knowledge_collections!.push({ _id: "a".repeat(64), tenantId: "a", title: "Saved curation", revision: 1, updatedAt: "2026-10-14T00:00:00.000Z", members: [{ kind: "session", id: "shared" }, { kind: "speaker", id: "mixed-speaker" }, { kind: "session", id: "wa-session" }] });
  const original = structuredClone(fx.rows.knowledge_collections![0]);
  const saved = await call("GET", "/knowledge/collections"); assert.equal(saved.status, 200); assert.deepEqual(saved.body.collections[0].members, [{ kind: "session", id: "shared", available: true }]);
  assert.equal(saved.body.collections[0].unavailableMembers, true); assert.ok(!JSON.stringify(saved.body).includes("wa-session")); assert.ok(!JSON.stringify(saved.body).includes("mixed-speaker"));
  const replay: Array<{ caseId: string; status: number; originalRowUnchanged: boolean; storedRow: Row }> = [];
  for (const [caseId, visibleMembers] of [["A", saved.body.collections[0].members.map(({ kind, id }: Row) => ({ kind, id }))], ["B", []]] as const) {
    const update = await call("PUT", `/knowledge/collections/${"a".repeat(64)}`, { title: "Saved curation", expectedRevision: 1, members: visibleMembers });
    assert.equal(update.status, 409); assert.deepEqual(fx.rows.knowledge_collections![0], original);
    replay.push({ caseId, status: update.status, originalRowUnchanged: true, storedRow: structuredClone(fx.rows.knowledge_collections![0]!) });
  }
  assert.equal(fx.rows.knowledge_collections![0]!.members.length, 3); // Reads/partial edits never rewrite curation/audit state.
  if (process.env.LKB_T055_EVIDENCE_DIR) await writeFile(join(process.env.LKB_T055_EVIDENCE_DIR, "collection-ledger-replay.json"), JSON.stringify({ issueId: "ISS-T055COLLECTIONS-001", proofClass: "actual-mounted-api-concrete-store-filter-enforcing-fake-db", original, cases: replay }, null, 2));
}));
