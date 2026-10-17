# Verdict: retention-ruling5

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 42a50b648d98d347faeb86c5e046c436fd33d08f
Base SHA: 9e55b642
Lane: lane/w17-retention (C:\Users\product\Desktop\KnowledgeBase-lanes\w17-retention)
Sub-verdict 1d87bb51acf0b2d71f2915d47e05b3df122209d5 (lane/w17-retentionapi, retention-ruling5-api-consumer, cycle 0): PASS
ISSUES-WRITTEN: none
Ledger rows may be flipped: no ledger rows are named by this unit, so nothing needs flipping. The maker may close out the manifest as checked-PASS.
Checker: independent checker (Opus 5.5), fresh context, 2026-10-17. No real purge was run. `--execute` was used only inside test temp fixtures.

## Identity
- `git rev-parse HEAD` in the lane returned 42a50b64... both before review and before writing this file. `git diff HEAD` was empty; the only untracked item is the checker's own `qa/evidence/retention-ruling5-checker/`.
- 9e55b642 is an ancestor of the candidate (one commit). Diff: 10 files, +212/-50, which matches the packet.
- 1d87bb51 has 42a50b64 as its ancestor (one commit). Diff: 2 files (`writer-consumer.test.ts` +2/-2, plus a new manifest).

## Authority
Ruling 5 (wave2-rules.md, Approver Umesh 2026-10-17) sets min-age-days=90 and clip-padding-seconds=15. Agents run dry-runs only. No qa/contracts clause covers these CLI rules: purge-retention-policy.md covers only the pure core functions. No contracts were edited.

## Findings by brief item
1. **No path deletes without both flags.**
   - Repo-wide grep finds exactly one caller of `executePurge`: `runRetentionPurge` (retention-purge.ts:229).
   - `runRetentionPurge` and `runPurgeJob` both gate through `parsePurgeArgs` (retention-purge.ts:210-220; retention-purge-job.ts:85).
   - `retention-purge-cli.ts` reaches the purge through `runRetentionPurge`. `retention-purge-job-cli.ts` reaches it through `runPurgeJob`.
   - The ps1 launcher throws at line 39 when -Execute is set without -ConfirmDeletion. It appends `--execute --confirm-deletion` only behind `$Execute` (line 60), and the task definition appends -Execute -ConfirmDeletion only behind `$Execute`.
   - No production consumer exists in apps/api. `hosting.ts` reads only `LKB_RETENTION_DATA_ROOT` for the status reader. The only apps/api caller is `writer-consumer.test.ts`.
2. **The floors cannot be bypassed.**
   - No env var or config file feeds the thresholds. Only `LKB_RETENTION_DATA_ROOT` and `LKB_RETENTION_LAST_RUN` are read, and both are path bindings.
   - Probe (scratchpad r5/probe-args.log). These were refused: `--min-age-days=7`, `--clip-padding-seconds=5`, `--min-age-days 7`, `89.999`, `-7`, `7e1`, `--MIN-AGE-DAYS`, `-min-age-days`, `--execute=1`, `--execute=true --confirm-deletion`, `--execute --confirm-deletion=yes`, `--EXECUTE`, and `--execute` alone. With no threshold given, the defaults resolve to 90/15.
   - In the ps1, the regex check is followed by an InvariantCulture `[double]` floor check. The default is '90'/'15'.
3. **The late-veto test exercises the new re-check.** Mutation M3 replaced the final `last.candidates.find` with the earlier `c`. Only that test failed.
4. **The removed test was obsolete.**
   - It asserted that an omitted threshold exits 2, which ruling 5 reverses. It was replaced by "job: thresholds default to 90 / 15 and below-floor values are refused".
   - The report-mode no-default test (retention-report.test.ts:31) still passes.
