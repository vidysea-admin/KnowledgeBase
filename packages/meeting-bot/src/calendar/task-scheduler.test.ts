/**
 * packages/meeting-bot/src/calendar/task-scheduler.test.ts — U5. Every test injects a fake
 * `execFileFn` — the real `schtasks.exe` binary is never invoked in this suite (build-session
 * constraint: no real Windows Scheduled Task is created while building/testing this unit).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWindowsTaskScheduler, toLocalHHMM, toSchtasksDateTime } from "./task-scheduler.js";

type FakeCall = { file: string; args: string[] };

function fakeExec(behavior: "ok" | "fail" = "ok") {
  const calls: FakeCall[] = [];
  const fn = (file: string, args: string[], cb: (error: Error | null, stdout: string, stderr: string) => void) => {
    calls.push({ file, args });
    if (behavior === "fail") {
      cb(new Error("exit 1"), "", "ERROR: The specified task name already exists in a non-idempotent way.");
    } else {
      cb(null, "SUCCESS: The scheduled task was successfully created.", "");
    }
  };
  return { fn, calls };
}

test("toLocalHHMM formats an ISO datetime as local HH:mm", () => {
  const hhmm = toLocalHHMM("2026-09-28T12:26:00Z");
  assert.match(hhmm, /^\d{2}:\d{2}$/);
});

test("toSchtasksDateTime formats /st HH:mm and /sd MM/DD/YYYY", () => {
  const { st, sd } = toSchtasksDateTime("2026-09-28T12:26:00Z");
  assert.match(st, /^\d{2}:\d{2}$/);
  assert.match(sd, /^\d{2}\/\d{2}\/\d{4}$/);
});

test("scheduleOnce calls schtasks /create /f with the task name, /sc once, and the quoted command", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  await scheduler.scheduleOnce({
    taskName: "lkb-autorecord-gmail_c1",
    runAtIso: "2026-09-28T12:30:00Z",
    command: "powershell.exe",
    args: ["-NoProfile", "-File", "start-record-detached.ps1", "-Url", "https://zoho.com/m?tk=SECRET"],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.file, "schtasks");
  assert.deepEqual(calls[0]!.args.slice(0, 2), ["/create", "/f"]);
  assert.ok(calls[0]!.args.includes("/tn"));
  assert.ok(calls[0]!.args.includes("lkb-autorecord-gmail_c1"));
  assert.ok(calls[0]!.args.includes("/sc"));
  assert.ok(calls[0]!.args.includes("once"));
  const tr = calls[0]!.args[calls[0]!.args.indexOf("/tr") + 1]!;
  assert.ok(tr.includes("powershell.exe"));
  assert.ok(tr.includes("start-record-detached.ps1"));
});

test("scheduleOnce rejects with a clear error on a real schtasks failure, never swallows it", async () => {
  const { fn } = fakeExec("fail");
  const scheduler = createWindowsTaskScheduler(fn);
  await assert.rejects(
    scheduler.scheduleOnce({
      taskName: "lkb-autorecord-x", runAtIso: "2026-09-28T12:30:00Z", command: "powershell.exe", args: [],
    }),
    /schtasks \/create failed for task 'lkb-autorecord-x'/,
  );
});

test("scheduleOnce never invokes the real schtasks.exe binary in this suite (fake always used)", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  await scheduler.scheduleOnce({
    taskName: "t", runAtIso: "2026-09-28T12:30:00Z", command: "powershell.exe", args: [],
  });
  // The only assertion that matters here: this test process's real Windows Scheduled Tasks are
  // untouched — proven structurally, since `fn` (never the real execFile/schtasks.exe) is what
  // scheduleOnce called, and we asserted exactly one call went to that fake above.
  assert.equal(calls.length, 1);
});
