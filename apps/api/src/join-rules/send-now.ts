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
  /** Validates the link (the planner's safety rules), the `until` value and the tenant, and checks the live jobs. Never launches. */
  plan(tenantId: string, request: SendNowRequestValue): Promise<SendNowPlanValue> | SendNowPlanValue;
  /** Starts the bot detached and resolves once it is started. MUST throw when it did not start. Called only after an ok plan. */
  launch(tenantId: string, plan: Extract<SendNowPlanValue, { ok: true }>, until: string): Promise<{ jobId: string }>;
  /** Test seam. */
  now?: () => number;
}

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
      if (inFlight.has(slot) || recent.has(slot)) {
        slot = undefined; // not ours to release
        res.status(409).json({ error: "send_now_duplicate", reason: "duplicate-live-job", message: "a bot was already sent to this meeting by this API; not sending a second one" }); return;
      }
      inFlight.add(slot);
      let jobId: string;
      try { ({ jobId } = await deps.launch(tenantId, plan, until)); }
      catch {
        // Honest failure: the launcher did not start. Nothing is remembered, so a retry is allowed. The cause stays in the host log.
        res.status(502).json({ error: "send_now_launch_failed", message: "the bot launcher failed to start; no bot was sent" }); return;
      }
      recent.set(slot, now());
      res.status(202).json({ jobId, status: "launching", meetingKey: plan.meetingKey, platform: plan.platform });
    } catch {
      res.status(503).json({ error: "send_now_unavailable", message: "send-now is unavailable; no bot was sent" });
    } finally {
      if (slot) inFlight.delete(slot);
    }
  });
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
