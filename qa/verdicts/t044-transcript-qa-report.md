# Verdict: t044-transcript-qa-report

VERDICT: FAIL
Cycle checked: 0
Checked commit: 15e528e
Seam note: clamp seam PASSes = 1 (cap 2); this finding touches a data write (report overwriting input), so it is not cap-limited.

## Checks (independent unless stated)
1. Scope: `git show --stat 15e528e` = 4 new files (test, impl, manifest, runner); no reserved/contract/other file edited. OK.
2. No duplicate clamp logic: report built from `clampAndValidateTurns` output; remainingViolations is a re-check on its output. PASS impossible when remainingViolations non-empty unless that check is removed (see mutations). OK.
3. Fail closed (runner, `--out` to temp): duration 0 / -5 / NaN / Infinity / abc / "" => FAIL exit 1; missing duration => exit 2; non-array object, empty file, malformed JSON, nonexistent path, directory as input, non-object turns, non-numeric start, missing tEnd => FAIL exit 1; 26 MB / 800001-turn file handled in 2.4 s. Only tEnd<tStart gives PASS (clamped to zero-length, reported as clamped; documented clamp behaviour, low).
4. Input unmodified (real.json sha256 e831dc37... identical before/after). Existing report refused without --overwrite (sentinel preserved, exit 2). Exit codes 0/1/2 confirmed. DEFECT: --out equal to the input only by string is refused; `--out <S>/./alias.json --overwrite` overwrote the input (ISS-T044W-001).
5. Hand fixtures (duration 20): exact end -> PASS in2 out2 clamped0 dropped0; 20.4 overshoot -> in2 out2 clamped1 dropped0; three turns starting >=20 -> in4 out1 clamped0 dropped3 (indices 1,2,3, hallucination true), remainingViolations [] in all. Matches hand computation.
6. `node --test` report tests 11/11 pass; clamp tests 16/16 pass; `tsc --noEmit -p packages/ai` exit 0; runner type-checked via a scratch tsconfig (files: runner only) exit 0.
7. Mutations (per-mutation byte backup, finally-restore, 120 s timeout):
| Mutation | Result |
|---|---|
| PASS when remainingViolations non-empty | SURVIVED (check unreachable through the real clamp; defence-in-depth, no test injects a faulty clamp) |
| accept non-positive duration at report layer | SURVIVED (clamp's own durationValid still yields FAIL; equivalent) |
| skip overwrite refusal | KILLED |
| miscount dropped (slice(1)) | KILLED |
| (extra) delete remainingViolations loop | SURVIVED (same reason as first) |
Hash fidelity afterwards: transcript-qa-report.ts ec51598a97e1669c81b58e63c2f1319be6bd852e, .test.ts bc569154cf89c762f7c7b5c4290e5558c1b45f31, runner 248447efff9f7e8e5db12da54ca42e0d1602b83c; each equals `git rev-parse HEAD:<file>`.
8. Manifest evidence reproduced: real sample copy 3080 -> `PASS in=51 out=51 clamped=0 dropped=0`; 2900 -> `PASS in=51 out=40 clamped=1 dropped=11`; copy hash unchanged.

ISSUES-WRITTEN: ISS-T044W-001 (medium, qa/issues.t044w.jsonl)

EXPLANATION:
Everything but one guard holds. The "refuse to write over the input" check compares path strings, so a differently spelled path to the same file with --overwrite replaces the turns file with the report, contradicting the unit's "never modifies the input" claim; the test only covers the identical-string case. Fix: compare resolved/real paths (or dev+ino) and add a regression test. Low notes (not backlog): tEnd<tStart yields PASS with a clamped entry; dropping turns that start at or after the duration is PASS by design; remainingViolations and the duration guard are defence-in-depth not exercised by tests. Cycle 1 should re-run ISS-T044W-001's repro verbatim.
