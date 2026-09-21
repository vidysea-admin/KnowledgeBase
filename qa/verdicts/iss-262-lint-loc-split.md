# Verdict — iss-262-lint-loc-split (Mode A)

**Date:** 2026-09-22
**Bound root:** D:/KnowledgeBase
**Contract:** qa/contracts/structure-lint.md
**Manifest:** qa/manifests/iss-262-lint-loc-split.md — Status: ready-for-check · Fix cycle: 0 of max 3
**Cycle checked: 0** (matches manifest Fix cycle 0)
**Unit commit:** `7da0a41` (parent `d142628`)
**Mode D:** Not UI-touching — both changed paths are `packages/index/src/pipeline/*.test.ts` (test files; no page, route, or component touched). No live-browser run required.

## Verdict block

```
VERDICT: PASS
SCOREBOARD: 10/10 criteria met, 3/3 invariants hold (C3's lint-root 16>15 is the pre-existing
  ISS-248, explicitly ruled out of this unit; every stage past its short-circuit re-run green
  individually — the ISS-100 lesson honored)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: not-applicable (fix-only preservation unit — manifest claims no capability
  and carries no coverage table; protection verified instead: the moved tests are byte-identical
  verbatim, 25 test sites and the full ISS-091/092/093/094/255 refusal corpora remain in the
  parent, nothing weakened)
LIVE-BROWSER: not-applicable (changed paths: two test files only)
ISSUES-WRITTEN: ISS-265 (low — manifest line-count actuals misstate the linter's own rule);
  ISS-262 flipped open → fixed with fixed_evidence
EXPLANATION: Every manifest claim re-derived independently and reproduced. lint-loc is green at
  HEAD (OK, 291 files, exit 0), the split is proven verbatim by byte comparison, and all 215
  index tests / 76 test:lint / typecheck / depcruise / the six other lint:structure stages pass
  in this checker's own runs. One low finding: the manifest's "Actual outputs" line counts
  (301/105) do not reproduce under countLoc — the instrument's own rule (scripts/lib/walk.mjs:75)
  measures 348/119, both under the 400 test budget, so criterion 1 is unaffected. lint:structure
  still exits 1 at HEAD solely at the pre-existing lint-root 16>15 (ISS-248), exactly as the
  manifest discloses; not charged to this unit.
```

## What this checker re-ran (all evidence self-produced at `7da0a41`)

| # | Command | Expected (manifest) | My result | Match |
|---|---|---|---|---|
| 1 | `node scripts/lint-loc.mjs` | `lint-loc: OK (291 file(s) within budget)`, exit 0 | `lint-loc: OK (291 file(s) within budget)`, exit 0 | ✅ |
| 2 | `git diff d142628..7da0a41 -- <two test files>` | only moved tests + pointer + header | see Verbatim proof below | ✅ |
| 3 | `pnpm --filter @lkb/index test` | 215 pass / 0 fail | 215 pass / 0 fail (duration 1881 ms) | ✅ |
| 4 | `pnpm test:lint` | 76/76 | 76 pass / 0 fail, exit 0 | ✅ |
| 5 | `pnpm -r typecheck` | all Done, exit 0 | all packages Done, exit 0 | ✅ |
| 6a | `node scripts/lint-dirsize.mjs` | OK | OK (78 dirs) | ✅ |
| 6b | `node scripts/lint-dupes.mjs` | OK (313 exports) | OK (313 exports, 24 schema $ids) | ✅ |
| 6c | `node scripts/lint-migrations.mjs` | OK | OK (2343 files scanned) | ✅ |
| 6d | `node scripts/snapshot.mjs --check` | OK | OK (116 lines, budget 200) | ✅ |
| 6e | `node --test scripts/lint.test.mjs` | 14/14 | 14 pass / 0 fail | ✅ |
| 6f | `node scripts/tracker-audit.mjs --gate g1,g4` | OK | OK (gate G1,G4) | ✅ |
| 6g | `depcruise --config .dependency-cruiser.cjs packages apps workers` | 0 violations (308 modules) | `no dependency violations found (308 modules, 945 dependencies cruised)` | ✅ |
| 7 | `pnpm lint:structure` | FAILS ONLY at pre-existing lint-root 16>15 | FAIL at lint-root 16>15 exactly; lint-loc + lint-dirsize ran green before the short-circuit | ✅ |
| 8 | `pnpm -r test` | all packages pass | exit 0 (api 173/0 at tail; all packages Done) | ✅ |

## Diff-scope (Mode A step 4c)

`git diff-tree --no-commit-id --name-only -r 7da0a41` → exactly the two test files. No other
file touched; nothing deleted or renamed beyond the claimed move. Narrow-pathspec claim holds.

## Verbatim proof (criterion: tests moved, not altered)

- The parent's moved block (from `test("empty input never calls the provider"` to EOF at
  `d142628`) is **byte-identical** after line-ending normalization to the new sibling's tail at
  `7da0a41`: `parent-tail === windows-tail → true` (programmatic comparison, first-diff scan empty).
- Parent at HEAD no longer contains the marker; it carries the two-line pointer comment naming
  `speakers-windows.test.ts` + ISS-262. New file header names the split + ISS-262 and claims
  verbatim movement — that claim is proven true. No weakening language anywhere.
- 6 `test(` sites moved; parent retains 25 `test(` sites. `rg` confirms ISS-091/092/093/094
  corpora and the ISS-255-supersedes rows remain in the parent (lines 197–372).
- Test-count arithmetic holds: 215 = 209 kept + 6 moved (previously 215 across one file).

## Criterion 1 measurements (the instrument's own rule)

`countLoc` = non-blank lines (scripts/lib/walk.mjs:75-77), budget 400 for `*.test.ts`:

- parent `d142628`: 444 (matches the ISS-262 ledger row's red) ✅
- `speakers-llm.test.ts` @ HEAD: **348**; `speakers-windows.test.ts`: **119** — both < 400 ✅
- Manifest's "Actual outputs" claims 444 → 301 and 105: **does not reproduce** under `countLoc`
  (nor raw `wc -l`: 127 total for the new file). Both claimed numbers still land under budget, so
  the criterion passes regardless; filed as **ISS-265 (low)** rather than a failure — the counts
  are evidence bookkeeping, not the criterion. If the maker's numbers came from a
  comments-excluded count, the manifest should say so or adopt countLoc's values (348/119).

## Issues addressed (Mode A step 5)

- **ISS-262** (medium, structure-lint): the recorded reproduction (`node scripts/lint-loc.mjs`)
  re-run verbatim → now green (D-015 corpus: 1/1 recorded reproduction executed; it was the red
  and is now OK). Fixed by this unit; ledger flipped `open → fixed` with fixed_evidence (this
  verdict commit). `fixed → verified` awaits a later re-check per protocol.
- No other issues claimed. lint-root 16>15 = ISS-248 (open, Approver budget entry pending) —
  pre-existing, unchanged by this unit, not charged (explicit dispatch ruling + ISS-262 ledger
  row independently state the same).

## Honest-scope checks

- `pnpm lint:structure` still exits 1 at HEAD — manifest discloses this up front and attributes
  it to ISS-248 only; my run confirms the failure point is exactly lint-root (stage 3 of 9),
  with lint-loc and lint-dirsize green before it.
- Manifest has no Capability-coverage table; as a fix-only preservation unit the protection half
  was verified directly (verbatim proof + corpus retention above). Nothing survived a falsifying
  edit because no capability claim exists to falsify.
- Goal wiring: no `iss-262`/`lint-loc` task exists in `.goal/goal.json` (checked) → no goal task
  closed; none was open for this unit.