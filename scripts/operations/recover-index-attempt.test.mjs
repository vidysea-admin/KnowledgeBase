// w27-recover. In-memory Db fake only: no network, no real Mongo. Run: node --test --import tsx <file>
import test from "node:test";
import assert from "node:assert/strict";
import { scopedCollection } from "../../packages/db/src/lib/tenantScope.ts";
import { acquireIndexAttempt } from "../../apps/api/src/indexing/generation.ts";
import { recoverIndexAttempt, parseArgs, main, isStuck, format } from "./recover-index-attempt.mjs";

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const set = (o, path, v) => { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] ??= {}; x[ks.at(-1)] = v; };
const matches = (row, f) => Object.entries(f).every(([k, v]) => (v && typeof v === "object" && "$exists" in v) ? (get(row, k) !== undefined) === v.$exists : get(row, k) === v);
function fakeDb(data) {
  const store = new Map(Object.entries(data).map(([k, v]) => [k, v.map(r => structuredClone(r))]));
  const log = { writes: [], onFindOne: null };
  const coll = n => {
    const rows = store.get(n) ?? (store.set(n, []), store.get(n));
    return {
      find: f => ({ toArray: async () => rows.filter(r => matches(r, f)).map(r => structuredClone(r)) }),
      findOne: async f => { const r = rows.find(x => matches(x, f)); const c = r ? structuredClone(r) : null; if (n === "sessions") await log.onFindOne?.(rows); return c; },
      countDocuments: async f => rows.filter(r => matches(r, f)).length,
      updateOne: async (f, u) => {
        const r = rows.find(x => matches(x, f)); if (!r) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        log.writes.push({ n, f: structuredClone(f), u: structuredClone(u) });
        for (const [k, v] of Object.entries(u.$set ?? {})) set(r, k, v); return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      },
    };
  };
  return { databaseName: "lkb_staging", collection: coll, store, log };
}
const GEN = "11111111-1111-4111-8111-111111111111", GEN2 = "22222222-2222-4222-8222-222222222222", D = "a".repeat(64);
const NOW = new Date("2026-10-22T12:00:00.000Z"), now = () => NOW;
const ago = min => new Date(NOW.getTime() - min * 60000).toISOString();
const sess = (id, tenantId, attempt, extra = {}) => ({ _id: id, tenantId, sourceId: `src-${id}`, status: { index: "failed" }, ...(attempt ? { indexAttempt: attempt } : {}), ...extra });
const att = (id, o = {}) => ({ version: 1, generation: GEN, sessionId: id, sourceId: `src-${id}`, turnDigest: D, strict: true, turnCount: 1, state: "uncertain", phase: "writing", startedAt: ago(600), ...o });
const seed = () => fakeDb({
  sessions: [sess("s1", "toc", att("s1")), sess("s2", "toc", att("s2", { state: "running", startedAt: ago(5) })), sess("o1", "other", att("o1")), sess("c1", "toc", att("c1", { state: "complete" })), sess("n1", "toc", null)],
  session_pages: [{ _id: "p1", tenantId: "toc", sessionId: "s1", indexArtifact: { generation: GEN } }, { _id: "p2", tenantId: "toc", sessionId: "s1", indexArtifact: { generation: GEN2 } }],
  chunks: [{ _id: "k1", tenantId: "toc", sourceRef: "s1", indexArtifact: { generation: GEN } }, { _id: "k2", tenantId: "other", sourceRef: "s1", indexArtifact: { generation: GEN } }],
  claims: [], sources: [{ _id: "src-s1", tenantId: "toc" }],
});
const run = (db, o = {}) => recoverIndexAttempt({ db, scopedCollection, tenantId: "toc", sessionId: "s1", now, by: "tester", ...o });
const snap = db => JSON.stringify([...db.store]);

