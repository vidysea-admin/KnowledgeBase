# Verdict — speaker-rules-data-module-extraction

**Date:** 2026-09-28 · **Cycle checked:** 0 · **Checked at commit:** `9642873` (branch
`wave/speaker-rules-data-module-extraction`, worktree
`D:/KnowledgeBase/.claude/worktrees/agent-a8d1076ec05617f80`) · **Merge base:** `116e2fe`

## What I re-ran myself

- `pnpm typecheck` (packages/index) — exit 0, no diagnostics. Matches manifest.
- `pnpm test` (packages/index, `node --test --import tsx`) — 285/285, exit 0. Matches manifest.
- `node scripts/lib/audit-closed-class.mjs` — `enumeration: 409 words (SET A 299 + SET B 110)`,
  `LIVE BYPASSES: 0 / 409`. Matches manifest.
- `node scripts/lint-loc.mjs` — FAIL, 4 violations, the same 4 pre-existing files
  (`speakers-llm.ts`, `sb_join.py`, `obs-windows.ts`, `run-watch.mjs`); both touched files
  (`speaker-name-rules.ts`, `speaker-name-data.ts`) absent from the list. Matches manifest.
- `node scripts/lib/mutate.mjs assert-clean` — `MUTATIONS CLEAN: none outstanding`. Matches.
- Non-blank line counts, independently counted: `speaker-name-rules.ts` = 222 (was 300 at
  `116e2fe`, confirmed via `git show 116e2fe:...`), `speaker-name-data.ts` = 97. Matches manifest's
  headroom claim (78 / 203) exactly.

**Pre-existing-failure claims independently re-verified against `116e2fe`** (via `git archive
116e2fe` into a throwaway extraction outside the bound tree — read-only, no worktree/checkout
created in the shared repo):
- `node scripts/lint-dirsize.mjs` → `apps/api/src: 32 files (budget 31)`, identical at the merge
  base. Confirmed pre-existing, unrelated to this unit.
- `node scripts/snapshot.mjs --check` → the same 93-line directory-drift failure (`docs/features/`,
  `qa/briefs/`, `qa/tests/`), identical first diverging line, present at the merge base. Confirmed
  pre-existing, unrelated to this unit.

## Diff scope (step 4c)

`git diff 116e2fe...9642873 --stat`: exactly 2 source files + the manifest. In
`speaker-name-rules.ts`: the `NEVER_A_PERSON` block and its doc comment, and the `DEMONSTRATIVE_CUES`
line and its doc comment, are removed; one import line is added right after the file's existing
header comment. Every logic function (`looksLikeAName`, `containsNameVerbatim`, `isDiscourseOnly`,
`hasNamingCue`, `citesNameAsAnIntroduction`) and every other constant (`NAME_PARTICLES`,
`NAME_JOINERS`, `NAMING_CUES_BEFORE`, `HANDOVER_MARKERS`, `SELF_NAMING_CUES`, `ADDRESS_GREETINGS`,
`NAMING_CUES_AFTER`, `ADDRESS_FOLLOWERS`, `FUNCTION_FOLLOWERS`) is byte-for-byte untouched in the
diff. `speaker-name-data.ts` is a pure addition (new file). Nothing outside these two files was
touched. No function, export, test, or config key was deleted. Confirmed by reading the full diff,
not just the stat.

## Word-data identity — verified with my own comment-aware extractor, not the manifest's

The manifest's own "426 raw / 425 unique" count is **wrong**: I wrote an independent extractor that
strips `//` and `/* */` comments before parsing string literals (the manifest's counter did not, so
it picked up 4 quoted strings sitting inside doc-comment prose — e.g. the ISS-093/ISS-095
fix-direction quotes and the full sentence `"I am Not sure about that."`). My extractor gives **422
raw / 421 unique** on the merge-base copy of `speaker-name-rules.ts` and on the post-change
`speaker-name-data.ts` — identical on both sides, including full multiplicity (the pre-existing
duplicate `everyone` appears exactly twice in both), and `DEMONSTRATIVE_CUES` is
`["this is","that is","that's"]`, same order, same content, on both sides. The only diff between my
two extraction outputs is the file path in the header line. **The byte-identical-data conclusion
holds**, verified independently of the manifest's flawed counter. Filed as `ISS-SPKDATA-001`
(medium) below — an evidence-accuracy defect, not a behavior defect.

**Audit arithmetic reconciles exactly:** `closed-class-audit-words.json` declares `totals: {words:
409, setA: 299, setB: 110}` and `excludedCollectiveAddress.words` has exactly 12 entries (`guys,
folks, team, people, friends, members, gentlemen, ladies, audience, participants, attendees,
colleagues`). 421 − 12 = 409. No phantom gap.

## DEMONSTRATIVE_CUES move — judged in scope

