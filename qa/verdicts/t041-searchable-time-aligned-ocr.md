# t041-searchable-time-aligned-ocr — independent checker

VERDICT: PASS
Cycle checked: 1
Scope: current source implementation and synthetic affected-stage/immediate-consumer acceptance under `qa/contracts/goal-T041.md` S1–S9. Whole T-041 remains HOLD for L1–L3. This is not real-media/OCR-provider/search deployment acceptance.

## Checked behavior

- Actual `processVideo` persists successful OCR with finite visibility intervals and half-open overlapping speech references. Consecutive duplicate frames are suppressed, A/B/blank/A remains distinct, blank observations end coverage, and original speech remains unchanged. Failed observations follow D-137: bounded attempts/deadlines/backoff, optional fallback, counted safe gaps and recovery instead of cached-away failures.
- Actual loader, chunk builder, production speaker mapper, page builder and scoped source hydrator consume those synthetic persisted outputs. Screen-only marker text retains session/time/frame provenance and unverified visual origin beside speech. The six digest-resealed attachment attacks are refused; tenant mismatches and repeated ingestion behavior are covered.
- The production sync caller imports/calls the checked mapper. Human metadata aliases cannot map screen rows into human speech or emitted speaker summaries. Review planning rejects screen-to-human mapping; the physical effective reader and actual hydrator refuse an invalid historical overlay. **The pure `effectiveTurns` helper still returns `person:alice` for that legacy overlay**; PASS is established at guarded production boundaries, not by attributing a guard to that helper.
- New version-3 screen IDs include tenant identity; legacy version-2 identities/point timestamps remain compatible. Existing approved screen-evidence storage is reused. Source-only timeout/abort, diagnostic sanitization, generation/lock recovery and temporary optional-keyframe cleanup are covered without provider/native-media execution.

## Actual evidence and attribution

1. Attributed maker/coordinator stage and downstream evidence: `qa/evidence/t041-searchable-time-aligned-ocr/maker-cycle1-current-20261014T234324Z.receipt.json`, adjacent stdout/stderr. Exact program `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`; arguments `--test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs scripts/webinar/slides/slide-knowledge.test.mjs scripts/webinar/process-video-slides.test.mjs scripts/webinar/process-video.test.mjs`; cwd this repository; environment `LKB_HERMETIC_MEDIA_TESTS=1`. Executed 2026-10-14T23:43:24.5406541Z–23:43:28.3532499Z, terminal exit 0, wrapper 3813 ms, Node 3607.0903 ms: **29 tests, 28 PASS, 0 FAIL, 1 explicit native-media SKIP**. All 16 pre/post raw SHA256 pins match; checker independently matched their current bytes. Receipt SHA256 `f127b73524ddce0b69e5d8cb46ef2a96e76477438038e428fb17dc094c6cd7ea`.
2. Independently authored, appointed-coordinator-executed origin probe: `qa/evidence/t041-searchable-time-aligned-ocr-checker/review-origin-current-20261014T233230Z.receipt.json`, adjacent stdout/stderr. Exact same Node program, arguments `--import ./.cache/coordination/safe-test-runtime/register.mjs qa/evidence/t041-searchable-time-aligned-ocr-checker/review-origin-probe.mjs`, cwd this repository, outer bound 60000 ms. Executed 23:32:30.4102425Z–23:32:32.6685341Z, terminal exit 0, 2258 ms; all nine pre/post/current raw pins match. Output: `blockedAtWrite=true`, `blockedAtRead=true`, `effectiveSpeaker=person:alice`. This probe uses actual planner/overlay/hydrator functions with synthetic scoped reads. No pre-fix origin runtime RED was granted or executed; the original finding was static source evidence.
3. Independently authored all-pairs span oracle: `qa/evidence/t041-searchable-time-aligned-ocr-checker/span-current-20261014T234824Z.receipt.json`, adjacent stdout/stderr. Exact same Node program, arguments `qa/evidence/t041-searchable-time-aligned-ocr-checker/span-probe.mjs`, cwd this repository, outer bound 10000 ms. Executed 23:48:24.3464099Z–23:48:24.5129153Z, terminal exit 0, receipt duration **167 ms**, two unchanged raw pins. Output: **134 passing assertions, 64 all-pairs overlap timelines, 64 permutation checks**, plus invalid timeline and mapper/original-row checks. This independently checks half-open zero-length/crossing turns and unreadable gaps without reusing the production sweep algorithm.
4. Attributed central frozen-contract receipt `qa/evidence/goal-t051checker-validator.json`: exact command `python contracts/verify_contracts.py`, exit 0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Execution batch 18:39:31.7184876Z–18:39:33.1459082Z; individual command duration unknown (combined batch 1.4327147 s). Checker reconfirmed unchanged validator/registry bytes. This empty-registry result is not substitute stage, downstream or live evidence.

