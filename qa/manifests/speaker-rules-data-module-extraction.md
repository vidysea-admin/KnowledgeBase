# Manifest — speaker-rules-data-module-extraction

**Contract:** qa/contracts/speaker-resolution-llm.md — no criterion changes; this unit is
infrastructure for [C2b]/[C12], not a change to either. The unit is authorized directly by
**D-050 ruling 1** (docs/DECISIONS.md, `Approved-by: Umesh`), which is the explicit "create a new
file" permission the user-global edit-in-place discipline otherwise requires, scoped to this
extraction only.

**Goal task:** No `.goal/goal.json` task id equals this slug. The nearest related task is `U2.4`
("Speaker resolution (TOC turns are literally spk:0)"), whose own `criticality` field is **`low`**
(`base_criticality: MEDIUM`), not critical. ISS-104 itself (the issue this unit unblocks) is filed
`critical` in `qa/issues.jsonl`, but per this manifest's instructions the Dual check line below is
decided from the goal-task match, not from issue severity.

**Date:** 2026-09-28

**Fix cycle:** 0 of max 3

**Dual check:** Not required by the goal.json-task-id criterion (no task id matches this slug, and
the related U2.4 task is `low`, not `critical`). Noted for the checker's own judgement: D-013's
severity gate requires full ceremony for issues at high/critical severity, and ISS-104 (the blocked
issue this unit exists to unblock) is critical — this manifest is written to full-ceremony standard
regardless, so the distinction is not being used to cut corners.

**Persona walk:** Skip — this touches no UI surface. The diff is two files, both non-runtime-facing
data/logic modules with no route, view, template, API handler or persisted document anywhere in
the change: `packages/index/src/pipeline/speaker-name-rules.ts` (modified) and
`packages/index/src/pipeline/speaker-name-data.ts` (new). No user type can observe a difference;
checkable via `git show --stat` on this unit's commit.

**Executor:** claude-sonnet-subagent

**Executor rationale:** a pure, mechanically-verifiable data move with a hard zero-behavior-change
acceptance bar — exactly the kind of unit where the discipline (extract byte-for-byte, prove it with
a diff, re-run every existing gate) matters more than model strength.

---

## Why this unit exists

`packages/index/src/pipeline/speaker-name-rules.ts` held the `NEVER_A_PERSON` denylist (409
audited closed-class/role words, per `scripts/lib/audit-closed-class.mjs`) plus
`DEMONSTRATIVE_CUES`, and sat at **exactly 300 non-blank lines — the `loc.max` ceiling, zero
headroom** (confirmed independently below; also recorded in `qa/gates/speaker-seam-loc-ceiling.md`
and the ISS-104 cycle-2 gate commit `82fa0dd`). ISS-104 (open, critical) cannot progress until that
ceiling is lifted — one more denylist word does not fit. D-050 ruling 1 authorized exactly this
extraction as the fix.

## What changed

- **New file:** `packages/index/src/pipeline/speaker-name-data.ts` — exports `NEVER_A_PERSON` (the
  409-word `Set`, plus its full doc comment) and `DEMONSTRATIVE_CUES` (the 3-entry cue array, plus
  its full doc comment), copied byte-for-byte from their prior location, with only `const` changed
  to `export const` on each declaration line. A fresh header comment (not copied text) explains the
  split and cites D-050 ruling 1.
