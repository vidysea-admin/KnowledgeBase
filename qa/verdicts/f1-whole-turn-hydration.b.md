# Verdict (coordinator B): f1-whole-turn-hydration

Cycle checked: 0
Checked commits: code f8565d3c, manifest 33e963a7, base f7eb479f (own diff only; merge-base with release/kb-golive is a9bbeb98 because the parent branch is unmerged)
Contract: qa/contracts/ask-condition-fidelity.md (F1B-C1..C5, F1B-I1..I4), byte-identical to the 85625836 version
Evidence detail: qa/checkpoints/f1-whole-turn-hydration.b.md

## Check plan
1. Re-run the manifest verify commands in the bound tree (one test process at a time, timeout on each, TSX_DISABLE_CACHE=1).
2. Red-first: swap the 7 source files to base f7eb479f in a throwaway copy, run the new tests, restore.
3. Falsification floor .8-4 plus 3 extra mutants, all in a throwaway copy outside the bound root, one test node per row, per-mutation byte backup, restore on exit/interrupt/error, hash-identity check against HEAD after each.
4. Invariants: affected-set run (29 files), tenancy read of the hydrator diff, D-015 ledger repro check, typecheck, lint-loc.

VERDICT: PASS
TIER: L (dual-trigger tenancy: apps/api/src/ask/source-context.ts:232-236, the hydrator returns cited turn text)
SCOREBOARD: criteria 5/5 (F1B-C1..C5), invariants 4/4 (F1B-I1..I4)
CAPABILITY-COVERAGE: 7/7 rows reproduced in the copy (C1, C2, C3, C4, C5, I1 plus the repair row via I3). C5 caveat: the manifest cell edits the corpus JSON, which is not a file in "What changed", so it was not executed; an equivalent single-hunk product edit (M5, answer.ts) was used instead and went red.
ISSUES-WRITTEN: none
EXECUTOR: checker B, Sonnet 5.5, fresh context, no reading of coordinator A's files

## Per-criterion result (my own runs, bound tree)
| ID | Result | Evidence |
|---|---|---|
| F1B-C1 whole text of cited turns hydrated, over-cap turn named not cut | PASS | pattern `\[F1B-C1\]` on corpus + lexical files: 7/7. M1 red 4 fail ("the over-cap turn is left out of liveTurns", actual `['fixture-short','fixture-big']`). |
| F1B-C2 hydrator output reaches the release check | PASS | `\[F1B-C2\]` 3/3. M2 (drop liveTurns from return) red 2 fail: "held for review: ... the hydrated evidence is an excerpt". |
| F1B-C3 deep and fast share one judgment, recorded probes held | PASS | `\[F1B-C3\]` 12/12; printed `F1B-PROBES mode=fast held-by-recorded-scope=14/14` and `mode=deep ... 14/14`. M3 red 4 fail (deep probes 0 vs 14 plus 3 deep tests). |
| F1B-C4 marker audit entry is honoured by conditionReleaseHold | PASS | `\[F1B-C4\]` 3/3. M4 red 1 fail (returned "only asks this question", expected null). |
| F1B-C5 release hold fires on the recorded condition probes | PASS | `\[F1B-C5\]` 2/2, 14/14 in both modes. M5 red 2 fail (probes 0 vs 14, fast and deep). |
| F1B-I1 tenancy, no new read path | PASS | `\[F1B-I1\]` 2/2. Added source lines contain no `.find(`/`collection(`/`getDb`; liveTurns and overCapTurns derive only from `byTurn` (snapshot.rows: tenant-scoped find, assertInScope, visibility gate, effective overlay). M6 (`cited = effective`) red: `['s-t1','s-hidden']` vs `['s-t1']`. |
| F1B-I2 no regression in the affected set | PASS | 29 files, one process each, all rc=0: 363 tests, 362 pass, 1 skipped (answer-persistence NASA live test), 0 fail. Extra consumers: ask-tenant-hostile 70/70, ask-tenant-isolation 17/17, external-model-hydrators 26/26, graph-context 10/10, native-source-context (api) 7/7, source-context-quarantine 3/3, routes/ask 7/7, packages/ask bounded-evidence + native-source-context 16/16. tsc --noEmit rc=0 for packages/ask and apps/api. |
| F1B-I3 over-cap quote stays usable as an excerpt, never as proof | PASS | M7 (remove the over-cap relaxation in staleQuoteProof) red 4 fail ("its excerpt stays evidence for generation, so the model can cite it"). Live text accepted only if sha256(liveText) equals quote.turnTextSHA256. |
| F1B-I4 hermetic tests | PASS | 0 matches for `lkb_prod|MONGODB|process.env|fetch(|.env` in added test lines; no db reads added. |

## Red-first at base
7 source files swapped to f7eb479f in the copy: 25 tests, 8 pass, 17 fail. Fast probes 0/14 held, deep probes 14/14 (the recorded base outcome). Restored, hashes equal bound tree.

## D-015 (ledger repro measurement)
qa/issues.F1WAIVERCONDITION.jsonl sha256 166085f8...3ef9 matches the manifest. The verbatim repros for -001 and -002 match the manifest quotes and are held 14/14 in both modes. ISS-F1WAIVERCONDITION-005 has no recorded repro field, so nothing to measure against.

## Falsification (copy only, green before, red after, restored)
Mutants run: 9 (floor rows M1..M6 plus M7 floor-equivalent repair row, extra M9 and M10; L cap is 10). Every touched file ended with copy == bound (sha256) and bound == HEAD (`git hash-object` == `git rev-parse HEAD:<file>`); `git status` stayed clean. M1..M7 and M10 killed (table above; M10: `!live ? result` to `false ? result` red 2 fail, "the marker is only for whole turns the hydrator supplied"). M9 survived (below).

## EXPLANATION
All five criteria and four invariants hold on my own runs; every changed criterion has a mutation that is green before and red after. Tenancy: the new live text is built only from the already scope-validated, visibility-gated rows; no read was added and smuggled live turns are rejected by hash. Over-cap turns are held, never cut.
Notes only (not filed, per the repo verdict rule and severity gate):
- Deep judgment is now cited-turns-only (base judged all retrieved internal sources); the contract says "cited turn", so this is aligned.
- Over-cap quotes skip hash re-proof in validateHydration (derived from the same snapshot).
- apps/api/src/answer-policy/answer-evidence.ts is 535 non-blank lines vs 534 at base; the lint-loc violation is baseline.
- The manifest has no `## Test selection (haiku)` section or `Sibling:` lines. shard_suite.py --candidates found 0 siblings, so no .13-8(c) failure; format observation only. The Falsification section is prose, not a table.
- `tick.mjs --route` printed dual:false (only the "contracts" rule fired) but the manifest's dual-trigger line cites real code at source-context.ts:232; tier L matches.

PROPOSED-ISSUE: {"severity":"low","class":"coverage","seam":"fast-gate web_used","summary":"No test pins that the fast release gate judges answers with web sources present. Re-adding `!web.length &&` to the gate in packages/ask/src/ask-v2.ts (mutant M9) leaves all 23 F1B tests green, so an answer citing an over-cap internal turn alongside web sources would be released under that mutant. The contract C4 text is met (deep web_used test exists) and the real code is correct today.","fix_direction":"file-don't-fix per the class round cap (non-security, coverage); fold one fast-gate web_used test into the next unit that touches ask-v2.ts","status":"proposed"}

HUMAN_GATE-REQUEST: none

Metrics: start=2026-11-25T15:17:00+05:30 end=2026-11-25T15:36:00+05:30 wall_min=19 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=unavailable mutants=3 defects_unit=0 defects_6c=0
