// scripts/watch/lib/reingest-crash.test.mjs — iss-reingestsafe-001-004-typed-snapshot-replay.
// Crash-replay: the "process" is killed after the Nth mutating step (the fake then throws Kill on EVERY later
// call, so no in-process compensation can run, exactly like kill -9); a FRESH fake built from the dead
// process's stored BSON bytes then runs startup recovery against the real snapshot file in a temp dir.
// Proven only against the in-memory BSON-bytes fake; never against a real MongoDB.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_COLLECTIONS, ownedNewSessionIds, replaceSessionRows } from "./reingest-swap.mjs";
import { recoverAll, recoverSnapshot, snapshotHooks, withReingestLock, withWatchLock } from "./reingest-recover.mjs";
import { BSON, listSnapshots, snapshotPaths } from "./reingest-snapshot.mjs";
import { Kill, fakeStore } from "./reingest-fake.mjs";
import { buildTree, treeIndexRootFilter } from "../../../packages/index/src/tree/build.ts";
import { regenerate } from "../../../packages/index/src/tree/regenerate.ts";

const T = "toc";
const OLD = "2026-09-25-infocu";
const NEW = "2026-09-25-infocus";
const DRIVE = "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri";
const COLLS = [...SESSION_COLLECTIONS, "tree_index"];
const root = mkdtempSync(join(tmpdir(), "reingestejson-crash-"));
after(() => rmSync(root, { recursive: true, force: true }));
let seq = 0;
const freshDir = () => join(root, `d${(seq += 1)}`);

const session = (id, date, extra = {}) => ({ _id: id, title: id, date, sourceId: `gdrive-${DRIVE}`, status: { index: "done" }, ...extra, tenantId: T });
const treeFor = (sessions) => ({ ...buildTree(sessions, [])[T], tenantId: T });
/** tenantId LAST in every row, exactly as scopedCollection's `{ ...doc, tenantId }` stores it, so rebuilt rows are byte-identical. */
function seedOld() {
  const old = session(OLD, "2025-12-31", { ingestedAt: new Date("2026-09-24T08:30:00.001Z"), score: BSON.Decimal128.fromString("12.50") });
  const keep = session("keep-me", "2026-01-05", { sourceId: "gdrive-OTHER" });
  return {
    sources: [{ _id: `gdrive-${DRIVE}`, driveModified: new Date("2026-09-20T00:00:00Z"), tenantId: T }, { _id: "gdrive-OTHER", tenantId: T }],
    sessions: [old, keep],
    turns: [
      { _id: "t1", sessionId: OLD, at: new Date("2026-09-25T10:00:00.123Z"), ref: new BSON.ObjectId("65f0c0ffee0123456789abcd"), startMs: 1500, tenantId: T },
      { _id: new BSON.ObjectId("0123456789abcdef01234567"), sessionId: OLD, text: "नमस्ते ☃", tenantId: T },
      { _id: "tx", sessionId: "keep-me", tenantId: T },
      { _id: "o1", sessionId: OLD, tenantId: "other" },
    ],
    session_pages: [{ _id: "p1", sessionId: OLD, tenantId: T }],
    claims: [{ _id: "c1", evidence: [{ sessionId: OLD }], confidence: BSON.Decimal128.fromString("0.9100000000000000000000000000000001"), tenantId: T }, { _id: "cx", evidence: [{ sessionId: "keep-me" }], tenantId: T }],
    chunks: [
      { _id: "k1", sourceRef: OLD, vector: Array.from({ length: 64 }, (_, i) => Math.cos(i) / 3), embedding: BSON.Binary.fromFloat32Array(new Float32Array([0.5, -2, 1e-3])), tenantId: T },
      { _id: "kx", sourceRef: "keep-me", tenantId: T },
    ],
    tree_index: [{ _id: "root", ...treeFor([old, keep]) }],
  };
}
const ingestFor = (store) => async () => {
  await store.scoped("sources")(T).insertMany([{ _id: `gdrive-${DRIVE}`, at: new Date() }]);
  await store.scoped("sessions")(T).insertMany([session(NEW, "2026-09-25")]);
  await store.scoped("turns")(T).insertMany([{ _id: "n1", sessionId: NEW }]);
  await store.scoped("chunks")(T).insertMany([{ _id: "nk1", sourceRef: NEW }]);
  return NEW;
};
const deps = (store, dir, over = {}) => ({
  scoped: store.scoped, tenant: T, driveFileId: DRIVE, oldSessionId: OLD, correctSessionId: NEW, ingest: ingestFor(store),
  rootFilter: treeIndexRootFilter(T), regenerate, ...snapshotHooks({ dir }), ...over,
});
const recoverDeps = (store, dir, over = {}) => ({ scoped: store.scoped, tenant: T, dir, rootFilter: treeIndexRootFilter(T), regenerate, ...over });
const hasNode = (rootDoc, id) => JSON.stringify(rootDoc).includes(`/session:${id}"`);
const snapFile = (dir) => snapshotPaths(dir, T, DRIVE).file;
const leftover = (dir) => (existsSync(join(dir, T)) ? readdirSync(join(dir, T)) : []);
const reference = () => fakeStore(seedOld()).bytes(COLLS);

