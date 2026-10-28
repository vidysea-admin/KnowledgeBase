# api-structured-logging-request-id

**Handshake status:** checked-PASS
Fix cycle: 1
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

## Fix cycle 1 (responds to verdict FAIL cycle 0, commit dc91bc6)
Changed (apps/api/src/composition only, plus 2 lines in server.ts): `logger.ts` (`resolveLevel(raw, env = process.env)` and `LoggerOptions.env`, so tests pin the environment), new `body-parser-error.ts`, new `log-level-and-body-errors.test.ts` (5 tests). `server.ts` mounts `bodyParserErrorHandler(log)` before the terminal handler.

- **ISS-APILOGGER-003 (fixed):** tests for LOG_LEVEL unset + NODE_TEST_CONTEXT unset -> info (info/warn/error written, also with NODE_ENV=production); NODE_TEST_CONTEXT set -> silent; explicit LOG_LEVEL wins in both cases (info/debug/error/silent). Checker's M6 (`!v && ctx` -> `!v`) replayed: applied (hash 1ee3e8e -> fefb8be), **KILLED** (exit 1). Also M8 (explicit level ignored under test context) KILLED. (My M5 pattern missed the source text, not run.)
- **ISS-APILOGGER-001 (fixed):** handler for body-parser `err.type` (entity.parse.failed, entity.too.large, entity.verify.failed, encoding/charset.unsupported, request.aborted, request.size.invalid, stream.encoding.set, parameters.too.many). Logs `request body rejected` at warn with `{errType, status, requestId}` only (no err, message, stack or body); answers with the exact status, headers (CSP, nosniff, content-type, content-length) and HTML of Express's production final handler, in every NODE_ENV. Baseline captured from unchanged code in production mode before the change: 400 -> `<pre>Bad Request</pre>` length 138; 413 -> `<pre>Payload Too Large</pre>` length 144; the test asserts equality with those literals in production and development.
- Reproduction by id: **ISS-APILOGGER-001: 0/4 leak** (ZZSECRETZZ raw body, truncated JSON, not-json, 200KB oversize) in both NODE_ENV=production and development: secret absent from response, stdout log and captured stderr; stderr empty. Before: raw body ZZSECRETZZ reached stderr and (development) the client page (reproduced at HEAD this cycle).
- Mutations (harness `.mut-harness-apilogger-c1.mjs`, untracked, deleted; per-mutation backup restored in `finally`, applied by hash, restored hash equal): M6, M8, handler unmounted (M9), log err.message (M10), page text changed (M11), CSP header dropped (M12): 6/6 KILLED.
- Tests: new file 5/5; request-log 8/8; server 8/8; health-probe 3/3; routes/health 19/19; health-alert-sink 2/2. `tsc --noEmit -p tsconfig.json` exit 0.
- Still open: ISS-APILOGGER-004 (low, redaction hardening, not reachable via current wiring; checker said may remain filed) and ISS-APILOGGER-002 (low, console.* in other lanes' files). Ledger statuses unchanged.
