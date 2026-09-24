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
