# Manifest — golden-set-silent-fabrication

**Contract:** `qa/contracts/golden-set-recall.md` (T-021) covers `scripts/eval-recall.mjs`
(criterion 4/6) and is cited as the ground truth for that file's behavior. **No contract covers**
`qa/probes/golden-set-sibling-semantic.mjs` — it is a probe, not a contracted deliverable; the only
document naming it is `qa/manifests/golden-set-semantic-leg.md` (checked-PASS, the unit that
introduced it), which does not specify the "no rival session" edge case either. That gap is exactly
what let ISS-272 ship.
**Fix cycle:** 0
**Persona walk:** Not applicable — this unit fixes a reporting/eval-script defect (no UI, no
end-user-facing surface). See "Live browser evidence" below.
**Backlog tier:** 2
**Issues addressed:** ISS-271 (high), ISS-272 (high) — both `feature: golden-set-semantic-leg`,
same defect class (silent fabrication on a missing input), different files, filed as one unit per
the dispatch brief.

## What changed

1. **`scripts/eval-recall.mjs:37-86`** (new) — extracted the `filterBias` decision into a pure,
   exported `computeFilterBias({ rejectedPathExists, rejectedQs, keptResult, computeRejected,
   computeCombined })`. When `rejectedPathExists` is `false` it now returns
   `{ measured: false, note: "NOT MEASURED — ..." }` instead of the old bare `null`
   (was `scripts/eval-recall.mjs:200`, pre-fix). Every other branch now also carries
   `measured: true` so all three shapes (`not measured` / `measured, 0 rejected` / `measured, N
   rejected`) are structurally distinguishable, not just distinguishable by which fields happen to
   be present.
2. **`scripts/eval-recall.mjs:203-227`** (was `:200-238`) — `main()` now builds `rejectedQs` once,
   calls `computeFilterBias(...)`, and branches its console output on `filterBias.measured` /
   `filterBias.rejected.n` instead of re-deriving the same three cases inline.
3. **`scripts/eval-recall.mjs:318-323`** (was `:318-321`) — the `main().catch(...)` call is now
   guarded (`if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1])))`, the
   same pattern `scripts/lint-loc.mjs:27` already uses), so importing `computeFilterBias` from a
   test does not also trigger the real Mongo/tree-build run.
4. **`qa/probes/golden-set-sibling-semantic.mjs:20-38`** (new) — extracted the per-question margin
   formula into a pure, exported `computeMarginRow(exp, ranked, expectedSessionId)`. When no rival
   session exists in `ranked`, it now returns `{ marginMeasured: false, margin: null, ... }`
   instead of the old fabrication (was `qa/probes/golden-set-sibling-semantic.mjs:68-69`:
   `rivalBest` defaulted to a synthetic `-2`, giving `margin = exp - (-2) = exp + 2`, always the
   single most "decisively unambiguous" possible value).
5. **`qa/probes/golden-set-sibling-semantic.mjs:41-131`** (was `:22-101`) — the live-run body
   (Mongo connect, embedding call, per-question loop, summary, `--write`) is now guarded behind
   `if (isMain)` (same guard pattern as (3) above), calls `computeMarginRow` per question, and
   separates `unscorable` (rows with `marginMeasured: false`) from `ambiguous` (rows with
   `marginMeasured: true && margin < 0.03`) — a degenerate pool is counted on its own, never folded
   into either bucket. `summary` gained `unscorableCount`/`unscorableIds`; the console output and
   the written `note` field both say NOT MEASURED for those rows.
6. **`package.json:20`** — added `scripts/lib/eval-recall.test.mjs` to `test:lint`.

**Not changed:** retrieval scoring, the golden set itself, `packages/index/src/eval/*`, and
`qa/probes/golden-set-condition3.mjs` / `golden-set-ambiguity.mjs` — out of this unit's scope per
the dispatch brief.

### Where the new test files live (and why one moved)

