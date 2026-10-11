// scripts/watch/lib/reingest-swap.test.mjs — iss-309-316-reingest-delete-safety.
// In-memory fake of the scopedCollection accessor (tenant merged into every filter, like
// packages/db/src/lib/tenantScope.ts). No Mongo, no network. Real `buildTree`/`regenerate` for the tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceSessionRows, withFailureRecorded, oldRowFilters, SESSION_COLLECTIONS } from "./reingest-swap.mjs";
import { buildTree, treeIndexRootFilter } from "../../../packages/index/src/tree/build.ts";
import { regenerate } from "../../../packages/index/src/tree/regenerate.ts";

const T = "toc";
const OLD = "2026-09-25-infocu"; // ISS-309's recorded session id
const NEW = "2026-09-25-infocus";
const DRIVE = "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri";

const get = (o, path) => path.split(".").reduce((vals, k) => vals.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => v?.[k]), [o]).flatMap((v) => (Array.isArray(v) ? v : [v]));
const match = (doc, f) => Object.entries(f).every(([k, c]) => get(doc, k).some((v) => (c && typeof c === "object" && "$in" in c ? c.$in.includes(v) : v === c)));

/** `fail(op, coll, n)` -> throw on the n-th (1-based, global) mutating call when it returns true. */
function fakeStore(seed, fail = () => false) {
  const data = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((d) => structuredClone(d))]));
  const calls = [];
  let n = 0;
  const scoped = (name) => (tenant) => {
    assert.equal(typeof tenant, "string");
    const rows = () => (data[name] ??= []);
    const f = (x = {}) => ({ ...x, tenantId: tenant });
    const mut = (op) => { n += 1; calls.push(`${op}:${name}`); if (fail(op, name, n)) throw new Error(`injected ${op} ${name} #${n}`); };
    return {
      find: (x) => ({ toArray: async () => rows().filter((d) => match(d, f(x))).map((d) => structuredClone(d)) }),
      findOne: async (x) => structuredClone(rows().find((d) => match(d, f(x))) ?? null),
      countDocuments: async (x) => rows().filter((d) => match(d, f(x))).length,
      deleteMany: async (x) => { mut("delete"); const keep = rows().filter((d) => !match(d, f(x))); const c = rows().length - keep.length; data[name] = keep; return { deletedCount: c }; },
      insertMany: async (docs) => { mut("insert"); rows().push(...docs.map((d) => ({ ...structuredClone(d), tenantId: tenant }))); },
      updateOne: async (x, u) => { mut("update"); const d = rows().find((r) => match(r, f(x))); if (d) Object.assign(d, u.$set); },
    };
  };
  return { data, scoped, calls };
}

const session = (id, date, extra = {}) => ({ _id: id, tenantId: T, title: id, date, sourceId: `gdrive-${DRIVE}`, status: { index: "done" }, ...extra });
const treeFor = (sessions) => ({ ...buildTree(sessions, [])[T], tenantId: T });

function seedOld({ otherSessions = [] } = {}) {
  const old = session(OLD, "2025-12-31");
  const sessions = [old, ...otherSessions];
  return {
    sources: [{ _id: `gdrive-${DRIVE}`, tenantId: T }, { _id: "gdrive-OTHER", tenantId: T }],
    sessions,
    turns: [{ _id: "t1", tenantId: T, sessionId: OLD }, { _id: "t2", tenantId: T, sessionId: OLD }, { _id: "tx", tenantId: T, sessionId: "keep-me" }],
    session_pages: [{ _id: "p1", tenantId: T, sessionId: OLD }],
    claims: [{ _id: "c1", tenantId: T, evidence: [{ sessionId: OLD }] }, { _id: "cx", tenantId: T, evidence: [{ sessionId: "keep-me" }] }],
    chunks: [{ _id: "k1", tenantId: T, sourceRef: OLD, vector: [0.1] }, { _id: "kx", tenantId: T, sourceRef: "keep-me" }],
    tree_index: [{ _id: "root", ...treeFor(sessions) }],
  };
}

/** The "ingest" stand-in: writes the corrected session (and a turn/chunk) the way the real chain does. */
const okIngest = (store, over = {}) => async () => {
  await store.scoped("sources")(T).insertMany([{ _id: `gdrive-${DRIVE}` }]);
  await store.scoped("sessions")(T).insertMany([session(NEW, "2026-09-25")]);
  await store.scoped("turns")(T).insertMany([{ _id: "n1", sessionId: NEW }]);
  await store.scoped("chunks")(T).insertMany([{ _id: "nk1", sourceRef: NEW }]);
  if (over.after) await over.after();
  return NEW;
};

