import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { todayAt } from "./capture/record-commands.js";
import { readWebinarOperationState } from "./calendar/state/schedule-state.js";
import { hostOnly, readLiveJobs, REFUSAL_MESSAGES, runSendNow, type SendNowDeps } from "./send-now-command.js";
import type { SendNowJob, SendNowRefusal } from "./send-now.js";

const MEET = "https://meet.google.com/abc-defg-hij";
function harness(jobs: SendNowJob[] | Error = [], extra: Partial<SendNowDeps> = {}) {
  const calls: string[][] = [], out: string[] = [];
  const deps: SendNowDeps = {
    readLiveJobs: () => { if (jobs instanceof Error) throw jobs; return jobs; },
    runRecord: async (rest) => { calls.push(rest); },
    now: () => new Date("2026-10-10T10:00:00.000Z"), write: (l) => out.push(l), ...extra,
  };
  return { deps, calls, out };
}

test("valid Meet, Zoom and Teams URLs launch exactly once with the normalised URL", async () => {
  for (const raw of [`  ${MEET}?authuser=0  `, "https://zoom.us/j/12345678901?pwd=x", "https://teams.microsoft.com/l/meetup-join/19:abc@thread.v2/0"]) {
    const h = harness();
    assert.equal(await runSendNow([raw], h.deps), 0);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0], [raw.trim()]);
    assert.equal(h.out.length, 0);
  }
});

test("--until is passed through; absent --until adds nothing", async () => {
  const h = harness();
  await runSendNow([MEET, "--until", "15:30"], h.deps);
  assert.deepEqual(h.calls, [[MEET, "--until", "15:30"]]);
  const h2 = harness();
  await runSendNow([MEET], h2.deps);
  assert.deepEqual(h2.calls, [[MEET]]);
});

test("bad --until is rejected by the real todayAt parser before anything launches", async () => {
  const h = harness([], { validateUntil: todayAt });
  await assert.rejects(runSendNow([MEET, "--until", "25:99:xx"], h.deps), /bad time/);
  assert.equal(h.calls.length, 0);
  // without the early check, runRecord's own rejection propagates and the exit is non-zero (thrown)
  const h2 = harness([], { runRecord: async () => { throw new Error("bad time 'zz'"); } });
  await assert.rejects(runSendNow([MEET, "--until", "zz"], h2.deps), /bad time/);
});

test("usage errors throw and launch nothing", async () => {
  for (const argv of [[], ["--until", "10:00"], [MEET, "--until"], [MEET, "--until", "--x"], [MEET, "--tenant", "t"], [MEET, "extra"], [MEET, "--until", "1:00", "--until", "2:00"]]) {
    const h = harness();
    await assert.rejects(runSendNow(argv, h.deps), /^Error: usage: lkb send-now/);
    assert.equal(h.calls.length, 0);
  }
});

const REFUSING: Record<SendNowRefusal, string | undefined> = {
  "invalid-input": undefined, "invalid-clock": undefined, "empty-url": "   ", "url-too-long": `https://zoom.us/j/${"1".repeat(2100)}`,
  "malformed-url": "https://zoom.us/j/1 2", "not-https": "http://zoom.us/j/12345678", "credentials-in-url": "https://u:p4ss@zoom.us/j/12345678",
  "unexpected-port": "https://zoom.us:8443/j/12345678", "embedded-redirect": "https://zoom.us/j/12345678?next=x", "unsupported-host": "https://evil.example/j/1",
  "not-a-meeting-url": "https://meet.google.com/landing", "duplicate-live-job": undefined,
};
test("every planner refusal maps to a message, exits 1 and launches nothing", async () => {
  assert.deepEqual(Object.keys(REFUSAL_MESSAGES).sort(), Object.keys(REFUSING).sort());
  for (const [reason, url] of Object.entries(REFUSING)) {
    if (url === undefined) continue; // reached via dependency injection below
    const h = harness();
    assert.equal(await runSendNow([url], h.deps), 1, reason);
    assert.equal(h.calls.length, 0, reason);
    assert.equal(h.out.length, 1);
    assert.ok(h.out[0]!.startsWith("send-now refused: "), reason);
    assert.ok(!h.out[0]!.includes("undefined"), reason);
  }
  const clock = harness([], { now: () => new Date(NaN) });
  assert.equal(await runSendNow([MEET], clock.deps), 1);
  assert.match(clock.out[0]!, /clock/);
  for (const [reason, fn] of Object.entries(REFUSAL_MESSAGES)) assert.ok(fn("d").length > 5 && !fn().includes("undefined"), reason);
});

