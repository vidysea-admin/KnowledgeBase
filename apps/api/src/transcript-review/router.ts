/**
 * apps/api/src/transcript-review/router.ts - T-054 durable transcript corrections.
 *   GET  /sessions/:sessionId/transcript-review            effective transcript + revision; `ETag: "<revision>"`
 *   POST /sessions/:sessionId/transcript-review            commit corrections; needs `If-Match: "<revision>"` AND body.expectedRevision
 *   GET  /sessions/:sessionId/transcript-review/history    append-only revision history (who/when/why/before/after)
 *   POST /sessions/:sessionId/transcript-review/refresh    run pending refresh targets (503 when no executor is configured)
 * Mount AFTER `requireAuth` (it reads req.auth): `app.use(createTranscriptReviewRouter(deps))`, e.g. next to the speaker
 * suggestions router. Scope `sessions`. The tenant and the actor come ONLY from the verified key; any tenant, actor or
 * timestamp in the body is rejected by the planner's strict parser. A transcript that is not this tenant's answers 404, the same as
 * one that does not exist. Missing If-Match 428, stale/mismatched If-Match 412, lost race 409; every response is `private, no-store`.
 * The 200 POST body is a durable receipt `{ sessionId, revision, commit: "committed", refresh }` - the refresh is `pending`
 * until the refresh endpoint (or an operator) has actually run every target.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { requireScope } from "../auth.js";
import { commitReview, loadReview, loadReviewHistory, ReviewServiceError, runRefresh, type RefreshExecutor } from "./service.js";
import type { ReviewStore } from "./store.js";

export interface TranscriptReviewDeps {
  store: ReviewStore; refresh?: RefreshExecutor; clock?: () => string;
  /** Trusted server-side eligibility. Production MUST bind its source visibility perimeter;
   * omission exists only for independently injected fixtures/capabilities. Never client-controlled. */
  authorizeSession?: (tenantId: string, sessionId: string) => Promise<boolean>;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,399}$/;
const IF_MATCH = /^"([A-Za-z0-9._:-]{1,400})"$/;

function send(res: Response, status: number, body: unknown, etag?: string): void {
  res.status(status).setHeader("Cache-Control", "private, no-store");
  if (etag) res.setHeader("ETag", `"${etag}"`);
  // `end`, not `res.json`: Express would add a weak content-hash ETag and could answer 304 to a conditional GET.
  res.type("application/json").end(JSON.stringify(body));
}
function tenantOf(req: Request): string {
  const t = req.auth?.tenantId;
  if (typeof t !== "string" || !t.trim()) throw new Error("Missing verified tenant");
  return t;
}
const STATUS: Record<string, [number, string]> = {
  not_found: [404, "not_found"], conflict: [409, "conflict"], invalid: [400, "invalid_request"],
  unreviewable: [422, "transcript_not_reviewable"], no_changes: [422, "no_changes"], unavailable: [503, "transcript_review_unavailable"],
};
function fail(res: Response, e: unknown): void {
  if (e instanceof ReviewServiceError) {
    const [status, error] = STATUS[e.code]!;
    send(res, status, { error, message: e.message });
    return;
  }
  send(res, 503, { error: "transcript_review_unavailable", message: "Transcript review is unavailable" });
}

