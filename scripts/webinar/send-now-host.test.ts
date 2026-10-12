/**
 * scripts/webinar/send-now-host.test.ts - T-039 `t039-send-now-api-endpoint`. The real adapter (`createSendNowDeps`) behind the REAL
 * createServer. The only process ever spawned is `node argv-dump-fixture.mjs` (records its argv, exits or sleeps 8 s) - never the real
 * CLI, Chrome, OBS, a Python joiner or a meeting. Run: node --test --import tsx scripts/webinar/send-now-host.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeCalendarReadDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import { createSendNowDeps, type SendNowHostOptions } from "./send-now-host.js";

const FIXTURE = path.join(import.meta.dirname, "argv-dump-fixture.mjs");
const KEYS = { "a-key": { tenantId: "tenant-a", scopes: ["send-now"] }, "b-key": { tenantId: "tenant-b", scopes: ["send-now"] }, "ro-key": { tenantId: "tenant-a", scopes: ["calendar"] } };
const MEET = "https://meet.google.com/abc-defg-hij";
const NOW = new Date("2026-10-12T10:00:00Z");

async function withHost(opts: SendNowHostOptions, fn: (post: (key: string, body: unknown) => Promise<{ status: number; json: any }>, root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), "send-now-host-"));
  const s = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar: { ...fakeCalendarReadDeps(), sendNow: createSendNowDeps({ root, now: () => NOW, hostTenant: () => "tenant-a", validateUntil: (v) => { if (!/^\d\d:\d\d$/.test(v)) throw new Error(`bad time '${v}'`); }, ...opts }) } }));
  const post = async (key: string, body: unknown) => {
    const r = await fetch(`${s.baseUrl}/calendar/send-now`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as any };
  };
  try { await fn(post, root); } finally { await s.close(); delete process.env.LKB_FIXTURE_EXIT; delete process.env.LKB_ARGV_DUMP; try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch { /* child still holds its log open on Windows; temp dir */ } }
}
const fx = (extra: SendNowHostOptions = {}): SendNowHostOptions => ({ cliEntry: FIXTURE, livenessMs: 400, readLiveJobs: () => [], ...extra });

test("plan refusals through the real planner: hostile and unsupported links are 400 and nothing is launched (no log file is created)", async () => {
  await withHost(fx({ livenessMs: 1 }), async (post, root) => {
    for (const u of ["http://meet.google.com/abc-defg-hij", "https://evil.example/abc-defg-hij", "https://meet.google.com.evil.example/abc-defg-hij", "javascript:alert(1)", "https://u:pw@meet.google.com/abc-defg-hij",
      "https://meet.google.com/abc-defg-hij?redirect=https://evil.example", "https://meet.google.com:8443/abc-defg-hij", "https://meet.google.com/"]) {
      const r = await post("a-key", { meetingUrl: u, until: "18:00" });
      assert.equal(r.status, 400, u);
      assert.ok(!JSON.stringify(r.json).includes("pw@") && !JSON.stringify(r.json).includes(":pw"), "credentials must never be echoed");
    }
    assert.equal(existsSync(path.join(root, "raw")), false, "no launch happened");
  });
});

test("until: a bad value is 400 from the adapter's validator", async () => {
  await withHost(fx(), async (post) => {
    const r = await post("a-key", { meetingUrl: MEET, until: "tomorrow" });
    assert.deepEqual([r.status, r.json.reason], [400, "invalid-until"]);
  });
});

test("tenant: the host serves ONE capture tenant; another tenant's key is 403 even with the scope", async () => {
  await withHost(fx(), async (post, root) => {
    const r = await post("b-key", { meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.reason], [403, "tenant-not-served"]);
    assert.equal(existsSync(path.join(root, "raw")), false);
  });
});