test("dry run reports state, generation, age and artifacts, and makes no writes", async () => {
  const db = seed(), before = snap(db), r = await run(db);
  assert.equal(r.status, "dry_run"); assert.equal(r.generation, GEN); assert.equal(r.state, "uncertain"); assert.equal(r.ageMinutes, 600);
  assert.deepEqual(r.artifacts.session_pages, { total: 2, fromAbandonedGeneration: 1 });
  assert.deepEqual(r.artifacts.chunks, { total: 1, fromAbandonedGeneration: 1 }, "other tenant's chunk is not counted");
  assert.equal(db.log.writes.length, 0); assert.equal(snap(db), before);
  assert.match(format(r), /DRY-RUN .*DRY_RUN[\s\S]*generation=1111/);
});

test("apply resets only the exact stuck attempt, records who/when/why, deletes nothing", async () => {
  const db = seed(), others = JSON.stringify(db.store.get("sessions").filter(s => s._id !== "s1")), arts = JSON.stringify([db.store.get("session_pages"), db.store.get("chunks")]);
  const r = await run(db, { apply: true, reason: "stuck after crash" });
  assert.equal(r.status, "recovered"); assert.equal(db.log.writes.length, 1);
  const w = db.log.writes[0]; assert.deepEqual(Object.keys(w.f).sort(), ["_id", "indexAttempt.generation", "indexAttempt.phase", "indexAttempt.state", "sourceId", "tenantId"]);
  const s = db.store.get("sessions").find(x => x._id === "s1");
  assert.equal(s.indexAttempt.state, "failed"); assert.equal(s.indexAttempt.phase, "preflight"); assert.equal(s.indexAttempt.generation, GEN); assert.equal(s.status.index, "failed");
  assert.deepEqual(s.indexRecovery, { at: NOW.toISOString(), by: "tester", reason: "stuck after crash", generation: GEN, previousState: "uncertain", previousPhase: "writing", forced: false });
  assert.equal(JSON.stringify(db.store.get("sessions").filter(x => x._id !== "s1")), others);
  assert.equal(JSON.stringify([db.store.get("session_pages"), db.store.get("chunks")]), arts, "no artifact is deleted or changed");
  assert.equal(isStuck(s.indexAttempt), false);
});

test("after apply, acquireIndexAttempt claims the session (it refused it before)", async () => {
  const db = seed(), turns = [{ _id: "t1", tenantId: "toc", sessionId: "s1", tStart: 0, tEnd: 1, text: "x" }];
  await assert.rejects(acquireIndexAttempt(db, "toc", "s1", turns, true), /index_attempt_requires_recovery/);
  await run(db, { apply: true, reason: "r" });
  const claimed = await acquireIndexAttempt(db, "toc", "s1", turns, true);
  assert.equal(claimed.state, "running"); assert.notEqual(claimed.generation, GEN);
});

test("race: the attempt changed between read and apply -> conditional update misses, conflict, nothing written", async () => {
  const db = seed();
  db.log.onFindOne = rows => { db.log.onFindOne = null; const s = rows.find(x => x._id === "s1"); s.indexAttempt.generation = GEN2; };
  const r = await run(db, { apply: true, reason: "r" });
  assert.equal(r.status, "conflict"); assert.equal(db.log.writes.length, 0);
  const s = db.store.get("sessions").find(x => x._id === "s1"); assert.equal(s.indexAttempt.state, "uncertain"); assert.equal(s.indexAttempt.generation, GEN2); assert.equal(s.indexRecovery, undefined);
});

test("race: state changed (uncertain -> complete) before apply -> conflict", async () => {
  const db = seed();
  db.log.onFindOne = rows => { db.log.onFindOne = null; rows.find(x => x._id === "s1").indexAttempt.state = "complete"; };
  assert.equal((await run(db, { apply: true, reason: "r" })).status, "conflict");
});

test("a young running attempt is refused; --force-running resets it with a warning; an old running one needs no force", async () => {
  const db = seed(), young = await run(db, { sessionId: "s2", apply: true, reason: "r" });
  assert.equal(young.status, "refused_running_young"); assert.equal(db.log.writes.length, 0);
  const forced = await run(db, { sessionId: "s2", apply: true, reason: "r", forceRunning: true });
  assert.equal(forced.status, "recovered"); assert.match(forced.warnings[0], /FORCED/);
  assert.equal(db.store.get("sessions").find(x => x._id === "s2").indexRecovery.forced, true);
  const old = seed(); old.store.get("sessions").find(x => x._id === "s2").indexAttempt.startedAt = ago(31);
  assert.equal((await run(old, { sessionId: "s2", apply: true, reason: "r" })).status, "recovered");
});