const base = (store, ingest, extra = {}) => ({
  scoped: store.scoped, tenant: T, driveFileId: DRIVE, oldSessionId: OLD, correctSessionId: NEW, ingest,
  rootFilter: treeIndexRootFilter(T), regenerate, writeSnapshot: async () => "mem://snapshot", ...extra,
});
const hasNode = (root, id) => JSON.stringify(root).includes(`/session:${id}"`);
const otherRowsIntact = (d) => d.turns.some((x) => x._id === "tx") && d.claims.some((x) => x._id === "cx") && d.chunks.some((x) => x._id === "kx") && d.sources.some((x) => x._id === "gdrive-OTHER");

// ---- ISS-309 recorded reproduction (qa/issues.jsonl): every count except tree_index went to 0 and
// tree_index stayed 1 for sessionId 2026-09-25-infocu. Replayed verbatim on the same ids. ----
test("ISS-309: old session's per-session counts go to 0 AND its node is gone from tree_index (root kept)", async () => {
  const store = fakeStore(seedOld());
  const filters = oldRowFilters(DRIVE, OLD);
  const r = await replaceSessionRows(base(store, okIngest(store)));
  assert.deepEqual(r.before, { sources: 1, sessions: 1, turns: 2, session_pages: 1, claims: 1, chunks: 1 });
  for (const c of ["sessions", "turns", "session_pages", "claims", "chunks"]) {
    assert.equal(await store.scoped(c)(T).countDocuments(filters[c]), 0, `${c} still has old rows`);
  }
  assert.equal(store.data.tree_index.length, 1, "the ONE per-tenant root document must survive");
  assert.equal(hasNode(store.data.tree_index[0], OLD), false, "old session node orphaned in tree_index");
  assert.ok(otherRowsIntact(store.data), "another session's / source's rows must not be touched");
});

test("ISS-309: tree_index prune keeps other sessions' nodes", async () => {
  const keep = session("keep-me", "2026-01-05", { sourceId: "gdrive-OTHER" });
  const store = fakeStore(seedOld({ otherSessions: [keep] }));
  await replaceSessionRows(base(store, okIngest(store)));
  assert.equal(hasNode(store.data.tree_index[0], "keep-me"), true);
  assert.equal(hasNode(store.data.tree_index[0], OLD), false);
});

test("ISS-309: a failing tree prune is reported as failure (new data kept, not restored over)", async () => {
  const store = fakeStore(seedOld(), (op, coll) => op === "update" && coll === "tree_index");
  await assert.rejects(replaceSessionRows(base(store, okIngest(store))), (e) => e.phase === "tree-prune" && /tree_index still lists/.test(e.message));
  assert.ok(store.data.sessions.some((s) => s._id === NEW), "new session must not be rolled back");
});

// ---- ISS-316: injected failure at EACH step after the first delete. ----
const STEPS = SESSION_COLLECTIONS.length; // deletes are mutating calls 1..6, ingest inserts are 7.. (4 of them)
for (let step = 1; step <= STEPS + 4; step += 1) {
  test(`ISS-316: failure at mutating call #${step} (${step <= STEPS ? "delete" : "ingest write"}) -> old data restored, failure reported`, async () => {
    const seed = seedOld();
    const store = fakeStore(seed, (op, coll, n) => n === step);
    await assert.rejects(replaceSessionRows(base(store, okIngest(store))), (e) => /reingest FAILED after delete/.test(e.message) && e.restored === true && /RESTORED/.test(e.message));
    for (const c of ["sources", "sessions", "turns", "session_pages", "claims", "chunks"]) {
      assert.deepEqual([...store.data[c]].sort((a, b) => a._id.localeCompare(b._id)), [...seed[c]].sort((a, b) => a._id.localeCompare(b._id)), `${c} differs after restore`);
    }
    assert.equal(hasNode(store.data.tree_index[0], OLD), true, "tree must still match the restored session");
  });
}

test("ISS-316: ingest throws midway after writing partial rows -> partial rows removed, old rows back", async () => {
  const seed = seedOld();
  const store = fakeStore(seed);
  const ingest = async () => { await okIngest(store)(); throw new Error("assertIndexed: 0 chunks"); };
  await assert.rejects(replaceSessionRows(base(store, ingest)), /0 chunks.*RESTORED/s);
  assert.equal(store.data.sessions.some((s) => s._id === NEW), false);
  assert.equal(store.data.turns.some((s) => s._id === "n1"), false);
  assert.equal(store.data.chunks.some((s) => s._id === "nk1"), false);
  assert.equal(store.data.sources.filter((s) => s._id === `gdrive-${DRIVE}`).length, 1);
  assert.equal(store.data.sessions.some((s) => s._id === OLD), true);
});