`DEMONSTRATIVE_CUES` has exactly one use site in the whole repo outside its own declaration
(`speaker-name-rules.ts:183`, inside `hasNamingCue`), confirmed by grep across `*.ts`/`*.mjs`/`*.js`
excluding `node_modules`. `NEVER_A_PERSON` likewise has exactly one use site
(`speaker-name-rules.ts:105`); every other repo hit of either name is prose inside a doc comment or
test file, not an import. D-050-SPEAKER ruling 1's `Changes-authorized` line names
`speaker-name-rules.ts plus one new sibling data module` — file-level, not restricted by constant
name — and the move is the same class of change as the authorized one (pure data, zero behavior
change, disclosed openly in the manifest rather than buried). I judge this within the ruling's
scope: low-risk, transparently justified, and it does not touch logic, schema, or any invariant.

## Capability coverage — all rows independently reproduced

Reproduced in throwaway copies **outside** `D:/KnowledgeBase`
(`%TEMP%/claude/d--KnowledgeBase/.../scratchpad/row1`, `row2` — `git archive 9642873` extractions
of the actual post-change tree, with `node_modules` reachable via a junction to the worktree's own
`node_modules` so `tsx`/the test runner resolve; **no edit was made to the bound worktree at any
point**):

| # | Claim | Green (before) — my run | Red (after) — my run | Restored |
|---|---|---|---|---|
| 1 | Word data unchanged by the move | `audit-closed-class.mjs` → `LIVE BYPASSES: 0 / 409` | after removing `"thou"` → `LIVE BYPASSES: 1 / 409` / `thou` | `cmp` byte-identical to backup; re-ran → `0/409` again |
| 2 | Ceiling genuinely lifted | `lint-loc.mjs` → 4 violations, `speaker-name-rules.ts` absent (222 lines) | after inserting a 79-line filler block (301 lines) → 5 violations, `speaker-name-rules.ts:301 (budget 300)` appears | `cmp` byte-identical to backup; re-ran → back to 4 violations |
| — CONTROL | `pnpm test` stays 285/285 through both mutations | baseline 285/285 | 285/285 during mutation 1; 285/285 during mutation 2 (`node --test --import tsx` re-run in both mutated copies) | N/A (control) |

Both falsifying edits are single-hunk, single-file, exactly as the manifest describes; the
assertion that fired in each case is the one the check is named for (word membership for row 1,
line-count budget for row 2) — neither mutation broke parsing/import globally, and the control
proves that.

## Fast-forward merge

`git merge-base --is-ancestor a99140f 116e2fe` → true: the branch's pre-merge tip is a genuine
ancestor of `116e2fe`, so `git merge master --ff-only` was a real fast-forward, not a rewrite.
`9642873` sits directly on `116e2fe` with only this unit's two-file change plus the manifest.
Nothing else was introduced by the merge.

## Housekeeping note (not this unit's scope, not judged as a defect here)

The manifest's own note about two entries both titled `## D-050` in `docs/DECISIONS.md` is already
resolved by `D-051` (disambiguating `D-050-SPEAKER` / `D-050-CODEX`), which exists in this repo's
history. No action needed from this verdict.

## Verdict

```
VERDICT: PASS
SCOREBOARD: 1/1 criteria met (zero-behavior-change acceptance condition), 0/0 invariants (none
  apply — this unit changes no contract criterion, per its own binding to
  qa/contracts/speaker-resolution-llm.md as infrastructure only)
FAILURES (if any):
- none
CAPABILITY-COVERAGE: 3/3 rows reproduced (2 falsifying edits + 1 control, control verified through
  both mutations), all in a throwaway copy outside D:/KnowledgeBase, all restored + cmp-verified
LIVE-BROWSER: not-applicable (changed paths: packages/index/src/pipeline/speaker-name-rules.ts,
  packages/index/src/pipeline/speaker-name-data.ts — no route, view, template, API handler, or
  persisted document)
ISSUES-WRITTEN: ISS-SPKDATA-001 (medium — manifest's word-count proof states 426/425, true figures
  are 422/421 comment-stripped; does not affect the byte-identical-data conclusion, which I
  reverified independently)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: A pure, byte-for-byte data move authorized by D-050-SPEAKER ruling 1. Every verify
  command reproduces exactly as claimed; both "pre-existing" failures are confirmed pre-existing
  against the actual merge base, not merely asserted; diff scope is exactly two data blocks plus
  one import line, nothing else touched; word data is byte-identical across the move by my own
  independent (comment-aware) extraction, not the manifest's flawed one; all three capability-
  coverage rows reproduce cleanly in an isolated copy. The one real defect found is an evidence-
  accuracy error in the manifest's own word-count arithmetic (medium, ledgered, not a behavior
  defect) — per this repo's D-013 severity gate that is a one-line ledger entry, not a blocker.
```
