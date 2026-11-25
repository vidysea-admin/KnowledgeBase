# Contract — api-rate-limit (unit L2, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 6 L2. Scope: `apps/api/src/rate-limit.ts` (`createRateLimiter`, keyed at `keyGenerator`), its mount at `apps/api/src/server.ts`
> (`app.use(createRateLimiter(deps.rateLimit))`). Refines the limiter criterion of `developer-api.md` for session principals; does not replace it.
> Owner's words: all signed-in users share one bucket of 60 per minute keyed on `tenantId`; "Key it on the user for session principals. ... Touches auth: full manifest, one fresh checker";
> check: "unit tests plus a two-user probe on the tagged URL". Branch `release/kb-golive` off `a9bbeb98`.

## Criteria
- **[L2-C1] Per-user bucket for sessions.** For a request whose principal is a session (`req.auth.principal === "session"` with a non-empty `userId`), the bucket key is the tenant plus the user. Two users of one
  tenant each get the full per-window allowance; user A exhausting theirs (429) never gives user B a 429. The same user on two sessions (two logins, two browsers) shares ONE bucket: the key is the user, never
  `sessionId`, so logging in again cannot reset the allowance.
- **[L2-C2] Everything else unchanged.** API-key principals and unauthenticated requests keep today's key (`tenantId`, else the IPv6-safe `ipKeyGenerator` fallback) and today's limits exactly: window 60 000 ms,
  max 60 by default, same 429 body and `Retry-After`. No route loses rate limiting; the middleware stays mounted where it is.
- **[L2-C3] Trusted key source.** The user part of the key comes only from the server-verified session on `req.auth` (the fields the session path sets and an incoming request cannot inject, see `SESSION_FIELDS`
  in `apps/api/src/auth.ts`), never from a header, query or body value. A test sends forged `x-user-id`-style headers and body fields and sees no change of bucket.
- **[L2-C4] No collisions.** The session key cannot equal any API-key/tenant-only key and cannot be produced by a different (tenant, user) pair: the encoding is unambiguous (for example length-prefixed or a
  reserved namespace) and tested with a tenant id containing the separator character and with user id equal to a tenant id.
- **[L2-C5] Unit tests.** Pass for C1-C4 using a small `max` and a stub clock/store where needed; each test goes red on the old `tenantId`-only key (falsification).
- **[L2-C6] Two-user probe on the tagged URL.** On the test-tagged revision: user A is driven to 429 and, in the same window, user B (same tenant) still gets 200. The probe records the number of running
  instances for the tagged revision (the fixed-window store is in memory, per instance); with more than one instance a missing 429 for A is NOT-MEASURED, not a PASS. Probe needs the provider/auth path up
  (policy .15-2). It exercises only a read-only route.

## Invariants
- **[L2-I1]** Auth and tenancy behaviour of `requireAuth` and the session guard (CSRF, non-active, viewer read-only) unchanged.
- **[L2-I2]** No user or session identifier is written to logs or the 429 body.
- **[L2-I3]** The unit changes no other file's behaviour (full manifest because it touches auth; fresh checker; the maker supplies a `dual-trigger` line or records why none applies, policy .8-3).

## Out of scope
A shared (cross-instance) limiter store; changing the number 60 or the window. Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [L2-a]->C1 (tightened: shared across sessions, not per session), [L2-b]->C2, [L2-c]->C3+C4 (tightened: forged-input test, unambiguous encoding); owner's check -> C5, C6 (added instance-count caveat) · folds inbox "unit-level checks for wave 1" (D-227)
