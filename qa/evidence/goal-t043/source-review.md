# T-043 independent source review, before live readiness

Checker: checker_t043. This is preparatory evidence, not a PASS verdict. Full contract: qa/contracts/goal-t043.md, SHA256 3173892AE16821611AB9EF441C2A9DF1240AE63910F034E8C82E3EE26348B35D.

## Independently observed

- TASKS.md explicitly leaves live `sync-session --index` plus real cited `/ask` outstanding; roadmap adds tree/vector, hash dedupe and across-webinar retrieval.
- D-143/D-146 require lkb_staging for the approved live proof. D-149 supersedes D-148's missing-audio derivation method with honest legacy-unbound staging seeding. D-153 excludes malformed legacy turns individually but refuses foreign-tenant/session rows.
- Existing live summary documents 751/1905 planned vectors, 9/21 seeded sessions embedded, temporary deterministic tree over 19 sessions, and five answers with citation checks. Its query embeddings failed; the vector arm was not demonstrated. This is attributed prior evidence, not independently rerun evidence.
- `loadWebinarSession` permits a speech-only path absent video-stage.json; silent captures require passed media/transcript validation and positive duration. Verified video-stage consumes knowledge-turns.json with hash checks and validates screen/speech identity.
- Current sync CLI emits index-proof only after strict complete indexing, but unconditionally reads knowledge-turns.json for proof hashing, even when the loader used speech-only turns.json. The candidate below exposes the precondition mismatch. No live failure is claimed because the checker did not execute the CLI.
- Current source-context.ts implements per-turn exclusion after scope checks, drops chunks containing excluded turns, refuses an all-invalid snapshot, and refuses foreign chunks before filtering.

## Current checked source hashes

| File | SHA256 |
|---|---|
| scripts/webinar/sync-session.mjs | F2A2FA42F8CA27EFB1B68DB305ADB26C7FC77146B7DBDC7F670BB6D92F17330F |
| scripts/webinar/session-rows.mjs | B130192DB7798BCDCE26044D69FE2F384D4C7DB537581B416161AA1449C22D0E |
| apps/api/src/indexing/session.ts | 62E791C022C411FC1B57BC2E6CAB3A454A93801E8F8CEE5C9B529DF8F44AD0EB |
| apps/api/src/ask/source-context.ts | 6D145C0D01F70975184C9AB8045C4E6CE2EFF8C3DE3F98B123EF224083B37152 |
| apps/api/src/routes/ask/ask.ts | AF3298DE5B0B105B4E588CDB656E4E41F2F106378E3FC623F84101956535EF7C |

Hashes describe the preparatory review only. Final verdict must hash the submitted candidate and dependencies again.

## Attributed candidate and pending work

At initial review, maker reported 2026-10-13-zoom-webinar-p2 (tenant vidysea), 899.26 seconds, 73 turns, passed validation/transcriptValidated, full coverage, and turns SHA256 01899d788e7461323a797d1871560a809112d327819d0c04645f4ebbed0bcb67. Maker also reported retained real playable video/audio and p1's failed validation; p1 remains a corpus gap.

Subsequent independent JSON read and SHA256 check confirmed p2 tenant `vidysea`, source ID `2026-10-13-zoom-webinar-p2-src`, title `The Roadmap to becoming a FDE (part 2)`, captureMode `silent`, validation passed/transcriptValidated, duration 899.26 and 73 turns. Current turns file SHA256 exactly matches validation.turnsSha256 (01899D788E7461323A797D1871560A809112D327819D0C04645F4EBBED0BCB67). A direct count found zero tenant/session/timing/duration violations. video-stage.json and knowledge-turns.json were both absent. This verifies the speech input metadata, not retained-media content or downstream/live acceptance. Read command exited 0 in 4.427991 seconds; it used Get-Content/ConvertFrom-Json for source.json, validation.json and turns.json, Where-Object for the stated predicate, Test-Path for the two absent files, and Get-FileHash for turns.json. No provider calls or DB access occurred.

