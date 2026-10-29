/**
 * apps/api/src/user-accounts/cookie.ts -- unit `ua-session-core`, spec UA-15. The session cookie: name, exact
 * attributes, strict parsing. `__Secure-lkb_sid` (the prefix makes browsers require Secure), HttpOnly,
 * SameSite=Strict, no Domain (host-only), Path = <APP_BASE_PATH>/api so it never travels with static assets or
 * to other apps on the host, Max-Age 400 days (the browser cap). Secure is dropped ONLY when NODE_ENV is not
 * production AND the socket peer is loopback AND no forwarded https marker is present; no request header can
 * switch it off in production. The parser is an in-repo function (no cookie-parser dependency): one cookie of
 * the expected name, token-shaped, header length capped, duplicates refused.
 */
import type { Request } from "express";
import { hashToken } from "./tokens.js";

export const COOKIE_NAME_SECURE = "__Secure-lkb_sid";
export const COOKIE_NAME_DEV = "lkb_sid";
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const COOKIE_HEADER_MAX = 4096;
const BASE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;

export interface CookieConfig { basePath: string; production: boolean }
export interface CookieMode { secure: boolean; name: string }

/** "", "/", "/kb", "/kb/", "//kb//" -> "" | "/kb". Throws on anything that could break out of the Path attribute. */
export function normalizeBasePath(raw: string | undefined | null): string {
  const segments = String(raw ?? "").trim().split("/").filter((s) => s.length > 0);
  for (const s of segments) if (s === "." || s === ".." || !BASE_PATH_SEGMENT.test(s)) throw new Error(`APP_BASE_PATH is not a plain path: ${JSON.stringify(raw)}`);
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

export function cookiePath(cfg: CookieConfig): string {
  return `${normalizeBasePath(cfg.basePath)}/api`;
}

function isLoopback(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function cookieMode(cfg: CookieConfig, req: Request): CookieMode {
  const proto = String(req.headers?.["x-forwarded-proto"] ?? "").toLowerCase();
  const plainLocal = !cfg.production && isLoopback(req.socket?.remoteAddress) && !proto.includes("https");
  return plainLocal ? { secure: false, name: COOKIE_NAME_DEV } : { secure: true, name: COOKIE_NAME_SECURE };
}

function attrs(mode: CookieMode, cfg: CookieConfig): string {
  return `Path=${cookiePath(cfg)}; HttpOnly;${mode.secure ? " Secure;" : ""} SameSite=Strict`;
}

export function sessionCookie(token: string, mode: CookieMode, cfg: CookieConfig): string {
  return `${mode.name}=${token}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; ${attrs(mode, cfg)}`;
}

/** Same name and Path as the cookie it removes (a mismatch would leave the old one in the browser). */
export function clearSessionCookie(mode: CookieMode, cfg: CookieConfig): string {
  return `${mode.name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${attrs(mode, cfg)}`;
}

/** The raw session token from the Cookie header, or null (absent, ambiguous, malformed). Never throws. */
export function readSessionCookie(req: Request, cfg: CookieConfig): string | null {
  const header = req.headers?.cookie;
  if (typeof header !== "string" || header.length === 0 || header.length > COOKIE_HEADER_MAX) return null;
  const want = cookieMode(cfg, req).name;
  const values: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === want) values.push(part.slice(eq + 1).trim());
  }
  return values.length === 1 && hashToken(values[0]!) !== null ? values[0]! : null;
}
