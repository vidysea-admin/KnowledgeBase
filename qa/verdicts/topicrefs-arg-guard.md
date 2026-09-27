# Verdict — topicrefs-arg-guard

**Date:** 2026-09-27
**Cycle checked:** 0
**Unit branch/commit:** `wave/topicrefs-arg-guard` @ `333c7f1`
**Worktree:** `D:/KnowledgeBase/.claude/worktrees/agent-ab604ab2206349e24`
**Issue:** ISS-C-TOPICREFS-ARG-001 (medium, feature `tree-index-v2`)

## What I re-ran myself (not trusted from the manifest's paste)

1. Read `qa/issues.jsonl:143` (both the worktree's copy and the main-tree copy — identical) in
   full. Confirmed verbatim: `"Cause is the FIXTURE, not the assertions"` and
   `"the shipped argument is correct"` are the row's own words, not the builder's paraphrase.
   The row's `fix_direction` explicitly asks for "one fixture line ... then assert the claims
   `updateOne` body `$set.topicRefs`" — a test-only fix, not a guard.
2. Read the three source locations the manifest cites and confirmed each line number exactly:
   - `packages/index/src/tree/promote-entities.ts:95` — `topicRefsForSession(sessionId, topics)`,
     a pure `filter(...).map(...).sort()` over `string`, total by construction.
   - `packages/index/src/tree/promote-entities.test.ts:114-121` — the existing negative-case test
     already asserts `topicRefsForSession("unknown", topics) -> []`.
   - `apps/api/src/indexing/promote-entities.ts:115` — the call site, `sessionId` already typed
     `string`, unchanged by this unit.
3. Re-ran `promote-entities.test.ts` in the worktree: **19/19 pass** (matches manifest).
4. Re-ran the full `apps/api` suite: **196/196 pass** (matches manifest).
5. Re-ran `pnpm typecheck` (apps/api): exit 0, clean (matches).
6. Re-ran `pnpm -r typecheck` repo-wide: all 10 workspace projects `Done`, clean (matches).
7. Re-ran `node scripts/lint-loc.mjs`: same 4 pre-existing violations, no 5th (matches).
8. Re-ran `node scripts/lint-dirsize.mjs`: OK, 88 dirs within budget (matches).
9. Re-ran `npx depcruise --config .dependency-cruiser.cjs packages apps workers`: clean, 370
   modules / 1153 deps (matches).
10. Confirmed `scripts/` is 32 top-level files (`find scripts -maxdepth 1 -type f | wc -l` = 32);
    no new file added anywhere (matches "32/32" claim — `ls | wc -l` alone misleadingly reports
    35 because it counts 3 subdirectories too).
11. `git show 333c7f1 --stat`: only `apps/api/src/indexing/promote-entities.test.ts` (+39/-0) and
    the new manifest changed. No production/source file touched, no deletion or rename of any
    existing function/test/export (diff-scope check, step 4c: clean).
12. Read `qa/contracts/entity-promotion.md` C4 (line 88) and I2 (line 172) in full. Both exist and
    genuinely name this defect's class, though the manifest is honest that it's an extension "one
    layer in": C4's worked examples are about a Mongo *filter* selecting which document a write
    hits; this defect is about a predicate (`sessionRefs.includes(sessionId)`) selecting which
    *values* a write's body carries. Same shape (an unasserted selector letting a write go to/carry
    the wrong thing), traceably not tortured. I2 ("coverage absent until a mutation proves it
    present") matches exactly — this is literally that pattern one function deeper.

## Independent mutation reproduction (the one thing on trust otherwise)

Rather than accept the manifest's pasted RED/GREEN outputs, I reproduced **both halves** myself,
using `scripts/lib/mutate.mjs`'s arm/restore ledger inside the unit's own worktree, verifying
byte-identical restore via the tool's own check and `git status --short` clean after each:

- **Base/pre-fix half (the historical blindness):** swapped in the pre-fix test file
  (`git show 333c7f1^:...test.ts`, 364 lines vs 403 today — the exact 39-line delta) and armed the
  same mutation (`topicRefsForSession(sessionId, topics)` → `topicRefsForSession("s2", topics)`
  at `apps/api/src/indexing/promote-entities.ts:115`). Result: **18/18 GREEN** — confirms the
  argument really was unobservable before this unit, independent of the ledger row's original
  discovery.
- **Post-fix half (the fix's value):** restored the pre-fix test file, re-armed the identical
  mutation against the CURRENT (fixed) test file. Result: **RED, 18 pass / 1 fail** —
  `actual: ['t:funding']`, `expected: ['t:visa-rules']`, exactly matching the manifest's pasted
  output, and the only test that reddens is the new one.
- Restored the source file both times (`mutate.mjs restore` → "verified identical to HEAD"),
  restored the swapped test file from a byte backup, ended with `mutate.mjs list` → "no outstanding
  mutations" and `git status --short` → clean, then re-ran the suite once more to confirm 19/19
  green in the final, unmutated state.

This is the capability-coverage row's claim, verified from scratch rather than trusted.

## Judgement on the reframing

**The builder's reframing is correct.** The row genuinely says the shipped argument is correct and
names the fixture as the cause. A call-site or function-boundary guard would have been the wrong
fix (would defend a call that was never wrong — the ISS-333 shape the row itself warns against). A
test-only fix closing this row is the honest answer, not a downgrade of effort.

## D-020 trap deviation

**Already tracked — not a fresh finding.** `qa/issues.jsonl` (main tree) already carries
**ISS-347** (medium, filed by the maker today), which names this exact unit
(`topicrefs-arg-guard`) among three independent reports of the same sandbox refusal, states the
real gap correctly (restore is guaranteed on the normal-return path, not on
timeout/interrupt/mid-run error — the exact failure D-020 was written for), and correctly declines
to auto-resolve it (needs an Approver decision between amending D-020 to sanction the
`mutate.mjs` ledger vs. finding an accepted trap form). I independently re-derived the same
judgement before finding ISS-347: the ledger-based arm/restore/cmp/list protocol is **real
after-the-fact protection** (would catch a surviving mutant on the next run or sweep) but is
**not equivalent** to a trap that fires during a hang — if `node --test` had hung rather than
failed, no explicit next step would run and the mutant would sit on disk until someone
intervened, which is exactly the ISS-083/hop=-1 failure mode D-020 exists to prevent. For this
specific unit the risk was low (a one-line string-literal swap into a synchronous `Array.includes`
filter, not a loop), and in both of my own reproductions the tree ended clean and verified. I am
not filing a duplicate — ISS-347 already covers it correctly and is explicitly marked "must not
become a pulled unit" pending the Approver's decision.

## Fixture duplication (treeRootExclusiveTopics vs treeRoot)

Judged as the right call. `treeRoot()` is unchanged and still backs its 18 existing assertions
exactly as before; `treeRootExclusiveTopics()` is a small, clearly-documented, purpose-built
fixture used by exactly one test. Modifying the shared fixture would have broken 18 tests that pin
its one-topic shape for an unrelated reason. One extra named fixture with a doc comment explaining
why is a reasonable cost, not drift.

## Ledger

`ISS-C-TOPICREFS-ARG-001` moved `open -> fixed` in the main-tree `qa/issues.jsonl` (line 143),
with `regression_check` set to the exact command
(`cd apps/api && node --test --import tsx "src/indexing/promote-entities.test.ts"`) and a
`checker_note` recording that the regression check was already confirmed, in this same session, to
fail when the fix is reverted — so a later sweep can promote it `fixed -> verified` on that basis
without re-deriving it from zero.

```
VERDICT: PASS
SCOREBOARD: 1/1 capability rows reproduced, contract citations (C4, I2) confirmed to genuinely cover the class
FAILURES (if any): none
CAPABILITY-COVERAGE: 1/1 rows reproduced (both mutation halves re-derived independently by the checker, not taken from the manifest's paste)
LIVE-BROWSER: not-applicable (changed paths: apps/api/src/indexing/promote-entities.test.ts, qa/manifests/topicrefs-arg-guard.md — no UI/route surface touched)
ISSUES-WRITTEN: none (ISS-C-TOPICREFS-ARG-001 updated open->fixed, not opened; ISS-347 already tracks the D-020 trap deviation, not duplicated)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent; no ANTHROPIC_BASE_URL override)
EXPLANATION: The dispatch brief's framing ("add an argument guard") was wrong and the builder's
reframing ("this is a fixture defect per the row's own words") is right, confirmed by reading the
ledger row myself. Both halves of the mutation claim (green-before, red-after) were independently
reproduced by the checker via mutate.mjs's arm/restore ledger, not taken on trust. Only soft spot
found is the already-tracked D-020 trap-vs-sandbox conflict (ISS-347), which does not block this
unit and is correctly gated to the Approver rather than resolved here.
```
