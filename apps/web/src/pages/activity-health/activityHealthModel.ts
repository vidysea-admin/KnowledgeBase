export const activityStatuses = ["pending", "processing", "done", "failed"] as const;
export const activityErrorClasses = ["cancelled", "timeout-or-failure", "deadline-or-attempts-exhausted", "configuration", "invalid-job", "operation-failed", "unknown",
  "lease-expired", "run-missing", "bad-payload", "plan-invalid", "bad-node-result", "run-failed"] as const;
export interface ActivityJob {
  /** Absent = upload-queue; "job-queue" = D-139 dead job in the file job queue (D-158). */
  source?: "job-queue";
  id: string;
  status: typeof activityStatuses[number];
  createdAt: string;
  updatedAt: string | null;
  deadlineAt: string | null;
  attempts: number;
  maxAttempts: number;
  automaticRetryCount: number;
  errorClass: typeof activityErrorClasses[number] | null;
}
export interface ActivitySnapshot { jobs: ActivityJob[]; limit: number; truncated: boolean; observedAt: string }
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}
/** Allowlisted response projection: unknown fields and unsafe error details never reach rendering. */
export function readActivitySnapshot(value: unknown): ActivitySnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid activity response");
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.jobs) || !Number.isInteger(row.limit) || Number(row.limit) < 1 || Number(row.limit) > 100 ||
      typeof row.truncated !== "boolean" || row.jobs.length > Number(row.limit) || row.truncated && row.jobs.length !== row.limit ||
      !timestamp(row.observedAt)) throw new Error("Invalid activity response");
  const seen = new Set<string>();
  const jobs = row.jobs.map((value: unknown): ActivityJob => {
    if (!value || typeof value !== "object") throw new Error("Invalid activity job");
    const job = value as Record<string, unknown>;
    if (job.source !== undefined) {
      if (job.source !== "job-queue" || typeof job.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(job.id) || seen.has("job-queue:" + job.id) || job.status !== "failed" ||
          !timestamp(job.createdAt) || !timestamp(job.updatedAt) || job.deadlineAt !== null || !Number.isInteger(job.maxAttempts) || Number(job.maxAttempts) < 1 || Number(job.maxAttempts) > 100 ||
          !Number.isInteger(job.attempts) || Number(job.attempts) < 0 || Number(job.attempts) > Number(job.maxAttempts) || job.automaticRetryCount !== Math.max(0, Number(job.attempts) - 1) ||
          !activityErrorClasses.includes(job.errorClass as ActivityJob["errorClass"] & string)) throw new Error("Invalid activity job");
      seen.add("job-queue:" + job.id);
      return { source: "job-queue", id: job.id, status: "failed", createdAt: job.createdAt, updatedAt: job.updatedAt, deadlineAt: null, attempts: Number(job.attempts),
        maxAttempts: Number(job.maxAttempts), automaticRetryCount: Number(job.automaticRetryCount), errorClass: job.errorClass as ActivityJob["errorClass"] };
    }
    if (typeof job.id !== "string" || !/^[a-f0-9]{64}$/.test(job.id) || seen.has(job.id) ||
        !activityStatuses.includes(job.status as ActivityJob["status"]) || !timestamp(job.createdAt) ||
        job.updatedAt !== null && !timestamp(job.updatedAt) || !timestamp(job.deadlineAt) ||
        ![1, 2].includes(Number(job.maxAttempts)) || typeof job.maxAttempts !== "number" ||
        !Number.isInteger(job.attempts) || Number(job.attempts) < 0 || Number(job.attempts) > Number(job.maxAttempts) ||
        job.automaticRetryCount !== Math.max(0, Number(job.attempts) - 1) ||
        job.errorClass !== null && !activityErrorClasses.includes(job.errorClass as ActivityJob["errorClass"] & string) ||
        job.status === "failed" && job.errorClass === null || job.status !== "failed" && job.errorClass !== null) throw new Error("Invalid activity job");
    seen.add(job.id);
    return { id: job.id, status: job.status as ActivityJob["status"], createdAt: job.createdAt, updatedAt: job.updatedAt as string | null,
      deadlineAt: job.deadlineAt, attempts: Number(job.attempts), maxAttempts: job.maxAttempts as number,
      automaticRetryCount: Number(job.automaticRetryCount), errorClass: job.errorClass as ActivityJob["errorClass"] };
  });
  return { jobs, limit: Number(row.limit), truncated: row.truncated, observedAt: row.observedAt };
}
export function activityHealthModel(snapshot: ActivitySnapshot) {
  const counts = { pending: 0, processing: 0, done: 0, failed: 0 };
  let retryCount = 0, latest: string | null = null, futureTimestampCount = 0;
  const observed = Date.parse(snapshot.observedAt);
  for (const job of snapshot.jobs) {
    counts[job.status]++; retryCount += job.automaticRetryCount;
    for (const time of [job.createdAt, job.updatedAt]) if (time !== null) {
      if (Date.parse(time) > observed) futureTimestampCount++;
      if (latest === null || Date.parse(time) > Date.parse(latest)) latest = time;
    }
  }
  return { counts, retryCount, latestQueueActivityAt: latest, returned: snapshot.jobs.length,
    total: snapshot.truncated ? null : snapshot.jobs.length, observedAt: snapshot.observedAt, futureTimestampCount };
}
