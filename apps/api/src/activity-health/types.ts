export const activityStatuses = ["pending", "processing", "done", "failed"] as const;
export const activityErrorClasses = ["cancelled", "timeout-or-failure", "deadline-or-attempts-exhausted", "configuration", "invalid-job", "operation-failed", "unknown",
  // job-queue (packages/core file queue, D-139/D-158) allow-list; any other recorded code maps to "unknown"
  "lease-expired", "run-missing", "bad-payload", "plan-invalid", "bad-node-result", "run-failed"] as const;
export const activitySources = ["upload-queue", "job-queue"] as const;
const jobQueueClasses: ReadonlySet<string> = new Set(["lease-expired", "run-missing", "bad-payload", "plan-invalid", "bad-node-result", "run-failed"]);
/** Fixed allow-list for file-queue error codes; stage codes are arbitrary text, so anything else is the fixed unknown class. */
export const jobQueueErrorClass = (code: unknown): typeof activityErrorClasses[number] => typeof code === "string" && jobQueueClasses.has(code) ? code as typeof activityErrorClasses[number] : "unknown";
export interface ActivityJob {
  /** Absent = upload-queue (rows are byte-identical to before D-158); "job-queue" = D-139 dead job in the packages/core file queue. */
  source?: "job-queue";
  id: string;
  status: typeof activityStatuses[number];
  createdAt: string;
  updatedAt: string | null;
  /** null only for source "job-queue" rows (the file queue records no deadline). */
  deadlineAt: string | null;
  attempts: number;
  maxAttempts: number;
  automaticRetryCount: number;
  errorClass: typeof activityErrorClasses[number] | null;
}
export interface ActivitySnapshot { jobs: ActivityJob[]; limit: number; truncated: boolean; observedAt: string }
export interface ActivityHealthDeps { readActivityHealth(tenantId: string, limit: number): Promise<ActivitySnapshot>; close?(): Promise<void> }
export function assertActivityLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid activity limit");
}
/** Reject invalid calendar dates before canonicalizing recorded queue timestamps. */
export function queueTimestamp(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid queue timestamp");
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  const epoch = Date.parse(value);
  if (!match || !Number.isFinite(epoch)) throw new Error("Invalid queue timestamp");
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || Number(day) < 1 || Number(day) > days[m - 1]! || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) throw new Error("Invalid queue timestamp");
  return new Date(epoch).toISOString();
}
const jobQueueId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function projectJobQueueRow(job: Record<string, unknown>, seen: Set<string>): ActivityJob {
  if (job.source !== "job-queue" || typeof job.id !== "string" || !jobQueueId.test(job.id) || seen.has("job-queue:" + job.id) || job.status !== "failed" ||
      !Number.isInteger(job.maxAttempts) || Number(job.maxAttempts) < 1 || Number(job.maxAttempts) > 100 ||
      !Number.isInteger(job.attempts) || Number(job.attempts) < 0 || Number(job.attempts) > Number(job.maxAttempts) ||
      job.automaticRetryCount !== Math.max(0, Number(job.attempts) - 1) || job.deadlineAt !== null || job.updatedAt === null ||
      !activityErrorClasses.includes(job.errorClass as ActivityJob["errorClass"] & string)) throw new Error("Invalid activity job");
  seen.add("job-queue:" + job.id);
  return { source: "job-queue", id: job.id, status: "failed", createdAt: queueTimestamp(job.createdAt), updatedAt: queueTimestamp(job.updatedAt), deadlineAt: null,
    attempts: Number(job.attempts), maxAttempts: Number(job.maxAttempts), automaticRetryCount: Number(job.automaticRetryCount), errorClass: job.errorClass as ActivityJob["errorClass"] };
}
/** Reproject injected reader results at HTTP serialization; never serialize arbitrary dependencies. */
export function projectActivitySnapshot(value: unknown, limit: number): ActivitySnapshot {
  assertActivityLimit(limit);
  if (!value || typeof value !== "object") throw new Error("Invalid activity response");
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.jobs) || row.limit !== limit || typeof row.truncated !== "boolean" || row.jobs.length > limit ||
      row.truncated && row.jobs.length !== limit) throw new Error("Invalid activity response");
  const seen = new Set<string>();
  const jobs = row.jobs.map((value: unknown): ActivityJob => {
    if (!value || typeof value !== "object") throw new Error("Invalid activity job");
    const job = value as Record<string, unknown>;
    if (job.source !== undefined) return projectJobQueueRow(job, seen);
    if (typeof job.id !== "string" || !/^[a-f0-9]{64}$/.test(job.id) || seen.has(job.id) ||
        !activityStatuses.includes(job.status as ActivityJob["status"]) || ![1, 2].includes(Number(job.maxAttempts)) ||
        typeof job.maxAttempts !== "number" || !Number.isInteger(job.attempts) || Number(job.attempts) < 0 || Number(job.attempts) > Number(job.maxAttempts) ||
        job.automaticRetryCount !== Math.max(0, Number(job.attempts) - 1) ||
        job.errorClass !== null && !activityErrorClasses.includes(job.errorClass as ActivityJob["errorClass"] & string) ||
        job.status === "failed" && job.errorClass === null || job.status !== "failed" && job.errorClass !== null) throw new Error("Invalid activity job");
    seen.add(job.id);
    return { id: job.id, status: job.status as ActivityJob["status"], createdAt: queueTimestamp(job.createdAt),
      updatedAt: job.updatedAt === null ? null : queueTimestamp(job.updatedAt), deadlineAt: queueTimestamp(job.deadlineAt),
      attempts: Number(job.attempts), maxAttempts: job.maxAttempts as 1 | 2,
      automaticRetryCount: Number(job.automaticRetryCount), errorClass: job.errorClass as ActivityJob["errorClass"] };
  });
  return { jobs, limit, truncated: row.truncated, observedAt: queueTimestamp(row.observedAt) };
}
