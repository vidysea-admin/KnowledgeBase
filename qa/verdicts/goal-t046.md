# Verdict: goal-t046 (parent manifest)

VERDICT: PASS
Status: PASS (scoped; agent-verifiable criteria only; live gates HELD, see below)
Cycle checked: 0
Reviewed SHA: 62b208acabeb0cd5516ce4f6c755b20191988ca0
Base SHA: a9fac545d0da015668d7dba455031b3a0fe52078
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t046ret (branch lane/w16-t046ret)
Contract: qa/contracts/goal-t046.md C1-C7
Checker: independent checker, fresh context, 2026-10-16 (review phase 14:34:15Z to 14:53:59Z wall)
ISSUES-WRITTEN: none

## Scope of this PASS

The PASS covers only the agent-verifiable portions of C1, C2 (source and fixture), C3, C4, C6 (source and script guards) and C7.
It is **not** a whole-task closure of T-046. These gates are explicitly **HELD**:

- **C2 live:** no real pipeline run on a real session stamping processedAt, and no real-media clip. Any production-media purge needs separate owner authorization.
- **C5 entire:** the live authorized `/meeting-bot` browser check against real host state is not done. RetentionSection/MeetingBotPage component tests were also not re-run by this checker; only the child packet's maker receipts exist for them.
- **C6 live:** none of these has happened: a real host dry run against real state, scheduler installation and observed firing, or a real execute with owner authorization. The flat TOC directory versus SHA-tenant layout reconciliation is still open.
- **C3 runtime composition:** the API is not composed against a real host data root.

T-046 stays in progress until those gates close.

## Identity

- `git rev-parse HEAD` in the lane gives 62b208ac..., and a9fac545 is its parent. `git diff --stat a9fac545 62b208ac` shows 1 file: `qa/manifests/goal-t046.md`, +35 lines. No source changed, which confirms the maker's claim.
- The manifest declares Status ready-for-check and Fix cycle 0. Its SHA-256 is a32066e56332d1e2f06d611816156c616e9ecfc8bc2968f50b375df6b46c485d.
- Checked source SHA-256 (byte-identical to base):
  - retention-purge.ts: 83a9217d...0602911
  - router.ts: 1beb5f33...6fdecc3
  - store.ts: ec9bc742...46fb62
  - summary.ts: d9abfb7a...648bc3
  - schedule-retention-purge.ps1: aca16fc3...c0f4
- The lane is clean under packages/, apps/ and scripts/ after all runs.

## Independent evidence

All evidence is in `qa/evidence/goal-t046-checker/` in the lane. It is untracked and not committed; only this verdict is committed. Node is v24 from the codex runtime, every command was wrapped in `timeout 600`, and each command's exit code was captured to a file.

| # | Command / probe | Result | Covers |
|---|---|---|---|
| 1 | `probe-deletion-boundaries.ts` (own probe, temp fixtures, real unlink of fixtures only) | exit 0, 16 OK, 1 SKIP | C1, C6 |
| 2 | Mutation M1 (`mutate-agefloor.sh`): `now - cap <= PURGE_AFTER_DAYS*DAY_MS` changed to `<= 0` | killed by both checks; restored with head-fidelity OK | C1 |
| 3 | `retention-purge.test.ts` baseline on HEAD bytes | 12/12 | C1 |
| 4 | `status.test.ts` + `writer-consumer.test.ts` (API) | exit 0, 6/6, 238 s | C3, C4 |
| 5 | `probe-api.ts` (own probe, real auth+router+store, loopback) | exit 0, 15/15 | C3, C4 |
| 6 | `schedule-retention-purge.test.mjs` (pwsh preview/refusal only; nothing registered or run) | exit 0, 7/7 | C6 |
| 7 | `retention-processed-proof.test.ts` + `private-summary.test.ts` | exit 0, 16/16 | C2, C3 writer |
| 8 | `retention-live.test.ts` (real ffmpeg/ffprobe on disposable lavfi fixtures), independently re-run | exit 0, 23/23, skipped 0, 50 s | C2 |
| 9 | `python contracts/verify_contracts.py` | exit 0, "no frozen contracts yet -- PASS by vacuity" (empty registry: no contract assurance) | C7 |

Probe 1 checked these boundaries:

- P1: dry-run is the default (no unlink, WOULD-PURGE printed).
- P2, P2b, P2c:
  - Execute without a clip extractor is refused (exit 2).
  - A repeated `--execute` is a usage error.
  - `--execute=1` and `--EXECUTE` do not delete.
- P3: execute deletes only the named media. Every text file survives: source, session, claims and turns json, plus .vtt/.json siblings. The pre-existing `evidence-clips/prior.mp4` and the newly written clip both survive. The clip window is {tStart 85, tEnd 125} for turn 100-110, which is ±15 s.
- P3b: a clip-extraction failure keeps the media.
- P3c: a .json file named by source.json is never deleted.
- P4: at 89 days and exactly 90 days the media is kept; at 91 days it is deleted (positive control).
- P4b: `--min-age-days 0.001` does not lower the 90-day floor.
- P4c: min-age values 0, -5, NaN and Infinity are refused (exit 2).
- P4d: a future capture time is kept.
- P5, P5b, P5c: `../`, absolute and backslash traversal are all refused, and the outside file survives.
- P6: a junction inside the media root that points outside gives `KEPT reason=media-path-outside-root`, and the outside file survives.
- P6c: a foreign tenant's old media is not deleted.
- **P6b was SKIPPED:** a file symlink could not be created (EPERM, no Developer Mode). File-symlink escape is not verified on this host. The source review shows that `probeMedia` realpath-checks against the realpath of the root.

