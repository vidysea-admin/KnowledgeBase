# Verdict: loc401-speaker-name-rules-test-split

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Verbatim: all 110 lines removed from speaker-name-rules.test.ts appear in speaker-name-rules-place.test.ts. Top-level test() count 18 before, 10 + 8 after. 110 cases (87 + 23) run before and after: 110/110 pass.
- Glob: package script is `src/**/*.test.ts`, so it picks up the new file. CI runs `pnpm -r test`.
- D-015 ISS-104 byte-fidelity test stays in the original file (line 200) and passes.
- Full packages/index suite: tests 635, pass 635, fail 0.
- `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed). Original file is now 317 lines.

ISSUES-WRITTEN: none
