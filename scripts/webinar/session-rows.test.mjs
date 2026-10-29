/**
 * scripts/webinar/session-rows.test.mjs — ISS-291 (safe swap, injected failing write) and
 * ISS-294 (derived session files). Runner: `node --test` (wired into package.json `test:lint`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceSessionRows, buildSessionFiles, loadWebinarSession, assertIndexComplete, recordIndexFailure, clearIndexFailure, indexExistingRows } from "./session-rows.mjs";

/** In-memory stand-in for a packages/db coll(tenantId) accessor: equality + `$ne` filters,
 * `$set` upserts. `failOnUpsert` makes the n-th upsert throw, like a network blip mid-loop. */
function fakeColl(rows, { failOnUpsert = -1 } = {}) {
  const store = new Map(rows.map((r) => [r._id, { ...r }]));
  let upserts = 0;
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) =>
      v && typeof v === "object" && "$ne" in v ? doc[k] !== v.$ne : doc[k] === v);
  return {
    store,
    async updateOne(filter, update, options) {
      if (upserts++ === failOnUpsert) throw new Error("injected write failure");
      const cur = store.get(filter._id);
      if (!cur && !options?.upsert) return { matchedCount: 0 };
      store.set(filter._id, { ...(cur ?? { _id: filter._id }), ...update.$set });
      return { matchedCount: cur ? 1 : 0 };
    },
    async deleteMany(filter) {
      let n = 0;
      for (const [id, doc] of store) if (matches(doc, filter)) { store.delete(id); n++; }
      return { deletedCount: n };
    },
  };
}

const oldTurns = [1, 2, 3, 4].map((i) => ({ _id: `s-t00${i}`, sessionId: "s", text: `old ${i}`, syncGen: "g0" }));
const otherSession = { _id: "x-t001", sessionId: "x", text: "other session", syncGen: "g0" };
const newTurns = [1, 2, 3].map((i) => ({ _id: `s-t00${i}`, sessionId: "s", text: `new ${i}` }));

test("safe swap: a successful run replaces the session's rows and removes stale ones only", async () => {
  const c = fakeColl([...oldTurns, otherSession]);
  const res = await replaceSessionRows(c, { sessionId: "s" }, newTurns, "g1");
  assert.deepEqual(res, { upserted: 3, removedStale: 1 });
  assert.deepEqual([...c.store.values()].filter((d) => d.sessionId === "s").map((d) => d.text), ["new 1", "new 2", "new 3"]);
  assert.equal(c.store.get("x-t001").text, "other session", "another session's row must survive");
});

test("safe swap: an injected failing write mid-run deletes NOTHING — the session stays complete", async () => {
  const c = fakeColl([...oldTurns, otherSession], { failOnUpsert: 1 });
  await assert.rejects(replaceSessionRows(c, { sessionId: "s" }, newTurns, "g1"), /injected write failure/);
  const left = [...c.store.values()].filter((d) => d.sessionId === "s");
  assert.equal(left.length, 4, "all 4 rows of the session must still exist after a failed run");
  assert.deepEqual(left.map((d) => d.text), ["new 1", "old 2", "old 3", "old 4"]);
  // A re-run converges to exactly the new set.
  const c2 = fakeColl([...c.store.values()]);
  await replaceSessionRows(c2, { sessionId: "s" }, newTurns, "g2");
  assert.deepEqual([...c2.store.values()].filter((d) => d.sessionId === "s").map((d) => d.text), ["new 1", "new 2", "new 3"]);
});

test("session files are derived from the webinar's own meta/source/turns (ISS-294)", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "toc-migrated",
    "2026-09-24-zoho-next-european-study-destinations");
  const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const meta = load("meta.json");
  const turns = load("turns.json");
  const sessionDoc = { sourceId: load("source.json")._id, title: meta.title, date: meta.date, org: "o",
    status: { transcribe: "done", index: "pending" } };
  const f = buildSessionFiles({ sessionId: meta.sessionId, tenantId: "toc", sessionDoc, meta, turns });
  assert.equal(f.session._id, meta.sessionId);
  assert.equal(f.sessionPage.sessionId, meta.sessionId);
  const ids = new Set(turns.map((t) => t._id));
  assert.ok(f.sessionPage.evidence.length > 0);
  for (const e of f.sessionPage.evidence) assert.ok(ids.has(e.turnId), `evidence ${e.turnId} must be a real turn`);
  assert.deepEqual(f.claims, []);
  // The committed files on disk are exactly what the generator emits (no hand edits).
  assert.deepEqual(load("session_page.json").evidence, f.sessionPage.evidence);
});