/** run replace in a process that is killed before mutating step `killAt`; returns the dead process's store. */
async function runKilled(dir, killAt, over = {}) {
  const store = fakeStore(seedOld(), () => false, { killAt });
  await replaceSessionRows(deps(store, dir, over)).catch(() => {});
  return store;
}

// mutating steps of a full successful run: 6 deletes (1-6), 4 ingest inserts (7-10), tree update (11).
const STEPS = SESSION_COLLECTIONS.length + 4 + 1;

test("baseline: an unkilled run replaces the session, prunes the tree, and leaves NO snapshot, marker or lock", async () => {
  const dir = freshDir();
  const store = fakeStore(seedOld());
  const r = await replaceSessionRows(deps(store, dir));
  assert.equal(r.sessionId, NEW);
  assert.equal(store.calls.length, STEPS);
  assert.deepEqual(leftover(dir), []);
  assert.equal(hasNode(store.docs("tree_index")[0], OLD), false);
  assert.equal(store.docs("turns").filter((t) => t.tenantId === "other").length, 1);
});

for (let n = 1; n <= STEPS; n += 1) {
  test(`kill -9 before mutating step #${n}/${STEPS} -> fresh process recovers (${n < STEPS ? "old data restored byte-exact" : "committed: new data kept, tree prune finished"})`, async () => {
    const dir = freshDir();
    const dead = await runKilled(dir, n);
    assert.equal(dead.state.dead, true);
    if (n > 1) assert.notDeepEqual(dead.bytes(COLLS), reference(), "the killed process really left the database changed");
    const file = snapFile(dir);
    assert.ok(existsSync(file), "the snapshot must exist at the moment of the kill");
    assert.equal(existsSync(file.replace(/\.snapshot\.json$/, ".committed")), n === STEPS, "commit marker is written exactly when ingest had finished");
    const fresh = fakeStore(dead.dump());
    const res = await recoverAll(recoverDeps(fresh, dir));
    assert.deepEqual(res.map((x) => x.action), [n < STEPS ? "restored" : "finished-committed"]);
    assert.deepEqual(leftover(dir), [], "snapshot, marker and temp files removed after verified recovery");
    if (n < STEPS) {
      assert.deepEqual(fresh.bytes(COLLS), reference(), "every collection (incl. tree_index) byte-identical to the pre-reingest state");
    } else {
      assert.ok(fresh.docs("sessions").some((s) => s._id === NEW) && !fresh.docs("sessions").some((s) => s._id === OLD));
      assert.equal(hasNode(fresh.docs("tree_index")[0], OLD), false);
    }
    assert.equal(fresh.docs("turns").filter((t) => t.tenantId === "other").length, 1, "another tenant's row untouched");
  });
}

test("kill after ingest returned but BEFORE the commit marker was written -> old data restored (new rows removed)", async () => {
  const dir = freshDir();
  const store = fakeStore(seedOld());
  const hooks = snapshotHooks({ dir });
  await replaceSessionRows(deps(store, dir, { commitSnapshot: async () => { store.state.dead = true; throw new Kill("killed before commit marker"); } })).catch(() => {});
  assert.ok(store.docs("sessions").some((s) => s._id === NEW), "the dead process left complete new data");
  const fresh = fakeStore(store.dump());
  assert.deepEqual((await recoverAll(recoverDeps(fresh, dir))).map((x) => x.action), ["restored"]);
  assert.deepEqual(fresh.bytes(COLLS), reference());
  assert.equal(typeof hooks.commitSnapshot, "function");
});