- **Modified file:** `packages/index/src/pipeline/speaker-name-rules.ts` — the two blocks above are
  removed and replaced with one import line:
  `import { DEMONSTRATIVE_CUES, NEVER_A_PERSON } from "./speaker-name-data.js";`
  placed right after the file's existing top-of-file header comment. Every logic function
  (`looksLikeAName`, `containsNameVerbatim`, `isDiscourseOnly`, `hasNamingCue`,
  `citesNameAsAnIntroduction`) and every other constant (`NAME_PARTICLES`, `NAME_JOINERS`,
  `NAMING_CUES_BEFORE`, `HANDOVER_MARKERS`, `SELF_NAMING_CUES`, `ADDRESS_GREETINGS`,
  `NAMING_CUES_AFTER`, `ADDRESS_FOLLOWERS`, `FUNCTION_FOLLOWERS`) is untouched — same lines, same
  order, same comments. `git diff --stat` for the modified file: `81 +----- ... 2 insertions(+), 79
  deletions(-)` (the 2 insertions are the import line + its trailing blank line; the 79 deletions
  are the two moved blocks minus what didn't need re-adding).
- **Import surface:** `NEVER_A_PERSON` and `DEMONSTRATIVE_CUES` were never exported from
  `speaker-name-rules.ts` and have no external importers anywhere in the repo (verified by
  `grep -rn "\bNEVER_A_PERSON\b"` / `"\bDEMONSTRATIVE_CUES\b"` across `*.ts`/`*.mjs`/`*.js` before
  the move — both hits were the module-internal `const` declaration and its own two use sites,
  plus doc-comment mentions in `speaker-name-rules.test.ts` and `scripts/lib/audit-closed-class.mjs`
  that reference the name in prose, not as an import). So **no re-export was needed and no caller
  needed updating** — the constants simply moved from module-private in file A to exported-but-only-
  imported-by-file-A in file B.
- **DEMONSTRATIVE_CUES decision:** moved, not left behind. It is pure data of the same kind as
  `NEVER_A_PERSON` (a literal array, no logic), is used only inside `speaker-name-rules.ts`
  (`hasNamingCue`), and the task brief itself named it alongside `NEVER_A_PERSON` as part of what
  the file "holds." Moving it adds a further ~9 lines of headroom at zero marginal risk (same
  import, same zero-behavior-change proof). The other cue-phrase constants (`NAMING_CUES_BEFORE`,
  `HANDOVER_MARKERS`, `SELF_NAMING_CUES`, `ADDRESS_GREETINGS`, `NAMING_CUES_AFTER`,
  `ADDRESS_FOLLOWERS`, `FUNCTION_FOLLOWERS`) and `NAME_PARTICLES` were **not** moved — they were not
  named in the brief, and moving them was out of this unit's explicit scope ("Anything else is out
  of scope").
- **Pre-existing duplicate `everyone` entry** (appears once under "pronouns and quantifiers", once
  under "collective address") is preserved exactly as duplicated — confirmed by the word-set diff
  below (426 raw entries before and after, 425 unique both times).

## Housekeeping note (not part of this unit's scope, filed for the record)

While reading `docs/DECISIONS.md` to verify D-050 existed before touching a byte of code (my
worktree branch was several commits behind `master` and did not yet have D-050 committed — I
fast-forward merged `master` into my branch first, see "Verification gap" below), I found **two
separate entries both titled `## D-050`** in the file: this ruling (four Approver rulings, this
unit's authorization) and an unrelated one about `.codex/hooks/` disposition. This is an id
collision in the shared ledger, not a per-lane-shard issue (D-019) since both are in the same file.
Not fixed here — outside this unit's scope — but flagged so the checker/orchestrator can decide
whether it needs its own entry (analogous to D-037's correction of a different duplicate-id
mistake).

## Verification gap disclosed, not hidden

My worktree (`D:/KnowledgeBase/.claude/worktrees/agent-a8d1076ec05617f80`) was dispatched from a
branch that, at the time I started, was **behind `master`** and did not yet contain D-050 (or
D-040 through D-049) in its `docs/DECISIONS.md` — I could not verify the authorization the task
brief cited until I confirmed `master..HEAD` was empty (no unique commits on my branch) and
fast-forward merged (`git merge master --ff-only`, `Updating a99140f..116e2fe`). After that merge,
D-050 ruling 1 is present, verbatim, with `Approved-by: Umesh`. I did not proceed on the extraction
itself until this was confirmed. The merge is visible in the branch history below.

## Mechanical proof of zero word-data change

Sorted the `NEVER_A_PERSON` word set from `speaker-name-rules.ts` as committed at the merge base
(`116e2fe`, via `git show HEAD:...`) against the word set in the new
`speaker-name-data.ts`, and diffed:

```
BEFORE count (raw, with duplicates): 426
AFTER  count (raw, with duplicates): 426
BEFORE unique: 425
AFTER  unique: 425
Sorted arrays identical (incl. duplicate multiplicity): true
DEMONSTRATIVE_CUES before: ["this is","that is","that's"]
DEMONSTRATIVE_CUES after : ["this is","that is","that's"]
DEMONSTRATIVE_CUES identical (order + content): true
```

```
$ cmp before-words.txt after-words.txt && echo "CMP: IDENTICAL (byte-for-byte)"
CMP: IDENTICAL (byte-for-byte)
$ diff before-words.txt after-words.txt && echo "DIFF: no differences"
DIFF: no differences
$ wc -l before-words.txt after-words.txt
 426 before-words.txt
 426 after-words.txt
 852 total
$ grep -c "^everyone$" before-words.txt after-words.txt
before-words.txt:2
after-words.txt:2
```

(426, not 409 — `audit-closed-class.mjs`'s 409 is the enumeration in
`closed-class-audit-words.json` after excluding the 12 collective-address words per its own
documented method; 426 is the raw literal count in the `Set(...)` including those 12 plus the
non-audited pronoun/greeting/etc. words that predate ISS-104 cycle 4. Both counts are unaffected by
this move — the 426-vs-409 distinction exists on both sides identically, before and after.)

## How to verify

Run from `D:/KnowledgeBase/.claude/worktrees/agent-a8d1076ec05617f80` (or `packages/index` where
noted). No `cd X && cmd` prefixes used — each ran from its own working directory or via a plain
absolute path.

1. `pnpm typecheck` in `packages/index`
2. `pnpm test` in `packages/index`
3. `node scripts/lib/audit-closed-class.mjs`
4. `node scripts/lint-loc.mjs`
5. `node scripts/lint-dirsize.mjs`
6. `node scripts/lib/mutate.mjs assert-clean`
7. `node scripts/snapshot.mjs --check` (part of `pnpm lint:structure`)

Bonus (not required by the brief, run anyway as due diligence): `node scripts/lint-dupes.mjs`,
`npx depcruise --config .dependency-cruiser.cjs packages apps workers`.

## Actual outputs

**1. Typecheck — exit 0, no diagnostics:**
```
> @lkb/index@0.0.0 typecheck
> tsc --noEmit -p tsconfig.json
(no output — exit 0)
```

**2. Test — 285/285, exit 0 (the exact count on master today):**
```
ℹ tests 285
ℹ suites 0
ℹ pass 285
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**3. Closed-class audit — exact match to the required strings:**
```
enumeration: 409 words (SET A 299 + SET B 110)
AFTER  (current tree): LIVE BYPASSES: 0 / 409
```

**4. lint-loc — the 4 pre-existing violations only; `speaker-name-rules.ts` and
`speaker-name-data.ts` both absent:**
```
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:572 (budget 300)
```
(This command's own exit code is 1 because it is a linter reporting violations — the same 4 it
already reported before this unit touched anything; that is the "still absent from that list"
condition the brief asked to prove, not a new failure.)

**New line counts and headroom (the entire point of the unit):**
```
packages/index/src/pipeline/speaker-name-rules.ts -> non-blank: 222  headroom to 300: 78
packages/index/src/pipeline/speaker-name-data.ts  -> non-blank: 97   headroom to 300: 203
```
Before this unit: `speaker-name-rules.ts` was 300/300 (0 headroom). After: 222/300 (**78 lines of
headroom**) in the rules file, and the new data file has 203 lines of headroom of its own before
even IT would need a further split — i.e. roughly 280 more denylist words could be added before
`speaker-name-data.ts` itself would need attention (rough estimate: current 409-word enumeration
occupies ~55 lines at ~7-8 words/line).

**5. lint-dirsize — OK for the directory this unit touches; one PRE-EXISTING, unrelated failure
disclosed rather than hidden:**
```
lint-dirsize: FAIL — 1 violation(s)
  apps/api/src: 32 files (budget 31)
```
`packages/index/src/pipeline/` (the directory this unit adds a file to) went from 14 to 15 files,
against a cap of 30 (no override needed, well within budget) — that directory does not appear in
the violation list. The one violation shown, `apps/api/src`, is **unrelated to this unit** (I never
touched `apps/`) and is **pre-existing on the merge base**. Proved, not asserted: I temporarily set
aside my two-file change with `git stash push -u -m "verify-dirsize-preexisting-tmp-21132795"`,
re-ran `node scripts/lint-dirsize.mjs` against the bare merge-base tree (`116e2fe`), got the
identical `apps/api/src: 32 files (budget 31)` failure, then restored my change with
`git stash apply <sha>` (verified via `git status --porcelain` showing exactly the same two-file
diff as before) and dropped the stash entry by its recorded SHA
(`0336a6bc4d9ebfd76cfafae8cd4857682cf56aeb`).

**6. Mutation guard — clean:**
```
MUTATIONS CLEAN: none outstanding
```

**7. Snapshot check — FAILS, confirmed PRE-EXISTING on the merge base, same method as #5:**
```
FAIL: docs/SNAPSHOT.md is stale (93 line(s) differ from a fresh regeneration): ...
```
The 93-line diff is entirely directory-listing drift unrelated to this unit (`docs/features/`,
`qa/briefs/`, `qa/tests/` — none of which this unit touches). Verified pre-existing the same way as
#5: stashed (`verify-snapshot-preexisting-tmp-21132795`), re-ran against `116e2fe` bare, got the
identical 93-line failure with the identical first diverging line, restored (`git stash apply
2f1a5fc5c898095a8eccf9a39bf35eb957e4d4df`), dropped the stash entry by its recorded SHA. This unit
does not regenerate `docs/SNAPSHOT.md` — it is generated, out of this unit's scope, and was already
broken before this unit started.

**Bonus checks (not required, run anyway):**
```
lint-dupes: OK (455 unique export(s), 26 unique schema $id(s))
✔ no dependency violations found (375 modules, 1177 dependencies cruised)
```

## Capability coverage

Each claim below is bound to a single-hunk edit to a single named file, with real green-before /
red-after command output, and reverted with a byte-level (`cmp`) restoration check afterward.

| # | Claim | Falsifying edit (single-hunk, single file) | Green (before mutation) | Red (during mutation) | Restored / control |
|---|---|---|---|---|---|
| 1 | The word data is unchanged by the move (`NEVER_A_PERSON`/`DEMONSTRATIVE_CUES` content identical, not just line-count-identical) | Removed `"thou", ` from the `NEVER_A_PERSON` set in `speaker-name-data.ts` (one word, one hunk) | `node scripts/lib/audit-closed-class.mjs` → `LIVE BYPASSES: 0 / 409` | Same command → `LIVE BYPASSES: 1 / 409` / `  thou` | Reverted via backup copy; `cmp` confirmed byte-identical to pre-mutation file; re-ran → `LIVE BYPASSES: 0 / 409` again |
| 2 | The ceiling is genuinely lifted (`speaker-name-rules.ts` has real headroom, not merely "currently under 300 by coincidence") | Inserted a 79-line filler-comment block (one contiguous hunk) into `speaker-name-rules.ts` right after the new import line, pushing it from 222 to 301 non-blank lines | `node scripts/lint-loc.mjs` → `speaker-name-rules.ts` absent from the violation list (4 violations, all pre-existing) | Same command → `speaker-name-rules.ts:301 (budget 300)` appears as a 5th violation | Reverted via backup copy; `cmp` confirmed byte-identical to pre-mutation file; re-ran → back to the same 4 pre-existing violations |
| — | **CONTROL** — an unrelated, stable behavior that must NOT be affected by either mutation above (proves the mutations are localized, not a global break) | *(no edit — run during each mutation above)* | `pnpm test` in `packages/index` → 285/285 (baseline, captured separately above) | Re-ran **during mutation 1** → still 285/285. Re-ran **during mutation 2** → still 285/285 | N/A — this row is the control; it is expected to stay green throughout, and did |

## Status: checked-PASS

**Handshake status:** checked-PASS (Cycle checked: 0, verdict
`qa/verdicts/speaker-rules-data-module-extraction.md` committed 42b11fc, VERDICT: PASS,
CAPABILITY-COVERAGE 3/3 rows reproduced by the checker in its own throwaway copy,
LIVE-BROWSER not-applicable, ISSUES-WRITTEN: ISS-SPKDATA-001 medium) - closed out 2026-09-28.

**What this unit did:** lifted the `loc.max` ceiling that had blocked ISS-104. `speaker-name-rules.ts`
300/300 -> 222/300 non-blank lines (78 headroom); new `speaker-name-data.ts` at 97/300 (203
headroom). Two data blocks moved out, one import line in, every logic function and every other
constant byte-for-byte untouched.

**What it did NOT do: ISS-104 stays open and critical.** This unit changed no behavior whatsoever -
that is its acceptance condition, not a shortfall. The audit still reports 0/409 live bypasses on the
enumerated closed-class words, and ISS-104's actual residue is untouched and not word-list-shaped:
India, Mumbai and Google are gazetteer-bound, each with a person-valid twin of identical syntax.
Nothing here may be cited as progress on the fabrication defect. What changed is that the next word
now fits.

### Correction recorded rather than quietly fixed - ISS-SPKDATA-001 (medium)

**This manifest's own mechanical word-count proof states the wrong numbers.** It reports
`NEVER_A_PERSON` at **426 raw / 425 unique**. The true figures are **422 raw / 421 unique**.

Cause: the counter extracted string literals from the `Set` literal body **without stripping `//` and
`/* */` comments first**, so four quoted strings sitting inside this block's doc-comment prose were
counted as denylist entries - among them an issue's `fix_direction` phrase and a full sentence.

Two independent confirmations, one of which had made the same mistake first: the orchestrator caught
the figure before relaying it (its own first count reproduced the identical error until it stripped
comments), and the checker then wrote its own comment-aware extractor and got 422/421 on both the
merge-base file and the new data file, with full multiplicity match including the duplicate
`everyone` twice on each side.

**The byte-identical-data conclusion still HOLDS** - both sides of that diff were produced by the same
flawed counter, and the checker re-derived the equality independently. The defect is the reported
figure, which would mislead a future reader. Filed medium per the D-013 severity gate: a one-line
ledger entry, not a blocker, and deliberately not in the verdict's FAILURES list.

**Corroborating arithmetic, independently reconciled by both the checker and the orchestrator:**
`closed-class-audit-words.json` declares `totals: {words: 409, setA: 299, setB: 110}`, its
`excludedCollectiveAddress.words` holds exactly 12 entries, the set difference between the real
denylist and the enumerated words is exactly those 12 and nothing else, and 421 - 12 = 409.

### Scope judgement the checker upheld

`DEMONSTRATIVE_CUES` was moved alongside `NEVER_A_PERSON`. Judged in scope: D-050-SPEAKER ruling 1's
`Changes-authorized` is file-level ("`speaker-name-rules.ts` plus one new sibling data module"), not
restricted to a named constant; both constants have exactly one use site each and no external
importer anywhere in the repo; and the move was disclosed in this manifest rather than buried.