test("not stuck / missing: complete, no attempt, unknown session are not touched", async () => {
  const db = seed();
  for (const [id, status] of [["c1", "not_stuck"], ["n1", "no_attempt"], ["zz", "session_not_found"]]) assert.equal((await run(db, { sessionId: id, apply: true, reason: "r" })).status, status);
  assert.equal(db.log.writes.length, 0);
});

test("tenant isolation: another tenant's stuck session is invisible and unwritable", async () => {
  const db = seed(), before = snap(db);
  const r = await run(db, { sessionId: "o1", apply: true, reason: "r" });
  assert.equal(r.status, "session_not_found"); assert.equal(snap(db), before);
  const mine = await recoverIndexAttempt({ db, scopedCollection, tenantId: "other", sessionId: "o1", apply: true, reason: "r", now });
  assert.equal(mine.status, "recovered");
  assert.equal(db.store.get("sessions").find(x => x._id === "s1").indexAttempt.state, "uncertain", "toc session untouched");
});

test("--reason is required with --apply; one tenant and one session only; no bulk", () => {
  assert.throws(() => parseArgs(["--tenant", "t", "--session", "s", "--apply"]), /--reason/);
  assert.throws(() => parseArgs(["--tenant", "t", "--session", "s", "--apply", "--reason", "  "]), /--reason/);
  assert.throws(() => parseArgs(["--session", "s"]), /--tenant and --session are required/);
  assert.throws(() => parseArgs(["--tenant", "t"]), /required/);
  assert.throws(() => parseArgs(["--tenant", "t", "--tenant", "u", "--session", "s"]), /more than once/);
  assert.throws(() => parseArgs(["--tenant", "t", "--session", "s", "--all"]), /unknown argument/);
  assert.throws(() => parseArgs(["--tenant", "t", "--session", "s", "--reason", "x"]), /only apply together with --apply/);
  const ok = parseArgs(["--tenant", "t", "--session", "s", "--apply", "--reason", "why", "--force-running"]);
  assert.deepEqual([ok.apply, ok.forceRunning, ok.reason, ok.thresholdMinutes], [true, true, "why", 30]);
});

test("DB guard: unset, lkb without the flag, and other databases are refused before connecting", async () => {
  const URL_ = "mongodb://fake.invalid:27017", loadDb = async () => { throw new Error("must not connect"); }, a = ["--tenant", "t", "--session", "s"];
  await assert.rejects(main(a, {}, { loadDb, out() {} }), /required|refused/);
  await assert.rejects(main(a, { MONGODB_URL: URL_, MONGODB_DB: "lkb" }, { loadDb, out() {} }), /refused/);
  await assert.rejects(main(a, { MONGODB_URL: URL_, MONGO_WORK_DB: "lkb_staging" }, { loadDb, out() {} }), /staging/);
  await assert.rejects(main(a, { MONGODB_URL: URL_, MONGODB_DB: "lkb" }, { loadDb, out() {} }), /refused/);
});

test("main connects to staging with the opt-in, runs the dry run and closes", async () => {
  const db = seed(), lines = []; let closed = false;
  const loadDb = async () => ({ connect: async () => {}, getDb: () => db, close: async () => { closed = true; }, scopedCollection });
  const r = await main(["--tenant", "toc", "--session", "s1"], { MONGODB_URL: "mongodb://fake.invalid:27017", MONGO_WORK_DB: "lkb_staging", LKB_ALLOW_STAGING: "lkb_staging" }, { loadDb, out: l => lines.push(l) });
  assert.equal(r.status, "dry_run"); assert.ok(closed); assert.match(lines[0], /database=lkb_staging/); assert.equal(db.log.writes.length, 0);
});
