/**
 * apps/api/src/join-rules/send-now.ts - T-039 unit `t039-send-now-api-endpoint`: the API half of "Send bot now".
 *
 *   POST /calendar/send-now   body { meetingUrl: string, until: string }   (until = HH:MM or an ISO datetime, as `lkb record`)
 *     202 { jobId, status: "launching", meetingKey, platform }   the launcher process STARTED; the bot has not joined yet
 *     400 bad body / refused link   403 missing "send-now" scope / host serves another tenant   409 a live job already covers this meeting
 *     503 live-job state unreadable or no launcher injected (fail closed)   502 the launcher failed to start
 *
 * Scope: the DEDICATED write scope "send-now" (Approver ruling 2026-10-12), exact-match `requireScope`; a "calendar" read key is 403.
 * Tenant: ONLY `req.auth.tenantId`; a body field naming a tenant (or any unknown field) is a 400.
 * `.dependency-cruiser.cjs` forbids apps/* -> packages/meeting-bot, so the planner (link-safety validator + duplicate check) and the
 * launcher are injected structurally (as join-rules/deps.ts); the real adapter is scripts/webinar/send-now-host.ts.
 * KNOWN GAP: the duplicate check reads the scheduler's stores only; a manual `lkb record` and poller launches leave no readable
 * trace (ISS-T039CMD-001/-002, still open). This router adds an in-process memory of launches it made itself (lost on restart).
 */
import { Router, type Request, type Response } from "express";
import { requireScope } from "../auth.js";

export const SEND_NOW_SCOPE = "send-now";
export const MAX_UNTIL_LENGTH = 64;
export const MAX_URL_LENGTH = 2048;
/** How long the router itself remembers a launch it made, to refuse a repeat for the same meeting. */
export const RECENT_LAUNCH_MS = 10 * 60 * 1000;

export interface SendNowRequestValue { meetingUrl: string; until: string }
/** `kind` decides the HTTP status: invalid 400, duplicate 409, unreadable 503, forbidden 403. `message` is safe to show (no credentials). */
export type SendNowPlanValue =
  | { ok: true; meetingUrl: string; meetingKey: string; platform: string }
  | { ok: false; kind: "invalid" | "duplicate" | "unreadable" | "forbidden"; reason: string; message: string };
export interface SendNowDeps {
  /** Only an adapter with an atomic persistent dispatch ownership guard may replace the legacy recent-launch memory. */
  durableDispatch?: true;
  /** Validates the link (the planner's safety rules), the `until` value and the tenant, and checks the live jobs. Never launches. */
  plan(tenantId: string, request: SendNowRequestValue): Promise<SendNowPlanValue> | SendNowPlanValue;
  /** Starts the bot detached and resolves once it is started. MUST throw when it did not start. Called only after an ok plan. */
  launch(tenantId: string, plan: Extract<SendNowPlanValue, { ok: true }>, until: string): Promise<{ jobId: string }>;
  /**
   * OPTIONAL (flag-gated by the host, ISS-SENDNOWAPI-003): status of a job this API launched. Absent -> GET /calendar/send-now/:jobId is not
   * mounted at all (404, as before this slice). It reports recorder PROCESS state only; "joined the meeting" is never claimed.
   */
  status?(tenantId: string, jobId: string): Promise<SendNowStatusValue> | SendNowStatusValue;
  /** Durable host services. Absent keeps their routes absent; no in-memory substitute. */
  manualJobs?: {
    list(tenantId: string): Promise<ManualJobValue[]> | ManualJobValue[];
    detail(tenantId: string, jobId: string): Promise<ManualJobValue | null> | ManualJobValue | null;
    cancel(tenantId: string, jobId: string): Promise<ManualJobValue | null> | ManualJobValue | null;
  };
  /** Test seam. */
  now?: () => number;
}
export interface ManualJobValue {
  jobId: string; platform: string;
  state: "queued" | "launching" | "running" | "cancel-requested" | "cancel-acknowledged" | "cancelled" | "completed" | "failed" | "unknown";
  requestedAt: string; updatedAt: string; joined: "unknown";
}
const MANUAL_JOB_STATES = ["queued", "launching", "running", "cancel-requested", "cancel-acknowledged", "cancelled", "completed", "failed", "unknown"];
/** Whitelist response metadata even if an injected host returns an object with private fields. */
function publicManualJob(job: ManualJobValue): ManualJobValue {
  if (!job || !JOB_ID_PATTERN.test(job.jobId) || !/^[a-z-]{1,32}$/.test(job.platform) || !MANUAL_JOB_STATES.includes(job.state) || job.joined !== "unknown" ||
    typeof job.requestedAt !== "string" || typeof job.updatedAt !== "string" || !Number.isFinite(Date.parse(job.requestedAt)) || !Number.isFinite(Date.parse(job.updatedAt))) throw new Error("manual job response unavailable");
  return { jobId: job.jobId, platform: job.platform, state: job.state, requestedAt: job.requestedAt, updatedAt: job.updatedAt, joined: "unknown" };
}
export type SendNowJobState = "launching" | "running" | "not-running";
export type SendNowStatusValue =
  | { ok: true; status: SendNowJobState; meetingKey?: string; startedAt?: string; until?: string | null }
  | { ok: false; kind: "unreadable" | "forbidden"; reason: string; message: string };
