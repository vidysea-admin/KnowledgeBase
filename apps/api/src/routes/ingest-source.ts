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

const URL_RE = /^https?:\/\//i;
const MAX_URL = 2048;
const SAFE_ERRORS = new Set(["IntakeError", "YoutubeSourceError", "HostedRecordingError", "NoMatchingSourceError"]);

export function createSourceIntakeRouter(deps: SourceIntakeDeps): Router {
  const router = Router();
  router.post("/ingest/source", requireScope("ingest"), async (req: Request, res: Response) => {
    const url = (req.body as { url?: unknown } | undefined)?.url;
    if (typeof url !== "string" || url.length > MAX_URL || !URL_RE.test(url)) {
      res.status(400).json({ error: "bad_request", message: "body must be { url: string } (http/https only)" });
      return;
    }
    try {
      const result = await deps.intake({ tenantId: req.auth!.tenantId, url });
      res.status(result.status === "created" ? 201 : 200).json(result);
    } catch (err) {
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
