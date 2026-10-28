# Verdict -- medium-fix-batch-2-2026-10-10

**Cycle checked:** 0
**Checker:** independent, fresh context, worktree `KnowledgeBase-lanes/medfix2`, HEAD f3cb5cc (base a71685e). Did not build the unit.

```
VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: ISS-MEDFIX2-001 (low), ISS-MEDFIX2-002 (low) in qa/issues.medfix2.jsonl
```

## Per-commit result

| commit | issue | result | decisive evidence (D-015 count) |
|---|---|---|---|
| 9b98ee7 | ISS-164 | PASS, keep | Row's 1 reproduction (G4 red on a checker-authored qa/contracts file): 1/1 replayed through `splitAdvisory`. Implements the row's own fix_direction ("filter findings to qa/manifests/ for the non-zero exit, print the rest as advisory"). Mutants "advisory never" and "path test inverted" both die on the ISS-164 test (2/2). Gap: exit-code wiring unasserted (ISS-MEDFIX2-002). |
| b400661 | ISS-315 | PASS, keep | Row's 2 reproductions (ISS-307 `\s` from 222010f, ISS-U1-3 `\[\d` from 9c52a27) replayed verbatim into a temp tree: clean tree `--gate g5` exit 0; with the ISS-307 line `G5 ledger: 1 unparseable`; with both `G5 ledger: 2 unparseable`, exit 1. 2/2. Real ledger: no G5 finding. Mutant (G5 label reverted to G2) dies on the ISS-315 test. The lint-loc.mjs hunk is the single stage-argument string `g1,g4` -> `g1,g4,g5`; no threshold or count touched. |
| a11075f | ISS-162 | PASS, keep | New text true: `auditIssueRefs` does `if (G4_FROZEN.has(rel)) continue;` per file; 4 frozen verdicts. Row offered "drop the claim"; taken. |
| 7e7194a | ISS-163 | PASS, keep | Addendum accurate: ledger-union.test.mjs filters to `/qa\/(manifests\|verdicts)\//`, excluding qa/contracts/; restoration openly left open (row asked for the disclosure now, restoration later). |
| 647737d | ISS-352 | PASS, keep | `grep -n 'no open issues' qa/loop.md` 0 matches; `grep -n critical/high/medium qa/loop.md` 1 match (line 46). D-013 and project CLAUDE.md both define BACKLOG_EMPTY by open critical/high/medium. qa/loop.md is not under .claude/; the row says maker fix. Punctuation (" -- ... --,") is clumsy, harmless. |
| 0a11ba4 | ISS-A035913-010 | PASS, keep | `rg -n vLast`: 0 in all six .claude/hooks; qa/gates/maker-predicate-canonical-field-and-prose-seam.md:14 says the gate never shipped. The row's own fix_direction is "mark that row withdrawn"; text only, C4 command and the cycle-1 verdict untouched. |

## ISS-164 ruling

Legitimate, not a weakening. The row IS a checker ruling asking for exactly this (G1's gating criterion: fully in the author's control and clearable in the same commit; verdicts and contracts are checker-authored). The two findings that stopped gating are real ambiguity and remain printed as `advisory (not gating)`:
1. qa/verdicts/t-031-audio-watchdog.md cites ISS-001, ISS-002 bare
2. qa/verdicts/t-047-controller.md cites ISS-001, ISS-002 bare

Not enforcement-relevant under the project CLAUDE.md list: `rg tracker-audit .claude scripts package.json` shows it is invoked only by `scripts/lint-loc.mjs` (lint:structure, CI and maker command) and package.json scripts; `mc-precommit.ps1`, `settings.json` and the session hooks never invoke it. No Approver step is required. Umesh may still want to know the sweep duty is not mechanized: nothing reads the advisory lines.

## Gate state

`node scripts/tracker-audit.mjs --gate g1,g4,g5` at f3cb5cc: exit 1, 5 gating G4 findings (t-031, t-033, u3, u4b manifests plus the batch's own manifest line 51) and 2 advisory. Base a71685e `--gate g1,g4`: 6 findings (4 manifests + 2 verdicts). G5 adds no finding on the current tree. The gate was already red on base; it stays red, one finding worse (ISS-MEDFIX2-001).

## The two failing tests: pre-existing, not a regression

Lane: tests 66 / pass 64 / fail 2 (`node --test scripts/lib/tracker-audit.test.mjs scripts/lib/ledger-union.test.mjs scripts/lint.test.mjs`; lint.test.mjs needed a temporary node_modules junction, removed). Base a71685e extracted with `git archive` to a temp dir (deleted afterwards): tracker-audit + ledger-union tests 46 / pass 44 / fail 2, the SAME two names:
- "G4: master's manifests and verdicts are clean under this gate": fails on base on the same bare ISS-001/002 manifests.
- "selected CLI gate cannot hide duplicate ledger IDs": ERR_MODULE_NOT_FOUND for `scripts/qa/unmerged-worktrees.mjs` in the fixture copy; code and test untouched by the lane.
The lane adds passing tests (ISS-164, ISS-315) and a pin update in lint.test.mjs.

## Scope

`git diff a71685e f3cb5cc --name-only`: qa/loop.md, 3 manifests, scripts/tracker-audit.mjs, scripts/lib/tracker-audit(.test).mjs, scripts/lint-loc.mjs, scripts/lint.test.mjs. Nothing in packages/, apps/, enforcement paths, qa/contracts/, qa/verdicts/, ledgers. `lint-dirsize` OK (110 dirs). `lint-loc` reports 7 violations, none in touched files.

## Mutations (timeout 120, per-mutation byte backup, `git hash-object` == HEAD blob verified after each)

1. G5 label back to G2: ISS-315 test red. KILLED.
2. advisory predicate forced false; path test inverted: ISS-164 test red. KILLED x2.
3. exit code counts advisory findings: no test red (46 pass, same 2 base failures). SURVIVED -> ISS-MEDFIX2-002.

## STALE rows (recommendations only; no ledger edited)

All five verified true on this tree:
- ISS-117: `--gate g1` exit 0; TASKS.md:108 U2.4 is `in_progress`. Close.
- ISS-133 and ISS-218: speaker-verbatim-token-boundary.md:12 is `superseded-by speaker-denylist-ledger-corpus (cycle 3 checker PASS ...)`. Close both.
- ISS-161: both gates carry "SUPERSEDED by the line below" (loop-safety-contract-ratification.md:89, vector-retrieval-contract.md:52). Close.
- ISS-266: manifest line 9 `checked-PASS (cycle 2)`; verdict `Cycle checked: 2`, `VERDICT: PASS`. Close.
Existing statuses: open, fixed, verified, wontfix, closed-duplicate, closed-self-corrected. `verified` with a verified_date fits these five. The six fixed rows (ISS-164, 315, 162, 163, 352, A035913-010) -> `fixed` then `verified` after merge (ISS-163: restoration half stays noted as open).

Triage spot-check: GATED ISS-257 (TASKS.md mojibake persists) and COLLIDES ISS-204 (SNAPSHOT.md) classified correctly; CAPPED ISS-135: `grep -c 'EDITED SINCE' docs/PROGRESS.md` = 0, so the symptom is gone and it is closable rather than capped (minor misfile, no harm).

## EXPLANATION

All six fixes do what their rows ask and are safe to merge as a set. Defects found are two low observations: the batch's own manifest adds one gating G4 finding, and the ISS-164 exit-code path is untested. Neither blocks. Nothing was edited outside qa/verdicts/ and qa/issues.medfix2.jsonl.
