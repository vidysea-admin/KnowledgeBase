import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { PrivateSourceJournal, type SourceSpoolVerifier } from "./private-journal.js";
import type { HostingJournalRecord } from "../../hosting/types.js";
import type { SourceIntakeResult } from "../store.js";
import { actorIdentity, approvedSourceInput, digest, jobIdentity, sourceJobInputHash } from "./input.js";
import { consumedSourceResult } from "./receipt.js";
import { SourceJobError, type SourceJob, type SourceJobStore, type SourceJobView } from "./types.js";

export interface SourceJobStoreOptions { now?: () => number; newAttempt?: () => string; leaseMs?: number; verifier?: SourceSpoolVerifier }
const SETTLED = ["succeeded", "uncertain"];
const REDACTED = "redacted:sha256:";
/** Bearer/signed recording URLs are not retained once a job settles; only this one-way digest marker is written. */
export const redactedSourceUrl = (url: string): string => `${REDACTED}${createHash("sha256").update(url).digest("hex")}`;
const view = (job: SourceJob): SourceJobView => ({ jobId: job.jobId, state: job.state, revision: job.revision,
  createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.reason ? { reason: job.reason } : {}),
  ...(job.state === "succeeded" && job.result ? { result: { sessionId: job.result.sessionId, sourceId: job.result.sourceId,
    ...(job.result.status === "created" ? { turnCount: job.result.turnCount } : {}) } } : {}) });
function replay(rows: HostingJournalRecord[], tenant: string): Map<string, SourceJob> {
  const jobs = new Map<string, SourceJob>();
  for (const row of rows) {
    const job = row.data as SourceJob;
    if (row.operation !== "source.job" || !job || job.version !== 1 || job.tenantId !== tenant || job.jobId !== row.target ||
        !["queued", "running", "succeeded", "uncertain"].includes(job.state) || !Number.isSafeInteger(job.revision) || job.revision < 1 ||
        !job.approval || !job.approval.approvedBy || !job.approval.approvalRef) throw new SourceJobError("source_spool_corrupt");
    jobIdentity(job.jobId); actorIdentity(job.actorKeyId);
    const prior = jobs.get(job.jobId);
    // A settled row carries the digest marker instead of the URL (legacy settled rows may still hold it). The marker
    // is only trusted when it matches the URL of the prior row; its input hash and snapshot are then pinned to that row.
    const redacted = SETTLED.includes(job.state) && typeof job.url === "string" && job.url.startsWith(REDACTED);
    if (redacted && (!prior || job.url !== redactedSourceUrl(prior.url) || job.inputHash !== prior.inputHash ||
        JSON.stringify(job.watchedSnapshot) !== JSON.stringify(prior.watchedSnapshot))) throw new SourceJobError("source_spool_corrupt");
    const source = redacted ? undefined : approvedSourceInput({ ...job, tenantId: tenant, idempotencyKey: "stored" });
    if ((source && (source.url !== job.url || job.inputHash !== sourceJobInputHash(source) ||
        (job.watchedSnapshot !== undefined && JSON.stringify(job.watchedSnapshot) !== JSON.stringify(source.watchedSnapshot)))) ||
        (job.state === "running" && (!job.attemptId || !Number.isFinite(job.leaseUntil))) ||
        (job.state === "succeeded" && (!job.result || !consumedSourceResult(job.result) ||
          !job.result.sourceId.startsWith(`${encodeURIComponent(tenant)}:`)))) throw new SourceJobError("source_spool_corrupt");
    if ((!prior && (job.revision !== 1 || job.state !== "queued")) ||
        (prior && (prior.state === "succeeded" || prior.state === "uncertain" ||
          (prior.state === "queued" && job.state !== "running") || (prior.state === "running" && job.state === "queued")))) throw new SourceJobError("source_spool_corrupt");
    if (prior && (job.revision !== prior.revision + 1 || job.inputHash !== prior.inputHash || job.actorKeyId !== prior.actorKeyId ||
        (job.url !== prior.url && !redacted) || job.createdAt !== prior.createdAt || (prior.state === "running" && job.attemptId !== prior.attemptId) ||
        JSON.stringify(job.approval) !== JSON.stringify(prior.approval))) throw new SourceJobError("source_spool_corrupt");
    jobs.set(job.jobId, job);
  }
  return jobs;
}