test("kill while the snapshot is being written (before the rename) -> nothing was deleted; recovery sweeps the temp file", async () => {
  const dir = freshDir();
  const store = fakeStore(seedOld());
  const hook = (p) => { if (p === "before-rename") { store.state.dead = true; throw new Kill("killed mid-write"); } };
  await replaceSessionRows(deps(store, dir, snapshotHooks({ dir, hook }))).catch(() => {});
  assert.equal(store.calls.length, 0, "no mutating call precedes a complete snapshot");
  assert.equal(existsSync(snapFile(dir)), false);
  writeFileSync(`${snapFile(dir)}.tmp-999-dead`, "half a snapshot"); // what a real kill would leave
  const fresh = fakeStore(store.dump());
  assert.deepEqual(await recoverAll(recoverDeps(fresh, dir)), []);
  assert.deepEqual(leftover(dir), []);
  assert.deepEqual(fresh.bytes(COLLS), reference());
});

test("kill DURING recovery at every step, then recover again -> still converges to the exact old state", async () => {
  let converged = 0;
  for (let m = 1; m <= 40; m += 1) {
    const dir = freshDir();
    const dead = await runKilled(dir, 8); // mid-ingest: old rows deleted, partial new rows written
    const second = fakeStore(dead.dump(), () => false, { killAt: m });
    let finished = true;
    await recoverAll(recoverDeps(second, dir)).catch((e) => { finished = false; assert.match(e.message, /RECOVERY FAILED/); });
    if (finished) { assert.ok(m > 1); converged += 1; break; }
    assert.ok(existsSync(snapFile(dir)), `snapshot must survive a kill during recovery step ${m}`);
    const third = fakeStore(second.dump());
    await recoverAll(recoverDeps(third, dir));
    assert.deepEqual(third.bytes(COLLS), reference(), `second recovery after a kill at recovery step ${m}`);
    assert.deepEqual(leftover(dir), []);
  }
  assert.equal(converged, 1, "found the step count at which recovery finishes unkilled");
});

test("recovery that cannot restore keeps the snapshot and names its path; the run stops (loud error)", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const before = readFileSync(snapFile(dir));
  const fresh = fakeStore(dead.dump(), (op, coll) => op === "insert" && coll === "turns");
  await assert.rejects(recoverAll(recoverDeps(fresh, dir)), (e) => e.message.includes(`snapshot is KEPT at ${snapFile(dir)}`) && /RECOVERY FAILED/.test(e.message));
  assert.ok(readFileSync(snapFile(dir)).equals(before), "snapshot untouched");
  // the cause is fixed -> the next start succeeds
  const healed = fakeStore(fresh.dump());
  await recoverAll(recoverDeps(healed, dir));
  assert.deepEqual(healed.bytes(COLLS), reference());
  assert.deepEqual(leftover(dir), []);
});

test("corrupt / foreign snapshots are refused loudly, kept, and nothing in the database is touched", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const good = readFileSync(snapFile(dir), "utf8");
  writeFileSync(snapFile(dir), good.replace("नमस्ते", "नमस्"));
  const fresh = fakeStore(dead.dump());
  await assert.rejects(recoverAll(recoverDeps(fresh, dir)), /content hash mismatch/);
  assert.equal(fresh.calls.length, 0);
  assert.ok(existsSync(snapFile(dir)));
  writeFileSync(snapFile(dir), good);
  await assert.rejects(recoverSnapshot({ ...recoverDeps(fresh, dir), tenant: "other", path: snapFile(dir) }), /belongs to tenant toc, not other/);
  assert.equal(fresh.calls.length, 0);
});

test("a second reingest start finds the leftover snapshot instead of snapshotting an already-deleted session", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const fresh = fakeStore(dead.dump());
  await assert.rejects(replaceSessionRows(deps(fresh, dir)), /unrecovered snapshot already exists/);
  assert.equal(fresh.calls.length, 0, "nothing deleted by a run that refuses to start");
});

// ---- cleanup behaviour ----
test("cleanup: success removes the snapshot; ok restore removes it; failed restore keeps it", async () => {
  const dir = freshDir();
  await replaceSessionRows(deps(fakeStore(seedOld()), dir));
  assert.deepEqual(leftover(dir), [], "after success");

  for (let step = 1; step <= STEPS - 1; step += 1) {
    const d = freshDir();
    const s = fakeStore(seedOld(), (op, coll, n) => n === step);
    await assert.rejects(replaceSessionRows(deps(s, d)), (e) => e.restored === true && /RESTORED/.test(e.message));
    assert.deepEqual(leftover(d), [], `failure at step ${step}, restore ok -> snapshot removed`);
    assert.deepEqual(s.bytes(COLLS), reference());
  }

  const d2 = freshDir();
  const s2 = fakeStore(seedOld(), (op, coll, n) => n >= 8 || (op === "insert" && coll === "turns"));
  await assert.rejects(replaceSessionRows(deps(s2, d2)), (e) => e.restored === false && e.message.includes(snapFile(d2)) && /RESTORE INCOMPLETE/.test(e.message));
  assert.ok(existsSync(snapFile(d2)), "snapshot kept because the restore failed");
});

