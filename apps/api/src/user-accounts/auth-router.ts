/**
 * apps/api/src/user-accounts/auth-router.ts -- unit `ua-auth-api`, spec UA-1 / UA-4 / UA-11 / UA-12 / UA-18..UA-25.
 *
 * The HTTP face of auth-service.ts, mounted by composition/integrations/user-accounts.ts at `/auth` AFTER `session.attach`
 * (so `req.auth` is a session principal when a valid cookie came with the request, CSRF already enforced for that case).
 * Pure transport: validation, headers, cookies. Every decision lives in the service.
 *
 *  - No route here is reachable with a Bearer key: ANY Authorization header on /auth is 403 `key_not_allowed` (UA-17).
 *  - The tenant of every public route is the server-side USER_SIGNUP_TENANT; a body field can never name one (unknown fields are 400).
 *  - A browser POST that is not a session request still has to come from the app: an Origin header that is present and not on the
 *    allow-list is 403 `csrf`. A missing Origin (curl, server to server) is allowed: it cannot be forged by a cross-site page.
 *  - Per-IP rate limits (429 + Retry-After, standard body) run before the body is looked at.
 *  - A storage failure is 503 `auth_unavailable` with no detail; nothing internal is echoed.
 */
import { isIPv4, isIPv6 } from "node:net";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { VerifiedKey } from "../auth.js";
import type { Logger } from "../composition/logger.js";
import type { ApiResult, AuthService, RequestMeta } from "./auth-service.js";
import { clearSessionCookie, cookieMode, sessionCookie, type CookieConfig } from "./cookie.js";
import { denyCsrf, normalizeOrigin, SAFE_METHODS, type CsrfConfig } from "./csrf.js";
import { createIpLimiters, type IpLimits } from "./throttle.js";

export interface AuthRouterDeps {
  service: AuthService;
  cookie: CookieConfig;
  csrf: CsrfConfig;
  /** USER_SIGNUP_TENANT. Undefined: signup answers 503 `signup_not_configured`, the other public routes 503 `auth_not_configured`. */
  signupTenant: string | undefined;
  ipLimits?: Partial<IpLimits> | undefined;
  log?: Pick<Logger, "warn"> | undefined;
}

const MAX_LEN: Record<string, number> = { email: 254, password: 1024, newPassword: 1024, currentPassword: 1024, displayName: 200, token: 200 };

type Body = Record<string, string>;
type Read = { ok: true; v: Body } | { ok: false; fields: string[] };

/** A plain JSON object whose keys are exactly a subset of `allowed` containing all of `required`, every value a bounded string. */
function readBody(req: Request, allowed: readonly string[], required: readonly string[]): Read {
  const raw: unknown = req.body === undefined ? {} : req.body;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, fields: ["body"] };
  const keys = Object.keys(raw);
  if (keys.some((k) => !allowed.includes(k))) return { ok: false, fields: ["body"] };
  const bad: string[] = [];
  const v: Body = {};
  for (const k of keys) {
    const x = (raw as Record<string, unknown>)[k];
    if (typeof x !== "string" || x.length > (MAX_LEN[k] ?? 200)) bad.push(k); else v[k] = x;
  }
  for (const k of required) if (!(k in v) && !bad.includes(k)) bad.push(k);
  return bad.length > 0 ? { ok: false, fields: bad } : { ok: true, v };
}

/** Truncated network prefix for the audit trail: IPv4 -> a.b.c.0/24, IPv6 -> first three groups /48. Anything else -> undefined. */
export function ipPrefixOf(ip: string | undefined): string | undefined {
  if (typeof ip !== "string") return undefined;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIPv4(v4)) return `${v4.split(".").slice(0, 3).join(".")}.0/24`;
  if (!isIPv6(ip)) return undefined;
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b].slice(0, 3);
  return groups.length === 3 ? `${groups.map((g) => g.toLowerCase()).join(":")}::/48` : undefined;
}

