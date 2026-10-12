// Dry-run of 20261012150000-tenant-scoped-source-ids.cjs against an in-memory fake Db that enforces _id uniqueness and
// the sources {tenantId, hash} unique index. Never connects to Mongo (D-136: this migration is never run on a real DB here).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tenantSourceId } from "../packages/ingest/src/source.ts";

const require = createRequire(import.meta.url);
const migration = require("./20261012150000-tenant-scoped-source-ids.cjs");

const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);

const match = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v);
function fakeDb(seed, hooks = {}) {
  const data = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((d) => structuredClone(d))]));
  const coll = (name) => {
    const rows = (data[name] ??= []);
    const assertUnique = (doc, ignoreIdx = -1) => {
      rows.forEach((r, i) => {
        if (i === ignoreIdx) return;
        if (r._id === doc._id && (name !== "media" && name !== "sources" ? true : r.tenantId === doc.tenantId || true)) throw new Error(`E11000 ${name}._id ${doc._id}`);
        if (name === "sources" && r.tenantId === doc.tenantId && r.hash === doc.hash) throw new Error(`E11000 sources {tenantId,hash} ${doc.hash}`);
      });
    };
    return {
      find: (f) => ({ toArray: async () => rows.filter((r) => match(r, f)).map((r) => structuredClone(r)) }),
      deleteOne: async (f) => { hooks.beforeDelete?.(name, f); const i = rows.findIndex((r) => match(r, f)); if (i >= 0) rows.splice(i, 1); },
      replaceOne: async (f, doc, opt = {}) => {
        hooks.beforeInsert?.(name, doc);
        const i = rows.findIndex((r) => match(r, f));
        if (i >= 0) { assertUnique(doc, i); rows[i] = structuredClone(doc); } else if (opt.upsert) { assertUnique(doc); rows.push(structuredClone(doc)); }
      },
      updateOne: async (f, u) => { const r = rows.find((x) => match(x, f)); if (r) Object.assign(r, u.$set); },
      updateMany: async (f, u) => { for (const r of rows.filter((x) => match(x, f))) Object.assign(r, u.$set); },
    };
  };
  return { data, collection: coll };
}

const seed = () => ({
  sources: [
    { _id: H1, tenantId: "t-a", hash: H1, kind: "url" },
    { _id: H2, tenantId: "t:b", hash: H2, kind: "recording" },
    { _id: H3, hash: H3, kind: "document" }, // untenanted
    { _id: "gdrive-xyz", tenantId: "t-a", hash: "gdrive-xyz", kind: "recording" }, // not a content hash
    { _id: tenantSourceId("t-a", "d".repeat(64)), tenantId: "t-a", hash: "d".repeat(64), kind: "url" }, // already scoped
  ],
  sessions: [
    { _id: "s1", tenantId: "t-a", sourceId: H1 },
    { _id: "s2", tenantId: "t:b", sourceId: H2 },
    { _id: "s3", tenantId: "t-a", sourceId: "gdrive-xyz" },
    { _id: "s4", sourceId: H3 },
  ],
  media: [
    { _id: `${H2}-media`, tenantId: "t:b", sourceRef: H2, kind: "recording" },
    { _id: "other-media", tenantId: "t-a", sourceRef: "gdrive-xyz", kind: "recording" },
  ],
  gaps: [{ _id: "g1", tenantId: "t-a", sourceRef: H1 }],
});

test("function matches packages/ingest tenantSourceId exactly", () => {
  for (const [t, h] of [["t-a", H1], ["t:b", H2], ["a/b c", "x"], ["ü", H3]]) assert.equal(migration.tenantSourceId(t, h), tenantSourceId(t, h));
});

test("up rewrites ids and all references; leaves non-content-hash, already-scoped and untenanted rows alone", async () => {
  const db = fakeDb(seed());
  const warnings = [];
  const report = await migration.migrate(db, (m) => warnings.push(m));
  const ids = db.data.sources.map((s) => s._id).sort();
  assert.deepEqual(ids, [H3, "gdrive-xyz", tenantSourceId("t-a", H1), tenantSourceId("t-a", "d".repeat(64)), tenantSourceId("t:b", H2)].sort());
  const byId = Object.fromEntries(db.data.sources.map((s) => [s._id, s]));
  assert.equal(byId[tenantSourceId("t-a", H1)].hash, H1, "bare hash kept in its own field");
  assert.equal(db.data.sessions.find((s) => s._id === "s1").sourceId, tenantSourceId("t-a", H1));
  assert.equal(db.data.sessions.find((s) => s._id === "s2").sourceId, tenantSourceId("t:b", H2));
  assert.equal(db.data.sessions.find((s) => s._id === "s3").sourceId, "gdrive-xyz");
  assert.equal(db.data.sessions.find((s) => s._id === "s4").sourceId, H3, "untenanted row's reference untouched");
  assert.equal(db.data.gaps[0].sourceRef, tenantSourceId("t-a", H1));
  const m = db.data.media.find((x) => x.sourceRef === tenantSourceId("t:b", H2));
  assert.equal(m._id, `${tenantSourceId("t:b", H2)}-media`);
  assert.equal(db.data.media.length, 2);
  assert.equal(db.data.media.find((x) => x._id === "other-media").sourceRef, "gdrive-xyz");
  assert.deepEqual(report, { migrated: 2, untenanted: [H3], skippedNonContentHash: 1, recovered: 0, media: 1 });
  assert.equal(warnings.some((w) => w.includes(H3)), true);
});

