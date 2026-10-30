/**
 * apps/api/src/user-accounts/throttle.ts -- unit `ua-auth-api`, spec UA-23 / UA-24.
 *  - Lockout state machine (pure): failed logins are counted per salted email hash in `auth_throttles`, a row exists
 *    even for an address with no account. 5 failures inside 15 min lock that email for 15 min; every further lock
 *    doubles, capped at 24 h. A success or an admin unlock clears the row. A failure while locked changes nothing,
 *    so hammering cannot extend a lock. Existing sessions are unaffected (the session service never reads this).
 *  - `createThrottle`: the state machine over an injected `ThrottleStore` (Mongo in production).
 *  - `createWindowLimiter`: small in-memory per-key limiter (per-email mail/signup limits; single API instance, UA-23).
 *  - `createIpLimiters`: the express-rate-limit instances for the public routes, 429 with the API's standard body.
 */
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";

export const LOCK_THRESHOLD = 5;
export const WINDOW_MS = 15 * 60_000;
export const BASE_LOCK_MS = 15 * 60_000;
export const MAX_LOCK_MS = 24 * 60 * 60_000;

/** Persisted throttle fields (ISO strings, as in the row). */
export interface ThrottleState { failures: number; lockCount: number; windowStartedAt: string; lastFailureAt: string; lockedUntil?: string }

/** The n-th lock lasts 15 min * 2^(n-1), capped at 24 h. */
export function lockDurationMs(lockCount: number): number {
  const n = Number.isFinite(lockCount) ? Math.max(1, Math.trunc(lockCount)) : 1;
  return n > 12 ? MAX_LOCK_MS : Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (n - 1));
}

const ms = (iso: string | undefined): number => (typeof iso === "string" ? Date.parse(iso) : Number.NaN);

export function isLocked(row: ThrottleState | null | undefined, now: Date): boolean {
  const until = ms(row?.lockedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/** The state after one more failed attempt. `locked` is true only for the failure that STARTS a lock. */
export function applyFailure(row: ThrottleState | null, now: Date): { next: ThrottleState; locked: boolean } {
  const at = now.toISOString();
  if (row && isLocked(row, now)) return { next: row, locked: false };
  const lockExpired = row !== null && row.lockedUntil !== undefined;
  const windowOver = row === null || lockExpired || now.getTime() - ms(row.windowStartedAt) > WINDOW_MS || !Number.isFinite(ms(row.windowStartedAt));
  const failures = (windowOver ? 0 : row.failures) + 1;
  const windowStartedAt = windowOver ? at : row.windowStartedAt;
  const lockCount = row?.lockCount ?? 0;
  if (failures >= LOCK_THRESHOLD) {
    const n = lockCount + 1;
    return { next: { failures: 0, lockCount: n, windowStartedAt: at, lastFailureAt: at, lockedUntil: new Date(now.getTime() + lockDurationMs(n)).toISOString() }, locked: true };
  }
  return { next: { failures, lockCount, windowStartedAt, lastFailureAt: at }, locked: false };
}

export interface ThrottleStore {
  get(tenantId: string, subjectHash: string): Promise<ThrottleState | null>;
  /** Compare-and-set: writes `next` only if the stored row still equals `prev` (null = no row). False when another attempt got there first. */
  put(tenantId: string, subjectHash: string, next: ThrottleState, prev: ThrottleState | null): Promise<boolean>;
  clear(tenantId: string, subjectHash: string): Promise<void>;
}

/** Bound on compare-and-set retries; parallel guesses on one address beyond this are not counted (the per-IP limiter still bounds them). */
const CAS_ATTEMPTS = 12;

export function createThrottle(deps: { store: ThrottleStore; now?: () => Date }) {
  const clock = deps.now ?? (() => new Date());
  return {
    isLocked: async (tenantId: string, subjectHash: string): Promise<boolean> => isLocked(await deps.store.get(tenantId, subjectHash), clock()),
    /** Counts one failed attempt. `newlyLocked` is true for the attempt that started a lock. Parallel attempts cannot lose each other's count. */
    async fail(tenantId: string, subjectHash: string): Promise<{ newlyLocked: boolean }> {
      for (let i = 0; i < CAS_ATTEMPTS; i++) {
        const now = clock();
        const prev = await deps.store.get(tenantId, subjectHash);
        const { next, locked } = applyFailure(prev, now);
        if (next === prev) return { newlyLocked: false }; // already locked: nothing to write
        if (await deps.store.put(tenantId, subjectHash, next, prev)) return { newlyLocked: locked };
      }
      return { newlyLocked: false };
    },
    clear: (tenantId: string, subjectHash: string): Promise<void> => deps.store.clear(tenantId, subjectHash),
  };
}
export type Throttle = ReturnType<typeof createThrottle>;

/** Sliding-window counter per key. `hit` returns false once `max` hits are already inside the window. */
export function createWindowLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const clock = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  const MAX_KEYS = 50_000;
  return {
    hit(key: string): boolean {
      const t = clock();
      const live = (hits.get(key) ?? []).filter((h) => t - h < opts.windowMs);
      if (live.length >= opts.max) { hits.set(key, live); return false; }
      live.push(t); hits.set(key, live);
      if (hits.size > MAX_KEYS) for (const [k, v] of hits) { if (v.every((h) => t - h >= opts.windowMs)) hits.delete(k); if (hits.size <= MAX_KEYS / 2) break; }
      return true;
    },
    size: () => hits.size,
  };
}

export interface IpLimits { loginPerWindow: number; signupPerHour: number; forgotPerHour: number; tokenPerHour: number }
export const DEFAULT_IP_LIMITS: IpLimits = { loginPerWindow: 20, signupPerHour: 5, forgotPerHour: 5, tokenPerHour: 20 };

function ipLimiter(windowMs: number, limit: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "anonymous"),
    handler: (_req, res) => {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000).toString());
      res.status(429).json({ error: "rate_limited", message: "too many requests — slow down and retry after the window" });
    },
  });
}

/** Per IP: login 20 / 15 min, signup 5 / h, forgot 5 / h, verify+reset token attempts 20 / h (UA-23). */
export function createIpLimiters(limits: Partial<IpLimits> = {}) {
  const l = { ...DEFAULT_IP_LIMITS, ...limits };
  const HOUR = 60 * 60_000;
  return { login: ipLimiter(15 * 60_000, l.loginPerWindow), signup: ipLimiter(HOUR, l.signupPerHour), forgot: ipLimiter(HOUR, l.forgotPerHour), token: ipLimiter(HOUR, l.tokenPerHour) };
}
