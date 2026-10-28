# Verdict: t057-d4-usage-events

VERDICT: PASS
Cycle checked: 0
Commit checked: ff5dc32 (lane/usageevents, base 15015cf)
Scope: schema `usage_events`, migration, db accessor, recorder middleware, `GET /usage`, Analytics panel. No MongoDB was contacted; nothing deployed or migrated.

## EXPLANATION

- Document shape (read in code, then run): `buildUsageEvent` returns exactly `_id, kind, at, day, outcome, latencyMs`; `scopedCollection.insertOne` adds `tenantId`. The recorder reads only `req.auth.tenantId`, `res.statusCode` and a clock; it never touches body, query, headers, IP or path params, and the store forwards three fields. Live test (real server, real builder over a fake Db, query text, user-agent and bearer key sent): stored keys equal the seven schema keys, forbidden strings absent. Mutation M1 (query text through recorder, store and builder) turned 3 api tests and 1 db test red.
- Request-path safety: the write starts on `res` "finish", after the response is sent; record() runs inside `Promise.resolve().then`, so a sync throw, a reject and a hang are all contained; the race against a 2 s timer has both branches handled (no unhandled rejection), the timer is cleared and unref'd. Beyond 100 in flight an event is dropped silently except for a warn line (reason `backlog`); there is no counter (acceptable, noted). Log carries a fixed message, kind, reason and the error NAME only. Hanging-store test: response under 50 ms. M2 (await the write before next()) hung the api suite until the 120 s kill, so it is red.
- Caveat already filed as ISS-USAGEEVENTS-003 (low): the in-flight slot is freed at the 2 s timeout while a hung driver call may still be pending, so "bounded" holds for the recorder's own queue, not the driver's. Rate limiting and the driver's server-selection timeout bound it in practice. Not raised.
- Tenancy: tenantId comes from `req.auth` only (spoofed `x-tenant-id` and body `tenantId` tested); writes and reads go through `scopedCollection`, whose `find` merges `{tenantId}` and validates it. `days`: only `^[1-9][0-9]?$` and at most 90 pass; 15 hostile forms (0, 91, 1e1, -1, 05, repeated, array, extra params, non-empty body) are 400 before any read. M3 (read via the raw collection, no tenant) is red (db test, 1 fail).
- 401/403/429: the middleware sits after requireAuth and the rate limiter, so unauthenticated and over-limit traffic never reaches it; 403 (scope) and 400 come from the handler routers and are 4xx, not recorded; 5xx from a throwing handler is recorded as `error`. /ask and /search are plain JSON responses in this tree (no SSE), so "finish" is the right hook.
- Schema sync: validate.py 28 schemas pass, `usage_events` 1 valid and 4 invalid fixtures; `gen-types.mjs --check` OK (28 files + index.ts); `schema/index.json` entry matches the migration's reading of it. Migration follows the watch-heartbeat shape (createCollection only if missing; createIndex with identical specs is a no-op); dry-run against the fake Db: 3 pass (idempotent on re-run, no TTL, no unique, down drops). No TTL is stated as an open Approver question (ISS-USAGEEVENTS-001, medium, open).
- Merge-tree against main HEAD e4d6f14: `git merge-tree --write-tree` returns a tree with no conflicts (server.ts, production.ts, AnalyticsPage included).
- Counts I re-ran: migration 3, db 5, api usage 14, api server+production+cors+search-store 23, web (usage + analytics) 42 pass; `tsc --noEmit` core, db (temp paths), api (temp paths), web all exit 0 with no output. Temporary tsconfigs deleted.
- Mutations (own harness, per-mutation byte backup restored in `finally`): M1, M2, M3 all KILLED; after each, `git hash-object` equals `git rev-parse HEAD:<file>` for recorder.ts, store.ts and usage-events.ts. Harness and tmp tsconfig deleted; worktree clean.
- Notes (not issues): schema text says latency runs "from request arrival", the code measures from after auth (covered by ISS-USAGEEVENTS-003). Dropped events are logged, not counted.

ISSUES-WRITTEN: none
checker: t057-d4-usage-events - PASS cycle 0 (content-free closed document verified live; fire-and-forget write cannot slow or fail a request; tenant from key and scoped on read; schema/types/gen-types in sync; clean merge-tree; 3 own mutations killed; ISS-USAGEEVENTS-001 medium stays open)