test("untenanted row is reported, never guessed", async () => {
  const db = fakeDb(seed());
  const report = await migration.migrate(db, () => {});
  assert.deepEqual(report.untenanted, [H3]);
  assert.equal(db.data.sources.some((s) => s.hash === H3 && s._id === H3), true);
  assert.equal(db.data.sources.some((s) => String(s._id).endsWith(`:${H3}`)), false);
});

test("idempotent: a second and third run change nothing", async () => {
  const db = fakeDb(seed());
  await migration.migrate(db, () => {});
  const after1 = JSON.stringify(db.data.sources) + JSON.stringify(db.data.sessions) + JSON.stringify(db.data.media) + JSON.stringify(db.data.gaps);
  const r2 = await migration.migrate(db, () => {});
  const r3 = await migration.up(db);
  const after3 = JSON.stringify(db.data.sources) + JSON.stringify(db.data.sessions) + JSON.stringify(db.data.media) + JSON.stringify(db.data.gaps);
  assert.equal(after3, after1);
  assert.equal(r2.migrated, 0);
  assert.equal(r3.migrated, 0);
});

test("up(db, client): migrate-mongo's second argument is not mistaken for a logger", async () => {
  const db = fakeDb(seed());
  const orig = console.warn; console.warn = () => {};
  try { await migration.up(db, { fake: "client" }); } finally { console.warn = orig; }
  assert.equal(db.data.sources.some((s) => s._id === tenantSourceId("t-a", H1)), true);
});

test("crash between delete-old and insert-new is repaired by the next run (journal)", async () => {
  const db = fakeDb(seed(), {
    beforeInsert(name, doc) { if (name === "sources" && doc._id === tenantSourceId("t-a", H1) && !db.crashed) { db.crashed = true; throw new Error("crash"); } },
  });
  await assert.rejects(() => migration.migrate(db, () => {}), /crash/);
  assert.equal(db.data.sources.some((s) => s.hash === H1), false, "row is absent mid-crash: only the journal holds it");
  const report = await migration.migrate(db, () => {});
  assert.equal(report.recovered, 1);
  const row = db.data.sources.find((s) => s.hash === H1);
  assert.equal(row._id, tenantSourceId("t-a", H1));
  assert.equal(row.kind, "url");
  assert.equal(db.data.sessions.find((s) => s._id === "s1").sourceId, tenantSourceId("t-a", H1));
});

test("down restores the bare ids and references for migrated rows only", async () => {
  const db = fakeDb(seed());
  await migration.migrate(db, () => {});
  const r = await migration.down(db);
  assert.equal(r.restored, 2);
  assert.equal(db.data.sources.find((s) => s.hash === H1)._id, H1);
  assert.equal(db.data.sources.find((s) => s.hash === H2)._id, H2);
  assert.equal(db.data.sources.find((s) => s.hash === "d".repeat(64))._id, tenantSourceId("t-a", "d".repeat(64)), "natively scoped row untouched");
  assert.equal(db.data.sessions.find((s) => s._id === "s1").sourceId, H1);
  assert.equal(db.data.media.find((m) => m.kind === "recording" && m.tenantId === "t:b")._id, `${H2}-media`);
  assert.equal(db.data.gaps[0].sourceRef, H1);
  assert.equal((await migration.down(db)).restored, 0, "down is re-runnable");
});

test("cross-tenant: tenant B's session pointing at a same-valued sourceId is not rewritten by tenant A's row", async () => {
  const s = seed();
  s.sessions.push({ _id: "sx", tenantId: "t:b", sourceId: H1 });
  const db = fakeDb(s);
  await migration.migrate(db, () => {});
  assert.equal(db.data.sessions.find((x) => x._id === "sx").sourceId, H1);
});
