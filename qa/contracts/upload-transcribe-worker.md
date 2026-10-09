# Contract — upload-transcribe-worker (U4.1)

Checker-owned acceptance, initialized 2026-10-09 for approved `docs/plan.md` row 14.
Scope: a real file submission producer, durable tenant-scoped jobs, isolated Python provider
worker, queue-backed STT transport, existing recording adapter and immediate `turns.json`
consumer. This is a new implementation seam, not a frozen architecture amendment. Existing
contracts and protected boundaries retain their authority.

## Acceptance

- [C1] A documented runnable producer accepts a real audio/video file from its configured
  input root and submits actual work. It injects a queue-backed transport into the existing
  `uploadFile` / `pollFileState` / `transcribeUploadedAudio` flow and recording adapter STT
  interface; it does not return a canned transcript or stop at enqueueing. The Python worker
  performs the actual configured provider upload, polling and transcription requests through
  the jobs queue. No worker HTTP server, UI, or generalized distributed system is required.
- [C2] Worker and producer validate the shared `schema/jobs.schema.json`; extensions preserve
  its required fields and `pending` / `processing` / `done` / `failed` status vocabulary.
  Worker application logic stays in `workers/transcribe` as Python, importing no TS packages;
  communication with the producer is through the job contract. The existing STT interface,
  provider defaults, prompt and parser are preserved unless separately authorized.
- [C3] Producer identity derives from trusted operator configuration (or authenticated session
  when applicable), never submitted file metadata or client-supplied tenant identity. Every
  queue insert, claim, read, update, cancellation and result fetch is scoped to that identity.
  A foreign tenant's job ID, input reference, output reference or response cannot cause a read,
  provider upload, overwrite or deletion. Source/session/turn identity remains tenant-correct.
- [C4] Upload bytes are staged under the configured tenant-owned spool as filesystem references,
  not embedded as potentially oversized Mongo documents. References bind the expected content
  hash and file; worker verifies both before transmission. Producer and worker enforce real
  containment of input, staging and publication destinations, rejecting traversal, absolute
  path substitution and escaping symlinks/reparse points, including relevant parent components.
  Validation cannot be defeated by substituting a path between validation and use.
- [C5] Provider credentials come only from worker environment/configuration. Queue rows, staged
  metadata, command arguments, logs and persisted errors contain no API key, authorization
  header or secret query parameter. Worker permits only the supported upload-start,
  upload-finalize, poll and generate operations and their configured provider host/path/header
  combinations. Queued arbitrary URLs, redirects to other hosts, unexpected methods and
  attacker-chosen authorization headers cannot become outbound requests. Resumable upload
  handoffs are validated against the same provider boundary.
- [C6] Claiming is atomic: two local claimers cannot own the same pending operation. Processing
  records carry an ownership token and bounded lease; heartbeat/recovery allows interrupted
  work to become retryable. Only the current owner may publish a result or terminal transition.
  An expired or replaced owner cannot overwrite a newer response. Demonstrate claim contention,
  stale-owner refusal and recovery after worker interruption; no broad cluster feature is required.
- [C7] Stable operation IDs and conditional publication make producer retries and worker restarts
  idempotent: one logical operation cannot publish duplicate successful results or duplicate
  sessions/turns. Attempts, polling and network/process time are bounded. Exhaustion becomes an
  observable failed job/gap with an actionable sanitized reason. Empty, malformed, oversized or
  invalid provider results cannot become successful transcripts or overwrite valid prior output.
- [C8] Producer cancellation/timeout terminates or marks outstanding work so a late worker cannot
  publish a success into a cancelled request. Cancellation is represented compatibly with the
  existing status schema, with an explicit reason. Worker shutdown releases recoverable ownership
  or allows its bounded lease to expire; once-mode/continuous-mode exit semantics and missing
  prerequisites are documented and tested. Response size and error persistence are bounded.
- [C9] The actual recording adapter consumes the queue-backed STT result through its existing
  `Transcribe(audio, opts) -> Turn[]` seam. Existing timing validation and the immediate existing
  consumer consume the resulting transcript before successful publication is reported. Published
  `turns.json` is schema-valid, complete and atomic; stable natural identities and raw speaker,
  text, timestamps and provenance survive. Invalid timing, empty output or downstream failure
  leaves a visible failure and preserves previously valid output, rather than marking success.
- [C10] Full U4.1 PASS requires a real provider run from actual file submission through Python
  queue processing, recording-adapter consumption, existing timing validation and `turns.json`
  consumption. Capture exact commands, output, artifact paths, media duration, final turn bounds,
  provider/model and available real usage. Include a short real sample whose duration is below
  the parser's 30-second fallback; fixtures and injected provider responses prove behavior only.
  The already observed production case (12.650958-second audio / approximately 15-second AV,
  172-byte transcript, parsed final interval 0–30 rejected downstream) must remain explicit.
  An unresolved parser boundary failure or pending approval for its correction prevents full
  PASS; replacing its output by hand or weakening timing validation is not acceptance evidence.

## Evidence and scope limits

The maker packet identifies the exact producer, worker, queue and downstream call sites and
final-file hashes. Focused verification covers the real subprocess/queue boundary, the affected
stage on sample data, downstream consumption and the security/lifecycle criteria above; relevant
schema/generated-type and frozen-contract checks remain required when applicable. Unrelated WIP,
repo-wide suites and global release guards are not newly imposed as this module's acceptance.
Any issue claimed fixed is measured against its recorded ledger reproductions under D-015.

Lifecycle tests and a mock provider run can be reported as verified subsets, not a completed U4.1
upload-to-transcript implementation. Module evidence does not close the separate live Meet/C10
proof or the portable webinar release's real webinar, Windows/Ubuntu and sustained-capture gates.
No production database writes, protected-path changes, old-contract edits or parser changes are
authorized by this contract. A fresh checker determines the matching unit verdict after the
maker's manifest reaches `ready-for-check`; this preparation writes no verdict.