- `qa/probes/golden-set-sibling-semantic.test.mjs` sits beside the probe it tests — `qa/` is not
  one of `structure.config.json`'s `dirsize.roots` (`["packages","apps","workers","scripts",
  "schema"]`), so this file is not linted for directory size at all.
- `scripts/lib/eval-recall.test.mjs` does **not** sit beside `scripts/eval-recall.mjs`, breaking
  the repo's usual sibling-test convention (`scripts/lint.test.mjs`, `scripts/snapshot.test.mjs`).
  Reason: `structure.config.json`'s `dirsize.overrides` already caps `scripts/` at **32**, and it
  was sitting at exactly 32/32 before this unit — a 33rd file there fails C2
  (`node scripts/lint-dirsize.mjs`). Raising the override needs a named DECISIONS entry (D-017),
  which is out of scope for a fix-cycle-0 unit. `scripts/lib/` had headroom (20/30) and is already
  scanned by `pnpm test:lint`, so the test lives there instead. Declared here rather than silently
  worked around — see "Declared regression" for the one this avoided.

## How to verify

```
node --test scripts/lib/eval-recall.test.mjs qa/probes/golden-set-sibling-semantic.test.mjs
node scripts/lint-loc.mjs
node scripts/lint-dirsize.mjs
node --check <BOM-stripped copy of each file>   # see note below on the pre-existing BOM
```

`node --check` on the two source files directly fails with `SyntaxError: Invalid or unexpected
token` at the shebang line — **this is pre-existing**, not introduced by this fix: confirmed via
`git show HEAD:qa/probes/golden-set-sibling-semantic.mjs | node --check /dev/stdin`-equivalent
(both files carry a UTF-8 BOM before `#!/usr/bin/env node`, which Node's `--check` internal
checker chokes on but normal execution and `node --test` imports do not). Syntax was verified by
stripping the BOM into a scratch copy and running `node --check` on that instead (both `SIBLING_OK`
/ `EVAL_RECALL_OK`).

## Actual outputs (pasted, from this run)

```
$ node --test scripts/lib/eval-recall.test.mjs qa/probes/golden-set-sibling-semantic.test.mjs
✔ ISS-272: no rival session in the pool -> marginMeasured:false, margin:null (never expected+2) (1.3330ms)
✔ ISS-272: exactly one rival -> marginMeasured:true, margin = expected - rival (real comparison) (0.2673ms)
✔ ISS-272: normal multi-rival pool -> margin uses the BEST rival, not just the next-ranked one (1.1235ms)
✔ ISS-272: a degenerate pool must not silently read as unambiguous downstream (0.2294ms)
✔ ISS-271: rejected file absent -> measured:false, never a bare null and never measured:true (1.3024ms)
✔ ISS-271: rejected file present but empty -> measured:true, kept === combined, rejected.n===0 (1.2246ms)
✔ ISS-271: rejected file present with rows -> measured:true, uses the injected rejected/combined results (0.2630ms)
✔ ISS-271: three shapes are mutually distinguishable by `measured` + presence of stats (0.2132ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0

$ node scripts/lint-loc.mjs
lint-loc: FAIL — 4 violation(s)          # unchanged from baseline, see below
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:352 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)

$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (88 dir(s) within budget)

$ pnpm test:lint   (full run, all scripts-level tests)
ℹ tests 90
ℹ pass 89
ℹ fail 1   # docs/SNAPSHOT.md staleness — pre-existing, unrelated (see "No-regression checks" below)
```

**LOC before/after** (`node scripts/lint-loc.mjs`, non-blank lines, budget 300):
- `scripts/eval-recall.mjs`: **265 → 298** (headroom 2; no violation)
- `qa/probes/golden-set-sibling-semantic.mjs`: **96 → 132** (headroom 168; no violation)
- Repo-wide `lint-loc` violation count: **4 → 4** (unchanged — no 5th added)

## Measurement against the ledger (D-015)

Both `qa/issues.jsonl` rows (ISS-271 at line 269, ISS-272 at line 270) have **`fix_direction`
empty and `reproductions: null`** — there were no recorded reproductions to re-run. Per D-015, an
author-chosen corpus does not substitute for the ledger's cases; here it is authored because the
ledger recorded none, and that gap is stated plainly rather than silently filled in as if it were
normal.

Corpus derived directly from the conditions named in each issue's own title, per-condition:

**ISS-271** (`scripts/lib/eval-recall.test.mjs`) — **4/4 passing**:
1. rejected-file absent → `measured: false`, never a bare `null`, never `measured: true`
2. rejected-file present but empty → `measured: true`, `kept === combined`, `rejected.n === 0`
3. rejected-file present with rows → `measured: true`, uses the injected rejected/combined results
4. (structural) the three shapes above are mutually distinguishable, not just field-presence luck

**ISS-272** (`qa/probes/golden-set-sibling-semantic.test.mjs`) — **4/4 passing**:
1. no rival session in the pool → `marginMeasured: false`, `margin: null` (never `expected + 2`)
2. exactly one rival → `marginMeasured: true`, margin is the real `expected − rival` difference
3. normal multi-rival pool → margin uses the **best** rival, not just the next-ranked one, and
   `ambiguousRivals_0p03` correctly separates a within-band rival from an out-of-band one
4. (regression-framing) a degenerate pool must read as not-measured, never as the specific
   fabricated value the bug used to produce

**Ledger-quality gap worth its own row (not filed by this unit, per instructions):** both ISS-271
and ISS-272 shipped with no `fix_direction` and `reproductions: null`, forcing this unit to author
its falsifying corpus from the title text alone rather than from recorded cases. Reporting this,
not filing it.

## Capability coverage (with the falsifying edit + observed RED, D-020 safety)

| # | Capability claimed | Test | Falsifying mutation | Observed RED |
|---|---|---|---|---|
| 1 | Absent rejected-file input reports `measured:false`, never a bare `null` | `ISS-271: rejected file absent -> measured:false...` | `scripts/eval-recall.mjs`: `if (!rejectedPathExists) { return null; }` (byte-for-byte restore of the pre-fix behavior) | `AssertionError: must not be a bare null (the exact ISS-271 defect)` — `actual: null` |
| 2 | No-rival-session input reports `marginMeasured:false`/`margin:null`, never `expected+2` | `ISS-272: no rival session in the pool -> ...` and `ISS-272: a degenerate pool must not silently read as unambiguous ...` | `qa/probes/golden-set-sibling-semantic.mjs`: `marginMeasured = true; margin = exp - (rivalBest ? rivalBest[1] : -2)` (restores the original `-2` sentinel fabrication) | Both tests failed: `Expected values to be strictly equal: true !== false` |

Both mutations were driven through the **real function under test** (`computeFilterBias`,
`computeMarginRow`), not a stand-in — the failing assertion is on the exact field
(`measured`/`marginMeasured`) the fix computes, so a test that supplied its own value would not
have caught this class of regression. Full transcript: mutation 1 → 3/4 green, 1 red exactly on
the absent-file case; mutation 2 → 2/4 green, 2 red exactly on the no-rival case and the framing
case that re-asserts the same field.

### D-020 mutation safety

For each file: `node scripts/lib/mutate.mjs apply <file>` (refuses unless byte-identical to HEAD —
both files were freshly committed as `c13dad5` first, satisfying the precondition), then a byte
backup (`cp <file> .backup-<file>`), a Python in-place text substitution for the mutation, the test
run wrapped in `timeout 30`, and a `trap cleanup EXIT INT TERM ERR` whose `cleanup` runs
`node scripts/lib/mutate.mjs restore <file>` (git-checkout back to HEAD, mutate.mjs's own
post-restore verification) followed by `cmp .backup-<file> <file>`, printing
`RESTORED-VERIFIED: <file>` only after the byte-compare succeeded. Both files: `git status --short`
was empty and `node scripts/lib/mutate.mjs list` printed `no outstanding mutations` after both
runs — no mutant was ever committed.

## Live browser evidence

**Not UI-touching.** `scripts/eval-recall.mjs` and `qa/probes/golden-set-sibling-semantic.mjs` are
CLI/offline evaluation tooling with no web surface; their JSON report files
(`data/eval/recall-report-vector.json`, `data/eval/golden-set-sibling-semantic.json`) are read by
humans and by future eval scripts, not rendered in `apps/web`.

## No-regression checks

- `node --test scripts/lib/eval-recall.test.mjs qa/probes/golden-set-sibling-semantic.test.mjs`:
  **8/8 pass**.
