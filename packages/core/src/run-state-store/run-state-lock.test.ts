import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { LockWorld, LOCK_FILE, LOCK_TEST_HOST, norm, type SimProc } from "./run-state-lock-kit.js";
import { FakeRunStateCrash } from "./run-state-fake-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const STALE = 30_000, CEIL = 3_600_000;
const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);
const errno = (c: string) => Object.assign(new Error(c), { code: c });

/** The process dies at the first op matching `pred` (that op does not complete). */
function dieAt(w: LockWorld, p: SimProc, pred: (op: string, arg: string) => boolean) {
  p.fs.beforeOp = (_n, op, arg) => { if (pred(op, arg)) { w.kill(p); throw new FakeRunStateCrash(`died at ${op}`); } };
}
/** ISS-RUNSTORE-001 recorded reproduction: a writer dies at the data rename while holding the lock, leaving lock + temp file. */
function crashedHolder(w: LockWorld, pid = 100): SimProc {
  const a = w.spawn(pid);
  dieAt(w, a, (op) => op === "rename");
  a.store.save("r1", null, st(1));
  const names = w.names();
  assert.ok(names.some((n) => n.endsWith(".run-state.lock")) && names.some((n) => n.endsWith(".tmp")), `setup: ${names}`);
  return a;
}
const only = (w: LockWorld) => w.names().filter((n) => !n.endsWith(".json"));

test("ISS-RUNSTORE-001 repro: after a crash while locked, a fresh instance gets `locked` before the bound and succeeds after it", () => {
  const w = new LockWorld();
  crashedHolder(w);
  const b = w.spawn(200, { isAlive: () => "unknown" }); // owner cannot be verified: only the age bound can free the lock
  assert.equal(code(b.store.save("r1", null, st(1))), "locked");
  w.advance(STALE);
  assert.equal(code(b.store.save("r1", null, st(1))), "locked", "exactly staleMs old is not yet stale");
  w.advance(1);
  assert.equal(code(b.store.save("r1", null, st(1))), "ok");
  assert.deepEqual(b.store.load("r1"), { ok: true, state: st(1) });
  assert.deepEqual(only(w), [], "lock and orphan temp are gone");
});

test("dead owner on this host: taken over at once at any age, orphan temp reaped, data preserved", () => {
  const w = new LockWorld();
  const a = w.spawn(100);
  assert.equal(code(a.store.save("r1", null, st(1))), "ok");
  dieAt(w, a, (op) => op === "rename");
  a.store.save("r1", st(1), st(2));
  const b = w.spawn(200);
  assert.deepEqual(b.store.load("r1"), { ok: true, state: st(1) }, "the torn write left the old state");
  assert.equal(code(b.store.save("r1", st(1), st(3))), "ok");
  assert.deepEqual(b.store.load("r1"), { ok: true, state: st(3) });
  assert.deepEqual(only(w), []);
});

test("a live owner is never taken over below the ceiling, whatever the lock's age; above it (pid reuse) it is", () => {
  const w = new LockWorld();
  const b = w.spawn(200);
  for (const age of [0, 1, STALE + 1, 10 * STALE, CEIL - 1, CEIL]) {
    const bytes = w.stageLock({ pid: 100, at: w.clock - age });
    assert.equal(code(b.store.save("r1", null, st(1))), "locked", `age ${age}`);
    assert.equal(w.lockBytes(), bytes, `age ${age}: lock untouched`);
  }
  w.stageLock({ pid: 100, at: w.clock - CEIL - 1 });
  assert.equal(code(b.store.save("r1", null, st(1))), "ok", "above the ceiling the pid is treated as reused");
});

test("pid reuse: the dead owner's pid now belongs to another live process; kept as live until the ceiling, then recovered", () => {
  const w = new LockWorld();
  crashedHolder(w);
  w.dead.delete(100); // the OS handed pid 100 to an unrelated process
  const b = w.spawn(200);
  assert.equal(code(b.store.save("r1", null, st(1))), "locked");
  w.advance(CEIL);
  assert.equal(code(b.store.save("r1", null, st(1))), "locked");
  w.advance(1);
  assert.equal(code(b.store.save("r1", null, st(1))), "ok");
  assert.deepEqual(only(w), []);
});

const HOSTILE: Array<[string, (w: LockWorld) => void]> = [
  ["empty lock (crash between create and write)", (w) => { w.files.set(LOCK_FILE, ""); }],
  ["unparsable lock", (w) => { w.files.set(LOCK_FILE, "{not json"); }],
  ["JSON array", (w) => { w.files.set(LOCK_FILE, "[1]"); }],
  ["pid as string", (w) => { w.files.set(LOCK_FILE, JSON.stringify({ token: "t1", pid: "100", host: LOCK_TEST_HOST, at: new Date(w.clock).toISOString() })); }],
  ["oversize lock", (w) => { w.files.set(LOCK_FILE, "x".repeat(5000)); }],
  ["owner on another host", (w) => { w.stageLock({ pid: 100, host: "elsewhere", at: w.clock }); }],
  ["other host with a future `at` (never reads as old)", (w) => { w.stageLock({ pid: 100, host: "elsewhere", at: w.clock + 3_600_000 }); }],
];
for (const [label, make] of HOSTILE) {
  test(`unverifiable owner, ${label}: aged by the file, never treated as free immediately`, () => {
    const w = new LockWorld();
    w.dirs.add("/r"); make(w); w.mtimes.set(LOCK_FILE, w.clock);
    const bytes = w.lockBytes();
    const b = w.spawn(200);
    assert.equal(code(b.store.save("r1", null, st(1))), "locked");
    w.advance(STALE);
    assert.equal(code(b.store.save("r1", null, st(1))), "locked");
    assert.equal(w.lockBytes(), bytes, "untouched while young");
    w.advance(1);
    assert.equal(code(b.store.save("r1", null, st(1))), "ok");
    assert.deepEqual(only(w), []);
  });
}

