# Verdict: api-structured-logging-request-id

VERDICT: FAIL
Cycle checked: 0
Commit checked: 2db70fd (lane/apilogger)
Scope: apps/api structured logger, request id, access log, redaction.

## EXPLANATION

One blocking finding: the headline production-risk behaviour (silent under `node --test` only) is untested, so the exact defect that would silently disable all production logs survives the suite (ISS-APILOGGER-003, medium). Everything else holds.

- Test-mode detection: `resolveLevel` returns "silent" only when LOG_LEVEL is unset/blank AND `process.env.NODE_TEST_CONTEXT` is truthy. `node --test` sets that variable in the test child processes; the Docker image runs `npx tsx apps/api/src/index.ts` with only `NODE_ENV=production`, and compose sets neither, so production is not detected as test; the code is right. But mutation M6 (`!v && NODE_TEST_CONTEXT` changed to `!v`, i.e. silent in production whenever LOG_LEVEL is unset) SURVIVED: request-log.test.ts exit 0. No test asserts either branch. Fix: see ISS-APILOGGER-003.
- Counts re-run by me: request-log 8/8, server 8/8, health-probe 3/3, routes/health 19/19, health-alert-sink 2/2; `tsc --noEmit -p apps/api/tsconfig.json` exit 0. No browser, Mongo or network beyond loopback.
- Mutations (own harness, per-mutation byte backup restored in `finally`, hash before/after confirmed changed, restored hash equal): M1 log bare key from Authorization header KILLED; M2 log originalUrl KILLED; M3 remove Mongo scrub line KILLED; M4 accept any X-Request-Id KILLED; M5 test-mode always silent KILLED (only via the "nonsense"->info assertion); M6 SURVIVED (above); M7 drop X-Request-Id header KILLED. 6 of 7 killed. Kill status is by test exit code (the harness could not parse node's summary lines); all mutations are syntactically valid.
- Redaction (my 33-case probe plus a live-server probe with fake secret ZZSECRETZZ): pattern scrubbing by value plus a key deny-list, not an allow-list. Held: Mongo URL inline, mongodb+srv, uppercase scheme, %40-encoded password, cause chain, MongoServerSelection-style message with replica hosts, MONGODB_URL literal, Bearer in error text, JSON header text, x-api-key / apikey= / Cookie text, nested arrays under benign keys, AggregateError, extra own props on an Error (not copied: only name/message/stack/code/cause), Map. Crash safety: circular objects, circular Error.cause, throwing getter, throwing toJSON, Proxy ownKeys throwing, throwing message getter, object msg with throwing toString: no exception reaches the caller (a throwing getter or Proxy drops that one line silently). Depth capped at 6.
- Leaks found, none reachable through current wiring (the access line carries only method/path/status/duration/requestId/tenantId): see ISS-APILOGGER-004 (low): non-listed key names (rawKey, accessKey, bearer, jwt), a bare "/path?q=SECRET" string value, "Authorization: Basic X", URL-encoded Bearer, unescaped @ or / in a Mongo password, Buffer emitted as bytes, a bare secret in free text.
- Access log on the live app: `/search?q=...` logs path `/search`; a 401 logs no tenantId; an authed request logs tenantId (set by finish time); the middleware is mounted first, before body-parser and auth. The path is logged as received, so a secret in a route path would be logged, but `/keys/:id` and `/sessions/:id` carry ids, not keys, and no route takes a key in the path.
- Request id: `^[A-Za-z0-9._-]{1,128}$`, else UUID; CR/LF impossible (regex, and Node rejects them upstream); a duplicated header arrives joined "a, b", fails the pattern and gets a UUID (live raw-socket probe). 30 overlapping requests with distinct ids each echoed their own id and produced 30 access lines with matching ids; state is per request (closure), nothing shared.
- Client behaviour: the only change is the new `X-Request-Id` header; the 500 body is unchanged (test deep-equals it). Note only: cors.ts sets no `Access-Control-Expose-Headers`, so browser JS cannot read X-Request-Id cross-origin.
- ISS-APILOGGER-001 ruling: CONFIRMED and pre-existing, not a regression. For a malformed JSON body to /ask, Express's finalhandler prints the SyntaxError stack to stderr. Bodies `{"password":"ZZSECRETZZ", oops` and `{not json ZZSECRETZZ-...` were not echoed, but a raw body `ZZSECRETZZ` was: stderr contained the secret, and when NODE_ENV is not production the CLIENT's HTML 400 page also contained it. stdout logger output contained none. Medium is right. The maker's reason is only half valid: a handler that logs structured and then delegates to the same default rendering can keep the client body identical. Not the cause of this FAIL because it is disclosed and unchanged by this unit, but the unit cannot claim body redaction on stderr until it is closed.
- After: logger.ts, request-log.ts, server.ts, index.ts, request-log.test.ts each equal `git rev-parse HEAD:<file>`; probes and harness deleted; `git status --porcelain` clean in the worktree and the main tree before this verdict.

Required for PASS: close ISS-APILOGGER-003 (test both branches of the test-mode default; M6 must go red). ISS-APILOGGER-001 and -004 may remain filed.

ISSUES-WRITTEN: ISS-APILOGGER-003, ISS-APILOGGER-004

---

# Cycle checked: 1

VERDICT: PASS
Cycle checked: 1
Commit checked: ecebad8 (lane/apilogger), cycle 0 FAIL was dc91bc6.

## EXPLANATION

Cycle 1 fixes exactly what failed and breaks nothing.

- ISS-APILOGGER-003: `resolveLevel(raw, env)` + `LoggerOptions.env`; three tests pin both branches via injected env. I replayed M6 (`!v && ctx` -> `!v`): KILLED (exit 1). Own variants (applied by hash-verified change, per-mutation backup restored in `finally`, restored hash == original each time): test default silent->error KILLED; never-silent KILLED; ctx truthiness inverted KILLED; ctx-only (`if (ctx)`) SURVIVED, equivalent except a non-blank invalid LOG_LEVEL under test context (nonsense -> silent vs info), immaterial (note only). The prod-default `info`->`warn` variant was not run (pattern missed CRLF); the `{}` env test asserts info/warn/error lines so it would fail.
- ISS-APILOGGER-001: body-parser-error.ts is mounted after all routers and BEFORE the terminal 500 handler. It acts only when `err.type` is in the body-parser type set AND status is a number 400-599; otherwise `next(err)`. I verified by direct call: `{status:400}` (no type), `{status:404,type:"other"}`, plain Error, null, type without status, status 200 all call `next(err)` and write nothing. Mutation "swallow all (no type check)" SURVIVED the maker's tests (passthrough is untested; code is correct, filed as note, not blocking).
- Byte-identity: I generated the baseline from a bare Express 5.2.1 app (`express.json()`, no error handler, NODE_ENV=production, finalhandler 2.1.1) and compared raw status + all headers (minus date/request id/CORS/ratelimit) + body against the real server in NODE_ENV production AND development, for body `ZZSECRETZZ`, 200000 x's, `{"a":`: all three identical (400/138, 413/144, 400/138; CSP, nosniff, content-type html). The literals are real.
- ZZSECRETZZ replay in both NODE_ENVs: leaks in client body, stdout log and stderr = 0 (stderr empty; the baseline bare Express printed stacks, ours none). Log line carries errType/status/requestId only.
- Counts re-run: new 5/5, request-log 8/8, server 8/8; tsc --noEmit exit 0. Mutants V7 (log err), V9 (drop CSP), V10 (status 400 constant) KILLED.
- After: logger.ts, body-parser-error.ts, server.ts hash == HEAD; harness deleted; worktree clean before this section.
- Rows ISS-APILOGGER-001 and -003 set to verified in qa/issues.apilogger.jsonl. -002 and -004 stay open (low).

ISSUES-WRITTEN: none