export function createTranscriptReviewRouter(deps: TranscriptReviewDeps): Router {
  const router = Router();
  const now = deps.clock ?? (() => new Date().toISOString());
  const path = "/sessions/:sessionId/transcript-review";
  const badId = (res: Response): void => send(res, 400, { error: "invalid_id", message: "Invalid session id" });

  // Prefix middleware covers snapshot, history, commit and refresh BEFORE any store access
  // or precondition state. Ordinary sessions scope does not grant raw quarantined chat review.
  router.use(path, requireScope("sessions"), async (req, res, next) => {
    const sessionId = req.params.sessionId as string;
    if (!SESSION_ID.test(sessionId)) return badId(res);
    try {
      if (deps.authorizeSession && !await deps.authorizeSession(tenantOf(req), sessionId)) {
        send(res, 404, { error: "not_found", message: "Transcript review not found" }); return;
      }
      next();
    } catch (error) { fail(res, error); }
  });

  router.get(path, requireScope("sessions"), async (req, res) => {
    const sessionId = req.params.sessionId as string;
    if (!SESSION_ID.test(sessionId)) return badId(res);
    try {
      const { snapshot, refresh, orphanedTurnIds } = await loadReview(deps.store, tenantOf(req), sessionId);
      send(res, 200, {
        sessionId, revision: snapshot.revision, refresh: refresh?.status ?? "complete", orphanedTurnIds,
        turns: snapshot.turns.map((t) => ({ _id: t._id, text: t.text, speakerRef: t.speakerRef, tStart: t.tStart, tEnd: t.tEnd, ...(t.speakerLabel !== undefined ? { speakerLabel: t.speakerLabel } : {}) })),
      }, snapshot.revision);
    } catch (e) { fail(res, e); }
  });

  router.post(path, requireScope("sessions"), async (req, res) => {
    const sessionId = req.params.sessionId as string;
    if (!SESSION_ID.test(sessionId)) return badId(res);
    const header = req.header("if-match");
    if (header === undefined) { send(res, 428, { error: "precondition_required", message: "If-Match is required" }); return; }
    const m = IF_MATCH.exec(header);
    const body: unknown = req.body;
    const bodyRevision = body !== null && typeof body === "object" ? (body as { expectedRevision?: unknown }).expectedRevision : undefined;
    if (!m || bodyRevision !== m[1]) { send(res, 400, { error: "invalid_request", message: "If-Match must be one strong quoted revision equal to body.expectedRevision" }); return; }
    try {
      const tenantId = tenantOf(req);
      const { snapshot } = await loadReview(deps.store, tenantId, sessionId);
      if (snapshot.revision !== m[1]) { send(res, 412, { error: "precondition_failed", message: "Transcript changed; reload before saving", currentRevision: snapshot.revision }, snapshot.revision); return; }
      const verifiedBearer = /^Bearer\s+(.+)$/i.exec(req.header("authorization") ?? "")?.[1];
      if (!verifiedBearer) throw new Error("Missing verified principal");
      const keyIdentity = createHash("sha256").update(JSON.stringify([tenantId, verifiedBearer])).digest("hex");
      const receipt = await commitReview(deps.store, { tenantId, sessionId, actorRef: `apikey:${keyIdentity}`, now: now(), request: body });
      send(res, 200, receipt, receipt.revision);
    } catch (e) { fail(res, e); }
  });

  router.get(`${path}/history`, requireScope("sessions"), async (req, res) => {
    const sessionId = req.params.sessionId as string;
    if (!SESSION_ID.test(sessionId)) return badId(res);
    try {
      const tenantId = tenantOf(req);
      const rows = await loadReviewHistory(deps.store, tenantId, sessionId);
      send(res, 200, { sessionId, revisions: rows.map((r) => ({ revision: r.revision, parentRevision: r.parentRevision, actorRef: r.actorRef, reviewedAt: r.reviewedAt, reason: r.reason, changes: r.changes })) });
    } catch (e) { fail(res, e); }
  });

  router.post(`${path}/refresh`, requireScope("sessions"), async (req, res) => {
    const sessionId = req.params.sessionId as string;
    if (!SESSION_ID.test(sessionId)) return badId(res);
    if (!deps.refresh) { send(res, 503, { error: "refresh_unavailable", message: "No refresh executor is configured" }); return; }
    try {
      const tenantId = tenantOf(req);
      const loaded = await loadReview(deps.store, tenantId, sessionId);
      const header = req.header("if-match");
      if (header !== undefined) {
        const m = IF_MATCH.exec(header);
        if (!m) { send(res, 400, { error: "invalid_request", message: "Refresh requires one strong quoted revision" }); return; }
        if (m[1] !== loaded.snapshot.revision) { send(res, 412, { error: "precondition_failed", message: "Transcript changed; reload before refreshing" }); return; }
      }
      await runRefresh(deps.store, deps.refresh, tenantId, sessionId);
      // Report what is durably stored now (a superseded run reports the NEWER revision's state, never its own).
      const state = (await deps.store.head(tenantId, sessionId))?.refresh;
      send(res, 200, { sessionId, revision: state?.revision ?? null, refresh: state?.status ?? "complete", completed: state?.completed ?? [], ...(state?.failedTarget ? { failedTarget: state.failedTarget } : {}) });
    } catch (e) { fail(res, e); }
  });
  return router;
}
