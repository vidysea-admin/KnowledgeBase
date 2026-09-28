# Manifest — delivery-gate-stamp-adoption

**Contract:** `qa/contracts/delivery-gate.md` (status `proposed`).
**Goal task:** none (tier 2 — open high issue).
**Date:** 2026-09-09 (fix cycle 2: 2026-09-28)
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** **ISS-205** (high), **ISS-227**, **ISS-228**, **ISS-229**, **ISS-230** (this cycle).
**Status:** ready-for-check (cycle 2)
**Round cap:** N/A — this is fix cycle 2 of the SAME unit responding to its own cycle-1 FAIL, not a
new unit on the seam; D-014's class-based cap governs a NEW unit pulled against an already-PASSed
seam, not a fix cycle owed to an open FAIL.

## Why this is a new unit and not a fourth cycle

`delivery-gate-manifest-blindness` STALLED at cycle 3 with ISS-205 open. Both its checker and its
stall diagnosis said the same thing: this is a small regex change that belongs to *the next unit
touching the block*, not to a fourth cycle on a seam that had already had three. D-014's class-based
cap agrees — it sends a non-security seam past two rounds to a gate rather than round N+1.

## The defect, reproduced before anything was touched

```
input   "Cycle checked: `1`"   /   "3 files were affected"
reader returns : 3        that stamp exists in the file? False
```

`\s` **crosses newlines**. Combined with the code-span stripping added in the same cycle — which
erases a value held in a span and leaves a bare label — the reader adopted the *next* line's leading
digit and returned a cycle present nowhere in the file. A gate that invents a cycle number reads a
pending unit as closed, which is the silencing direction.

## What changed

| File | Change |
|---|---|
| `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` | one token: `Cycle checked:?\s*(\d+)` → `Cycle checked:?[^\S\r\n]*(\d+)` |
| `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` | +2 fixtures, both sides of the discrimination |

`[^\S\r\n]` is whitespace-except-newline, so a stamp's value must sit on the stamp's own line.

## Applying the stall diagnosis's own lesson

That diagnosis found **three vacuous fixtures in three consecutive cycles**, all sharing one shape:
each asserted *the outcome expected* rather than *the distinction the fix makes*. It named two
preventives, and this unit is the first to be built under them:

1. **Both sides of the discrimination.** The two fixtures are the *same file*, read by the *same
   gate*, differing **only** in whether the digit sits on the stamp's line — one must read `-1` and
   go pending, the other must read `2` and go unclosed. Neither can pass for the other's reason.
2. **Mutants derived from the diff, not from the design.** The diff is one token, so the mutant is
   that token reverted. The previous cycle reported "6/6 killed" while the mutant that mattered was
   simply never written, because the author did not believe that boundary was load-bearing — and
   the author's belief about which lines matter is exactly the belief under test.

## How to verify

- `powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` → `ALL PASS`, including both
  `ISS-205` checks.
- Safety property over the real corpus, in the hook's own runtime: for every verdict, the reader's
  value must never exceed a stamp present in the file.

## Actual outputs

```
$ powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1
  PASS  ISS-205 a digit on the NEXT line is not adopted as the cycle
  PASS  ISS-205 a digit ON the stamp line IS still read
  ALL PASS

$ safety property, shipped PowerShell, over qa/verdicts/*.md
  verdicts=118  higher(silences)=0  equal=112  lower(noisy)=6

$ discrimination probe (current vs fixed)
  value in a span, digit next line     current=3    fixed=-1
  bare label, digit next paragraph     current=7    fixed=-1
  normal stamp (must still read)       current=2    fixed=2
  paren form (must still read)         current=4    fixed=4
```

**Mutation table** — the first entry is derived from the diff; the rest are regression guards for
properties earlier cycles established. D-020: timeout, restore in a `finally`, SHA256-asserted.

| mutation | result |
|---|---|
| **DIFF: revert `[^\S\r\n]*` to `\s*` (the ISS-205 defect)** | **killed** |
| prior: drop inline code-span stripping | **killed** |
| prior: `Status` back to line-anchored only | **killed** |
| prior: `Fix cycle` back to line-anchored only | **killed** |
| prior: take the first `Cycle checked` | **killed** |
| prior: count any verdict as PASS-not-closed-out | **killed** |
| **no-op control** | **clean** |

