import { assertValidTenantId } from "@lkb/db";
import { createHash } from "node:crypto";
import { createUrlSource, intakeFromSource, isDueForCheck, isGuardedFetcher } from "@lkb/ingest";
import { recordConnectorFailure } from "./gaps.js";
import { assertConnectorIndexConsumed, ConnectorWorkflowError, type ConnectorWorkflowDeps } from "./types.js";
import { connectorSnapshotText } from "./snapshot.js";
import type { VerifiedKey } from "../auth.js";
import { digest } from "../source-intake/jobs/input.js";
import { enqueueConnectorJob } from "./jobs.js";

export interface ConnectorWatchOutcome {
  id: string;
  status: "changed" | "unchanged" | "not-due" | "failed" | "queued";
  jobId?: string;
  sessionId?: string;
  gapId?: string;
  code?: string;
}
/** One service instance owns an in-flight tenant lock. Distributed cadence remains an operational gate. */
export function createConnectorWatchVerifier(deps: ConnectorWorkflowDeps) {
  const active = new Set<string>();
  // One bounded sweep hint, never an authority or healthy-fetch receipt. A service host
  // owns one verifier for its verified identity; another tenant starts a fresh sweep.
  let cursor: { tenantId: string; afterId: string } | undefined;
  return async function verify(tenantId: string, auth?: VerifiedKey): Promise<{ outcomes: ConnectorWatchOutcome[]; remaining: number }> {
    assertValidTenantId(tenantId, "connector.verifyWatch");
    deps.store.assertWritableTenant(tenantId);
    if (deps.sourceJobs && (!auth || auth.tenantId !== tenantId || !auth.keyId ||
        !auth.scopes.includes("sources") || !auth.scopes.includes("ingest"))) throw new ConnectorWorkflowError(403, "source_job_approval_refused");
    if (!deps.watched || !isGuardedFetcher(deps.watched.fetcher)) throw new ConnectorWorkflowError(503, "watched_unconfigured");
    if (active.has(tenantId)) throw new ConnectorWorkflowError(409, "watched_busy");
    active.add(tenantId);
    try {
      const rows = await deps.store.listWatched(tenantId);
      // Validate the entire result before selection: even an out-of-batch corrupt row
      // must not cause another tenant's URL to be acquired or its ID to be disclosed.
      const ids = new Set<string>();
      for (const row of rows) {
        if (row.tenantId !== tenantId) throw new ConnectorWorkflowError(503, "watched_tenant_mismatch");
        if (typeof row._id !== "string" || !row._id || row._id.length > 4096 || ids.has(row._id)) {
          throw new ConnectorWorkflowError(503, "watched_identity_invalid");
        }
        ids.add(row._id);
      }
      const ordered = [...rows].sort((a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
      // Strict ordering also resumes after a deleted cursor. Exhaustion wraps on the
      // next tick; failed/not-due rows advance the hint and are retried next sweep.
      const afterId = cursor?.tenantId === tenantId ? cursor.afterId : undefined;
      const start = afterId === undefined ? 0 : ordered.findIndex(row => row._id > afterId);
      const selected = ordered.slice(start < 0 ? 0 : start);
      const outcomes: ConnectorWatchOutcome[] = [];
      const limit = 25;
      const deadline = Date.now() + 120000;
      let processed = 0;
      for (const row of selected) {
        if (processed >= limit || Date.now() >= deadline) break;
        processed++;
        cursor = { tenantId, afterId: row._id };
        // A corrupted store must never forward another tenant's URL or expose its id.
        if (row.tenantId !== tenantId) throw new ConnectorWorkflowError(503, "watched_tenant_mismatch");
        if (!isDueForCheck(row, deps.now())) { outcomes.push({ id: row._id, status: "not-due" }); continue; }
        try {
          const text = await deps.watched.fetcher(row.url);
          const fetchedAt = deps.now();
          const hash = createHash("sha256").update(text, "utf8").digest("hex");
          const previousHash = row.lastFetch?.hash ?? null;
          let sessionId = typeof row.lastFetch?.sessionId === "string" ? row.lastFetch.sessionId : undefined;
          let sourceRef = typeof row.lastFetch?.sourceRef === "string" ? row.lastFetch.sourceRef : undefined;
          const consumed = sourceRef && sessionId ? await deps.store.hasConsumedSource(tenantId, sourceRef, sessionId) : false;
          if (hash !== previousHash || !consumed) {
            if (deps.sourceJobs) {
              const watchedSnapshot = { version: 1 as const, watchedSourceId: row._id, text, hash, fetchedAt, previousHash };
              // A stable request key binds the content and previous successful version. The original
              // immutable timestamp remains in the spool when another request sees the queued job.
              const requestId = `watch-${digest([row._id, row.url, hash, previousHash])}`;
              const jobId = digest([tenantId, auth!.keyId, requestId]);
              const existing = await deps.sourceJobs.poll(tenantId, jobId);
              const job = existing ?? await enqueueConnectorJob(auth!, row.url, requestId, deps, watchedSnapshot);
              if (job.state === "uncertain") throw new Error("watched-job-unconfirmed");
              outcomes.push({ id: row._id, status: "queued", jobId: job.jobId });
              continue;
            }
            // The adapter sees exactly the guarded snapshot: no second fetch/hash-to-turn race.
            const adapter = createUrlSource({ fetcher: async () => connectorSnapshotText(text), hasher: () => hash, now: () => fetchedAt });
            const originalFetch = adapter.fetch.bind(adapter);
            adapter.fetch = async (input, consent) => {
              const snapshot = await originalFetch(input, consent);
              snapshot.source.sourceMeta = { watchedSourceId: row._id, fetchedAt, diffFrom: previousHash };
              return snapshot;
            };
            const result = await intakeFromSource({ kind: "url", url: row.url, tenantId }, {
              captureMode: "public", given: true, recordedBy: "watched-source-verification",
            }, { adapters: [adapter], sink: deps.watched.sink, newId: deps.newId, now: () => fetchedAt });
            sessionId = result.sessionId;
            sourceRef = result.sourceId;
            // Retry partial attempts; a previously proved, physically intact content receipt is reusable.
            if (result.status === "created" || !await deps.store.hasConsumedSource(tenantId, sourceRef, sessionId)) {
              const indexed = await deps.watched.indexSession(tenantId, sessionId);
              assertConnectorIndexConsumed(indexed, sessionId);
              if (!await deps.store.recordConsumedSource(tenantId, sourceRef, sessionId, indexed)) throw new Error("consumption-receipt-not-persisted");
            }
          }
          if (sourceRef) await deps.store.resolveWatchedFailures(tenantId, row._id, sourceRef);
          const lastFetch = { ...row.lastFetch, fetchedAt, hash, diffFrom: previousHash,
            ...(sessionId ? { sessionId, sourceRef } : {}) };
          const saved = await deps.store.recordFetch(tenantId, row._id, previousHash, lastFetch);
          if (!saved) throw new Error("record-fetch-conflict");
          outcomes.push({ id: row._id, status: hash === previousHash ? "unchanged" : "changed", ...(sessionId ? { sessionId } : {}) });
        } catch {
          try {
            const gapId = await recordConnectorFailure(tenantId, "watched-verification-failed", deps, row._id);
            outcomes.push({ id: row._id, status: "failed", gapId, code: "watched_verification_failed" });
          } catch {
            outcomes.push({ id: row._id, status: "failed", code: "watched_failure_gap_write_failed" });
          }
        }
      }
      return { outcomes, remaining: rows.length - processed };
    } finally { active.delete(tenantId); }
  };
}