test("ISS-316: if the restore itself fails the error says so and names the snapshot", async () => {
  const store = fakeStore(seedOld(), (op, coll, n) => n >= 7 || (op === "insert" && coll === "turns"));
  await assert.rejects(replaceSessionRows(base(store, okIngest(store))), (e) => e.restored === false && /RESTORE INCOMPLETE/.test(e.message) && /mem:\/\/snapshot/.test(e.message));
});

test("snapshot cannot be written -> NOTHING is deleted and the run fails", async () => {
  const seed = seedOld();
  const store = fakeStore(seed);
  await assert.rejects(replaceSessionRows(base(store, okIngest(store), { writeSnapshot: async () => { throw new Error("disk full"); } })), /disk full/);
  assert.deepEqual(store.calls, [], "no mutating call may precede a durable snapshot");
  assert.equal(store.data.sessions.length, seed.sessions.length);
});

test("a session that already existed under the new id is not removed by the cleanup", async () => {
  const seed = seedOld();
  seed.sessions.push(session(NEW, "2026-09-25")); // linked to THIS drive file: only the pre-existing guard protects it
  const store = fakeStore(seed);
  await assert.rejects(replaceSessionRows(base(store, async () => { throw new Error("boom"); })), /boom/);
  assert.ok(store.data.sessions.some((s) => s._id === NEW), "pre-existing NEW session must survive");
});

test("tenant isolation: another tenant's rows with the same session id are never deleted or restored over", async () => {
  const seed = seedOld();
  seed.turns.push({ _id: "o1", tenantId: "other", sessionId: OLD });
  seed.chunks.push({ _id: "o2", tenantId: "other", sourceRef: OLD });
  seed.sources.push({ _id: `gdrive-${DRIVE}`, tenantId: "other" });
  const store = fakeStore(seed);
  await replaceSessionRows(base(store, okIngest(store)));
  assert.ok(store.data.turns.some((t) => t._id === "o1") && store.data.chunks.some((t) => t._id === "o2"), "other tenant's rows deleted");
  assert.ok(store.data.sources.some((t) => t.tenantId === "other"), "other tenant's source deleted");
  const failing = fakeStore(seed, (op, coll, n) => n === 8);
  await assert.rejects(replaceSessionRows(base(failing, okIngest(failing))));
  assert.ok(failing.data.turns.some((t) => t._id === "o1"));
});

// ---- ISS-316 literal row: the reindex-only branch (buildIndexer / assertIndexed) must mark failed. ----
test("ISS-316 (recorded): buildIndexer throwing marks watch_state failed with the reason, error rethrown", async () => {
  const marks = [];
  await assert.rejects(withFailureRecorded(async (r) => marks.push(r), async () => { throw new Error("embedding quota exceeded"); }), /embedding quota/);
  assert.deepEqual(marks, ["embedding quota exceeded"]);
});

test("ISS-316 (recorded): assertIndexed-style throw is recorded too; a failing recorder never masks the original error", async () => {
  await assert.rejects(withFailureRecorded(async () => { throw new Error("mongo down"); }, async () => { throw new Error("assertIndexed: 0 chunks"); }), /assertIndexed: 0 chunks/);
});

test("withFailureRecorded: success path records nothing and returns the value", async () => {
  const marks = [];
  assert.equal(await withFailureRecorded(async (r) => marks.push(r), async () => 42), 42);
  assert.deepEqual(marks, []);
});

test("failed attempt that created the source row when none existed before -> that source row is removed", async () => {
  const seed = seedOld();
  seed.sources = seed.sources.filter((x) => x._id !== `gdrive-${DRIVE}`); // old session found via watch_state fallback
  const store = fakeStore(seed);
  await assert.rejects(replaceSessionRows(base(store, async () => { await okIngest(store)(); throw new Error("boom"); })), /boom/);
  assert.equal(store.data.sources.some((x) => x._id === `gdrive-${DRIVE}`), false);
});

test("snapshot row count disagreeing with the live count aborts before any delete", async () => {
  const store = fakeStore(seedOld());
  const lying = (name) => (t) => ({ ...store.scoped(name)(t), countDocuments: async (x) => (await store.scoped(name)(t).countDocuments(x)) + 1 });
  await assert.rejects(replaceSessionRows(base(store, okIngest(store), { scoped: lying })), /snapshot of .* has/);
  assert.deepEqual(store.calls, []);
});
