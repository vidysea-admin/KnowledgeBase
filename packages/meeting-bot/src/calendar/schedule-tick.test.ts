/**
 * packages/meeting-bot/src/calendar/schedule-tick.test.ts — U5. `runScheduleTickOnce` against
 * fully injected deps (fake calendar/candidate loaders, fake clock, fake scheduler, a throwaway
 * temp state dir) — no real HTTP, no real Windows Scheduled Task, no real recording. Also covers
 * `createHttpCandidateLoader`'s failure contract with a stubbed global `fetch`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AutoRecordCandidateInput } from "./auto-join.js";
import { readScheduledKeys, readScheduledJob, writeScheduledJob } from "./schedule-state.js";
import { createHttpCandidateLoader, runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import { JOB_KEY_RE, deriveJobKey, type TaskScheduler, type ScheduleOnceOptions } from "./task-scheduler.js";

function withTempDir(fn: (dir: string) => void | Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-schedule-tick-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function fakeScheduler(): { scheduler: TaskScheduler; calls: ScheduleOnceOptions[] } {
  const calls: ScheduleOnceOptions[] = [];
  return {
    scheduler: {
      scheduleOnce: async (opts) => {
        calls.push(opts);
      },
    },
    calls,
  };
}

const CANDIDATE: AutoRecordCandidateInput = {
  id: "c1", title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in",
  senderDomain: "theoutreachcollective.in", status: "auto_approved",
  meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123",
  startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z", kind: "upcoming",
};

function baseDeps(stateDir: string, overrides: Partial<ScheduleTickDeps> = {}): ScheduleTickDeps {
  return {
    loadCalendarEvents: async () => [],
    loadCandidates: async () => [CANDIDATE],
    now: () => "2026-09-28T12:26:00Z",
    stateDir,
    scheduler: fakeScheduler().scheduler,
    log: () => {},
    ...overrides,
  };
}

test("dry-run: lists what would be scheduled, calls the scheduler zero times, writes no state", async () => {
  await withTempDir(async (dir) => {
    const { scheduler, calls } = fakeScheduler();
    const logs: string[] = [];
    const deps = baseDeps(dir, { scheduler, log: (m) => logs.push(m) });
    const result = await runScheduleTickOnce(deps, true);

    assert.equal(result.toSchedule.length, 1);
    assert.equal(calls.length, 0, "dry-run must never call the scheduler");
    assert.deepEqual([...readScheduledKeys(dir)], [], "dry-run must never write dedup state");
    assert.ok(logs.some((l) => l.includes("--dry-run")));
  });
});

test("dry-run output never contains the raw join-link token", async () => {
  await withTempDir(async (dir) => {
    const logs: string[] = [];
    const deps = baseDeps(dir, { log: (m) => logs.push(m) });
    await runScheduleTickOnce(deps, true);
    for (const line of logs) {
      assert.ok(!line.includes("SECRET123"), `log line leaked the join token: ${line}`);
    }
  });
});

test("real (non-dry-run) run: schedules once via the injected scheduler and records dedup state", async () => {
  await withTempDir(async (dir) => {
    const { scheduler, calls } = fakeScheduler();
    const deps = baseDeps(dir, { scheduler });
    const result = await runScheduleTickOnce(deps, false);

    assert.equal(result.toSchedule.length, 1);
    assert.equal(calls.length, 1);
    // ISS-317 fix (cycle 2): scheduleOnce now takes only jobKey/launcherPath/runAtIso — no
    // title/url/sessionId ever reaches it. jobKey is derived from the sessionKey and validated.
    assert.match(calls[0]!.jobKey, JOB_KEY_RE);
    // ISS-321: jobKey is now a hash-based derivation (task-scheduler.ts's deriveJobKey), not the
    // old lossy-collapse literal — assert against the real derivation, not a hardcoded string.
    assert.equal(calls[0]!.jobKey, deriveJobKey("gmail:c1"));
    assert.match(calls[0]!.launcherPath, /start-record-detached\.ps1$/);
    assert.deepEqual([...readScheduledKeys(dir)], ["gmail:c1"]);
  });
});

test("real (non-dry-run) run: persists url/until/title/sessionId to a per-job JSON file, keyed by jobKey (ISS-317)", async () => {
  await withTempDir(async (dir) => {
    const deps = baseDeps(dir);
    await runScheduleTickOnce(deps, false);
    const jobKey = deriveJobKey("gmail:c1")!;
    const job = readScheduledJob(dir, jobKey);
    assert.ok(job, `expected a job file to have been written for jobKey '${jobKey}'`);
    assert.equal(job!.url, CANDIDATE.meetingUrl);
    assert.equal(job!.title, CANDIDATE.title);
    assert.equal(job!.sessionId, "gmail:c1");
    // ISS-319 fix: the FULL ISO end datetime is persisted, not a truncated local HH:mm.
    assert.equal(job!.until, CANDIDATE.endTime);
  });
});

test("ISS-317: no title/url/sessionId text ever reaches the scheduler — hostile title/url are " +
  "contained to the job file, never the /tr-bound call", async () => {
  await withTempDir(async (dir) => {
    const hostileCandidate: AutoRecordCandidateInput = {
      ...CANDIDATE,
      id: "c-hostile",
      title: 'Evil"; & powershell -Command "Remove-Item C:\\ -Recurse -Force"; `whoami` %COMSPEC% $(id)\ntrailing',
      meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123\"; -Command evil&pwn|x;y$(z)`w",
    };
    const { scheduler, calls } = fakeScheduler();
    const deps = baseDeps(dir, { scheduler, loadCandidates: async () => [hostileCandidate] });
    const result = await runScheduleTickOnce(deps, false);

    assert.equal(result.toSchedule.length, 1);
    assert.equal(calls.length, 1);
    // Everything the scheduler actually receives is clean: a validated jobKey + the fixed
    // launcher path + a plain ISO timestamp. None of it can carry the hostile text through.
    const call = calls[0]!;
    assert.match(call.jobKey, JOB_KEY_RE);
    assert.doesNotMatch(call.jobKey, /["&|;$`%\n]/);
    assert.doesNotMatch(call.launcherPath, /["&|;$`%\n]/);
    // The hostile text DID get persisted (safely, as JSON field values on disk) — that's the
    // intended "still remember the real title/url" half of the fix, just never as a Task
    // Scheduler argument.
    const job = readScheduledJob(dir, call.jobKey);
    assert.equal(job!.title, hostileCandidate.title);
    assert.equal(job!.url, hostileCandidate.meetingUrl);
  });
});

test("ISS-319: a session crossing midnight keeps its full end datetime, which is AFTER its own start", async () => {
  await withTempDir(async (dir) => {
    const midnightCandidate: AutoRecordCandidateInput = {
      ...CANDIDATE,
      id: "c-midnight",
      startTime: "2026-09-28T18:00:00Z", // 23:30 IST
      endTime: "2026-09-28T19:15:00Z", // 00:45 IST the next day
    };
    const deps = baseDeps(dir, {
      loadCandidates: async () => [midnightCandidate],
      now: () => "2026-09-28T17:56:00Z",
    });
    const result = await runScheduleTickOnce(deps, false);
    assert.equal(result.toSchedule.length, 1);

    const job = readScheduledJob(dir, deriveJobKey("gmail:c-midnight")!);
    assert.ok(job);
    // The regression this guards against: a bare local HH:mm ("00:45") resolved against the
    // START day landed ~23h in the past. The full ISO end datetime is unambiguous regardless of
    // which local day it prints as.
    assert.equal(job!.until, midnightCandidate.endTime);
    assert.ok(
      new Date(job!.until).getTime() > new Date(midnightCandidate.startTime as string).getTime(),
      "the persisted end datetime must be AFTER the session's own start, even across midnight",
    );
  });
});

test("ISS-321: a jobKey collision with a DIFFERENT session refuses loudly, skips only that item, " +
  "and never overwrites the existing job file or crashes the tick", async () => {
  await withTempDir(async (dir) => {
    const jobKey = deriveJobKey("gmail:c1")!;
    // Pre-seed a job file for this jobKey belonging to a DIFFERENT session — simulates the
    // astronomically-unlikely-but-must-still-be-caught collision this guard exists for, without
    // depending on ever finding a real SHA-256 collision.
    writeScheduledJob(dir, jobKey, {
      url: "https://zoho.com/meeting/other", until: "2026-09-28T13:00:00Z",
      title: "Other webinar", sessionId: "gmail:some-other-session",
    });
    const { scheduler, calls } = fakeScheduler();
    const logs: string[] = [];
    const deps = baseDeps(dir, { scheduler, log: (m) => logs.push(m) });
    const result = await runScheduleTickOnce(deps, false);

    assert.equal(result.toSchedule.length, 1, "selection itself is unaffected by the collision");
    assert.equal(calls.length, 0, "the colliding item must never reach the scheduler");
    assert.ok(
      logs.some((l) => l.includes("refused to schedule") && l.includes("ISS-321")),
      "expected a loud refusal log line naming the collision",
    );
    // The "never silently overwrite" guarantee itself: the other session's job file is untouched.
    const stillThere = readScheduledJob(dir, jobKey);
    assert.equal(stillThere!.sessionId, "gmail:some-other-session");
    assert.equal(stillThere!.title, "Other webinar");
  });
});

test("ISS-321: re-scheduling the SAME session is still allowed — not treated as a collision", async () => {
  await withTempDir(async (dir) => {
    const jobKey = deriveJobKey("gmail:c1")!;
    // A job file already exists for this exact sessionKey (e.g. a previous tick's write) —
    // rewriting it with fresher fields must succeed, not be refused as a collision.
    writeScheduledJob(dir, jobKey, {
      url: CANDIDATE.meetingUrl!, until: "2026-09-28T13:00:00Z",
      title: "Stale title", sessionId: "gmail:c1",
    });
    const { scheduler, calls } = fakeScheduler();
    const deps = baseDeps(dir, { scheduler });
    await runScheduleTickOnce(deps, false);

    assert.equal(calls.length, 1, "a same-session rewrite must still reach the scheduler");
    const job = readScheduledJob(dir, jobKey);
    assert.equal(job!.title, CANDIDATE.title, "the job file must be overwritten with the fresh fields");
  });
});

test("a second tick after a real run doesn't re-schedule the same session (duplicate-session)", async () => {
  await withTempDir(async (dir) => {
    const first = fakeScheduler();
    await runScheduleTickOnce(baseDeps(dir, { scheduler: first.scheduler }), false);

    const second = fakeScheduler();
    const result = await runScheduleTickOnce(baseDeps(dir, { scheduler: second.scheduler }), false);

    assert.equal(result.toSchedule.length, 0);
    assert.equal(second.calls.length, 0);
    assert.equal(result.skipped[0]!.reason, "duplicate-session");
  });
});

// -------------------------------------------------------------------------------------------
// createHttpCandidateLoader — stubs global fetch, never makes a real network call.
// -------------------------------------------------------------------------------------------

async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}
test("HTTP candidate mapping preserves original registration/message/thread evidence", async () => {
  const row = {_id: "original", subject: "Webinar", senderEmail: "host@example.test", senderDomain: "example.test", status: "approved",
    registrationOnly: true, registrationUrl: "https://example.test/register", messageId: "original-message", threadId: "original-thread"};
  await withFetch((async () => new Response(JSON.stringify({candidates: [row]}), {status: 200})) as typeof fetch, async () => {
    const result = await createHttpCandidateLoader("http://localhost:3300", "fixture", () => {}, true)();
    assert.equal(result[0]!.id, row._id); assert.equal(result[0]!.registrationUrl, row.registrationUrl);
    assert.equal(result[0]!.messageId, row.messageId); assert.equal(result[0]!.threadId, row.threadId);
  });
});

test("createHttpCandidateLoader: no apiKey -> [] without attempting a fetch", async () => {
  let called = false;
  await withFetch(
    (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
    async () => {
      const loader = createHttpCandidateLoader("http://localhost:3300", undefined, () => {});
      const result = await loader();
      assert.deepEqual(result, []);
    },
  );
  assert.equal(called, false);
});

test("createHttpCandidateLoader: filters to approved/auto_approved only", async () => {
  await withFetch(
    (async () =>
      new Response(JSON.stringify({
        candidates: [
          { _id: "a", subject: "A", senderEmail: "x@y.com", senderDomain: "y.com", status: "approved" },
          { _id: "b", subject: "B", senderEmail: "x@y.com", senderDomain: "y.com", status: "pending" },
          { _id: "c", subject: "C", senderEmail: "x@y.com", senderDomain: "y.com", status: "auto_approved" },
        ],
      }), { status: 200 })) as typeof fetch,
    async () => {
      const loader = createHttpCandidateLoader("http://localhost:3300", "demo-key", () => {});
      const result = await loader();
      assert.deepEqual(result.map((c) => c.id).sort(), ["a", "c"]);
    },
  );
});

test("createHttpCandidateLoader: a non-2xx response degrades to [] rather than throwing", async () => {
  await withFetch(
    (async () => new Response("nope", { status: 500 })) as typeof fetch,
    async () => {
      const loader = createHttpCandidateLoader("http://localhost:3300", "demo-key", () => {});
      const result = await loader();
      assert.deepEqual(result, []);
    },
  );
});

test("createHttpCandidateLoader: a network throw degrades to [] rather than crashing the tick", async () => {
  await withFetch(
    (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
    async () => {
      const loader = createHttpCandidateLoader("http://localhost:3300", "demo-key", () => {});
      const result = await loader();
      assert.deepEqual(result, []);
    },
  );
});
