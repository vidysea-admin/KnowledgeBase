# Verdict: t049-langfuse-trace-sink
VERDICT: PASS
Cycle checked: 0
Commit checked: 7ee839e (lane/t049sink, base 2d1e738). Checker: independent.
Scope: PASS at "contract and safety properties verified against a fake fetch; Langfuse WIRE FORMAT UNVERIFIED". Does NOT establish that a trace appears in a real Langfuse UI. T-049 stays open.

## EXPLANATION
Probes: lane-unique untracked tests, no network (fake fetch only; global fetch stubbed in the registry probe; zero real requests), deleted after use; git status clean.

1. Egress. 12 hostile records with sentinels (prompt, completion, transcript with speaker, email, phone, passcode, sk-/AIza keys, Bearer, Windows path with user, pwd= URL, tenant-like id, error message with path and key) planted in every field, in unknown keys, in nested error/usage/metadata/headers objects, and in each allowed string field. Searched URL + body + non-auth headers + onError codes: no sentinel or fragment found; both keys and their base64 appear only in the Authorization header. Label validator: charset [A-Za-z0-9._:-], 1-64 chars, starts alphanumeric, rejects key prefixes (sk-, pk-, AIza, ghp_, eyJ, Bearer) and any 24+ alnum run. Label-shaped secrets DO pass (tiger7, 9876543210, hunter2, meet.example.com, hyphenated UUID-like ids): unavoidable for a short passcode.
   Provenance: jobKind = Job.kind (literals in callers: extract, summarize, claims, ask.*), fixed vocabulary; provider = provider.name (fixed adapter name); model = provider-reported or opts.model (fixed vocabulary; names with `/` dropped); errorClass = constructor.name of the thrown Error (code-defined class name; non-Errors give NonErrorObject / Non-Error:<typeof>), not attacker-chosen in practice; correlationId and tenantId = caller-supplied free input (no production caller sets withTraceContext yet). Only those two can carry free input: LOW now, condition recorded in the contract (callers must pass generated ids).
2. Tenant id: the tracer contract allows it verbatim; ruling and condition in qa/contracts/t049-langfuse-trace-sink.md. FOR THE APPROVER: acceptable only because the backend is operator-hosted, same-trust.
3. Destination. 76-input table. Accepted bad URLs: none. Refused: userinfo, `@` anywhere, `?`/`#`, remote http, [::ffff:...], 0.0.0.0, localhost., localhost.evil, 127.0.0.1.evil, 127.0.0.2, odd schemes, port 99999. Accepted and canonicalised to the same loopback (correct): http://127.1, 2130706433, 0x7f000001, octal form (all become 127.0.0.1). Path prefixes normalised (.. and %2e%2e collapsed, trailing slash stripped); `//x` in a path stays a path, host unchanged; for every accepted URL the sink request URL equals canonical origin + path + /api/public/ingestion and has the same origin. https to a private or link-local IP is accepted by design (operator-configured; DNS rebinding and internal SSRF out of scope). Redirect 301/302/303/307/308 and opaqueredirect: exactly one fetch call, redirect:"manual", code "redirect".
4. Default unchanged. The pre-change registry (git show 2d1e738) was run against 11 env combinations with real file output: identical trace-file content and warnings for unset / false / true / SINK=langfuse without ENABLED / ENABLED=false + langfuse / SINK=file / langfuse vars without SINK, with zero fetches. Misconfigured langfuse (missing key, http://evil.example) falls back to the file sink with exactly one warning naming variable names only (no URL, no key). Ruling: acceptable and not silent (low: stderr line, not fatal; with no TELEMETRY_TRACE_FILE the existing "traces are discarded" warning follows).
5. Never hurts the call. record() returned undefined in under 50 ms for 5 hostile records + null + a throwing-getter record against throwing, null, string, string-status, throwing-body-cancel and never-resolving fetches. 100,000 records to a failing endpoint: pending max 1000, dropped 100000 (sent + dropped = 100000), heap delta 0.1 MiB. 4xx 400/401/403/404/413/429: 1 call (429 non-retry acceptable; note). 500/502/503 and network throws: 3 calls (2 retries). Timeout aborts the signal (mutation without abort killed). Hanging fetch: close bounded. After close, process._getActiveHandles unchanged. A close() during a backoff sleep waits up to flushTimeoutMs (5 s) by design. No unhandledRejection.
6. Assumed API. The manifest lists A1-A8 honestly and says no real instance was contacted; the mapping is isolated in payload.ts. PASS at the stated scope is justified: every safety property is independent of the wire format, and a wrong format fails closed (4xx, dropped, counted, warned once). Residual: 207 partial errors are counted as sent.
7. .env.example: NOT changed; TELEMETRY_SINK and LANGFUSE_* are undocumented (low). Add empty entries with truthful one-line descriptions at wiring time.
8. Gates: 58/58 existing + new trace tests pass unmodified; tsc --noEmit in packages/ai exit 0; lint-dirsize OK (118 dirs); no package.json or lockfile change; git merge-tree against codex/machine-migration-2026-10-09 is clean.
9. Mutations (own harness, per-mutation byte backup, restore in finally, git hash-object equals HEAD blob verified): 15 mutations, 0 survived the combined suites. Killed by assertion: label to any string, unknown key `input` passthrough, error message forwarded, key in URL query, userinfo accepted (maker payload table; my probe alone missed it), http to non-loopback, redirect follow, 4xx retried, queue cap removed, timeout abort removed, signal not passed, select without ENABLED, tenantId unvalidated, key in error code. Killed only by timeout: retry bound raised to 50 (backoff doubles, so the run hangs rather than failing an assertion).

## Observations (not backlog)
- close() is never called on process exit: up to 1000 buffered traces are lost on shutdown. LOW-MEDIUM, for the wiring unit: add a bounded exit/signal flush.
- correlationId becomes Langfuse sessionId: wiring must use generated run ids, not meeting ids or passcodes.
- Langfuse 207 per-event errors are invisible.

ISSUES-WRITTEN: none

## Merge conditions
Merge the three source commits plus this verdict and contract. Keep the sink DISABLED by default (it is). No shutdown flush or withTraceContext wiring without a separate unit.

## Operator checklist before relying on it (real self-hosted instance, non-production project)
1. Set TELEMETRY_ENABLED=true, TELEMETRY_SINK=langfuse, LANGFUSE_BASE_URL (https, or http on loopback), LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY.
2. Verify path /api/public/ingestion and Basic auth public:secret on your Langfuse version (curl a one-event batch).
3. Confirm event types trace-create / generation-create and body keys (usageDetails, costDetails, level, statusMessage) are accepted; inspect the response for 207 with errors, which this sink does not parse.
4. Make one traced call; confirm trace + generation with tokens and cost appear in the UI and nothing beyond the allow-list is shown.
5. Stop the backend and confirm calls are unaffected and one stderr warning appears.
6. Confirm the shutdown loss of unflushed traces is acceptable.
