import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { Request, Response, RequestHandler } from "express";
import { createPageHighlightsRouter } from "./router.js";
import { createMongoPageHighlightStore } from "./store.js";
import { producePageDocument } from "../../../../packages/ingest/src/sources/document-pages.js";
import { samplePdf } from "../knowledge/pdf-fixture.js";

type Row = Record<string, any>;
/** Strict-equality filter double: a query that omits tenantId matches foreign rows, and a filter without tenantId is asserted against. */
function database() {
  const rows: Record<string, Row[]> = { sources: [], document_documents: [], page_highlights: [] };
  const calls: Array<{ collection: string; filter: Row }> = [];
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([k, v]) => row[k] === v);
  const db = { databaseName: "test-t055-store", collection(name: string) {
    const data = rows[name] ??= [];
    const record = (filter: Row) => { calls.push({ collection: name, filter: structuredClone(filter) }); assert.equal(typeof filter.tenantId, "string", `${name} query without tenant predicate`); };
    return {
      find(filter: Row) { record(filter); return { toArray: async () => structuredClone(data.filter(r => matches(r, filter))) }; },
      async findOne(filter: Row) { record(filter); return structuredClone(data.find(r => matches(r, filter)) ?? null); },
      async updateOne(filter: Row, update: Row, opts: Row) {
        record(filter); const row = data.find(r => matches(r, filter));
        if (row) return { matchedCount: 1, upsertedCount: 0 };
        if (!opts?.upsert) return { matchedCount: 0, upsertedCount: 0 };
        data.push({ ...structuredClone(filter), ...structuredClone(update.$setOnInsert) }); return { matchedCount: 0, upsertedCount: 1 };
      },
    };
  } } as unknown as Db;
  return { db, rows, calls };
}

const PAGE1 = "Admission deadline is October."; const PAGE2 = "Scholarships need evidence.";
async function seed(rows: Record<string, Row[]>, tenantId: string, sourceId: string, extra: Row = {}, pdf = samplePdf()) {
  const doc = await producePageDocument({ tenantId, title: "Guide", format: "pdf", bytes: pdf, createdAt: "2026-10-17T00:00:00.000Z" });
  rows.sources!.push({ _id: sourceId, tenantId, kind: "document", hash: "h".repeat(16), captureMode: "provided", consent: { given: true, recordedBy: "key-1" }, createdAt: "2026-10-17T00:00:00.000Z", ...extra });
  rows.document_documents!.push({ ...doc, _id: `${sourceId}:${doc.version}`, sourceId, highlights: [] });
  return doc;
}

