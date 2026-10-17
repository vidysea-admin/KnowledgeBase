import test from "node:test";
import assert from "node:assert/strict";
import { collectNotifications } from "../activity-health/notifications.js";
import { notificationWindow } from "./notification-window.js";
test("real accepted collector produces file-queue shape and digest receives bounded safe failure counts", async () => {
  const output = await collectNotifications({ activityHealth: { readActivityHealth: async () => { throw new Error("Unavailable source"); } }, jobs: { listJobs: async () => ({ jobs: [], limit: 50, truncated: false }) }, watchRuns: { readWatchRuns: async () => ({ runs: [], truncated: false }) }, fileQueue: { listDeadJobs: async (tenant, limit) => { assert.equal(tenant, "fixture-tenant"); assert.equal(limit, 50); return { jobs: [{ id: "dead-1", errorCode: "lease-expired", at: Date.parse("2026-10-14T00:00:00Z") }], truncated: false }; } } }, "fixture-tenant", 50);
  assert.deepEqual(output, { notifications: [{ id: "file-queue:dead-1", source: "file-queue", severity: "error", title: "Pipeline run failed", detail: "Kind: pipeline-run; reason: worker lease expired", occurredAt: "2026-10-14T00:00:00.000Z" }], limit: 50, truncated: false, sources: { uploadQueue: "unavailable", providerJobs: "ok", watcher: "ok", fileQueue: "ok" } });
  const window = notificationWindow(output); assert.equal(window.bySource["file-queue"], 1); assert.deepEqual(window.unavailable, ["uploadQueue"]); assert.equal(JSON.stringify(window).includes("dead-1"), false);
});
