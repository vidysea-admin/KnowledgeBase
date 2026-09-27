/**
 * packages/meeting-bot/src/capture/obs-guard.test.ts — T-032. Drives every branch of
 * ensureObsReady with fully injected fakes: no real OBS process, websocket or filesystem.
 * The three contractual scenarios from docs/meeting-bot-roadmap.md:47:
 *   1. not-running → launch → connect OK
 *   2. websocket-down (Safe Mode) → graceful close → relaunch → OK
 *   3. never-comes-up → clear error, no force-kill call ever made
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import path from "node:path";

import { ensureObsReady, type ObsGuardProbes } from "./obs-guard.js";
import { launchObsNormally, type ObsBrowserConfig } from "./obs-windows.js";

interface Calls {
  isObsRunningCalls: number;
  connectAttempts: number;
  gracefulCloseCalls: number;
  sentinelClears: number;
  launchCalls: number;
  forceKillCalls: number;
  sleeps: number[];
  logs: string[];
}

function newCalls(): Calls {
  return {
    isObsRunningCalls: 0,
    connectAttempts: 0,
    gracefulCloseCalls: 0,
    sentinelClears: 0,
    launchCalls: 0,
    forceKillCalls: 0,
    sleeps: [],
    logs: [],
  };
}

/** Builds fakes for a scenario. `connectBehavior` returns whether the Nth connect attempt (1-based)
 * should succeed. `runningBehavior` returns whether OBS is "running" the Nth time it's checked. */
function fakeProbes(opts: {
  connectSucceedsFrom?: number; // attempt number (1-based) that starts succeeding; undefined = never
  isRunningSequence?: boolean[]; // consumed in order, last value repeats once exhausted
  launchFails?: Error; // ISS-337: the spawn fails asynchronously with this error
}): { probes: ObsGuardProbes; calls: Calls } {
  const calls = newCalls();
  const isRunningSeq = opts.isRunningSequence ?? [false];

  const probes: ObsGuardProbes = {
    isObsRunning: () => {
      const i = Math.min(calls.isObsRunningCalls, isRunningSeq.length - 1);
      calls.isObsRunningCalls++;
      return isRunningSeq[i] ?? false;
    },
    connectWebsocket: async () => {
      calls.connectAttempts++;
      const ok = opts.connectSucceedsFrom !== undefined && calls.connectAttempts >= opts.connectSucceedsFrom;
      if (!ok) throw new Error("ECONNREFUSED");
    },
    requestGracefulClose: async () => {
      calls.gracefulCloseCalls++;
    },
    clearShutdownSentinel: () => {
      calls.sentinelClears++;
    },
    launchObs: (onError) => {
      calls.launchCalls++;
      // ISS-337: mimic the real async spawn 'error' event — it arrives AFTER launchObs returns.
      if (opts.launchFails) setTimeout(() => onError?.(opts.launchFails as Error), 0);
    },
    forceKillObs: () => {
      calls.forceKillCalls++;
      throw new Error("test: forceKillObs must never be invoked");
    },
    sleep: async (ms: number) => {
      calls.sleeps.push(ms);
      // Yield for real. A sleep that resolves synchronously lets the backoff outrun an async
      // spawn 'error' event, which no real 3s sleep ever would (ISS-337).
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    log: (msg: string) => {
      calls.logs.push(msg);
    },
  };
  return { probes, calls };
}

// --- fast path: already reachable, no recovery at all ----------------------------------------

test("ensureObsReady: websocket already reachable → no recovery, no launch, no close", async () => {
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: 1 });
  await ensureObsReady(probes);
  assert.equal(calls.connectAttempts, 1);
  assert.equal(calls.launchCalls, 0);
  assert.equal(calls.gracefulCloseCalls, 0);
  assert.equal(calls.sentinelClears, 0);
  assert.equal(calls.forceKillCalls, 0);
});

// --- scenario 1: not-running → launch → connect OK --------------------------------------------

test("ensureObsReady: OBS not running → launches (no graceful close), then connects on the first retry", async () => {
  // attempt 1: pre-flight connect fails. attempt 2 (post-launch, first backoff try): succeeds.
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: 2, isRunningSequence: [false] });
  await ensureObsReady(probes);
  assert.equal(calls.gracefulCloseCalls, 0, "OBS was never running — no reason to close it");
  assert.equal(calls.sentinelClears, 1, "sentinel is always cleared before a fresh launch");
  assert.equal(calls.launchCalls, 1);
  assert.equal(calls.connectAttempts, 2);
  assert.equal(calls.forceKillCalls, 0);
  assert.ok(calls.logs.some((l) => l.includes("not running")));
});

// --- scenario 2: websocket-down (Safe Mode) → graceful close → relaunch → OK ------------------

