# Verdict — iss-104-closed-class-function-words

**Cycle checked:** 0 (matches manifest `Fix cycle: 0`)
**Date:** 2026-09-28
**Checker:** claude-sonnet-subagent (Mode A, single checker — dual check gate did not fire: `.goal/goal.json`
has no task matching this slug, so the criticality:critical trigger is inert here; matches the dispatch's
own "Dual check: NO" note)
**Contract:** qa/contracts/speaker-resolution-llm.md ([C2b], [C12], [C13])
**Bound root:** D:/KnowledgeBase-lanes/iss-104-speaker-closedclass (branch `wave/iss-104-speaker-closedclass`,
base 2bda2f4, HEAD 4f3fd9f)

## VERDICT: FAIL

## Central question (recall-cost tradeoff) — judged and cleared

The manifest's own "Honest limits" #3 discloses that `will`, `can`, `dare`, `need`, `day`, `true` are now
refused as bare single-token candidate names, an accepted cost under C12 (refusal is the safe error when
the verbatim/discourse guards are the only barrier left). I judged this against the contract rather than
its plausibility:

- **No criterion requires recall of these words as names.** C2b's whole purpose is to REQUIRE dropping a
  discourse-shaped single-token candidate; the cost is the intended mechanism operating correctly, not a
  side effect eroding a criterion.
- **Corpus check, not just argument.** I parsed every `turns.json` across all 29 `data/toc-migrated/*`
  sessions for self-introduction/handover patterns (`I am/I'm/This is/my name is/<Name> speaking/<Name>
  here`) and extracted every candidate name the real corpus actually contains. Zero hits for `will`, `can`,
  `dare`, `need`, `day`, `true`, `may`, `march`, `june`, `august` in that role — the accepted cost is real in
  principle but not currently costing anything against this project's own 23-session corpus.