test("a probe that cannot decide (unknown) is an unverifiable owner; a lock that is a directory is never taken over", () => {
  const w = new LockWorld();
  const b = w.spawn(200, { isAlive: () => "unknown" });
  w.stageLock({ pid: 100 });
  w.advance(STALE);
  assert.equal(code(b.store.save("r1", null, st(1))), "locked");
  w.advance(1);
  assert.equal(code(b.store.save("r1", null, st(1))), "ok");
  w.files.delete(LOCK_FILE); w.dirs.add(LOCK_FILE);
  w.advance(100 * CEIL);
  assert.equal(code(b.store.save("r1", st(1), st(2))), "locked");
  assert.ok(w.dirs.has(LOCK_FILE));
});

test("a leftover lock of this very process is recovered after staleMs, not before", () => {
  const w = new LockWorld();
  const a = w.spawn(100);
  w.stageLock({ pid: 100 });
  assert.equal(code(a.store.save("r1", null, st(1))), "locked");
  w.advance(STALE + 1);
  assert.equal(code(a.store.save("r1", null, st(1))), "ok");
});

test("ISS-RUNSTORE-002: EPERM on lock creation is `locked` while the lock exists, retried while it is gone, io-error only when it persists", () => {
  const w = new LockWorld();
  const a = w.spawn(200);
  w.stageLock({ pid: 100 });
  a.fs.beforeOp = (_n, op, arg) => { if (op === "create" && arg === LOCK_FILE) throw errno("EPERM"); };
  for (const c of ["EPERM", "EACCES", "EBUSY"]) {
    a.fs.beforeOp = (_n, op, arg) => { if (op === "create" && arg === LOCK_FILE) throw errno(c); };
    assert.equal(code(a.store.save("r1", null, st(1))), "locked", c);
  }
  w.files.delete(LOCK_FILE);
  let n = 0;
  a.fs.beforeOp = (_x, op, arg) => { if (op === "create" && arg === LOCK_FILE && n++ < 2) throw errno("EPERM"); };
  assert.equal(code(a.store.save("r1", null, st(1))), "ok", "delete-pending twice, then free");
  a.fs.beforeOp = (_x, op, arg) => { if (op === "create" && arg === LOCK_FILE) throw errno("EACCES"); };
  assert.equal(code(a.store.save("r1", st(1), st(2))), "io-error", "a real permission problem is not contention");
  a.fs.beforeOp = (_x, op, arg) => { if (op === "create" && arg === LOCK_FILE) throw errno("EIO"); };
  assert.equal(code(a.store.save("r1", st(1), st(2))), "io-error");
});

test("a failed lock unlink after a successful save is surfaced as a warning, and the leftover is recovered later", () => {
  const w = new LockWorld();
  const a = w.spawn(100);
  a.fs.beforeOp = (_n, op, arg) => { if (op === "unlink" && arg === LOCK_FILE) throw errno("EPERM"); };
  const r = a.store.save("r1", null, st(1));
  assert.equal(r.ok, true);
  assert.match((r as { warning?: string }).warning ?? "", /could not be removed/);
  assert.ok(w.lockBytes());
  assert.equal(code(a.store.save("r1", st(1), st(2))), "locked");
  a.fs.beforeOp = null;
  w.advance(STALE + 1);
  assert.equal(code(a.store.save("r1", st(1), st(2))), "ok");
  let n = 0;
  a.fs.beforeOp = (_x, op, arg) => { if (op === "unlink" && arg === LOCK_FILE && n++ < 3) throw errno("EBUSY"); };
  const ok = a.store.save("r1", st(2), st(3));
  assert.deepEqual(ok, { ok: true }, "a transient unlink failure is retried and leaves no warning");
  assert.equal(w.lockBytes(), undefined);
});

test("a writer whose lock was taken over (stalled past the ceiling) refuses before the rename, writes nothing, leaves the new lock", () => {
  const w = new LockWorld();
  const a = w.spawn(100);
  assert.equal(code(a.store.save("r1", null, st(1))), "ok");
  const foreign = JSON.stringify({ token: "other-hold", pid: 300, host: LOCK_TEST_HOST, at: new Date(w.clock).toISOString() });
  a.fs.beforeOp = (_n, op) => { if (op === "fsync") { a.fs.beforeOp = null; w.files.set(LOCK_FILE, foreign); } };
  assert.equal(code(a.store.save("r1", st(1), st(2))), "locked");
  assert.equal(w.lockBytes(), foreign, "the other holder's lock is untouched");
  assert.deepEqual(a.store.load("r1"), { ok: true, state: st(1) });
  assert.ok(!w.names().some((n) => n.endsWith(".tmp")), "own temp removed");
});

