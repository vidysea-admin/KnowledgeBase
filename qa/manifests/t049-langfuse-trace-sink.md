# t049-langfuse-trace-sink

Lane: T049SINK (branch lane/t049sink, base 2d1e738). Tier: 3 (roadmap task T-049). Severity: medium, but FULL ceremony: telemetry egress and credential handling (security class).
Round cap: the tracing seam has TWO PASSed verdicts (`qa/verdicts/t049-ai-call-tracer.md`, `qa/verdicts/t049-tracer-wiring.md`). The cap (2 PASSes) governs non-security FINDINGS filed as follow-up units. This unit is not a finding: it is the next roadmap slice of T-049 (the sink for the system the task names, which both prior manifests list as not delivered), and it handles credentials and data leaving the process, which is security class and never capped. Proceeding. No issues filed (`qa/issues.t049sink.jsonl` not created).

## Source lines
- TASKS.md:138 `| T-049 | open | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures | Vidysea standard rule 5 ...: self-hosted only, TELEMETRY_ENABLED=false, no enterprise key; approved by Umesh 2026-09-24 |`
- Backend CONFIRMED from the row: Langfuse, self-hosted only. Nothing in the repo documents Langfuse's HTTP API (grep: only these task/plan lines).

## Delivered (all new files under packages/ai/src/trace-langfuse/, so packages/ai/src gains 0 files)
- `payload.ts` (142 lines): PURE `toLangfuseBatch(records, genId)` and `validateBaseUrl(raw)`. The only place to correct the API shape.
- `sink.ts` (268): `createLangfuseSink({fetch, baseUrl, publicKey, secretKey, ...})` implementing `TraceSink` (+ `stats`, `flush`, `close`); `selectsLangfuse(env)`; `langfuseSinkFromEnv(env, {fetch, warn})`.
- `payload.test.ts` (125), `sink.test.ts` (278).
- Edits: `trace-registry.ts` (adds `resolveEnvSink`, `record` path now calls it), `index.ts` (one export line).
- No dependency, no SDK, no network call, no env read inside `createLangfuseSink`. `gemini-file-upload.ts` and other reserved files untouched.

## Selecting setting and default unchanged
Langfuse sink is chosen ONLY when ALL hold: `TELEMETRY_ENABLED=true`, `TELEMETRY_SINK=langfuse`, and `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` are non-empty and the URL passes validation. Otherwise the factory is not called (missing config or refused URL: one stderr warning naming variable NAMES only, then fall back to the existing file sink). `resolveEnvSink` with any env lacking `TELEMETRY_SINK=langfuse` is exactly `fileSinkFromEnv` as before. An explicitly `setTraceSink`-installed sink still wins, as before.
Proof: test "default selection unchanged" runs six envs (empty; enabled; enabled+trace file; disabled+langfuse vars; enabled+langfuse vars without TELEMETRY_SINK; `TELEMETRY_SINK=file`) through `resolveEnvSink` with counting factories: Langfuse factory called 0 times, file factory 6. Existing registry/router/trace/file-sink tests pass UNMODIFIED.

## What may leave the process
Body keys (allow-list asserted at every nesting level in the test): event `id,type,timestamp,body`; trace body `id,name,timestamp,sessionId,metadata{tenantId,operation,provider}`; generation body `id,traceId,name,startTime,endTime,level,model,statusMessage,usageDetails{input,output},costDetails{total},metadata{operation,jobKind,provider,outcome,errorClass,inputChars,outputChars,retries}`.
- String fields (jobKind, provider, model, errorClass, correlationId, tenantId) are re-validated: <= 64 chars of `[A-Za-z0-9._:-]`, no key-looking prefix (`sk-`, `pk-`, `AIza`, `ghp_`, `eyJ`, `Bearer`...), no 24+ char opaque run; else OMITTED. Numbers must be finite and non-negative; else omitted.
- `errorClass` (class name) is sent, never a message. `operation`/`outcome` are coerced to their enums.
- tenantId and correlationId: the tracer contract already carries them (caller-supplied, recorded by the file sink too), so they are forwarded (as `metadata.tenantId` and `sessionId`) ONLY if label-shaped. Limit: an opaque id that is label-shaped but secret (e.g. a short passcode used as an id) cannot be told apart from a legitimate id.
- NEVER sent: prompt/completion/transcript text, speaker names, file paths, emails, API keys, headers, error messages, any unlisted record property (tests plant such values in every field and as extra properties).
- Model names containing `/` (e.g. `models/x`) are dropped to avoid path leakage; the model field is then absent.

## Base URL rule
https anywhere; http ONLY for `localhost`, `127.0.0.1`, `[::1]` (self-hosted on this machine; a loopback hop never leaves it; remote http would put the keys on the wire in clear). Refused: userinfo, `?`, `#`, any `@`, non-URL, other schemes. Errors are generic and never echo the input. Requests go only to `<base>/api/public/ingestion`; `redirect: "manual"`; any 3xx/opaque redirect is a failure.

