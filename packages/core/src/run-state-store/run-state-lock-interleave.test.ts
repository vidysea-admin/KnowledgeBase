import { test } from "node:test";
import assert from "node:assert/strict";
import { LockWorld, LOCK_FILE, norm, observeRenames, ownerPid, type SimProc } from "./run-state-lock-kit.js";
import { FakeRunStateCrash } from "./run-state-fake-fs.js";
import { runStateWithAttempt as st } from "./run-state-test-kit.js";

const DATA = norm("/r/r1.run-state.json");
const code = (r: { ok: boolean }) => (r.ok ? "ok" : (r as unknown as { code: string }).code);

/** A dead holder's lock + orphan temp: the recorded crash, staged by running a real writer that dies at the data rename. */
function deadHolderWorld(): LockWorld {
  const w = new LockWorld();
  const a = w.spawn(100);
  a.fs.beforeOp = (_n, op) => { if (op === "rename") { w.kill(a); throw new FakeRunStateCrash("died"); } };
  a.store.save("r1", null, st(1));
  return w;
}

interface Run { oks: number; takeovers: number; codes: string[]; w: LockWorld }
/** A (pid 200) and B (pid 300) both save `expected = null` against a dead holder's lock. `at(k)` fires B in the middle of A's k-th
 *  operation; if `bDiesAt` is set B dies at its own j-th operation. Asserts "never two holders" at every lock/data rename. */
function race(k: number, bDiesAt = -1): Run {
  const w = deadHolderWorld();
  const a = w.spawn(200), b = w.spawn(300);
  let takeovers = 0, violation = "";
  const watch = (pid: number, from: string, to: string) => {
    const t = norm(to);
    if (t === DATA) { if (ownerPid(w, LOCK_FILE) !== pid) violation ||= `pid ${pid} renamed the data file without holding the lock`; }
    else if (t === norm(LOCK_FILE)) { takeovers++; if (ownerPid(w, from) !== pid) violation ||= `pid ${pid} moved a claim it does not own`; }
  };
  let fired = false;
  observeRenames(b, watch, (n, op) => { if (n === bDiesAt) { w.kill(b); throw new FakeRunStateCrash(`B died at ${op}`); } });
  const codes: string[] = [];
  observeRenames(a, watch, (n) => {
    if (n === k && !fired) { fired = true; codes.push(`B:${code(b.store.save("r1", null, st(2)))}`); }
  });
  codes.push(`A:${code(a.store.save("r1", null, st(1)))}`);
  assert.equal(violation, "", `k=${k} bDiesAt=${bDiesAt}: ${violation}`);
  return { oks: codes.filter((c) => c.endsWith(":ok")).length, takeovers, codes, w };
}
function opsOfA(): number {
  const w = deadHolderWorld();
  const a = w.spawn(200);
  a.store.save("r1", null, st(1));
  return a.fs.opLog.length;
}
/** A process that dies between creating a lock/claim file and writing its owner leaves an EMPTY file: that is aged by mtime, so the
 *  next save may be `locked` for up to staleMs (bounded, never permanent). Any other leftover is recovered at once. */
function recovers(w: LockWorld, who: string) {
  const c: SimProc = w.spawn(400);
  const l = c.store.load("r1") as { ok: true; state: ReturnType<typeof st> | null };
  let r = c.store.save("r1", l.state, st(9));
  if (!r.ok) {
    assert.equal(code(r), "locked", who);
    const unowned = [...w.files.keys()].filter((p) => /.lock(.claim..+)?$/.test(norm(p)) && ownerPid(w, p) === undefined);
    assert.ok(unowned.length > 0, `${who}: blocked although every owner is dead and readable: ${w.names()}`);
    w.advance(30_001);
    r = c.store.save("r1", l.state, st(9));
  }
  assert.equal(r.ok, true, `${who}: ${JSON.stringify(r)}`);
  assert.deepEqual(w.names().filter((n) => !n.endsWith(".json")), [], `${who}: nothing left behind`);
}

