/**
 * ISS-T039CMD-001 / -002 at the API adapter: `POST /calendar/send-now` must see a recording that ANOTHER path started (manual `lkb record`,
 * poller, scheduler, an earlier send-now), through the REAL reader (no `readLiveJobs` override): 409 while it runs, 503 when the view
 * cannot be read, and a dead holder never blocks. Fakes only; the only child is the argv-dump fixture, and only in the launch case.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "../../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeCalendarReadDeps, fakeKeyStore } from "../../../apps/api/src/fixtures.js";
import { createSendNowDeps } from "./send-now-host.js";
import { claimLiveRecording, liveRecordingDir } from "../../../packages/meeting-bot/src/live-recording/live-recording.js";

const FIXTURE = path.join(import.meta.dirname, "..", "argv-dump-fixture.mjs");
const MEET = "https://meet.google.com/abc-defg-hij";
const NOW = new Date(2026, 9, 12, 10, 0, 0);
const KEYS = { "a-key": { tenantId: "tenant-a", scopes: ["send-now"] } };

async function withHost(fn: (post: (body: unknown) => Promise<{ status: number; json: any }>, root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), "send-now-live-"));
  const s = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar: { ...fakeCalendarReadDeps(), sendNow: createSendNowDeps({
    root, now: () => NOW, hostTenant: () => "tenant-a", validateUntil: () => undefined, cliEntry: FIXTURE, livenessMs: 300 }) } }));
  const post = async (body: unknown) => {
    const r = await fetch(`${s.baseUrl}/calendar/send-now`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer a-key" }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as any };
  };
  try { await fn(post, root); } finally { await s.close(); try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch { /* log still open on Windows */ } }
}
// start time unknown -> only the pid is trusted (no powershell probe in the test)
const NO_START = { startTime: () => undefined };
const claim = (root: string, url: string, tenantId = "tenant-a") =>
  claimLiveRecording({ dir: liveRecordingDir(root), tenantId, meetingUrl: url, sessionId: "other-path", until: new Date(2026, 9, 12, 18, 0, 0) }, NOW, NO_START);

test("a recording claimed by another path (manual / poller / scheduler / earlier send-now) -> 409 duplicate through the real reader; nothing is launched", async () => {
  await withHost(async (post, root) => {
    const held = claim(root, "https://meet.google.com/ABC-defg-hij?authuser=1");
    assert.ok(held.ok);
    const r = await post({ meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.reason], [409, "duplicate-live-job"]);
    assert.equal((await post({ meetingUrl: "https://meet.google.com/zzz-yyyy-xxx", until: "18:00" })).status, 202, "a different meeting is not blocked");
    if (held.ok) held.release();
    assert.equal((await post({ meetingUrl: MEET, until: "18:00" })).status, 202, "released: no longer a duplicate");
  });
});

test("another tenant's claim of the same link does not block this tenant", async () => {
  await withHost(async (post, root) => {
    assert.ok(claim(root, MEET, "tenant-b").ok);
    assert.equal((await post({ meetingUrl: MEET, until: "18:00" })).status, 202);
  });
});

test("a holder whose process is gone does not block (no manual cleanup)", async () => {
  await withHost(async (post, root) => {
    const dead = claimLiveRecording({ dir: liveRecordingDir(root), tenantId: "tenant-a", meetingUrl: MEET, sessionId: "crashed", until: null }, NOW, NO_START, 2147483646);
    assert.ok(dead.ok);
    assert.equal((await post({ meetingUrl: MEET, until: "18:00" })).status, 202);
  });
});

test("unreadable live-recording view -> 503 live-jobs-unreadable (cannot tell), nothing launched", async () => {
  await withHost(async (post, root) => {
    const tdir = path.join(liveRecordingDir(root), "tenant-a");
    mkdirSync(tdir, { recursive: true });
    writeFileSync(path.join(tdir, "garbled.json"), "{ not json");
    const r = await post({ meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.reason], [503, "live-jobs-unreadable"]);
    assert.match(r.json.message ?? "", /cannot tell whether a bot is already in this meeting/);
    assert.deepEqual(readdirSync(path.join(root, "raw", "webinars")).filter((n) => n.endsWith(".log")), [], "no launch log: nothing was spawned");
  });
});
