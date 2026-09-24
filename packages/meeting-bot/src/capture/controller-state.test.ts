/**
 * packages/meeting-bot/src/capture/controller-state.test.ts — T-047. No real OBS/Chrome: only
 * filesystem round-trips against a throwaway temp dir and process.pid/an invalid pid for
 * isPidAlive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  controllerMatchesIdentity,
  getProcessStartTime,
  isControllerAlive,
  isPidAlive,
  readControllerState,
  removeControllerState,
  stateFilePath,
  writeControllerState,
  type RecordState,
} from "./controller-state.js";

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), "lkb-controller-state-"));
}

function sample(overrides: Partial<RecordState> = {}): RecordState {
  return {
    pid: 12345,
    sessionId: "2026-09-24-test-webinar",
    title: "Test Webinar",
    platform: "zoho",
    until: "2026-09-24T11:00:00.000Z",
    obsOutputDir: "C:\\raw\\webinars",
    startedAt: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

test("readControllerState returns undefined when no file was ever written", () => {
  const dir = tmpDir();
  try {
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write then read round-trips the same state", () => {
  const dir = tmpDir();
  try {
    const state = sample();
    writeControllerState(dir, state);
    assert.deepEqual(readControllerState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write then read round-trips controllerStartedAt (ISS-T-047-CONTROLLER-002's identity marker)", () => {
  const dir = tmpDir();
  try {
    const state = sample({ controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
    writeControllerState(dir, state);
    assert.deepEqual(readControllerState(dir), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readControllerState returns undefined for corrupt JSON rather than throwing", () => {
  const dir = tmpDir();
  try {
    writeFileSync(stateFilePath(dir), "{ not valid json");
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readControllerState returns undefined for a well-formed but shape-wrong JSON file", () => {
  const dir = tmpDir();
  try {
    writeFileSync(stateFilePath(dir), JSON.stringify({ hello: "world" }));
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removeControllerState deletes the file and read then returns undefined", () => {
  const dir = tmpDir();
  try {
    writeControllerState(dir, sample());
    removeControllerState(dir);
    assert.equal(readControllerState(dir), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removeControllerState on an already-clean dir is a safe no-op (idempotent)", () => {
  const dir = tmpDir();
  try {
    assert.doesNotThrow(() => removeControllerState(dir));
    assert.doesNotThrow(() => removeControllerState(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isPidAlive is true for this process's own pid", () => {
  assert.equal(isPidAlive(process.pid), true);
});

test("isPidAlive is false for a pid that cannot correspond to a live process", () => {
  // Avoid -1 (POSIX process-group broadcast semantics) or 0 (own process group) — pick a
  // concrete large pid instead, which is what a real dead-controller pid looks like.
  assert.equal(isPidAlive(999_999_999), false);
});

// --- ISS-T-047-CONTROLLER-002: identity beyond bare pid (pid-reuse defense) -----------------

test("getProcessStartTime returns a parseable timestamp for this process's own (real, live) pid", () => {
  const t = getProcessStartTime(process.pid);
  assert.equal(typeof t, "string");
  assert.ok(!Number.isNaN(new Date(t as string).getTime()), `expected a parseable timestamp, got ${t}`);
});

test("getProcessStartTime returns undefined (never throws) for a pid that cannot correspond to a live process", () => {
  assert.equal(getProcessStartTime(999_999_999), undefined);
});

test("controllerMatchesIdentity: no identity was ever recorded (older state file) → trusts pid-alive, back-compat", () => {
  assert.equal(controllerMatchesIdentity(undefined, "2026-09-24T10:00:00.000000+05:30"), true);
});

test("controllerMatchesIdentity: recorded identity but the live probe couldn't determine the actual one → " +
  "doesn't newly distrust a pid-alive process (a probe failure must never manufacture a false mismatch)", () => {
  assert.equal(controllerMatchesIdentity("2026-09-24T10:00:00.000000+05:30", undefined), true);
});

test("controllerMatchesIdentity: matching start time → same process, alive", () => {
  const t = "2026-09-24T10:00:00.000000+05:30";
  assert.equal(controllerMatchesIdentity(t, t), true);
});

test("ISS-T-047-CONTROLLER-002: controllerMatchesIdentity — mismatched start time (the OS recycled the pid " +
  "onto an unrelated process after the original controller died) → NOT the same controller", () => {
  assert.equal(
    controllerMatchesIdentity("2026-09-24T10:00:00.000000+05:30", "2026-09-24T16:45:00.000000+05:30"),
    false,
  );
});

test("isControllerAlive — pid alive, no controllerStartedAt recorded (older/undefined) → alive (back-compat, " +
  "and short-circuits before ever probing getProcessStartTime — see controller-state.ts)", () => {
  const state = sample({ pid: process.pid, controllerStartedAt: undefined });
  assert.equal(isControllerAlive(state), true);
});

test("isControllerAlive — pid not alive at all → dead regardless of identity", () => {
  const state = sample({ pid: 999_999_999, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  assert.equal(isControllerAlive(state), false);
});

test("ISS-T-047-CONTROLLER-002: isControllerAlive — pid-reuse case via INJECTED probes: pid reports alive " +
  "(the OS recycled it onto an unrelated process) but the recorded identity does not match the actual " +
  "one → reports dead, not alive", () => {
  const state = sample({ pid: 4242, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  const alive = isControllerAlive(state, {
    pidAlive: () => true,
    processStartTime: () => "2026-09-24T16:45:00.000000+05:30", // different process now holds this pid
  });
  assert.equal(alive, false);
});

test("isControllerAlive — pid alive, identity matches (injected probes) → alive, the same controller", () => {
  const state = sample({ pid: 4242, controllerStartedAt: "2026-09-24T10:00:00.000000+05:30" });
  const alive = isControllerAlive(state, {
    pidAlive: () => true,
    processStartTime: () => "2026-09-24T10:00:00.000000+05:30",
  });
  assert.equal(alive, true);
});
