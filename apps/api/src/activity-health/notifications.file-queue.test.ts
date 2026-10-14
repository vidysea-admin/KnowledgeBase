// ISS-FAILEDJOB-001 / D-139: terminally failed file-queue ("dead") jobs surface in /notifications, tenant-scoped, redacted. Fakes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectNotifications, fileQueueErrorLabel, type FileQueueDeadDeps, type NotificationsDeps } from "./notifications.js";

const T0 = Date.parse("2026-10-12T10:00:00.000Z");
const SECRET = "sk-LEAK /srv/secret/path stack at Error";
const dead: Record<string, { id: string; errorCode: string | null; at: number }[]> = {
  A: [{ id: "runA-g0", errorCode: "plan-invalid", at: T0 }, { id: "runA2-g0", errorCode: SECRET, at: T0 - 1000 }, { id: "runA3", errorCode: "bad-media", at: T0 - 2000 }],
  B: [{ id: "B-ONLY-JOB", errorCode: "run-failed", at: T0 + 5000 }],
};
const calls: { tenant: string; limit: number }[] = [];
const fileQueue: FileQueueDeadDeps = { listDeadJobs: async (t, l) => { calls.push({ tenant: t, limit: l }); const r = dead[t] ?? []; return { jobs: r.slice(0, l), truncated: r.length > l }; } };
const none = async () => { throw new Error("unused"); };
function base(over: Partial<NotificationsDeps> = {}): NotificationsDeps {
  return {
    activityHealth: { readActivityHealth: async (_t, l) => ({ jobs: [], limit: l, truncated: false, observedAt: "2026-10-12T12:00:00.000Z" }) },
    jobs: { listJobs: async (_t, l) => ({ jobs: [], limit: l, truncated: false }) as never },
    watchRuns: { readWatchRuns: async () => ({ runs: [], truncated: false }) },
    ...over,
  };
}

test("a dead file-queue job appears for its own tenant, redacted to fixed labels", async () => {
  const r = await collectNotifications(base({ fileQueue }), "A", 10);
  assert.deepEqual(r.notifications.map(n => n.id), ["file-queue:runA-g0", "file-queue:runA2-g0", "file-queue:runA3"]);
  assert.equal(r.sources.fileQueue, "ok");
  const first = r.notifications[0]!;
  assert.deepEqual(first, { id: "file-queue:runA-g0", source: "file-queue", severity: "error", title: "Pipeline run failed", detail: "Kind: pipeline-run; reason: run plan invalid", occurredAt: "2026-10-12T10:00:00.000Z" });
  const text = JSON.stringify(r);
  for (const leak of ["sk-LEAK", "secret", "stack at", "bad-media", "\"errorCode\"", "tenant"]) assert.ok(!text.includes(leak), leak);
  assert.equal(r.notifications[1]!.detail, "Kind: pipeline-run; reason: unrecognised");
  assert.equal(r.notifications[2]!.detail, "Kind: pipeline-run; reason: unrecognised");
});

test("it does not appear for another tenant, and the reader is only asked for the caller's tenant", async () => {
  calls.length = 0;
  const b = await collectNotifications(base({ fileQueue }), "B", 10);
  assert.deepEqual(b.notifications.map(n => n.id), ["file-queue:B-ONLY-JOB"]);
  const z = await collectNotifications(base({ fileQueue }), "Z", 10);
  assert.deepEqual(z.notifications, []);
  const a = JSON.stringify(await collectNotifications(base({ fileQueue }), "A", 10));
  assert.ok(!a.includes("B-ONLY-JOB"));
  assert.deepEqual(calls.map(c => c.tenant), ["B", "Z", "A"]);
});

test("an empty file queue (or none wired) changes nothing", async () => {
  const empty = await collectNotifications(base({ fileQueue: { listDeadJobs: async () => ({ jobs: [], truncated: false }) } }), "A", 5);
  assert.deepEqual(empty.notifications, []); assert.equal(empty.sources.fileQueue, "ok");
  const unwired = await collectNotifications(base(), "A", 5);
  assert.deepEqual(unwired, { notifications: [], limit: 5, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } });
});

test("limit and truncation reach the file queue; a failing or malformed reader degrades only itself", async () => {
  calls.length = 0;
  const one = await collectNotifications(base({ fileQueue }), "A", 1);
  assert.equal(one.notifications.length, 1); assert.equal(one.truncated, true); assert.equal(calls[0]!.limit, 1);
  const boom = await collectNotifications(base({ fileQueue: { listDeadJobs: async () => { throw new Error(SECRET); } } }), "A", 5);
  assert.equal(boom.sources.fileQueue, "unavailable"); assert.ok(!JSON.stringify(boom).includes("sk-LEAK"));
  for (const bad of [{ id: "a/b", errorCode: null, at: T0 }, { id: "ok", errorCode: null, at: -1 }, { id: "ok", errorCode: null, at: 1.5 }, { id: "", errorCode: null, at: T0 }]) {
    const r = await collectNotifications(base({ fileQueue: { listDeadJobs: async () => ({ jobs: [bad], truncated: false }) } }), "A", 5);
    assert.equal(r.sources.fileQueue, "unavailable", JSON.stringify(bad));
  }
  // all four failing is still the all-unavailable error
  const d = { activityHealth: { readActivityHealth: none }, jobs: { listJobs: none }, watchRuns: { readWatchRuns: none }, fileQueue: { listDeadJobs: none } };
  await assert.rejects(collectNotifications(d as never, "A", 5));
});

test("error label allow-list: prototype keys and non-strings are unrecognised", () => {
  for (const c of ["__proto__", "constructor", "toString", null, 5, undefined, ""]) assert.equal(fileQueueErrorLabel(c), "unrecognised", String(c));
  assert.equal(fileQueueErrorLabel("lease-expired"), "worker lease expired");
});
