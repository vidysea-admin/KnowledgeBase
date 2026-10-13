// scripts/watch/lib/reingest-crash.test.mjs — iss-reingestsafe-001-004-typed-snapshot-replay.
// Crash-replay: the "process" is killed after the Nth mutating step (the fake then throws Kill on EVERY later
// call, so no in-process compensation can run, exactly like kill -9); a FRESH fake built from the dead
// process's stored BSON bytes then runs startup recovery against the real snapshot file in a temp dir.
// Proven only against the in-memory BSON-bytes fake; never against a real MongoDB.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { replaceSessionRows } from "./reingest-swap.mjs";
import { recoverAll, recoverSnapshot, snapshotHooks, withReingestLock } from "./reingest-recover.mjs";
import { listSnapshots, snapshotPaths } from "./reingest-snapshot.mjs";
import { Kill, fakeStore } from "./reingest-fake.mjs";
import { treeIndexRootFilter } from "../../../packages/index/src/tree/build.ts";
import { T, OLD, NEW, DRIVE, COLLS, root, freshDir, session, seedOld, ingestFor, deps, recoverDeps, hasNode, snapFile, leftover, reference, runKilled, STEPS, cleanup } from "./reingest-crash-fixtures.mjs";

after(cleanup);


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
