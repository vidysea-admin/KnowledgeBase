// D-181 / ISS-T055STORE-001. In-memory Db fake only: no network, no real Mongo. Run: node --test --import tsx <file>
import test from "node:test";
import assert from "node:assert/strict";
import { scopedCollection } from "../../packages/db/src/lib/tenantScope.ts";
import { readFileSync } from "node:fs";
import { validateDoc } from "../lib/mini-schema.mjs";
import { backfillDocumentConsent, parseArgs, main, buildSourceRow, RECORDED_BY } from "./backfill-document-consent.mjs";

const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);
function fakeDb(name, data) {
  const store = new Map(Object.entries(data).map(([k, v]) => [k, v.map(r => structuredClone(r))]));
  const log = { writes: 0, filters: [] };
  const coll = n => {
    const rows = store.get(n) ?? (store.set(n, []), store.get(n));
    return {
      find: f => { log.filters.push([n, f]); return { toArray: async () => rows.filter(r => matches(r, f)).map(r => structuredClone(r)) }; },
      findOne: async f => { log.filters.push([n, f]); const r = rows.find(x => matches(x, f)); return r ? structuredClone(r) : null; },
      replaceOne: async (f, d, o) => { log.writes++; const i = rows.findIndex(x => matches(x, f)); if (i >= 0) rows[i] = structuredClone(d); else if (o?.upsert) rows.push(structuredClone(d)); return { acknowledged: true }; },
      insertOne: async d => { log.writes++; if (rows.some(r => r._id === d._id)) throw Object.assign(new Error("dup"), { code: 11000 }); rows.push(structuredClone(d)); return { acknowledged: true }; },
    };
  };
  return { databaseName: name, collection: coll, store, log };
}
const V = "a".repeat(64);
const doc = (id, t = "toc", extra = {}) => ({ _id: id, tenantId: t, sourceId: id, version: V, title: "SECRET TITLE", format: "pdf", pages: [{ pageNumber: 1, text: "SECRET TEXT" }], highlights: [], createdAt: "2026-01-02T03:04:05.000Z", ...extra });
const NOW = "2026-10-18T00:00:00.000Z", now = () => NOW;
const run = (db, extra = {}) => backfillDocumentConsent({ db, scopedCollection, tenantId: "toc", now, ...extra });
const withdrawn = { _id: "d2", tenantId: "toc", kind: "document", hash: V, captureMode: "provided", createdAt: "2026-01-01T00:00:00.000Z", consent: { given: false, recordedBy: "user", note: "withdrawn" }, status: "revoked" };
const seed = () => fakeDb("lkb_staging", {
  document_documents: [doc("d1"), doc("d2"), doc("d3", "toc", { format: "docx" }), doc("o1", "other")],
  sources: [withdrawn, { _id: "o1", tenantId: "other", kind: "document", hash: V, captureMode: "provided", createdAt: NOW, consent: { given: true, recordedBy: "x" } }],
  sessions: [{ _id: "s1", tenantId: "toc", sourceId: "nope" }, { _id: "s2", tenantId: "toc", sourceId: "d2" }],
});

test("missing rows are created for documents without a sources row, matching the schema fields", async () => {
  const db = seed(), r = await run(db, { execute: true });
  assert.deepEqual(r.insertedIds.sort(), ["d1", "d3"]); assert.equal(r.inserted, 2);
  const row = db.store.get("sources").find(s => s._id === "d1");
  assert.deepEqual(row, { _id: "d1", tenantId: "toc", kind: "document", captureMode: "provided", hash: V,
    consent: { given: true, recordedBy: RECORDED_BY, note: row.consent.note }, createdAt: "2026-01-02T03:04:05.000Z", backfill: { decision: "D-181", at: NOW } });
  assert.equal(row.consent.recordedBy, "owner-attestation:D-181");
});

test("existing rows are untouched, a withdrawn row stays withdrawn, and other tenants are not read", async () => {
  const db = seed(), before = JSON.stringify(db.store.get("sources").filter(s => s._id === "d2" || s._id === "o1"));
  await run(db, { execute: true });
  assert.equal(JSON.stringify(db.store.get("sources").filter(s => s._id === "d2" || s._id === "o1")), before);
  assert.equal(db.store.get("sources").find(s => s._id === "d2").consent.given, false);
  assert.equal(db.store.get("sources").filter(s => s.tenantId === "other").length, 1);
});

test("a re-run inserts 0", async () => {
  const db = seed(); await run(db, { execute: true });
  const again = await run(db, { execute: true });
  assert.equal(again.inserted, 0); assert.deepEqual(again.missingDocumentIds, []);
  assert.equal(db.store.get("sources").length, 4);
});