test("duplicate live job refuses for queued, joining, recording and an unknown status", async () => {
  for (const status of ["queued", "joining", "recording", "waiting-room", "Recording", ""]) {
    const h = harness([{ meetingUrl: `${MEET}?hl=en`, status }]);
    assert.equal(await runSendNow([MEET], h.deps), 1, status);
    assert.equal(h.calls.length, 0);
    assert.match(h.out[0]!, /already queued, joining or recording/);
  }
});

test("finished jobs (processing, ready, failed, action_required) and other meetings do not block", async () => {
  for (const status of ["processing", "ready", "failed", "action_required"]) {
    const h = harness([{ meetingUrl: MEET, status }]);
    assert.equal(await runSendNow([MEET], h.deps), 0, status);
    assert.equal(h.calls.length, 1);
  }
  const other = harness([{ meetingUrl: "https://meet.google.com/xyz-wxyz-abc", status: "recording" }]);
  assert.equal(await runSendNow([MEET], other.deps), 0);
});

test("an unreadable state refuses with exit 1 and launches nothing", async () => {
  const h = harness(new Error("Invalid webinar ownership, state or acquisition; inspect before retrying"));
  assert.equal(await runSendNow([MEET], h.deps), 1);
  assert.equal(h.calls.length, 0);
  assert.match(h.out[0]!, /cannot tell whether a bot is already in this meeting/);
});

test("credentials are never echoed: only the host is printed", async () => {
  for (const url of ["https://alice:S3cretPw@zoom.us/j/12345678", "https://S3cretPw@zoom.us/j/12345678?pwd=S3cretPw", "https://alice:S3cretPw@evil.example/x"]) {
    const h = harness();
    assert.equal(await runSendNow([url], h.deps), 1);
    assert.ok(!h.out.join("\n").includes("S3cretPw") && !h.out.join("\n").includes("alice"), h.out.join());
    assert.match(h.out[0]!, /username or password/);
  }
  assert.equal(hostOnly("https://a:b@Zoom.US/j/1"), "zoom.us");
  assert.equal(hostOnly("not a url"), undefined);
});

test("readLiveJobs: missing state is no jobs; corrupt or wrong-shape state throws (cannot tell)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "send-now-"));
  try {
    const src = { operationsFile: path.join(dir, "operations.json"), scheduledDir: path.join(dir, "scheduled"), tenantId: "t1" };
    const now = new Date("2026-10-10T10:00:00.000Z");
    assert.deepEqual(readLiveJobs(src, now, readWebinarOperationState), []);                  // nothing exists: no jobs
    mkdirSync(src.scheduledDir);
    const job = (n: string, o: object) => writeFileSync(path.join(src.scheduledDir, `${n}.json`), JSON.stringify({ tenantId: "t1", ...o }));
    job("a", { url: MEET, until: "2026-10-10T12:00:00.000Z", title: "t", sessionId: "s-a" });   // no row, until ahead -> queued
    job("b", { url: "https://zoom.us/j/12345678", until: "2026-10-10T09:00:00.000Z", title: "t", sessionId: "s-b" }); // past -> ready
    writeFileSync(src.operationsFile, JSON.stringify({ version: 1, tenantId: "t1", operations: { "s-b": { tenantId: "t1", status: "recording" } } }));
    assert.deepEqual(readLiveJobs(src, now, readWebinarOperationState), [
      { meetingUrl: MEET, status: "queued" }, { meetingUrl: "https://zoom.us/j/12345678", status: "recording" }]);
    job("c", { url: 5 });                                                                       // wrong shape
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState), /unexpected shape/);
    writeFileSync(path.join(src.scheduledDir, "c.json"), "{not json");                           // corrupt
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState), /unreadable/);
    rmSync(path.join(src.scheduledDir, "c.json"));
    writeFileSync(path.join(src.scheduledDir, "d.json"), JSON.stringify({ url: MEET, until: "2026-10-10T12:00:00.000Z", title: "t", sessionId: "s-d" })); // untagged legacy
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState), /no tenant tag/);
    writeFileSync(path.join(src.scheduledDir, "d.json"), JSON.stringify({ tenantId: "t2", url: MEET, until: "2026-10-10T12:00:00.000Z", title: "t", sessionId: "s-d" })); // other tenant
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState), /different tenant/);
    rmSync(path.join(src.scheduledDir, "d.json"));
    writeFileSync(src.operationsFile, "{corrupt");                                              // corrupt operations
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState));
    writeFileSync(src.operationsFile, JSON.stringify({ version: 1, tenantId: "other", operations: {} })); // wrong tenant
    assert.throws(() => readLiveJobs(src, now, readWebinarOperationState), /Invalid webinar/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
