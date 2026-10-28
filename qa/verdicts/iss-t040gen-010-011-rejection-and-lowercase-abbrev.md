# Verdict: iss-t040gen-010-011-rejection-and-lowercase-abbrev

VERDICT: PASS
Cycle checked: 1
Commit checked: af035e7d (lane/t040reject, on merge 9e0be9b8)
Scope: `sentence-span.ts` (`tailToStrongMark` + extended no-break rule), tests in `grounded-notes-sentence-span.test.ts`, one constant in `judge-rules.test.ts`. `dropUnverified` stays OFF by default.

## EXPLANATION

ISS-T040GEN-010, -011 and -012 are fixed and verified. One new medium defect, ISS-T040GEN-013 (a dead assertion the unit introduced in judge-rules.test.ts), is filed; it does not reopen the three.

1. D-015 ledger replays, re-run by me (own probe on `sentenceSpanProblem(text, s, s+len)` with the ledger rows' verbatim cases, null = ships):
   - ISS-T040GEN-010: 1/1 refused (`starts-mid-sentence`); plus the ledger's own elided variants univ./mgmt./pg.: 3/3 refused.
   - ISS-T040GEN-011: 3/3 refused (`retracted-by-reply`).
   - ISS-T040GEN-012: 3/3 refused (`ends-mid-sentence`). The maker's "2/2 + elided third" is faithful: the ledger elides the third as "... pvt. Colleges only if you apply early."; the cycle-0 verdict gives it as "Admission is open for pvt. Colleges only if you apply early." quote "Admission is open for pvt.", which I replayed.
   - Control (no marker either side) still breaks, recall rule intact.
2. Merge 9e0be9b8. `git diff 9e0be9b8^2 9e0be9b8` (main's side vs merge) shows only additions plus the signature changes of `sentenceSpanProblem`/`lexicalNegationProblem` and the SpanProblem union; main's `judged` option, the split-out `lexicalNegationProblem` and `resolveEvidence`'s judged path are intact, and `shortFollowWords` is threaded through `opts`. grounded-notes.test.ts is byte-identical to main's. In the moved test file, removed lines are only the lane's own fixture rewordings. Nothing from main is lost. 30/30 in the two grounded-notes files, judge-rules 9/9.
3. judge-rules.test.ts. The value 4 is correct and legitimate: running it prints `TOTAL: 4 shipped before` (-010 0/4, -012 0/3 now refused structurally, -011 3/3 caught by the rules, -009 1/6); the 7 that left are the abbreviation cases. BUT the edit wrote a literal backslash-n inside a `//` comment, so `assert.equal(laxBefore, 4, ...)` is dead code and the pinned count is no longer asserted at all. That is a weakening, though only of the count pin: the per-case assertion in the loop still runs. Filed as ISS-T040GEN-013.
4. Recall (for Umesh). Option ON: sentence recall 71.9% (base) -> 55.7% (cycle 0) -> 51.4% (cycle 1), clause 60.5% -> 49.1%, as reported by the maker; I did not re-measure. OFF is unchanged: `resolveEvidence`/`sentenceSpanProblem` are reachable only through the `dropUnverified` paths (drop-mode.ts, claims.ts `dropped ?`), and the full non-drop suites are green. The option is not wired live. Not a FAIL; the 71% figure no longer holds.
5. Suites: packages/index 673/673 (0 fail); apps/api 871/871 (D2_FIXTURE_PYTHON set); `tsc --noEmit -p packages/index` exit 0; `lint-loc --all` exit 0.
6. Mutations (own harness in the worktree, per-mutation byte backup, restore in `finally`, 240 s SIGKILL timeout, applied-hash checked, deleted after; 3 test files each): M1 drop the new tail clause KILLED (2); M2 tail returns "" KILLED (2); M3 SHORT_TOKEN_LETTERS 4->3 KILLED (2); M4 `||`->`&&` KILLED (3); M6 tail scan stops at first space KILLED (2); M5 tail slice drops its last char SURVIVED (a marker that is the final character of the tail is still matched by the shorter "no"/"not" prefix, so near-equivalent; low). Final `git hash-object sentence-span.ts` 49cee283 == `git rev-parse HEAD:` 49cee283.

ISSUES-WRITTEN: ISS-T040GEN-013