test("two contenders for a dead holder's lock, B injected at EVERY operation of A: exactly one takeover, at most one winner, never two holders", () => {
  const n = opsOfA();
  assert.ok(n >= 12, `takeover is a multi-step protocol (saw ${n} ops)`);
  for (let k = 0; k <= n; k++) {
    const r = race(k);
    assert.equal(r.takeovers, 1, `k=${k}: ${r.codes}`);
    assert.equal(r.oks, 1, `k=${k}: ${r.codes}`);
    recovers(r.w, `k=${k}`);
  }
});

test("B dies at every one of its own operations while A is mid-takeover at every one of A's: A never holds with B, the next process recovers (at once, or after staleMs behind an empty file)", () => {
  const n = opsOfA();
  let cases = 0;
  for (let k = 0; k <= n; k++) {
    for (let j = 0; j <= n; j++) {
      const r = race(k, j);
      assert.ok(r.takeovers <= 2 && r.oks <= 1, `k=${k} j=${j}: ${r.codes}`);
      recovers(r.w, `k=${k} j=${j}`);
      cases++;
    }
  }
  assert.ok(cases > 150, `only ${cases} interleavings`);
});

test("a contender never moves, deletes or replaces a live holder's lock while racing a taker", () => {
  const w = new LockWorld();
  const holder = w.spawn(100);
  const gate: { hold?: () => void } = {};
  holder.fs.beforeOp = (_n, op) => { if (op === "fsync") gate.hold?.(); };
  const c = w.spawn(200), d = w.spawn(300);
  const seen: string[] = [];
  gate.hold = () => {
    const bytes = w.lockBytes();
    w.advance(3_600_000 - 1); // far older than staleMs, one ms below the ceiling
    seen.push(code(c.store.save("r1", null, st(2))), code(d.store.save("r1", null, st(3))));
    assert.equal(w.lockBytes(), bytes, "live lock untouched");
  };
  assert.equal(code(holder.store.save("r1", null, st(1))), "ok");
  assert.deepEqual(seen, ["locked", "locked"]);
});

const liveBody = (w: LockWorld, token: string, pid: number) => JSON.stringify({ token, pid, host: "test-host", at: new Date(w.clock).toISOString() });

test("a taker whose judged lock was replaced by a LIVE holder before its claim existed drops the claim and never displaces the live lock", () => {
  const w = deadHolderWorld();
  const a = w.spawn(200);
  const live = liveBody(w, "live-hold-1", 500);
  a.fs.beforeOp = (_n, op, arg) => {
    if (op === "create" && norm(arg).includes(".lock.claim.")) { a.fs.beforeOp = null; w.files.set(LOCK_FILE, live); w.mtimes.set(LOCK_FILE, w.clock); }
  };
  assert.equal(code(a.store.save("r1", null, st(1))), "locked");
  assert.equal(w.lockBytes(), live, "the live holder's lock is untouched");
  assert.ok(!w.names().some((n) => n.includes(".claim.")), "own claim dropped");
});

test("ownership after the claim rename is decided by the token: a taker whose claim was swapped for another taker's does not act as the holder", () => {
  const w = deadHolderWorld();
  const a = w.spawn(200);
  const theirs = liveBody(w, "taker-y-1", 500);
  a.fs.beforeOp = (_n, op, arg) => {
    if (op === "rename" && norm(arg).endsWith(`-> ${norm(LOCK_FILE)}`)) { a.fs.beforeOp = null; w.files.set(arg.split(" -> ")[0]!, theirs); }
  };
  const r = a.store.save("r1", null, st(1)) as { ok: boolean; code?: string; message?: string };
  assert.equal(r.code, "locked");
  assert.doesNotMatch(r.message ?? "", /taken over while this writer held it/, "refused as a non-holder, not as a displaced holder");
  assert.equal(w.lockBytes(), theirs, "the other taker's lock stands");
  assert.ok(w.names().some((n) => n.endsWith(".tmp")), "a non-holder reaps nothing");
});