test("ensureObsReady: OBS running but unreachable (Safe Mode) → graceful close, wait for exit, relaunch, connect", async () => {
  // isObsRunning: true when checked before close, then false on the very next poll (process exited).
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: 2, isRunningSequence: [true, false] });
  await ensureObsReady(probes);
  assert.equal(calls.gracefulCloseCalls, 1, "Safe-Mode OBS must be asked to close gracefully");
  assert.equal(calls.sentinelClears, 1);
  assert.equal(calls.launchCalls, 1);
  assert.equal(calls.connectAttempts, 2);
  assert.equal(calls.forceKillCalls, 0);
  assert.equal(calls.sleeps.length, 1, "the wait-for-exit poll should stop as soon as isObsRunning reports false");
  assert.ok(calls.logs.some((l) => l.includes("Safe Mode")));
});

test("ensureObsReady: graceful close requested but OBS never reports stopped → still launches anyway (bounded wait)", async () => {
  // isObsRunning always true: the bounded wait exhausts, then the guard proceeds to launch anyway.
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: 2, isRunningSequence: [true] });
  await ensureObsReady(probes);
  assert.equal(calls.gracefulCloseCalls, 1);
  assert.equal(calls.launchCalls, 1, "must launch even if the wait timed out — never force-kill instead");
  assert.equal(calls.forceKillCalls, 0);
  assert.ok(calls.sleeps.length >= 10, "the bounded wait must exhaust its full schedule before giving up");
});

// --- scenario 3: never-comes-up → clear error, no force-kill call ever made -------------------

test("ensureObsReady: websocket never comes up after a guarded restart → throws a clear error, never force-kills", async () => {
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: undefined, isRunningSequence: [false] });
  await assert.rejects(() => ensureObsReady(probes), /never came up|no force-kill/i);
  assert.equal(calls.forceKillCalls, 0, "the guard must never call forceKillObs, even when it gives up entirely");
  assert.equal(calls.launchCalls, 1);
  assert.ok(calls.sleeps.length >= 10, "must exhaust the full ~30s backoff before giving up");
});

test("ensureObsReady: never-comes-up from the Safe-Mode branch also never force-kills", async () => {
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: undefined, isRunningSequence: [true, false] });
  await assert.rejects(() => ensureObsReady(probes));
  assert.equal(calls.forceKillCalls, 0);
  assert.equal(calls.gracefulCloseCalls, 1);
});

// --- ISS-337: a spawn failure must be reported, not crash the controller ------------------------
// The two cases below are ISS-337's own recorded reproductions, quoted from its ledger row:
//   (a) point cfg.obsExe at a nonexistent path and confirm ensureObsReady rejects with a named
//       error instead of the process crashing;
//   (b) confirm the existing OBS-reachable happy path is unaffected.

test("ISS-337(a): a spawn failure makes ensureObsReady reject with a NAMED error, not crash", async () => {
  const { probes, calls } = fakeProbes({
    launchFails: new Error("spawn C:\nope\obs64.exe ENOENT"),
    // never connects: without the fix the generic websocket message would be all the operator gets
  });
  await assert.rejects(
    () => ensureObsReady(probes),
    (err: Error) => {
      // the spawn error itself must reach the message - "websocket never came up" names the wrong
      // subsystem, which is the diagnosis failure ISS-324 was also about
      assert.match(err.message, /ENOENT/);
      assert.match(err.message, /OBS_EXE/);
      assert.doesNotMatch(err.message, /websocket never came up/);
      return true;
    },
  );
  assert.equal(calls.forceKillCalls, 0);
  // it must also give up as soon as the launch is known to have failed rather than burning the
  // whole 10x3s backoff waiting for a process that was never started
  assert.ok(calls.sleeps.length <= 2, `expected an early give-up, slept ${calls.sleeps.length} times`);
  assert.ok(calls.logs.some((m) => m.includes("OBS failed to start")), "the failure must be logged");
});

test("ISS-337(b): the happy path is unaffected - a successful launch still connects normally", async () => {
  const { probes, calls } = fakeProbes({ connectSucceedsFrom: 2 });
  await ensureObsReady(probes); // must not throw
  assert.equal(calls.launchCalls, 1);
  assert.equal(calls.forceKillCalls, 0);
  assert.ok(!calls.logs.some((m) => m.includes("OBS failed to start")));
});

test("ISS-337: the real launchObsNormally reports a bad obsExe instead of throwing an unhandled event", async () => {
  // Exercises the REAL spawn. Removing child.on("error", ...) makes this fail as an unhandled
  // 'error' event, which is the defect; a fake callback could not show that.
  const errors: Error[] = [];
  launchObsNormally(
    { obsExe: path.join("C:", "definitely-not-here", "obs64.exe") } as unknown as ObsBrowserConfig,
    (e) => errors.push(e),
  );
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(errors.length, 1, "the spawn error must be delivered to the callback");
  const delivered = errors[0];
  assert.ok(delivered, "errors[0] must exist once the length assertion above holds");
  assert.match(delivered.message, /ENOENT|EACCES|spawn/);
});

