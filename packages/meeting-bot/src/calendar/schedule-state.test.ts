/**
 * packages/meeting-bot/src/calendar/schedule-state.test.ts — U5. Real filesystem I/O against a
 * throwaway temp dir (mirrors controller-state.test.ts's own convention) — no mocks needed since
 * this is a thin, deterministic file read/write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { readScheduleState, readScheduledKeys, recordScheduled, scheduleStateFilePath } from "./schedule-state.js";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-schedule-state-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readScheduleState: no file yet -> {}", () => {
  withTempDir((dir) => {
    assert.deepEqual(readScheduleState(dir), {});
    assert.deepEqual([...readScheduledKeys(dir)], []);
  });
});

test("recordScheduled then readScheduleState round-trips", () => {
  withTempDir((dir) => {
    recordScheduled(dir, { sessionKey: "gmail:c1", title: "TOC webinar", scheduledAt: "2026-09-28T12:26:00Z" });
    const state = readScheduleState(dir);
    assert.deepEqual(state, {
      "gmail:c1": { sessionKey: "gmail:c1", title: "TOC webinar", scheduledAt: "2026-09-28T12:26:00Z" },
    });
    assert.deepEqual([...readScheduledKeys(dir)], ["gmail:c1"]);
  });
});

test("recordScheduled twice for different sessions accumulates, doesn't clobber", () => {
  withTempDir((dir) => {
    recordScheduled(dir, { sessionKey: "gmail:c1", title: "A", scheduledAt: "2026-09-28T12:00:00Z" });
    recordScheduled(dir, { sessionKey: "cal:e1", title: "B", scheduledAt: "2026-09-28T12:05:00Z" });
    assert.deepEqual([...readScheduledKeys(dir)].sort(), ["cal:e1", "gmail:c1"]);
  });
});

test("recordScheduled creates the state dir if it doesn't exist yet", () => {
  withTempDir((parent) => {
    const dir = path.join(parent, "nested", "does-not-exist-yet");
    recordScheduled(dir, { sessionKey: "gmail:c9", title: "C", scheduledAt: "2026-09-28T12:00:00Z" });
    assert.deepEqual([...readScheduledKeys(dir)], ["gmail:c9"]);
  });
});

test("readScheduleState on a corrupt file never throws — treated as {}", () => {
  withTempDir((dir) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(scheduleStateFilePath(dir), "{ not valid json");
    assert.deepEqual(readScheduleState(dir), {});
  });
});
