/**
 * packages/meeting-bot/src/calendar/schedule-state.test.ts — U5. Real filesystem I/O against a
 * throwaway temp dir (mirrors controller-state.test.ts's own convention) — no mocks needed since
 * this is a thin, deterministic file read/write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  readScheduleState, readScheduledKeys, recordScheduled, scheduleStateFilePath,
  writeScheduledJob, readScheduledJob,
  prepareWebinarSourceState, readWebinarOperationState, writeWebinarOperationState, validateWebinarCalendarAcquisition,
} from "./schedule-state.js";
import { createHttpCalendarLoader } from "./schedule-tick.js";
import { selectAutoRecordItems } from "./auto-join.js";

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

async function withNativeRunner(body: (fixture: any) => Promise<void>) {
  const {startTestServer} = await import(new URL("../../../../apps/api/src/testUtils.ts", import.meta.url).href);
  const {buildTestDeps, fakeKeyStore} = await import(new URL("../../../../apps/api/src/fixtures.ts", import.meta.url).href);
  const {createGwsCalendarReadDeps, listUpcomingGwsMeetings} = await import(new URL("../../../../apps/api/src/gws-calendar.ts", import.meta.url).href);
  const {runPipelineTick} = await import(new URL("../../../../scripts/webinar/run-pipeline.mjs", import.meta.url).href);
  const root = mkdtempSync(path.join(tmpdir(), "lkb-native-runner-")), stateDir = path.join(root, "data/webinar-release");
  mkdirSync(stateDir, {recursive: true}); writeFileSync(path.join(root, "proof.webm"), "fixture media only");
  writeFileSync(path.join(stateDir, "live-proof.json"), JSON.stringify({status: "passed", platform: process.platform, backend: "tab", sessionId: "fixture-proof",
    audio: true, video: true, verifiedAt: new Date().toISOString(), recording: "proof.webm"}));
  const provider = {snapshot: [] as any[], delta: [] as any[], expire: false, fail: false, calls: [] as any[], generation: 0};
  const calendar = createGwsCalendarReadDeps("lane", (days: number, _run: unknown, since: string | undefined, acquisition: any) =>
    acquisition ? listUpcomingGwsMeetings(days, cli, undefined, acquisition) : listUpcomingGwsMeetings(days, cli, since));
  async function cli(args: string[]) {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!); provider.calls.push(p);
    if (provider.fail) return JSON.stringify({error: {code: 403}});
    if (p.singleEvents) return JSON.stringify({items: provider.snapshot.filter(row => !row.recurrence && row.start && row.start.dateTime >= p.timeMin && row.start.dateTime < p.timeMax)});
    if (p.syncToken && provider.expire) {provider.expire = false; return JSON.stringify({error: {code: 410}});}
    return JSON.stringify({items: p.syncToken ? provider.delta : provider.snapshot, nextSyncToken: `native-${++provider.generation}`});
  }
  const server = await startTestServer(buildTestDeps({calendar, keyStore: fakeKeyStore({"lane-key": {tenantId: "lane", scopes: ["calendar", "sessions"]}})}));
  let candidates: any[] = []; const launches: string[][] = [];
  const deps = {root, stateDir, env: {LKB_TENANT_ID: "lane", MONGO_WORK_DB: "lkb_work_fixture"}, now: () => new Date().toISOString(), log: () => {}, validateTenant: async () => {},
    loadCalendarEvents: createHttpCalendarLoader(server.baseUrl, "lane-key"), loadCalendarAcquisition: createHttpCalendarLoader(server.baseUrl, "lane-key", undefined, {tenantId: "lane"}),
    loadCandidates: async () => candidates, launch: async (args: string[]) => {
      const saved = JSON.parse(readFileSync(path.join(stateDir, "operations.json"), "utf8"));
      assert.equal(saved.source.coverage.calendarSyncToken, `native-${provider.generation}`, "token committed before child launch");
      launches.push(args); throw new Error("fixture processing failure");
    }};
  const event = (id: string, minutes = 24 * 60, extra: any = {}) => ({id, summary: "University webinar", updated: new Date(Date.now() - 1000).toISOString(),
    start: {dateTime: new Date(Date.now() + minutes * 60000).toISOString()}, end: {dateTime: new Date(Date.now() + (minutes + 60) * 60000).toISOString()},
    hangoutLink: "https://meet.google.com/abc-defg-hij", ...extra});
  const file = path.join(stateDir, "operations.json"), saved = () => JSON.parse(readFileSync(file, "utf8"));
  try { await body({root, stateDir, provider, deps, server, launches, event, file, saved, tick: () => runPipelineTick(deps, true),
    mail: (value: any[]) => {candidates = value;}, preview: () => runPipelineTick(deps, false)}); }
  finally {await server.close(); rmSync(root, {recursive: true, force: true});}
}

test("native streamed overflow cancels before JSON and never advances persisted source", () => withNativeRunner(async f => {
  f.provider.snapshot = [f.event("future")]; await f.tick();
  const before = f.saved().source, original = globalThis.fetch;
  let cancelled = 0, released = 0, reads = 0, parsed = 0;
  globalThis.fetch = (async () => ({ok:true, body:{getReader: () => ({
    read: async () => {reads++; return {done:false,value:new Uint8Array(3 * 1024 * 1024)};},
    cancel: async () => {cancelled++;}, releaseLock: () => {released++;}
  })}, json: async () => {parsed++; throw new Error("must not parse");}})) as unknown as typeof fetch;
  try {
    await assert.rejects(f.tick(), /discovery unavailable/);
    assert.deepEqual(f.saved().source, before); assert.equal(f.launches.length, 0);
    assert.equal(reads, 2); assert.equal(cancelled, 1); assert.equal(released, 1); assert.equal(parsed, 0);
  } finally {globalThis.fetch = original;}
}));

test("persisted reschedules preserve completed, rejected and exhausted retry barriers", () => withNativeRunner(async f => {
  const original = f.event("rescheduled", 30 * 24 * 60); f.provider.snapshot = [original]; await f.tick();
  const baseline = f.saved(), oldId = Object.keys(baseline.operations)[0]!;
  for (const barrier of [{status:"ready",reason:undefined,attempts:1}, {status:"action_required",reason:"retry-limit",attempts:3},
    {status:"action_required",reason:"rejected",attempts:0}]) {
    const seeded = structuredClone(baseline); Object.assign(seeded.operations[oldId], barrier, {artifact:"retained-proof"});
    writeWebinarOperationState(f.file, seeded);
    const changed = {...original, updated:new Date().toISOString(), start:{dateTime:new Date(Date.parse(original.start.dateTime) + 60000).toISOString()},
      end:{dateTime:new Date(Date.parse(original.end.dateTime) + 60000).toISOString()}};
    f.provider.snapshot = [changed]; f.provider.delta = [changed]; await f.tick();
    const state = f.saved(), newId = Object.keys(state.operations).find(id => id !== oldId)!;
    assert.ok(newId); assert.equal(state.operations[oldId].status, barrier.status);
    assert.equal(state.operations[newId].status, "action_required"); assert.equal(state.operations[newId].priorSessionId, oldId);
    assert.equal(state.operations[newId].reason, barrier.status === "ready" ? "rescheduled-completed" : barrier.reason);
    assert.equal(state.operations[newId].attempts, barrier.attempts); assert.equal(state.operations[newId].artifact, "retained-proof");
    f.provider.delta = []; await f.tick(); assert.equal(Object.keys(f.saved().operations).length, 2); assert.equal(f.launches.length, 0);
  }
}));

test("actual native API acquisition commits future inventory and restart cancellation atomically", () => withNativeRunner(async f => {
  const invite = f.event("future", 30 * 24 * 60), mail = {id: "gmail-future", title: invite.summary, status: "pending" as const, senderEmail: "host@example.org", senderDomain: "example.org",
    meetingUrl: invite.hangoutLink, startTime: invite.start.dateTime, endTime: invite.end.dateTime};
  f.provider.snapshot = [invite]; f.mail([mail]); await f.tick();
  const initial = f.saved(), id = Object.keys(initial.operations)[0]!;
  assert.equal(initial.operations[id].status, "queued"); assert.equal(initial.operations[id].attempts, 0); assert.equal(f.launches.length, 0);
  assert.equal(initial.source.reconciliation.historyComplete, false); assert.equal(initial.source.coverage.historicalDeletedReconstruction, "unavailable");
  f.provider.delta = [{id: "future", status: "cancelled", updated: new Date().toISOString()}];
  f.provider.snapshot = f.provider.delta; await f.tick();
  const cancelled = f.saved(); assert.equal(cancelled.operations[id].reason, "cancelled"); assert.notEqual(cancelled.source.coverage.calendarSyncToken, initial.source.coverage.calendarSyncToken);
  assert.ok(f.provider.calls.some((p: any) => p.syncToken === initial.source.coverage.calendarSyncToken));
  const requestStartedAt = f.deps.now();
  const prepared = prepareWebinarSourceState(cancelled, await f.deps.loadCalendarAcquisition(cancelled.source.coverage.calendarSyncToken, requestStartedAt), [mail], requestStartedAt);
  assert.equal(selectAutoRecordItems({...prepared, now: new Date(Date.parse(mail.startTime) - 1000).toISOString(), leadMinutes: 5,
    alreadyScheduled: [], everyWebinar: true, trustedSenders: {emails: [], domains: []}}).toSchedule.length, 0);
  const before = readFileSync(f.file, "utf8"); await f.preview(); assert.equal(readFileSync(f.file, "utf8"), before);
  const priorSource = f.saved().source; f.deps.loadCandidates = async () => {throw new Error("private provider failure");};
  await assert.rejects(f.tick(), /discovery unavailable/); assert.deepEqual(f.saved().source, priorSource);
  f.provider.delta = []; f.deps.loadCandidates = async () => [mail]; await f.tick();
  assert.ok(f.provider.calls.filter((p: any) => p.syncToken === priorSource.coverage.calendarSyncToken).length >= 2);
  assert.equal(f.launches.length, 0); assert.equal(existsSync(path.join(f.stateDir, "poller.lock")), false);
}));

test("native reset and changed recurrence cannot keep a removed generated instance eligible", () => withNativeRunner(async f => {
  const parent = f.event("series", -10000, {recurrence: ["RRULE:FREQ=DAILY"]}), child = f.event("child", 24 * 60,
    {recurringEventId: "series", originalStartTime: {dateTime: new Date(Date.now() + 24 * 60 * 60000).toISOString()}});
  f.provider.snapshot = [parent, child]; await f.tick(); const initial = f.saved();
  for (const mode of ["reset", "sync"]) {
    writeWebinarOperationState(f.file, initial);
    const changed = {...parent, updated: new Date().toISOString(), recurrence: ["RRULE:FREQ=DAILY;COUNT=1"]};
    f.provider.snapshot = [changed]; f.provider.delta = [changed]; f.provider.expire = mode === "reset"; await f.tick();
    const held = f.saved(); assert.ok(Object.values(held.operations).some((row: any) => row.reason === "source-discontinuity"));
    const requestStartedAt = f.deps.now(), next = await f.deps.loadCalendarAcquisition(held.source.coverage.calendarSyncToken, requestStartedAt);
    const prepared = prepareWebinarSourceState(held, next, [], requestStartedAt);
    assert.equal(prepared.calendarEvents.some(row => row.id === "child"), false); assert.equal(f.launches.length, 0);
    f.provider.delta = [child]; f.provider.snapshot = [changed, child]; await f.tick();
    assert.ok(Object.values(f.saved().operations).some((row: any) => row.status === "queued" && row.startTime === child.start.dateTime));
  }
}));

test("strict native persistence refuses corrupt, foreign, oversized or failed atomic generations", () => withNativeRunner(async f => {
  f.provider.snapshot = [f.event("due", 1)]; await f.tick(); assert.equal(f.launches.length, 1);
  const prior = f.saved(), bytes = readFileSync(f.file, "utf8"), checkedAt = f.deps.now();
  const acquired = await f.deps.loadCalendarAcquisition(prior.source.coverage.calendarSyncToken, checkedAt);
  for (const bad of [{...acquired, tenantId: "foreign"}, {...acquired, syncToken: "bad token"}, {...acquired, unexpected: true},
    {...acquired, checkedAt: new Date(Date.parse(checkedAt) + 61000).toISOString()}, {...acquired, sourceEvents: new Array(20001).fill(acquired.sourceEvents[0])}]) {
    assert.throws(() => validateWebinarCalendarAcquisition(bad, "lane", prior.source.coverage.calendarSyncToken, checkedAt), /Invalid/);
    assert.equal(readFileSync(f.file, "utf8"), bytes);
  }
  const tooBig = JSON.parse(JSON.stringify(prior)); tooBig.operations[Object.keys(tooBig.operations)[0]!].reason = "x".repeat(5 * 1024 * 1024);
  assert.throws(() => writeWebinarOperationState(f.file, tooBig), /Invalid/); assert.equal(readFileSync(f.file, "utf8"), bytes);
  const blocked = path.join(f.stateDir, "blocked"); mkdirSync(blocked); writeFileSync(path.join(blocked, "sentinel"), "retained");
  assert.throws(() => writeWebinarOperationState(blocked, prior)); assert.equal(readFileSync(path.join(blocked, "sentinel"), "utf8"), "retained");
  assert.equal(readdirSync(f.stateDir).some(name => name.endsWith(".tmp")), false);
  for (const corrupt of ["{broken", JSON.stringify({...prior, tenantId: "foreign"}), JSON.stringify({...prior, source: {...prior.source,
    coverage: {...prior.source.coverage, requestStartedAt: "2099-01-01T00:00:00.000Z"}}})]) {
    writeFileSync(f.file, corrupt); const calls = f.provider.calls.length;
    await assert.rejects(f.tick()); assert.equal(f.provider.calls.length, calls); assert.equal(readFileSync(f.file, "utf8"), corrupt);
  }
  writeFileSync(f.file, bytes); assert.equal(readWebinarOperationState(f.file, "lane", f.deps.now()).source!.coverage.calendarSyncToken, prior.source.coverage.calendarSyncToken);
}));
