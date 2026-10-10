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

---

# Cycle 1

VERDICT: PASS
Cycle checked: 1
Checked commit: 6afaf66

## Checks (independent)
1. D-015 replay of ISS-T044W-001's recorded reproduction, verbatim (`cp exact.json alias.json; node --import tsx ../../scripts/qa/transcript-qa-report.ts <S>/alias.json 20 --out <S>/./alias.json --overwrite`, cwd packages/ai): output `refusing to write the report over the input file`, exit 2, alias.json sha256 f4907bce041e... before and after, no report written. **ISS-T044W-001: 1/1 refused** (the row records one reproduction; further spellings below).
2. Regression test catches the original defect: mutation M0 (the `isSameFile(...)` call replaced by `outPath === opts.inputPath`, i.e. the pre-fix guard) makes `transcript-qa-report.test.ts` exit 1 (KILLED).
3. Spelling matrix, each run through the runner with `--out <spelling> --overwrite`, input = `<S>\d\Sub Dir\Alias.json`, input sha256 compared before and after (all unchanged):
| Spelling | Result |
|---|---|
| `.` segment, `..` segment, relative-to-cwd, double separators | refused (exit 2) |
| all upper, all lower, case differing in directory component only | refused |
| forward slashes, mixed slashes | refused |
| trailing dot / trailing space / `. . ` on file name | refused |
| trailing dot or space on a DIRECTORY component | not the input: Windows write fails ENOENT (exit 2), nothing written, input intact |
| hard link to the input | refused (inode) |
| junction to the input's directory, plus upper-case name with trailing dot via junction | refused |
| junction parent, output name differing only by case / trailing dot | refused |
| `\?\` prefixed | refused |
| UNC `\localhost\C$\...` and `\127.0.0.1\C$\...` (admin share reachable) | refused |
| `Alias.json::$DATA` | refused |
| `Alias.json:stream` (named alternate data stream) | NOT refused: exit 0, report written into the named stream (663 bytes); the file's default `:$DATA` stream is byte-identical (sha256 unchanged, length 101). Input content not replaced; see EXPLANATION |
| drive-relative `C:..\..\...\Alias.json` | refused |
| very long path (120 `x\..\` pairs), long `\?\` path | refused |
| `\.\` device path | refused |
| symlink | could not test: `cmd /c mklink` -> "You do not have sufficient privilege"; `fsutil 8dot3name query C:` -> "Error 5: Access is denied". 8.3 names also untestable. By code: `realpathSync.native` resolves symlinks and 8.3 short names through the OS (GetFinalPathNameByHandle), and the dev+inode comparison is a second net. |
4. TOCTOU: identity is checked, then the input is read, then `writeFileSync(..., {flag: "w"})` (or `wx` without overwrite) opens the output path directly: no temp-file-and-rename. A window exists in which the output path could be swapped to a link to the input. Low for an operator-run local tool (needs a concurrent local actor with write access to the target directory); noted only.
5. No regression: distinct output works (exit 0); existing report refused without --overwrite (exit 2); `--overwrite` replaces an old non-input report (verified content changed); directory as `--out` refused (exit 2, "output path is a directory"); usage error exit 2; FAIL verdict exit 1 (duration 0, malformed JSON `not json`, `{}`, empty file all FAIL exit 1).
6. Scope: `git show --stat 6afaf66` = transcript-qa-report.ts, its test, the manifest only; `git diff 6cbbee9 HEAD -- packages/ai/src/stt/transcript-qa.ts scripts` is empty (clamp and runner untouched; no D-119 reserved file touched).
7. Tests (timeout 180 s): transcript-qa-report.test.ts 15/15 pass; transcript-qa.test.ts 16/16 pass; `tsc --noEmit -p packages/ai` exit 0.
8. Cycle-0 behaviour holds: hand fixture duration 20: exact -> `PASS in=2 out=2 clamped=0 dropped=0`; 20.4 overshoot -> `in=1 out=1 clamped=1 dropped=0`; three turns >= 20 -> `in=4 out=1 clamped=0 dropped=3`; three malformed inputs FAIL exit 1.

## Mutations (per-mutation byte backup, restore in finally, 120 s timeout per run)
| Mutation | Result |
|---|---|
| M0 identity check back to string equality (pre-fix) | KILLED |
| M1 `isSameFile` always false | KILLED |
| M2 drop the device+inode comparison | KILLED (hard-link test) |
| M3 drop win32 case folding | SURVIVED: equivalent mutant, because `realpathSync.native` already returns the on-disk case for any existing path, and a non-existent output can never be the input |
HEAD fidelity after all mutations: `git hash-object packages/ai/src/stt/transcript-qa-report.ts` = 6ad07635d8f2fceb0d7e043d8a2edf9addfed67d = `git rev-parse HEAD:` of the same path; restore confirmed byte-equal after every mutation; `git status --short` clean of source changes.

ISSUES-WRITTEN: none (ISS-T044W-001 set to verified in qa/issues.t044w.jsonl)

EXPLANATION:
The identity check now resolves real paths (and falls back to dev+inode), runs before anything is read or written, and I could not construct a spelling that lets the report replace the input on this machine. The recorded reproduction is refused verbatim, and the new regression test fails on the pre-fix guard. Low notes, not backlog: (a) `--out file:stream` writes the report into a named alternate data stream of the input file; the input's content is not replaced or altered, but the file gains a hidden stream; an operator would have to type that spelling on purpose. (b) The check-to-write TOCTOU window described above. (c) Symlink and 8.3 spellings were untestable without privilege; judged from code only.
