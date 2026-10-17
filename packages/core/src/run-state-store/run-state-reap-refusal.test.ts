/** ISS-RUNLOCK-003 / ISS-RUNREV-001: a save whose reap of the previous holder's orphan temp file fails REFUSES (nothing written). */
import { test } from "node:test";
import path from "node:path";
import assert from "node:assert/strict";
import { LockWorld, norm, type SimProc } from "./run-state-lock-kit.js";
import { REAP_RETRY_MS } from "./run-state-lock.js";
import { RUN_STATE_FORMAT } from "./run-state-store.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);
const K = (n: string) => path.join("/r", n); // the fake's own key spelling (backslashes on Windows)
const TMP = K("r1.run-state.json.dead-1.tmp");
const DATA = K("r1.run-state.json");
const dataKey = (w: LockWorld) => [...w.files.keys()].find((k) => norm(k) === norm(DATA));
const stored = (w: LockWorld) => { const k = dataKey(w); return k ? JSON.parse(w.files.get(k)!).state : undefined; };
const debris = (w: LockWorld) => w.names().filter((n) => !n.endsWith("r1.run-state.json"));
const envelope = (n: number) => `${JSON.stringify({ format: RUN_STATE_FORMAT, runId: "r1", state: st(n) })}\n`;

/** A crashed holder (pid 100, dead) left its lock, an orphan temp file and the data file at revision 1. */
function crashedWithOrphan(w: LockWorld) {
  w.stageLock({ pid: 100 });
  w.files.set(TMP, "half");
  w.files.set(DATA, envelope(1));
  w.mtimes.set(DATA, w.clock);
  w.dead.add(100);
}
const failUnlink = (p: SimProc, failures: { code: string; times?: number }, log: string[] = []) => {
  const real = p.fs.unlink.bind(p.fs);
  let left = failures.times ?? Infinity;
  p.fs.unlink = (path: string) => {
    if (norm(path).endsWith(".tmp") && left > 0) { left--; log.push(path); throw Object.assign(new Error(failures.code), { code: failures.code }); }
    real(path);
  };
};

test("dead holder, orphan temp that stays undeletable (EACCES): io-error within the retry budget, no spin, nothing written, lock released; recovers once it can be removed", () => {
  const w = new LockWorld(); crashedWithOrphan(w);
  const b = w.spawn(200); const attempts: string[] = []; failUnlink(b, { code: "EACCES" }, attempts);
  const t0 = w.clock;
  assert.equal(code(b.store.save("r1", st(1), st(2))), "io-error");
  assert.ok(w.clock - t0 <= REAP_RETRY_MS + 200, `bounded wait: ${w.clock - t0} ms`);
  assert.ok(attempts.length >= 2 && attempts.length < 500, `retried then gave up: ${attempts.length}`);
  assert.deepEqual(stored(w), st(1), "nothing written");
  assert.deepEqual(debris(w), [norm(TMP)], "only the orphan remains: lock released");
  assert.equal(code(w.spawn(300).store.save("r1", st(1), st(2))), "ok", "the next save, with the file removable, recovers");
  assert.deepEqual(stored(w), st(2));
  assert.deepEqual(debris(w), []);
});

test("EPERM/EBUSY that outlasts the retry budget: `conflict` (something still holds the file), nothing written", () => {
  for (const c of ["EPERM", "EBUSY"]) {
    const w = new LockWorld(); crashedWithOrphan(w);
    const b = w.spawn(200); failUnlink(b, { code: c });
    assert.equal(code(b.store.save("r1", st(1), st(2))), "conflict", c);
    assert.deepEqual(stored(w), st(1));
    assert.deepEqual(debris(w), [norm(TMP)]);
  }
});

test("transient EPERM/EACCES/EBUSY that clears within the budget: the reap succeeds and the save is ok", () => {
  for (const c of ["EPERM", "EACCES", "EBUSY"]) {
    const w = new LockWorld(); crashedWithOrphan(w);
    const b = w.spawn(200); const attempts: string[] = []; failUnlink(b, { code: c, times: 4 }, attempts);
    assert.equal(code(b.store.save("r1", st(1), st(2))), "ok", c);
    assert.equal(attempts.length, 4);
    assert.deepEqual(stored(w), st(2));
    assert.deepEqual(debris(w), []);
  }
});

