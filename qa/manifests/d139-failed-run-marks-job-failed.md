# d139-failed-run-marks-job-failed

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (owner decision D-139, T-050 runner adapter "open design call" in qa/manifests/t050-runner-adapter.md). Class: data write (queue job state): FULL ceremony. Verdict by the checker only.
Lane: lane/failedjob (base 6be0570c). No ledger issue; no new issue filed.

## What changed
- `pipeline-runner.ts` `step`: `failed-terminal` now calls `queue.fail(ref, code, { terminal: true })` (job -> "dead" = FAILED) instead of `complete` (was "done"). Error code = the stage code if it is a valid queue id, else `run-failed`.
- Resubmit = new attempt: job and run id are `hash(tenant, runKey[, generation])`; generation 0 keeps the old ids. `submit` walks generations: a generation whose run state plans `failed-terminal` is dead, so the next generation is created (payload carries `generation` only when > 0). In-flight (incl. retryable failure) and succeeded runs resolve to the current generation = idempotent. `RunnerLease.generation?` / `Submitted.generation` added; `claim` re-derives the id from the payload generation (tampered value -> bad-payload).
- `job-queue` (justified, minimal): `fail(ref, code, opts?: { terminal?: boolean })`. The terminal state "dead" already existed (retention/pruning of dead jobs per D-128 unchanged: `terminalAt` logic untouched). Without it fail() requeues while queue attempts remain, so a failed run would show as "ready" and be re-claimed. Optional parameter: all other callers behave identically.

## Read-only finding (apps/api, not changed)
/system-status and notifications (`apps/api/src/activity-health/queue-reader.ts`, `notifications.ts`) read the MONGO upload queue (`jobs` collection, kind `transcribe.rpc`, status pending/processing/done/failed). They do NOT read the core file job-queue. So a pipeline-runner FAILED job would NOT appear there today; surfacing it needs a reader over the file queue (separate lane / approval).

## Graph consistency
No LangGraph node exists yet in the repo (grep: runner only used by its test). Path covered at runner level: node failure -> `fail` (stage-failed) -> planner `failed-terminal` (non-retryable and retry-exhausted) -> `step` -> job "dead". Test "graph consistency".

## Evidence
```
core pipeline-runner.test.ts   ℹ tests 27 ℹ pass 27 ℹ fail 0   (18 existing, 1 updated to expect dead, 9 new D-139 tests)
core job-queue/*.test.ts       ℹ tests 95 ℹ pass 95 ℹ fail 0
tsc --noEmit -p packages/core  clean
multi-process (lost-update, pid-reuse, stalled-holder) + runner tests x15: 15/15 green
mutations (6, per-mutation byte backup, restored in finally, git hash-object verified): 6/6 killed
  terminal flag ignored 6 failing; failed-terminal -> complete 6; no generation advance 2; lease ignores generation 2; claim skips id check 2; advance on any state 5
```
Tests: terminal failure -> dead (even with attempts left; step then queue:terminal; never reclaimed); non-queue-safe code -> run-failed; resubmit -> generation 1/2, dead state untouched, new run completes stages; in-flight / retryable / succeeded resubmit idempotent; tenant scoping (B's failure leaves A; separate generations; forged/negative/fractional generation fenced); tampered payload generation -> bad-payload.

## Not delivered
apps/api reader for the file queue (above). A queue job that went dead by lease expiry while the run state is still mid-stage is not detected as failed by submit (state-based check). Generation cap 10 000.
