/**
 * apps/api/src/user-accounts/principal.ts -- unit `ua-session-core`, spec UA-9b / UA-12..UA-17 / UA-27.
 * (1) `principalFromUser` (lives in roles.ts, the dependency leaf, so sessions.ts does not import this file): user row -> the `req.auth` the rest of the API already understands (tenantId + scopes).
 *     active -> scopes from the CURRENT role; pending -> scopes [] + `notActive`; every other status -> no principal.
 *     The tenant comes from the user row, never from a header or body.
 * (2) `createSessionAuth`: the Express glue `requireAuth` calls for the second principal source (the cookie).
 * (3) The duplicate-email mapper (ISS-415): users.emailNormalized is GLOBALLY unique, so signup in tenant A can hit
 *     E11000 for an address that lives in tenant B. Every such outcome maps to ONE generic response.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SessionAuthResult, SessionAuthenticator } from "../auth.js";
import { clearSessionCookie, cookieMode, readSessionCookie, sessionCookie, type CookieConfig } from "./cookie.js";
import { csrfGuard, type CsrfConfig } from "./csrf.js";
import type { SessionService } from "./sessions.js";
import { activeGuard, viewerGuard } from "./viewer-guard.js";

export interface SessionAuthDeps { sessions: SessionService; cookie: CookieConfig; csrf: CsrfConfig }

const MESSAGES: Record<string, string> = {
  unauthorized: "invalid session",
  session_revoked: "this session has ended; sign in again",
  session_expired: "this session has expired; sign in again",
  auth_unavailable: "authentication is temporarily unavailable",
};

function chain(handlers: RequestHandler[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const run = (i: number): void => { if (i >= handlers.length) { next(); return; } handlers[i]!(req, res, (err?: unknown) => (err === undefined ? run(i + 1) : next(err))); };
    run(0);
  };
}

export function createSessionAuth(deps: SessionAuthDeps): SessionAuthenticator {
  const guard = chain([csrfGuard(deps.csrf), activeGuard, viewerGuard]);
  async function authenticate(req: Request, res: Response): Promise<SessionAuthResult> {
    const token = readSessionCookie(req, deps.cookie);
    if (token === null) return { kind: "none" };
    res.vary("Cookie");
    const mode = cookieMode(deps.cookie, req);
    const out = await deps.sessions.authenticate(token);
    if (!out.ok) {
      if (out.code === "session_revoked" || out.code === "session_expired") res.append("Set-Cookie", clearSessionCookie(mode, deps.cookie));
      return { kind: "fail", status: out.status, error: out.code, message: MESSAGES[out.code]! };
    }
    if (out.rotatedToken !== undefined) res.append("Set-Cookie", sessionCookie(out.rotatedToken, mode, deps.cookie));
    return { kind: "ok", auth: out.auth };
  }
  const attach: RequestHandler = async (req, res, next) => {
    // Public `/auth/*` routes: a valid cookie (and no Authorization header) yields a principal; anything else is anonymous.
    if (req.header("authorization") === undefined || req.header("authorization") === "") {
      try {
        const out = await authenticate(req, res);
        if (out.kind === "ok") req.auth = out.auth;
        else if (out.kind === "fail") res.locals.sessionFailure = { status: out.status, error: out.error, message: out.message };
      } catch { res.locals.sessionFailure = { status: 503, error: "auth_unavailable", message: MESSAGES.auth_unavailable }; }
    }
    csrfGuard(deps.csrf)(req, res, next);
  };
  return { authenticate, attach, guard };
}

/** The generic signup reply every duplicate-email outcome must use (A4 owns the route and reuses this constant). */
export const GENERIC_SIGNUP_RESPONSE = Object.freeze({ status: 202, body: Object.freeze({ ok: true, next: "check_email" }) });

/** True for a Mongo duplicate-key error on the unique normalised-email index, whichever tenant holds the address. */
export function isDuplicateEmailError(err: unknown): boolean {
  const e = err as { code?: unknown; keyPattern?: Record<string, unknown>; message?: unknown } | null;
  if (!e || typeof e !== "object" || e.code !== 11000) return false;
  if (e.keyPattern && typeof e.keyPattern === "object") return "emailNormalized" in e.keyPattern;
  return typeof e.message === "string" && e.message.includes("emailNormalized");
}
