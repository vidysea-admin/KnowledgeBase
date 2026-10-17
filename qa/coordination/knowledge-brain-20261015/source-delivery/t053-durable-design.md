# T-053 durable watched snapshot: proposed bounded unit

Status: design only; source lease pending. No source edits or tests authorized by this document.
Date: 2026-10-15. Maker instructions read: skills/maker/SKILL.md.
Current parent packet: qa/packets/goal-t053.md, particularly lines 172–175.

## Complete behavior

Acquire one due watched page with the existing guarded fetcher, enqueue the exact immutable snapshot into the private durable spool, reopen it, reauthorize the current stored actor, ingest/index those exact bytes without refetch, and finalize the watched-source receipt only after physically verified consumption. Queue acceptance never advances lastFetch. Preserve existing media-only job behavior. This is a source implementation slice, not parent acceptance or a live activation.

## Proposed source ownership

Existing-file lease requested; not granted here:

- apps/api/src/source-intake/jobs/types.ts: discriminated watched-snapshot input/persisted payload.
- apps/api/src/source-intake/jobs/input.ts: bounded validation and immutable identity binding tenant, actor, watched ID, source URL, exact text hash and capture provenance.
- apps/api/src/source-intake/jobs/store.ts: payload-aware enqueue, durable replay integrity and idempotency.
- apps/api/src/connector-workflow/watched.ts: guarded snapshot acquisition/enqueue and completed-job finalization, preserving direct mode.
- apps/api/src/connector-workflow/jobs.ts: authenticated snapshot enqueue/poll integration.
- apps/api/src/connector-workflow/router.ts: replace durable-mode watched_job_snapshot_unsupported only for the implemented branch; enforce appropriate ingestion authorization.
- apps/api/src/connector-workflow/workflow.test.ts: public synthetic end-to-end cases when explicitly permitted.

New consumed executor helper: apps/api/src/connector-workflow/watched-job.ts. New public synthetic job tests belong to this unit. These are proposals, not implemented orphan helpers.

Root alone owns apps/api/src/composition/integrations/source-jobs.ts. A narrow root-written executor branch is necessary: buildConfiguredSourceWorker.executeJob currently validates media-only approvedSourceInput, digest([tenant,actor,url]), media configuration and URL intake. Snapshot dispatch must occur after current stored-actor authorization and before media-specific execution. Do not patch this shared file from the source lane.

Source-jobs SHA256 observed immediately before this design write:
856267DB87A4CE32A8E1993A35CA2CEE88ADABB39D8FB31F9978DA1245BF5D6B
This is a point-in-time identity, not a frozen candidate or permission to overwrite subsequent central edits. Reconcile current bytes with central before integration.

apps/api/src/source-intake/jobs/worker.ts already dispatches the optional executeJob. No change is inherently required there. Existing watched lastFetch provenance fields can carry completion; no Mongo schema or global mounting change is inherently required. New capabilities must remain unsupported until the central executor and caller paths both exist.

## Acceptance and risk boundaries

Required focused cases when execution is authorized: exact Unicode/hash preservation across spool reopen; no worker refetch; foreign tenant/actor and tampered payload refusal before writes; idempotency and restart; incomplete indexing leaves lastFetch due; physically verified strict consumption finalizes once; original media-job behavior preserved. Verify both affected stage and immediate downstream consumer.

Security class: private snapshot contents, durable data writes, actor revocation and tenant isolation. Preserve private spool ACL verification, journal integrity, bounded payload size and safe public job views. Determine sources plus ingest authority consistently at enqueue and execution; do not silently broaden existing worker authority. Parent verification, live native ACL/DB/provider evidence, actual watched cadence and notification delivery remain separate gates. No provider, DB, network or test execution occurred in this survey.

## T-045 boundary

qa/verdicts/goal-t045.md remains HOLD for actual five-source acquisition, real STT and downstream cited consumption. Existing acquisition/runtime sources already implement bounded downloads and transcription. No evidence-supported new-only implementation gap was established. An authorized dynamic OnAir event may demonstrate a resolver need later; do not invent that need or treat account access as authorized here.
