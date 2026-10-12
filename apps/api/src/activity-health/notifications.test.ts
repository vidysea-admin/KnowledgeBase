import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { requireAuth } from "../auth.js";
import { createNotificationsRouter, collectNotifications, type NotificationsDeps, type NotificationsResponse } from "./notifications.js";

const hex = (c: string) => c.repeat(64);
const SECRET = "sk-LEAK /srv/secret/digest.md stack at Error";
// Per-tenant fixtures; readers HONOUR the tenant argument, so a cross-tenant leak is expressible.
const queueRows: Record<string, unknown[]> = {
  A: [
    { id: hex("a"), status: "failed", createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:30:00.000Z", deadlineAt: "2026-10-12T09:00:00.000Z", attempts: 2, maxAttempts: 2, automaticRetryCount: 1, errorClass: "timeout-or-failure" },
    { id: hex("b"), status: "done", createdAt: "2026-10-12T07:00:00.000Z", updatedAt: null, deadlineAt: "2026-10-12T09:00:00.000Z", attempts: 1, maxAttempts: 2, automaticRetryCount: 0, errorClass: null },
  ],
  B: [{ id: hex("c"), status: "failed", createdAt: "2026-10-12T06:00:00.000Z", updatedAt: null, deadlineAt: "2026-10-12T09:00:00.000Z", attempts: 1, maxAttempts: 1, automaticRetryCount: 0, errorClass: "configuration" }],
};
const jobRows: Record<string, unknown[]> = {
  A: [{ _id: "pj-A", kind: "transcribe", status: "failed", createdAt: "2026-10-12T05:00:00Z", provider: "gemini", error: SECRET }, { _id: "pj-A2", kind: "x", status: "done", createdAt: "2026-10-12T05:00:00Z" }],
  B: [{ _id: "pj-B", kind: "B-ONLY-KIND", status: "failed", createdAt: "2026-10-12T04:00:00Z" }],
};
const runRows: Record<string, unknown[]> = {
  A: [{ _id: "w-A", runAt: "2026-10-12T10:00:00Z", mode: "watch", digestPath: "qa/watch/secret-a.md", driveNewFound: 2, driveIngested: 1, driveFailed: 1, errors: [SECRET, "x"] },
      { _id: "w-A0", runAt: "2026-10-11T10:00:00Z", mode: "ingest", driveFailed: 0 }],
  B: [{ _id: "w-B", runAt: "2026-10-12T11:00:00Z", mode: "watch", errors: ["B-ONLY"] }],
};
const calls: { src: string; tenant: string; limit: number }[] = [];
function deps(over: Partial<NotificationsDeps> = {}): NotificationsDeps {
  return {
    activityHealth: { readActivityHealth: async (t, l) => { calls.push({ src: "q", tenant: t, limit: l }); const jobs = (queueRows[t] ?? []).slice(0, l);
      return { jobs, limit: l, truncated: (queueRows[t] ?? []).length > l, observedAt: "2026-10-12T12:00:00.000Z" } as never; } },
    jobs: { listJobs: async (t, l) => { calls.push({ src: "j", tenant: t, limit: l }); return { jobs: (jobRows[t] ?? []).slice(0, l), limit: l, truncated: (jobRows[t] ?? []).length > l } as never; } },
    watchRuns: { readWatchRuns: async (t, l) => { calls.push({ src: "w", tenant: t, limit: l }); return { runs: (runRows[t] ?? []).slice(0, l), truncated: (runRows[t] ?? []).length > l }; } },
    ...over,
  };
}
async function fixture(d: NotificationsDeps, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async (key) => key === "A" || key === "B" ? { tenantId: key, scopes: ["jobs"] } : key === "noscope" ? { tenantId: "A", scopes: ["sessions"] } : null }));
  app.use(createNotificationsRouter(d));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const a = server.address(); assert.ok(a && typeof a !== "string");
  try { await run(`http://127.0.0.1:${a.port}`); } finally { await new Promise<void>((r) => server.close(() => r())); }
}
const as = (key: string) => ({ headers: { authorization: `Bearer ${key}` } });
const get = async (url: string, key: string) => (await fetch(url, as(key))).json() as Promise<NotificationsResponse>;

test("auth and the jobs scope are enforced before any read", async () => {
  calls.length = 0;
  await fixture(deps(), async (url) => {
    assert.equal((await fetch(`${url}/notifications`)).status, 401);
    assert.equal((await fetch(`${url}/notifications`, as("bogus"))).status, 401);
    assert.equal((await fetch(`${url}/notifications`, as("noscope"))).status, 403);
    assert.deepEqual(calls, []);
    assert.equal((await fetch(`${url}/notifications`, as("A"))).status, 200);
  });
});