test("cleanup: commit marker cannot be written -> old data restored and snapshot removed (no unsafe commit)", async () => {
  const dir = freshDir();
  const s = fakeStore(seedOld());
  await assert.rejects(replaceSessionRows(deps(s, dir, { commitSnapshot: async () => { throw new Error("disk full"); } })), (e) => e.restored === true && /disk full/.test(e.message));
  assert.deepEqual(s.bytes(COLLS), reference());
  assert.deepEqual(leftover(dir), []);
});

test("tree-prune failure keeps a COMMITTED snapshot; the next start finishes the prune, keeps the new data, removes the snapshot", async () => {
  const dir = freshDir();
  const s = fakeStore(seedOld(), (op, coll) => op === "update" && coll === "tree_index");
  await assert.rejects(replaceSessionRows(deps(s, dir)), (e) => e.phase === "tree-prune" && e.snapshotRef === snapFile(dir) && e.message.includes(snapFile(dir)));
  assert.ok(existsSync(snapFile(dir)));
  const fresh = fakeStore(s.dump());
  assert.deepEqual((await recoverAll(recoverDeps(fresh, dir))).map((x) => x.action), ["finished-committed"]);
  assert.equal(hasNode(fresh.docs("tree_index")[0], OLD), false);
  assert.ok(fresh.docs("sessions").some((x) => x._id === NEW));
  assert.deepEqual(leftover(dir), []);
});

test("restore failure inside the failed run leaves a snapshot that startup recovery then restores byte-exact", async () => {
  const dir = freshDir();
  const s = fakeStore(seedOld(), (op, coll, n) => n >= 8 || (op === "insert" && coll === "turns"));
  await assert.rejects(replaceSessionRows(deps(s, dir)), (e) => e.restored === false);
  const fresh = fakeStore(s.dump());
  await recoverAll(recoverDeps(fresh, dir));
  assert.deepEqual(fresh.bytes(COLLS), reference());
});

// ---- concurrency (ISS-REINGESTSAFE-005) ----
test("two concurrent reingests of the same tenant + file cannot interleave: the second is refused while the first holds the lock", async () => {
  const dir = freshDir();
  const store = fakeStore(seedOld());
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = { ...deps(store, dir), ingest: async () => { await gate; return ingestFor(store)(); } };
  const first = withReingestLock({ dir, tenant: T, driveFileId: DRIVE }, () => replaceSessionRows(slow));
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(withReingestLock({ dir, tenant: T, driveFileId: DRIVE }, () => replaceSessionRows(deps(store, dir))), /already running.*pid/);
  assert.ok(existsSync(snapFile(dir)), "first run's snapshot untouched by the refused second run");
  release();
  await first;
  assert.deepEqual(leftover(dir), [], "lock released, snapshot gone");
  await withReingestLock({ dir, tenant: T, driveFileId: DRIVE }, async () => {}); // free again
  // a different file or tenant is not blocked
  await Promise.all([withReingestLock({ dir, tenant: T, driveFileId: "OTHER_FILE" }, async () => {}), withReingestLock({ dir, tenant: "t2", driveFileId: DRIVE }, async () => {})]);
});

test("a lock left by a killed run (dead pid) does not block the next run; recovery skips a file locked by a LIVE run", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const lockPath = snapshotPaths(dir, T, DRIVE).lock;
  writeFileSync(lockPath, JSON.stringify({ pid: 2147483646, startedAt: new Date().toISOString() }));
  const fresh = fakeStore(dead.dump());
  const res = await recoverAll(recoverDeps(fresh, dir, { lockOpts: { isAlive: () => false } }));
  assert.deepEqual(res.map((x) => x.action), ["restored"]);
  assert.deepEqual(fresh.bytes(COLLS), reference());
  // live holder: skipped, snapshot untouched
  const d2 = freshDir();
  const dead2 = await runKilled(d2, 8);
  writeFileSync(snapshotPaths(d2, T, DRIVE).lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const f2 = fakeStore(dead2.dump());
  assert.deepEqual((await recoverAll(recoverDeps(f2, d2))).map((x) => x.action), ["skipped-locked"]);
  assert.equal(f2.calls.length, 0);
  assert.equal(listSnapshots(d2, T).length, 1);
});