test("a duplicate-key race is counted, never an update", async () => {
  const db = seed(), orig = db.collection;
  db.collection = n => { const c = orig(n); if (n !== "sources") return c; return { ...c, findOne: async f => (f._id === "d1" ? null : c.findOne(f)), insertOne: async d => { if (d._id === "d1") throw Object.assign(new Error("dup"), { code: 11000 }); return c.insertOne(d); } }; };
  const r = await run(db, { execute: true });
  assert.equal(r.raced, 1); assert.equal(r.inserted, 1);
});

test("dry-run writes nothing and prints no names or text", async () => {
  const db = seed(), r = await run(db);
  assert.equal(db.log.writes, 0); assert.equal(db.store.get("sources").length, 2);
  assert.deepEqual(r.missingDocumentIds.sort(), ["d1", "d3"]); assert.equal(r.sessions, 2); assert.equal(r.sessionsWithoutSource, 1);
  const lines = []; await main(["--tenant", "toc"], { MONGODB_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging", MONGO_WORK_DB: "lkb_staging", MONGODB_URL: "mongodb://fake.invalid:27017" },
    { out: l => lines.push(l), loadDb: async () => ({ connect: async () => {}, getDb: () => db, close: async () => {}, scopedCollection }) });
  const printed = lines.join("\n"); assert.match(printed, /DRY-RUN tenant=toc/); assert.doesNotMatch(printed, /SECRET|mongodb:/);
  assert.equal(db.log.writes, 0);
});

test("no path or url fields are ever written", async () => {
  const db = seed(); await run(db, { execute: true });
  const keys = o => Object.entries(o).flatMap(([k, v]) => [k, ...(v && typeof v === "object" ? keys(v) : [])]);
  for (const row of db.store.get("sources").filter(s => s.backfill)) assert.deepEqual(keys(row).filter(k => /path|url|file/i.test(k)), []);
  assert.equal(buildSourceRow(doc("x", "toc", { format: "txt" }), NOW), null);
});

test("every query is tenant-scoped", async () => {
  const db = seed(); await run(db, { execute: true });
  assert.ok(db.log.filters.length > 0); assert.ok(db.log.filters.every(([, f]) => f.tenantId === "toc"));
});

test("a non-staging database is refused before any read or write", async () => {
  for (const name of ["lkb", "lkb_prod", "LKB_STAGING", ""]) {
    const db = fakeDb(name, { document_documents: [doc("d1")] });
    await assert.rejects(run(db, { execute: true }), /must be exactly lkb_staging/);
    assert.equal(db.log.writes, 0); assert.equal(db.log.filters.length, 0);
  }
  let connected = false;
  const io = { out() {}, loadDb: async () => { connected = true; return {}; } };
  for (const dbName of ["lkb", "lkb_staging2", undefined]) {
    await assert.rejects(main(["--tenant", "toc"], { MONGODB_DB: dbName, MONGODB_URL: "mongodb://fake.invalid:27017" }, io), /must be exactly lkb_staging/);
  }
  await assert.rejects(main(["--tenant", "toc", "--i-know-this-is-production"], { MONGODB_DB: "lkb", MONGODB_URL: "mongodb://fake.invalid:27017" }, io));
  assert.equal(connected, false);
});

test("writes need --execute and --confirm-backfill D-181; a tenant is mandatory", () => {
  assert.equal(parseArgs(["--tenant", "toc"]).execute, false);
  assert.throws(() => parseArgs(["--tenant", "toc", "--execute"]), /confirm-backfill D-181/);
  assert.throws(() => parseArgs(["--tenant", "toc", "--execute", "--confirm-backfill", "D-180"]), /confirm-backfill D-181/);
  assert.throws(() => parseArgs(["--execute", "--confirm-backfill", "D-181"]), /--tenant/);
  assert.equal(parseArgs(["--tenant", "toc", "--execute", "--confirm-backfill", "D-181"]).execute, true);
});

test("a backfilled row validates against schema/sources.schema.json", async () => {
  const schema = JSON.parse(readFileSync(new URL("../../schema/sources.schema.json", import.meta.url), "utf8"));
  const db = seed(); await run(db, { execute: true });
  for (const row of db.store.get("sources").filter(s => s.backfill)) assert.deepEqual(validateDoc(schema, row), { valid: true, errors: [] });
});

test("a document whose sourceId is referenced by a session is skipped, never unhiding that session", async () => {
  const db = seed(); // d1 shared with a session; the session has no source row so it is hidden today
  db.store.get("sessions").push({ _id: "s3", tenantId: "toc", sourceId: "d1" });
  const dry = await run(db); assert.equal(dry.skippedSharedWithSession, 1); assert.deepEqual(dry.missingDocumentIds, ["d3"]);
  const r = await run(db, { execute: true });
  assert.deepEqual(r.insertedIds, ["d3"]); assert.equal(db.store.get("sources").some(s => s._id === "d1"), false);
});