- **The two real prior recall regressions on this seam are not reintroduced.** The dispatch brief's own
  citation of "ISS-094, ISS-098" is itself stale/mislabeled (ISS-094 and ISS-098 in this ledger are
  golden-set-recall and schema-v2 rows, unrelated features — a second instance of the exact id-collision
  problem D-019 exists to name; the real rows are **ISS-105** (greeting/handover/third-party-mention class
  wrongly refused) and **ISS-109** (the `speaking`-gate over-refusal, ten self-introductions). Both remain
  green: `pnpm test` is 285/285 including the pre-existing tests at `speakers-llm.test.ts:324-365` (Prasanti/
  Nilesh/Gotecha cases, ISS-105's class) and the ten `"Ruby speaking ..."` cases in
  `speaker-name-rules.test.ts` (mislabeled `ISS-098` in that file's pre-existing comments/test names —
  confirmed pre-existing, outside this unit's single diff hunk at line 172+, so not this unit's mislabeling
  to fix, and not a regression: the real ledger row is ISS-109).
- **`isDiscourseOnly`'s ALL-tokens bound was verified by breaking it**, not just read (capability row 5
  below): flipping `every`→`some` reddens exactly the three multi-token collision tests (`Will Smith`,
  `Doris Day`, `Can Ozturk`) and nothing else. The safety argument for the tradeoff holds.

**Conclusion on the central question: the tradeoff is real, bounded, disclosed, and consistent with C12 and
contract intent. Not a failure.**

## D-015 measurement — re-derived independently

- Re-ran the ISS-104 20-case ledger corpus myself (via the committed D-015 fidelity test and a direct
  `node --test` run): **17/20 refused**, matching the manifest exactly, with the 3 open cases
  (India/Mumbai/Google) named with their gazetteer-class reason, per D-015's requirement.
- Confirmed the in-file corpus is asserted byte-identical to `qa/issues.jsonl`'s `ISS-104.evidence` field by
  a real test (`D-015: the corpus above is byte-faithful...`), and defeated it live: shortening
  `"I am Not sure about that."` to `"I am Not sure."` reddens **only** that one test (`87→86 pass, 1 fail`)
  while `ISS-093 corpus: "Not" in "I am Not sure." is refused` **stays green** — exactly the manifest's point,
  reproduced.
- The 44-case sentinel corpus (16 classes) is fully re-derivable: I ran it directly and it is 100%
  reproducible.
- **The headline 406-word audit (277→0) is NOT independently re-derivable** — see FAILURES below. This is
  the one place D-015/C13's re-derivability standard is not met.

## Capability coverage: 3/3 rows reproduced

All three rows required an independent throwaway copy (see "Environment anomaly" below for why the bound
tree could not be used directly for this step). Reproduced in a git-clean detached worktree checked out at
HEAD (`4f3fd9f`) outside the bound root, confirmed green before each edit:

| row | edit | before | after | match to manifest |
|---|---|---|---|---|
| 1 — preposition guard | delete `speaker-name-rules.ts:149-151` (3 preposition lines), single hunk | 87/87 | **RED**: `tests 87 / pass 83 / fail 4` — exactly `Between`, `Despite`, `Towards`, `Via`; control `auxiliary/modal: refuses "Should"`, D-015, and all 3 collision-bound tests stayed green | exact |
| 3 — D-015 fidelity | shorten ledger row `"I am Not sure about that."` → `"I am Not sure."`, single hunk | 87/87 | **RED**: `tests 87 / pass 86 / fail 1` — only the D-015 test; `ISS-093 corpus: "Not" in "I am Not sure." is refused` **stays green** (the exact point of the row) | exact |
| 5 — ALL-tokens bound | `speaker-name-rules.ts:173` `tokens.every(` → `tokens.some(` | 87/87 | **RED**: `tests 87 / pass 84 / fail 3` — exactly `Will Smith`, `Doris Day`, `Can Ozturk`; control (`preposition: refuses "Between"`, collision cost, D-015) stayed green | exact |

Every row's assertion-that-fired matched the manifest's pasted output. No row required softening or was
UNVERIFIED.

## Diff scope (4c) — clean

`git diff 2bda2f4...HEAD --stat`: exactly 3 files (`speaker-name-rules.ts` +29, `speaker-name-rules.test.ts`
+134, the manifest +291), **0 deletions** anywhere in the diff (confirmed by grepping `^-` lines, excluding
the `---` header, in both source files — zero real deletions). `speakers.ts` is git-diff-empty against base
([I2] holds). Single hunk in the test file (`@@ -172,3 +172,137 @@`), single contiguous insertion in the
source file. No file outside "What changed" touched.

## Verify commands — re-run myself

- `pnpm test` (packages/index): **285/285**, matches manifest.
- `pnpm typecheck`: exit 0, no diagnostics.
- `node --test --import tsx speaker-name-rules.test.ts`: **87/87**, all named sentinels present and passing
  (all 16 classes × their sample words, plus the 4 collision tests and D-015).
- `node scripts/lint-loc.mjs`: same 4 pre-existing violations (`speakers-llm.ts`, `sb_join.py`,
  `obs-windows.ts`, `run-watch.mjs`); `speaker-name-rules.ts` absent from violations, and I independently
  counted its non-blank lines at **exactly 300** (`loc.max`) — zero headroom, matching the manifest's honest
  limit #5.
- `node scripts/lib/mutate.mjs assert-clean`: `MUTATIONS CLEAN: none outstanding` at the time I ran it
  (see environment-anomaly note — this check only reports on its own armed-mutation ledger, not on file
  fidelity to HEAD, so it does not itself vouch for tree integrity).
- Word-list audit: parsed `NEVER_A_PERSON` myself — **422 total entries, 421 unique, exactly 1 duplicate
  (`everyone`)**, matching the manifest's disclosed pre-existing duplicate (honest limit #6). Base commit
  2bda2f4 actually has **146** entries (not the manifest's stated "147") — 422−146=276, so the **"+276
  words" delta is correct**; only the stated absolute baseline is off by one. Low severity, noted, not
  separately charged.
- Corpus scan for real-name regressions: see "Central question" above — zero hits.

## FAILURES

- **[C13] sev: medium** · The manifest's headline closed-class audit ("406 words enumerated; 277 absent
  from `NEVER_A_PERSON`, all 277 shipped a fabricated person; after: 0/406") is not independently
  re-derivable — no script or word-list artifact is committed (the diff is exactly the 3 files in "What
  changed"; the test file's own comment concedes "the full 406 are the audit in the manifest; these are the
  sentinels"). I could re-derive the 20-case ISS-104 corpus (17/20) and the 44-case sentinel corpus (87/87)
  exactly, both of which ARE committed artifacts — but the 406/277/0 figures rest on manifest prose alone.
  Fix direction: commit the probing script + word-enumeration data file (e.g.
  `scripts/audit-closed-class.mjs`) used to produce these numbers, to the same standard already met by the
  other two corpora. issue: ISS-104CC-1

## CAPABILITY-COVERAGE: 3/3 rows reproduced

## LIVE-BROWSER: not-applicable (changed paths are `packages/index/src/pipeline/speaker-name-rules.ts` and
its test file only — a pure predicate module and its tests, no route/view/API/persistence touched; verified
via `git diff --stat` against base, matching the manifest's own scoping)

## Environment anomaly found during this check (not chargeable to this unit)

Mid-check, with the tree already confirmed green (`pnpm test` 285/285, `node --test` 87/87 with full
per-sentinel detail, matching the manifest), the bound worktree's own two changed files were later found
reverted **on disk** to base-commit `2bda2f4` byte-content (`git hash-object` on both files matched the base
blob exactly, not HEAD's), while `git log`/HEAD still correctly showed the unit's two commits. The checker
made no edit, checkout, reset, or `mutate.mjs apply` call at any point (`mutate.mjs assert-clean` only checks
its own armed-mutation ledger, which was empty, so it does not contradict this). This repo currently holds
~20 concurrent git worktrees (multiple `lane/*` and `wave/*` checkouts plus several `.claude/worktrees/
agent-*`), so a concurrent process touching this exact path during the check is plausible but not confirmed.
Per the hard rule, the checker did not attempt to fix the bound tree; instead it reconstructed the correct,
committed state via `git worktree add --detach <scratch> HEAD` **outside** the bound root and re-verified
everything (full suite, capability-coverage rows) there. This does not affect the verdict on the unit's own
merits — HEAD is correct and independently reverified — but is filed as ISS-104CC-2 since it is exactly the
class of hazard this project's D-020 mutation-safety rule exists to prevent, and is worth investigating
independently of this unit.

## ISSUES-WRITTEN: ISS-104CC-1, ISS-104CC-2 (qa/issues.104cc.jsonl, lane-shard per D-019)

## EXECUTOR: claude-sonnet-subagent (manifest's Executor: claude-sonnet-subagent) (checker: claude-sonnet-subagent)

## EXPLANATION

This is careful, well-argued work: the recall-cost tradeoff the dispatch asked me to weigh is real but
correctly bounded and does not cost anything against the actual 23-session corpus; the two real prior
recall regressions on this seam (ISS-105, ISS-109 — not the dispatch's stale ISS-094/ISS-098 citation) are
not reintroduced; all three capability-coverage rows reproduced byte-for-byte including their controls; the
diff is clean (0 deletions, single hunk, only the claimed files); I2/I3/I4 hold; the source file sits exactly
at the 300-line budget ceiling as claimed. The single reason this is FAIL rather than PASS is C13: the
manifest's own headline measurement (277→0 across 406 enumerated words) is asserted but not shipped as a
re-runnable artifact, unlike the two other corpora in this same unit which are exemplary on exactly this
point. This is a small, mechanical fix (commit the existing script), not a design problem, and I would
expect a fast cycle-1 PASS once it lands, without disturbing anything currently working.

## SCOREBOARD: 18/19 criteria+invariants met, 1 failed (C13); 3/3 capability-coverage rows reproduced

---

# CYCLE 1 CHECK (appended below the cycle-0 FAIL, which is left byte-intact above)

**Cycle checked:** 1 (matches manifest `Fix cycle: 1 of max 3`)
**Date:** 2026-09-28
**Checker:** claude-sonnet-subagent (Mode A, fresh context, dispatched to the primary verdict path —
no `.b.md` dispatch was received for this cycle, so this is the single check performed; the
manifest's `Dual check: required` note is for the dispatcher, not something this session controls)
**Contract:** qa/contracts/speaker-resolution-llm.md ([C2b], [C12], [C13])
**Bound root:** `D:/KnowledgeBase-lanes/iss-104-speaker-closedclass` (branch
`wave/iss-104-speaker-closedclass`, verified via `git -C D:/KnowledgeBase worktree list` — note the
actual path differs from the one named in the dispatch (`.claude/worktrees/iss-104-speaker-closedclass`);
the worktree-list lookup the dispatch itself required is what caught this). Base `2bda2f4`, cycle-0
commit `4f3fd9f`, HEAD `0a3463c`.

## VERDICT: PASS

## C13 — re-derivability, the cycle-0 failure — CLOSED, re-derived myself

Re-ran both audit commands the manifest names, independently:

- `node scripts/lib/audit-closed-class.mjs` → `enumeration: 409 words (SET A 299 + SET B 110)` /
  `AFTER (current tree): LIVE BYPASSES: 0 / 409` — exact match.
- `node scripts/lib/audit-closed-class.mjs --base 2bda2f4` → `BEFORE (2bda2f4): LIVE BYPASSES: 276 / 409`
  — exact match to the manifest's table (409 enumerated / 276 missing-at-base / 133 already-present /
  0 live now).

Read `scripts/lib/audit-closed-class.mjs` in full: it is not a shortcut dressed as a script.
`probeCurrent`/`probeBase` both import the real `extractSpeakers` from `speakers-llm.ts` (the base run
via `git show <ref>:...speaker-name-rules.ts` written to a scratch file behind the *current, unchanged*
harness) and drive it through the same offline `replies()` fake-completion pattern the test suite uses —
no network, no LLM, no hardcoded pass/fail table.

**Independently verified the enumeration itself is not hand-picked to produce a nice number** — I
extracted `NEVER_A_PERSON` straight from `speaker-name-rules.ts` myself (stripping `//` comments first,
since a naive quote-regex over-counts by picking up quoted words inside comments): **422 total entries,
421 unique, exactly 1 duplicate (`everyone`)** — matching both the manifest and the cycle-0 checker's
independent count exactly. I then computed `421 unique − 12 excludedCollectiveAddress words = 409` and
diffed that computed set against `closed-class-audit-words.json`'s 409 entries: **zero words missing,
zero words extra, exact set equality.** The committed data file is provably `NEVER_A_PERSON` minus the
declared exclusions, not an independently-authored list that happens to total 409.

Also confirmed via `git diff 4f3fd9f..0a3463c --stat`: exactly 5 files changed, all the manifest names
(`closed-class-audit-words.json` new, `audit-closed-class.mjs` new, `qa/issues.104cc.jsonl` +2 lines,
the manifest itself, no verdict-file entry since that was already committed at `16e58ca`) — no
surprises.

## Claim 1 — speaker-name-rules.ts / .test.ts byte-identical since cycle 0

`git diff 4f3fd9f..0a3463c -- packages/index/src/pipeline/speaker-name-rules.ts
packages/index/src/pipeline/speaker-name-rules.test.ts` → **empty, both files.** Confirmed true: no
words added, no behaviour changed. Every capability-coverage row and the D-015 test therefore stand on
exactly the code cycle-0's checker already judged correct on the merits (recall-cost tradeoff, I2/I3,
etc.) — cycle 1 only adds the two audit artifacts and corrects manifest prose.

## Claim 2 — `pnpm install --force`, no source touched

`git status --porcelain=v1` in the bound worktree: **empty**, clean tree at HEAD. `git diff
2bda2f4...HEAD --name-only` shows no `pnpm-lock.yaml` change. Re-ran `pnpm test` in `packages/index`
myself: **285/285**, matching the manifest exactly. The install repaired local `node_modules` only;
nothing committed was touched by it.

## Claim 3 — 300 non-blank lines, zero headroom

`grep -c '.' packages/index/src/pipeline/speaker-name-rules.ts` → **300** (total physical lines: 313,
so 13 blank/comment-boundary lines make up the difference — matches `loc.max: 300` in
`structure.config.json` exactly). `node scripts/lint-loc.mjs` → same 4 pre-existing violations
(`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:359`, `run-watch.mjs:447`);
`speaker-name-rules.ts` absent from the violation list. Matches.

## Claim 4 — cycle 0's 406/277/0 figures: honestly disclosed, not conflated

The manifest's "Cycle 1" section puts the old and new numbers in one explicit table headed "cycle 0
claimed (uncommitted, unverifiable)" vs. "cycle 1 re-derived (committed, ...)" and states in prose that
the surviving "406/277"/"147" occurrences further down are "cycle 0's original, uncorrected prose, left
as the historical record of what was claimed at the time." That is an accurate description of what is
actually in the document — I read the surviving occurrences (`## The real defect, measured` etc.) and
each one does carry an inline `[corrected in cycle 1: ...]` bracket pointing back to the real figure.
Nothing is silently presented as if 409/276/133 were always the numbers.

## Claim 5 — `mutate.mjs assert-clean`, `pnpm typecheck`

`node scripts/lib/mutate.mjs assert-clean` → `MUTATIONS CLEAN: none outstanding`. `pnpm typecheck` in
`packages/index` → exit 0, no diagnostics. Both clean, both re-run myself, not pasted-output trust.

## Capability coverage: 3/3 rows reproduced (independently, by me, this cycle)

The manifest's coverage table is unchanged from cycle 0 (no new capability claims — cycle 1 adds no
runtime behavior), but per SKILL.md 4b "always" I reproduced all three rows myself rather than relying
on cycle 0's checker's reproduction, in a **fresh throwaway copy** built via `git archive HEAD` into
`<scratch>/iss104-row-d015-fast` (outside `D:/KnowledgeBase` entirely) with `node_modules` attached via
Windows directory junctions (instant, avoids a slow full copy; junctions resolve to real files so the
copy's own edits never touch the linked node_modules). Confirmed green-before (`87/87`) in the copy
before every edit.

| row | edit (single hunk, single file, in the throwaway copy only) | before | after | match |
|---|---|---|---|---|
| 1 — preposition guard | delete `speaker-name-rules.ts:149-151` (3 preposition lines) | 87/87 | **RED**: `tests 87 / pass 83 / fail 4` — exactly `Between`, `Despite`, `Towards`, `Via`; control (`auxiliary/modal: refuses "Should"`, D-015, all 3 collision-bound tests) stayed green | exact |
| 3 — D-015 fidelity | shorten ledger row `"I am Not sure about that."` → `"I am Not sure."` in the test file | 87/87 | **RED**: `tests 87 / pass 86 / fail 1` — only the D-015 test, assertion text `"the in-file corpus must equal the ledger's own cases, in order — substituting a corpus is the D-015 defect"`; control `ISS-093 corpus: "Not" in "I am Not sure." is refused` **stayed green** — the exact point of the row | exact |
| 5 — ALL-tokens bound | `speaker-name-rules.ts:173` `tokens.every(` → `tokens.some(` (line 173 only — line 48's unrelated `tokens.every` in a different function was left untouched, confirmed by line-scoped `sed`) | 87/87 | **RED**: `tests 87 / pass 84 / fail 3` — exactly `Will Smith`, `Doris Day`, `Can Ozturk`; control (`preposition: refuses "Between"`, collision cost) stayed green | exact |

Also read `speaker-name-rules.test.ts:193-230` (the D-015 test) directly: it walks up from the test
file to find the repo's `qa/` directory, reads every `qa/issues*.jsonl` shard (the D-019 ledger union,
not a hardcoded copy), locates the real `ISS-104` row, regex-parses its `evidence` field for the 20
`"TEXT"/"NAME"->person:` reproductions, and asserts the in-file `ISS_093_CORPUS` constant is
`deepEqual` to that extraction. I independently located `ISS-104` in `qa/issues.jsonl` and confirmed
its `evidence` field contains exactly the same 20 cases the test parses and the manifest's "Actual
outputs" section pastes. Not a hardcoded copy dressed as a fidelity check.

## Diff scope (4c) — clean, full unit

`git diff 2bda2f4...HEAD --stat`: **7 files, 0 deletions** (`closed-class-audit-words.json` new,
`speaker-name-rules.test.ts` +134, `speaker-name-rules.ts` +29, `qa/issues.104cc.jsonl` +2, the
manifest +368, the verdict file +156, `audit-closed-class.mjs` new). No file outside the manifest's
"What changed" (plus the expected ledger-shard and verdict paths) is touched. `speakers.ts` remains
git-diff-empty against base (**[I2]** holds).

## LIVE-BROWSER: not-applicable (cycle-1 changed paths: `packages/index/src/pipeline/closed-class-audit-words.json` (data), `scripts/lib/audit-closed-class.mjs` (node script, not imported by any shipped path), the manifest, and `qa/issues.104cc.jsonl` — no route/view/API/persistence surface, confirmed via `git diff 4f3fd9f..0a3463c --stat`)

## Ledger

- `ISS-104CC-1` → moved `open → fixed` (regression_check: `node scripts/lib/audit-closed-class.mjs`,
  a real command that errors/mis-reports the moment the committed script or word-list drifts from
  `NEVER_A_PERSON` — re-run in `qa/issues.104cc.jsonl`).
- `ISS-104CC-2` (the worktree-file-reversion anomaly from cycle 0) — **left open, untouched.** This
  unit neither claims nor could plausibly fix a concurrent-worktree-integrity hazard; it is out of
  this unit's scope. Worth a human's attention independently of this verdict.
- `ISS-104` itself stays exactly where the manifest leaves it (17/20, 3 open gazetteer cases) — this
  unit does not claim to close it and I am not crediting it as closed.

No new issues found. `ISSUES-WRITTEN: none` on a correct implementation is a complete and creditable
check, not a lapse (project CLAUDE.md "Verdict rule") — I looked for a reason to doubt the
re-derivability claim specifically (the one thing cycle 0 failed on) and could not find one after
independently reproducing every number in the table.

## EXECUTOR: claude-sonnet-subagent (manifest's Executor: claude-sonnet-subagent) (checker: claude-sonnet-subagent, fresh context, no memory of building either cycle)

## EXPLANATION

Cycle 1 does exactly what it claims and nothing more: two new, non-runtime artifacts (a data file and
a probe script) that make C13's headline audit independently re-runnable, plus manifest prose
corrections, with the two files that carry actual behavior (`speaker-name-rules.ts` and its test)
proven byte-identical to the already-judged-correct cycle-0 state. I re-derived every number in the
manifest's before/after table myself, confirmed the word-list is a provable, exact function of
`NEVER_A_PERSON` (not a hand-tuned list), reproduced all three capability-coverage rows and their
controls from scratch in an independent throwaway copy, and found the historical-vs-corrected numbers
honestly distinguished rather than quietly swapped. The one open item from cycle 0 (ISS-104CC-2, a
worktree-integrity anomaly) is unrelated to this unit's scope and is left open on the ledger.

## SCOREBOARD (cycle 1): 19/19 criteria+invariants met (adds C13 to cycle 0's 18/19); 3/3 capability-coverage rows reproduced independently
