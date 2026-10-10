# t049-tracer-wiring

Lane: T049WIRE (branch lane/t049wire, base 6c5d800). Tier: 3 (roadmap task T-049). Severity: medium; no auth/tenancy/data write.
Round cap: `qa/verdicts/` holds ONE PASSed verdict naming the AI tracing seam (`t049-ai-call-tracer.md`). Cap is 2; reached 1, so this unit may proceed. No issues filed (`qa/issues.t049wire.jsonl` not created; nothing to file).

## Source lines
- TASKS.md:138 `| T-049 | open | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures | Vidysea standard rule 5 ... self-hosted only, TELEMETRY_ENABLED=false, no enterprise key; approved by Umesh 2026-09-24 |`
- docs/plan.md:43 `| 16 | t049-langfuse-tracing | TASKS.md T-049 (approved 2026-09-24, no deps) | packages/ai provider-call instrumentation (transcribe/extract/ask) | no | one traced call visible in the self-hosted Langfuse UI; TELEMETRY_ENABLED=false confirmed | medium | skip | ...`
T-049 stays in progress; this unit does not close it.

## Wiring point
Providers are plain classes constructed by the caller (apps/api/src/composition/production.ts:130-138, scripts/gen-golden-set.mjs:174), then registered in `RoutingConfig.providers`. packages/ai has no factory; the one place it hands providers out is `route()`, which `complete()` and `embed()` both call.
- packages/ai/src/router.ts:44 `return withTracing(provider);` (inside `route()`).
- `withTracing` (packages/ai/src/trace-registry.ts) returns the SAME provider object when `TELEMETRY_ENABLED` is not "true" (identity asserted in trace-registry.test.ts), else `traceProvider(...)` with a registry-backed sink.
- Registry: `setTraceSink(sink|null)` / `getTraceSink()` (default `noopSink`), exported from packages/ai. The wrapper looks the sink up at record time, so a sink installed after wrapping still receives traces. If tracing is ON and no sink was installed, a sink is built once from env: `fileSinkFromEnv()`.

## trace.ts fixes (both low notes from the verdict, both small)
1. Unknown methods: wrapper is now a `Proxy`; non-traced members are fetched with the ORIGINAL provider as receiver and bound to it, so `#private` fields work. Test: "unknown methods run with this bound to the ORIGINAL provider".
2. Usage normalisation: `inputTokens`, `outputTokens`, `costUsd`, `outputChars` go through a finite-number check; missing usage (`{}`/undefined) or NaN/Infinity becomes null. Test: "missing or non-finite usage/cost numbers are recorded as null".

## File sink (packages/ai/src/trace-file-sink.ts)
Config: `fileSink({path, maxBytes?, warn?})`, or env `TELEMETRY_TRACE_FILE` (path) and optional `TELEMETRY_TRACE_MAX_BYTES` via `fileSinkFromEnv`. Tracing enabled with no path: no-op sink plus ONE stderr line.
Record format: one `JSON.stringify(TraceRecord)` per line, `\n`-terminated, UTF-8. Fields: operation, jobKind, provider, model, startedAtMs, latencyMs, inputChars, outputChars, inputTokens, outputTokens, costUsd, retries, outcome, errorClass, correlationId, tenantId. Never prompt/completion text, error messages, headers or keys (the sink only receives the tracer's record).
Guarantees:
- `record()` never throws or rejects; a throwing `warn` is also swallowed.
- Append-only, exactly one `appendFile` per record, run through a promise queue so lines never interleave.
- Parent directory created on first write (mode 0o700); file created mode 0o600 (honoured on POSIX, ignored on Windows, NOT verified here on POSIX).
- Write failure: `stats.failures` and `stats.dropped` incremented, warned once (error code only).
- Size guard: default 50 MiB, counting bytes already in the file at first write; on crossing it the sink stops, counts drops in `stats.dropped`, sets `stats.stoppedBySize`, warns once. Not rotation: after the cap, traces are lost until the file is removed.
- `flush()` resolves when queued records have been attempted.

## Correlation and tenant (not threaded in this unit)
Today a caller sets them with `withTraceContext({correlationId, tenantId}, () => ...)` from packages/ai/src/trace.ts (AsyncLocalStorage, inherited by async work inside). Nothing calls it, so every record has `correlationId: null, tenantId: null`. Call sites where a later unit should wrap:
- apps/api/src/composition/production.ts:161 (`complete`), :167 (`embed`), :220 (`dispatch`, has `tenantId` in scope), :221, :229 (`embed`), :233 (`complete` "ask"), :237 ("evaluator").
- scripts/gen-golden-set.mjs:193 (`provider.complete`, constructed directly at :174, bypasses `route()`).
- scripts/lib/toc/toc-embedding-backfill.mjs:194 (`embed`) and :233 (`provider.embed`).

## Not delivered
- No Langfuse sink: the roadmap check "one traced call visible in the Langfuse UI" is NOT met. T-049 stays in progress.
- No per-tenant attribution yet: records carry null ids until a caller adds `withTraceContext`.
- Speech-to-text calls are not covered (packages/ai/src/stt/ is reserved by D-119, and STT is not a `Provider`).
- Providers used WITHOUT `route()` are not traced: scripts/gen-golden-set.mjs:174/193 and toc-embedding-backfill.mjs:233 call a provider directly. Tracing them needs a one-line `withTracing(...)` at those sites (outside this unit's allowed paths).
- apps/api not type-checked: no type it imports from packages/ai changed shape (only added exports).

## Evidence
Env: node v24.19.0 (codex runtime), junctions to the main tree's node_modules (root, packages/ai, core, db, ask, index, ingest, meeting-bot, apps/api).
- `node scripts/lint-dirsize.mjs` before and after: `lint-dirsize: OK (111 dir(s) within budget)`.
- `cd packages/ai; node --test --import tsx src/trace.test.ts src/trace-registry.test.ts src/trace-file-sink.test.ts src/provider.test.ts src/providers.test.ts src/router.test.ts src/jobs.test.ts src/routing-config.test.ts`: `tests 60 / pass 60 / fail 0`.
- `cd packages/ai; node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: no output, exit 0.
- Non-blank line counts: trace.ts 176, trace-registry.ts 36, trace-file-sink.ts 109, router.ts 129; tests: trace.test.ts 164, trace-registry.test.ts 66, trace-file-sink.test.ts 116.
- Not run: full suite, monorepo build, apps/api tsc (CPU shared with production worker).

Status: ready-for-check
Fix cycle: 0
