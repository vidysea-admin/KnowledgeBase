# Verdict: budgetindex-structure-refactor

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Diff (git diff -M HEAD~1 HEAD): the lines removed from speakers-grounded.ts are all present verbatim in speaker-rules/speakers-grounding.ts. The only differences are `export` added to POSITIONAL, personTokens and tokenOverlap, and two import paths made relative. speakers-grounded.ts gains only an import and a re-export line, with the same export names as before. The abstain, verbatim-quote and referent-binding logic is untouched. SPEAKERS_SYSTEM_PROMPT is a byte-identical move into speakers-llm-prompt.ts. The six moved speaker files are pure renames (0 changed lines) apart from import paths and `../..` depth for qa/ and src/ walks.
- Test split: grounded-notes.test.ts (14) plus grounded-notes-sentence-span.test.ts (12) is 26 tests, and the sorted test-name list equals the original 26. No expectation changed. The fixtures file is only the shared helpers.
- Stale paths: none in code. Only comments in frozen-base-536a56a/*.mts mention old names.
- tsc: packages/index, apps/api and packages/ask exit 0.
- packages/index suite: 628 tests, 627 pass, 1 fail, matching the maker's before-count. The same test fails.
- lint-loc --all: no packages/index entries remain. The 9 loc, 4 dirsize and 1 root violations belong to other lanes. pipeline/ is now 30 files. lint-dupes shows 7 before and after.
- dependency-cruiser: I reproduce 2 errors, not 3. They are apps/api/scripts/build.mjs -> esbuild and the ask-graph<->ask-v2 cycle (ISS-CIFIX-002, fixed on main by cifix2 after this base). I could not reproduce a third. The maker's third is most likely a junction artefact (ask-graph resolving into the main tree), as the maker stated. Not caused by this change.

SEPARATE FINDING (read-only), the failing "D-015 corpus" test:
- Correction to the premise: it is NOT an intentionally red reproduction of open ISS-104. It throws SyntaxError "Bad escaped character in JSON" in JSON.parse at speaker-name-rules.test.ts:221. The test reads every qa/issues*.jsonl shard, and qa/issues.cifix.jsonl line 3 (ISS-CIFIX-003, commit f81c8c13) is malformed: unescaped Windows backslashes in the row text.
- tracker-audit G5 ("1 unparseable line") fails on the same line, so lint:structure stage=tracker also fails.
- CI runs `pnpm -r test` and `pnpm lint:structure` (.github/workflows/ci.yml:86 and :95). Both stay red until that line is repaired.
- Option 1: fix the one row by escaping the backslashes in qa/issues.cifix.jsonl (data-only, low risk). It should clear both the test and G5.
- ISS-104 being open does not break CI.
- Option 2: none needed. No known-failing marker is applicable.

ISSUES-WRITTEN: none (the malformed row is already covered by the ISS-CIFIX family and is reported here; routing it to the cifix lane is recommended)
