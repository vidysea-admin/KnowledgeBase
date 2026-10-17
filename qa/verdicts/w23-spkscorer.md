# Verdict: w23-spkscorer

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 9243679f820ba0f2f10212e60c53c4f0f0d6aae1
Base: 3c99337f

## Findings
1. REQUIRED FIX (ISS-290): `corpus-lock.mjs` verifyCorpus (line ~30) only prints "ISS-290 NOTE" for unpinned positional sessions. The row's recorded `fix_direction` says "failing loudly when data/toc-migrated contains a positional session absent from it". That is the recorded fix_direction, not new owner policy, so the maker's "policy choice" deferral is not accepted. Fix: throw in verifyCorpus when `unpinned.length` (or add an explicit `allowUnpinned` opt-in with the throw as default), plus a test. Live run: 6 unpinned positional sessions are in scope and are only noted. Also still on live glob: 02-dump-blocks, 03-dump-compact, 06-window-count (fix_direction says harness read the pinned list).
2. Note (low, not a row): bar4 `callsExpected` counts 0 for a pinned session with no runs; `measurable` is still false, so no wrong verdict.
3. Note: mutation M1 (production import added) failed the test file at module load (no tsx), not via the named independence assertion; the assertion is a regex over source, adequate for direct imports only. Transitive grep done by hand: citation-check imports only suggest-score-lib.mjs, which has no imports.

## Verified independently
- ISS-289: imports transitively clean. 05-score before/after (base vs candidate, tags default, c2r, c3r, c6r with raw-tag c1): relationalInvalid arrays byte-equal (8,0,0,0). 2/2 recorded leeds t088 citations flagged.
- ISS-283: rule correct (3 outer runs and providerCalls==windows*3 required). Default recorded run: 957/2340 calls, measurable false, allStable false. c2r/c3r/c6r: 2340/2340, measurable true. Live runs not executed, so the row stays open.
- ISS-290: 01-block-stats prints 494/240/29. gold-labels.json and corpus.lock.json unchanged vs base (diff empty).
- Tests: 17/17 pass (timeout 600, exit 0).
- Mutations (per-mutation backup, trap, `-c core.autocrlf=true` hash-object == HEAD blob, cmp ok): M1 import production rules: test file fails; M2 `||` instead of `&&` on ok: 2 named tests fail. Restored, hash 2058aaf5.
- Not run: lint-loc, full suites, live provider runs.

## Ledger rows
- ISS-289: acceptance met; MAY flip to verified at close-out.
- ISS-283: stays open (live runs required).
- ISS-290: stays open until Finding 1 is fixed (cycle 1).

ISSUES-WRITTEN: none
