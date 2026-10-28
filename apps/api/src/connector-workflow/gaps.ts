import type { Gaps } from "@lkb/core";
import { assertValidTenantId } from "@lkb/db";
import { createHash } from "node:crypto";
import { assertConnectorIndexConsumed, connectorText, isConnectorRecordingSource, ConnectorWorkflowError, type ConnectorWorkflowDeps } from "./types.js";

export async function openConnectorGap(tenantId: string, body: Record<string, unknown>, deps: ConnectorWorkflowDeps): Promise<{ gap: Gaps; repeated: boolean }> {
  assertValidTenantId(tenantId, "connector.openGap");
  const description = connectorText(body.description, 1000);
  const requestedFrom = connectorText(body.requestedFrom, 200);
  const sourceRef = body.sourceRef === undefined ? undefined : connectorText(body.sourceRef, 200);
  if (sourceRef) {
    const source = await deps.store.findSource(tenantId, sourceRef);
    if (!source || source.tenantId !== tenantId) throw new ConnectorWorkflowError(404, "source_not_found");
  }
  const requestedAt = deps.now();
  const slaDays = body.slaDays ?? 3;
  if (typeof slaDays !== "number" || !Number.isInteger(slaDays) || slaDays < 1 || slaDays > 30) {
    throw new ConnectorWorkflowError(400, "invalid_sla");
  }
  const requestId = body.requestId === undefined ? undefined : connectorText(body.requestId, 100);
  const id = requestId ? `recording-request-${createHash("sha256").update(JSON.stringify([tenantId, requestId]), "utf8").digest("hex")}` : deps.newId();
  if (requestId) {
    const existing = await deps.store.findGap(tenantId, id);
    if (existing) {
      const interval = existing.requestedAt && existing.sla ? Date.parse(existing.sla.dueAt) - Date.parse(existing.requestedAt) : NaN;
      if (existing.tenantId !== tenantId || existing.kind !== "recording-pending" || existing.description !== description ||
          existing.requestedFrom !== requestedFrom || existing.sourceRef !== sourceRef || interval !== slaDays * 86400000) {
        throw new ConnectorWorkflowError(409, "request_conflict");
      }
      return { gap: existing, repeated: true };
    }
  }
  const doc: Gaps = {
    _id: id, tenantId, kind: "recording-pending", status: "open", description,
    requestedFrom, requestedAt, sla: { dueAt: new Date(Date.parse(requestedAt) + slaDays * 86400000).toISOString() },
    ...(sourceRef ? { sourceRef } : {}),
  };
  await deps.store.createGap(tenantId, doc);
  return { gap: doc, repeated: false };
}

export async function transitionConnectorGap(
  tenantId: string, id: string, body: Record<string, unknown>, deps: ConnectorWorkflowDeps,
): Promise<{ status: "received" | "expired"; repeated: boolean }> {
  assertValidTenantId(tenantId, "connector.transitionGap");
  const status = body.status;
  if (status !== "received" && status !== "expired") throw new ConnectorWorkflowError(400, "invalid_transition");
  const gap = await deps.store.findGap(tenantId, id);
  if (!gap || gap.tenantId !== tenantId || gap.kind !== "recording-pending") throw new ConnectorWorkflowError(404, "gap_not_found");
  let sourceRef: string | undefined;
  if (status === "received") {
    sourceRef = connectorText(body.sourceRef, 200);
    if (gap.status !== "open" && !(gap.status === "received" && gap.sourceRef === sourceRef)) throw new ConnectorWorkflowError(409, "gap_conflict");
    const source = await deps.store.findSource(tenantId, sourceRef);
    if (!source || source.tenantId !== tenantId || !isConnectorRecordingSource(source)) throw new ConnectorWorkflowError(404, "recording_not_found");
    if (!await deps.store.hasConsumedRecording(tenantId, sourceRef)) {
      if (deps.sourceJobs) throw new ConnectorWorkflowError(409, "recording_job_required");
      const sessionId = await deps.store.recordingSession(tenantId, sourceRef);
      if (!sessionId) throw new ConnectorWorkflowError(409, "recording_not_consumed");
      if (!deps.indexSession) throw new ConnectorWorkflowError(503, "source_intake_unconfigured");
      try {
        const indexed = await deps.indexSession(tenantId, sessionId);
        assertConnectorIndexConsumed(indexed, sessionId);
        if (!await deps.store.recordConsumedSource(tenantId, sourceRef, sessionId, indexed) ||
            !await deps.store.hasConsumedRecording(tenantId, sourceRef)) throw new Error("recording-not-consumed");
      } catch { throw new ConnectorWorkflowError(502, "recording_verification_failed", sourceRef); }
    }
    await deps.store.resolveRecordingFailures(tenantId, sourceRef);
  }
  if (gap.status === status && (status !== "received" || gap.sourceRef === sourceRef)) return { status, repeated: true };
  if (gap.status !== "open") throw new ConnectorWorkflowError(409, "gap_conflict");
  if (status === "expired" && (!gap.sla || Date.parse(gap.sla.dueAt) > Date.parse(deps.now()) || !Number.isFinite(Date.parse(gap.sla.dueAt)))) {
    throw new ConnectorWorkflowError(409, "sla_not_due");
  }
  if (!await deps.store.transitionGap(tenantId, id, "open", status, sourceRef)) throw new ConnectorWorkflowError(409, "gap_conflict");
  return { status, repeated: false };
}

/** Generic durable action-required row. Never store a bearer URL, provider error or credential. */
export function connectorUrlIdentity(tenantId: string, url: string): string {
  return createHash("sha256").update(JSON.stringify([tenantId, url]), "utf8").digest("hex");
}
export async function recordConnectorFailure(tenantId: string, category: string, deps: ConnectorWorkflowDeps, watchedSourceRef?: string, sourceUrlHash?: string, sourceRef?: string): Promise<string> {
  const id = deps.newId();
  const now = deps.now();
  await deps.store.createGap(tenantId, {
    _id: id, kind: "source-pending", status: "open", description: `Connector action required: ${category}`,
    requestedFrom: "tenant-owner", requestedAt: now, sla: { dueAt: new Date(Date.parse(now) + 3 * 86400000).toISOString() },
    ...(watchedSourceRef ? { watchedSourceRef } : {}),
    ...(sourceUrlHash ? { sourceUrlHash } : {}),
    ...(sourceRef ? { sourceRef } : {}),
  });
  return id;
}