// ---- D-207 reindex-sync-fix ------------------------------------------------------------------------------------------
// Synthetic fixtures only (no real student text). OLD = the toc-migrated shape: source.json has no `title`; the title and
// date live in session.json. NEW = the title-bearing shape the loader always accepted.
const SID = "2026-01-02-synthetic-migrated";
const oldSource = { _id: `${SID}-src`, tenantId: "toc", kind: "document", captureMode: "provided", path: "raw/x.md", hash: "h", consent: { given: true }, createdAt: "2026-09-03T06:13:39.454Z" };
const oldSession = { _id: SID, tenantId: "toc", sourceId: `${SID}-src`, title: "Synthetic Migrated Title", date: "2026-01-02", org: "Synthetic Org", status: { transcribe: "done", diarize: "pending", summarize: "done", index: "pending" } };
const turnsOf = (sid, tenantId) => [0, 1].map((i) => ({ _id: `${sid}-t00${i + 1}`, tenantId, sessionId: sid, speakerRef: "Speaker A", tStart: i * 5, tEnd: i * 5 + 4, text: `synthetic line ${i}` }));
function fixtureDir(files) {
  const root = mkdtempSync(join(tmpdir(), "reindex-fix-")), dir = join(root, "data", "toc-migrated", SID);
  mkdirSync(dir, { recursive: true });
  for (const [name, doc] of Object.entries(files)) if (doc !== undefined) writeFileSync(join(dir, name), JSON.stringify(doc));
  return { root, dir };
}
const load = (files) => { const f = fixtureDir(files); try { return loadWebinarSession(f.dir, SID); } finally { rmSync(f.root, { recursive: true, force: true }); } };
const base = { "turns.json": turnsOf(SID, "toc") };

test("D-207: the migrated source shape (no title) loads, taking title/date/org/status from session.json, never inventing a title", () => {
  const r = load({ ...base, "source.json": oldSource, "session.json": oldSession });
  assert.equal(r.legacyProvided, true);
  assert.equal(r.meta.title, "Synthetic Migrated Title");
  assert.equal(r.meta.date, "2026-01-02");
  assert.equal(new Date(r.meta.t0).toISOString().slice(0, 10), "2026-01-02", "t0 is the session date, not the createdAt of the migration");
  assert.equal(r.meta.org, "Synthetic Org");
  assert.deepEqual(r.meta.sessionStatus, oldSession.status);
  assert.equal(r.meta.capturedBy.id, undefined, "a provided transcript has no capture user");
  assert.equal(r.meta.capturedBy.via, "provided");
  assert.equal(r.source.title, undefined, "source.json is passed through unmodified");
  assert.equal(r.rawTurns.length, 2);
});
test("D-207 falsification: a title-less source is still refused unless session.json states a matching title (and is a provided document)", () => {
  const refused = /invalid\/silent webinar source/;
  const cases = {
    "no session.json": { ...base, "source.json": oldSource },
    "blank session title": { ...base, "source.json": oldSource, "session.json": { ...oldSession, title: "  " } },
    "session id mismatch": { ...base, "source.json": oldSource, "session.json": { ...oldSession, _id: "other" } },
    "session tenant mismatch": { ...base, "source.json": oldSource, "session.json": { ...oldSession, tenantId: "vidysea" } },
    "session source mismatch": { ...base, "source.json": oldSource, "session.json": { ...oldSession, sourceId: "other-src" } },
    "bad session date": { ...base, "source.json": oldSource, "session.json": { ...oldSession, date: "yesterday" } },
    "captured (silent) source with a session title": { ...base, "source.json": { ...oldSource, captureMode: "silent" }, "session.json": oldSession },
    "silent audio": { ...base, "source.json": { ...oldSource, audioLevel: { silent: true } }, "session.json": oldSession },
    "capture consent without title": { ...base, "source.json": { ...oldSource, captureConsent: { sessionId: SID } }, "session.json": oldSession },
    "no tenant": { ...base, "source.json": { ...oldSource, tenantId: undefined }, "session.json": oldSession },
  };
  for (const [label, files] of Object.entries(cases)) assert.throws(() => load(files), refused, label);
});
test("D-207: a title-bearing source is unchanged (no legacy flag, no session.json read)", () => {
  const r = load({ ...base, "source.json": { ...oldSource, title: "Own Title", createdAt: "2026-10-14T00:00:00Z" } });
  assert.equal(r.legacyProvided, false);
  assert.equal(r.meta.title, "Own Title");
  assert.equal(r.meta.date, "2026-10-14");
  assert.equal(r.meta.capturedBy.via, "provided");
  assert.equal(r.meta.capturedBy.id, "user:vidysea-webinar-capture");
});

