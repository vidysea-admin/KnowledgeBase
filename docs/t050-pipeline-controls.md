# Resumable pipeline controls

`LKB_PIPELINE_GRAPH=1` selects the official LangGraph pipeline. Other values preserve the existing sequential path. The runner, file queue and CAS run-state store remain the only authorities for stage ordering, leases, checkpoints, retry limits and terminal jobs. Graph wiring calls existing capture/media/transcript/screen/index functions.

`LKB_ASK_GRAPH=1` selects official LangGraph execution for Ask. It uses the same retrieve/evaluate/refine/answer functions as the existing executor. The default remains off; the wrapper does not change citation, provider, budget or audit policy.

Recovery binds progress to the input media digest. Fresh capture binds its submitted request fingerprint before recording and persists that fingerprint in the operation row; recovery must reuse that request fingerprint. A changed fingerprint refuses incompatible queued progress. Legacy in-flight rows created with the previous path/size fingerprint can require explicit operator repair; they must not be overwritten or falsely marked complete.

Media finalization carries the run tenant explicitly. Every subsequent child stage checks the current source tenant before proceeding. Transcription invalidates the old transcript gate; the graph invokes the sanctioned session validator before screen processing and indexing, so newly written transcript bytes must pass validation rather than inherit an older generation's approval.

Each session's queue and checkpoints live under `data/webinar-release/pipeline-graph/<session>/`. The existing queue derives tenant-specific job/run IDs and keeps the approved 30-day terminal-job retention. Cancellation control records also derive IDs from tenant plus session. Corrupt controls/checkpoints and redirected directories are refused.

The `createSessionControl` internal seam exposes tenant-bound `read`, `cancel` and explicit `resume`. Cancellation is a persistent latch. A running graph observes it during lease heartbeats, aborts cooperative handlers, and marks the run failed/dead with `cancelled`; downstream stages do not start. Clearing the latch does not rewrite old jobs: the runner's D-139 resubmission policy creates a new generation after a terminal failure. External HTTP callers must be authenticated and tenant-bound by the API integration; these internal functions provide no authentication bypass.

Handlers receive an optional AbortSignal and must finish owned cleanup before returning. Direct Node child stages receive a graceful stop, then a forced stop after two seconds. Real capture descendants remain governed by the existing generation-bound capture controller and host cleanup. This does not prove portable descendant cleanup without host evidence.

`LKB_PIPELINE_STAGE_TIMEOUT_MS` bounds direct child stages (default 1,800,000 ms; maximum 21,600,000 ms). Private stderr is bounded in memory and reduced to stable retry codes. Raw diagnostic bytes never enter the returned error or completion marker. Known filesystem contention, provider timeout/5xx/rate limits and database unavailability reach the existing per-stage retry policy; unknown failures remain terminal `stage-failed`.

An interrupted acknowledged stage is skipped on restart within its generation. A crash after a side effect but before checkpoint acknowledgement is at-least-once: the handler is replayed and must be idempotent. Successful completion requires the existing validated index proof; the atomic marker additionally records tenant and pipeline generation. A filename or marker alone is insufficient to prove usable knowledge.

Task acceptance still requires actual recorded media/transcript/extraction/index, resolving retrieval/Ask consumption, host-long-stage evidence, current tenant/proof boundaries and the independent `goal-t050` checker verdict. Synthetic fixture processes establish mechanical durability and routing only. No production deployment, provider budget or production database write is implied.
