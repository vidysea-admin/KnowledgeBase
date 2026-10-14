# T-049 Langfuse LIVE check, 2026-10-13 (D-146)

Host: https://cloud.langfuse.com (project "My Project"). Keys from .env, never printed. No model spend (stub provider with synthetic usage 123/45 tokens, costUsd 0.000321; USD 0 real). No Mongo touched. Not pushed.

## Method
Harness (scratchpad, not committed) used the repo's own code unchanged: `traceProvider` + `withTraceContext` (packages/ai/src/trace.ts) -> `langfuseSinkFromEnv` (packages/ai/src/trace-langfuse/sink.ts, env TELEMETRY_ENABLED=true TELEMETRY_SINK=langfuse) -> real `fetch`.
Command: `node --import tsx live.mts` in packages/ai (node v24.19.0).
- Run A: one `complete` call, correlationId `t049live-a-20261013`, tenantId `t049live-synthetic` (generated slug, no real data).
- Run B: same, but the fetch wrapper appended one invalid event (`type: bogus-create`, id `t049live-bad-event-1`) to exercise real per-event errors.
Read-back: `GET /api/public/v2/observations?fromStartTime=...` (Basic auth).

## Results
Trace ids: A `7a710078-6df6-47f2-948a-5ce5ed0291a2`, B `408b9edb-2237-4e95-bc36-586c9c3a3126`.
- Run A: HTTP 207, `successes` 2x201, `errors: []`. Sink stats sent 1, failures 0, dropped 0.
- Run B: HTTP 207, successes 2x201, errors `[{id:t049live-bad-event-1,status:400,"Invalid request data"}]`. Sink stats sent 1, failures 1, eventErrors 1, rejected 0, unconfirmed 0; codes reported: `event_rejected`, `event_http_400`. Our two valid events were kept as sent, unknown-id error counted and flagged the batch failed, as designed.
- API read-back (arrived about 5 min after send; first polls empty): per trace one root SPAN `t049-live-check` and one GENERATION `complete:t049-live-check`, parent link correct, `traceId` equal, `sessionId` = correlationId, metadata `tenantId=t049live-synthetic, provider=stub, operation=complete, jobKind, outcome=ok, inputChars=4, outputChars=2`, model `gemini-3.8-flash` (recognised by Langfuse, priced), `usageDetails {input:123, output:45, total:168}`, `costDetails.total` 0.000321, totalCost 0.000321. No prompt/completion text present anywhere.

## Contract criteria (qa/contracts/t049-langfuse-trace-sink.md)
1. Selection by env only, fallback otherwise: PASS (sink constructed only with the three env vars + flags; the unit tests cover fallbacks; not re-run live).
2. Egress allow-list: PASS (only ids, labels, counts, cost, model; no content observed in read-back).
3. Tenant id only to operator-configured self-hosted backend: FAIL / DEVIATION. cloud.langfuse.com is a hosted third-party service; the ruling and the T-049 standard (self-hosted only) forbid it. Only a synthetic slug was sent, but a real deployment must point at self-hosted Langfuse. The sink does not enforce this (validateBaseUrl accepts any https host).
4. Destination/auth: PASS for https URL + `/api/public/ingestion` + Basic auth accepted (207). Redirect refusal not exercised live.
5. Never hurts the call: PASS (both runs completed, flush/close returned, process exited, no unhandled rejection).
6. Wire format (previously ASSUMED): PASS, now VERIFIED for path, auth, body `{batch:[{id,type,timestamp,body}]}`, `trace-create`/`generation-create`, `usageDetails`, `costDetails`, and the 207 `{successes,errors}` shape including per-event `{id,status,message,error}`.

## Findings
- F1: Langfuse Cloud returns 207 even when every event succeeds (errors empty). The 207 parser is therefore exercised on every send; it handled it correctly.
- F2: Cloud responses carry `_deprecation`: the v3 ingestion API is shut down 2026-11-16 (only score events accepted after). Replacement is OTLP `POST /api/public/otel/v1/traces`. The sink needs migration (new task) if Cloud, or the self-hosted version, drops it.
- F3: Reads are delayed minutes; legacy `GET /api/public/traces/{id}` returned 429 here; use v2 observations.
- F4: trace-create appears as a SPAN observation (`t-<traceId>`), with endTime null; cosmetic.
- Not exercised: retries on 5xx, STT/direct provider calls, withTraceContext in real callers, shutdown hook.