Mutation M1:

- The mutation was applied once (anchor count 1).
- My probe failed it: P4 unlinked 3 and P4b deleted the media.
- `retention-purge.test.ts` failed it: "89 days is kept and 91 days is deleted; exactly 90 days is kept".
- The file was restored afterwards and its `git hash-object` equals HEAD blob 26552a44.
- Attempt 1 had a harness defect: the ERR trap restored the file early, so the purge test ran on restored code. Its output is kept as `m1-attempt1-*`, relabelled, and serves as the baseline in row 3. It is not counted as a kill.

Probe 5 checked these API cases:

- No credentials: 401.
- Wrong scope, or string scopes (the substring trap): 403.
- A forged `?tenant=`, `path=` or `X-LKB-Tenant` from the client is ignored, and only the caller's own data is returned.
- Sentinel extras are not leaked: reportFile, lines, transcript, apiKey, tenantId.
- The projection keys are exactly the allowlist.
- An absent tenant state returns never-run.
- A failed run returns null counts, not zeros.
- An incoherent dry-run with deleted>0, a negative count, an unsafe integer or a `__proto__` payload returns a bounded 503.
- There is no DELETE route (404).
- A server-derived hostile tenant `../t-b` is hashed into a sha256 directory and gives never-run, with no foreign leak.
- Run 1 had two probe-authoring defects (an A4 expectation and an A7 sort order). They were corrected and re-run, and run 1 is kept as `probe-api-run1-probe-defects.txt`.

**Environment gap, disclosed:** the lane has no `apps/api/node_modules`, so express is missing there. The API tests and probe were therefore run from the main tree's `apps/api`. I compared every tracked file under `packages/ingest/src`, `packages/core/src`, `apps/api/src/retention-status` and `apps/api/src/auth.ts`, lane against main, with `git hash-object`. They are byte-identical apart from two unrelated `packages/core/src/pipeline-graph/session-restart.*` files. The main worktree also has no diff against a9fac545 on the retention, API and auth paths.

**Source review:**

- `scripts/webinar/sync-session.mjs:244-266`: processedAt is stamped by `markSessionProcessedFromProof` only after `buildIndexer` completes, the source bytes are re-verified, and `index-proof.json` is written atomically. Failure sets the index status to failed.
- Both CLIs pass `realClipExtractor()`.
- `executePurge` refuses execute without `deps.clips` before planning.
- The PS1 throws on `-Execute` without `-ConfirmDeletion`, and adds `--execute` only behind `-Execute`.

## Findings / notes (low, EXPLANATION only; no new issues)

1. `packages/ingest/src/retention/retention-purge.ts:203`: the node CLI `retention-purge-cli.ts` deletes with the single flag `--execute`. The double gate (`-Execute -ConfirmDeletion`) exists only in `scripts/retention/schedule-retention-purge.ps1:39`. This matches the prior executor PASS and contract C6 ("existing flags intact"). Optional hardening: also require `--confirm-deletion` at CLI level.
2. `retention-purge.ts:122`: `absPath` is the lexical `resolve(mediaRoot, rel)` and is unlinked after the per-item re-check. A directory component swapped to a junction between the re-check and the unlink is a narrow TOCTOU window. Optional fix: unlink the realpath that `probeMedia` verified, re-verified immediately before unlink.
3. `--clip-padding-seconds` is operator-supplied (1..3600). D-008's ±15 s is a default the owner passes; it is not an enforced minimum. This is per ARCHITECTURE Q6.
4. ISS-T046PURGE-001 (low, open, the executor suite lacks a junction-escape test) remains open as a suite gap. My probe P6 independently shows that the executor refuses the junction escape. That probe is not a standing test.

## Ledger

- No ledger rows are flipped by this verdict.
- No issue fix is claimed in this cycle, so there are no D-015 reproductions to replay.
- The maker may close out this manifest as checked-PASS (scoped) only with the HELD gates above carried forward. T-046 must not be marked done.

## Reused versus independent

- **Independent:** rows 1-9 above.
- **Reused (not relied on for PASS):** the maker's receipts for 43/43 (`w16-t046ret-run1.txt`) and tsc exit 0 (`w16-t046ret-tsc.txt`, empty output). No source changed, so tsc was not re-run.
- **Not run:** the web RetentionSection/MeetingBotPage tests (C5), and any browser, scheduler, real purge or Mongo check.

## Accounting

- Maker usage is unknown, so the status is BOOTSTRAP_REVIEW and the ratio is unverified.
- Checker host token usage is not exposed (null). The debit is the 120k orchestrator allocation, and wall time was 1184 s including test waits under shared load.
- `review_budget.py assess` reports BOOTSTRAP_REVIEW, escalated, no limit exceeded (`metrics-assess.txt`). Attempt 1 had a schema error and is kept.