// ---- recovery details that the plain kill matrix cannot reach ----
test("recovery verifies what it wrote: a store that corrupts a restored vector makes recovery FAIL and keep the snapshot", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const fresh = fakeStore(dead.dump());
  const corrupting = (name) => (t) => {
    const c = fresh.scoped(name)(t);
    return name !== "chunks" ? c : { ...c, insertMany: (docs) => c.insertMany(docs.map((d) => (d.vector ? { ...d, vector: d.vector.map((x, i) => (i === 3 ? x + 1e-9 : x)) } : d))) };
  };
  await assert.rejects(recoverAll(recoverDeps(fresh, dir, { scoped: corrupting })), /RECOVERY FAILED.*verify chunks: content differs from snapshot.*KEPT at/s);
  assert.ok(existsSync(snapFile(dir)));
});

test("recovery restores the tree_index node too (snapshot carries the root document)", async () => {
  const dir = freshDir();
  const dead = await runKilled(dir, 8);
  const fresh = fakeStore(dead.dump());
  await fresh.scoped("tree_index")(T).updateOne(treeIndexRootFilter(T), { $set: { children: [] } }); // node lost by a half-finished prune
  assert.notDeepEqual(fresh.bytes(["tree_index"]), { tree_index: reference().tree_index });
  await recoverAll(recoverDeps(fresh, dir));
  assert.deepEqual(fresh.bytes(COLLS), reference());
});

test("recovery never removes a session that already existed under the NEW id before the run started", async () => {
  const dir = freshDir();
  const seed = seedOld();
  seed.sessions.push(session(NEW, "2026-09-25"));
  const store = fakeStore(seed);
  const ref = store.bytes(COLLS);
  await replaceSessionRows(deps(store, dir, { ingest: async () => { store.state.dead = true; throw new Kill("killed during ingest"); } })).catch(() => {});
  const fresh = fakeStore(store.dump());
  await recoverAll(recoverDeps(fresh, dir));
  assert.deepEqual(fresh.bytes(COLLS), ref);
});

// ---- ISS-REINGESTEJSON-004: a pre-existing sibling fork of the same Drive file must survive every failure path ----
const SIB = "dup-fork";
const FORK = `${NEW}-${DRIVE.slice(0, 6).toLowerCase()}`;
/** seedOld plus a sibling fork: sourceId gdrive-<same file>, with a turn, page, claim and chunk. NOT in the snapshot rows. */
function seedWithSibling() {
  const seed = seedOld();
  seed.sessions.push(session(SIB, "2026-02-02", { ingestedAt: new Date("2026-02-03T00:00:00.5Z") }));
  seed.turns.push({ _id: "sib-t1", sessionId: SIB, text: "sibling turn", tenantId: T });
  seed.session_pages.push({ _id: "sib-p1", sessionId: SIB, tenantId: T });
  seed.claims.push({ _id: "sib-c1", evidence: [{ sessionId: SIB }], tenantId: T });
  seed.chunks.push({ _id: "sib-k1", sourceRef: SIB, vector: [0.25, 0.5], tenantId: T });
  return seed;
}
const sibRows = (store) => ({
  sessions: store.docs("sessions").filter((s) => s._id === SIB).length,
  turns: store.docs("turns").filter((s) => s.sessionId === SIB).length,
  session_pages: store.docs("session_pages").filter((s) => s.sessionId === SIB).length,
  claims: store.docs("claims").filter((s) => s.evidence?.[0]?.sessionId === SIB).length,
  chunks: store.docs("chunks").filter((s) => s.sourceRef === SIB).length,
});
const ALL_SIB = { sessions: 1, turns: 1, session_pages: 1, claims: 1, chunks: 1 };
const refSib = () => fakeStore(seedWithSibling()).bytes(COLLS);

test("ISS-REINGESTEJSON-004 checker replay verbatim: sibling session+turn+chunk, ingest fails at step 8 -> restored AND the sibling survives", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling(), (op, coll, n) => n === 8);
  const err = await replaceSessionRows(deps(store, dir)).catch((e) => e);
  assert.match(err.message, /RESTORED from the pre-delete snapshot and verified/);
  assert.equal(err.restored, true);
  assert.deepEqual(sibRows(store), ALL_SIB, "sibling session, turn, page, claim and chunk all still there");
  assert.deepEqual(store.bytes(COLLS), refSib(), "every collection byte-identical to the pre-reingest state, sibling included");
  assert.deepEqual(leftover(dir), []);
});

