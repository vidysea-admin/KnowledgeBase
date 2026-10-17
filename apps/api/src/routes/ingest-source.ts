/**
 * apps/api/src/routes/ingest-source.ts — T-045 `POST /ingest/source`: submit a YouTube / Cloud OnAir / Zoom
 * recording (or any http/https) URL for intake through the adapter registry. Same auth scope (`ingest`) and tenant
 * derivation (session/auth only) as `POST /ingest`. Mounted only when `ServerDeps.sourceIntake` is set (off by
 * default); without it the route does not exist, exactly as before.
 * 201 = created; 200 = already ingested (D-135: nothing created or deleted, existing session id returned).
 * Error bodies carry a code and, for known adapter errors only, their message (adapters keep share tokens out of
 * messages); an unknown error gets a fixed generic message.
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";
import { SourceIntakeUnconfiguredError, type SourceIntakeDeps } from "../source-intake/store.js";
import { randomUUID } from 'node:crypto';
import { SourceJobError, type SourceJobStore } from '../source-intake/jobs/types.js';

const URL_RE = /^https?:\/\//i;
const MAX_URL = 2048;
const SAFE_ERRORS = new Set(["IntakeError", "YoutubeSourceError", "HostedRecordingError", "NoMatchingSourceError"]);

export function createSourceIntakeRouter(deps: SourceIntakeDeps, sourceJobs?: SourceJobStore): Router {
  const router = Router();
  router.get('/ingest/source/jobs/:jobId', requireScope('ingest'), async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!sourceJobs) { res.status(503).json({ error: 'source_worker_unavailable' }); return; }
    try {
      const job = await sourceJobs.poll(req.auth!.tenantId, req.params.jobId as string);
      res.status(job ? 200 : 404).json(job ?? { error: 'not_found' });
    } catch { res.status(503).json({ error: 'source_job_unavailable' }); }
  });
  router.post("/ingest/source", requireScope("ingest"), async (req: Request, res: Response) => {
    const url = (req.body as { url?: unknown } | undefined)?.url;
    if (typeof url !== "string" || url.length > MAX_URL || !URL_RE.test(url)) {
      res.status(400).json({ error: "bad_request", message: "body must be { url: string } (http/https only)" });
      return;
    }
    try {
      if (sourceJobs) {
        const actorKeyId = req.auth!.keyId;
        const body = req.body as Record<string, unknown>;
        if (!actorKeyId) { res.status(503).json({ error: 'verified_identity_unavailable' }); return; }
        if (Object.keys(body).some(key => key !== 'url' && key !== 'idempotencyKey')) { res.status(400).json({ error: 'bad_request' }); return; }
        const idempotencyKey = body.idempotencyKey ?? randomUUID();
        if (typeof idempotencyKey !== 'string') { res.status(400).json({ error: 'bad_request' }); return; }
        const job = await sourceJobs.enqueue({ tenantId: req.auth!.tenantId, actorKeyId, url, idempotencyKey },
          async input => ({ approvedBy: input.actorKeyId, approvalRef: `authenticated-request:${randomUUID()}` }));
        res.status(202).json(job); return;
      }
      const result = await deps.intake({ tenantId: req.auth!.tenantId, url });
      res.status(result.status === "created" ? 201 : 200).json(result);
    } catch (err) {
      if (err instanceof SourceJobError) { res.status(err.status).json({ error: err.code, message: 'Source job could not be accepted.' }); return; }
      if (err instanceof SourceIntakeUnconfiguredError) {
        res.status(503).json({ error: "source_intake_unconfigured", message: err.message });
        return;
      }
      const name = err instanceof Error ? err.name : "";
      const code = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error && SAFE_ERRORS.has(name) ? err.message : "source intake failed";
      const status = name === "IntakeError" && code === "no-turns" ? 422 : 502;
      res.status(status).json({ error: "ingest_failed", message });
    }
  });
  return router;
}