const ok = (over = {}) => ({ sessionId: "s", chunks: { written: 3 }, summary: { degraded: null }, claims: { degraded: null },
  completion: { version: 2, strict: true, complete: true, treeWritten: true, generation: "g", turnCount: 2, retrievalMode: "vectorless", lexicalWritten: true, provenanceValidated: true }, ...over });
test("D-207: assertIndexComplete accepts a complete result and names every reason an incomplete one is refused", () => {
  assertIndexComplete(ok(), "s");
  const bad = [
    [ok({ sessionId: "x" }), /session/], [ok({ chunks: { written: 0 } }), /chunks/], [ok({ chunks: { written: 2, skipped: "x" } }), /chunks/],
    [ok({ summary: { degraded: "llm down" } }), /summary degraded: llm down/], [ok({ claims: { degraded: "bad" } }), /claims degraded: bad/],
    [ok({ completion: { ...ok().completion, complete: false } }), /complete/], [ok({ completion: { ...ok().completion, treeWritten: false } }), /tree/],
    [ok({ completion: { ...ok().completion, lexicalWritten: false } }), /retrieval mode/], [ok({ completion: undefined }), /completion/], [undefined, /completion/],
  ];
  for (const [res, re] of bad) assert.throws(() => assertIndexComplete(res, "s"), (e) => /^index incomplete:/.test(e.message) && re.test(e.message), String(re));
});

/** In-memory session accessor with findOne + $set/$unset, enough for the index-failure helpers. */
function sessionColl(row) {
  const store = new Map(row ? [[row._id, structuredClone(row)]] : []);
  return { store,
    async findOne(f) { const d = store.get(f._id); return d ? structuredClone(d) : null; },
    async updateOne(f, u) { const d = store.get(f._id); if (!d) return { matchedCount: 0 }; Object.assign(d, structuredClone(u.$set ?? {})); for (const k of Object.keys(u.$unset ?? {})) delete d[k]; return { matchedCount: 1 }; } };
}
test("D-207: recordIndexFailure persists why (redacted, bounded) beside the attempt without touching indexAttempt; clearIndexFailure removes it", async () => {
  const attempt = { version: 1, generation: "gen-1", state: "failed", phase: "preflight" };
  const c = sessionColl({ _id: "s", indexAttempt: attempt, status: { index: "failed" } });
  const doc = await recordIndexFailure(c, "s", new Error(`strict webinar index incomplete: bad\nturn at mongodb+srv://user:pw@host/db ${"x".repeat(3000)}`));
  const row = c.store.get("s");
  assert.deepEqual(row.indexAttempt, attempt, "indexAttempt is a closed schema and must stay byte-identical");
  assert.deepEqual(row.indexFailure, doc);
  assert.match(doc.reason, /^strict webinar index incomplete: bad turn at mongodb:\/\/\[redacted\]/);
  assert.doesNotMatch(doc.reason, /user:pw|\n/);
  assert.ok(doc.reason.length <= 1000);
  assert.deepEqual([doc.via, doc.generation, doc.state, doc.phase], ["sync-session", "gen-1", "failed", "preflight"]);
  assert.ok(Number.isFinite(Date.parse(doc.at)));
  await clearIndexFailure(c, "s");
  assert.equal(c.store.get("s").indexFailure, undefined);
  assert.deepEqual(c.store.get("s").indexAttempt, attempt);
});