test("duplicate: a live job for the same meeting (any spelling) -> 409; an ended job does not block", async () => {
  await withHost(fx({ readLiveJobs: () => [{ meetingUrl: "https://meet.google.com/ABC-defg-hij?authuser=1", status: "recording" }] }), async (post) => {
    const r = await post("a-key", { meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.reason], [409, "duplicate-live-job"]);
  });
  await withHost(fx({ readLiveJobs: () => [{ meetingUrl: MEET, status: "ready" }] }), async (post) => {
    process.env.LKB_FIXTURE_EXIT = "";
    assert.equal((await post("a-key", { meetingUrl: MEET, until: "18:00" })).status, 202);
  });
});

test("duplicate through the REAL live-job reader: a scheduled job file for the meeting -> 409; a corrupt one -> 503 (cannot tell), nothing launched", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "send-now-real-"));
  const sched = path.join(root, "raw", "webinars", "scheduled");
  mkdirSync(sched, { recursive: true });
  writeFileSync(path.join(sched, "job-1.json"), JSON.stringify({ url: MEET, sessionId: "s1", until: "2026-10-12T12:00:00Z" }));
  const deps = createSendNowDeps({ root, now: () => NOW, hostTenant: () => "tenant-a", validateUntil: () => undefined, cliEntry: FIXTURE, livenessMs: 1 });
  try {
    const dup = await deps.plan("tenant-a", { meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([dup.ok, !dup.ok && dup.kind], [false, "duplicate"]);
    const other = await deps.plan("tenant-a", { meetingUrl: "https://meet.google.com/zzz-yyyy-xxx", until: "18:00" });
    assert.equal(other.ok, true);
    writeFileSync(path.join(sched, "bad.json"), "{ not json");
    const bad = await deps.plan("tenant-a", { meetingUrl: "https://meet.google.com/zzz-yyyy-xxx", until: "18:00" });
    assert.deepEqual([bad.ok, !bad.ok && bad.kind], [false, "unreadable"]);
  } finally { try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); } catch { /* child still holds its log open on Windows; temp dir */ } }
});

test("live-job state unreadable (reader throws) -> 503 and nothing is launched", async () => {
  await withHost(fx({ readLiveJobs: () => { throw new Error("operations.json is corrupt"); } }), async (post, root) => {
    const r = await post("a-key", { meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.reason], [503, "live-jobs-unreadable"]);
    assert.equal(existsSync(path.join(root, "raw")), false);
  });
});

test("launch: 202 with a job id; the child got the validated URL and flags as separate argv entries (no shell), tenant from the key", async () => {
  await withHost(fx(), async (post, root) => {
    const dump = path.join(root, "argv.json");
    process.env.LKB_ARGV_DUMP = dump; process.env.LKB_FIXTURE_EXIT = "";
    const good = await post("a-key", { meetingUrl: MEET, until: "18:00" });
    assert.equal(good.status, 202);
    assert.match(good.json.jobId, /^send-now-\d{14}-[0-9a-f]{6}$/);
    assert.equal(good.json.status, "launching");
    const argv = JSON.parse(readFileSync(dump, "utf8")) as string[];
    assert.deepEqual(argv.slice(0, 4), ["record", MEET, "--until", "18:00"]);
    assert.deepEqual(argv.slice(4, 8), ["--tenant", "tenant-a", "--session-id", good.json.jobId]);
    assert.ok(existsSync(path.join(root, "raw", "webinars", `${good.json.jobId}.log`)));
  });
});

test("launcher that dies at once -> 502 (not 202); a missing node binary -> 502", async () => {
  await withHost(fx(), async (post) => {
    process.env.LKB_FIXTURE_EXIT = "1";
    const r = await post("a-key", { meetingUrl: MEET, until: "18:00" });
    assert.deepEqual([r.status, r.json.error, r.json.jobId], [502, "send_now_launch_failed", undefined]);
  });
  await withHost(fx({ nodeExe: path.join(os.tmpdir(), "no-such-node-binary.exe") }), async (post) => {
    assert.equal((await post("a-key", { meetingUrl: MEET, until: "18:00" })).status, 502);
  });
});

test("scope: a key with only calendar is 403 end to end", async () => {
  await withHost(fx(), async (post) => assert.equal((await post("ro-key", { meetingUrl: MEET, until: "18:00" })).status, 403));
});