/** A coarse "Chrome 126 on Windows"; never the raw header (free text from the client is not stored). */
export function userAgentSummaryOf(ua: string | undefined): string | undefined {
  if (typeof ua !== "string" || ua.length === 0) return undefined;
  const browser = /(Edg|Firefox|OPR|Chrome|Safari)\/(\d{1,3})/.exec(ua);
  const os = /(Windows|Android|iPhone|iPad|Mac OS X|CrOS|Linux)/.exec(ua);
  const parts = [browser ? `${browser[1] === "Edg" ? "Edge" : browser[1] === "OPR" ? "Opera" : browser[1]} ${browser[2]}` : null, os ? `on ${os[1]!.replace("Mac OS X", "macOS")}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function metaOf(req: Request): RequestMeta {
  const ipPrefix = ipPrefixOf(req.ip), userAgentSummary = userAgentSummaryOf(req.header("user-agent"));
  return { ...(ipPrefix ? { ipPrefix } : {}), ...(userAgentSummary ? { userAgentSummary } : {}) };
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { service, cookie, csrf } = deps;
  const limit = createIpLimiters(deps.ipLimits);
  const allowedOrigins = csrf.allowedOrigins.map(normalizeOrigin).filter((o): o is string => o !== null);
  const r = Router();

  const send = (req: Request, res: Response, out: ApiResult): void => {
    const mode = cookieMode(cookie, req);
    // The router's result is authoritative: it replaces any cookie header the session perimeter appended (stale-cookie clear, rotation).
    if (out.sessionToken !== undefined) res.setHeader("Set-Cookie", sessionCookie(out.sessionToken, mode, cookie));
    else if (out.clearCookie === true) res.setHeader("Set-Cookie", clearSessionCookie(mode, cookie));
    if (out.status === 429 && res.getHeader("Retry-After") === undefined) res.setHeader("Retry-After", "3600");
    res.status(out.status).json(out.body);
  };
  const badRequest = (res: Response, fields: string[]): void => { res.status(400).json({ error: "invalid_request", message: "the request is not acceptable", fields }); };
  const unavailable = (res: Response): void => { res.status(503).json({ error: "auth_unavailable", message: "authentication is temporarily unavailable" }); };

  /** Wraps a handler: a thrown / rejected storage error is the opaque 503, never a 500 or a stack. */
  const route = (name: string, fn: (req: Request, res: Response) => Promise<void>): RequestHandler => async (req, res) => {
    try { await fn(req, res); } catch (err) {
      deps.log?.warn("auth route failed", { route: name, error: err instanceof Error ? err.name : "unknown" });
      if (!res.headersSent) unavailable(res);
    }
  };

  // 1. Perimeter ------------------------------------------------------------------------------------------------------------------
  r.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.header("authorization") !== undefined) { res.status(403).json({ error: "key_not_allowed", message: "API keys cannot use account routes" }); return; }
    if (!SAFE_METHODS.has(req.method.toUpperCase()) && req.auth?.principal !== "session") {
      const origin = req.header("origin");
      if (origin !== undefined) { const o = normalizeOrigin(origin); if (o === null || !allowedOrigins.includes(o)) { denyCsrf(res); return; } }
    }
    next();
  });

  const tenantFor = (res: Response): string | null => {
    if (deps.signupTenant !== undefined && deps.signupTenant.length > 0) return deps.signupTenant;
    res.status(503).json({ error: "auth_not_configured", message: "sign-in is not configured on this server" });
    return null;
  };
  const sessionAuth = (req: Request, res: Response): VerifiedKey | null => {
    const a = req.auth;
    if (a?.principal === "session" && typeof a.userId === "string" && typeof a.sessionId === "string") return a;
    const f = res.locals.sessionFailure as { status?: number; error?: string; message?: string } | undefined;
    if (f && typeof f.status === "number" && typeof f.error === "string") res.status(f.status).json({ error: f.error, message: f.message ?? "invalid session" });
    else res.status(401).json({ error: "unauthorized", message: "sign in required" });
    return null;
  };

  // 2. Public routes --------------------------------------------------------------------------------------------------------------
  r.post("/signup", limit.signup, route("signup", async (req, res) => {
    if (deps.signupTenant === undefined || deps.signupTenant.length === 0) { res.status(503).json({ error: "signup_not_configured", message: "signup is not open on this server" }); return; }
    const b = readBody(req, ["email", "password", "displayName"], ["email", "password", "displayName"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    send(req, res, await service.signup(deps.signupTenant, { email: b.v.email!, password: b.v.password!, displayName: b.v.displayName! }, metaOf(req)));
  }));

  r.post("/verify-email", limit.token, route("verify-email", async (req, res) => {
    const b = readBody(req, ["token"], ["token"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    const tenant = tenantFor(res); if (tenant === null) return;
    send(req, res, await service.verifyEmail(tenant, b.v.token!, metaOf(req)));
  }));

  r.post("/login", limit.login, route("login", async (req, res) => {
    const b = readBody(req, ["email", "password"], ["email", "password"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    const tenant = tenantFor(res); if (tenant === null) return;
    const meta = metaOf(req);
    const out = await service.login(tenant, { email: b.v.email!, password: b.v.password! }, meta);
    // One cookie, one live session: a successful login ends the session this browser presented (best effort, after the new one exists).
    if (out.sessionToken !== undefined && req.auth?.principal === "session" && typeof req.auth.sessionId === "string") {
      try { await service.logout(req.auth, meta); } catch { deps.log?.warn("auth route failed", { route: "login-revoke-previous" }); }
    }
    send(req, res, out);
  }));

  r.post("/password/forgot", limit.forgot, route("password-forgot", async (req, res) => {
    const b = readBody(req, ["email"], ["email"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    const tenant = tenantFor(res); if (tenant === null) return;
    send(req, res, await service.forgotPassword(tenant, b.v.email!));
  }));

  r.post("/password/reset", limit.token, route("password-reset", async (req, res) => {
    const b = readBody(req, ["token", "newPassword"], ["token", "newPassword"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    const tenant = tenantFor(res); if (tenant === null) return;
    send(req, res, await service.resetPassword(tenant, { token: b.v.token!, newPassword: b.v.newPassword! }, metaOf(req)));
  }));

  // 3. Session routes (cookie required; CSRF for unsafe methods was enforced by `session.attach`) -----------------------------------
  r.get("/session", route("session", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    send(req, res, await service.currentSession(a));
  }));

  r.post("/logout", route("logout", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    const b = readBody(req, [], []); if (!b.ok) { badRequest(res, b.fields); return; }
    send(req, res, await service.logout(a, metaOf(req)));
  }));

  r.post("/logout-all", route("logout-all", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    const b = readBody(req, [], []); if (!b.ok) { badRequest(res, b.fields); return; }
    send(req, res, await service.logoutAll(a, metaOf(req)));
  }));

  r.get("/sessions", route("sessions", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    send(req, res, await service.listSessions(a));
  }));

  r.delete("/sessions/:id", route("sessions-revoke", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    send(req, res, await service.revokeOwnSession(a, String(req.params.id ?? ""), metaOf(req)));
  }));

  r.post("/password/change", route("password-change", async (req, res) => {
    const a = sessionAuth(req, res); if (a === null) return;
    const b = readBody(req, ["currentPassword", "newPassword"], ["currentPassword", "newPassword"]);
    if (!b.ok) { badRequest(res, b.fields); return; }
    send(req, res, await service.changePassword(a, { currentPassword: b.v.currentPassword!, newPassword: b.v.newPassword! }, metaOf(req)));
  }));

  return r;
}
