# Manifest — catalogue-cli-clean-check

**Contract:** qa/contracts/catalogue-progress-score.md (not itself a criterion, but this is the
same "leaves the repo clean" invariant ISS-046 established, extended to cover a gap in its own
enforcement)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-064

## Why

ISS-064 (filed by the checker, REPRODUCED not just reported): running `pnpm test:lint` left
`M docs/PROGRESS.md` in `git status` where there had been none before — the checker had to
`git checkout -- docs/PROGRESS.md` to restore it. The maker disclosed this itself under "a
correction I owe" and left the filing decision to the checker; the checker filed it because a
lint that mutates tracked files on failure means one run's residue gets misread as the next
run's finding — exactly the kind of near-miss recorded elsewhere in this session's history.

**Root cause found on inspection**, more specific than the checker's own note: the existing
`"the suite leaves the repo clean — no tracked file is left modified"` test in
`scripts/catalogue-cli.test.mjs` computed `dirty` (a `git status --porcelain` string) over
**all three** watched paths (`docs/PROGRESS.md`, `.goal/catalogue.json`,
`apps/web/src/App.tsx`) for its error MESSAGE, but only asserted `contentChanged` (a
`git diff --quiet HEAD --` exit code) over **two** of them — `docs/PROGRESS.md` was never in
the actual pass/fail check, only in the string used to describe a failure that could never fire
for that specific file. A test whose own cleanliness gate silently excludes the file most likely
to be left dirty is precisely a "happy path only" test.

## What changed

**`scripts/catalogue-cli.test.mjs`**:
1. Extracted the check into a shared `watchedInputsClean()` function that runs `git diff --quiet
   HEAD --` over **all three** `RESTORE_WATCHED` paths (including `docs/PROGRESS.md`, the one
   that was missing), returning `{clean, dirty}`.
2. The existing `"leaves the repo clean"` test now calls `watchedInputsClean()` instead of
   re-deriving its own (incomplete) check inline.
3. Added a **suite-level safety net**: `RESTORE_WATCHED` paths are snapshotted at module load
   (before any test runs) and force-restored in an `after()` hook, regardless of which
   individual test passed, failed, or threw before its own `finally` ran. Each test's own
   try/finally is unchanged and still the first line of defense; this is the second line for the
   case a test's own cleanup path itself doesn't run to completion — the "cleanup path, not just
   the happy path" the checker's evidence named.
4. Added a new regression test,
   `"the cleanliness check itself catches a dirtied docs/PROGRESS.md (ISS-064 regression)"`,
   which deliberately dirties `docs/PROGRESS.md`, calls the SAME `watchedInputsClean()` the real
   gate uses, and asserts it now reports `clean: false`. Restores the file in a `finally`.

## Evidence

Full suite green (13/13, `node --test scripts/catalogue-cli.test.mjs`; 54/54 across
`pnpm test:lint`).

**Mutation-tested with proof of application — this one caught a real false-green trap on the
first attempt**, same shape as `tracker-audit-g1-gate`'s earlier catch this session:
1. First draft of the new regression test called its OWN inline
   `spawnSync("git", ["diff", "--quiet", "HEAD", "--", ...RESTORE_WATCHED])` rather than the
   shared function. Mutating the real check (reverting it to the old two-path list) left the
   regression test GREEN — a duplicate re-derives correctness instead of exercising the fix, so
   a regression in the real logic would not have reddened anything. Caught before shipping by
   running the mutation test itself, not by inspection.
2. Fixed by extracting `watchedInputsClean()` and having both the real gate test and the new
   regression test call it.
3. Re-ran the mutation (reverted `watchedInputsClean`'s `contentChanged` call back to the old
   two-path `[".goal/catalogue.json", "apps/web/src/App.tsx"]` list, confirmed via `git diff`
   against a pre-mutation backup that the file content genuinely changed): **12/13 pass, exactly
   the new ISS-064 regression test reddened** (`AssertionError: a dirtied docs/PROGRESS.md must
   be caught... true !== false`). No other test affected.
4. Restored the fix from the pre-mutation backup, re-ran: 13/13 green.

`pnpm test:lint` (54/54), `pnpm lint:structure` (all gates clean, including the new
`tracker-audit: OK (gate G1)` line from the prior unit), `node scripts/catalogue-score.mjs`
(no diff to `docs/PROGRESS.md`, 20.2%/28.9%, 57 features) — this unit doesn't touch scoring
logic, only test hygiene.

## How to verify (checker)

1. Read `scripts/catalogue-cli.test.mjs` — confirm `watchedInputsClean()` exists, checks all
   three `RESTORE_WATCHED` paths, and both the "leaves the repo clean" test and the new
   regression test call it (not a duplicated inline check).
2. Confirm the `after()` suite-level restore hook exists and snapshots before any test runs.
3. Run `node --test scripts/catalogue-cli.test.mjs` — 13/13 green.
4. Reproduce the mutation: in `watchedInputsClean()`, revert the `git diff` path list back to
   `[".goal/catalogue.json", "apps/web/src/App.tsx"]` (dropping `docs/PROGRESS.md`), confirm via
   `git diff` the content changed, re-run, confirm exactly the ISS-064 regression test reddens,
   restore, confirm 13/13 green again.
5. Confirm `git status` is clean (no leftover `docs/PROGRESS.md` diff) both before and after
   running the full suite.
6. Ledger: ISS-064 should move to `fixed` with `fixed_date` set, citing this manifest.

## Risk / rollback

Pure test-code change, reversible by `git revert`. No production behavior touched — this fixes
the test suite's own cleanliness enforcement, not the CLI it tests.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