for (let n = 1; n <= STEPS; n += 1) {
  test(`ISS-REINGESTEJSON-004: kill -9 before mutating step #${n}/${STEPS} with a sibling fork present -> startup recovery leaves the sibling intact`, async () => {
    const dir = freshDir();
    const dead = fakeStore(seedWithSibling(), () => false, { killAt: n });
    await replaceSessionRows(deps(dead, dir)).catch(() => {});
    assert.equal(dead.state.dead, true);
    assert.deepEqual(sibRows(dead), ALL_SIB, "the dead run itself never touched the sibling");
    const fresh = fakeStore(dead.dump());
    const res = await recoverAll(recoverDeps(fresh, dir));
    assert.deepEqual(res.map((x) => x.action), [n < STEPS ? "restored" : "finished-committed"]);
    assert.deepEqual(sibRows(fresh), ALL_SIB, "sibling session, turn, page, claim and chunk survive recovery");
    if (n < STEPS) assert.deepEqual(fresh.bytes(COLLS), refSib(), "everything else restored byte-exact");
    assert.deepEqual(leftover(dir), []);
  });
}

test("ISS-REINGESTEJSON-004: the manifest records the pre-run linked sessions and the planned new id BEFORE any delete", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling());
  let atSnapshot;
  const hooks = snapshotHooks({ dir });
  await replaceSessionRows(deps(store, dir, { writeSnapshot: async (x) => { const f = await hooks.writeSnapshot(x); atSnapshot = { calls: store.calls.length, m: JSON.parse(readFileSync(f, "utf8")).manifest }; return f; } }));
  assert.equal(atSnapshot.calls, 0, "manifest was complete before the first mutating call");
  assert.deepEqual([...atSnapshot.m.preexistingSessionIds].sort(), [OLD, SIB].sort());
  assert.deepEqual(atSnapshot.m.plannedNewSessionIds, [NEW, FORK], "the planned correct id AND its deterministic fork id, nothing discovered");
});

test("ISS-REINGESTEJSON-004: a partial new session (turns written, session row never written) is removed; the sibling is not", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling());
  const half = async () => { await store.scoped("turns")(T).insertMany([{ _id: "n1", sessionId: NEW }]); throw new Error("died before the session row"); };
  const err = await replaceSessionRows(deps(store, dir, { ingest: half })).catch((e) => e);
  assert.equal(err.restored, true);
  assert.equal(store.docs("turns").some((t) => t.sessionId === NEW), false);
  assert.deepEqual(store.bytes(COLLS), refSib());
});

test("ISS-REINGESTEJSON-004: an ingest that writes under an UNPLANNED id is NOT cleaned up (only planned ids are owned); the sibling still survives and the restore is still verified", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling());
  const other = async () => {
    await store.scoped("sessions")(T).insertMany([session("surprise-id", "2026-09-25")]);
    await store.scoped("turns")(T).insertMany([{ _id: "s1", sessionId: "surprise-id" }]);
    throw new Error("boom after writing under another id");
  };
  const err = await replaceSessionRows(deps(store, dir, { ingest: other })).catch((e) => e);
  assert.equal(err.restored, true);
  assert.deepEqual(sibRows(store), ALL_SIB);
  assert.equal(store.docs("sessions").some((x) => x._id === "surprise-id"), true, "an id this run did not plan is never deleted");
});

test("ISS-REINGESTEJSON-006: ownedNewSessionIds is exactly the planned ids minus the pre-run set; no manifest field -> nothing", () => {
  assert.deepEqual(ownedNewSessionIds({ preexistingSessionIds: [SIB, OLD], plannedNewSessionIds: [NEW, FORK] }), [NEW, FORK]);
  assert.deepEqual(ownedNewSessionIds({ preexistingSessionIds: [SIB, NEW], plannedNewSessionIds: [NEW, FORK] }), [FORK]);
  assert.deepEqual(ownedNewSessionIds({ preexistingSessionIds: [SIB] }), [], "cycle-0-shaped manifest (pre-run set, no planned ids)");
  assert.deepEqual(ownedNewSessionIds({}), [], "manifest with neither field");
});

/** The checker's construction: another writer (run-watch --ingest) creates a session for the same Drive file + a turn mid-run. */
const concurrent = (store) => async () => {
  await store.scoped("sessions")(T).insertMany([session("concurrent-ingest", "2026-09-26")]);
  await store.scoped("turns")(T).insertMany([{ _id: "ci-t1", sessionId: "concurrent-ingest", text: "other writer", tenantId: T }]);
};
const hasConcurrent = (store) => store.docs("sessions").some((x) => x._id === "concurrent-ingest") && store.docs("turns").some((x) => x._id === "ci-t1");

