import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { SourceIntakeUnconfiguredError } from "../source-intake/store.js";
import { extractYoutubeVideoId, parseOnairUrl, parseZoomRecordingUrl } from "@lkb/ingest";
import { connectorUrlIdentity, openConnectorGap, recordConnectorFailure, transitionConnectorGap } from "./gaps.js";
import { connectorText, connectorPublicUrl, ConnectorWorkflowError, type ConnectorWorkflowDeps } from "./types.js";
import { createConnectorWatchVerifier } from "./watched.js";
import { consumeConnectorIntake } from "./intake-consumption.js";
import { SourceJobError } from "../source-intake/jobs/types.js";
import { checkConnectorJob, enqueueConnectorJob } from "./jobs.js";

export function createConnectorWorkflowRouter(deps: ConnectorWorkflowDeps): Router {
  const router = Router();
  const verify = createConnectorWatchVerifier(deps);
  const wrap = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try { await fn(req, res); } catch (error) {
      if (error instanceof ConnectorWorkflowError) res.status(error.status).json({ error: error.code });
      else if (error instanceof SourceJobError) res.status(error.status).json({ error: error.code });
      else res.status(503).json({ error: "connector_workflow_unavailable" });
    }
  };
  router.get("/connector-workflow", requireScope("sources"), wrap(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const after = req.query?.after === undefined ? undefined : connectorText(req.query.after, 200);
    const gaps = await deps.store.listGaps(tenantId, after);
    if (gaps.some((g) => g.tenantId !== tenantId)) throw new ConnectorWorkflowError(503, "gap_tenant_mismatch");
    res.json({ capabilities: deps.capabilities, gaps: gaps.slice(0, 250), gapsTruncated: gaps.length > 250,
      nextGapCursor: gaps.length > 250 ? gaps[249]!._id : null, watchedConfigured: Boolean(deps.watched),
      intakeMode: deps.sourceJobs ? "durable-jobs" : "direct" });
  }));
  router.post("/connector-workflow/recording-requests", requireScope("sources"), wrap(async (req, res) => {
    const result = await openConnectorGap(req.auth!.tenantId, req.body ?? {}, deps);
    res.status(result.repeated ? 200 : 201).json(result);
  }));
  router.put("/connector-workflow/recording-requests/:id", requireScope("sources"), wrap(async (req, res) => {
    if (req.body?.status === "received" && !req.auth!.scopes.includes("ingest")) throw new ConnectorWorkflowError(403, "ingest_scope_required");
    try {
      res.json(await transitionConnectorGap(req.auth!.tenantId, String(req.params.id), req.body ?? {}, deps));
    } catch (error) {
      if (error instanceof ConnectorWorkflowError && error.status < 500) throw error;
      const sourceRef = error instanceof ConnectorWorkflowError ? error.sourceRef : undefined;
      const gapId = await recordConnectorFailure(req.auth!.tenantId, "recording-verification-failed", deps, undefined, undefined, sourceRef);
      res.status(502).json({ error: "recording_verification_failed", gapId });
    }
  }));
  router.post("/connector-workflow/recording-requests/:id/receive", requireScope("sources"), requireScope("ingest"), wrap(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const gapId = String(req.params.id);
    deps.store.assertWritableTenant(tenantId);
    const gap = await deps.store.findGap(tenantId, gapId);
    if (!gap || gap.tenantId !== tenantId || gap.kind !== "recording-pending") throw new ConnectorWorkflowError(404, "gap_not_found");
    if (gap.status !== "open") throw new ConnectorWorkflowError(409, "gap_conflict");
    const url = connectorPublicUrl(req.body?.url);
    if (!extractYoutubeVideoId(url) && !parseOnairUrl(url).ok && !parseZoomRecordingUrl(url).ok) {
      throw new ConnectorWorkflowError(400, "unsupported_recording_url");
    }
    if (deps.sourceJobs) {
      res.status(202).json({ job: await enqueueConnectorJob(req.auth!, url, req.body?.requestId, deps) });
      return;
    }
    if (!deps.sourceIntake || !deps.indexSession) throw new ConnectorWorkflowError(503, "source_intake_unconfigured");
    try {
      const result = await deps.sourceIntake.intake({ tenantId, url });
      await consumeConnectorIntake(tenantId, result, deps);
      await deps.store.resolveIntakeFailures(tenantId, connectorUrlIdentity(tenantId, url), result.sourceId);
      const receipt = await transitionConnectorGap(tenantId, gapId, { status: "received", sourceRef: result.sourceId }, deps);
      res.json({ ...receipt, sessionId: result.sessionId });
    } catch (error) {
      if (error instanceof ConnectorWorkflowError && error.status < 500) throw error;
      const failureGapId = await recordConnectorFailure(tenantId, "recording-receipt-intake-failed", deps, undefined, connectorUrlIdentity(tenantId, url));
      res.status(error instanceof SourceIntakeUnconfiguredError ? 503 : 502).json({ error: error instanceof SourceIntakeUnconfiguredError ? "source_intake_unconfigured" : "recording_receipt_failed", gapId: failureGapId });
    }
  }));
  router.post("/connector-workflow/intake", requireScope("ingest"), wrap(async (req, res) => {
    const url = connectorPublicUrl(req.body?.url);
    deps.store.assertWritableTenant(req.auth!.tenantId);
    if (deps.sourceJobs) {
      res.status(202).json({ job: await enqueueConnectorJob(req.auth!, url, req.body?.requestId, deps) });
      return;
    }
    if (!deps.sourceIntake || !deps.indexSession) throw new ConnectorWorkflowError(503, "source_intake_unconfigured");
    try {
      const result = await deps.sourceIntake.intake({ tenantId: req.auth!.tenantId, url });
      await consumeConnectorIntake(req.auth!.tenantId, result, deps);
      await deps.store.resolveIntakeFailures(req.auth!.tenantId, connectorUrlIdentity(req.auth!.tenantId, url), result.sourceId);
      res.status(result.status === "created" ? 201 : 200).json({
        status: result.status, sessionId: result.sessionId, sourceId: result.sourceId,
        ...(result.status === "created" ? { turnCount: result.turnCount } : {}),
      });
    } catch (error) {
      const gapId = await recordConnectorFailure(req.auth!.tenantId, "public-intake-failed", deps, undefined, connectorUrlIdentity(req.auth!.tenantId, url));
      res.status(error instanceof SourceIntakeUnconfiguredError ? 503 : 502).json({ error: error instanceof SourceIntakeUnconfiguredError ? "source_intake_unconfigured" : "source_intake_failed", gapId });
    }
  }));
  router.post("/connector-workflow/jobs/:id/check", requireScope("ingest"), wrap(async (req, res) => {
    const result = await checkConnectorJob(req.auth!.tenantId, String(req.params.id), deps);
    res.status(result.job.state === "queued" || result.job.state === "running" ? 202 : 200).json(result);
  }));
  router.post("/connector-workflow/recording-requests/:id/receive-job", requireScope("sources"), requireScope("ingest"), wrap(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const gapId = String(req.params.id);
    const gap = await deps.store.findGap(tenantId, gapId);
    if (!gap || gap.tenantId !== tenantId || gap.kind !== "recording-pending") throw new ConnectorWorkflowError(404, "gap_not_found");
    if (gap.status === "expired") throw new ConnectorWorkflowError(409, "gap_conflict");
    const checked = await checkConnectorJob(tenantId, connectorText(req.body?.jobId, 64), deps);
    if (checked.job.state !== "succeeded") {
      res.status(checked.job.state === "uncertain" ? 200 : 202).json(checked);
      return;
    }
    const sourceRef = checked.job.result!.sourceId;
    if (!await deps.store.hasConsumedRecording(tenantId, sourceRef)) throw new ConnectorWorkflowError(409, "recording_not_consumed");
    const receipt = await transitionConnectorGap(tenantId, gapId, { status: "received", sourceRef }, deps);
    res.json({ ...checked, receipt });
  }));
  router.post("/connector-workflow/watched/verify", requireScope("sources"), wrap(async (req, res) => {
    if (deps.sourceJobs && !req.auth!.scopes.includes("ingest")) throw new ConnectorWorkflowError(403, "ingest_scope_required");
    res.json(await verify(req.auth!.tenantId, req.auth!));
  }));
  return router;
}
