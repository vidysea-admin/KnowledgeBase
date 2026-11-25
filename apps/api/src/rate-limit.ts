/**
 * apps/api/src/rate-limit.ts — T-009 C6. Per-key fixed-window limiter. `sources/whatsapp_msg`
 * already carries `express-rate-limit@8.6.2` as a proven dependency for this exact stack
 * (checked `sources/whatsapp_msg/package.json` first, per the contract) — reused here rather
 * than hand-rolled. Keyed on the verified tenantId (this middleware is mounted after
 * `requireAuth`, so `req.auth` is always set by the time it runs) so one caller's key can't be
 * starved by another's traffic. A signed-in (session) user is keyed on tenant + user, so one
 * tenant's many viewers do not share a single bucket (golive-launch-prep L2).
 */
import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

/**
 * The bucket key for an authenticated principal, or undefined when there is none (the caller then falls back to the IP).
 *  - API key: the verified tenantId, exactly as before (every key of a tenant shares one bucket).
 *  - Session (cookie sign-in): the verified tenantId AND userId, so many viewers of one tenant each get their own bucket
 *    instead of sharing one. Both come only from `req.auth`, which `requireAuth` fills from the stored session row,
 *    never from a header, query or body value. The key is a leading control character plus a JSON array: the
 *    array is an injective encoding of the (tenantId, userId) pair, and the control character can never start an
 *    API-key bucket, because `isValidTenantId` (auth.ts) refuses control characters in a key's tenant. So a session
 *    bucket can never equal an API-key bucket, whatever a tenant is named, nor an IP bucket.
 *  - A session principal that somehow carries no usable userId keeps the tenant key: it must never escape the limit.
 */
function limiterKey(auth: Request["auth"]): string | undefined {
  if (auth?.principal === "session" && typeof auth.tenantId === "string" && typeof auth.userId === "string" && auth.userId.length > 0) {
    return `\u0001${JSON.stringify([auth.tenantId, auth.userId])}`;
  }
  return auth?.tenantId;
}

export function createRateLimiter(opts: RateLimitOptions = {}): RateLimitRequestHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // `ipKeyGenerator` normalizes IPv6 addresses (subnet-aware) per express-rate-limit's own
    // guidance — a raw `req.ip` fallback would let IPv6 callers dodge the per-key limit.
    keyGenerator: (req) => limiterKey(req.auth) ?? ipKeyGenerator(req.ip ?? "anonymous"),
    handler: (_req, res) => {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000).toString());
      res.status(429).json({ error: "rate_limited", message: "too many requests — slow down and retry after the window" });
    },
  });
}