test("a non-transient unlink failure (EISDIR, EIO, EROFS) is io-error at once: one attempt, no retry", () => {
  for (const c of ["EISDIR", "EIO", "EROFS"]) {
    const w = new LockWorld(); crashedWithOrphan(w);
    const b = w.spawn(200); const attempts: string[] = []; failUnlink(b, { code: c }, attempts);
    const t0 = w.clock;
    assert.equal(code(b.store.save("r1", st(1), st(2))), "io-error", c);
    assert.equal(attempts.length, 1, c);
    assert.ok(w.clock - t0 < 100, "no waiting");
    assert.deepEqual(stored(w), st(1));
  }
});

test("an unlink that errors but leaves the file gone (delete-pending that completed) counts as reaped", () => {
  const w = new LockWorld(); crashedWithOrphan(w);
  const b = w.spawn(200); const real = b.fs.unlink.bind(b.fs);
  b.fs.unlink = (p: string) => { real(p); if (norm(p).endsWith(".tmp")) throw Object.assign(new Error("EPERM"), { code: "EPERM" }); };
  assert.equal(code(b.store.save("r1", st(1), st(2))), "ok");
  assert.deepEqual(debris(w), []);
});

test("a reap that cannot even list the directory refuses with io-error (nothing written)", () => {
  const w = new LockWorld(); crashedWithOrphan(w);
  const b = w.spawn(200);
  b.fs.listDir = () => { throw Object.assign(new Error("EIO"), { code: "EIO" }); };
  assert.equal(code(b.store.save("r1", st(1), st(2))), "io-error");
  assert.deepEqual(stored(w), st(1));
});

/** A stalls ON its data rename past the live ceiling; B takes over; the reap fails (B refuses); then C tries. */
test("after B refused and released, a third writer C does not write past the still-unremovable temp (the reap runs on every acquisition); when it is removable C reaps it and A's rename fails instead", () => {
  for (const removable of [false, true]) {
    const w = new LockWorld();
    const a = w.spawn(200), b = w.spawn(300), c = w.spawn(400);
    failUnlink(b, { code: "EPERM" });
    if (!removable) failUnlink(c, { code: "EPERM" });
    assert.equal(code(a.store.save("r1", null, st(1))), "ok");
    const out: string[] = [];
    let wrote = false, fired = false;
    a.fs.beforeOp = (_n, op, arg) => {
      if (op === "create" && norm(arg).endsWith(".tmp")) wrote = true;
      if (wrote && !fired && op === "rename" && norm(arg).includes(".tmp -> ")) {
        fired = true; w.advance(3_700_000);
        out.push(`B:${code(b.store.save("r1", st(1), st(2)))}`, `C:${code(c.store.save("r1", st(1), st(3)))}`);
      }
    };
    const ares = code(a.store.save("r1", st(1), st(5)));
    if (!removable) {
      assert.deepEqual(out, ["B:conflict", "C:conflict"]);
      assert.equal(ares, "ok");
      assert.deepEqual(stored(w), st(5), "only A's save was ever acknowledged");
    } else {
      assert.deepEqual(out, ["B:conflict", "C:ok"]);
      assert.equal(ares, "io-error", "A's temp was reaped: its rename fails");
      assert.deepEqual(stored(w), st(3), "C's acknowledged save survives");
    }
    assert.deepEqual(debris(w), []);
  }
});

test("a live same-host holder is never displaced below 1 h: `locked`, and its temp file is untouched", () => {
  const w = new LockWorld();
  w.stageLock({ pid: 100 }); // alive: not in w.dead
  w.files.set(DATA, envelope(1)); w.mtimes.set(DATA, w.clock);
  w.files.set(TMP, "live");
  const b = w.spawn(200); failUnlink(b, { code: "EPERM" });
  w.advance(59 * 60_000);
  assert.equal(code(b.store.save("r1", st(1), st(2))), "locked");
  assert.ok(w.files.has(TMP), "no lock, no reap");
});
