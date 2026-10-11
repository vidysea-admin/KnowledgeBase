# Manifest — iss-pipefix-pipeline-dirsize

**Status:** ready-for-check
**Fix cycle:** 0
**Lane:** PIPEFIX (branch lane/pipefix, base 8520fa8). **Security class:** none. Ledger: `qa/issues.pipefix.jsonl`.
**Backlog tier:** 2 (open high issue ISS-PIPEFIX-001: restores the dirsize stage of the CI structure lint, which this week's merges turned red; cause: second merge landed without a post-merge dirsize run).

## Scope
Pure MOVE of one cohesive, unwired group from `packages/index/src/pipeline/` into the new subfolder `packages/index/src/pipeline/quote/`. No content change except import and path strings. `lint-dirsize` counts files per directory, non-recursively (`looseFiles` filters to files), so a subfolder is not an entry; subfolders are allowed (precedent: `calendar/alerts/`, `qa/manifests/r1-alert-title-policy-and-reasons.md` "Relocation"; `frozen-base-536a56a` already nests here).

## Files moved (`git mv`, shown as renames)
quote-verify.ts, quote-token-rule.ts, transcript-windows.ts, quote-verify.test.ts, quote-verify-token.test.ts, quote-verify-boundary.test.ts, quote-verify-property.test.ts, transcript-windows.test.ts. Nothing else; speaker-* and frozen-base-536a56a untouched; summarize.ts untouched.

## Every changed line (`git diff --cached -M -U0`)
- `packages/index/src/index.ts`: two export lines, `"./pipeline/quote-verify.js"` -> `"./pipeline/quote/quote-verify.js"` and `"./pipeline/transcript-windows.js"` -> `"./pipeline/quote/transcript-windows.js"`.
- `quote/quote-verify-boundary.test.ts` line 14 and `quote/quote-verify-token.test.ts` line 17: ledger URL `../../../../qa/issues.t040quote.jsonl` -> `../../../../../qa/issues.t040quote.jsonl` (one more `../`).
- The other six moved files: 0 changed lines (their imports are only to each other, same folder).
`git diff --cached -M --stat`: 9 files changed, 4 insertions(+), 4 deletions(-); six renames at 0, two at 2 lines each, index.ts 2 ins/2 del.
No other importer: grep of the repo (excluding node_modules, .git) for `quote-verify|quote-token-rule|transcript-windows` hit only these files plus `qa/issues.t040quote.jsonl`, `qa/manifests/t040-strict-quote-verifier-and-windowing.md`, `qa/verdicts/t040-strict-quote-verifier-and-windowing.md`. Those three cite the old paths and are HISTORICAL; not edited. tsconfig (`src/**` include) and the package test glob (`src/**/*.test.ts`) name no old paths.

## Counts
`packages/index/src/pipeline` files: 34 -> 26 (subfolders do not count). Budget 30.

## Evidence
- Before: `node scripts/lint-dirsize.mjs` -> `lint-dirsize: FAIL — 1 violation(s)` / `packages/index/src/pipeline: 34 files (budget 30)`.
- After: `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (117 dir(s) within budget)`.
- Tests (from packages/index, `node --test --import tsx <files>`): five moved files before move 98 tests / 98 pass; after move (`src/pipeline/quote/*.test.ts`) 98 / 98 pass. summarize.test.ts alone 10/10 before. summarize + speaker-docs + speaker-name-rules: 133/133 before and 133/133 after.
- Glob discovery: `node --test --import tsx --test-name-pattern="oversized turn is cut" "src/**/*.test.ts"` lists `src\pipeline\quote\quote-verify-boundary.test.ts` etc. among the files run.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/index: exit 0.
- `node scripts/lint-dupes.mjs`: `lint-dupes: OK (852 unique export(s), 27 unique schema $id(s))`.
- `node scripts/lint-loc.mjs`: FAIL, one violation `packages/meeting-bot/py/sb_join.py:1142 (budget 300)`: a Python file this change does not touch (pre-existing, not from the move; not fixed here).

## Directories at or within 1 of their limit (dir, count/limit)
packages/meeting-bot/src/capture 30/30; apps/api/src/routes 30/30; apps/api/src 31/31 (override); scripts/lib 30/30; scripts 32/32 (override); schema 29/30. (packages/index/src/pipeline is now 26/30.)

## D-015
`ISS-PIPEFIX-001: 1/1` (its recorded reproduction command now passes).

## Not done
No wiring, no content edits, no edits to historical t040 documents, no process change (a post-merge dirsize run is recommended to the orchestrator). Full suite, build and lint-root/migrations not run. lint-loc's pre-existing sb_join.py failure left alone.
