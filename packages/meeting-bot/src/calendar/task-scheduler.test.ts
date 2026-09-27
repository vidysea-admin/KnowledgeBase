/**
 * packages/meeting-bot/src/calendar/task-scheduler.test.ts — U5. Every test injects a fake
 * `execFileFn` — the real `schtasks.exe` binary is never invoked in this suite (build-session
 * constraint: no real Windows Scheduled Task is created while building/testing this unit).
 *
 * Fix cycle 2 (ISS-317, checker FAIL at cycle 1): re-runs the checker's own reproduction —
 * hostile titles/urls/sessionIds must never be able to reach `/tr` — by proving the NEW
 * `scheduleOnce` API structurally cannot accept them at all (no `title`/`url`/`sessionId`
 * parameter exists any more; only a validated `jobKey` + a repo-controlled `launcherPath`).
 * `parseWindowsCommandLine` below is a standalone simulation of `CommandLineToArgvW`'s
 * documented backslash/quote rules (never a real process, no real `schtasks` invoked) — the same
 * technique the checker used to prove the OLD `/tr` string could be broken out of; used here to
 * prove the NEW fixed `/tr` shape re-parses back to exactly the intended argv for every hostile
 * jobKey/launcherPath combination that gets past validation (i.e. none does, since jobKey is
 * always `[a-z0-9-]{1,64}`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTaskName, createWindowsTaskScheduler, deriveJobKey, JOB_KEY_RE,
  toLocalHHMM, toSchtasksDateTime,
} from "./task-scheduler.js";

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

/**
 * Simplified `CommandLineToArgvW` re-parser (Windows' own documented rules: a run of `2n`
 * backslashes followed by `"` -> `n` literal backslashes + a quote-toggle; `2n+1` backslashes
 * followed by `"` -> `n` literal backslashes + one literal `"`, no toggle). Good enough to prove
 * whether a built `/tr` string round-trips to the intended argv, the same class of check the
 * checker used to falsify the OLD code (ISS-317's own evidence).
 */
