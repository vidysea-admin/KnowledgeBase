import type { SourceIntakeResult } from "../source-intake/store.js";
import { assertConnectorIndexConsumed, ConnectorWorkflowError, type ConnectorWorkflowDeps } from "./types.js";

/** Reuse a validated producer receipt; failed producer indexing is visible, and deduped retries remain safe. */
export async function consumeConnectorIntake(tenantId: string, result: SourceIntakeResult, deps: ConnectorWorkflowDeps): Promise<void> {
  if (result.indexing?.status === "failed") throw new ConnectorWorkflowError(502, "indexing_incomplete");
  if (result.indexing?.status === "done") {
    const indexed = result.indexing.receipt;
    if (!indexed) throw new ConnectorWorkflowError(502, "indexing_incomplete");
    assertConnectorIndexConsumed(indexed, result.sessionId);
    if (!await deps.store.recordConsumedSource(tenantId, result.sourceId, result.sessionId, indexed)) {
      throw new ConnectorWorkflowError(502, "consumption_receipt_not_persisted");
    }
    return;
  }
  if (result.status === "already-ingested" && await deps.store.hasConsumedSource(tenantId, result.sourceId, result.sessionId)) return;
  if (!deps.indexSession) throw new ConnectorWorkflowError(503, "source_intake_unconfigured");
  const indexed = await deps.indexSession(tenantId, result.sessionId);
  assertConnectorIndexConsumed(indexed, result.sessionId);
  if (!await deps.store.recordConsumedSource(tenantId, result.sourceId, result.sessionId, indexed)) {
    throw new ConnectorWorkflowError(502, "consumption_receipt_not_persisted");
  }
}