test("ISS-REINGESTEJSON-006 checker replay A1 verbatim: another writer's session+turn appears mid-run, ingest then fails -> restored AND the other writer's session survives", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling());
  const ingest = async () => { await concurrent(store)(); throw new Error("boom after the other writer wrote"); };
  const err = await replaceSessionRows(deps(store, dir, { ingest })).catch((e) => e);
  assert.equal(err.restored, true);
  assert.equal(hasConcurrent(store), true, "concurrent session and its turn survive");
  assert.deepEqual(sibRows(store), ALL_SIB);
  assert.deepEqual(leftover(dir), []);
});

test("ISS-REINGESTEJSON-006 checker replay A2 verbatim: kill at step 8, another writer's session lands before startup recovery -> recovery keeps it", async () => {
  const dir = freshDir();
  const dead = fakeStore(seedWithSibling(), () => false, { killAt: 9 });
  await replaceSessionRows(deps(dead, dir)).catch(() => {});
  assert.equal(dead.state.dead, true);
  const fresh = fakeStore(dead.dump());
  await concurrent(fresh)();
  assert.deepEqual((await recoverAll(recoverDeps(fresh, dir))).map((x) => x.action), ["restored"]);
  assert.equal(hasConcurrent(fresh), true);
  assert.deepEqual(sibRows(fresh), ALL_SIB);
});

for (const [what, id] of [["the planned correct id", NEW], ["the deterministic fork id", FORK]]) {
  test(`ISS-REINGESTEJSON-006: a partial write under ${what} is removed on failure, other-writer and sibling sessions are kept`, async () => {
    const dir = freshDir();
    const store = fakeStore(seedWithSibling());
    const half = async () => {
      await concurrent(store)();
      await store.scoped("sessions")(T).insertMany([session(id, "2026-09-25")]);
      await store.scoped("turns")(T).insertMany([{ _id: "p1", sessionId: id }]);
      throw new Error("died mid-ingest");
    };
    const err = await replaceSessionRows(deps(store, dir, { ingest: half })).catch((e) => e);
    assert.equal(err.restored, true);
    assert.equal(store.docs("sessions").some((x) => x._id === id) || store.docs("turns").some((x) => x.sessionId === id), false);
    assert.equal(hasConcurrent(store), true);
    assert.deepEqual(sibRows(store), ALL_SIB);
  });
}

test("ISS-REINGESTEJSON-006/-007: a manifest without the planned ids (legacy or cycle-0-shaped) deletes no session by discovery; the sibling and the other writer survive", async () => {
  for (const strip of [["plannedNewSessionIds", "preexistingSessionIds"], ["plannedNewSessionIds"]]) {
    const dir = freshDir();
    const dead = fakeStore(seedWithSibling(), () => false, { killAt: 9 });
    await replaceSessionRows(deps(dead, dir)).catch(() => {});
    const file = snapFile(dir);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    for (const k of strip) delete doc.manifest[k];
    writeFileSync(file, JSON.stringify(doc));
    const fresh = fakeStore(dead.dump());
    await concurrent(fresh)();
    await recoverAll(recoverDeps(fresh, dir));
    assert.deepEqual(sibRows(fresh), ALL_SIB, `sibling survives (stripped: ${strip})`);
    assert.equal(hasConcurrent(fresh), true);
  }
});

test("ISS-REINGESTEJSON-007: a manifest with neither field whose correct id pre-existed with a turn: nothing of it is deleted", async () => {
  const dir = freshDir();
  const seed = seedWithSibling();
  seed.sessions.push(session(NEW, "2026-09-25"));
  seed.turns.push({ _id: "pre-new-t", sessionId: NEW, tenantId: T });
  const store = fakeStore(seed);
  const ref = store.bytes(COLLS);
  await replaceSessionRows(deps(store, dir, { ingest: async () => { store.state.dead = true; throw new Kill("killed"); } })).catch(() => {});
  const file = snapFile(dir);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  delete doc.manifest.plannedNewSessionIds;
  delete doc.manifest.preexistingSessionIds;
  writeFileSync(file, JSON.stringify(doc));
  const fresh = fakeStore(store.dump());
  await recoverAll(recoverDeps(fresh, dir));
  assert.deepEqual(fresh.bytes(COLLS), ref);
});

