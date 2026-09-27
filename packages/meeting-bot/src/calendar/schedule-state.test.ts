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

import {
  readScheduleState, readScheduledKeys, recordScheduled, scheduleStateFilePath,
  writeScheduledJob, readScheduledJob,
} from "./schedule-state.js";

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

// -------------------------------------------------------------------------------------------
// writeScheduledJob — ISS-321 collision guard. jobKey is derived from a hash of the sessionKey
// (task-scheduler.ts's deriveJobKey) so a real collision is cryptographically unlikely, but this
// guard is what makes a collision DETECTED rather than a silent overwrite if one ever occurs.
// -------------------------------------------------------------------------------------------

test("writeScheduledJob: first write for a jobKey succeeds and round-trips", () => {
  withTempDir((dir) => {
    writeScheduledJob(dir, "gmail-c1-abc123", {
      url: "https://zoho.com/meeting/abc", until: "2026-09-28T13:30:00Z",
      title: "TOC webinar", sessionId: "gmail:c1",
    });
    const job = readScheduledJob(dir, "gmail-c1-abc123");
    assert.ok(job);
    assert.equal(job!.sessionId, "gmail:c1");
    assert.equal(job!.title, "TOC webinar");
  });
});

test("writeScheduledJob: rewriting the SAME sessionId under the same jobKey succeeds (not a " +
  "collision) — a corrective tick or retry must be able to update its own job file", () => {
  withTempDir((dir) => {
    writeScheduledJob(dir, "gmail-c1-abc123", {
      url: "https://zoho.com/meeting/abc", until: "2026-09-28T13:30:00Z",
      title: "Old title", sessionId: "gmail:c1",
    });
    writeScheduledJob(dir, "gmail-c1-abc123", {
      url: "https://zoho.com/meeting/abc", until: "2026-09-28T14:00:00Z",
      title: "New title", sessionId: "gmail:c1",
    });
    const job = readScheduledJob(dir, "gmail-c1-abc123");
    assert.equal(job!.title, "New title", "the second write for the same session must go through");
    assert.equal(job!.until, "2026-09-28T14:00:00Z");
  });
});

test("writeScheduledJob: a DIFFERENT sessionId at the same jobKey (a genuine collision) is refused " +
  "— throws and never overwrites the existing job file (ISS-321)", () => {
  withTempDir((dir) => {
    writeScheduledJob(dir, "gmail-c1-abc123", {
      url: "https://zoho.com/meeting/abc", until: "2026-09-28T13:30:00Z",
      title: "Session A", sessionId: "gmail:c1",
    });
    assert.throws(
      () => writeScheduledJob(dir, "gmail-c1-abc123", {
        url: "https://zoho.com/meeting/xyz", until: "2026-09-28T15:00:00Z",
        title: "Session B", sessionId: "gmail:c2",
      }),
      /refusing to schedule.*ISS-321/,
      "a different sessionId at the same jobKey must be refused, not silently overwritten",
    );
    // The original job file must be completely untouched by the refused write.
    const job = readScheduledJob(dir, "gmail-c1-abc123");
    assert.equal(job!.sessionId, "gmail:c1");
    assert.equal(job!.title, "Session A");
    assert.equal(job!.url, "https://zoho.com/meeting/abc");
  });
});
