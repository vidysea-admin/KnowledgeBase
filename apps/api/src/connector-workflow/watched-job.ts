import { createUrlSource, intakeFromSource } from "@lkb/ingest";
import { approvedSourceInput, sourceJobInputHash } from "../source-intake/jobs/input.js";
import { SourceJobError, type SourceJob } from "../source-intake/jobs/types.js";
import type { SourceIntakeResult } from "../source-intake/store.js";
import { connectorSnapshotText } from "./snapshot.js";
import { assertConnectorIndexConsumed, type ConnectorWorkflowDeps } from "./types.js";

/** Worker-only: current actor authority is checked by the configured executor before entry.
 * The persisted guarded snapshot is the sole text source; this executor never fetches. */
export async function executeWatchedSnapshotJob(job: Readonly<SourceJob>, deps: ConnectorWorkflowDeps): Promise<SourceIntakeResult> {
  const input = approvedSourceInput({ ...job, idempotencyKey: "worker-execution" });
  const snapshot = input.watchedSnapshot;
  if (!snapshot || input.url !== job.url || sourceJobInputHash(input) !== job.inputHash ||
      job.approval.approvedBy !== job.actorKeyId || !job.approval.approvalRef || job.approval.sourceAuthority) {
    throw new SourceJobError("source_job_forbidden", 403);
  }
  deps.store.assertWritableTenant(job.tenantId);
  if (!deps.watched) throw new SourceJobError("watched_unconfigured");
  const rows = await deps.store.listWatched(job.tenantId);
  if (rows.some(row => row.tenantId !== job.tenantId)) throw new SourceJobError("watched_tenant_mismatch");
  const row = rows.find(row => row._id === snapshot.watchedSourceId);
  if (!row || !row.active || row.url !== job.url || (row.lastFetch?.hash ?? null) !== snapshot.previousHash) {
    throw new SourceJobError("watched_source_changed", 409);
  }
  const adapter = createUrlSource({ fetcher: async () => connectorSnapshotText(snapshot.text),
    hasher: () => snapshot.hash, now: () => snapshot.fetchedAt });
  const originalFetch = adapter.fetch.bind(adapter);
  adapter.fetch = async (source, consent) => {
    const result = await originalFetch(source, consent);
    result.source.sourceMeta = { watchedSourceId: row._id, fetchedAt: snapshot.fetchedAt, diffFrom: snapshot.previousHash };
    return result;
  };
  const result = await intakeFromSource({ kind: "url", url: job.url, tenantId: job.tenantId }, {
    captureMode: "public", given: true, recordedBy: "watched-source-verification",
  }, { adapters: [adapter], sink: deps.watched.sink, newId: deps.newId, now: () => snapshot.fetchedAt });
  const indexed = await deps.watched.indexSession(job.tenantId, result.sessionId);
  assertConnectorIndexConsumed(indexed, result.sessionId);
  if (indexed.completion?.strict !== true ||
      !await deps.store.recordConsumedSource(job.tenantId, result.sourceId, result.sessionId, indexed) ||
      !await deps.store.hasConsumedSource(job.tenantId, result.sourceId, result.sessionId)) {
    throw new SourceJobError("source_job_consumption_unconfirmed", 502);
  }
  const saved = await deps.store.recordFetch(job.tenantId, row._id, snapshot.previousHash, {
    ...row.lastFetch, fetchedAt: snapshot.fetchedAt, hash: snapshot.hash, diffFrom: snapshot.previousHash,
    sessionId: result.sessionId, sourceRef: result.sourceId,
  });
  if (!saved) throw new SourceJobError("watched_source_changed", 409);
  await deps.store.resolveWatchedFailures(job.tenantId, row._id, result.sourceId);
  return { ...result, indexing: { status: "done", receipt: indexed } };
}