test("ISS-REINGESTEJSON-006: withWatchLock holds data/.watch.lock (the --ingest lock) for the run, refuses while another holder has it, and releases on success and on throw", async () => {
  const lockDir = freshDir();
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, ".watch.lock");
  const { acquireLock, releaseLock } = await import("./lock.mjs");
  let inside;
  await withWatchLock({ lockPath }, async () => {
    inside = acquireLock(lockPath); // what run-watch --ingest does
    assert.equal(inside.acquired, false, "an --ingest cannot take the lock while a reingest runs");
  });
  assert.equal(existsSync(lockPath), false, "released");
  assert.equal(acquireLock(lockPath).acquired, true); // --ingest running now
  let ran = false;
  await assert.rejects(withWatchLock({ lockPath }, async () => { ran = true; }), /holds .*not starting --reingest/);
  assert.equal(ran, false, "a reingest does not start while --ingest runs");
  assert.equal(existsSync(lockPath), true, "the refused reingest did not release the other holder's lock");
  releaseLock(lockPath);
  await assert.rejects(withWatchLock({ lockPath }, async () => { throw new Error("x"); }), /x/);
  assert.equal(existsSync(lockPath), false, "released after a throw");
});

// ---- ISS-REINGESTEJSON-005: the snapshot is READ BACK and verified before the first delete ----
const corruptions = {
  "truncated to 500 bytes": (p) => writeFileSync(p, readFileSync(p, "utf8").slice(0, 500)),
  "emptied": (p) => writeFileSync(p, ""),
  "one row's text changed (valid JSON, hash no longer matches)": (p) => writeFileSync(p, readFileSync(p, "utf8").replace("नमस्ते", "XXXXXX")),
  "a row dropped (count no longer matches)": (p) => { const d = JSON.parse(readFileSync(p, "utf8")); d.rows.turns.pop(); writeFileSync(p, JSON.stringify(d)); },
};
for (const [what, corrupt] of Object.entries(corruptions)) {
  test(`ISS-REINGESTEJSON-005: snapshot ${what} right after the write -> the run aborts with ZERO mutating calls and no snapshot is left`, async () => {
    const dir = freshDir();
    const store = fakeStore(seedWithSibling());
    const hook = (point, path) => { if (point === "after-rename") corrupt(path); };
    const err = await replaceSessionRows(deps(store, dir, snapshotHooks({ dir, hook }))).catch((e) => e);
    assert.ok(err instanceof Error && /snapshot .* (is unreadable|is corrupt|has an unknown format)/.test(err.message), `got: ${err?.message}`);
    assert.deepEqual(store.calls, [], "not a single delete/insert/update happened");
    assert.deepEqual(store.bytes(COLLS), refSib());
    assert.deepEqual(leftover(dir), [], "the bad snapshot is removed so the next run is not blocked by it");
  });
}

test("ISS-REINGESTEJSON-004: kill after turns of the planned new id were written but BEFORE its session row -> recovery removes them via the manifest's planned id; sibling intact", async () => {
  const dir = freshDir();
  const store = fakeStore(seedWithSibling());
  const dies = async () => { await store.scoped("turns")(T).insertMany([{ _id: "n1", sessionId: NEW }]); store.state.dead = true; throw new Kill("killed before the session row"); };
  await replaceSessionRows(deps(store, dir, { ingest: dies })).catch(() => {});
  const fresh = fakeStore(store.dump());
  assert.deepEqual((await recoverAll(recoverDeps(fresh, dir))).map((x) => x.action), ["restored"]);
  assert.deepEqual(fresh.bytes(COLLS), refSib());
});

test("ISS-REINGESTEJSON-006: runReingest takes data/.watch.lock (withWatchLock) BEFORE connecting or recovering, and the per-file lock only inside it", () => {
  const src = readFileSync(new URL("../watch-reingest.mjs", import.meta.url), "utf8");
  const run = src.slice(src.indexOf("export async function runReingest("), src.indexOf("async function reingestLocked("));
  const iWatch = run.indexOf("withWatchLock({ lockPath: LOCK_PATH }");
  assert.ok(iWatch > 0, "runReingest wraps its body in withWatchLock(LOCK_PATH)");
  assert.ok(iWatch < run.indexOf("watchDbTarget()"), "watch lock before any db connection");
  assert.ok(iWatch < run.indexOf("recoverAll("), "watch lock before startup recovery");
  assert.ok(run.indexOf("recoverAll(") < run.indexOf("withReingestLock("), "fixed order: watch lock -> recovery -> per-file lock");
});