/** Shape of a job id minted by the host adapter (`send-now-<14 digits>-<6 hex>`); anything else is a 400 before the host is asked. */
export const JOB_ID_PATTERN = /^send-now-\d{14}-[0-9a-f]{6}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const KINDS = { invalid: [400, "send_now_refused"], duplicate: [409, "send_now_duplicate"], unreadable: [503, "send_now_unavailable"], forbidden: [403, "send_now_forbidden"] } as const;

export function createSendNowRouter(deps: SendNowDeps): Router {
  const router = Router();
  const now = deps.now ?? Date.now;
  const inFlight = new Set<string>();
  const recent = new Map<string, number>();

  router.post("/calendar/send-now", requireScope(SEND_NOW_SCOPE), async (req: Request, res: Response) => {
    const tenantId = req.auth!.tenantId;
    const body: unknown = req.body;
    if (!isObj(body) || Object.keys(body).some((k) => k !== "meetingUrl" && k !== "until")) {
      res.status(400).json({ error: "bad_request", message: "body must be { meetingUrl: string, until: string } and nothing else" }); return;
    }
    const { meetingUrl, until } = body;
    if (typeof meetingUrl !== "string" || meetingUrl.length === 0 || meetingUrl.length > MAX_URL_LENGTH) {
      res.status(400).json({ error: "bad_request", message: `meetingUrl must be a non-empty string of at most ${MAX_URL_LENGTH} characters` }); return;
    }
    if (typeof until !== "string" || until.length === 0 || until.length > MAX_UNTIL_LENGTH) {
      res.status(400).json({ error: "bad_request", message: "until must be a time (HH:MM or an ISO datetime) when the recording should end" }); return;
    }
    let slot: string | undefined;
    try {
      const plan = await deps.plan(tenantId, { meetingUrl, until });
      if (!plan.ok) {
        const [status, error] = KINDS[plan.kind] ?? KINDS.unreadable;
        res.status(status).json({ error, reason: plan.reason, message: plan.message }); return;
      }
      slot = `${tenantId}\u0000${plan.meetingKey}`;
      const t = now();
      for (const [k, at] of recent) if (t - at >= RECENT_LAUNCH_MS) recent.delete(k);
      if (inFlight.has(slot) || (!deps.durableDispatch && recent.has(slot))) {
        slot = undefined; // not ours to release
        res.status(409).json({ error: "send_now_duplicate", reason: "duplicate-live-job", message: "a bot was already sent to this meeting by this API; not sending a second one" }); return;
      }
      inFlight.add(slot);
      let jobId: string;
      try { ({ jobId } = await deps.launch(tenantId, plan, until)); }
      catch (error) {
        if ((error as { code?: string })?.code === "manual_duplicate") {
          res.status(409).json({ error: "send_now_duplicate", reason: "duplicate-live-job", message: "this meeting already has an owned manual job" }); return;
        }
        // Honest failure: the launcher did not start. Nothing is remembered, so a retry is allowed. The cause stays in the host log.
        res.status(502).json({ error: "send_now_launch_failed", message: "the bot launcher failed to start; no bot was sent" }); return;
      }
      if (!deps.durableDispatch) recent.set(slot, now());
      res.status(202).json({ jobId, status: "launching", meetingKey: plan.meetingKey, platform: plan.platform });
    } catch {
      res.status(503).json({ error: "send_now_unavailable", message: "send-now is unavailable; no bot was sent" });
    } finally {
      if (slot) inFlight.delete(slot);
    }
  });
  if (deps.manualJobs) {
    const jobs = deps.manualJobs;
    const rejectQuery = (req: Request, res: Response) => {
      if (!Object.keys(req.query).length) return false;
      res.status(400).json({ error: "bad_request" }); return true;
    };
    const failure = (res: Response, error: unknown) => (error as { code?: string })?.code === "tenant_not_served"
      ? res.status(403).json({ error: "send_now_forbidden", message: "this host does not capture for your tenant" })
      : res.status(503).json({ error: "send_now_unavailable", message: "manual jobs are unavailable" });
    router.get("/calendar/send-now/jobs", requireScope(SEND_NOW_SCOPE), async (req, res) => {
      if (rejectQuery(req, res)) return;
      try { const values = await jobs.list(req.auth!.tenantId); if (!Array.isArray(values) || values.length > 100) throw new Error("manual jobs unavailable"); res.json({ jobs: values.map(publicManualJob) }); } catch (error) { failure(res, error); }
    });
    router.get("/calendar/send-now/jobs/:jobId", requireScope(SEND_NOW_SCOPE), async (req, res) => {
      const jobId = req.params.jobId;
      if (rejectQuery(req, res)) return;
      if (typeof jobId !== "string" || !JOB_ID_PATTERN.test(jobId)) { res.status(400).json({ error: "bad_request" }); return; }
      try {
        const job = await jobs.detail(req.auth!.tenantId, jobId);
        if (!job) { res.status(404).json({ error: "manual_job_not_found" }); return; }
        res.json(publicManualJob(job));
      } catch (error) { failure(res, error); }
    });
    router.post("/calendar/send-now/jobs/:jobId/cancel", requireScope(SEND_NOW_SCOPE), async (req, res) => {
      const jobId = req.params.jobId;
      if (rejectQuery(req, res)) return;
      if (typeof jobId !== "string" || !JOB_ID_PATTERN.test(jobId) || !isObj(req.body) || Object.keys(req.body).length) { res.status(400).json({ error: "bad_request" }); return; }
      try {
        const job = await jobs.cancel(req.auth!.tenantId, jobId);
        if (!job) { res.status(404).json({ error: "manual_job_not_found" }); return; }
        res.status(202).json(publicManualJob(job)); // Intent is durable; only the owner can acknowledge and finish capture.
      } catch (error) { failure(res, error); }
    });
  }
  if (deps.status) {
    const status = deps.status.bind(deps);
    router.get("/calendar/send-now/:jobId", requireScope(SEND_NOW_SCOPE), async (req: Request, res: Response) => {
      const jobId = req.params.jobId;
      if (typeof jobId !== "string" || !JOB_ID_PATTERN.test(jobId)) {
        res.status(400).json({ error: "bad_request", message: "jobId is not a send-now job id" }); return;
      }
      try {
        const v = await status(req.auth!.tenantId, jobId); // tenant ONLY from the key
        if (!v.ok) {
          const [code, error] = KINDS[v.kind];
          res.status(code).json({ error, reason: v.reason, message: v.message }); return;
        }
        res.status(200).json({
          jobId, status: v.status, ...(v.meetingKey ? { meetingKey: v.meetingKey } : {}),
          ...(v.startedAt ? { startedAt: v.startedAt } : {}), ...(v.until !== undefined ? { until: v.until } : {}),
          joined: "unknown", // process state only; whether the bot is inside the meeting is not measured
        });
      } catch {
        res.status(503).json({ error: "send_now_unavailable", message: "send-now status is unavailable" });
      }
    });
  }
  return router;
}

/** Mounted when no launcher is injected: authenticated callers with the scope get a fail-closed 503, others the usual 403. */
export function unavailableSendNowRouter(): Router {
  const router = Router();
  router.post("/calendar/send-now", requireScope(SEND_NOW_SCOPE), (_req: Request, res: Response) => {
    res.status(503).json({ error: "send_now_unavailable", message: "send-now is not configured on this server; no bot was sent" });
  });
  return router;
}
