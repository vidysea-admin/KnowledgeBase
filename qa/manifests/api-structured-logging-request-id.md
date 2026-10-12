# api-structured-logging-request-id

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: deployment readiness D7 (structured logging + request id). Class: security-adjacent (secret redaction in logs): full ceremony. Verdict by the checker only.
Lane: lane/apilogger. Lane ledger `qa/issues.apilogger.jsonl`: ISS-APILOGGER-001 (medium), ISS-APILOGGER-002 (low).

## Scope
apps/api only. New (in existing dir `apps/api/src/composition/`, so `apps/api/src` file count is unchanged): `logger.ts`, `request-log.ts`, `request-log.test.ts` (8 tests). Edited: `server.ts` (requestLogger mounted first; optional `ServerDeps.logger`; terminal error handler uses the logger), `index.ts` (2 console calls replaced). Not touched: routes, Dockerfiles, compose, other lanes' files.

## Approach
No logger dependency exists in apps/api, so a minimal JSON logger: one object per line on stdout `{...fields, time, level, msg}` (reserved keys written last, so a field cannot spoof them); `child({requestId})`. `LOG_LEVEL` (debug|info|warn|error|silent; default info) read per call so a `.env` loaded after import still applies; under `node --test` with LOG_LEVEL unset the default is silent (keeps existing suites quiet).
Redaction on every line: by KEY at any depth (authorization, cookie, set-cookie, x-api-key, api key, token, secret, password, headers, body, query, req/res, ...), and by VALUE in all strings and Error message/stack/cause (Mongo URL credentials, the literal MONGODB_URL, Bearer tokens, `x-api-key:`/`api_key=` pairs, URL query strings).
Middleware: `X-Request-Id` accepted only if `^[A-Za-z0-9._-]{1,128}$`, else `crypto.randomUUID()`; echoed on the response; `req.requestId` and `req.log` exposed for routes. One access line per request on finish (or aborted close, status 499): method, path without query/fragment, status, durationMs, requestId, tenantId when authenticated; level info/warn(4xx)/error(5xx). Error handler logs `unhandled error` with `err` (name, message, stack, redacted) and requestId; client body unchanged: `{"error":"internal_error","message":"internal error"}`.

## Evidence (apps/api; node off PATH; `timeout` around each; no browser/Mongo/network beyond loopback)
- `request-log.test.ts` -> `tests 8, pass 8, fail 0`: id generated / safe accepted / 8 unsafe rejected (space, 129 chars, markup, `;`, unicode, `/`, `,`, empty); header echoed; access line key set and values; query string absent; tenantId only when authenticated; redaction: API key, Authorization, cookie, x-api-key, query string, request body (valid and malformed), Mongo URL (inline and via MONGODB_URL), Bearer in error text, nested keys, spoofed reserved keys; levels and circular fields; error path: requestId + stack logged, body identical to before, stack not in response.
- `server.test.ts` 8/8, `health-probe.test.ts` 3/3, `routes/health.test.ts` 19/19, `routes/health-alert-sink.test.ts` 2/2.
- Typecheck `tsc --noEmit -p tsconfig.json` in apps/api -> exit 0.
- `scripts/lint-dirsize.mjs` / `lint-loc.mjs` report violations that pre-exist at HEAD and are not in my files (apps/api/src 32 files vs 31, apps/api/src/routes 32, packages/meeting-bot, sb_join.py).

## Mutations (9; harness `.mut-harness-apilogger.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; applied-check by hash; afterwards `git hash-object` of logger.ts, request-log.ts, server.ts unchanged)
All 9 KILLED: query kept in path; unsafe id accepted; header not echoed; tenantId dropped; key redaction off; Mongo regex off; Bearer scrub off; reserved keys overridable; error not logged.

## console.* remaining in apps/api/src (outside this lane)
11 non-test calls: indexing/promote-entities.ts, indexing/session.ts, indexing/vector-gap.ts, ingest-store.ts, whatsapp/store.ts (see grep); 24 more in test files. server.ts and index.ts: 0.

## NOT covered / open
- ISS-APILOGGER-001: Express's default final handler still prints body-parser (status) errors to stderr unstructured; message may echo a body snippet. Not fixed: changing it would change the client response.
- ISS-APILOGGER-002: remaining console use in other files.
- Access log is written per request at info (including /health probes); no sampling. Request id is not propagated to async work outside req.log (no AsyncLocalStorage).
