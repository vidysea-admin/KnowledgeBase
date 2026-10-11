# Verdict: iss-depfix-dependency-lint
VERDICT: FAIL
Cycle checked: 0
Commit checked: 77c9653 (lane/depfix, from 816f48c)

## EXPLANATION
1. Routine execution (the real question): the moved test is NOT run by any routine command.
   - Before: apps/api `"test": node --test --import tsx "src/**/*.test.ts"` (run by `pnpm -r test`, CI step "Unit tests") picked it up.
   - After: `scripts/` is not a workspace package (pnpm-workspace.yaml: packages/*, apps/*, workers/*; no scripts/package.json). Root `test:lint` (CI step "Linter negative tests") lists files explicitly and includes only scripts/qa/unmerged-worktrees.test.ts-class entries (one scripts/qa file, a .mjs). `grep` over package.json, .github, all package.json files finds no reference to calendar-link-differential, join-rules-edit-api or calendar-optout-id-space.
   - It does pass when run by hand exactly as the apps/api glob did: `node --test --import tsx scripts/qa/calendar-link-differential.test.ts` gives tests 3, pass 3, fail 0 (same tsx loader).
   - So the guard that the API copy of the link recogniser agrees with the meeting-bot canonical one (a drift means API and bot disagree on trusted calendar links) is silently out of CI and every routine run. FAIL-level.
   - Required: add the file (with the same `node --test --import tsx` loader) to a routine command, e.g. append `scripts/qa/calendar-link-differential.test.ts` to root `test:lint` or add a `test:cross` script, and make sure ci.yml runs it (test:lint already runs in CI; tsx must resolve from root, check it does). A test pinned in the manifest evidence would show the CI-invoked command running it.
2. Same implementations, same cases: `git diff -M` shows only the rename, two import paths and the header comment. Imports are the real `recognise`/`resolveEventMeetingLink` and `planSendNow`. Bite: mutation of the apps/api copy `h.endsWith(".webex.com")` to `h.endsWith("webex.com")` makes 3/3 fail (restored, hash equals HEAD blob). A first mutation (an extra invented host) survived; this host is not in the corpus, a pre-existing recall limit, not a regression.
3. Convention: legitimate in principle, since scripts/ is outside the cruised roots and scripts/qa already holds two other cross-layer ts tests (join-rules-edit-api, calendar-optout-id-space, importing apps/api and packages/meeting-bot). But no verdict or decision approved the convention, and those two siblings have the same never-run gap (worth a note: they are unrun by routine commands too). Rule: a cross-layer test may live in scripts/qa only if a routine command runs it; otherwise the move is an evasion in effect, though not in intent. The smell (recogniser copy in apps/api because apps may not import meeting-bot; fix is moving the shared recogniser to packages/core) has no open ledger issue (only a header note); noted, not filed as a row.
4. scripts/ has no tsconfig; siblings are likewise untyped. tsx strips types, so type breakage is not caught, but a missing or renamed import fails at run time (once the test is actually run). Note only.
5. Gates: dependency stage `no dependency violations found (799 modules, 2733 dependencies cruised)`; apps/api tsc exit 0; calendar-link-extract tests 17/17; lint-dirsize OK (125 dirs; scripts/ stays at 32 files, file is in scripts/qa); lint-dupes OK; `git merge-tree` against codex/machine-migration-2026-10-09 clean (tree 9060d2494eff).

ISSUES-WRITTEN: none (the routine-run gap is the cycle-0 FAIL finding, fixed in-unit; not a ledger row)

## Merge conditions
Wire the moved test into a routine command and CI (item 1), paste the command and output, then recheck cycle 1.

## Cycle 1
VERDICT: PASS
Cycle checked: 1
Commit checked: 28ef664

- `test:lint` now runs `node --test --import tsx` and lists calendar-link-differential, join-rules-edit-api and calendar-optout-id-space. ci.yml unchanged (`git diff 816f48c 28ef664 -- .github` empty); CI runs `pnpm test:lint`.
- Exact command run once: `ℹ tests 136 / pass 136 / fail 0 / cancelled 0 / skipped 0`; the 3 differential test names appear in the output. 124 + 12 = 136, none skipped, none loaded twice.
- tsx is a declared root devDependency (package.json `tsx: 4.23.13`, present in pnpm-lock importers), so CI resolves it.
- Bite through the same invocation: copy's `endsWith("webex.com")` mutation gives pass 0, fail 3; restored, hash equals HEAD blob.
- Gates: dependency stage `no dependency violations found (799 modules, 2733 dependencies cruised)`; lint-dirsize OK (125 dirs); lint-dupes OK; `git merge-tree` against codex/machine-migration-2026-10-09 clean (tree df5ad578), no package.json conflict.
- ISS-DEPFIX-002 row is accurate; left at fixed-pending-check (status flip is the maker's close-out).

ISSUES-WRITTEN: none
Merge conditions: none beyond close-out. Note: the two sibling tests were also unrun before; now covered.
