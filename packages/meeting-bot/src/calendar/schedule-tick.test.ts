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
import { readScheduledKeys } from "./schedule-state.js";
import { createHttpCandidateLoader, runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import type { TaskScheduler, ScheduleOnceOptions } from "./task-scheduler.js";

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
    assert.equal(calls[0]!.taskName, "lkb-autorecord-gmail_c1");
    assert.match(calls[0]!.args.join(" "), /start-record-detached\.ps1/);
    assert.ok(calls[0]!.args.includes("-Until"));
    const untilIdx = calls[0]!.args.indexOf("-Until");
    assert.match(calls[0]!.args[untilIdx + 1]!, /^\d{2}:\d{2}$/, "-Until must be local HH:mm, not raw ISO");
    assert.deepEqual([...readScheduledKeys(dir)], ["gmail:c1"]);
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
