/**
 * apps/api/src/user-accounts/csrf.ts -- unit `ua-session-core`, spec UA-16. The cookie principal needs, on every
 * method other than GET/HEAD/OPTIONS: (a) an `Origin` header equal to an allowed origin, and (b) `X-LKB-CSRF`
 * equal to HMAC-SHA256(AUTH_CSRF_SECRET, session id). The token is delivered in login / GET /auth/session bodies
 * and held in page memory only. Bearer-key requests never reach this check (no ambient credential).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const CSRF_HEADER = "x-lkb-csrf";
export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
const SECRET_MIN_BYTES = 32;

export interface CsrfConfig { secret: string; allowedOrigins: readonly string[] }

export function assertCsrfSecret(secret: unknown): asserts secret is string {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < SECRET_MIN_BYTES) throw new Error(`AUTH_CSRF_SECRET must be at least ${SECRET_MIN_BYTES} bytes`);
}

export function csrfTokenFor(sessionId: string, secret: string): string {
  assertCsrfSecret(secret);
  return createHmac("sha256", secret).update(`lkb-csrf:${sessionId}`, "utf8").digest("base64url");
}

/** "https://kb.example.org/" and "HTTPS://KB.example.org" -> "https://kb.example.org"; junk -> null. */
export function normalizeOrigin(raw: string): string | null {
  try { const u = new URL(raw); return u.origin === "null" ? null : u.origin; } catch { return null; }
}

const digest = (s: string): Buffer => createHash("sha256").update(s, "utf8").digest();

export function checkCsrf(req: Request, sessionId: string, cfg: CsrfConfig): boolean {
  const origin = req.header("origin");
  const presentedOrigin = typeof origin === "string" ? normalizeOrigin(origin) : null;
  const allowed = cfg.allowedOrigins.map(normalizeOrigin).filter((o): o is string => o !== null);
  if (presentedOrigin === null || !allowed.includes(presentedOrigin)) return false;
  const header = req.header(CSRF_HEADER);
  if (typeof header !== "string" || header.length === 0) return false;
  return timingSafeEqual(digest(header), digest(csrfTokenFor(sessionId, cfg.secret)));
}

export function denyCsrf(res: Response): void {
  res.status(403).json({ error: "csrf", message: "missing or invalid CSRF proof" });
}

/** Applies the check to a SESSION principal on unsafe methods; keys and safe methods pass untouched. */
export function csrfGuard(cfg: CsrfConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const a = req.auth;
    if (a?.principal !== "session" || SAFE_METHODS.has(req.method.toUpperCase())) { next(); return; }
    if (typeof a.sessionId !== "string" || !checkCsrf(req, a.sessionId, cfg)) { denyCsrf(res); return; }
    next();
  };
}