test("two tenants: each sees only its own failures, merged newest first; tenant selectors refused", async () => {
  calls.length = 0;
  await fixture(deps(), async (url) => {
    const a = await (await fetch(`${url}/notifications`, { headers: { authorization: "Bearer A", "x-tenant-id": "B" } })).json() as NotificationsResponse;
    assert.deepEqual(a.notifications.map((n) => n.id), ["watcher:w-A", "upload-queue:" + hex("a"), "provider-jobs:pj-A"]);
    assert.deepEqual(a.sources, { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" });
    assert.equal(a.truncated, false);
    const b = await get(`${url}/notifications`, "B");
    assert.deepEqual(b.notifications.map((n) => n.id).sort(), ["provider-jobs:pj-B", "upload-queue:" + hex("c"), "watcher:w-B"]);
    const aText = JSON.stringify(a), bText = JSON.stringify(b);
    assert.ok(!aText.includes("B-ONLY") && !aText.includes("pj-B") && !bText.includes("pj-A") && !bText.includes("w-A"));
    for (const q of ["tenantId=B", "tenant=B", "limit=0", "limit=101", "limit=1&limit=2", "limit=1e1", "limit=01", "status=x"]) assert.equal((await fetch(`${url}/notifications?${q}`, as("A"))).status, 400, q);
    assert.ok(calls.length === 6 && calls.every((c) => c.tenant === "A" || c.tenant === "B"));
    assert.deepEqual([...new Set(calls.slice(0, 3).map((c) => c.tenant))], ["A"]);
  });
});

test("no stored error text, paths, secrets or raw fields are served", async () => {
  await fixture(deps(), async (url) => {
    const text = JSON.stringify(await get(`${url}/notifications`, "A"));
    for (const leak of ["sk-LEAK", "secret", "digestPath", "stack at", "\"error\":", "tenantId", "deadlineAt", "\"errors\":"]) assert.ok(!text.includes(leak), leak);
    const n = (await get(`${url}/notifications`, "A")).notifications;
    for (const item of n) assert.deepEqual(Object.keys(item).sort(), ["detail", "id", "occurredAt", "severity", "source", "title"]);
    assert.equal(n.find((x) => x.source === "provider-jobs")?.detail, "Kind: transcribe; Provider: gemini");
  });
  // Free-text kind/provider that is not a plain token is dropped, not echoed.
  const odd = deps({ jobs: { listJobs: async (_t, l) => ({ jobs: [{ _id: "p", kind: "bad kind <script>", status: "failed", createdAt: "2026-10-12T05:00:00Z", provider: "a/b c" }], limit: l, truncated: false }) } });
  await fixture(odd, async (url) => {
    const p = (await get(`${url}/notifications`, "A")).notifications.find((x) => x.source === "provider-jobs");
    assert.equal(p?.detail, null);
  });
});

test("limit is bounded and truncation is flagged; sources get the same bounded limit", async () => {
  calls.length = 0;
  await fixture(deps(), async (url) => {
    const one = await get(`${url}/notifications?limit=1`, "A");
    assert.equal(one.notifications.length, 1); assert.equal(one.limit, 1); assert.equal(one.truncated, true);
    assert.ok(calls.every((c) => c.limit === 1));
    const dflt = await get(`${url}/notifications`, "A");
    assert.equal(dflt.limit, 50); assert.ok(calls.slice(-3).every((c) => c.limit === 50));
  });
});

test("a failing source is reported unavailable, the others still answer; all failing is 503 with a fixed body", async () => {
  await fixture(deps({ jobs: { listJobs: async () => { throw new Error(SECRET); } } }), async (url) => {
    const r = await (await fetch(`${url}/notifications`, as("A"))).json() as NotificationsResponse;
    assert.deepEqual(r.sources, { uploadQueue: "ok", providerJobs: "unavailable", watcher: "ok" });
    assert.deepEqual(r.notifications.map((n) => n.source).sort(), ["upload-queue", "watcher"]);
    assert.ok(!JSON.stringify(r).includes("sk-LEAK"));
  });
  // A malformed row from one reader also degrades only that source.
  await fixture(deps({ watchRuns: { readWatchRuns: async () => ({ runs: [{ _id: "x", runAt: "nope", mode: "watch" }], truncated: false }) } }), async (url) => {
    assert.equal((await get(`${url}/notifications`, "A")).sources.watcher, "unavailable");
  });
  const boom = async () => { throw new Error(SECRET); };
  await fixture({ activityHealth: { readActivityHealth: boom }, jobs: { listJobs: boom }, watchRuns: { readWatchRuns: boom } }, async (url) => {
    const res = await fetch(`${url}/notifications`, as("A")); assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "notifications_unavailable", message: "Notifications are unavailable for this tenant" });
  });
});

test("empty data answers 200 with an empty list; collectNotifications rejects bad inputs", async () => {
  await fixture(deps(), async (url) => {
    const r = await get(`${url}/notifications`, "A");
    assert.ok(r.notifications.length > 0);
  });
  const empty = await collectNotifications(deps(), "Z", 5);
  assert.deepEqual(empty, { notifications: [], limit: 5, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } });
  await assert.rejects(collectNotifications(deps(), " ", 5));
  await assert.rejects(collectNotifications(deps(), "A", 101));
});