5. **The cross-package consumer break is confirmed at 42a50b64.**
   - The probe ran writer-consumer's exact call with `baseArgs` (min-age 7). Result: exit 2, "--min-age-days must be at least 90 for a purge", so `assert.equal(code, 0)` would fail.
   - With `purgeBaseArgs` the same call exits 0.
   - No production caller passes a value below 90. The fix is 1d87bb51 (below).

## Commands (each exit code captured to its own file under the scratchpad's r5/ folder)
| Command (cwd packages/ingest unless noted; node v24.19.0; all `timeout 600`) | Exit | Result |
|---|---|---|
| node --test --test-force-exit --import tsx src/retention/retention-purge.test.ts | 0 | 16/16 |
| ... retention-purge-job.test.ts | 0 | 12/12 |
| ... retention-report.safety.test.ts | 0 | 4/4 |
| ... retention-report.guards.test.ts | 0 | 9/9 |
| ... retention-report.test.ts | 0 | 12/12 (no-default report test passes) |
| tsc --noEmit -p tsconfig.json | 0 | clean |
| node --test scripts/retention/schedule-retention-purge.test.mjs (lane root) | 0 | 7/7 |
| apps/api writer-consumer.test.ts @42a50b64 lane | 1 | env gap: no apps/api node_modules in this lane (express). Covered by the probe. |

- The ps1 test was read before it was run. Under the candidate it exercises only preview and refusal paths: -Run/-InstallTask with -Execute and no -ConfirmDeletion throw at line 39.
- After the run, `Get-ScheduledTask Vidysea-Retention-Purge` returned a count of 0.

## Mutations (D-020 plus the per-mutation amendment)
- Harness: `qa/evidence/retention-ruling5-checker/mutate.sh` (lane, untracked, not committed). Each mutation took a fresh byte backup right before it was applied, set a trap on EXIT/INT/TERM/ERR, ran under `timeout 600`, and was checked with `cmp`. Each ended with `git hash-object` equal to the HEAD blob.

| ID | Mutation | Result | Restore |
|---|---|---|---|
| M1 | `--execute` alone allowed (`false &&` on retention-purge.ts:217) | FAILED "--execute WITHOUT --confirm-deletion refuses..." (15 pass/1 fail) | HEAD 99ac1ace ok |
| M2 | floor lowered to 7 (retention-report-args.ts:76) | FAILED "defaults are 90 days / 15 s...; below the floors is refused" | HEAD 8d6f2234 ok |
| M3 (extra, item 3) | final re-check removed | FAILED "a veto that appears AFTER clip extraction..." | HEAD 99ac1ace ok |

## Sub-verdict 1d87bb51 (w17-retentionapi): PASS
- **Test-only.** It swaps the `baseArgs` import and call for `purgeBaseArgs`. No assertion changes and no `--execute` is added. Packages/ingest is byte-identical to 42a50b64.
- `timeout 600 node --test --import tsx src/retention-status/writer-consumer.test.ts` (apps/api) returned exit 0, 2/2 passing.
- An earlier run with `--test-force-exit` passed 2/2 tests but then crashed at process exit with a libuv `UV_HANDLE_CLOSING` assertion (src\win\async.c:94). That is a runtime and harness issue, not a test failure.
- apps/api `tsc --noEmit` returned exit 0.

## EXPLANATION (low notes, not filed)
- Residual TOCTOU between the final re-check and unlink is acknowledged in the manifest. Closing it needs a quarantine-rename design.
- The doc headers in retention-purge-cli.ts:3 and retention-purge-job-cli.ts:3 still say "DRY RUN unless `--execute`". `PURGE_USAGE` inherits the report's "there is no default" line before adding the ruling-5 lines. These are doc-only; fix them alongside the existing ISS-W046-001 by the next unit that touches these files.

## Not verified
- retention-live.test.ts was changed (withConfirm helper only) but not run, because it uses real ffmpeg. It typechecks.
- The checker-skill `review_budget.py assess` was not run. Maker usage is unknown and checker tokens are unknown (null), so the efficiency ratio is unverified. Measured command time is about 230 s in total.