/** Fakes for indexExistingRows: row presence per collection. */
const deps = (over = {}) => {
  const calls = [];
  const sessions = sessionColl(over.session === null ? undefined : { _id: "s", sourceId: "src", status: { index: "failed" }, ...over.session });
  return { calls, sessions, args: { tenantId: "vidysea", sessionId: "s", workDb: "lkb_work_x", sessions,
    sources: { async findOne() { return over.source === null ? null : { _id: "src", ...over.source }; } },
    turns: { async countDocuments() { return over.turns ?? 5; } },
    indexer: async (t, s) => { calls.push([t, s]); if (over.fail) throw over.fail; return over.result ?? ok(); },
    log: () => {} } };
};
test("D-207: indexExistingRows indexes only rows that already exist and refuses (no indexer call) when any is missing", async () => {
  for (const [label, over, re] of [["no session", { session: null }, /session s .*not found/], ["no source", { source: null }, /source src .*not found/],
    ["no turns", { turns: 0 }, /no turns/], ["testData outside staging", { source: { testData: true } }, /testData source/]]) {
    const d = deps(over);
    await assert.rejects(indexExistingRows(d.args), re, label);
    assert.deepEqual(d.calls, [], `${label}: the indexer must not run`);
  }
  const d = deps({ source: { testData: true } });
  await indexExistingRows({ ...d.args, workDb: "lkb_staging" });
  assert.deepEqual(d.calls, [["vidysea", "s"]]);
});
test("D-207: indexExistingRows records the failure reason on throw and on an incomplete result, clears it on success", async () => {
  const d = deps({ fail: new Error("strict webinar index incomplete: turn t3 not grounded") });
  await assert.rejects(indexExistingRows(d.args), /not grounded/);
  assert.match(d.sessions.store.get("s").indexFailure.reason, /turn t3 not grounded/);
  const e = deps({ result: ok({ summary: { degraded: "llm down" } }), session: { indexFailure: { reason: "old" } } });
  await assert.rejects(indexExistingRows(e.args), /index incomplete: summary degraded: llm down/);
  assert.match(e.sessions.store.get("s").indexFailure.reason, /summary degraded: llm down/);
  const f = deps({ session: { indexFailure: { reason: "old" } } });
  const res = await indexExistingRows(f.args);
  assert.equal(res.completion.complete, true);
  assert.equal(f.sessions.store.get("s").indexFailure, undefined);
});

