// user-accounts A4 (D-206) UA-23 / UA-24: the lockout state machine (5 failures in 15 min lock the email for 15 min, each further
// lock doubles up to 24 h, success or admin unlock clears it) and the in-memory windowed limiter behind the per-email limits.
// Pure functions with an injected clock; the HTTP-level 429 bodies are asserted in auth-router.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { applyFailure, BASE_LOCK_MS, createThrottle, createWindowLimiter, isLocked, LOCK_THRESHOLD, lockDurationMs, MAX_LOCK_MS, WINDOW_MS, type ThrottleState, type ThrottleStore } from "./throttle.js";

const T0 = Date.parse("2026-11-01T00:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms);

test("lock duration doubles from 15 min and is capped at 24 h (UA-24)", () => {
  assert.equal(BASE_LOCK_MS, 15 * 60_000);
  assert.deepEqual([1, 2, 3, 4].map(lockDurationMs), [15, 30, 60, 120].map((m) => m * 60_000));
  assert.equal(lockDurationMs(7), 960 * 60_000);
  assert.equal(lockDurationMs(8), MAX_LOCK_MS, "1920 min is capped to 24 h");
  assert.equal(lockDurationMs(64), MAX_LOCK_MS);
  assert.equal(lockDurationMs(0), BASE_LOCK_MS, "never below the base");
});

test("4 failures do not lock, the 5th does, for exactly 15 min; the next lock is 30 min (A4 #4)", () => {
  let row: ThrottleState | null = null;
  for (let i = 1; i < LOCK_THRESHOLD; i++) { const r = applyFailure(row, at(i * 1000)); assert.equal(r.locked, false, `failure ${i}`); row = r.next; }
  assert.equal(row!.failures, 4); assert.equal(isLocked(row, at(5000)), false);
  const fifth = applyFailure(row, at(5000));
  assert.equal(fifth.locked, true); assert.equal(fifth.next.lockCount, 1);
  assert.equal(Date.parse(fifth.next.lockedUntil!), T0 + 5000 + 15 * 60_000);
  assert.equal(isLocked(fifth.next, at(5000 + 15 * 60_000 - 1)), true);
  assert.equal(isLocked(fifth.next, at(5000 + 15 * 60_000)), false, "the lock ends at lockedUntil");
  // after the lock expires a fresh window starts: 5 more failures lock again, for twice as long
  let again: ThrottleState = fifth.next; const t1 = 5000 + 15 * 60_000 + 1000;
  for (let i = 0; i < LOCK_THRESHOLD; i++) again = applyFailure(again, at(t1 + i)).next;
  assert.equal(again.lockCount, 2); assert.equal(Date.parse(again.lockedUntil!), T0 + t1 + 4 + 30 * 60_000);
});

test("failures outside the 15 min window do not accumulate (UA-24)", () => {
  let row: ThrottleState | null = null;
  for (let i = 0; i < 4; i++) row = applyFailure(row, at(i * 1000)).next;
  const late = applyFailure(row, at(WINDOW_MS + 10_000));
  assert.equal(late.locked, false); assert.equal(late.next.failures, 1, "the window restarted");
});

test("a failure while locked changes nothing: the lock is not extended by hammering (UA-24)", () => {
  let row: ThrottleState | null = null;
  for (let i = 0; i < LOCK_THRESHOLD; i++) row = applyFailure(row, at(i)).next;
  const during = applyFailure(row, at(60_000));
  assert.deepEqual(during.next, row); assert.equal(during.locked, false);
});

/** In-memory ThrottleStore with the same compare-and-set contract as the Mongo one; `lag` makes every read yield, so parallel callers interleave. */
function casStore(rows: Map<string, ThrottleState>, lag = false): ThrottleStore {
  const key = (t: string, h: string) => `${t}|${h}`;
  return {
    get: async (t, h) => { const r = rows.get(key(t, h)); if (lag) await new Promise((x) => setImmediate(x)); return r ? { ...r } : null; },
    put: async (t, h, next, prev) => {
      const cur = rows.get(key(t, h)) ?? null;
      if (JSON.stringify(cur) !== JSON.stringify(prev)) return false;
      rows.set(key(t, h), { ...next }); return true;
    },
    clear: async (t, h) => { rows.delete(key(t, h)); },
  };
}

test("createThrottle: check / fail / clear over a store; clear removes the lock (success and admin unlock)", async () => {
  const rows = new Map<string, ThrottleState>();
  const store: ThrottleStore = casStore(rows);
  let now = at(0); const th = createThrottle({ store, now: () => now });
  const h = "a".repeat(64);
  assert.equal(await th.isLocked("tA", h), false);
  for (let i = 0; i < LOCK_THRESHOLD - 1; i++) assert.equal((await th.fail("tA", h)).newlyLocked, false);
  assert.equal((await th.fail("tA", h)).newlyLocked, true);
  assert.equal(await th.isLocked("tA", h), true);
  assert.equal(await th.isLocked("tB", h), false, "tenant scoped");
  await th.clear("tA", h);
  assert.equal(await th.isLocked("tA", h), false); assert.equal(rows.size, 0);
  now = at(1000); await th.fail("tA", h); assert.equal(rows.get(`tA|${h}`)!.failures, 1, "counting restarts after a clear");
});

test("window limiter: allows max per window, then refuses; the window slides; keys are independent", () => {
  let now = 0; const lim = createWindowLimiter({ max: 3, windowMs: 1000, now: () => now });
  assert.deepEqual([lim.hit("a"), lim.hit("a"), lim.hit("a"), lim.hit("a")], [true, true, true, false]);
  assert.equal(lim.hit("b"), true, "another key is unaffected");
  now = 999; assert.equal(lim.hit("a"), false);
  now = 1001; assert.equal(lim.hit("a"), true, "the window has passed");
  assert.equal(lim.size() <= 2, true);
});

test("A4 #4 createThrottle: 12 PARALLEL wrong-password attempts still lock after exactly 5 counted failures (compare-and-set, no lost updates); exactly one attempt starts the lock", async () => {
  const rows = new Map<string, ThrottleState>(); const th = createThrottle({ store: casStore(rows, true), now: () => at(0) }); const h = "b".repeat(64);
  const results = await Promise.all(Array.from({ length: 12 }, () => th.fail("tA", h)));
  assert.equal(results.filter((r) => r.newlyLocked).length, 1);
  assert.equal(await th.isLocked("tA", h), true);
  assert.equal(rows.get(`tA|${h}`)!.lockCount, 1, "one lock, not several");
});
