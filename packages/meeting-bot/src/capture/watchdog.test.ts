/**
 * packages/meeting-bot/src/capture/watchdog.test.ts — T-047. Pure decision-logic coverage
 * (decideWatchdogAction, all combinations of state/controller/obsStatus including the
 * ISS-T-047-CONTROLLER-001 "unknown" tri-state) plus orchestration (tickWatchdog) against fully
 * injected probes, plus the real `createGetObsStatus` wiring's error path against a fake OBS
 * client (no real OBS/Chrome/network anywhere in this file).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createGetObsStatus, decideWatchdogAction, tickWatchdog, type ObsStatusClient, type WatchdogProbes } from "./watchdog.js";
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

// --- decideWatchdogAction: pure function, exhaustive over state/controller/obsStatus --------

test("no state, OBS idle → noop-idle", () => {
  const action = decideWatchdogAction({ state: undefined, controllerAlive: false, obsStatus: "idle" });
  assert.deepEqual(action, { kind: "noop-idle" });
});

test("no state, OBS recording anyway → still noop-idle (no session info to finalize with)", () => {
  const action = decideWatchdogAction({ state: undefined, controllerAlive: false, obsStatus: "recording" });
  assert.deepEqual(action, { kind: "noop-idle" });
});

test("no state, OBS status unknown → still noop-idle", () => {
  const action = decideWatchdogAction({ state: undefined, controllerAlive: false, obsStatus: "unknown" });
  assert.deepEqual(action, { kind: "noop-idle" });
});

test("state present, controller alive, OBS recording → noop-active", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: true, obsStatus: "recording" });
  assert.deepEqual(action, { kind: "noop-active", state });
});

test("state present, controller alive, OBS not (yet) recording → still noop-active, trust the live controller", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: true, obsStatus: "idle" });
  assert.deepEqual(action, { kind: "noop-active", state });
});

test("state present, controller alive, OBS status unknown → still noop-active, trust the live controller", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: true, obsStatus: "unknown" });
  assert.deepEqual(action, { kind: "noop-active", state });
});

test("state present, controller dead, OBS recording → finalize (the T-047 failure case)", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: false, obsStatus: "recording" });
  assert.deepEqual(action, { kind: "finalize", state });
});

test("state present, controller dead, OBS not recording → stale-cleanup", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: false, obsStatus: "idle" });
  assert.deepEqual(action, { kind: "stale-cleanup", state });
});

test("ISS-T-047-CONTROLLER-001: state present, controller dead, OBS status UNKNOWN → noop-unknown, " +
  "NOT stale-cleanup (this is the exact bug: an unreachable OBS must never be treated as confirmed-idle)", () => {
  const state = sample();
  const action = decideWatchdogAction({ state, controllerAlive: false, obsStatus: "unknown" });
  assert.deepEqual(action, { kind: "noop-unknown", state });
});

// --- tickWatchdog: orchestration against injected probes ------------------------------------

interface Calls {
  finalized: RecordState[];
  cleared: number;
}

function fakeProbes(
  state: RecordState | undefined,
  controllerAlive: boolean,
  obsStatus: "recording" | "idle" | "unknown",
): { probes: WatchdogProbes; calls: Calls } {
  const calls: Calls = { finalized: [], cleared: 0 };
  const probes: WatchdogProbes = {
    readState: () => state,
    isControllerAlive: () => controllerAlive,
    getObsStatus: async () => obsStatus,
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
  const { probes, calls } = fakeProbes(state, false, "recording");
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "finalize");
  assert.deepEqual(calls.finalized, [state]);
  assert.equal(calls.cleared, 1);
});

test("tickWatchdog: dead controller + OBS not recording clears state without finalizing", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, false, "idle");
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "stale-cleanup");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 1);
});

test("ISS-T-047-CONTROLLER-001: tickWatchdog — dead controller + OBS status UNKNOWN neither finalizes " +
  "nor clears state (the state file, the one artifact recovery depends on, survives)", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, false, "unknown");
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "noop-unknown");
  assert.deepEqual(calls.finalized, [], "must never finalize on unconfirmed OBS status");
  assert.equal(calls.cleared, 0, "must never clear state on unconfirmed OBS status — that is the whole bug");
});

test("tickWatchdog: live controller never finalizes or clears state", async () => {
  const state = sample();
  const { probes, calls } = fakeProbes(state, true, "recording");
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "noop-active");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 0);
});

test("tickWatchdog: no state at all never finalizes or clears state", async () => {
  const { probes, calls } = fakeProbes(undefined, false, "recording");
  const action = await tickWatchdog(probes);
  assert.equal(action.kind, "noop-idle");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 0);
});

test("tickWatchdog: isControllerAlive is only consulted when a state file exists", async () => {
  let receivedState: RecordState | undefined | "not-called" = "not-called";
  const probes: WatchdogProbes = {
    readState: () => undefined,
    isControllerAlive: (state) => {
      receivedState = state;
      return true;
    },
    getObsStatus: async () => "idle",
    finalize: async () => {},
    clearState: () => {},
    log: () => {},
  };
  await tickWatchdog(probes);
  assert.equal(receivedState, "not-called", "isControllerAlive must not be called at all with no state to check");
});

test("ISS-T-047-CONTROLLER-002: tickWatchdog passes the FULL state (not just a bare pid) to " +
  "isControllerAlive, so the real wiring can detect pid-reuse via identity, not pid alone", async () => {
  const state = sample({ controllerStartedAt: "2026-09-24T10:00:00.000Z" });
  let receivedState: RecordState | undefined;
  const probes: WatchdogProbes = {
    readState: () => state,
    // Simulates the real isControllerAlive: process.kill(pid,0) succeeds (some process now holds
    // this recycled pid) but the recorded identity (controllerStartedAt) doesn't match the
    // process actually running under that pid today — so it must report NOT alive.
    isControllerAlive: (s) => {
      receivedState = s;
      return false;
    },
    getObsStatus: async () => "recording",
    finalize: async () => {},
    clearState: () => {},
    log: () => {},
  };
  const action = await tickWatchdog(probes);
  assert.deepEqual(receivedState, state, "isControllerAlive must receive the full state, including controllerStartedAt");
  assert.equal(action.kind, "finalize", "a pid-reuse mismatch must be treated as a dead controller, i.e. finalize when OBS is still recording");
});

// --- createGetObsStatus: the REAL production probe, tested via an injected fake OBS client ---

function fakeObsClient(behavior: { connect?: () => Promise<unknown>; outputActive?: boolean }): ObsStatusClient {
  return {
    connect: behavior.connect ?? (async () => undefined),
    call: async () => ({ outputActive: behavior.outputActive ?? false }),
    disconnect: async () => undefined,
  };
}

test("ISS-T-047-CONTROLLER-001: createGetObsStatus — the REAL probe returns 'unknown' (not 'idle') " +
  "when the injected OBS client factory's connect() throws", async () => {
  const getObsStatus = createGetObsStatus("ws://127.0.0.1:4455", "pw", () =>
    fakeObsClient({ connect: async () => { throw new Error("ECONNREFUSED"); } }));
  const status = await getObsStatus();
  assert.equal(status, "unknown");
});

test("createGetObsStatus — the REAL probe returns 'recording' when GetRecordStatus.outputActive is true", async () => {
  const getObsStatus = createGetObsStatus("ws://127.0.0.1:4455", "pw", () => fakeObsClient({ outputActive: true }));
  assert.equal(await getObsStatus(), "recording");
});

test("createGetObsStatus — the REAL probe returns 'idle' when GetRecordStatus.outputActive is false " +
  "(confirmed, not the same code path as a connect failure)", async () => {
  const getObsStatus = createGetObsStatus("ws://127.0.0.1:4455", "pw", () => fakeObsClient({ outputActive: false }));
  assert.equal(await getObsStatus(), "idle");
});

test("ISS-T-047-CONTROLLER-001 end-to-end: tickWatchdog wired with the REAL createGetObsStatus " +
  "(connect throws) + a dead controller keeps the state file, then a LATER tick where OBS resolves " +
  "'recording' finalizes — proving state survives the transient failure and recovery still completes", async () => {
  const state = sample();
  let stateOnDisk: RecordState | undefined = state;
  const calls: Calls = { finalized: [], cleared: 0 };

  const getObsStatusDown = createGetObsStatus("ws://127.0.0.1:4455", "pw", () =>
    fakeObsClient({ connect: async () => { throw new Error("websocket unreachable"); } }));
  const probesDown: WatchdogProbes = {
    readState: () => stateOnDisk,
    isControllerAlive: () => false, // controller confirmed dead throughout
    getObsStatus: getObsStatusDown,
    finalize: async (s) => { calls.finalized.push(s); },
    clearState: () => { stateOnDisk = undefined; calls.cleared++; },
    log: () => {},
  };

  const firstTick = await tickWatchdog(probesDown);
  assert.equal(firstTick.kind, "noop-unknown");
  assert.notEqual(stateOnDisk, undefined, "state file must survive a transient OBS-unreachable tick");
  assert.deepEqual(calls.finalized, []);
  assert.equal(calls.cleared, 0);

  // Later tick: OBS is reachable again and confirms it's still recording (the controller never
  // came back) — the SAME real createGetObsStatus function, now with a client that succeeds.
  const getObsStatusUp = createGetObsStatus("ws://127.0.0.1:4455", "pw", () => fakeObsClient({ outputActive: true }));
  const probesUp: WatchdogProbes = { ...probesDown, getObsStatus: getObsStatusUp };
  const secondTick = await tickWatchdog(probesUp);
  assert.equal(secondTick.kind, "finalize");
  assert.deepEqual(calls.finalized, [state]);
  assert.equal(calls.cleared, 1);
  assert.equal(stateOnDisk, undefined, "state is cleared only once recovery actually completes");
});