/** Private fsynced append journal shared by API/worker. Expired claims are uncertainty, never replayable work. */
export function createSourceJobStore(root: string, options: SourceJobStoreOptions = {}): SourceJobStore {
  const journal = new PrivateSourceJournal(root, options.verifier), now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? 120_000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600_000) throw new SourceJobError("invalid_source_job_lease");
  const timestamp = () => new Date(now()).toISOString();
  const append = <T>(job: SourceJob, value: T) => ({ value, operation: "source.job", target: job.jobId, outcome: job.state, data: job });
  const change = (job: SourceJob, fields: Partial<SourceJob>): SourceJob => ({ ...job, ...fields, revision: job.revision + 1, updatedAt: timestamp() });
  /** Every transition into a settled state drops the retained URL. */
  const settle = (job: SourceJob, fields: Partial<SourceJob>): SourceJob => change(job, { ...fields, url: redactedSourceUrl(job.url) });
  const stale = (job: SourceJob) => job.state === "running" && job.leaseUntil! <= now();
  const update = async (tenant: string, id: string, attempt: string, mutate: (job: SourceJob) => SourceJob | null): Promise<SourceJob | null> => {
    actorIdentity(tenant); jobIdentity(id);
    return journal.transaction<SourceJob | null>(tenant, "source-worker", timestamp(), async rows => {
      const job = replay(rows, tenant).get(id);
      if (!job || job.state !== "running" || job.attemptId !== attempt) return { value: null };
      const next = stale(job) ? settle(job, { state: "uncertain", reason: "worker-interrupted" }) : mutate(job);
      return next ? append(next, next) : { value: null };
    });
  };
  return {
    async enqueue(input, authorize) {
      const snapshot = approvedSourceInput(input);
      const approval = await authorize(snapshot);
      if (!approval || approval.approvedBy !== snapshot.actorKeyId) throw new SourceJobError("source_approval_required", 403);
      actorIdentity(approval.approvalRef);
      const safeApproval = Object.freeze({ approvedBy: approval.approvedBy, approvalRef: approval.approvalRef,
        ...(approval.sourceAuthority ? { sourceAuthority: structuredClone(approval.sourceAuthority) } : {}) });
      const id = digest([snapshot.tenantId, snapshot.actorKeyId, snapshot.idempotencyKey]);
      const inputHash = sourceJobInputHash(snapshot);
      return journal.transaction<SourceJobView>(snapshot.tenantId, snapshot.actorKeyId, timestamp(), async rows => {
        const jobs = replay(rows, snapshot.tenantId), old = jobs.get(id);
        if (old) {
          if (old.inputHash !== inputHash) throw new SourceJobError("source_job_idempotency_conflict", 409);
          return { value: view(old) };
        }
        if (jobs.size >= 1000) throw new SourceJobError("source_job_capacity");
        const at = timestamp(), job: SourceJob = { version: 1, jobId: id, tenantId: snapshot.tenantId, actorKeyId: snapshot.actorKeyId,
          url: snapshot.url, ...(snapshot.watchedSnapshot ? { watchedSnapshot: snapshot.watchedSnapshot } : {}),
          inputHash, approval: safeApproval, state: "queued", revision: 1, createdAt: at, updatedAt: at };
        return append(job, view(job));
      });
    },
    async poll(tenant, id) {
      actorIdentity(tenant); jobIdentity(id);
      return journal.transaction<SourceJobView | null>(tenant, "source-reader", timestamp(), async rows => {
        const job = replay(rows, tenant).get(id);
        if (!job) return { value: null };
        if (!stale(job)) return { value: view(job) };
        const next = settle(job, { state: "uncertain", reason: "worker-interrupted" }); return append(next, view(next));
      });
    },
    async claim(tenant, workerId) {
      actorIdentity(tenant); actorIdentity(workerId);
      return journal.transaction<SourceJob | null>(tenant, workerId, timestamp(), async rows => {
        const jobs = [...replay(rows, tenant).values()], expired = jobs.find(stale);
        if (expired) return append(settle(expired, { state: "uncertain", reason: "worker-interrupted" }), null);
        const job = jobs.find(row => row.state === "queued");
        if (!job) return { value: null };
        const next = change(job, { state: "running", attemptId: options.newAttempt?.() ?? randomUUID(), leaseUntil: now() + leaseMs });
        return append(next, structuredClone(next));
      });
    },
    async completed(tenant, id) {
      actorIdentity(tenant); jobIdentity(id);
      return journal.transaction<SourceIntakeResult | null>(tenant, "source-reader", timestamp(), async rows => {
        const job = replay(rows, tenant).get(id);
        return { value: job?.state === "succeeded" && job.result ? consumedSourceResult(job.result) : null };
      });
    },
    async renew(tenant, id, attempt) {
      const job = await update(tenant, id, attempt, current => change(current, { leaseUntil: now() + leaseMs }));
      return job?.state === "running";
    },
    async finish(tenant, id, attempt, result) {
      const receipt = consumedSourceResult(result);
      if (!receipt || !receipt.sourceId.startsWith(`${encodeURIComponent(tenant)}:`)) throw new SourceJobError("source_job_indexing_incomplete", 502);
      const job = await update(tenant, id, attempt, current => settle(current, { state: "succeeded", result: receipt }));
      if (!job || job.state !== "succeeded") throw new SourceJobError("source_job_claim_lost", 409);
      return view(job);
    },
    async uncertain(tenant, id, attempt, reason) {
      await update(tenant, id, attempt, current => settle(current, { state: "uncertain", reason }));
    },
  };
}

export function createConfiguredSourceJobs(env: Record<string, string | undefined>): SourceJobStore | undefined {
  if (env.LKB_SOURCE_INTAKE !== "1" || !env.LKB_SOURCE_JOB_DIR) return undefined;
  const root = env.LKB_SOURCE_JOB_DIR;
  if (!isAbsolute(root) || /(?:^|[\\/])(?:public|wwwroot|static|assets)(?:[\\/]|$)/i.test(root) ||
      [env.LKB_HOSTING_STATE_DIR, env.LKB_COUNSELLOR_STATE_DIR].some(value => value && resolve(value).toLowerCase() === resolve(root).toLowerCase())) throw new SourceJobError("unsafe_source_spool");
  return createSourceJobStore(root);
}
