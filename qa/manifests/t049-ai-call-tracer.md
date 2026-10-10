# t049-ai-call-tracer

Lane: T049 (branch lane/t049, base 8c8429d). Tier: 3 (roadmap task, T-049). Severity: medium; no auth/tenancy/data write.
Round cap: no PASSed verdict in qa/verdicts/ concerns an AI tracing/telemetry seam (grep for langfuse/call-tracer/telemetry: none; "tracing" hits are unrelated incidental words). Cap not reached.

## Source lines
- TASKS.md:138 `| T-049 | open | Langfuse self-hosted tracing on every Gemini call (transcribe, extract, ask): latency, tokens, cost, retries, failures | Vidysea standard rule 5 ... self-hosted only, TELEMETRY_ENABLED=false, no enterprise key; approved by Umesh 2026-09-24 |`
- docs/plan.md:43 `| 16 | t049-langfuse-tracing | TASKS.md T-049 (approved 2026-09-24, no deps) | packages/ai provider-call instrumentation ... | one traced call visible in the self-hosted Langfuse UI; TELEMETRY_ENABLED=false confirmed |`
  (plan says "no deps"; this unit adds none.)

## Delivered
- packages/ai/src/trace.ts (184 lines), packages/ai/src/trace.test.ts (144), one export line in packages/ai/src/index.ts.
- `traceProvider(provider, {sink, env?, model?, now?, stats?})`: wrapper via Object.create(provider); overrides `complete` and (only if present) `embed`; `listModels`/`name` pass through. The Provider interface does not stream, so there is no streaming path.
- Sinks: `TraceSink` interface, `memorySink()`, `noopSink`. Sink is never awaited; sync throw or async rejection is swallowed and counted in `stats.sinkFailures`. No retries added; the original error object is rethrown (identity asserted).
- Context: `withTraceContext({correlationId, tenantId?}, fn)` (AsyncLocalStorage). Tenant is recorded only if supplied; never inferred. Outside a context both are null.
- Enable flag: `isTelemetryEnabled(env = process.env)` is true only when `TELEMETRY_ENABLED` is "true" (case-insensitive, trimmed). Default OFF (unset = off): TASKS.md:138 / rule 5 say TELEMETRY_ENABLED=false, and tracing is opt-in so nothing is recorded or leaves the process unless explicitly enabled. packages/ai has no existing env reads (config is injected), so env is an injectable parameter defaulting to process.env. Disabled returns the original provider object.

## Trace record schema (TraceRecord)
operation ("complete"|"embed"), jobKind, provider, model (result.model, else opts.model, else null), startedAtMs, latencyMs, inputChars, outputChars (null for embed/error), inputTokens, outputTokens, costUsd (null on error/embed), retries (only if error carries numeric `retryCount`; the seam exposes none, else null), outcome ("ok"|"error"), errorClass (constructor name, never message), correlationId|null, tenantId|null.
Never recorded: prompt/completion/embed text, error messages, headers, keys.

## Not delivered
- No Langfuse sink (a later unit implements `TraceSink` against this interface; no SDK/dependency/network here).
- Not wired into any call site (router, transcribe, extract, ask); nothing calls `traceProvider` yet, and no `withTraceContext` caller exists.
- Retries are not observable at the Provider seam; the field is best-effort.
- Roadmap check "one traced call visible in Langfuse UI" not met (needs the sink unit).
- packages/ai/src/stt/ untouched (STT calls are not a Provider and are not covered).

## Evidence
Env: node v24.19.0 (codex runtime), lane junctions node_modules and packages/ai/node_modules to main tree.
- `node scripts/lint-dirsize.mjs` before and after: `lint-dirsize: OK (109 dir(s) within budget)`
- `cd packages/ai; timeout 120 node --test --import tsx src/trace.test.ts`: `tests 9 / pass 9 / fail 0` (pass-through result+listModels+embed; same error identity; sync throw identity; malformed job; latency/tokens/cost/sizes; sentinel privacy over prompt, response, embed text and error message; disabled guard same object; throwing/rejecting/never-settling sink with sinkFailures==2; concurrent correlation/tenant ids).
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ai): no output, exit 0.
- Not run: full suite, monorepo build (CPU shared with production worker).

Status: checked-PASS
Checked: qa/verdicts/t049-ai-call-tracer.md (cycle 0, fe1f4f3)
Fix cycle: 0
