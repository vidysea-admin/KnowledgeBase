/**
 * apps/api/src/join-rules/send-now-status.test.ts - ISS-SENDNOWAPI-003 (status half). REAL createServer, FAKE deps; no process, browser or network.
 * Run: node --test --import tsx apps/api/src/join-rules/send-now-status.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeCalendarReadDeps, fakeKeyStore } from "../fixtures.js";
import type { SendNowDeps, SendNowStatusValue } from "./send-now.js";

const KEYS = {
  "a-key": { tenantId: "tenant-a", scopes: ["send-now"] },
  "b-key": { tenantId: "tenant-b", scopes: ["send-now"] },
  "cal-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "near-key": { tenantId: "tenant-a", scopes: ["send-now-x", "SEND-NOW"] },
};
const JOB = "send-now-20261012100000-abc123";
function fake(result: SendNowStatusValue | (() => never), withStatus = true) {
  const calls: { tenantId: string; jobId: string }[] = [], launches: unknown[] = [];
  const deps: SendNowDeps = {
    plan: () => ({ ok: true, meetingUrl: "https://meet.google.com/abc-defg-hij", meetingKey: "meet:abc-defg-hij", platform: "meet" }),
    launch: async () => { launches.push(1); return { jobId: JOB }; },
    ...(withStatus ? { status: (tenantId: string, jobId: string) => { calls.push({ tenantId, jobId }); return typeof result === "function" ? result() : result; } } : {}),
  };
  return { deps, calls, launches };
}
async function serve(deps: SendNowDeps | null) {
  const calendar = { ...fakeCalendarReadDeps(), ...(deps ? { sendNow: deps } : {}) };
  const s = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), calendar }));
  const get = async (key: string | null, id: string) => {
    const r = await fetch(`${s.baseUrl}/calendar/send-now/${id}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
    return { status: r.status, text: await r.text() };
  };
  return { get, close: s.close, baseUrl: s.baseUrl };
}
const json = (t: string) => JSON.parse(t);

test("200 running: body is process state only, joined is 'unknown', tenant comes from the key", async () => {
  const f = fake({ ok: true, status: "running", meetingKey: "meet:abc-defg-hij", startedAt: "2026-10-12T10:00:01.000Z", until: "2026-10-12T15:00:00.000Z" }), s = await serve(f.deps);
  try {
    const r = await s.get("a-key", JOB);
    assert.equal(r.status, 200);
    assert.deepEqual(json(r.text), { jobId: JOB, status: "running", meetingKey: "meet:abc-defg-hij", startedAt: "2026-10-12T10:00:01.000Z", until: "2026-10-12T15:00:00.000Z", joined: "unknown" });
    assert.deepEqual(f.calls, [{ tenantId: "tenant-a", jobId: JOB }]);
    await s.get("b-key", JOB);
    assert.equal(f.calls[1]!.tenantId, "tenant-b");
  } finally { await s.close(); }
});

test("launching and not-running pass through; no invented fields", async () => {
  for (const status of ["launching", "not-running"] as const) {
    const f = fake({ ok: true, status }), s = await serve(f.deps);
    try { assert.deepEqual(json((await s.get("a-key", JOB)).text), { jobId: JOB, status, joined: "unknown" }); } finally { await s.close(); }
  }
});

test("scope: send-now exact match; calendar/near-miss keys 403, no key 401, host never asked", async () => {
  const f = fake({ ok: true, status: "running" }), s = await serve(f.deps);
  try {
    for (const k of ["cal-key", "near-key"]) { const r = await s.get(k, JOB); assert.equal(r.status, 403, k); assert.equal(json(r.text).error, "forbidden"); }
    assert.equal((await s.get(null, JOB)).status, 401);
    assert.equal(f.calls.length, 0);
  } finally { await s.close(); }
});

test("malformed job ids are 400 before the host is asked", async () => {
  const f = fake({ ok: true, status: "running" }), s = await serve(f.deps);
  try {
    for (const id of ["x", "send-now-1-abc123", "send-now-20261012100000-ABC123", "send-now-20261012100000-abc12", "send-now-20261012100000-abc1234", "..%2F..%2Fetc", "send-now-20261012100000-abc123%0A", "job-1"]) {
      const r = await s.get("a-key", id); assert.equal(r.status, 400, id);
    }
    assert.equal(f.calls.length, 0);
  } finally { await s.close(); }
});

test("host refusals map: forbidden 403, unreadable 503; a throwing host is 503 without leaking the cause", async () => {
  let f = fake({ ok: false, kind: "forbidden", reason: "tenant-not-served", message: "this host does not capture for your tenant" }), s = await serve(f.deps);
  try { const r = await s.get("a-key", JOB); assert.equal(r.status, 403); assert.equal(json(r.text).reason, "tenant-not-served"); } finally { await s.close(); }
  f = fake({ ok: false, kind: "unreadable", reason: "live-recordings-unreadable", message: "cannot read" }); s = await serve(f.deps);
  try { assert.equal((await s.get("a-key", JOB)).status, 503); } finally { await s.close(); }
  f = fake(() => { throw new Error("EACCES C:\\secret\\path"); }); s = await serve(f.deps);
  try { const r = await s.get("a-key", JOB); assert.equal(r.status, 503); assert.ok(!r.text.includes("secret")); } finally { await s.close(); }
});

test("FLAG OFF: without deps.status the GET route is not mounted - the same response as a server with no send-now adapter; POST unchanged", async () => {
  const off = fake({ ok: true, status: "running" }, false), s = await serve(off.deps);
  const none = await serve(null);
  try {
    const a = await s.get("a-key", JOB), b = await none.get("a-key", JOB);
    assert.equal(a.status, 404);
    assert.deepEqual(a, b, "byte-identical to the behaviour before this slice");
    const post = await fetch(`${s.baseUrl}/calendar/send-now`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer a-key" }, body: JSON.stringify({ meetingUrl: "https://meet.google.com/abc-defg-hij", until: "18:00" }) });
    assert.equal(post.status, 202);
    assert.equal(off.launches.length, 1);
  } finally { await s.close(); await none.close(); }
});