## ASSUMPTIONS about Langfuse's API (NOT evidenced in the repo; verify on a real self-hosted instance; correct only in payload.ts, plus the header line in sink.ts)
- A1 endpoint `POST {base}/api/public/ingestion`
- A2 auth `Authorization: Basic base64(publicKey:secretKey)`
- A3 body `{ "batch": [ { id, type, timestamp, body } ] }`
- A4 event types `trace-create`, `generation-create`
- A5 trace body keys (id, name, timestamp, sessionId, metadata)
- A6 generation body keys, in particular `usageDetails{input,output}` and `costDetails{total}` (older versions used `usage{input,output,unit}`), `level` values `DEFAULT`/`ERROR`, `statusMessage`
- A7 success = any 2xx (including 207 multi-status); per-event errors inside a 207 are NOT parsed, so a partial rejection would be counted as sent.
- A8 a base path prefix is allowed.

## Reliability bounds
Queue `maxPending` 1000 (drop NEWEST, counted, one `queue_full` code, same as file sink); batch <= 50; timeout 10 s (AbortController + injected timer, race so a fetch ignoring the signal cannot hang); retries <= 2 with backoff 500/1000 ms for network errors, timeouts and 5xx only (4xx and 3xx final); failed batch dropped and counted; `record()` never throws, returns undefined, never awaits; `flush()` and `close()` resolve within `flushTimeoutMs` (5 s) even with a hanging fetch; `close()` aborts in-flight, wakes backoff sleepers, clears all timers, drops and counts the rest, later `record()` is dropped. All errors surface as static codes (`http_503`, `timeout`, `network`, `redirect`, `queue_full`, `closed`), never messages.

## NOT done
- No real Langfuse instance contacted; every assumption above is unverified. "One traced call visible in the Langfuse UI" is NOT met.
- Sink is not installed anywhere by default; `langfuseSinkFromEnv` uses `globalThis.fetch` only when the explicit setting is present. No shutdown hook calls `close()` on process exit (queued records may be lost at exit).
- STT calls are still untraced (D-119 reserved, not a Provider); direct provider uses bypassing `route()` remain untraced; callers still do not set `withTraceContext`, so ids are null.
- No dashboard, no cost/price tables beyond what the record carries. T-049 stays open.

## Evidence (node v24.19.0, run in packages/ai, one process at a time)
- `node --test --import tsx src/trace.test.ts src/trace-registry.test.ts src/trace-file-sink.test.ts src/router.test.ts src/trace-langfuse/payload.test.ts src/trace-langfuse/sink.test.ts`: `tests 58 / pass 58 / fail 0` (run before the last test-only typing fix; sink.test.ts re-run after it: `tests 18 / pass 18 / fail 0`; payload.test.ts: 8 pass).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, `tsc-exit=0`.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (118 dir(s) within budget)`. `node scripts/lint-loc.mjs`: one violation, `packages/meeting-bot/py/sb_join.py:1142`, pre-existing and unrelated.
- Non-blank lines: payload.ts 142, sink.ts 268, trace-registry.ts 56, tests 125 / 278.
- 100,000 emits to a throwing fetch (test): pending <= 1000, dropped 99,000 immediately and 100,000 after flush, heap growth < 32 MiB asserted.
- Not run: full suite, build, apps/api tsc.

## Mutations (lane-unique untracked harness, per-mutation byte backup, restore in finally, `--test-timeout`, then `git hash-object` == `git rev-parse HEAD:<file>` verified for each; harness deleted)
All 14 killed, all files restored to HEAD hash:
1 forbidden field forwarded: hostile-substring test. 2 message instead of code: credentials test. 3 key in URL: Basic-auth/URL test. 4 remote http accepted: validateBaseUrl table + construction + env tests. 5 redirect followed: Basic-auth test + redirect test. 5b 3xx not a failure: redirect test. 6 4xx retried: 4xx test. 7 queue cap removed: 100,000-emit test. 8 emit throws after a fetch failure (guard removed): "record() after earlier delivery failures". 9 sink selected without the setting: default-selection test. 10 retries +5: 5xx retry-count test. 11 tenantId unvalidated: hostile test. 12 flush unbounded: hanging-fetch test. 13 close leaves timers: backoff-sleep close test (first run survived; test added in the same unit, then killed). Mutation 5 initially "survived" because the pattern matched a doc comment; corrected pattern killed.

Status: checked-PASS (Checked: qa/verdicts/t049-langfuse-trace-sink.md, cycle 0, 0fd0b4d; safety verified against a fake; wire format UNVERIFIED; off by default)
Fix cycle: 0
