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

export function requireAuth(store: ApiKeyStore): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
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
    req.auth = wellFormed ? verified : { ...verified, scopes: [] };
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