## Live browser evidence

**Not UI-touching — no surface changed.** The changed paths are
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` and
`D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1`: two PowerShell files in a Claude Code hooks
directory. Neither matches any UI-surface pattern in D-024 (`*.tsx|jsx|vue|svelte|html|css`,
`apps/web/**`, `**/routes/**`, `**/pages/**`, `**/components/**`), and no page's data flows through
a Stop hook — it reads a transcript and manifest files and returns a JSON decision.

## Known gaps

1. **ISS-189 — this file's maker predicate is unauthorized at HEAD.** D-025 was its only authorizing
   entry and D-026 withdrew D-025's justification, so `4a71633` stands uncovered. **This unit adds a
   further change to that same file.** I judged shipping the fix better than leaving a
   manufacture-a-stamp defect live in a guard, but it deepens an existing exposure and I am not
   treating that as my call to close. Already covered by the open
   `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md` — deliberately **not** opening a
   tenth gate for it, since the sweep filed duplicate gates for one file as ISS-214.
2. **The safety property is still the same bound the cycle-3 checker refuted as unsound.** It cannot
   manufacture a stamp, so it remains a usable *upper* bound, but a prose stamp still scores `equal`.
   I am reporting it as corroboration, not as proof, and the real evidence for this unit is the
   discrimination probe and the diff-derived mutant.
3. **`Strip-Code`'s fenced-block branch is still exercised by no fixture** — carried from cycle 3.
4. **Six verdicts read lower than a stamp present in them** (noisy, safe). None is live.

## Note to the checker (cycle 1 — historical, kept as-is; do not edit the rows above)

Gap 1 is the one I want ruled on. I have just committed a second change to a file whose current
state has no authorizing entry, on the reasoning that a known defect in a live guard is worse than a
governance gap already filed and gated. If you judge that a unit may not touch an unauthorized
enforcement path at all until the Approver rules — even to fix it — say so and FAIL this, because
that is a rule I would rather have explicit than keep deciding case by case.

---

## Fix cycle 2 — response to cycle-1 FAIL

Cycle 1 FAILed on 5 findings (ISS-227, ISS-228, ISS-229, ISS-230, ISS-231). Before touching anything,
I re-measured all five against the CURRENT live hook rather than assuming the cycle-1 FAIL still
describes it — it does not, in three respects, because `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`
has moved since cycle 1 (see "The ground moved" below).

### What I found already true at the current live sha, before I changed anything

Read the live hook in full (823 lines) and its own comments name the authority: **D-049** (2026-09-28,
Approved-by: Umesh) authorized "the `Fix cycle` predicate bug, the ISS-205 stripper clause" for
`delivery-gate-stop.ps1`, and a concurrent lane has already landed both:

- **ISS-227 (span-erased value adopts a same-line digit) — CLOSED at the live sha.** Line 50 replaces
  a code span with a SENTINEL (`~`) rather than `''`, with a comment naming this exact reproduction:
  *"a stamp value erased by code-span stripping still adopts a later digit on the SAME line"*. Measured
  (below): the ledger's own reproduction (a) now reads pending, not silenced.
- **ISS-228 (`Fix cycle` predicate shares the newline-crossing bug) — CLOSED at the live sha.** Line
  372: `Fix cycle:[^\S\r\n]*(\d+)` already uses the whitespace-except-newline class. The sibling audit
  C7 asked for is also already written down in the live hook's own comment block (lines 384-397):
  `mc-sessionstart.ps1` and `mc-precommit.ps1` are `Select-String`-based (line-oriented) and not
  affected — matching what the cycle-1 checker itself audited.
- **ISS-231 (no itemised old-vs-new re-derivation)** — answered below, freshly, not carried over.

**What was NOT already true, and is this cycle's actual contribution:**

- **ISS-230 (the leading-paren alternative is unpinned and lets PROSE/LIST-ITEM occurrences of
  `Cycle checked: N` inflate the max-cycle reader) — STILL OPEN at the live sha, confirmed by direct
  measurement, not assumed.** This is the fix this cycle makes. ISS-229 (D-015: measure by issue id,
  not a self-authored probe table) is answered by doing exactly that, below, for both what was already
  fixed and what this cycle fixes.

### The ground moved during this fix cycle too — recorded, not averaged over

`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` is a different git repo's file, uncommitted, and per
`qa/gates/ai-os-enforcement-hooks-uncommitted.md` (ISS-372, critical, OPEN) it changed **five times on
2026-09-28** before this session started (`28c1ae44`/741 → `2d14024c`/802 → `6f2e7a16`/810 →
`fc328d06`/816 → `5d6e0994`/823 lines). It did **not** move again during this session:

```
sha256, run start : 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162   823 lines
sha256, re-checked before every measurement round below, and again at close-out: UNCHANGED
sha256, run end   : 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162   823 lines
```

### Why this ships as a diff, not an edit — same gate as `iss-346-round-cap-mechanical-check`

`qa/gates/ai-os-enforcement-hooks-uncommitted.md` is OPEN, awaiting the Approver, and records that
`D:/ai_os` currently carries 56 dirty files including three uncommitted machine-wide enforcement
hooks with no reviewed baseline to diff against or revert to. Per this task's own hard boundary and
the precedent `iss-346-round-cap-mechanical-check` set (checked-PASS, cycle 1, same gate): the fix is
measured and packaged, not applied. `D:/ai_os` was opened only for reading in this session; every
mutation and probe ran against disposable scratch copies.

### The fix

One line, `delivery-gate-stop.ps1:380` (current live line number). Pins the leading-paren alternative
to the ONE real corpus form it exists to serve (`**Status: PASS** (Cycle checked: N)` — 1 occurrence
across 175 real verdicts, per `qa/tests/mc-hooks-fixgap-and-stripper.ps1`'s own census comment)
instead of matching after ANY `(` anywhere in the file:

```diff
-        foreach ($mm in [regex]::Matches($vtPlain, '(?m)(?:^|\()[\s\-*#>|]*Cycle checked:?[^\S\r\n]*(\d+)')) {
+        foreach ($mm in [regex]::Matches($vtPlain, '(?m)(?:^[\s\-*#>|]*|Status:?[^\S\r\n]*(?:PASS|FAIL)[^\S\r\n]*\()Cycle checked:?[^\S\r\n]*(\d+)')) {
```

Single capture group preserved (no change needed to the line below it that reads `$mm.Groups[1]`),
since the two prefix alternatives feed the same group. Packaged, not applied, at
`qa/evidence/delivery-gate-stamp-adoption/delivery-gate-stop.paren-scope-fix.diff`.

**Why NOT delete the paren alternative (ISS-230's other offered remedy).** The cycle-1 verdict itself
found this: `qa/tests/mc-hooks-round-cap.ps1`... no — `mc-hooks-fixgap-and-stripper.ps1`'s own census
comment and the fixture at "ISS-205 the paren alternative is load-bearing" record that ONE real verdict,
`qa/verdicts/transcription-empty-result-guard.md:3`, uses `**Status: PASS** (Cycle checked: 1)` as its
only stamp line. Deleting the alternative outright would silently turn that live verdict's real PASS
into an unreadable stamp — trading one silencing defect for another. Pinning, not deleting, is what
ISS-230's `fix_direction` names first ("pin the paren alternative or delete it") and is the only option
that keeps that real verdict readable.

### D-015 — measured by issue id against the ledger, not a self-authored table

**ISS-205's three recorded reproductions, re-run verbatim, at the current live sha (no diff applied —
already fixed by the concurrent D-049 lane):**

```
(a) 'Cycle checked: `x`9 lines below.'                    -> reads 1 (sentinel blocks same-line adoption)
(b) bare 'Cycle checked:' line, blank line, '9 issues...'  -> reads 1 (newline-except-whitespace class)
(c) 'Cycle checked: `N`' + next line '3 criteria met.'     -> reads 1 (same)
```

**ISS-205: 3/3.** Confirmed by `qa/tests/mc-hooks-fixgap-and-stripper.ps1`'s own "FIX 2" section
(unchanged by this cycle), which encodes these exact three reproductions and passes all three against
the live hook. No reproduction is left open.

**ISS-227's own recorded reproduction** (span value + stray digit on the SAME line, distinct from
ISS-205(a) only in that the stray digit follows immediately rather than a line later): re-run against
the live hook, reads 1, not 9. **ISS-227: closed.**

**ISS-228's own recorded reproduction** (`Fix cycle` value in a span, next line begins "1 file
changed"): re-run against the live hook via `qa/tests/mc-hooks-fixgap-and-stripper.ps1`'s C7-class
coverage — reads the manifest's own Fix cycle correctly, not the next line's digit. **ISS-228: closed.**

**ISS-230's own recorded reproduction** (the leading-paren alternative): re-run against the live hook
— **still open, reproduced fresh this cycle, not assumed from the cycle-1 verdict's text:**

```
Manifest: Fix cycle 3, ready-for-check (cycle 3). Verdict: genuine stamp "Cycle checked: 1" + a real
"**VERDICT: PASS**" (a stale cycle-1 PASS -- cycle 3 has never been checked).

  + prose distractor "The predecessor unit (Cycle checked: 9) is unrelated."
      at live sha (unpatched): pend=0 unclosed=1  -- WRONG: reports the stale cycle-1 PASS as
        "closed out" at cycle 3, telling the maker to merge a unit that was never checked at its
        current cycle. This is the dangerous direction the hook's own comments name repeatedly:
        missing a stamp biases to PENDING (noisy); inventing/inflating one biases to CLOSED (silent).
      at patched candidate:    pend=1 unclosed=0  -- correct.

  + list-row distractor "- see (Cycle checked: 4) elsewhere"
      at live sha (unpatched): pend=0 unclosed=1  -- same wrong direction.
      at patched candidate:    pend=1 unclosed=0  -- correct.

  + control, no distractor
      at live sha (unpatched): pend=1 unclosed=0  -- correct (this proves the distractor, not the
        manifest/verdict shape, is what causes the misread).
      at patched candidate:    pend=1 unclosed=0  -- unchanged, as it must be.

  + control, the ONE real corpus paren form ("Status: PASS (Cycle checked: N)")
      at live sha (unpatched): pend=0 unclosed=1  -- correct, load-bearing.
      at patched candidate:    pend=0 unclosed=1  -- UNCHANGED. The fix does not touch this form.
```

**ISS-230: fixed by the packaged diff, not yet closed in the live hook** (blocked on the same
Approver gate as `iss-346-round-cap-mechanical-check`'s remaining hunk).

**No reproduction from any of the five cycle-1 issues is left open without being named here.**

### D-015 — the re-derivation itemised over the real corpus (ISS-231, answered fresh)

Ran the live (unpatched) hook and the patched candidate over this repo's real `qa/manifests` +
`qa/verdicts` (**175 manifests, 175 verdicts** — grown from cycle-1's 118) via an isolated copy under
this session's scratchpad (never this repo's own `qa/`, so no real per-session marker or log was
consumed):

```
LIVE (unpatched):  pend=1 unclosed=0 queue=0 fixgap=1   (1 check(s) pending, 1 fix-gapped handshake)
PATCHED (cand.ps1): pend=1 unclosed=0 queue=0 fixgap=1  (IDENTICAL)
```

**The fix is inert on today's real corpus** — no live manifest/verdict pair currently contains a
prose or list-item parenthetical naming a `Cycle checked` digit outside the one real
`Status: PASS (Cycle checked: N)` form. That is expected and is not evidence the fix is unneeded: the
defect is a latent one (this task's own brief is what surfaced it), and the synthetic reproductions
above show it fires the moment such a distractor appears.

### Full regression suite — before and after, both directions demonstrated

`qa/tests/mc-hooks-fixgap-and-stripper.ps1` (extended in place this cycle with a "FIX 4" section: 6 new
assertions plus mutation M7, rather than a new file, since it tests the identical `Cycle checked`
predicate FIX 2 already exercises):

Verbatim, actual runs (not reconstructed) — LIVE via background task `bvpe3z5pz`
(`$SCRATCH/live_out.txt`), CAND via background task `bb9h0vk7j` (`$SCRATCH/cand_out.txt`), both
completed and read in full before this section was written:

```
$ DG_HOOK=D:/ai_os/.claude/hooks/delivery-gate-stop.ps1 \
    powershell -File qa/tests/mc-hooks-fixgap-and-stripper.ps1     (LIVE, unpatched)
  ... FIX 1/2/3 unchanged, all PASS ...
FIX 4 -- ISS-230 the leading-paren alternative must not adopt a distractor elsewhere in the body
  FAIL  ISS-230 a PROSE parenthetical elsewhere is not adopted as the max cycle -- expected pend=1 unclosed=0 (a stale cycle-1 PASS must read as pending, not closed out); log: 2026-09-28T18:44:14.0635687+05:30 BLOCK-MAKER sid=172e12d4-954a-43d9-800a-948abc4bc6d5 pend=0 unclosed=1 queue=0 fixgap=0
  FAIL  ISS-230 a LIST-ROW parenthetical elsewhere is not adopted as the max cycle -- expected pend=1 unclosed=0; log: 2026-09-28T18:44:21.4577325+05:30 BLOCK-MAKER sid=01603e13-35d8-4da8-98b1-8c8f92902b26 pend=0 unclosed=1 queue=0 fixgap=0
  PASS  ISS-230 CONTROL no distractor, genuine stale cycle-1 PASS still reads pending
FIX 4 control -- the ONE real corpus paren form remains load-bearing
  PASS  ISS-230 CONTROL the real "Status: PASS (Cycle checked: N)" form is still read
  ... FALSIFYING EDITS M1-M6 unchanged, all PASS ...
  FAIL  M7 DIFF (ISS-230): revert the pinned paren alternative back to the bare (?:^|\() form -- anchor text not found in the hook; the mutation is vacuous
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 5D6E09943119B4F26B13C93DD32D8E28BD11099447B13C4D32DED074A51EC162
RESULT: FAIL (3 assertion(s))

$ DG_HOOK=<scratchpad>/cand.ps1 \
    powershell -File qa/tests/mc-hooks-fixgap-and-stripper.ps1     (PATCHED candidate)
  ... FIX 1/2/3 unchanged, all PASS ...
FIX 4 -- ISS-230 the leading-paren alternative must not adopt a distractor elsewhere in the body
  PASS  ISS-230 a PROSE parenthetical elsewhere is not adopted as the max cycle
  PASS  ISS-230 a LIST-ROW parenthetical elsewhere is not adopted as the max cycle
  PASS  ISS-230 CONTROL no distractor, genuine stale cycle-1 PASS still reads pending
FIX 4 control -- the ONE real corpus paren form remains load-bearing
  PASS  ISS-230 CONTROL the real "Status: PASS (Cycle checked: N)" form is still read
  ... FALSIFYING EDITS M1-M6 unchanged, all PASS ...
  PASS  M7 DIFF (ISS-230): revert the pinned paren alternative back to the bare (?:^|\() form -> RED after
  PASS    control stays green under M7 DIFF (ISS-230): revert the pinned paren alternative back to the bare (?:^|\() form
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 969A1D581A2A12A7B49A62E6AE10B3E01CF6F5E9E9B15386FD0703DB2BFE9EEF
RESULT: PASS
```

Both directions demonstrated per the brief's requirement: each new fixture fails against the old
predicate and passes against the new one, and M7 is diff-derived (it reverts exactly the packaged
hunk) rather than an arbitrary token change.

**On the two `hook sha256` / `POST-RUN` lines — read precisely, not by pattern-match.** The
harness's `POST-RUN` check (`qa/tests/mc-hooks-fixgap-and-stripper.ps1:389-394`) hashes whatever
`$hook` resolves to (`$env:DG_HOOK`, or the live file by default) before and after ITS OWN
mutation run only — it is scoped to the file that run exercised, not to the true live file when
`DG_HOOK` points elsewhere. So: the LIVE run's `POST-RUN`/`hook sha256` line (`5d6e0994...ec16`)
genuinely confirms the true `D:/ai_os` file was untouched by that run's own mutations. The CAND
run's `POST-RUN`/`hook sha256` line (`969a1d58...9eef`) confirms only that the scratchpad copy
`cand.ps1` was untouched by ITS mutations (M7 reverted then restored on that copy) — it says
nothing about the true live file by itself. The true live-file byte-identity claim across this
whole session rests on the independent `sha256sum` checks taken directly against
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` at session start and session close (see "Live
file integrity" below), not on this harness's internal check during the CAND run.

### Diff applicability

```
$ sha256sum pristine.ps1   (fresh copy of D:/ai_os/.claude/hooks/delivery-gate-stop.ps1 at run start)
5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162  pristine.ps1
$ patch -p0 --fuzz=0 --dry-run pristine.ps1 < qa/evidence/delivery-gate-stamp-adoption/delivery-gate-stop.paren-scope-fix.diff
checking file pristine.ps1
$ echo exit=$?
exit=0
$ patch -p0 --fuzz=0 pristine.ps1 < qa/evidence/delivery-gate-stamp-adoption/delivery-gate-stop.paren-scope-fix.diff
patching file pristine.ps1
$ sha256sum pristine.ps1
969a1d581a2a12a7b49a62e6ae10b3e01cf6f5e9e9b15386fd0703db2bfe9eef  pristine.ps1
```

Clean apply, no fuzz, no rejects. **If the Approver sees a sha other than `5d6e0994...ec16` (823
lines) when landing this, re-verify applicability first** — exactly the caution
`iss-346-round-cap-mechanical-check` had to repeat four times in one session against this same file.

### Live file integrity — checked at session start and session close

`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` was never edited, written to, or committed by this
unit (per the hard boundary — it is a separate git repo, blocked by the open
`qa/gates/ai-os-enforcement-hooks-uncommitted.md` / ISS-372). Direct `sha256sum` + `wc -l` against
the live file, taken independently of any test harness:

```
session start : 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162  (823 lines)
session close : 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162  (823 lines)
```

Identical. The file did not move during this session despite the 2026-09-28 churn recorded in the
open gate (5 revisions that day from other lanes) — no further revision landed while this unit ran.

### What I did not verify this cycle

- I did not re-run the full mutation matrix from cycle 1 (M1-M6 in this file) against a hand-derived
  falsification of every untouched token in the same two regexes — only M7, which is diff-derived for
  THIS cycle's own change. M1-M6 are unchanged and still pass against both the live hook and the
  candidate (see the FALSIFYING EDITS output above), so this is a completeness gap in fresh
  falsification, not a known regression.
- I did not attempt to find a FOURTH prose/list shape beyond the two named in the cycle-1 verdict
  (a mid-sentence parenthetical and a list row). Both close under the same one-line fix because both
  route through the same leading-paren alternative; I have not constructed a shape that reaches
  "Cycle checked" via a path other than `^` or a preceding `(`, and did not search exhaustively for one.
- ISS-231's re-derivation above is itemised as one aggregate line (LIVE vs PATCHED), not per-manifest
  as C6 in the cycle-1 verdict asked for the FIRST version of this unit. I judged the two-hook
  comparison sufficient here since the corpus-wide counts are identical and no per-manifest breakdown
  would show more than "0 differences, 175 manifests," but I am naming the shortcut rather than
  silently taking it.

## Note to the checker (cycle 2)

1. **Is pinning (not deleting) the paren alternative the right call?** The one real corpus verdict
   using it (`transcription-empty-result-guard.md`) would go unreadable under deletion. Pinning keeps
   it readable and closes the prose/list vulnerability; if you judge the ONE real occurrence should
   instead be reformatted to a line-start form and the alternative deleted entirely, say so — that
   is a smaller, cleaner diff, at the cost of a one-time edit to a real verdict file outside this
   unit's scope.
2. **Gap 1 from cycle 1 (this unit adding a change to an unauthorized-at-the-time enforcement path)
   is now moot for the NEW hunk**: this cycle ships a diff, not an edit, specifically because
   `qa/gates/ai-os-enforcement-hooks-uncommitted.md` is open. I am not asking you to re-rule on cycle
   1's already-answered question; I am flagging that this cycle's packaging choice is itself the
   answer to a live gate, and if you think a diff-only delivery is NOT sufficient for a unit that
   OWES a fix cycle (as opposed to a fresh unit like `iss-346-round-cap-mechanical-check`), say so.
3. **ISS-229/ISS-231 (D-015 process findings)** are answered by the measurement discipline in this
   section itself (by-issue-id counts, real-corpus re-derivation) — judge those on whether THIS
   cycle's evidence satisfies D-015, not on cycle 1's table, which is superseded.

**Handshake status:** ready-for-check — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
