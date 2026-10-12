/**
 * apps/api/src/usage/recorder.ts - T-057 D4 (ISS-T057OPS-001). One content-free usage event per answered
 * POST /ask or GET /search, recorded AFTER the response has been sent (`res` "finish"), so the write can
 * neither delay nor fail the caller's request.
 *
 *  - Fire-and-forget and bounded: the write races a timeout (default 2 s) and at most `maxInFlight`
 *    (default 100) writes are pending; beyond that an event is dropped with a warn line, so a hung or
 *    down database cannot build an unbounded queue behind the API.
 *  - Content-free: the middleware reads only the verified tenant, the status code and a wall-clock
 *    duration. It never reads req.body / req.query / req.headers, so no query text, answer, key or IP can
 *    reach the store - and the log lines carry a fixed reason + the error NAME, never a message or request.
 *  - Only 2xx (ok) and 5xx (error) are recorded; 4xx (bad request, missing scope, no tree) is a caller
 *    mistake, not usage. Requests that die before a response (client abort) emit no "finish" and no event.
 *  - Mounted after requireAuth + rate limiting (tenant is verified); latency is measured from there.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Logger } from "../composition/logger.js";

export type UsageKind = "ask" | "search";
export type UsageOutcome = "ok" | "error";
export interface UsageRecordInput { kind: UsageKind; outcome: UsageOutcome; latencyMs: number }
export interface UsageRecordDeps { record(tenantId: string, input: UsageRecordInput): Promise<void> }
export interface UsageRecorderOptions { timeoutMs?: number; maxInFlight?: number; now?: () => number }

/** Which usage kind (if any) this request is. Express routing is case-insensitive and ignores a trailing slash. */
export function usageKindOf(method: string, path: string): UsageKind | null {
  const p = path.toLowerCase().replace(/\/+$/, "");
  if (method === "POST" && p === "/ask") return "ask";
  if (method === "GET" && p === "/search") return "search";
  return null;
}

export function usageOutcomeOf(status: number): UsageOutcome | null {
  if (status >= 500) return "error";
  if (status >= 200 && status < 400) return "ok";
  return null;
}

export function usageRecorder(deps: UsageRecordDeps | undefined, log: Logger, opts: UsageRecorderOptions = {}): RequestHandler {
  const timeoutMs = opts.timeoutMs ?? 2000, maxInFlight = opts.maxInFlight ?? 100, now = opts.now ?? Date.now;
  let inFlight = 0;
  const fail = (kind: UsageKind, reason: string, err?: unknown): void => {
    const errorName = err instanceof Error ? err.name : undefined;
    try { log.warn("usage event not recorded", { usageKind: kind, reason, ...(errorName ? { errorName } : {}) }); } catch { /* logging never breaks a request */ }
  };
  return (req: Request, res: Response, next: NextFunction): void => {
    const kind = deps ? usageKindOf(req.method, req.path) : null;
    if (!deps || !kind) { next(); return; }
    const startedAt = now();
    res.once("finish", () => {
      const tenantId = req.auth?.tenantId, outcome = usageOutcomeOf(res.statusCode);
      if (typeof tenantId !== "string" || !tenantId.trim() || !outcome) return;
      if (inFlight >= maxInFlight) { fail(kind, "backlog"); return; }
      inFlight++;
      const latencyMs = Math.max(0, now() - startedAt);
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("usage_write_timeout")), timeoutMs); timer.unref?.(); });
      Promise.race([Promise.resolve().then(() => deps.record(tenantId, { kind, outcome, latencyMs })), timeout])
        .catch((err: unknown) => fail(kind, err instanceof Error && err.message === "usage_write_timeout" ? "timeout" : "error", err))
        .finally(() => { clearTimeout(timer); inFlight--; });
    });
    next();
  };
}
