# Verdict: iss-webinarrelease-002-not-ready-after-degraded-extraction

VERDICT: PASS
Cycle checked: 0
Commit checked: db08658 (lane/webrel002, base 9e24d1f; no source changed)
Scope: ISS-WEBINARRELEASE-002 is already fixed at HEAD; the ledger row was stale.

## EXPLANATION

Per-call-site (the row's six described paths, re-derived from code and `git log -S`):

| Row call site | Code at HEAD that now refuses it | Fixing commit | Test with a degraded input |
|---|---|---|---|
| summarize.ts degraded fallback on rejected/invalid completion | strict `summarizeSession` returns `degraded:{reason}`; `indexSession` strict preflight turns it into `reason` | 0e85999 | session.test "ISS-WEBINARRELEASE-002 strict ..." cases summary-rejected, summary-invalid |
| session.ts writes `status.index=done`, hides degradation | session.ts:141-190 sets `status.index=failed` and throws `strict webinar index incomplete` for summary/claims degraded, no embedder, embed failure, chunk skip, missing tree; done written only at line 290; result carries `summary.degraded`, `claims.degraded`, `completion` | 0e85999 | same test: claims-rejected/invalid, embedding-rejected/missing, uncited-legacy-output (7/7 refused, no page/claims/chunks/tree write, no `done` update) |
| sync-session `--index` only logs `chunks.skipped` | sync-session.mjs:216-218 throws unless strict+complete+no degraded+no skipped+tree written; proof written only after (atomic rename) | 9f46fae | NO direct test (indirect via proof tests below) - ISS-WEBREL002-001 low |
| record-commands writes done marker after zero exit | `processRecordingArtifacts` calls `validateIndexProof` (v2, strict, fresh inputHash, tenant, turnCount>0, summary/claims/chunks/tree all `done`) before `report("done")` | 9f46fae (moved by c2fc9af) | record-commands.test "ledger002 index proof refuses weak, stale, foreign and degraded generations" |
| run-pipeline execute promotes marker to ready | `complete()` requires stage index, v2, and marker/proof match on tenant, session, inputHash, generation; else `failed` | 9f46fae | run-pipeline.test "zero exit without index proof stays failed"; "ledger002 weak or stale strict markers..." 6/6 attacks to failed |
| launchChild drains stderr | no longer relevant: readiness depends on the proof file, not stderr/exit code | 9f46fae | covered by the two run-pipeline tests |

Degradation semantics (strict mode): provider reject, unparseable/invalid response, partial coverage (`assertRuntimeCoverage` on `processed`), judge-unsupported, quote not in source, empty transcript, missing/failed embedding, chunk skip, missing tree all yield `status.index=failed` (existing enum value, no schema change), prior pages/claims/chunks/tree untouched. A claims list that is `[]` with full coverage and judge pass is accepted (a legitimate no-claims session), not a swallowed error. Observation: summary degradation is also caught a second way (the fallback page fails `validateRuntimePage`), so removing the explicit `summaryDegraded` term did not change test results (mutation 1 survived; defense in depth, not a hole).

Display: "ready" for a webinar operation is produced only by `webinarCompletionState` after `complete()` passes. Web shows `status.index` verbatim (SessionsListPage badge, SessionDetailPage, PastSection, KnowledgeExplorerPage), so `failed` is visible; analytics counts only `done`. Non-strict `indexSession` (watch/ingest-chain, watch-reingest, legacy API) still writes `done` with `summary.degraded` returned, by design ("legacy optional no-embedder semantics must remain"); those are not webinar pipeline paths. Webinar path is strict (sync-session passes `strictWebinar:true`; the only caller on the pipeline).

sync-session gate: reachable in production (processRecordingArtifacts spawns it with `--index`; non-zero exit or missing proof makes record-finalize throw and state `failed`). Read: the condition is correct and complete; an old proof from a prior run cannot certify a degraded rerun because the script exits non-zero and inputHash/generation are checked against the marker.

Tests run (no Mongo/LLM/network; fakes only): session.test 28/28; run-pipeline.test 22/22; record-commands.test 22 pass, 1 skip. process-video.test not run by me: its failing case needs real ffmpeg (environment, unrelated).

Mutations (harness in worktree, per-mutation backup restored in `finally`, hash-verified): (1) drop `summaryDegraded` term in session.ts: SURVIVED (redundant, see above); (2) drop the summary/claims/chunks/tree "done" check in validateIndexProof: KILLED (1 fail); (3) bypass `validateIndexProof` in run-pipeline `complete()`: KILLED (1 fail). After: all three files hash == HEAD blob, harness deleted, tree clean.

Ledger: ISS-WEBINARRELEASE-002 set to verified in qa/issues.WEBINARRELEASE.jsonl, citing 0e85999 and 9f46fae. ISS-WEBREL002-001 (low, untested sync gate) stays open, not a pulled unit.

ISSUES-WRITTEN: none
