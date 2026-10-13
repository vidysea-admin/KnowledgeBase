// ISS-FAILEDJOB-001 / D-139 / D-158: dead file-queue jobs in the /system-status snapshot (source "job-queue"). Fakes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { requireAuth } from "../auth.js";
import { createActivityHealthRouter } from "./router.js";
import { withFileQueueActivity, type FileQueueActivityDeps } from "./file-queue-activity.js";
import { jobQueueErrorClass, projectActivitySnapshot, type ActivityHealthDeps } from "./types.js";

const hex = (c: string) => c.repeat(64);
const T = Date.parse("2026-10-12T10:00:00.000Z");
const uploadRow = { id: hex("a"), status: "failed", createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-12T08:30:00.000Z", deadlineAt: "2026-10-12T09:00:00.000Z", attempts: 2, maxAttempts: 2, automaticRetryCount: 1, errorClass: "timeout-or-failure" };
const SECRET = "sk-LEAK /srv/secret/path";
const dead: Record<string, { id: string; errorCode: string | null; at: number; enqueuedAt: number; attempt: number; maxAttempts: number }[]> = {
  A: [{ id: "runA-g0", errorCode: "plan-invalid", at: T, enqueuedAt: T - 60000, attempt: 3, maxAttempts: 3 }, { id: "runA2", errorCode: SECRET, at: T - 1000, enqueuedAt: T - 90000, attempt: 1, maxAttempts: 3 }],
  B: [{ id: "B-ONLY", errorCode: "run-failed", at: T, enqueuedAt: T - 1, attempt: 1, maxAttempts: 3 }],
};
const calls: string[] = [];
const fq: FileQueueActivityDeps = { listDeadJobs: async (t, l) => { calls.push(t); const r = dead[t] ?? []; return { jobs: r.slice(0, l), truncated: r.length > l }; } };
const upload: ActivityHealthDeps = { readActivityHealth: async (t, l) => ({ jobs: t === "A" ? [uploadRow as never] : [], limit: l, truncated: false, observedAt: "2026-10-12T12:00:00.000Z" }) };

test("a job-queue dead row shows with source=job-queue for its own tenant only; upload rows are byte-identical", async () => {
  const a = await withFileQueueActivity(upload, fq).readActivityHealth("A", 10);
  assert.equal(JSON.stringify(a.jobs.find(j => j.id === hex("a"))), JSON.stringify(uploadRow));
  const jq = a.jobs.filter(j => j.source === "job-queue");
  assert.deepEqual(jq.map(j => j.id), ["runA-g0", "runA2"]);
  assert.deepEqual(jq[0], { source: "job-queue", id: "runA-g0", status: "failed", createdAt: "2026-10-12T09:59:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", deadlineAt: null, attempts: 3, maxAttempts: 3, automaticRetryCount: 2, errorClass: "plan-invalid" });
  const b = await withFileQueueActivity(upload, fq).readActivityHealth("B", 10);
  assert.deepEqual(b.jobs.map(j => j.id), ["B-ONLY"]);
  assert.ok(!JSON.stringify(a).includes("B-ONLY") && !JSON.stringify(b).includes("runA"));
  const c = await withFileQueueActivity(upload, fq).readActivityHealth("C", 10);
  assert.deepEqual(c.jobs, []);
});

test("an unknown error code maps to the allow-list fallback and the raw code never leaves", async () => {
  const a = await withFileQueueActivity(upload, fq).readActivityHealth("A", 10);
  assert.equal(a.jobs.find(j => j.id === "runA2")?.errorClass, "unknown");
  assert.ok(!JSON.stringify(a).includes("sk-LEAK"));
  for (const c of ["__proto__", "constructor", null, 5, "", "bad-media"]) assert.equal(jobQueueErrorClass(c), "unknown", String(c));
  assert.equal(jobQueueErrorClass("lease-expired"), "lease-expired");
});

test("no dead jobs changes nothing; limit and truncation hold; a failing file queue fails closed; only the caller's tenant is asked", async () => {
  const empty: FileQueueActivityDeps = { listDeadJobs: async () => ({ jobs: [], truncated: false }) };
  const base = await upload.readActivityHealth("A", 5);
  assert.deepEqual(await withFileQueueActivity(upload, empty).readActivityHealth("A", 5), base);
  const one = await withFileQueueActivity(upload, fq).readActivityHealth("A", 2);
  assert.equal(one.jobs.length, 2); assert.equal(one.truncated, true);
  projectActivitySnapshot(one, 2);
  await assert.rejects(withFileQueueActivity(upload, { listDeadJobs: async () => { throw new Error(SECRET); } }).readActivityHealth("A", 5));
  calls.length = 0; await withFileQueueActivity(upload, fq).readActivityHealth("B", 5); assert.deepEqual(calls, ["B"]);
});

test("projectActivitySnapshot rejects malformed job-queue rows and unknown sources", () => {
  const ok = { source: "job-queue", id: "r1", status: "failed", createdAt: "2026-10-12T09:59:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", deadlineAt: null, attempts: 1, maxAttempts: 3, automaticRetryCount: 0, errorClass: "run-failed" };
  const snap = (j: object) => ({ jobs: [j], limit: 5, truncated: false, observedAt: "2026-10-12T12:00:00.000Z" });
  projectActivitySnapshot(snap(ok), 5);
  for (const bad of [{ ...ok, source: "x" }, { ...ok, id: "a/b" }, { ...ok, status: "done" }, { ...ok, errorClass: "raw text" }, { ...ok, deadlineAt: "2026-10-12T09:00:00.000Z" }, { ...ok, attempts: 4 }, { ...ok, updatedAt: null }, { ...ok, maxAttempts: 101 }])
    assert.throws(() => projectActivitySnapshot(snap(bad), 5), JSON.stringify(bad));
});

test("HTTP: /activity-health serves the merged rows per tenant", async () => {
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async k => k === "A" || k === "B" ? { tenantId: k, scopes: ["jobs"] } : null }));
  app.use(createActivityHealthRouter(withFileQueueActivity(upload, fq)));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  try {
    const get = async (k: string) => (await (await fetch(`http://127.0.0.1:${addr.port}/activity-health`, { headers: { authorization: `Bearer ${k}` } })).json()) as { jobs: { id: string; source?: string }[] };
    assert.deepEqual((await get("B")).jobs.map(j => [j.id, j.source]), [["B-ONLY", "job-queue"]]);
    assert.ok((await get("A")).jobs.some(j => j.id === "runA-g0" && j.source === "job-queue"));
  } finally { await new Promise<void>(r => server.close(() => r())); }
});

test("file-queue truncation alone marks the snapshot truncated", async () => {
  const trunc: FileQueueActivityDeps = { listDeadJobs: async () => ({ jobs: dead.B!, truncated: true }) };
  const r = await withFileQueueActivity(upload, trunc).readActivityHealth("B", 1);
  assert.equal(r.jobs.length, 1); assert.equal(r.truncated, true);
});