// ---- D-207: --index-existing against a THROWAWAY local mongod (no production, no network, no LLM) ----------------------
// Skipped when no mongod binary is available (set LKB_TEST_MONGOD, or it is looked up in the mongodb-memory-server cache).
const MONGOD = process.env.LKB_TEST_MONGOD ?? ["mongod-x64-win32-7.0.24.exe", "mongod-x64-win32-8.2.6.exe"].map((n) => join(homedir(), ".cache", "mongodb-binaries", n)).find((p) => existsSync(p));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
async function withMongod(fn) {
  const dbpath = mkdtempSync(join(tmpdir(), "d207-mongod-")), port = await freePort();
  const proc = spawn(MONGOD, ["--dbpath", dbpath, "--port", String(port), "--bind_ip", "127.0.0.1", "--wiredTigerCacheSizeGB", "0.25"], { stdio: "ignore" });
  const { connect, close, getDb } = await import("../../packages/db/src/client.js");
  const url = `mongodb://127.0.0.1:${port}/?serverSelectionTimeoutMS=2000`, dbName = `lkb_work_d207_${process.pid}`;
  try {
    for (let i = 0; ; i++) { try { await connect(url, dbName); break; } catch (e) { if (i > 40 || proc.exitCode !== null) throw e; await new Promise((r) => setTimeout(r, 500)); } }
    return await fn({ url, dbName, db: getDb() });
  } finally {
    await close().catch(() => undefined);
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r)));
    rmSync(dbpath, { recursive: true, force: true });
  }
}
test("D-207: --index-existing on a real (throwaway) Mongo: a failed-at-preflight session is retried through the real indexer, the REASON is persisted, rows untouched",
  { skip: !MONGOD && "no mongod binary (set LKB_TEST_MONGOD)", timeout: 240000 }, async () => {
  await withMongod(async ({ url, dbName, db }) => {
    const { scopedCollection } = await import("../../packages/db/src/lib/tenantScope.js");
    const { indexSession } = await import("../../apps/api/src/indexing/session.ts");
    const T = "vidysea", S = "2026-10-13-synthetic-p2";
    const attempt = { version: 1, generation: "11111111-1111-4111-8111-111111111111", sessionId: S, sourceId: `${S}-src`, turnDigest: "a".repeat(64), strict: true,
      state: "failed", phase: "preflight", startedAt: "2026-10-28T00:00:00.000Z", turnCount: 3 };
    const turn = (i, tStart, tEnd) => ({ _id: `${S}-t00${i}`, tenantId: T, sessionId: S, speakerRef: "spk:0", tStart, tEnd, text: `synthetic line ${i}`, speakerLabel: "A", occurredAt: "2026-10-13T00:00:00.000Z" });
    await db.collection("sources").insertOne({ _id: `${S}-src`, tenantId: T, kind: "recording", captureMode: "silent", hash: "h", createdAt: "2026-10-13T00:00:00.000Z" });
    await db.collection("sessions").insertOne({ _id: S, tenantId: T, sourceId: `${S}-src`, title: "Synthetic P2", date: "2026-10-13", status: { transcribe: "done", index: "failed" }, indexAttempt: attempt });
    await db.collection("turns").insertMany([turn(1, 0, 4), turn(2, 4, 9), turn(3, 9, 3)]); // t3: tEnd before tStart, as in the two TOC sessions
    const coll = (n) => scopedCollection(db, n)(T);
    const before = JSON.stringify(await db.collection("turns").find({}).sort({ _id: 1 }).toArray());
    const indexer = (t, s) => indexSession(t, s, { db, strictWebinar: true, complete: async () => { throw new Error("no LLM may be called in this test"); } });
    const run = (over = {}) => indexExistingRows({ tenantId: T, sessionId: S, workDb: dbName, sessions: coll("sessions"), sources: coll("sources"), turns: coll("turns"), indexer, log: () => {}, ...over });
    await assert.rejects(run(), /strict webinar index incomplete: invalid transcript ownership\/identity\/time/);
    const row = await db.collection("sessions").findOne({ _id: S });
    assert.match(row.indexFailure.reason, /invalid transcript ownership\/identity\/time/, "the preflight reason is now stored");
    assert.equal(row.indexFailure.via, "index-existing");
    assert.equal(row.indexAttempt.state, "failed"); assert.equal(row.indexAttempt.phase, "preflight");
    assert.notEqual(row.indexAttempt.generation, attempt.generation, "a fresh attempt was acquired and failed");
    assert.deepEqual(Object.keys(row.indexAttempt).sort(), [...Object.keys(attempt), "finishedAt"].sort(), "indexAttempt keeps its closed shape (only the schema field finishedAt is added by the failing attempt)");
    assert.equal(row.status.index, "failed");
    assert.equal(JSON.stringify(await db.collection("turns").find({}).sort({ _id: 1 }).toArray()), before, "no turn row was created, replaced or removed");
    assert.equal(await db.collection("sessions").countDocuments(), 1);
    assert.deepEqual((await db.admin().listDatabases()).databases.map((d) => d.name).filter((n) => !["admin", "config", "local"].includes(n)), [dbName], "nothing outside the throwaway DB");
    // A repaired transcript + a (fake) completing indexer: the failure marker is cleared.
    await db.collection("turns").updateOne({ _id: `${S}-t003` }, { $set: { tEnd: 12 } });
    await run({ indexer: async () => ok({ sessionId: S }) });
    assert.equal((await db.collection("sessions").findOne({ _id: S })).indexFailure, undefined);
    // Another tenant's session id is not found (tenant scoping), and a missing session writes nothing.
    await assert.rejects(run({ tenantId: "toc", sessions: scopedCollection(db, "sessions")("toc"), sources: scopedCollection(db, "sources")("toc"), turns: scopedCollection(db, "turns")("toc") }), /not found/);
    // The real script, with an empty throwaway database: refuses cleanly (session not found), exit non-zero, creates no collection.
    const empty = `lkb_work_d207_empty_${process.pid}`;
    const child = spawn(process.execPath, ["--import", "tsx", join(dirname(fileURLToPath(import.meta.url)), "sync-session.mjs"), "no-such-session", "--index-existing", "--tenant", T],
      { env: { ...process.env, MONGODB_URL: url, MONGO_WORK_DB: empty, MONGODB_DB: "" }, stdio: ["ignore", "pipe", "pipe"] });
    let err = ""; child.stderr.on("data", (d) => { err += d; }); child.stdout.resume();
    const exit = await new Promise((r) => { const t = setTimeout(() => child.kill(), 90000); child.on("close", (c) => { clearTimeout(t); r(c); }); });
    assert.notEqual(exit, 0); assert.match(err, /index-existing: session no-such-session \(tenant vidysea\) not found in lkb_work_d207_empty_/);
    assert.deepEqual(await db.client.db(empty).listCollections().toArray(), [], "the CLI created nothing");
  });
});
