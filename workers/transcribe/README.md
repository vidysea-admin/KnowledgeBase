# Queued recording submission

The Python process executes restricted Gemini File API operations from Mongo `jobs`.
The Node producer injects that queue transport into the unchanged production upload,
polling and diarization functions, then into the existing recording adapter. No HTTP
worker or API/UI changes are involved. The production STT default and parser remain authoritative.

Install `requirements.txt` into the project `.venv`. Existing Node workspace dependencies
provide MongoDB, dotenv and tsx. Configure these trusted operator environment values:

- `MONGODB_URL`, `UPLOAD_QUEUE_DB=upload_queue_<unique-name>`: a dedicated queue database;
  existing shared/work knowledge databases are refused by the queue name boundary.
- `UPLOAD_TENANT_ID`, `UPLOAD_ACTOR`: identity from operator configuration, never file metadata.
- `UPLOAD_INPUT_ROOT`, `UPLOAD_SPOOL_ROOT`, `UPLOAD_OUTPUT_ROOT`: existing owned directories;
  linked/reparse paths and foreign tenant blob references are refused.
- `GEMINI_API_KEY`: worker-only provider credential (environment or root `.env`). It never
  appears in queued requests, command arguments, persisted provider errors or upload handoffs.
- Optional `GEMINI_STT_MODEL` preserves the existing production model override; otherwise
  the production STT default applies. Optional `UPLOAD_PYTHON` and `UPLOAD_FFPROBE` select
  trusted binaries. Windows defaults are project `.venv` and cached FFmpeg 9.0.2.
- Optional `UPLOAD_TIMEOUT_MS` (20–1800000) bounds each queued operation; `UPLOAD_RUN_NONCE`
  explicitly starts a fresh operator-authorized attempt after an exhausted prior operation.
  `UPLOAD_MAX_ATTEMPTS=1` disables lease-recovery retries when a single paid attempt is authorized;
  otherwise the bounded maximum is two.

Start the worker in a separate hidden process/terminal:

```text
.venv/Scripts/python.exe workers/transcribe/src/worker.py
node scripts/upload/submit.mjs relative-recording.m4a safe-session-id
```

The producer waits for actual Python processing, validates shared schemas, uses the existing
timing validator and `loadWebinarSession`, and publishes one complete session directory under
`UPLOAD_OUTPUT_ROOT/<tenant-sha256>/<session-id>/`. The `turns.json` output retains immutable
turn identities and raw content. A different existing transcript is refused. No knowledge
database/index write occurs. Queue failures remain visible in scoped RPC/pipeline job rows.

Claims have a 30-second heartbeat lease and at most two attempts. Expired owners are fenced;
interrupted work is recoverable, and deadline/exhaustion is terminal. Provider execution is
at least once across interruption: a request already accepted by Google may be repeated.
Resumable upload capabilities stay in worker memory; restart recovery reopens only the
same tenant/run's prior upload-start operation. Google redirects are refused. HTTP responses
are bounded to 2 MiB and network waits to 30 minutes. Producer cancellation marks pending
work failed, preventing late publication. Shutdown stops heartbeat; an in-flight operation
may wait for its network timeout, after which its expired lease cannot publish.

`--once` exits 0 when idle or after a processed HTTP response, 1 on an operation failure,
and 2 on missing prerequisites/queue failure. HTTP error responses are valid transport
results but fail the unchanged STT pipeline; no transcript is published.

Focused checks (local Mongo must be running; child-process approval may be required):

```text
node --test scripts/upload/queue.test.mjs
.venv/Scripts/python.exe workers/transcribe/src/test_worker.py
.venv/Scripts/python.exe contracts/verify_contracts.py
```

These lifecycle checks use UUID-isolated temporary databases and explicitly labelled fixture
transcripts; they make no provider calls. Full U4.1 acceptance remains HOLD until a real upload
passes the short-audio parser boundary: the recorded 12.650958-second example currently parses
its final turn as 0–30 seconds and is rejected by the existing validator. Approval of that
separate parser correction is required; neither this worker nor its tests changes the parser.
