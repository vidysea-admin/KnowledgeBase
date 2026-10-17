import { consumedSourceResult } from "./receipt.js";
import type { SourceJobWorkerDeps } from "./types.js";

/** One claimed attempt; provider work is outside the spool lock and never runs inside enqueue/poll. */
export async function runSourceJob(deps: SourceJobWorkerDeps, tenantId: string, workerId: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  const job = await deps.store.claim(tenantId, workerId);
  if (!job) return false;
  const attempt = job.attemptId!;
  let lost = false, renewing = false;
  const renew = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void deps.store.renew(tenantId, job.jobId, attempt).then(ok => { if (!ok) lost = true; }, () => { lost = true; }).finally(() => { renewing = false; });
  }, 15_000);
  const interrupted = () => { lost = true; void deps.store.uncertain(tenantId, job.jobId, attempt, "worker-interrupted").catch(() => {}); };
  signal?.addEventListener("abort", interrupted, { once: true });
  try {
    if (!await deps.authorizeExecution(Object.freeze(structuredClone(job)))) {
      await deps.store.uncertain(tenantId, job.jobId, attempt, "authorization-unavailable"); return true;
    }
    if (signal?.aborted || lost) return true;
    const result = deps.executeJob ? await deps.executeJob(Object.freeze(structuredClone(job)))
      : await deps.intake.intake({ tenantId: job.tenantId, url: job.url });
    if (signal?.aborted || lost) return true;
    if (!consumedSourceResult(result)) {
      await deps.store.uncertain(tenantId, job.jobId, attempt, "indexing-incomplete"); return true;
    }
    await deps.store.finish(tenantId, job.jobId, attempt, result);
  } catch {
    await deps.store.uncertain(tenantId, job.jobId, attempt, "execution-unconfirmed").catch(() => {});
  } finally {
    clearInterval(renew); signal?.removeEventListener("abort", interrupted);
  }
  return true;
}
