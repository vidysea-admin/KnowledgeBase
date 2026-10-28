# Verdict: t049-langfuse-ingestion-partial-errors

VERDICT: PASS
Cycle checked: 0
Commit checked: d017aa3 (lane/langfuse207)
ISSUES-WRITTEN: none (maker's ISS-LANGFUSE207-001/-002 are low and stay open)

## EXPLANATION

- Re-run: ingestion-partial 18/18; with sink.test, payload.test and trace.test 55/55; `tsc --noEmit` in packages/ai exit 0. Test imports are node built-ins plus local modules only (fake fetch, no network).
- Never throws into the AI path: probed with a fake fetch for 16 scenarios (text() rejecting, text() throwing synchronously, no text(), null response, fetch throwing, onError callback throwing, 50,000-entry error list over the 1 MiB cap, `__proto__`/`constructor` ids, non-JSON 200, empty 207). `record()`/`flush()`/`close()` never threw; `drain` wraps `sendBatch`, `report` wraps `onError`, `assessIngestion`/`readBodyText` are total.
- No payload text logged: with a record carrying "SECRET PROMPT TEXT" and an error body echoing it in `message`/`error`, the only strings reaching `onError` were `event_rejected`, `event_http_<3-digit status>`, `event_unconfirmed`, `malformed_207`, `network`, `http_unknown`. `message`/`error` are never read.
- Drop counts: partial error 3 records, 1 rejected gives sent 2 / rejected 1 / dropped 1 / failures 1 / eventErrors 1. Multi-event record counts once however many of its events failed. A constant `genId` (duplicate ids across records) rejects every record sharing that id: conservative, over-drops rather than under-counts. Error entries without ids are counted in `eventErrors`, flag the batch failed, but cannot attribute a record; if all our events appear in `successes` the records stay sent, otherwise they become `unconfirmed`. An id present in both lists is treated as rejected. A 207 with empty lists is all unconfirmed, never success.
- Payload shape: `{batch:[{id,timestamp,type,body}]}` with `trace-create`/`generation-create`, and the response read as `{successes:[{id,status}], errors:[{id,status,message,error}]}`, match Langfuse's documented ingestion API as I know it (no pinned schema or live server in the repo; the manifest says so).
- Low notes: records the mapper skips are still counted `sent` (unchanged from before this unit); a non-207 2xx with an unreadable body is trusted on status.
- Mutations (6, hash-verified, byte backup in `finally`): some->every on rejected KILLED (4); every->some on unconfirmed KILLED (1); strict also on 200 KILLED (3); dropped excludes unconfirmed KILLED (1); entry cap removed KILLED (1); status codes not reported KILLED (2). Both files equal HEAD blobs; worktree clean.
