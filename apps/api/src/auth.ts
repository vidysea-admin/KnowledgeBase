/**
 * apps/api/src/auth.ts — T-009 C2. API-key auth middleware. Reads `Authorization: Bearer
 * <key>`, verifies via an injected `ApiKeyStore` (matches `schema/api_keys.schema.json`'s
 * `keyHash`/`scopes`/`revokedAt` shape — the store itself hashes and compares, this file never
 * sees a raw key past the request). 401 on missing/malformed/invalid/revoked key; a separate
 * `requireScope` 403s if the route's required scope isn't in the key's `scopes` — kept as two
 * middlewares so "unauthorized" and "forbidden" are never conflated into one status code.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface VerifiedKey {
  tenantId: string;
  scopes: string[];
  /** Stored non-secret API-key document id, verified by the store, never request-derived. */
  keyId?: string;
  /** Set ONLY by the session path (user-accounts, UA-17): a session principal never carries `keyId`, a key never carries these. */
  principal?: "session";
  userId?: string;
  userRole?: string;
  sessionId?: string;
  /** UA-9b: the user is not `active` (pending). Scopes are `[]` and the guard answers 403 `account_not_active`. */
  notActive?: boolean;
}

/** Result of resolving the session cookie (user-accounts UA-12..UA-19). `none` = no cookie credential presented. */
export type SessionAuthResult =
  | { kind: "none" }
  | { kind: "ok"; auth: VerifiedKey }
  | { kind: "fail"; status: 401 | 503; error: string; message: string };

/** Second principal source. Injected, so every existing caller of `requireAuth(store)` keeps its exact behaviour. */
export interface SessionAuthenticator {
  authenticate(req: Request, res: Response): Promise<SessionAuthResult>;
  /** Soft variant for public `/auth/*` routes: sets `req.auth` when a valid session cookie is present (and no Authorization header), never rejects. */
  attach: RequestHandler;
  /** Post-authentication checks for a session principal: CSRF, non-active, viewer read-only. A key passes untouched. */
  guard: RequestHandler;
}

/** Injected dependency (C2) — production impl in `store.ts` is Mongo-backed; tests use a fake. */
export interface ApiKeyStore {
  verify(key: string): Promise<VerifiedKey | null>;
}

declare global {
  namespace Express {
    interface Request {
      auth?: VerifiedKey;
    }
  }
}

const BEARER = /^Bearer\s+(.+)$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** A tenant id a key may carry: a string, non-empty (schema/api_keys.schema.json: minLength 1), no leading or
 * trailing whitespace, no control characters. No stricter pattern: real ids include "toc", "tenant-1", "tA". */
export function isValidTenantId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v === v.trim() && !CONTROL_CHARS.test(v);
}

/** `actorId(req.auth)` (UA-29): `user:<userId>` for a session, the stored key id for a key, undefined otherwise. */
export function actorId(auth: VerifiedKey | undefined): string | undefined {
  if (auth?.principal === "session") return typeof auth.userId === "string" && auth.userId.length > 0 ? `user:${auth.userId}` : undefined;
  return auth?.keyId;
}

const SESSION_FIELDS = ["principal", "userId", "userRole", "sessionId", "notActive"] as const;

export function requireAuth(store: ApiKeyStore, session?: SessionAuthenticator): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    // UA-17 precedence: an Authorization header, if present at all, is the ONLY credential considered; the cookie is
    // consulted only when there is no Authorization header. A request is never authenticated as two principals.
    if (session && header === "") {
      let outcome: SessionAuthResult;
      try { outcome = await session.authenticate(req, res); } catch { outcome = { kind: "fail", status: 503, error: "auth_unavailable", message: "authentication is temporarily unavailable" }; }
      if (outcome.kind === "fail") { res.status(outcome.status).json({ error: outcome.error, message: outcome.message }); return; }
      if (outcome.kind === "ok") { req.auth = outcome.auth; session.guard(req, res, next); return; }
    }
    const match = BEARER.exec(header);
    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "missing or malformed Authorization: Bearer <key> header" });
      return;
    }
    const verified = await store.verify(match[1]!);
    // A record with no usable tenant is refused with the SAME 401 as an unknown key (ISS-AUTHSCOPE-001): there
    // is no tenant to scope to, and the body must not reveal that the key exists.
    if (!verified || typeof verified !== "object" || !isValidTenantId(verified.tenantId)) {
      res.status(401).json({ error: "unauthorized", message: "invalid or revoked API key" });
      return;
    }
    // Fail closed on a corrupted record: scopes that are not an array of strings authenticate as a key
    // with NO scopes (every scoped route 403s). Never coerced (no splitting a string into scopes).
    const scopes: unknown = verified.scopes;
    const wellFormed = Array.isArray(scopes) && scopes.every((s) => typeof s === "string");
    const key = wellFormed ? verified : { ...verified, scopes: [] };
    // A key never acts as a user (UA-17): strip session-only fields a store double or a corrupted record might carry.
    let out: VerifiedKey = key;
    if (SESSION_FIELDS.some((f) => f in key)) { out = { ...key }; for (const f of SESSION_FIELDS) delete out[f]; }
    req.auth = out;
    next();
  };
}

export function requireScope(scope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Exact match only: an ARRAY holding an element strictly equal to `scope`. A string value would
    // substring-match under `.includes`, so never call it on an unvalidated value (ISS-TESTGAPS-001).
    const held: unknown = req.auth?.scopes;
    if (!Array.isArray(held) || !held.some((s) => typeof s === "string" && s === scope)) {
      res.status(403).json({ error: "forbidden", message: `this key is missing the required "${scope}" scope` });
      return;
    }
    next();
  };
}