The original failed synthetic fixture receipt `qa/evidence/goal-t051checker-broker-t041-maker.json` remains immutable: exit 1, 4577.6762 ms, 29 tests/27 PASS/1 FAIL/1 media SKIP. Cycle 1 repairs the injected read interface/context, retaining origin, time and tenant assertions. No failed receipt was rewritten or counted as green. No duplicate current suite or provider/media/database run was performed by this checker.

## Final checked bytes

Raw SHA256; complete imported 16-file set is retained verbatim in the current maker receipt's matching `before`/`after` maps. Final independent reconciliation before drafting found zero drift, and manifest remained `ready-for-check`, cycle 1.

| Input | SHA256 |
|---|---|
| `scripts/webinar/process-video.mjs` | `27e1ec624bfa31395de400feaa992431256fc5362095ba87a4327c396e2d6ed7` |
| `scripts/webinar/slides/slide-knowledge.mjs` | `e541aefe83efdba59cf78d3bad29820816da441cf5b8294d2dfc81288a470eef` |
| `scripts/webinar/slides/slide-knowledge.test.mjs` | `4c69ace06a5ef0e6c2e4a1a675fd88d2791bc2f5d8f13c2990a0bbaa1fb55685` |
| `scripts/webinar/process-video.test.mjs` | `0bb78df51fd31878aabadf8a9f362b4e67db97c678175b2fe4a89164c4df6037` |
| `scripts/webinar/session-rows.mjs` | `684a6d3c5e6fafdd9879ce232d5b0703d6a1e7d667415e2be2b0543b70de8081` |
| `scripts/webinar/sync-session.mjs` (inspected caller; not executed) | `9896eff9e8fdc9e6298aca5cf751c708c45e8c24cfd2acf8b42acb96fd5a4012` |
| `apps/api/src/transcript-review/planner.ts` | `9d56eb0a585c78faaa945e47ca5a4d6fbaea16fbe95f3e975d5b3f8bbfe09ade` |
| `apps/api/src/transcript-review/effective-reader.ts` | `4335cb7d6266ddf95f409d1606ba661e8b19a954ce0596098fc7591b684cd500` |
| `apps/api/src/ask/source-context.ts` | `1f084b8f14764a097d4d826ab3ad431945fc35563c67d1eb9edab2b75009fb8f` |
| `qa/contracts/goal-T041.md` | `75ff3f0d62ae771b4bb9bff31c67260a870aedc7f9e9af65fc4cc602d1de1450` |
| independent span probe | `1c20b790d94789bb03af6843b9a83c2e469b112004f7ca4c2841cbf96560817c` |
| independent origin probe | `c65dbd88aa39c7cd2f8e91a62c5defb46412393f5cff6e6f87523fa333736f38` |
| `contracts/verify_contracts.py` | `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3` |
| `contracts/contracts.json` | `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940` |

## Timing and limitations

Current matching-READY checker launch/initial reconciliation: 2026-10-14 23:45:38 UTC. Source/current receipt review finished 23:46:37 UTC. The only remaining oracle was queued with the appointed ordinary coordinator; actual execution timestamps are recorded above. Final pin reconciliation/draft start: 23:49:01 UTC. Earlier surveys, user holds and static findings are not represented as this single checker run. No new user approval or local checker CPU process was involved. Persistence completion/total elapsed are recorded in the adjacent checker completion receipt; subphase timings not directly measured remain unknown. The 120–180 second target was exceeded to obtain the already-prepared independent oracle through the sole execution coordinator, not by widening scope.

ISSUES-WRITTEN: none

EXPLANATION: No remaining proven scoped S1–S9 source acceptance violation. Reported static origin/timeout/attachment issues were repaired before submission and are checked at their actual boundaries. No filed issue corpus is being substituted or closed. Only this matching cycle may be closed by maker. **T-041 stays in progress/HOLD**: L1 real finite recording/provider OCR, L2 independent visual OCR/time comparison and L3 actual authorized tenant ingestion/index/search have not been demonstrated. Native FFmpeg remains explicitly skipped; synthetic persistence and injected reads do not prove live deployment, real OCR accuracy or production search. No raw/private recordings, transcripts, OCR payloads, production writes, live browser or publication are part of this verdict.