Preparatory helper review independently found that a positive result.turnCount could differ from selectedTurns.length and still certify completion. Maker reports adding count equality and a mismatch test; final helper/test review and execution remain pending (claimed current hashes D5587C545BD6CEC1904BE2DC9054A12D310B2938BCFADA9DCFA742B2D44591A4 and EBDA18598630C0FF4CF765F28710175916DCC2FFC03959F9E82CCCABD808EFF7). The helper also pins selected input and gate bytes before indexing and rechecks them before proof emission. The maker packet remains in_progress, not ready-for-check.

Root leases contract, qa/verdicts/goal-t043.md and this evidence subtree. Maker/root own proof helper/source patch. Await ready-for-check cycle with hashes, actual validated video stage, guarded real Mongo/provider index and API citation evidence, root CPU slot for independent focused checks, and final corpus accounting. No tests, provider calls, database writes, browser work, product changes or credential reads were performed by this checker during preparation.

## Commands / timing limits

Preparatory commands were Get-Content, rg, Get-FileHash and clock reads. They inspected AGENTS.md, skills/checker/SKILL.md, ARCHITECTURE.md, relevant TASKS/goal/roadmap/DECISIONS entries, named prior contracts/verdicts/live summary and the source files above. Source/hash command returned exit 0 in 4.1348385 seconds. Two earlier combined read commands returned exit 1 solely because Windows rg wildcard paths were invalid (`scripts/webinar/*test*`, `docs/*goal*`); their successful source reads were inspected. Reads supplied no acceptance-test evidence.

First recorded clock was 2026-10-14 18:17:56 UTC after initial reads; exact initial launch timestamp is unknown. The 120–180 second skill efficiency target has elapsed while required runtime, submission and CPU prerequisites remain pending. No unmeasured gap is attributed to execution, approval or drafting. Acceptance remains unverified.

## Resume review (2026-10-14; clock checkpoint 19:16:27 UTC)

User steering first suspended edits/tests, then root explicitly resumed source/QA work. Live handles were NONE and reported to the sole CPU broker `/root/docker_checker`; no old grant was reused. Real provider/browser/DB/external actions and full suites remain prohibited in this resume. New execution requires a fresh broker grant.

Independent current read confirmed helper SHA256 D5587C545BD6CEC1904BE2DC9054A12D310B2938BCFADA9DCFA742B2D44591A4 and test EBDA18598630C0FF4CF765F28710175916DCC2FFC03959F9E82CCCABD808EFF7, including the corrected turn-count equality and mismatch case. sync-session.mjs remained F2A2FA42F8CA27EFB1B68DB305ADB26C7FC77146B7DBDC7F670BB6D92F17330F, with no helper import/integration and the unconditional combined-artifact proof hash. The final goal-t043 manifest and packet were absent; the preparation manifest remained in_progress cycle 1 with a final same-slug pointer.

The prepared helper compares completion.turnCount against selectedTurns.length at finalization. A preparatory note was sent to maker to capture that count as an immutable scalar before indexing; caller mutation of the array must not change the prepared count. No live exploit is claimed: the current CLI maps loaded turns without mutating that array. Tests remain unrun.

Immediate consumers independently reviewed: packages/meeting-bot/src/capture/record-finalize.ts validateIndexProof hashes knowledge-turns.json and checks strict version-2 stage completion; scripts/webinar/run-pipeline.mjs complete state confines that same combined artifact and validates the proof. Thus the new helper's combined-input proof remains compatible in shape; a speech-only proof is outside these capture downstream consumers and must not be presented as proving them. Actual consumer execution remains pending.

At 19:19:22 UTC, the canonical goal-t043 manifest and packet now existed at in_progress cycle 1, explicitly not ready-for-check. Their SHA256 hashes were respectively 43A75412C857BFAA1C954B1811E4E3133A62ABDC1973292FB35FC636023DEEFD and F052C628537A0627858486826C261C1301327F90C26BB2A17E21546A527E7AAE. Current helper/test hashes independently matched packet claims: 7E548F2C2F643D6D3F6AFBA6C2360AAF225A7B531B6DC7E2D0FB2439283843EB and A047145BB417E9ACEA61D25105D9E4C0FA59FF67ADFD0975C75E3256F3DA38FB. Source review confirmed inputTurnCount is now captured before indexing, and the seventh focused test covers caller array mutation. No remaining acceptance defect was established in that helper review. No test or runtime grant was received and no execution occurred. This is current preparatory readiness evidence only; no matching-cycle verdict exists.
