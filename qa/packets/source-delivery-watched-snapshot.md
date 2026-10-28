# source-delivery-watched-snapshot — cycle 0

Status: building. Source implementation only; not ready for checker or parent acceptance.
Root: C:/Users/product/Desktop/KnowledgeBase.
Observed HEAD/base commit: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. This shared working tree already contained uncommitted work; original-file fingerprints, not that commit alone, identify the pre-edit bytes.
Candidate fingerprint (ordered original preparation map, not a commit): 4df6fb281dcb79e2910f96022628580e9b2094e9846d49e612ade3d03c285190.
Exact pins/originals: qa/coordination/knowledge-brain-20261015/source-delivery/watched-snapshot-pins.json.
Design/authorization boundaries: qa/coordination/knowledge-brain-20261015/source-delivery/t053-durable-design.md; coordinator explicitly granted existing files plus entry.ts and central executor ownership.

## Scope and changed paths

Contract qa/contracts/goal-t053.md C1 reachable intake; C2 auth-derived tenant; C3 provenance/guarded snapshot; C5 visible failure; C6 exact snapshot, unchanged skip and success after downstream consumption; C7 affected/downstream evidence; C8 positive physical consumption. Maker did not edit contracts. Parent P1-P4 stay open.

Eight existing leased files:
- apps/api/src/source-intake/jobs/types.ts: optional version-1 WatchedJobSnapshot on input/persisted job; public view omits snapshot.
- apps/api/src/source-intake/jobs/input.ts: approvedSourceInput canonical validation; sourceJobInputHash preserves old media identity and binds entire canonical snapshot. Exact valid UTF8 text/hash, bounded field values and timestamp; max 48KiB text and max 48KiB serialized canonical snapshot, rejecting rather than truncating. This fits the inherited 128KiB journal event limit with room for envelope/receipts. Snapshot URLs are canonical HTTPS without credentials/query/fragment/custom port.
- apps/api/src/source-intake/jobs/store.ts: enqueue persists immutable approved payload; replay revalidates its canonical bytes/hash and existing transitions; original media hash retained.
- apps/api/src/connector-workflow/watched.ts: durable mode requires authenticated sources+ingest and key ID before fetch; existing guarded fetch acquires exact snapshot; stable content/previous-version request ID reuses queued jobs; no inline ingestion/indexing or lastFetch advance. Unchanged physically consumed content retains original skip behavior. Uncertain jobs remain failed/action-required, never automatically replayed.
- apps/api/src/connector-workflow/jobs.ts: trusted auth-derived snapshot enqueue through existing approval path; body never supplies snapshot.
- apps/api/src/connector-workflow/router.ts: authenticated watched route calls durable-capable verifier; sources-only durable requests receive403; overview reports configured transport. Route body snapshot/tenant fields are ignored.
- apps/api/src/connector-workflow/workflow.test.ts: updates prior unsupported-mode expectations to queue acceptance without inline writes. Existing legacy corpus excluded from this broker request.
- apps/api/src/source-intake/jobs/entry.ts: pure startup configuration calls sourceWorkerConfiguration(env,{requireProvider:false}); actual media jobs still require provider in central executor. This permits configured watched-only worker startup; no process launched here.

Two new files (no prior base):
- apps/api/src/connector-workflow/watched-job.ts: executeWatchedSnapshotJob(job:Readonly<SourceJob>,deps:ConnectorWorkflowDeps):Promise<SourceIntakeResult>. Independently validates canonical snapshot/hash and approval binding, rejects account authority, matches current active tenant watched row+URL+previousHash before writes. Existing URL adapter consumes exact stored snapshot without fetch, retains provenance, strict indexing followed by recordConsumedSource and hasConsumedSource readback, then lastFetch CAS and gap resolution. Returned producer receipt is consumed by the existing durable worker finish boundary.
- apps/api/src/connector-workflow/watched-job.test.ts: five new public synthetic tests using their own explicitly synthetic artifact/ACL mocks. Imports actual source modules only, not the legacy fixture/test corpus. Tests do not establish native ACL/current stored identity/actual Mongo/provider evidence.

## Immediate central consumer

Root-owned apps/api/src/composition/integrations/source-jobs.ts SHA256 99ea968eb1655fb27abdcfe6ff8acab3eac9548b85cb215ee46f75e21036eb16, independently fingerprinted after root reports its branch implemented. Root alone owns those edits. No entire shared freeze is inferred.

Frozen API: sourceJobInputHash(input) from jobs/input.ts; optional job.watchedSnapshot; executeWatchedSnapshotJob(job,deps) above. Root's executor must authorize stored actor/lifecycle and current sources+ingest, reject snapshot sourceAuthority, and branch before media-only/account-session configuration; helper never fetches. Root reports lazy strict connector deps and actor recheck before indexing, provider-free worker construction and retained fail-closed actual-media provider requirements. Central compiler/integration evidence must verify these source claims; maker did not execute that integration.

Existing worker.ts calls executeJob, validates completed receipt and finishes its private journal; entry.ts runs that worker separately from HTTP startup. No worker.ts edit required. Existing Mongo source/turn/session/watched fields are reused; no schema changes.

## Prepared checks and restrictions

Broker-only proposed focused command from repository root, using the coordinator's preflighted Node executable and importer:
`node --import tsx --test apps/api/src/connector-workflow/watched-job.test.ts`
Broker must enforce30s outer bound. Expected5 tests; counts/results/duration UNKNOWN until receipt.

Cases: exact Unicode identity+legacy hash; durable reopen/exact bytes/no worker fetch/strict receipt/public view/one execution; tamper/foreign/current source/previousHash refusal before ingest; partial index/physical proof loss/revoked actor uncertainty without healthy hash; actual authenticated router ignoring forged body tenant/snapshot, sources-only refusal before fetch and duplicate enqueue identity. Same source test file exercises affected stage and immediate worker/helper/index consumer using synthetic artifacts.

Actual provider/media/DB/network/browser tests are prohibited for this lane. No test commands were run locally. Central owns appropriate compiler/contracts checks and any same-SHA evidence receipts. No old receipt is treated as current candidate evidence. Existing legacy workflow corpus requires separate authorization; do not import it or run it via a test-name filter.

## Remaining acceptance gates and measurements

All broker checks, central startup/executor integration/compiler/contracts checks and independent review are pending. Parent actual watched cadence, authorized live sources, native ACL, isolated real DB/current actor revocation/restart, provider downstream and cited Ask evidence stay separate. T-045 is unchanged and operational HOLD.
Actual maker active seconds/tokens/cost UNKNOWN. Checker requires the explicit bounded BOOTSTRAP_REVIEW path if no valid comparable denominator is supplied, with ratio unverified. No PASS or operational release claim is made by this packet.
