# Verdict — golden-set-silent-fabrication

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude Sonnet subagent (claude-sonnet-subagent), Anthropic session, no `ANTHROPIC_BASE_URL` override
**Bound root:** `D:\KnowledgeBase`
**Artifact location:** worktree `D:\KnowledgeBase\.claude\worktrees\agent-a4bf95ea22f117a7e`, branch
`wave/golden-set-silent-fabrication`, commits `c13dad5` (fix) + `f5fd02d` (manifest). Not yet merged
at check time.

## What I re-ran myself

1. `node --test scripts/lib/eval-recall.test.mjs qa/probes/golden-set-sibling-semantic.test.mjs`
   in the worktree — reproduced **8/8 pass**, matching the manifest.
2. **Independent mutation falsification** (I did not trust the maker's table; I wrote and ran my
   own mutations under D-020 discipline — byte backup, `trap cleanup EXIT INT TERM ERR`, `timeout
   30`, `cmp`-verified restore):
   - Reverted `computeFilterBias`'s absent-file branch to the pre-fix `return null;` →
     **1/4 red** in `scripts/lib/eval-recall.test.mjs`, exactly on
     `ISS-271: rejected file absent -> measured:false...`, assertion `must not be a bare null (the
     exact ISS-271 defect)`, `actual: null`. The other 3 stayed green (correct isolation).
   - Reverted `computeMarginRow` to the pre-fix `-2` sentinel fabrication
     (`marginMeasured = true; margin = exp - (rivalBest ? rivalBest[1] : -2)`) → **2/4 red** in
     `qa/probes/golden-set-sibling-semantic.test.mjs`, on the no-rival test and the degenerate-pool
     framing test, both failing `true !== false` on `marginMeasured`. The one-rival and
     multi-rival tests stayed green.
   - Both restores verified: `node scripts/lib/mutate.mjs list` → `no outstanding mutations`,
     `git status --short` → empty, `cmp` succeeded both times. Nothing was left on disk.
3. Read both changed source files in full and confirmed the `isMain` guards
   (`scripts/eval-recall.mjs:318-323`, `qa/probes/golden-set-sibling-semantic.mjs:47-48`) wrap only
   the live Mongo/embedding body; the extracted pure functions (`computeFilterBias`,
   `computeMarginRow`) sit outside the guard and are what the tests import. Diffed the removed
   lines against the new code (`git diff a99140f...HEAD`) and confirmed every deleted line
   reappears, unchanged in behavior, inside the extracted function or the `isMain` block — this is
   a faithful extraction, not a disabled path. Manually simulated `isMain` resolution
   (`import.meta.url.endsWith(basename(process.argv[1]))`) for a direct invocation of
   `eval-recall.mjs` and confirmed it evaluates `true`.
4. `node scripts/lint-loc.mjs` → 4 violations, identical set to the manifest's claimed baseline
   (`speakers-llm.ts`, `sb_join.py`, `obs-windows.ts`, `run-watch.mjs`) — no 5th added.
   `wc -l` / non-blank count on `scripts/eval-recall.mjs` → **298** non-blank lines (budget 300, 2
   lines headroom) — confirmed exactly as claimed.
5. `find scripts -maxdepth 1 -type f | wc -l` → **32**, matching `structure.config.json`'s
   `dirsize.overrides.scripts: 32` exactly — the "already at 32/32" claim is true, not an
   exaggeration to justify the workaround.
6. `git diff a99140f...HEAD --stat` and the full diff: only `package.json`,
   `qa/manifests/golden-set-silent-fabrication.md`, `qa/probes/golden-set-sibling-semantic.mjs`,
   `qa/probes/golden-set-sibling-semantic.test.mjs`, `scripts/eval-recall.mjs`,
   `scripts/lib/eval-recall.test.mjs` touched — all listed in "What changed." No function, export,
   route, test, or config key was deleted without a criterion requiring it; every removed line is
   accounted for as moved-not-dropped (item 3).
7. **Base-commit check for the reported `pnpm test:lint` failure**, done independently rather than
   trusted: added a detached worktree at `a99140f` (the commit immediately before this unit's fix,
   `c13dad5`), ran `node --test scripts/snapshot.test.mjs` there directly (no `pnpm install`
   needed — the file imports only Node builtins and local modules) → **same failure**,
   `snapshot.mjs: current repo's docs/SNAPSHOT.md is <= 200 lines`, 3 pass / 1 fail, before any of
   this unit's changes existed. Confirms the manifest's claim: pre-existing, unrelated to this fix.
   Worktree removed after the check (`git worktree remove ... --force`); nothing left behind.