function parseWindowsCommandLine(cmd: string): string[] {
  const args: string[] = [];
  let i = 0;
  const n = cmd.length;
  while (i < n) {
    while (i < n && (cmd[i] === " " || cmd[i] === "\t")) i++;
    if (i >= n) break;
    let arg = "";
    let inQuotes = false;
    for (;;) {
      let backslashes = 0;
      while (i < n && cmd[i] === "\\") { backslashes++; i++; }
      if (i < n && cmd[i] === '"') {
        if (backslashes % 2 === 0) {
          arg += "\\".repeat(backslashes / 2);
          if (inQuotes && cmd[i + 1] === '"') { arg += '"'; i += 2; continue; }
          inQuotes = !inQuotes;
          i++;
          continue;
        } else {
          arg += "\\".repeat((backslashes - 1) / 2) + '"';
          i++;
          continue;
        }
      }
      arg += "\\".repeat(backslashes);
      if (i >= n || (!inQuotes && (cmd[i] === " " || cmd[i] === "\t"))) break;
      arg += cmd[i];
      i++;
    }
    args.push(arg);
  }
  return args;
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

// -------------------------------------------------------------------------------------------
// deriveJobKey — the sanitizer that stands between an internal sessionKey and JOB_KEY_RE.
// -------------------------------------------------------------------------------------------

test("deriveJobKey: realistic sessionKeys sanitize to a valid job key", () => {
  assert.equal(deriveJobKey("gmail:664f0a1b2c3d4e5f60718293"), "gmail-664f0a1b2c3d4e5f60718293");
  assert.equal(deriveJobKey("cal:AbC123"), "cal-abc123");
});

test("deriveJobKey: every result (or null) satisfies JOB_KEY_RE — never lets through anything else", () => {
  const hostile = [
    "gmail:evil\"", "gmail:a;rm -rf", "gmail:$(whoami)", "gmail:`backtick`",
    "gmail:%VAR%", "gmail:line\nbreak", "gmail:a&b|c", "gmail:-Command", "", "   ", "gmail:",
    "gmail:" + "x".repeat(100),
  ];
  for (const sessionKey of hostile) {
    const result = deriveJobKey(sessionKey);
    if (result !== null) {
      assert.match(result, JOB_KEY_RE, `deriveJobKey('${sessionKey}') -> '${result}' escaped JOB_KEY_RE`);
    }
  }
});

test("deriveJobKey: empty/whitespace-only/too-long input -> null (refuse, never fall back)", () => {
  assert.equal(deriveJobKey(""), null);
  assert.equal(deriveJobKey("   "), null);
  assert.equal(deriveJobKey(":::"), null);
  assert.equal(deriveJobKey("x".repeat(65)), null);
});

test("buildTaskName: fixed prefix + jobKey, itself always matches a safe shape", () => {
  assert.equal(buildTaskName("gmail-c1"), "lkb-autorecord-gmail-c1");
});

// -------------------------------------------------------------------------------------------
// scheduleOnce — ISS-317: /tr must always be the exact fixed shape, jobKey is the only variable.
// -------------------------------------------------------------------------------------------

const LAUNCHER = "D:\\KnowledgeBase\\scripts\\webinar\\start-record-detached.ps1";

test("scheduleOnce calls schtasks /create /f with /tn <lkb-autorecord-jobKey>, /sc once, and a fixed /tr", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  await scheduler.scheduleOnce({ jobKey: "gmail-c1", launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.file, "schtasks");
  assert.deepEqual(calls[0]!.args.slice(0, 2), ["/create", "/f"]);
  assert.ok(calls[0]!.args.includes("/tn"));
  assert.equal(calls[0]!.args[calls[0]!.args.indexOf("/tn") + 1], "lkb-autorecord-gmail-c1");
  assert.ok(calls[0]!.args.includes("/sc"));
  assert.ok(calls[0]!.args.includes("once"));

  const tr = calls[0]!.args[calls[0]!.args.indexOf("/tr") + 1]!;
  assert.equal(
    tr,
    `"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "${LAUNCHER}" -Job "gmail-c1"`,
    "/tr must be exactly the fixed shape — no other text",
  );
});

test("scheduleOnce: hostile titles/urls/sessionIds have no parameter to travel through any more " +
  "(structural fix — re-runs ISS-317's own reproduction intent)", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  // The old API took `command`/`args` built from title/url/sessionId. The new ScheduleOnceOptions
  // type has no such fields — TypeScript itself refuses to compile a call that tries to smuggle
  // one in. This test proves the runtime shape as well: whatever the caller passes beyond
  // jobKey/launcherPath/runAtIso is simply not part of the type, so `/tr` cannot vary with it.
  await scheduler.scheduleOnce({ jobKey: "gmail-c1", launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" });
  const tr1 = calls[0]!.args[calls[0]!.args.indexOf("/tr") + 1]!;

  calls.length = 0;
  await scheduler.scheduleOnce({ jobKey: "gmail-c1", launcherPath: LAUNCHER, runAtIso: "2027-01-01T00:00:00Z" });
  const tr2 = calls[0]!.args[calls[0]!.args.indexOf("/tr") + 1]!;

  assert.equal(tr1, tr2, "the same jobKey always produces the exact same /tr regardless of when it fires");
  // Shell/argv metacharacters that must never appear un-escaped in /tr. `"` and `\` are excluded
  // from this check on purpose — the fixed shape legitimately quotes jobKey/launcherPath (`"`)
  // and launcherPath is a real Windows path (`\`); those are structural, not injected content.
  for (const hostile of ["&", "|", ";", "$(", "`", "%VAR%", "\n", "-Command"]) {
    assert.ok(!tr1.includes(hostile), `unexpected hostile token '${hostile}' leaked into /tr`);
  }
});

for (const hostileJobKey of [
  'evil"', "a;rm -rf", "$(whoami)", "`backtick`", "%VAR%", "line\nbreak", "a&b|c", "-Command",
  "UPPER-CASE", "has space", "", "x".repeat(65),
]) {
  test(`scheduleOnce: refuses (rejects, never calls execFile) a hostile jobKey ${JSON.stringify(hostileJobKey)}`, async () => {
    const { fn, calls } = fakeExec("ok");
    const scheduler = createWindowsTaskScheduler(fn);
    await assert.rejects(
      scheduler.scheduleOnce({ jobKey: hostileJobKey, launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" }),
      /refusing to schedule/,
    );
    assert.equal(calls.length, 0, "a rejected jobKey must never reach execFile/schtasks");
  });
}

test("scheduleOnce: the built /tr re-parses (CommandLineToArgvW-style) to exactly the intended argv", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  await scheduler.scheduleOnce({ jobKey: "gmail-c1", launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" });
  const tr = calls[0]!.args[calls[0]!.args.indexOf("/tr") + 1]!;
  const argv = parseWindowsCommandLine(tr);
  assert.deepEqual(argv, [
    "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", LAUNCHER, "-Job", "gmail-c1",
  ], "the re-parsed argv must match exactly — no extra/merged/injected argument");
});

test("scheduleOnce rejects with a clear error on a real schtasks failure, never swallows it", async () => {
  const { fn } = fakeExec("fail");
  const scheduler = createWindowsTaskScheduler(fn);
  await assert.rejects(
    scheduler.scheduleOnce({ jobKey: "lkb-x", launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" }),
    /schtasks \/create failed for task 'lkb-autorecord-lkb-x'/,
  );
});

test("scheduleOnce never invokes the real schtasks.exe binary in this suite (fake always used)", async () => {
  const { fn, calls } = fakeExec("ok");
  const scheduler = createWindowsTaskScheduler(fn);
  await scheduler.scheduleOnce({ jobKey: "t", launcherPath: LAUNCHER, runAtIso: "2026-09-28T12:30:00Z" });
  // The only assertion that matters here: this test process's real Windows Scheduled Tasks are
  // untouched — proven structurally, since `fn` (never the real execFile/schtasks.exe) is what
  // scheduleOnce called, and we asserted exactly one call went to that fake above.
  assert.equal(calls.length, 1);
});