type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> } };
type Auth = { tenantId: string; scopes: string[]; keyId?: string };
const full: Auth = { tenantId: "a", scopes: ["sessions", "ingest"], keyId: "key-a" };
function harness(db: Db, clock = () => "2026-10-17T10:00:00.000Z") {
  const router = createPageHighlightsRouter({ store: createMongoPageHighlightStore(db), clock });
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  return async (method: "get" | "post", sourceId: string, body: unknown, auth: Auth | undefined = full) => {
    const route = layers.find(l => l.route?.path === "/sources/:id/highlights" && l.route.methods[method]);
    assert.ok(route?.route);
    const req = { body, auth, params: { id: sourceId } } as unknown as Request;
    let status = 0; let output: any;
    const res = { status(v: number) { status = v; return this; }, set() { return this; }, json(v: unknown) { output = v; return this; } } as unknown as Response;
    for (const layer of route.route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
    return { status, body: output };
  };
}

test("valid highlight is stored once with real page and doc offsets, and a repeat is idempotent", async () => {
  const { db, rows } = database(); const doc = await seed(rows, "a", "src");
  const call = harness(db);
  const first = await call("post", "src", { page: 2, quote: "need evidence" });
  assert.equal(first.status, 201, JSON.stringify(first.body)); assert.equal(first.body.created, true);
  assert.equal(first.body.highlight.page, 2);
  // Document offsets stay independent of the page number: page 2 starts after page 1 plus the joiner.
  assert.equal(first.body.highlight.charStart, PAGE1.length + 1 + PAGE2.indexOf("need evidence"));
  const again = await call("post", "src", { page: 2, quote: "need evidence" });
  assert.equal(again.status, 200); assert.equal(again.body.created, false); assert.equal(again.body.highlight.id, first.body.highlight.id);
  const explicit = await call("post", "src", { page: 2, quote: "need evidence", charStart: first.body.highlight.charStart, charEnd: first.body.highlight.charEnd, documentHash: first.body.highlight.documentHash });
  assert.equal(explicit.status, 200); assert.equal(explicit.body.highlight.id, first.body.highlight.id);
  assert.equal(rows.page_highlights!.length, 1);
  assert.deepEqual({ ...rows.page_highlights![0], _id: undefined, createdAt: undefined },
    { _id: undefined, tenantId: "a", sourceId: "src", documentHash: first.body.highlight.documentHash, page: 2, quote: "need evidence", charStart: first.body.highlight.charStart, charEnd: first.body.highlight.charEnd, createdBy: "key-a", createdAt: undefined });
  const listed = await call("get", "src", undefined);
  assert.equal(listed.status, 200); assert.equal(listed.body.pageCount, 2); assert.equal(listed.body.title, "Guide");
  assert.deepEqual(listed.body.highlights.map((h: Row) => [h.page, h.quote]), [[2, "need evidence"]]);
  assert.equal(JSON.stringify(listed.body).includes("createdBy"), false);
  assert.ok(doc.version);
});

test("forged page, out-of-range page, bad page types and absent quote are refused and nothing is stored", async () => {
  const { db, rows } = database(); await seed(rows, "a", "src"); const call = harness(db);
  const forged = await call("post", "src", { page: 2, quote: "Admission deadline" });
  assert.deepEqual([forged.status, forged.body.reason], [422, "quote-absent-on-page"]);
  const beyond = await call("post", "src", { page: 3, quote: "Admission" });
  assert.deepEqual([beyond.status, beyond.body.reason], [422, "page-out-of-range"]);
  const absent = await call("post", "src", { page: 1, quote: "Tuition is free" });
  assert.deepEqual([absent.status, absent.body.reason], [422, "quote-absent-on-page"]);
  const badOffsets = await call("post", "src", { page: 1, quote: "deadline", charStart: 0, charEnd: 8 });
  assert.deepEqual([badOffsets.status, badOffsets.body.reason], [422, "offsets-mismatch"]);
  for (const body of [{ page: 0, quote: "x" }, { page: "1", quote: "Admission" }, { page: 1.5, quote: "Admission" }, { page: 1, quote: 5 },
    { page: 1, quote: "Admission", charStart: 0 }, { page: 1, quote: "Admission", tenantId: "b" }, { page: 1, quote: "Admission", createdBy: "forged" }, null]) {
    assert.equal((await call("post", "src", body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call("post", "src", { page: 1, quote: "   " })).status, 422);
  assert.equal(rows.page_highlights!.length, 0);
});

test("cross-tenant requests return 404 and identical source ids in two tenants stay isolated", async () => {
  const { db, rows, calls } = database(); await seed(rows, "a", "shared"); const call = harness(db);
  const b: Auth = { tenantId: "b", scopes: ["sessions", "ingest"], keyId: "key-b" };
  assert.equal((await call("post", "shared", { page: 1, quote: "Admission" }, b)).status, 404);
  assert.equal((await call("get", "shared", undefined, b)).status, 404);
  assert.equal(rows.page_highlights!.length, 0);
  assert.equal((await call("post", "shared", { page: 1, quote: "Admission" })).status, 201);
  // Tenant b now owns a source with the same natural id and the same text; its highlight is a separate row.
  await seed(rows, "b", "shared");
  const own = await call("post", "shared", { page: 1, quote: "Admission" }, b);
  assert.equal(own.status, 201); assert.equal(rows.page_highlights!.length, 2);
  assert.deepEqual(rows.page_highlights!.map(r => r.tenantId).sort(), ["a", "b"]);
  const listB = await call("get", "shared", undefined, b);
  assert.equal(listB.body.highlights.length, 1); assert.notEqual(listB.body.highlights[0].id, (await call("get", "shared", undefined)).body.highlights[0].id);
  for (const c of calls) assert.ok(["a", "b"].includes(c.filter.tenantId), "every predicate carries a verified tenant");
});

test("consent withdrawn, revoked or deleted sources are refused for read and write; non-document sources are 404", async () => {
  const { db, rows } = database(); const call = harness(db);
  await seed(rows, "a", "withdrawn", { consent: { given: false, recordedBy: "key-1" } });
  await seed(rows, "a", "revoked", { status: "revoked" });
  await seed(rows, "a", "head-deleted", { sourceMeta: { nativeDocumentHead: { status: "deleted", currentRevisionHash: "a".repeat(64) } } });
  await seed(rows, "a", "live");
  rows.sources!.push({ _id: "rec", tenantId: "a", kind: "recording", consent: { given: true, recordedBy: "k" } });
  for (const id of ["withdrawn", "revoked", "head-deleted"]) {
    const w = await call("post", id, { page: 1, quote: "Admission" }); assert.deepEqual([w.status, w.body.error], [403, "source_consent_withdrawn"], id);
    assert.equal((await call("get", id, undefined)).status, 403, id);
  }
  assert.equal((await call("post", "rec", { page: 1, quote: "Admission" })).status, 404);
  assert.equal((await call("post", "live", { page: 1, quote: "Admission" })).status, 201);
  rows.sources!.find(r => r._id === "live")!.consent.given = false;
  assert.equal((await call("get", "live", undefined)).status, 403, "withdrawal after storage hides stored highlights");
  assert.equal(rows.page_highlights!.length, 1);
});

test("scope, identity and tenant-header checks run before any storage access", async () => {
  const { db, rows, calls } = database(); await seed(rows, "a", "src"); const call = harness(db);
  assert.equal((await call("get", "src", undefined, { tenantId: "a", scopes: ["ingest"] })).status, 403);
  assert.equal((await call("post", "src", { page: 1, quote: "Admission" }, { tenantId: "a", scopes: ["sessions"], keyId: "k" })).status, 403);
  assert.equal((await call("post", "src", { page: 1, quote: "Admission" }, { tenantId: "a", scopes: ["ingest"] })).status, 401);
  assert.equal((await call("get", "src", undefined, { tenantId: " a", scopes: ["sessions"] })).status, 401);
  assert.equal((await call("get", "src", undefined, null as unknown as Auth)).status, 403);
  assert.equal(calls.length, 0);
});

test("changed document never inherits old highlights; unchanged re-ingest keeps them", async () => {
  const { db, rows } = database(); const doc = await seed(rows, "a", "src"); const call = harness(db);
  const stored = await call("post", "src", { page: 1, quote: "Admission" }); assert.equal(stored.status, 201);
  // Re-ingest of identical bytes: same version, same digest, same highlight id, still one row.
  assert.equal((await call("post", "src", { page: 1, quote: "Admission" })).body.created, false);
  assert.equal((await call("post", "src", { page: 1, quote: "Admission", documentHash: "f".repeat(64) })).status, 409);
  // A newer version of the same source with different page text.
  rows.document_documents!.push({ ...structuredClone(rows.document_documents![0]!), _id: "src:v2", version: "b".repeat(64), createdAt: "2026-10-18T00:00:00.000Z",
    pages: [{ pageNumber: 1, text: "Completely different text." }] });
  const listed = await call("get", "src", undefined);
  assert.equal(listed.body.pageCount, 1); assert.deepEqual(listed.body.highlights, []);
  assert.equal((await call("post", "src", { page: 1, quote: "Admission" })).status, 422);
  assert.equal(rows.page_highlights!.length, 1);
  assert.ok(doc.pages.length === 2);
});
