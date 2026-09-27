# Verdict — u2-fix2-reingest-same-id

**Cycle checked:** 1
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (this session), read-only toward the lane tree
**Bound to:** D:\KnowledgeBase (lane worktree D:\KnowledgeBase-lanes\u2-fix2-reingest-same-id, branch wave/u2-fix2-reingest-same-id, commit cf28a8c, base master 9222ef6)
**Ground truth:** ISS-314's row in `qa/issues.jsonl` (repro + `fix_direction`) + `qa/watch/reingest-2026-09-27-postmerge.log` — no `qa/contracts/u2-source-watcher.md` exists, per manifest header.

## VERDICT: PASS

## SCOREBOARD
5/5 manifest claims evidenced, 0/0 formal contract criteria (none exists — judged against ISS-314's own row per D-015), all invariants named in the dispatch hold.

## What I re-ran myself (not trusted from the manifest)

- `node --test scripts/watch/lib/ingest-chain.test.mjs` in the lane → **22/22 pass**, matching the manifest's pasted output verbatim (test names + counts).
- `node --test scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs scripts/watch/lib/session-skeleton.test.mjs` → **23/23 pass**, no collateral breakage in untouched sibling libs.
- `node --check scripts/watch/run-watch.mjs` / `scripts/watch/lib/ingest-chain.mjs` → both syntax-OK.
- **RED proof, reproduced independently** (not trusted from the manifest's pasted output): copied both files to scratch, `git show 9222ef6:...` restored master's pre-fix versions in place, wrapped in a `trap ... EXIT ERR INT TERM` restore-from-backup (D-020), ran the new test file → `SyntaxError: The requested module './ingest-chain.mjs' does not provide an export named 'decideReingestAction'`, 1 fail. `cmp` after restore printed `RESTORE-OK-1` / `RESTORE-OK-2` for both files — byte-identical, confirming the trap fired cleanly and nothing was left mutated in the working tree.
- Working tree confirmed clean (`git status --short` empty) both before and after every mutation round.

## Capability coverage — 2/2 spot-checked rows reproduced by my own falsifying edits (not the manifest's)

Per SKILL.md 4b, I made my own single-hunk edits (not the manifest's cells) to two of the five claimed rows, in the lane's real tree, always restored via a byte-`cmp`-verified trap before the next step:

1. **`decideReingestAction`'s reindex-only branch.** Edited the guard `oldSessionId === correctSessionId` → `false`. Re-ran the suite: exactly one test went red — `decideReingestAction: ISS-314's own reproduction (same id, 41 turns, 0 chunks) -> reindex-only, NOT reingest` — expected `'reindex-only'`, got the fallthrough. All 21 other tests stayed green. Restored, `cmp` confirmed byte-identical.
2. **`resolveSessionIdForIngest`'s collision refusal.** Edited `if (existingDriveFileId === fileId)` → `if (false)`. Re-ran the suite: exactly one test went red — `resolveSessionIdForIngest: dir exists for THIS SAME Drive file (ISS-314 collision) -> refuses, does not fork`. All others stayed green. Restored, `cmp` confirmed byte-identical.

Both edits isolate the assertion they claim to isolate (not a broken-import false red). The other 3 claimed rows (different-file fork unchanged, different-id/no-prior-row unchanged, unreadable-source.json falls through) are covered by the same test file's green run plus the RED proof above and were not independently re-falsified given the scope of this check; I read them and find the assertions match the claims.

## CAPABILITY-COVERAGE: 2/5 rows independently reproduced by the checker (3/5 read-verified, not independently falsified) — no gaps found

## Diff scope (step 4c)

`git diff 9222ef6..cf28a8c --stat`: `qa/manifests/u2-fix2-reingest-same-id.md`, `scripts/watch/lib/ingest-chain.mjs`, `scripts/watch/lib/ingest-chain.test.mjs`, `scripts/watch/run-watch.mjs` — exactly the manifest's "What changed" list, nothing else. No existing function, export, test, or config key was deleted or renamed. The only code motion is `oldSessionId` resolution moving earlier in `runReingest` (read-only Mongo lookups); the delete-if-different-id block (lines ~397-434) is byte-for-byte the same logic as master's, confirmed by reading the diff hunk boundaries.

## Adversarial trace of the live post-merge scenario (per dispatch; no live command run — no Mongo/Drive access used, traced from the given production facts + code reading only)

Given: `lkb/toc` `sessions._id = "2026-09-24-in-focus"` with 41 turns, 0 chunks; `data/toc-migrated/2026-09-24-in-focus/turns.json` present (confirmed on disk: `source.json` there carries `_id: "gdrive-1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri"`, matching the driveFileId in ISS-314's repro exactly); `watch_state` status `"failed"`.

Tracing `runReingest` against this state: `correctSessionId` derives to `"2026-09-24-in-focus"` (matches the dir that already has `turns.json` → `turnsExist = true`). `oldSource` lookup finds the `sources` row for this exact driveFileId; the linked session's `_id` is `"2026-09-24-in-focus"` (same dir/data), so `oldSessionId === correctSessionId`. `turnCount = 41`, `chunkCount = 0` (given). `decideReingestAction({turnsExist:true, turnCount:41, chunkCount:0, oldSessionId:"2026-09-24-in-focus", correctSessionId:"2026-09-24-in-focus"})` → hits the second branch exactly → **`{action:"reindex-only"}`**. This confirms the manifest's claimed end-to-end outcome for the exact state named in the dispatch: no re-download, no ffmpeg, no re-seed, no delete — only `buildIndexer()(TENANT, correctSessionId)` + `assertIndexed` + `markDriveState(..., "ingested", ...)` on success.

## FAILURES (if any): none against this unit's own claims

## New finding filed (does not block this unit's PASS — outside ISS-314's own repro/fix_direction, but real)

**ISS-316** (medium, filed to `D:\KnowledgeBase\qa\issues.jsonl`, committed `a24d373`): the new `reindex-only` branch in `runReingest` (`scripts/watch/run-watch.mjs:381-395`) has **no try/catch**. `main()` calls `runReingest` bare (`run-watch.mjs:148`, no surrounding try/catch), and the file's only top-level handler (`main().catch(...)`, EOF) merely logs and `process.exit(1)` — it never calls `markDriveState`. So if `buildIndexer()` or `assertIndexed()` throws inside this branch (e.g. a genuine embedder/indexing failure — `assertIndexed` correctly still tolerates the legitimate `skipped: "no-embedder"` state, confirmed by reading `ingest-chain.mjs:53-59` and its own passing test), `watch_state` is **never marked `"failed"` with a `failureReason`** for that attempt — unlike the sibling full-chain path four lines below (`run-watch.mjs:441-452`, explicit try/catch → `markDriveState(driveFileId, "failed", {failureReason: reason})`), and unlike `ingest-chain.mjs`'s own file-header contract ("Throws on any failure; the caller … records watch_state status failed … this module never swallows an error or marks anything itself" — `ingest-chain.mjs:10-11`). This does not affect ISS-314's own filed reproduction (that repro's `buildIndexer` call succeeds, per the trace above), so it does not fail this unit's stated criteria, but it is a real asymmetry worth a follow-up unit per the fix_direction filed on the row.

Two narrower edge cases considered and **not** filed (below the >80% confidence bar for a FAILURES/ledger line, per SKILL.md's "only findings you'd defend at >80%" rule):
- `resolveSessionIdForIngest` falls through to fork when an existing dir's `source.json` is missing/unreadable — deliberate and disclosed in the code's own comment; would only become a live E11000 risk in the narrow case where Mongo's `sources` row for that exact file already exists despite a missing/corrupt `source.json` on disk (a partial-write ordering not covered by ISS-314's own repro, which has a valid `source.json`).
- A stale local dir whose `source.json` still names the current file but whose Mongo rows were separately removed out-of-band — `resolveSessionIdForIngest` would refuse (assuming a repair is needed), and `decideReingestAction` would not reach `reindex-only` (Mongo `turnCount` would read 0), falling through to a normal reingest that re-hits the same refusal inside `ingestOneDriveFile`'s try/catch (correctly marked `failed`, not silent) — a functional regression only versus the old code's wasteful-but-working fork, and only reachable via an out-of-band Mongo edit this project's own tooling doesn't perform.

## CAPABILITY-COVERAGE: 2/5 rows reproduced by checker's own edits (see above)
## LIVE-BROWSER: not-applicable (CLI script, no UI surface touched — `data/toc-migrated/`, `scripts/watch/**` only)
## ISSUES-WRITTEN: ISS-316
## EXECUTOR: claude-sonnet-subagent (manifest) — checker: claude-sonnet-subagent (fresh subagent, self != executor, no ANTHROPIC_BASE_URL override)
## EXPLANATION

Both new pure functions (`decideReingestAction`, `resolveSessionIdForIngest`) do exactly what ISS-314's row asked: the exact-repro case (same id, turns>0, chunks=0) now takes a narrow reindex-only path that never re-downloads/re-transcribes/re-seeds, and the id-fork guard refuses only the exact-file collision while leaving the legitimate different-file-same-date+title fork untouched. I reproduced the RED proof, two capability-coverage falsifications, and the full test suite independently rather than trusting the manifest's pasted output, and all matched. The diff touches exactly the four files the manifest names, with the delete-if-different-id block provably unchanged. I traced the exact post-merge production scenario named in the dispatch by reading the code against the given Mongo/disk state (no live Mongo/Drive access used) and confirmed it now resolves to `reindex-only`, matching the manifest's claim. The one real gap I found — missing try/catch around the reindex-only branch's own two calls, breaking this file's own documented failure-handling contract — does not undermine ISS-314's fix and is filed as ISS-316 (medium) rather than blocking this PASS, per this repo's severity gate (medium = ledger entry, verified in the next unit touching this file, not a blocker).
