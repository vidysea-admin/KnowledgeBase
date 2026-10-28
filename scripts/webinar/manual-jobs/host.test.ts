import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createManagedSendNowDeps } from "./host.js";
import { ManualJobStore } from "../../../packages/meeting-bot/src/manual-jobs/store.js";
import { startTestServer } from "../../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeCalendarReadDeps, fakeKeyStore } from "../../../apps/api/src/fixtures.js";

const NOW = new Date("2026-10-14T10:00:00.000Z"), URL_OK = "https://meet.google.com/abc-defg-hij";
const KEYS = { a: { tenantId: "a", scopes: ["send-now"] }, b: { tenantId: "b", scopes: ["send-now"] }, read: { tenantId: "a", scopes: ["calendar"] } };
async function fixture(fn: (url: string, store: ManualJobStore, count: () => number, restart: () => ReturnType<typeof createManagedSendNowDeps>) => Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), "managed-send-now-")), jobsDir = path.join(root, "jobs"); let started = 0;
  const options = { root, jobsDir, now: () => NOW, hostTenant: () => "a", readLiveJobs: () => [], validateUntil: () => {}, startWorker: async () => { started++; } };
  const deps = createManagedSendNowDeps(options);
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar: { ...fakeCalendarReadDeps(), sendNow: deps } }));
  try { await fn(server.baseUrl, new ManualJobStore(jobsDir, () => NOW), () => started, () => createManagedSendNowDeps(options)); }
  finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
}
const request = async (base: string, route: string, key: string | null, body?: unknown) => {
  const r = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, json: await r.json() as any };
};
test("real API/managed host persists dispatch, restart denies duplicate, then same-key list/detail/cancel consume durable job", async () => fixture(async (base, store, count, restart) => {
  const sent = await request(base, "/calendar/send-now", "a", { meetingUrl: `${URL_OK}?authuser=0`, until: "2026-10-14T11:00:00Z" });
  assert.equal(sent.status, 202); assert.equal(count(), 1);
  const id = sent.json.jobId, req = store.readRequest("a", id)!;
  assert.equal(req.until, "2026-10-14T11:00:00.000Z");
  const afterRestart = await restart().plan("a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  assert.ok(!afterRestart.ok); if (!afterRestart.ok) assert.equal(afterRestart.kind, "duplicate");
  const list = await request(base, "/calendar/send-now/jobs", "a");
  assert.equal(list.status, 200); assert.equal(list.json.jobs[0].jobId, id);
  assert.equal((await request(base, `/calendar/send-now/jobs/${id}`, "a")).json.state, "queued");
  assert.equal((await request(base, `/calendar/send-now/jobs/${id}/cancel`, "a", {})).json.state, "cancel-requested");
  assert.equal((await request(base, `/calendar/send-now/jobs/${id}/cancel`, "a", {})).json.state, "cancel-requested");
  assert.ok(store.cancellation(req));
  const metadata = JSON.stringify(list.json);
  for (const secret of [req.meetingUrl, req.meetingKey, req.nonce, "authuser"]) assert.ok(!metadata.includes(secret));
  store.writeProgress(req, "cancel-acknowledged");
  assert.equal((await request(base, `/calendar/send-now/jobs/${id}`, "a")).json.state, "cancel-acknowledged");
  store.writeProgress(req, "cancelled");
  assert.equal((await request(base, `/calendar/send-now/${id}`, "a")).json.status, "not-running");
  // The atomic durable owner, rather than stale legacy ten-minute memory, governs a terminal job's redelivery.
  const again = await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  assert.equal(again.status, 202); assert.notEqual(again.json.jobId, id); assert.equal(count(), 2);
  assert.equal((await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" })).status, 409);
  assert.equal(count(), 2);
}));
test("all durable routes require exact scope and owning tenant; forged body/query/path cannot control jobs", async () => fixture(async (base, store, count) => {
  const sent = await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  const id = sent.json.jobId;
  for (const route of ["/calendar/send-now/jobs", `/calendar/send-now/jobs/${id}`]) {
    assert.equal((await request(base, route, null)).status, 401);
    assert.equal((await request(base, route, "read")).status, 403);
    assert.equal((await request(base, route, "b")).status, 403);
    assert.equal((await request(base, `${route}?tenantId=b`, "a")).status, 400);
  }
  for (const key of [null, "read", "b"]) assert.ok([401, 403].includes((await request(base, `/calendar/send-now/jobs/${id}/cancel`, key, {})).status));
  assert.equal((await request(base, `/calendar/send-now/jobs/${id}/cancel`, "a", { tenantId: "b" })).status, 400);
  assert.equal((await request(base, "/calendar/send-now/jobs/not-a-job/cancel", "a", {})).status, 400);
  assert.equal(store.cancellation(store.readRequest("a", id)!), false); assert.equal(count(), 1);
}));
test("unsupported URLs do not start worker; malformed ownership state is unavailable rather than empty", async () => fixture(async (base, store, count) => {
  for (const meetingUrl of ["https://meet.google.com.evil.example/abc-defg-hij", "https://u:pass@meet.google.com/abc-defg-hij", "https://meet.google.com/", "http://meet.google.com/abc-defg-hij"]) {
    assert.equal((await request(base, "/calendar/send-now", "a", { meetingUrl, until: "2026-10-14T11:00:00Z" })).status, 400);
  }
  assert.equal(count(), 0);
  const sent = await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  writeFileSync(path.join(store.dir, "a", `${sent.json.jobId}.state.json`), "not JSON");
  const list = await request(base, "/calendar/send-now/jobs", "a");
  assert.equal(list.status, 503); assert.ok(!JSON.stringify(list.json).includes(store.dir));
  const plan = await createManagedSendNowDeps({ root: path.dirname(store.dir), jobsDir: store.dir, now: () => NOW, hostTenant: () => "a", readLiveJobs: () => [], validateUntil: () => {} }).plan("a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  assert.ok(!plan.ok); if (!plan.ok) assert.equal(plan.kind, "unreadable");
}));
test("API itself projects private host metadata out of list/detail/cancel responses", async () => {
  const job = { jobId: "send-now-20261014100000-abcdef", platform: "meet", state: "running" as const, requestedAt: NOW.toISOString(), updatedAt: NOW.toISOString(), joined: "unknown" as const,
    meetingUrl: "private-passcode", nonce: "private-nonce", pid: 123, token: "private-token", path: "private-path" };
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar: { ...fakeCalendarReadDeps(), sendNow: {
    plan: () => ({ ok: false as const, kind: "invalid" as const, reason: "unused", message: "unused" }),
    launch: async () => { throw new Error("unused"); }, manualJobs: { list: () => [job], detail: () => job, cancel: () => job },
  } } }));
  try {
    for (const [route, body] of [["/calendar/send-now/jobs", undefined], [`/calendar/send-now/jobs/${job.jobId}`, undefined], [`/calendar/send-now/jobs/${job.jobId}/cancel`, {}]] as const) {
      const response = await request(server.baseUrl, route, "a", body);
      assert.ok([200, 202].includes(response.status));
      assert.ok(!JSON.stringify(response.json).includes("private-"));
      assert.ok(!JSON.stringify(response.json).includes('"pid"'));
    }
  } finally { await server.close(); }
});
test("managed adapter does not disclose base reader paths or tokens in planner refusals", async () => {
  const deps = createManagedSendNowDeps({ hostTenant: () => "a", now: () => NOW, validateUntil: () => {},
    readLiveJobs: () => { throw new Error("private-path private-token"); } });
  const refused = await deps.plan("a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  assert.ok(!refused.ok); if (!refused.ok) { assert.equal(refused.kind, "unreadable"); assert.ok(!JSON.stringify(refused).includes("private-")); }
});

test("cancel intent before worker/readiness never reports a running recorder", async () => fixture(async (base, store) => {
  const sent = await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  const id = sent.json.jobId, req = store.readRequest("a", id)!;
  await request(base, `/calendar/send-now/jobs/${id}/cancel`, "a", {});
  const status = () => request(base, `/calendar/send-now/${id}`, "a");
  assert.equal((await status()).json.status, "launching");
  store.writeProgress(req, "cancel-requested", false);
  assert.equal((await status()).json.status, "launching");
  store.writeProgress(req, "cancel-requested", true);
  assert.equal((await status()).json.status, "running");
  store.writeProgress(req, "cancel-acknowledged", true);
  assert.equal((await status()).json.status, "running");
  store.writeProgress(req, "cancelled", true);
  assert.equal((await status()).json.status, "not-running");
}));

test("actual shared CLI lists the real managed API's durable job without private metadata", { timeout: 30_000 }, async () => fixture(async (base, store, count) => {
  const sent = await request(base, "/calendar/send-now", "a", { meetingUrl: URL_OK, until: "2026-10-14T11:00:00Z" });
  assert.equal(sent.status, 202);
  const entry = fileURLToPath(new URL("../../../packages/meeting-bot/src/cli.ts", import.meta.url));
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", entry, "manual-jobs", "list"], {
    cwd: repo, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LKB_API_URL: base, LKB_API_KEY: "a" },
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data.toString(); });
  child.stderr.on("data", data => { stderr += data.toString(); });
  const exit = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(exit, 0, stderr);
  const listed = JSON.parse(stdout);
  assert.equal(listed.jobs[0].jobId, sent.json.jobId);
  assert.equal(listed.jobs[0].state, "queued");
  assert.equal(listed.jobs[0].joined, "unknown");
  const req = store.readRequest("a", sent.json.jobId)!;
  for (const secret of [req.meetingUrl, req.meetingKey, req.nonce]) assert.ok(!stdout.includes(secret));
  assert.equal(count(), 1);
}));
