import type { VerifiedKey } from "../auth.js";
import type { SourceJobView } from "../source-intake/jobs/types.js";
import type { WatchedJobSnapshot } from "../source-intake/jobs/types.js";
import { connectorText, ConnectorWorkflowError, type ConnectorWorkflowDeps } from "./types.js";
import { consumeConnectorIntake } from "./intake-consumption.js";

/** Never serialize private spool inputs, approvals, index diagnostics, or bearer URLs. */
export function connectorJobView(job: SourceJobView): SourceJobView {
  return { jobId: job.jobId, state: job.state, revision: job.revision, createdAt: job.createdAt, updatedAt: job.updatedAt,
    ...(job.reason ? { reason: job.reason } : {}),
    ...(job.state === "succeeded" && job.result ? { result: { sessionId: job.result.sessionId, sourceId: job.result.sourceId,
      ...(job.result.turnCount === undefined ? {} : { turnCount: job.result.turnCount }) } } : {}) };
}
export async function enqueueConnectorJob(auth: VerifiedKey, url: string, requestId: unknown, deps: ConnectorWorkflowDeps, watchedSnapshot?: WatchedJobSnapshot): Promise<SourceJobView> {
  deps.store.assertWritableTenant(auth.tenantId);
  if (!deps.sourceJobs || !auth.keyId) throw new ConnectorWorkflowError(503, "source_jobs_unconfigured");
  const idempotencyKey = connectorText(requestId, 128);
  const actorKeyId = auth.keyId;
  return connectorJobView(await deps.sourceJobs.enqueue({ tenantId: auth.tenantId, actorKeyId, url, idempotencyKey,
    ...(watchedSnapshot ? { watchedSnapshot } : {}) }, async input => {
    if (input.tenantId !== auth.tenantId || input.actorKeyId !== actorKeyId || !auth.scopes.includes("ingest") ||
        (watchedSnapshot && !auth.scopes.includes("sources"))) {
      throw new ConnectorWorkflowError(403, "source_job_approval_refused");
    }
    return { approvedBy: actorKeyId, approvalRef: `connector-${deps.newId()}` };
  }));
}
async function jobFailureGap(tenantId: string, jobId: string, deps: ConnectorWorkflowDeps): Promise<string> {
  const id = `source-job-${jobId}`;
  const existing = await deps.store.findGap(tenantId, id);
  if (existing) {
    if (existing.tenantId !== tenantId || existing.kind !== "source-pending" ||
        (existing.status !== "open" && !await deps.store.reopenSourceJobFailure(tenantId, jobId))) {
      throw new ConnectorWorkflowError(503, "source_job_gap_unconfirmed");
    }
    return id;
  }
  const now = deps.now();
  try {
    await deps.store.createGap(tenantId, { _id: id, kind: "source-pending", status: "open",
      description: "Connector action required: source-job-unconfirmed", requestedFrom: "tenant-owner", requestedAt: now,
      sla: { dueAt: new Date(Date.parse(now) + 3 * 86400000).toISOString() } });
  } catch (error) {
    if (!await deps.store.findGap(tenantId, id)) throw error;
  }
  return id;
}

/** Completion from the worker is rechecked against real tenant artifacts, never blindly retried. */
export async function checkConnectorJob(tenantId: string, id: string, deps: ConnectorWorkflowDeps): Promise<{ job: SourceJobView; gapId?: string }> {
  deps.store.assertWritableTenant(tenantId);
  if (!deps.sourceJobs) throw new ConnectorWorkflowError(503, "source_jobs_unconfigured");
  const raw = await deps.sourceJobs.poll(tenantId, id);
  if (!raw) throw new ConnectorWorkflowError(404, "source_job_not_found");
  const job = connectorJobView(raw);
  if (job.state === "uncertain") return { job, gapId: await jobFailureGap(tenantId, job.jobId, deps) };
  if (job.state !== "succeeded") return { job };
  try {
    const result = await deps.sourceJobs.completed(tenantId, job.jobId);
    if (!result || result.indexing?.status !== "done" || result.sessionId !== job.result?.sessionId || result.sourceId !== job.result?.sourceId) {
      throw new ConnectorWorkflowError(502, "source_job_consumption_unconfirmed");
    }
    await consumeConnectorIntake(tenantId, result, deps);
    if (!await deps.store.hasConsumedSource(tenantId, result.sourceId, result.sessionId)) {
      throw new ConnectorWorkflowError(502, "source_job_consumption_unconfirmed");
    }
    if (!await deps.store.resolveSourceJobFailure(tenantId, job.jobId, result.sourceId)) {
      throw new ConnectorWorkflowError(409, "gap_conflict");
    }
    return { job };
  } catch {
    await jobFailureGap(tenantId, job.jobId, deps);
    throw new ConnectorWorkflowError(502, "source_job_consumption_unconfirmed");
  }
}
