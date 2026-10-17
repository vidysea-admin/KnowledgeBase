// scripts/watch/lib/reingest-crash-sibling.test.mjs -- the ISS-REINGESTEJSON-004/-005/-006/-007 half of the reingest
// crash-replay suite (sibling forks, other writers, snapshot corruption). Split from reingest-crash.test.mjs at the
// 400-line test budget; the cases moved whole. Shared fixtures: ./reingest-crash-fixtures.mjs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownedNewSessionIds, replaceSessionRows } from "./reingest-swap.mjs";
import { recoverAll, snapshotHooks, withReingestLock, withWatchLock } from "./reingest-recover.mjs";
import { Kill, fakeStore } from "./reingest-fake.mjs";
import { T, OLD, NEW, DRIVE, COLLS, freshDir, session, seedOld, deps, recoverDeps, snapFile, leftover, STEPS, cleanup } from "./reingest-crash-fixtures.mjs";

after(cleanup);

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
