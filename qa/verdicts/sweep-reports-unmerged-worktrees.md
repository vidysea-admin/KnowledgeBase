# Verdict — sweep-reports-unmerged-worktrees

VERDICT: PASS
Cycle checked: 0
Scope: commit 176dbd4 (scripts/qa/unmerged-worktrees.mjs, its test, scripts/tracker-audit.mjs, package.json) against the qa/QUEUE.md row: make the unmerged-worktree commit count appear every tick.

## Independent results
Node from the codex runtime; every test command under `timeout`.
- `node --test scripts/qa/unmerged-worktrees.test.mjs scripts/lib/tracker-audit.test.mjs` -> tests 21, pass 21, fail 0.
- `node scripts/tracker-audit.mjs --gate g1` -> `tracker-audit: OK (gate G1)`, exit 0, no report lines.
- `node scripts/tracker-audit.mjs` (live) -> 8 pre-existing G2/G3/G4 findings, then `unmerged-worktrees: 154 commit(s) across 4 of 4 worktree(s) not on origin/master (report only, not a gate)` plus four per-branch lines (55/40/40/19). Matches the manifest (153 then; main branch gained one commit since). Exit code is driven only by `findings.length`.

## Report-only
Git subcommands invoked, all read-only: `git worktree list --porcelain`, `git rev-parse --verify --quiet <ref>^{commit}`, `git rev-list --count <base>..<tip>`. No merge, rebase, fetch, checkout, branch -d or worktree remove. In tracker-audit.mjs the report is computed before output and printed after; `process.exit(findings.length === 0 ? 0 : 1)` is unchanged. The real-repo test also asserts `git branch -a -v` is identical before and after.

## Awkward inputs (by reading the code)
- No local master: falls back to origin/master; neither exists -> `UNAVAILABLE (no master or origin/master ref...)` (tested).
- Detached HEAD: tip is the sha, label `(detached abc1234)`.
- Path with spaces: porcelain lines are sliced after the `worktree ` prefix, so spaces survive.
- Pruned/missing worktree: still listed by git; the branch count still works.
- Git failure: `worktree list` failure -> UNAVAILABLE with first error line; per-worktree rev-list failure -> `count failed`, not 0. No throw path.

## Mutation check (per-mutation byte backup in scratchpad, 90 s timeout, restore after each, HEAD hash check at end)
- M1 reverse the range to `tip..base` -> killed (exit 1).
- M2 filter `ahead !== 0` -> `>= 0` plus fixture ahead 0 -> 1 -> killed.
- M3 drop `master` from the base candidates -> killed.
Final `git hash-object scripts/qa/unmerged-worktrees.mjs` = a08d1e7563c55e39d0957b99c5287397c67c3a80 = `git rev-parse HEAD:scripts/qa/unmerged-worktrees.mjs`. No other file was touched.

## Manifest evidence
Matches what I observed (21/21, g1 OK exit 0, report lines present with live counts).

ISSUES-WRITTEN: none

EXPLANATION: The unit does what the row asks and no more. Notes, not filed:
- It surfaces the count on tracker-audit runs, not in the session-start hook (an enforcement path the manifest declares off limits).
- It prints nothing when `--gate` is passed (deliberate; keeps lint:structure output unchanged).
- With no local master it compares against origin/master, which may be stale; the output says which base it used.
