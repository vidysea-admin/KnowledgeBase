/**
 * apps/api/src/activity-health/file-queue-activity.ts - ISS-FAILEDJOB-001 / D-139 / D-158.
 * Adds the tenant's terminally failed ("dead") packages/core FILE-queue jobs to the /system-status snapshot as `source: "job-queue"` rows.
 * Upload-queue rows pass through untouched (no `source` key). The error code is mapped through the fixed allow-list (jobQueueErrorClass); raw codes never leave.
 * Read-only; the tenant is the verified caller's and is the only tenant ever passed to the file-queue reader. No dead jobs = the upload snapshot is returned as is.
 */
import { jobQueueErrorClass, queueTimestamp, type ActivityHealthDeps, type ActivityJob, type ActivitySnapshot } from "./types.js";
import type { FileQueueDeadDeps } from "./notifications.js";

export interface FileQueueActivityDeps { listDeadJobs(tenantId: string, limit: number): Promise<{ jobs: { id: string; errorCode: string | null; at: number; enqueuedAt: number; attempt: number; maxAttempts: number }[]; truncated: boolean }> }
export function withFileQueueActivity(upload: ActivityHealthDeps, fileQueue: FileQueueActivityDeps): ActivityHealthDeps {
  return {
    async readActivityHealth(tenantId, limit): Promise<ActivitySnapshot> {
      const base = await upload.readActivityHealth(tenantId, limit);
      const dead = await fileQueue.listDeadJobs(tenantId, limit);
      if (!dead || !Array.isArray(dead.jobs) || typeof dead.truncated !== "boolean" || dead.jobs.length > limit) throw new Error("Invalid file queue response");
      if (dead.jobs.length === 0 && !dead.truncated) return base;
      const extra = dead.jobs.map((j): ActivityJob => ({
        source: "job-queue", id: j.id, status: "failed", createdAt: queueTimestamp(new Date(j.enqueuedAt).toISOString()), updatedAt: queueTimestamp(new Date(j.at).toISOString()), deadlineAt: null,
        attempts: j.attempt, maxAttempts: j.maxAttempts, automaticRetryCount: Math.max(0, j.attempt - 1), errorClass: jobQueueErrorClass(j.errorCode) }));
      const all = [...base.jobs, ...extra].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // stable: upload rows keep their relative order
      return { jobs: all.slice(0, limit), limit, truncated: base.truncated || dead.truncated || all.length > limit, observedAt: base.observedAt };
    },
    close: () => upload.close?.() ?? Promise.resolve(),
  };
}
export type { FileQueueDeadDeps };
