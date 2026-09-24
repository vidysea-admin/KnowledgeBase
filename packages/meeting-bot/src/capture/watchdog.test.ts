/**
 * packages/meeting-bot/src/capture/watchdog.test.ts — T-047. Pure decision-logic coverage
 * (decideWatchdogAction, all 6 reachable state/controller/OBS combinations) plus orchestration
 * (tickWatchdog) against fully injected probes — no real OBS/Chrome anywhere in this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { decideWatchdogAction, tickWatchdog, type WatchdogProbes } from "./watchdog.js";
import type { RecordState } from "./controller-state.js";

function sample(overrides: Partial<RecordState> = {}): RecordState {
  return {
    pid: 4242,
    sessionId: "2026-09-24-test-webinar",
    title: "Test Webinar",
    platform: "zoho",
    until: "2026-09-24T11:00:00.000Z",
    obsOutputDir: "C:\\raw\\webinars",
    startedAt: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

// --- decideWatchdogAction: pure function, exhaustive over the 3 booleans/state axis --------

test("no state, OBS idle → noop-idle", () => {
  const action = decideWatchdogAction({ state: undefined, controllerAlive: false, obsRecording: false });
  assert.deepEqual(action, { kind: "noop-idle" });
});

test("no state, OBS recording anyway → still noop-idle (no session info to finalize with)", () => {
  const action = decideWatchdogAction({ state: undefined, controllerAlive: false, obsRecording: true });
  assert.deepEqual(action, { kind: "noop-idle" });
});

test("state present, controller alive, OBS recording → noop-active", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: true, obsRecording: true });
  assert.deepEqual(action, { kind: "noop-active", state });
});

test("state present, controller alive, OBS not (yet) recording → still noop-active, trust the live controller", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: true, obsRecording: false });
  assert.deepEqual(action, { kind: "noop-active", state });
});

test("state present, controller dead, OBS recording → finalize (the T-047 failure case)", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: false, obsRecording: true });
  assert.deepEqual(action, { kind: "finalize", state });
});

test("state present, controller dead, OBS not recording → stale-cleanup", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: false, obsRecording: false });
  assert.deepEqual(action, { kind: "stale-cleanup", state });
});

// --- tickWatchdog: orchestration against injected probes ------------------------------------

interface Calls {
  finalized: RecordState[];
  cleared: number;
}

function fakeProbes(state: RecordState | undefined, controllerAlive: boolean, obsRecording: boolean): {
  probes: WatchdogProbes;
  calls: Calls;
} {
  const calls: Calls = { finalized: [], cleared: 0 };
  const probes: WatchdogProbes = {
    readState: () => state,
    isControllerAlive: () => controllerAlive,
    isObsRecording: async () => obsRecording,
    finalize: async (s) => {
      calls.finalized.push(s);
    },
    clearState: () => {
      calls.cleared++;
    },
    log: () => {},
  };
  return { probes, calls };
}

test("tickWatchdog: dead controller + OBS recording calls finalize once, then clears state", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, false, true);
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "finalize");
  assert.deepEqual(calls.finalized, [state]);
  assert.equal(calls.cleared, 1);
});

test("tickWatchdog: dead controller + OBS not recording clears state without finalizing", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, false, false);
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "stale-cleanup");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 1);
});

test("tickWatchdog: live controller never finalizes or clears state", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, true, true);
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "noop-active");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 0);
});

test("tickWatchdog: no state at all never finalizes or clears state", async () => {
  const { probes, calls } = fakeProbes(undefined, false, true);
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "noop-idle");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 0);
});

test("tickWatchdog: isControllerAlive is only consulted when a state file exists", async () => {
  let calledWithPid: number | undefined;
  const probes: WatchdogProbes = {
    readState: () => undefined,
    isControllerAlive: (pid) => {
      calledWithPid = pid;
      return true;
    },
    isObsRecording: async () => false,
    finalize: async () => {},
    clearState: () => {},
    log: () => {},
  };
  await tickWatchdog(probes);
  assert.equal(calledWithPid, undefined, "isControllerAlive must not be called with no state to read a pid from");
});