- `pnpm test:lint` (full scripts-level suite, 90 tests across 10 files): **89/90 pass**. The one
  failure is `snapshot.mjs: current repo's docs/SNAPSHOT.md is <= 200 lines` /
  staleness — confirmed **pre-existing and unrelated**: `git status --short` before any of this
  unit's edits shows `docs/SNAPSHOT.md` untouched, and the diff it reports (`qa/briefs/`,
  `qa/tests/`, `migrations/` ordering) names directories this unit never touches. Per this repo's
  own CLAUDE.md, `docs/SNAPSHOT.md` is "generated, never edit it" — regenerating it is outside a
  fix-cycle-0 unit scoped to two specific issues.
- `node scripts/lint-loc.mjs`: 4 violations, all 4 identical to the pre-existing baseline named in
  the dispatch brief (`speakers-llm.ts`, `sb_join.py`, `obs-windows.ts`, `run-watch.mjs`) — no 5th.
- `node scripts/lint-dirsize.mjs`: OK (88/88 dirs within budget) — see "Declared regression
  avoided" below for why this needed a deliberate file placement.
- `pnpm -r typecheck` was **not run**: both changed files are plain `.mjs` scripts under
  `scripts/` and `qa/probes/`, neither of which is inside a pnpm workspace package
  (`pnpm-workspace.yaml`: `packages/*`, `apps/*`, `workers/*` only) or covered by any `tsconfig`,
  so no TypeScript project includes them — there is nothing for `pnpm -r typecheck` to check
  differently before/after this change.
- `pnpm gen:types --check` / `python schema/validate.py`: not run — this unit touches no schema
  and no type-generation source; contract criterion 7's full regression list belongs to the T-021
  unit as a whole, not to a 2-issue fix cycle, and neither script's output feeds either pipeline.
- Read-only toward production Mongo / no egress: neither file was executed live in this session —
  only `node --test` against the extracted pure functions and `node --check` for syntax. No Mongo
  connection, no embedding API call, no writes outside the two source files, two new test files,
  `package.json`, and this manifest.

## Declared regression avoided (not shipped, but worth recording)

Extracting `computeFilterBias` as a co-located `scripts/eval-recall.test.mjs` would have pushed
`scripts/`'s file count from 32 to 33, breaching its `lint-dirsize` override ceiling (32,
`structure.config.json`) — a genuine regression this unit could have silently introduced the same
way the brief warned about the 300-line LOC budget. Caught by running `node scripts/lint-dirsize.mjs`
before committing; avoided by placing the test at `scripts/lib/eval-recall.test.mjs` instead (see
"Where the new test files live" above). No regression shipped; recording the near-miss so the
reasoning is visible rather than silent.

## Status: checked-PASS (cycle 0)

Verdict: `qa/verdicts/golden-set-silent-fabrication.md` (**Cycle checked: 0**, commit `8c33117`) —
**PASS**, `ISSUES-WRITTEN: none`. ISS-271 and ISS-272 flipped `open -> fixed`.

Per this repo's verdict rule, `none` is a complete and creditable check: the checker found nothing on a
correct implementation, which is its job, not a lapse.

What the checker re-derived rather than trusted: it wrote its **own** mutations (not the two in the
table above), reverting `computeFilterBias` to the bare `return null` and `computeMarginRow` to the `-2`
sentinel under full D-020 discipline, and both went red on exactly the claimed rows and nothing else —
which is what establishes that the tests assert on the real computed field rather than a value the test
itself supplies. It also re-verified the 89/90 `test:lint` claim **on the base commit** `a99140f` in a
throwaway detached worktree, confirming the `docs/SNAPSHOT.md` staleness is pre-existing; verified the
`scripts/` 32/32 dirsize claim by counting; and read both files in full to confirm the `isMain` guards
disabled nothing (every removed line reappears inside the extracted pure function or the guarded block).

### Correction — one wording nit the checker caught

This manifest describes ISS-271/ISS-272 as carrying `reproductions: null` and an empty `fix_direction`.
Parsed directly, those keys are **absent from both rows**, not present-with-a-null-value. The substance
is unchanged — there were no recorded reproductions to replay, so authoring a corpus was correct and is
not a D-015 substitution — but "absent" and "null" are different claims about a ledger row, and a
manifest that paraphrases the ledger instead of parsing it is how a wrong id or a wrong field slips
through later. Recorded rather than silently edited.