test("orphan temp reaping: only this run's temp files (after a takeover AND, since ISS-RUNLOCK-003, whenever the lock is acquired)", () => {
  const w = new LockWorld();
  crashedHolder(w);
  const stray = ["r2.run-state.json.u1.tmp", "r1.run-state.json.a.b.tmp", "r1.run-state.jsonx.tmp", "r1.run-state.json..tmp", "r1.run-state.json.u1.txt"];
  for (const s of stray) w.files.set(path.join("/r", s), "x");
  const b = w.spawn(200);
  assert.equal(code(b.store.save("r1", null, st(1))), "ok");
  const left = w.names().map((n) => n.split("/").pop());
  assert.ok(!left.some((n) => n === "r1.run-state.lock" || /^r1\.run-state\.json\.p100-\d+\.tmp$/.test(n!)), `reaped: ${left}`);
  for (const s of stray) assert.ok(left.includes(s), `kept ${s}`);
  // a free lock (no takeover): since ISS-RUNLOCK-003 the holder reaps here too. A temp file can only exist while the lock is held, so one found
  // under OUR lock is a previous (dead or displaced) holder's; leaving it would let that holder's stalled rename land after our write.
  w.files.set(path.join("/r", "r1.run-state.json.live-1.tmp"), "x");
  assert.equal(code(b.store.save("r1", st(1), st(2))), "ok");
  assert.ok(!w.names().some((n) => n.endsWith("r1.run-state.json.live-1.tmp")), "orphan temp reaped under a freshly acquired lock");
  for (const s of stray) assert.ok(w.names().map((n) => n.split("/").pop()).includes(s), `still kept ${s}`);
});

test("an abandoned takeover claim of a dead taker does not block recovery; a live taker's claim does", () => {
  const w = new LockWorld();
  crashedHolder(w);
  w.dead.add(150);
  const token = JSON.parse(w.lockBytes()!).token as string;
  const claim = `${LOCK_FILE}.claim.${token}`;
  w.files.set(claim, JSON.stringify({ token: "c150", pid: 150, host: LOCK_TEST_HOST, at: new Date(w.clock).toISOString() })); w.mtimes.set(claim, w.clock);
  const b = w.spawn(200);
  assert.equal(code(b.store.save("r1", null, st(1))), "ok", "claimant 150 is dead");
  // second round: lock dead again, claim by a live process -> locked and the claim is left alone
  const w2 = new LockWorld();
  crashedHolder(w2);
  const tok2 = JSON.parse(w2.lockBytes()!).token as string;
  const claim2 = `${LOCK_FILE}.claim.${tok2}`;
  w2.files.set(claim2, JSON.stringify({ token: "c9", pid: 150, host: LOCK_TEST_HOST, at: new Date(w2.clock).toISOString() }));
  w2.mtimes.set(claim2, w2.clock);
  assert.equal(code(w2.spawn(200).store.save("r1", null, st(1))), "locked", "claimant 150 is alive: a taker is mid-takeover");
  assert.ok(w2.files.has(claim2));
  w2.dead.add(150);
  assert.equal(code(w2.spawn(201).store.save("r1", null, st(1))), "ok");
  assert.ok(!w2.names().some((n) => n.includes(".claim.")));
});

test("a taker that dies between creating its claim and renaming it leaves nothing that blocks the next save", () => {
  const w = new LockWorld();
  crashedHolder(w);
  const c = w.spawn(300);
  dieAt(w, c, (op, arg) => op === "rename" && norm(arg).endsWith(`-> ${norm(LOCK_FILE)}`));
  c.store.save("r1", null, st(1));
  assert.ok(w.names().some((n) => n.includes(".claim.")), "setup: abandoned claim");
  assert.equal(code(w.spawn(400).store.save("r1", null, st(1))), "ok");
  assert.deepEqual(only(w), []);
});

test("ISS-RUNSTORE-002 (read side, found by the real 3-process run): EPERM/EACCES/EBUSY reading a delete-pending lock is `locked`, never io-error, and nothing is taken over", () => {
  const w = new LockWorld();
  const a = w.spawn(200);
  const bytes = w.stageLock({ pid: 100 });
  w.advance(10 * CEIL);
  for (const c of ["EPERM", "EACCES", "EBUSY"]) {
    for (const op of ["readText", "mtime", "kind"]) {
      a.fs.beforeOp = (_n, o, arg) => { if (o === op && arg === LOCK_FILE) throw errno(c); };
      assert.equal(code(a.store.save("r1", null, st(1))), "locked", `${c} on ${op}`);
      assert.equal(w.lockBytes(), bytes, "never taken over on an unreadable lock");
    }
  }
});
