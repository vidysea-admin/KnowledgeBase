// Dry-run of 20261012150000-tenant-scoped-source-ids.cjs against an in-memory fake Db that enforces _id uniqueness and
// the sources {tenantId, hash} unique index. Never connects to Mongo (D-136: this migration is never run on a real DB here).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tenantSourceId } from "../packages/ingest/src/source.ts";

const require = createRequire(import.meta.url);
const migration = require("./20261012150000-tenant-scoped-source-ids.cjs");

const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);

// Supports equality plus the {$type:"string", $gt} _id range the migration pages with.
const matchValue = (actual, cond) => {
  if (cond !== null && typeof cond === "object") {
    if ("$type" in cond && !(cond.$type === "string" && typeof actual === "string")) return false;
    if ("$gt" in cond && !(actual > cond.$gt)) return false;
    return true;
  }
  return actual === cond;
};
// Cheap exact-_id rejection first: the 10k-row tests do tens of thousands of lookups.
const match = (doc, filter) => {
  if (typeof filter._id === "string" && doc._id !== filter._id) return false;
  for (const k in filter) if (!matchValue(doc[k], filter[k])) return false;
  return true;
};
function fakeDb(seed, hooks = {}) {
  const stats = { peakBatch: 0, finds: 0, wholeCollectionLoads: 0 };
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
      find: (f) => {
        let sorted = false, max = Infinity;
        const cursor = {
          sort: () => { sorted = true; return cursor; },
          limit: (n) => { max = n; return cursor; },
          toArray: async () => {
            let out = rows.filter((r) => match(r, f));
            if (sorted) out = out.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
            out = out.slice(0, max).map((r) => structuredClone(r));
            stats.finds += 1;
            if (name === "sources" || name === "source_id_migration_journal") stats.peakBatch = Math.max(stats.peakBatch, out.length);
            if (max === Infinity && out.length > 50) stats.wholeCollectionLoads += 1;
            return out;
          },
        };
        return cursor;
      },
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
  return { data, stats, collection: coll };
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

// ---- ISS-TENANTSRCID-003: bounded memory, large collection ----
const hex = (i) => i.toString(16).padStart(64, "0");
function bigSeed(n) {
  const sources = [], sessions = [], gaps = [];
  for (let i = 0; i < n; i++) {
    const tenantId = i % 2 ? "t-a" : "t:b";
    sources.push({ _id: hex(i), tenantId, hash: hex(i), kind: "url" });
    if (i % 10 === 0) { sessions.push({ _id: `s${i}`, tenantId, sourceId: hex(i) }); gaps.push({ _id: `g${i}`, tenantId, sourceRef: hex(i) }); }
  }
  return { sources, sessions, gaps, media: [] };
}

test("large collection (10k rows): every row migrated, no find ever returns more than the batch size", async () => {
  const N = 10000, B = 250;
  const db = fakeDb(bigSeed(N));
  const report = await migration.migrate(db, () => {}, { batchSize: B });
  assert.equal(report.migrated, N);
  assert.ok(db.stats.peakBatch <= B, `peak batch ${db.stats.peakBatch} must be <= ${B}`);
  assert.ok(db.stats.peakBatch > 1, "paging actually used");
  assert.equal(db.stats.wholeCollectionLoads, 0, "no unbounded find().toArray() over a big collection");
  assert.equal(db.data.sources.every((s) => s._id === tenantSourceId(s.tenantId, s.hash)), true);
  assert.equal(db.data.sessions.every((s) => s.sourceId.includes(":")), true);
  assert.equal(db.data.gaps.every((g) => g.sourceRef.includes(":")), true);
  assert.equal(db.data.source_id_migration_journal.length, N);
});

test("default batch size bounds memory too (BATCH_SIZE exported and used by up)", async () => {
  assert.ok(Number.isInteger(migration.BATCH_SIZE) && migration.BATCH_SIZE > 0 && migration.BATCH_SIZE <= 1000);
  const db = fakeDb(bigSeed(1300));
  await migration.up(db);
  assert.ok(db.stats.peakBatch <= migration.BATCH_SIZE);
  assert.equal(db.data.sources.filter((s) => s._id === s.hash).length, 0);
});

test("large collection: idempotent re-run is a no-op and down() restores every row in bounded batches", async () => {
  const N = 2000, B = 100;
  const db = fakeDb(bigSeed(N));
  await migration.migrate(db, () => {}, { batchSize: B });
  const snap = JSON.stringify([db.data.sources, db.data.sessions, db.data.gaps]);
  const again = await migration.migrate(db, () => {}, { batchSize: B });
  assert.equal(again.migrated, 0);
  assert.equal(JSON.stringify([db.data.sources, db.data.sessions, db.data.gaps]), snap);
  db.stats.peakBatch = 0;
  const r = await migration.migrateDown(db, { batchSize: B });
  assert.equal(r.restored, N);
  assert.ok(db.stats.peakBatch <= B);
  assert.equal(db.data.sources.every((s) => s._id === s.hash), true);
  assert.equal(db.data.sessions.every((s) => !s.sourceId.includes(":")), true);
  assert.equal((await migration.down(db)).restored, 0, "exported down() re-runnable");
});

test("crash mid-run in a multi-page collection is repaired by the next run", async () => {
  const db = fakeDb(bigSeed(300), {
    beforeInsert(name, doc) { if (name === "sources" && doc._id === tenantSourceId("t-a", hex(151)) && !db.crashed) { db.crashed = true; throw new Error("crash"); } },
  });
  await assert.rejects(() => migration.migrate(db, () => {}, { batchSize: 40 }), /crash/);
  const r = await migration.migrate(db, () => {}, { batchSize: 40 });
  assert.equal(r.recovered, 1);
  assert.equal(db.data.sources.length, 300);
  assert.equal(db.data.sources.filter((s) => s._id === s.hash).length, 0);
});
