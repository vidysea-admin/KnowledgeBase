# t049-langfuse-ingestion-partial-errors

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (next roadmap task, T-049 "Langfuse tracing"; follow-up to the sink manifest's NOT-done line on 207 per-event errors). Class: telemetry export, no auth/tenancy/data-write path; payload-leak surface re-checked. Verdict by the checker only.
Lane: lane/langfuse207. Lane ledger `qa/issues.langfuse207.jsonl`: ISS-LANGFUSE207-001 (low), -002 (low).

## Scope
Only `packages/ai/src/trace-langfuse/`: `ingestion-response.ts` (new: pure parser `parseIngestionResponse`, `assessIngestion`, bounded `readBodyText`), `sink.ts` (edited: reads the 2xx body, applies the assessment, 3 new stats), `payload.ts` (A7 comment only), `ingestion-partial.test.ts` (new, 18 tests). Sink stays off by default; no wiring change.

## Behaviour per response (policy: nothing new invented)
- 4xx / 3xx / 5xx whole batch: unchanged (4xx, 3xx final; 5xx retried <= 2; dropped and counted; body never read).
- 200/207 with every event in `successes` and `errors: []`: all records `sent`.
- 207 partial: a record whose event id is in `errors` is `rejected` and DROPPED, counted, NOT retried (the existing policy has no partial-failure rule and a resend would repeat events that succeeded; whether Langfuse de-duplicates by event id is unevidenced: ISS-LANGFUSE207-002). The others stay `sent`. `failures += 1` (a 207 with errors is never total success).
- 207 all fail: `sent 0`, every record rejected and dropped.
- 207 whose body is unusable (not JSON, empty, wrong shape, text() rejects/not a string/hangs to timeout, > 1 MiB, or no text() on the response), or that omits an event from both lists: `unconfirmed`, dropped, not sent, not retried (code `malformed_207` / `event_unconfirmed`).
- Non-207 2xx with no readable body: trusted on status, as before. A non-207 2xx whose body lists errors is honoured the same way.
- Errors whose ids match nothing we sent are counted in `eventErrors` and flag the batch failed.
- Logging: only static codes through the existing `onError` path (`event_rejected`, `event_http_<status>`, `event_unconfirmed`, `malformed_207`). The response `message`/`error` fields are never read; event ids, keys and payload text never leave (tests assert codes match `^[a-z0-9_]+$` and contain none of the planted message/prompt text).
- `record()` still never throws; the body read races the request timeout/abort, so a body that never arrives is bounded and `close()` leaves no timer.
- New stats: `eventErrors` (events rejected), `rejected` (records), `unconfirmed` (records). `dropped` includes both rejected and unconfirmed.

## Payload shape vs the API
The repo pins NO Langfuse schema or fixture. Test "emitted events conform to the documented ... shapes" checks the emitted `trace-create` and `generation-create` against a key/shape table written from Langfuse's public ingestion API docs (from documentation, not a live server): `{id,timestamp,type,body}`, ISO timestamps, `level` in DEBUG|DEFAULT|WARNING|ERROR, `usageDetails`/`costDetails` number maps, only documented body keys, `traceId` linkage, distinct ids. The sink does not emit `span-create`; a documented-shape response naming a span-create event id is parsed as a fixture. Result: no divergence found; the A1-A8 assumptions in payload.ts remain UNVERIFIED against a real instance.

## Evidence (node v24.19.0, packages/ai, one process at a time, timeouts, no network)
- `node --test --import tsx src/trace-langfuse/ingestion-partial.test.ts`: `tests 18 / pass 18 / fail 0`.
- With the six existing trace test files (`trace`, `trace-registry`, `trace-file-sink`, `router`, `payload`, `sink`): `tests 76 / pass 76 / fail 0`.
- `tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `scripts/lint-loc.mjs`: sink.ts first came to 339 lines (over 300), fixed by moving logic into ingestion-response.ts; now none from this unit (remaining: `packages/ingest/src/sources/youtube.ts:317`, `packages/meeting-bot/py/sb_join.py:1142`, not this unit). `lint-dirsize` violations listed are other directories.

## Mutations (8; untracked harness `.langfuse207-mut.mjs`, deleted; per-mutation byte backup restored in `finally`, hash verified `restored true` each; `--test-timeout=20000`)
All 8 KILLED: 207 treated as lenient (4 fail); rejected check removed (6); sent ignores failures (7); malformed 207 trusted (3); body read not bounded (timed out, killed); unconfirmed check removed (1); failure not counted (6); codes not reported (4).

## NOT covered
- No real Langfuse instance contacted; wire format and the 207 body shape are from documentation only. Deploying Langfuse is infra for the owner.
- Per-event 5xx are not retried (ISS-LANGFUSE207-002); the 1 MiB cap applies after `text()` buffers the body (ISS-LANGFUSE207-001).
- T-049 stays open: "one traced call visible in the Langfuse UI" unmet; no shutdown hook calls `close()`; STT and direct-provider calls untraced; callers do not set `withTraceContext`.
