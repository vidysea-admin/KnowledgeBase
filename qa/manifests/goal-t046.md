# goal-t046

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Task: T-046 (D-008 raw-video retention + real /meeting-bot page). Tier 3 roadmap. Class: data-delete + tenant/auth, full ceremony.
Contract: qa/contracts/goal-t046.md C1-C7 (maker never edits it). No parent verdict exists yet.
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t046ret, branch lane/w16-t046ret, base a9fac545. Candidate = HEAD of this branch (this commit).
Scope: packages/ingest/src/retention/** only; this cycle changed NO source. The only new path is this manifest. Child manifests/packets (inputs, not replaced): qa/goal-t046/t046-production-retention-wiring.md, qa/goal-t046/t046-retention-status-api-ui.md, qa/manifests/t046-retention-live.md (checked-PASS cycle 1) plus the earlier planner/dry-run/executor/schedule/page PASSes.

## Safety
No deletion, purge, scheduler registration, browser, DB write or provider call was run. Tests use disposable temp fixtures only (ten-byte fixture media, injected mocks, lavfi-generated tiny mp4 for real ffmpeg/ffprobe). No --execute path was run against any real file.

## Maker evidence (Node v24.19.0 from C:\Users\product\.cache\codex-runtimes\...\node\bin, cwd packages/ingest, `timeout 600`, one process at a time, node_modules junctioned to main)
1. `node --test --test-concurrency=1 --test-timeout=60000 --import tsx src/retention/production/retention-processed-proof.test.ts src/retention/production/private-summary.test.ts src/retention/retention-purge-job.test.ts src/retention/retention-purge.test.ts src/retention/retention-report.nowrite.test.ts` -> exit 0; tests 43 / pass 43 / fail 0 / cancelled 0 / skipped 0 (7m54s wall under shared load). Output: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t046ret-run1.txt
2. `node --test --test-concurrency=1 --test-timeout=120000 --import tsx src/retention/retention-live.test.ts` -> exit 0; tests 23 / pass 23 / fail 0 / skipped 0 (real ffmpeg/ffprobe on disposable lavfi fixtures ran, not skipped). Output: ...\w16-t046ret-run2.txt
3. `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ingest) -> exit 0. Output: ...\w16-t046ret-tsc.txt
Genuine defects found in retention/**: none; no source edited. Not run: API/web tests (outside lane scope; the child packet holds their receipts: API 4/4, web 4/4, writer-consumer pending), contracts/verify_contracts.py (checker runs; registry is empty so PASS is by vacuity), mutation runs.

## C1-C7 map
| ID | Evidence available | Live/human gate remaining |
|---|---|---|
| C1 policy | Planner/report/executor code in retention/** and prior PASS verdicts (sweep planner, dry-run report, purge executor); retention-purge.test.ts and retention-live.test.ts green (items 1-2). Fail-closed boundaries, 90-day floor, vetoes covered by retention-sweep/report tests (not re-run this cycle; unchanged). | Checker must independently probe boundaries. D-145 reading: evidence clips stay exempt; no owner resolution requested. No real deletion follows an ELIGIBLE report. |
| C2 processing + clip-before-delete | retention-processed-proof.ts + test (item 1); sync-session.mjs lines 211/260/262/272 call setSessionIndexStatus / markSessionProcessedFromProof after index proof; both CLIs pass realClipExtractor() (retention-purge-cli.ts:6-10, job-cli:8,16); execute refuses missing clip dep (retention-purge tests); retention-live.test.ts real ffmpeg/ffprobe (23/23) covers parse, window coverage, .partial atomic publish, junk/truncated rejection (ISS-T046LIVE-001/002 reproductions, previously closed). | Real pipeline run on a real session and a real-media clip are NOT done (production-media purge needs separate authorization). Checker must inspect sync-session.mjs call sites (outside lane scope, unedited here). |
| C3 tenant-safe status | apps/api/src/retention-status/{router,store,summary}.ts; status.test.ts 4/4 and writer-consumer.test.ts per child packet (not re-run by me, outside lane); writer side private-summary.ts tests in item 1 (tenant sha256 layout, link/hardlink checks, no global fallback). Composition mount exists in apps/api/src/composition/integrations/{hosting,routes}.ts (root-owned). | Runtime composition against a real host data root; checker route/auth/store probes. |
| C4 compact projection | summary.ts projectSummary + status.test.ts (child packet); LastRun builder in retention-last-run.ts via retention-live tests (item 2). | Checker malformed/hostile-extras probes. |
| C5 page | RetentionSection.tsx/.test.tsx 4/4 (child packet) and MeetingBotPage.tsx mount (root-owned). | Live authorized /meeting-bot browser check with real host state: HOLD (no browser run here). |
| C6 host operation | Dry-run default and `-Execute -ConfirmDeletion` double gate in scripts/retention/schedule-retention-purge.ps1; job CLI binds private sidecar. | Real host dry run against real state, scheduler installation and observed firing, real execute (owner authorization): HOLD, none performed. Flat TOC dir vs SHA-tenant layout reconciliation is an open consumption gate (child packet). |
| C7 verification | This manifest, hashes below; checker to run verify_contracts.py and the commands above. | Whole-task closure needs C1-C6 live gates; a scoped verdict must name them. |

## Final hashes (SHA256, packages/ingest/src/retention, unchanged from base a9fac545)
Run `git -C <lane> hash-object` / sha256 on the paths in the child packet table; no byte of retention/** differs from base (`git diff a9fac545 --stat -- packages/ingest/src/retention` is empty).

## Usage
Maker actual token usage: unknown (not exposed to the maker). Wall time: about 8 min test time under load plus setup; time-of-day unrecorded. Checker usage: none yet.
