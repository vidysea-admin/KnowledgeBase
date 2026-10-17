# T053 resumed watched receipt — evidence checkpoint

Policy: managed-review/1 (pre-dispatch packet; readiness incomplete, runtime HOLD).
Unit: resume-t053-watched-receipt; cycle 0; backlog tier 3; class source-authority/data-write (uncapped).
Root: C:/Users/product/Desktop/KnowledgeBase
Base SHA: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate: cbbacea0338163b35553cececabf773ebff05d6168c9e3eef07e3ad683ece138
Candidate means the exact ordered leased-file raw-byte hash map in pins.json, not a committed Git SHA.

## Current findings

All ten leased files exactly match the previous watched-snapshot-pins.json candidate. No source bytes were changed in this resume phase. The old goal-t053 manifest's statement that immutable watched jobs are unsupported is stale: router -> verifier -> immutable private spool -> configured executor -> executeWatchedSnapshotJob already exists. The central executor is a read dependency, not owned by this lane. No demonstrated missing implementation justifies rebuilding it.

Current C2/C3/C6 boundaries: server-derived tenant/actor and sources+ingest scopes; exact guarded snapshot text/hash/fetchedAt/previousHash in bounded private journal; worker validates identity and current watched row; worker never refetches. Existing source-job authorization runs before execution. Watched lastFetch advances only after strict indexing and persisted/readback consumption proof. Queue acceptance does not mark healthy. Uncertain jobs remain explicit and cannot silently retry providers. C4/C5 recording receive-job checks the completed persisted result and actual consumed recording before transition; repeated receipts/conflicts are handled by existing gap transition logic. These are source observations, not runtime or independent acceptance.

Immediate consumers: source-intake/jobs/worker.ts and receipt.ts; central composition/integrations/source-jobs.ts; connector-workflow/mongo-store.ts physical receipt checking. Their exact dependency hashes are in pins.json. Existing implementation already has changed/unchanged, failure/retry and recording physical-loss/recovery cases in workflow.test.ts; their import/privacy HOLD remains separately binding. New standalone watched-job.test.ts has five public synthetic cases and does not import connector fixtures, indexing/session or production composition directly.

## Required evidence

See broker-request.json for the minimum first execution: five standalone watched-job cases only. Expected fixture-only coverage includes exact Unicode/spool reopen, tamper/foreign/stale refusal, no refetch, partial/missing proof/revocation refusal, reachable authenticated route and stable job reuse. No earlier green receipt for these exact tests/current environment is established, so no receipt is reused as current success.

Separately held: workflow.test.ts privacy/import clearance, affected real index consumer and recording proof cases; minimum subsequent checks selected only after clearance; contracts/verify_contracts.py; independent boundary verification; exact runtime/environment fingerprints and managed-review validation. The C6 changed/unchanged and failure/retry floor is not discharged by the five standalone tests. Parent P1-P4 (real transport, actual inventory/recording, scheduler cadence/live sources, native durable DB/ACL) remain open.

No checker dispatch, verdict, readiness upgrade, central manifest/contract/tracker edit, provider call, browser, database operation or local test run occurred. Root owns the CPU broker and runtime release. Phase actual-total tokens, cost and active duration are unavailable (null), not measured zero. Earlier usage and receipts are preserved; phase-metrics.json records this limitation.