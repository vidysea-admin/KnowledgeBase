/**
 * apps/api/src/join-rules/send-now.test.ts - T-039 `t039-send-now-api-endpoint`. The REAL createServer (auth, router) with a FAKE
 * plan/launch: nothing is spawned, no browser, no network beyond the loopback test listener.
 * Run: node --test --import tsx apps/api/src/join-rules/send-now.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeCalendarReadDeps, fakeKeyStore } from "../fixtures.js";
import { RECENT_LAUNCH_MS, SEND_NOW_SCOPE, type SendNowDeps, type SendNowPlanValue } from "./send-now.js";

const KEYS = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "send-now"] },
  "b-key": { tenantId: "tenant-b", scopes: ["send-now"] },
  "read-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules", "ask"] },
  "near-key": { tenantId: "tenant-a", scopes: ["send-now-x", "send", "now", "SEND-NOW"] },
};
const URL_OK = "https://meet.google.com/abc-defg-hij";
interface Fake { deps: SendNowDeps; plans: { tenantId: string; req: unknown }[]; launches: { tenantId: string; url: string; until: string }[]; failLaunch: boolean; planResult?: SendNowPlanValue; clock: number; gate?: Promise<void> }
function fake(): Fake {
  const f: Fake = { plans: [], launches: [], failLaunch: false, clock: 1_000_000, deps: undefined as never };
  f.deps = {
    now: () => f.clock,
    plan: (tenantId, req) => { f.plans.push({ tenantId, req }); return f.planResult ?? { ok: true, meetingUrl: req.meetingUrl, meetingKey: "meet:abc-defg-hij", platform: "meet" }; },
    launch: async (tenantId, plan, until) => {
      if (f.gate) await f.gate;
      if (f.failLaunch) throw new Error("spawn EACCES secret-detail");
      f.launches.push({ tenantId, url: plan.meetingUrl, until }); return { jobId: `job-${f.launches.length}` };
    },
  };
  return f;
}
async function serve(f: Fake | null) {
  const calendar = { ...fakeCalendarReadDeps(), ...(f ? { sendNow: f.deps } : {}) };
  const s = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar }));
  const post = async (key: string | null, body: unknown, raw?: string) => {
    const r = await fetch(`${s.baseUrl}/calendar/send-now`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: raw ?? JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  return { post, close: s.close };
}
const ok = { meetingUrl: URL_OK, until: "18:00" };

test("scope: send-now required (exact match); calendar/read keys and near-miss scopes get 403 and nothing runs; no key is 401", async () => {
  const f = fake(), s = await serve(f);
  try {
    for (const k of ["read-key", "near-key"]) { const r = await s.post(k, ok); assert.equal(r.status, 403, k); assert.equal(r.json.error, "forbidden"); }
    assert.equal((await s.post(null, ok)).status, 401);
    assert.deepEqual([f.plans.length, f.launches.length], [0, 0]);
    const r = await s.post("a-key", ok);
    assert.equal(r.status, 202);
  } finally { await s.close(); }
});

test("happy path: 202 with jobId/status/meetingKey; launch got the planned URL and until; tenant is the key's tenant", async () => {
  const f = fake(), s = await serve(f);
  try {
    const r = await s.post("a-key", ok);
    assert.equal(r.status, 202);
    assert.deepEqual(r.json, { jobId: "job-1", status: "launching", meetingKey: "meet:abc-defg-hij", platform: "meet" });
    assert.deepEqual(f.launches, [{ tenantId: "tenant-a", url: URL_OK, until: "18:00" }]);
  } finally { await s.close(); }
});

test("tenant isolation: only req.auth.tenantId reaches plan/launch; a body tenantId (or any extra field) is a 400 before anything runs", async () => {
  const f = fake(), s = await serve(f);
  try {
    assert.equal((await s.post("b-key", ok)).status, 202);
    assert.deepEqual(f.plans.map((p) => p.tenantId), ["tenant-b"]);
    assert.equal(f.launches[0]!.tenantId, "tenant-b");
    for (const extra of [{ tenantId: "tenant-a" }, { tenant: "tenant-a" }, { x: 1 }]) assert.equal((await s.post("b-key", { ...ok, ...extra })).status, 400);
    assert.equal(f.plans.length, 1);
    assert.deepEqual(f.plans[0]!.req, ok); // the planner sees exactly url + until
  } finally { await s.close(); }
});

test("tenant isolation: tenant A's launch does not make tenant B's same meeting a duplicate", async () => {
  const f = fake(), s = await serve(f);
  try {
    assert.equal((await s.post("a-key", ok)).status, 202);
    assert.equal((await s.post("b-key", ok)).status, 202);
    assert.equal((await s.post("a-key", ok)).status, 409);
  } finally { await s.close(); }
});

test("bad body: not an object, missing/empty/non-string/over-long fields -> 400, nothing planned", async () => {
  const f = fake(), s = await serve(f);
  try {
    const bad: unknown[] = [null, [], "x", {}, { meetingUrl: URL_OK }, { until: "18:00" }, { meetingUrl: "", until: "18:00" }, { meetingUrl: 5, until: "18:00" },
      { meetingUrl: URL_OK, until: "" }, { meetingUrl: URL_OK, until: 1800 }, { meetingUrl: "https://meet.google.com/" + "a".repeat(2100), until: "18:00" }, { meetingUrl: URL_OK, until: "x".repeat(65) }];
    for (const b of bad) assert.equal((await s.post("a-key", b)).status, 400, JSON.stringify(b)?.slice(0, 60));
    assert.equal((await s.post("a-key", null, "{not json")).status, 400);
    assert.equal(f.plans.length, 0);
  } finally { await s.close(); }
});

test("invalid link refused by the planner: 400 with reason and message, launcher never called", async () => {
  const f = fake(), s = await serve(f);
  try {
    f.planResult = { ok: false, kind: "invalid", reason: "unsupported-host", message: "evil.example is not a supported meeting platform" };
    const r = await s.post("a-key", { meetingUrl: "https://evil.example/x", until: "18:00" });
    assert.equal(r.status, 400);
    assert.deepEqual([r.json.error, r.json.reason], ["send_now_refused", "unsupported-host"]);
    assert.equal(f.launches.length, 0);
    f.planResult = { ok: false, kind: "invalid", reason: "invalid-until", message: "bad time soon" };
    assert.equal((await s.post("a-key", { meetingUrl: URL_OK, until: "soon" })).status, 400);
    assert.equal(f.launches.length, 0);
  } finally { await s.close(); }
});

test("duplicate: planner sees a live job -> 409, no launch; second POST after our own launch -> 409; the router memory expires", async () => {
  const f = fake(), s = await serve(f);
  try {
    f.planResult = { ok: false, kind: "duplicate", reason: "duplicate-live-job", message: "a bot is already queued" };
    const r = await s.post("a-key", ok);
    assert.deepEqual([r.status, r.json.error, r.json.reason], [409, "send_now_duplicate", "duplicate-live-job"]);
    assert.equal(f.launches.length, 0);
    f.planResult = undefined;
    assert.equal((await s.post("a-key", ok)).status, 202);
    assert.equal((await s.post("a-key", ok)).status, 409);
    assert.equal(f.launches.length, 1);
    f.clock += RECENT_LAUNCH_MS + 1; // the router's own memory expires; the planner remains the authority
    assert.equal((await s.post("a-key", ok)).status, 202);
  } finally { await s.close(); }
});

test("duplicate: two concurrent requests for one meeting launch exactly one bot", async () => {
  const f = fake(), s = await serve(f);
  try {
    let release!: () => void; f.gate = new Promise<void>((r) => { release = r; });
    const first = s.post("a-key", ok);
    await new Promise((r) => setTimeout(r, 100));
    const second = await s.post("a-key", ok);
    assert.equal(second.status, 409);
    release();
    assert.equal((await first).status, 202);
    assert.equal(f.launches.length, 1);
  } finally { await s.close(); }
});

test("launcher failure is reported honestly: 502, no success fields, cause not leaked, and a retry is allowed", async () => {
  const f = fake(), s = await serve(f);
  try {
    f.failLaunch = true;
    const r = await s.post("a-key", ok);
    assert.equal(r.status, 502);
    assert.equal(r.json.error, "send_now_launch_failed");
    assert.equal(r.json.jobId, undefined);
    assert.ok(!JSON.stringify(r.json).includes("secret-detail"));
    f.failLaunch = false;
    assert.equal((await s.post("a-key", ok)).status, 202);
  } finally { await s.close(); }
});

test("state unreadable -> 503, tenant not served -> 403, planner throwing -> 503; never launches", async () => {
  const f = fake(), s = await serve(f);
  try {
    f.planResult = { ok: false, kind: "unreadable", reason: "live-jobs-unreadable", message: "cannot tell" };
    assert.equal((await s.post("a-key", ok)).status, 503);
    f.planResult = { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "no" };
    assert.equal((await s.post("a-key", ok)).status, 403);
    f.planResult = undefined; f.deps.plan = () => { throw new Error("boom"); };
    const r = await s.post("a-key", ok);
    assert.equal(r.status, 503); assert.ok(!JSON.stringify(r.json).includes("boom"));
    assert.equal(f.launches.length, 0);
  } finally { await s.close(); }
});

test("no launcher injected: scoped key gets a fail-closed 503, an unscoped key 403", async () => {
  const s = await serve(null);
  try {
    assert.equal((await s.post("a-key", ok)).status, 503);
    assert.equal((await s.post("read-key", ok)).status, 403);
  } finally { await s.close(); }
});

test("ruling 6 / ISS-SENDNOWAPI-004: a plain apps/api start (no sendNow dep) answers 503 pointing at the join-rules API host, without leaking internals", async () => {
  const s = await serve(null);
  try {
    const r = await s.post("a-key", ok);
    assert.equal(r.status, 503);
    assert.equal(r.json.error, "send_now_unavailable");
    assert.equal(r.json.message, "send-now is served by the join-rules API host; no bot was sent");
    assert.deepEqual(Object.keys(r.json).sort(), ["error", "message"]);
    assert.doesNotMatch(JSON.stringify(r.json), /scripts|\.ts|MONGODB|stack|ENOENT/i);
  } finally { await s.close(); }
});

test("minting: send-now is never in a default key; it is issued only when asked for by name; typos and other names are refused", async () => {
  const { DEFAULT_SCOPES, WRITE_SCOPES, scopesFromArgv } = await import("../../../../scripts/lib/mint-scopes.mjs");
  assert.equal(SEND_NOW_SCOPE, "send-now");
  assert.deepEqual(WRITE_SCOPES, [SEND_NOW_SCOPE, "join-rules"]);
  assert.ok(!DEFAULT_SCOPES.includes(SEND_NOW_SCOPE));
  assert.deepEqual(scopesFromArgv([]), DEFAULT_SCOPES);
  assert.deepEqual(scopesFromArgv(["--tenant", "toc", "--label", "live-verify"]), DEFAULT_SCOPES);
  assert.deepEqual(DEFAULT_SCOPES, ["ask", "compete", "sources", "sessions", "search", "citations", "webhooks", "gaps", "graph", "calendar", "gmail", "whatsapp", "keys", "ingest"]); // the pre-T-039 set, unchanged
  assert.deepEqual(scopesFromArgv(["--with-scope", "send-now"]), [...DEFAULT_SCOPES, "send-now"]);
  assert.deepEqual(scopesFromArgv(["--with-scope", "send-now", "--with-scope", "send-now"]), [...DEFAULT_SCOPES, "send-now"]);
  for (const bad of [["--with-scope"], ["--with-scope", "--tenant"], ["--with-scope", "send-nowx"], ["--with-scope", "keys"], ["--with-scope", "send-now,admin"]]) {
    assert.throws(() => scopesFromArgv(bad), /with-scope/, bad.join(" "));
  }
  const src = readFileSync(new URL("../../../../scripts/mint-key.mjs", import.meta.url), "utf8");
  assert.ok(/scopesFromArgv\(process\.argv/.test(src) && !/ALL_SCOPES/.test(src), "mint-key mints exactly what scopesFromArgv returns");
});