8. Ledger union check (`qa/issues.jsonl` — no per-lane shards apply to this wave): confirmed
   ISS-271 and ISS-272 both carried **no `fix_direction` key and no `reproductions` key at all**
   (not merely empty/null — the keys are absent), verified with a small script reading the JSON
   objects directly rather than trusting the manifest's paraphrase. The manifest's own summary
   ("empty `fix_direction`... `reproductions: null`") is the right substance (no recorded cases
   existed to re-run) even though the literal field state is "absent" rather than
   "present-and-null" — a wording nit, not a misrepresentation.

## Judgment on the corpus (the D-015 question)

The corpus is genuinely derived from the conditions each issue's own title names, not shaped to
whatever the code happens to do:

- **ISS-271** (title: fabricates on missing input) → tests cover rejected-file **absent**,
  **present-but-empty**, and **present-with-rows**, plus a fourth structural test asserting the
  three resulting shapes are mutually distinguishable (the actual defect class: absence and
  "measured, zero bias" collapsing to the same observable shape). That is the complete condition
  space the title implies.
- **ISS-272** (title: fabricates when no rival exists) → tests cover **no rival**, **exactly one
  rival**, and **normal multi-rival** (with a best-rival-not-just-next-ranked assertion folded in),
  plus a fourth test re-asserting the degenerate case can never read as "clearly unambiguous."
  Again the complete condition space named in the title.

Both test suites assert on the exact field the fix computes (`measured` / `marginMeasured`), not on
a value the test itself supplies — which is what makes the mutation falsification meaningful rather
than circular. I verified this is not "marking its own homework" by not trusting that framing and
instead writing independent mutations myself; they reproduced red on exactly the fields and rows
the corpus claims, nothing more, nothing less.

## Judgment on the `scripts/lib/` test placement (item 5)

Sound, not a hidden ceiling problem being buried. The 32/32 claim is independently verified true.
Given a fix-cycle-0, two-issue unit, raising the `dirsize` override requires a named DECISIONS entry
(D-017) that is legitimately out of scope here — touching an enforcement config to make room for a
test is a bigger, unauthorized change than the two silent-fabrication fixes this unit exists to
ship. Placing the test in `scripts/lib/` (already scanned by `pnpm test:lint`, with headroom) and
disclosing the convention break plainly in the manifest is the right-sized choice. It is, however,
a forward-looking risk worth naming: the next unit that wants a `scripts/`-sibling test hits the
same wall. Recorded below as an observation, not a ledger row (low severity, per this session's own
instruction not to manufacture backlog).

## Judgment on new files (item 6)

Three new files: two test files + the manifest. This falls inside the normal allowance, not
something that needed asking. TDD is this repo's own lifecycle policy for any bugfix ("test: a new
feature or bug fix in code → test-driven-development before writing implementation code"), the repo
already has an established sibling-test convention (`scripts/lint.test.mjs`,
`scripts/snapshot.test.mjs`) that these two follow in spirit (one had to break the *sibling*
placement for the reason above, not the *existence* of a test), and the manifest is the maker-
checker pair's own required artifact, not a duplicate module the anti-drift rule is aimed at. No
Approver escalation needed for this unit on this ground.

## Live browser

Not applicable. Both changed files are CLI/offline evaluation tooling (`scripts/eval-recall.mjs`,
`qa/probes/golden-set-sibling-semantic.mjs`) with no web surface — confirmed by reading both files
in full; neither touches `apps/web` or renders anything a person views in a browser.

## Persona walk

Not applicable — no UI surface, per the manifest and confirmed above.

VERDICT: PASS
SCOREBOARD: 2/2 issues fixed (ISS-271, ISS-272), 8/8 tests independently reproduced green, 2/2 falsifying mutations independently reproduced red-on-defect
FAILURES (if any): none
CAPABILITY-COVERAGE: 2/2 rows reproduced (both falsifying mutations re-driven independently by the checker, not taken from the manifest's table; both isolate the named field, no wrong-reason reds)
LIVE-BROWSER: not-applicable (CLI/offline eval scripts, no `apps/web` surface touched)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent; self != executor confirmed, no ANTHROPIC_BASE_URL override)
EXPLANATION: Both fixes replace a fabricated "looks-good" value with a structurally distinguishable
NOT-MEASURED state, exactly the defect class named. Independent re-derivation (own mutations, own
base-commit check, own line counts, own file counts) confirmed every claim in the manifest rather
than trusting it. One low-severity, non-blocking observation for the record: `scripts/` sits at its
dirsize ceiling (32/32) and any future scripts/-sibling test will need the same workaround or a
D-017 DECISIONS entry to raise the override — not filed as a ledger row per this check's own
instruction to avoid manufacturing backlog on a low-severity note.

Ledger update: `qa/issues.jsonl` ISS-271 and ISS-272 moved `open → fixed` (fixed_date 2026-09-27,
fix_direction, fixed_evidence and regression_check recorded); `verified_date` left `null` pending
merge to master, consistent with this repo's existing ISS-337 pattern (fixed at PASS, verified
after merge/close-out).
