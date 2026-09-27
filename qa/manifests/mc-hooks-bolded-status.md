# Manifest — mc-hooks-bolded-status

**Contract:** D-034 (docs/DECISIONS.md) is the direct authorization. `qa/contracts/delivery-gate.md`
[C7] applies by extension — [C7] requires a defect found in one predicate to be audited across
every sibling hook that shares the pattern; ISS-176 named `delivery-gate-stop.ps1` (AIOS shared
hook, already fixed) and ISS-183 is exactly that [C7] audit landing on this repo's two siblings,
`mc-sessionstart.ps1` and `mc-precommit.ps1`.
**Goal task:** none (tier 2 — open high issue, ISS-183).
**Date:** 2026-09-27
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-176 (the bold-blindness class, originally filed against
`delivery-gate-stop.ps1`; this unit is its sibling-hook extension), ISS-183 (high — the same class,
unfixed in `mc-sessionstart.ps1` and `mc-precommit.ps1`, plus the first-not-highest verdict-cycle
defect in `mc-sessionstart.ps1`).

## Why

`mc-sessionstart.ps1` (the SessionStart AUTO-CONTINUE directive) and `mc-precommit.ps1` (the commit
guard) both matched manifest Status lines with the bare literal `Status: ready-for-check`. Every
line the pre-fix hooks could see one of `## Status: ready-for-check` (heading form); everything else
— `**Status:** checked-PASS (verdict qa/verdicts/mc-hooks-bolded-status.md, cycle 1, d8c45ed; /aios-config-auditor CLEAN)` (bold), `- **Status:** ready-for-check` (bulleted+bold), and
`Status: ready-for-check` sitting mid-sentence in prose containing the phrase "ready-for-check" —
either went invisible (bold/list forms: a truly-pending unit is reported as clear) or produced a
false positive (unanchored prose match: an already-closed unit is reported as still pending).
`mc-sessionstart.ps1` additionally piped `(Cycle checked|Fix cycle judged)[:*\s]+(\d+)` through
`Select-Object -First 1`, taking the first verdict-cycle stamp in the file rather than the highest —
so a verdict re-checked at cycle 2 after an earlier cycle-1 FAIL entry earlier in the same file was
read as still-at-cycle-1, misreporting a checked unit as pending.

## What changed

- `.claude/hooks/mc-sessionstart.ps1:15` — Status-line pattern changed from the bare literal
  `Status: ready-for-check` to
  `^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+ready-for-check`, anchored to line
  start, tolerating a leading list marker, a leading `#{1,6}` heading marker, and up to 3 leading/
  trailing `*`/`_` emphasis characters around `Status:`.
- `.claude/hooks/mc-sessionstart.ps1:19-25` — verdict-cycle read changed from
  `Select-Object -First 1` (first match) to a loop over every `Select-String` match in the verdict
  file, keeping the MAXIMUM captured cycle number (`$vc`) instead of the first.
- `.claude/hooks/mc-precommit.ps1:43` — same Status-line pattern change as above (status pattern
  only; this hook has no cycle logic).
- Nothing else in either hook changed: output text, firing conditions ($env:CLAUDE_PROJECT_DIR
  resolution, the `git commit` trigger, the `qa/.mutations-active` DENY branch, the WARN/AUTO-CONTINUE
  wording) are byte-identical to HEAD before this diff — confirmed by `git diff` showing only the
  two hunks below (see Evidence).
- ISS-307 (the stall check at `mc-sessionstart.ps1` reading only the first line of `qa/.last-tick`)
  is explicitly NOT touched, per the unit brief and D-034's own scope note.

## [C7] sibling-hook audit (delivery-gate.md)

Checked, per-hook:
- `delivery-gate-stop.ps1` (`D:/ai_os/.claude/hooks/`) — already fixed (ISS-176 SWEEP CLOSE,
  2026-09-09); not in this repo's Changes-authorized scope; not touched here.
- `mc-sessionstart.ps1` — affected, fixed by this unit (status pattern + max-cycle).
- `mc-precommit.ps1` — affected, fixed by this unit (status pattern only; it has no cycle logic to
  audit).
- No other repo-committed hook under `.claude/hooks/` in this repo reads a manifest Status or verdict
  Cycle line (grep across `.claude/hooks/*.ps1` for `Status:` / `Cycle checked` — only these two hit).

## How to verify

```
cd D:\KnowledgeBase-lanes\mc-hooks-bolded-status
git diff .claude/hooks/mc-sessionstart.ps1 .claude/hooks/mc-precommit.ps1   # the two authorized hunks
powershell -NoProfile -File qa/tests/mc-hooks-bolded-status.ps1            # fixture suite, baseline vs fixed
```

The fixture script (`qa/tests/mc-hooks-bolded-status.ps1`, outside the enforcement paths) is
re-runnable: it builds a synthetic `qa/manifests` + `qa/verdicts` corpus in a temp dir outside any
git repo, runs both hooks against it, then (D-020 mutation-run safety) temporarily overwrites the
two hooks with their pre-fix content from commit `22b6eb6` inside a try/finally, re-runs the same
corpus as the "before" case, and restores the working tree's real hook bytes from an in-memory
backup — verified with `Get-FileHash` before continuing (throws and aborts if the restore doesn't
match byte-for-byte). Both hook invocations run inside `Start-Job` with `Wait-Job -Timeout`.

Fixture corpus (6 manifests):
- `fixture-bolded` — `**Status:** ready-for-check` (ISS-176 class)
- `fixture-unbolded` — `Status: ready-for-check` (regression control, pre-fix already worked)
- `fixture-heading` — `## Status: ready-for-check` (regression control, pre-fix already worked)
- `fixture-listmarker` — `- **Status:** ready-for-check` (ISS-176 class)
- `fixture-prose-negative` — real Status is `**Status:** checked-PASS`, but the file's prose
  contains "this unit is not ready-for-check anymore" and "Previous status: ready-for-check" —
  must NOT match (anchoring negative)
- `fixture-maxcycle` — manifest `Fix cycle: 2`; verdict has `Cycle checked: 1` / `VERDICT: FAIL`
  followed later by `Cycle checked: 2` / `VERDICT: PASS` (ISS-183 max-cycle class)

## Evidence

Diff (unchanged from the inherited work; reviewed and confirmed correct against D-034, no edits
needed beyond what was already staged):

```
diff --git a/.claude/hooks/mc-precommit.ps1 b/.claude/hooks/mc-precommit.ps1
@@ -40,7 +40,7 @@
-    $u = (Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue | Select-String -Pattern 'Status: ready-for-check' -List | Measure-Object).Count
+    $u = (Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue | Select-String -Pattern '^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+ready-for-check' -List | Measure-Object).Count

diff --git a/.claude/hooks/mc-sessionstart.ps1 b/.claude/hooks/mc-sessionstart.ps1
@@ -12,12 +12,17 @@
-    if (-not (Select-String -Path $m.FullName -Pattern 'Status: ready-for-check' -Quiet)) { continue }
+    if (-not (Select-String -Path $m.FullName -Pattern '^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+ready-for-check' -Quiet)) { continue }
     if (-not (Test-Path $v)) { $pending += $m.BaseName; continue }
     $mc = 0; $a = Select-String -Path $m.FullName -Pattern 'Fix cycle[:*\s]+(\d+)' | Select-Object -First 1
     if ($a) { $mc = [int]$a.Matches[0].Groups[1].Value }
-    $vc = -1; $b = Select-String -Path $v -Pattern '(Cycle checked|Fix cycle judged)[:*\s]+(\d+)' | Select-Object -First 1
-    if ($b) { $vc = [int]$b.Matches[0].Groups[2].Value }
+    $vc = -1
+    foreach ($bm in (Select-String -Path $v -Pattern '(Cycle checked|Fix cycle judged)[:*\s]+(\d+)')) {
+      foreach ($mm in $bm.Matches) {
+        $cv = [int]$mm.Groups[2].Value
+        if ($cv -gt $vc) { $vc = $cv }
+      }
+    }
```

Fixture run, **BEFORE** (hooks temporarily reverted to `22b6eb6` inside the test's try/finally):

```
Checks pending: 3 [fixture-heading, fixture-prose-negative, fixture-unbolded]
PASS not closed out: 0
WARN maker-checker: 3 unit(s) still awaiting /checker verdict.
```
`fixture-bolded` and `fixture-listmarker` (ISS-176 class) are invisible — truly pending units
reported as clear. `fixture-prose-negative` is a false positive — an already-`checked-PASS` unit
reported as pending because "Previous status: ready-for-check" matches the unanchored literal.
`fixture-maxcycle` is also invisible (its Status line is bolded) — 0/0, not counted either way, so
the max-cycle defect never even gets exercised pre-fix.

Fixture run, **AFTER** (working tree's real, fixed hooks):

```
Checks pending: 4 [fixture-bolded, fixture-heading, fixture-listmarker, fixture-unbolded]
PASS not closed out: 1
WARN maker-checker: 5 unit(s) still awaiting /checker verdict.
```
All four true ready-for-check forms (bold, bare, heading, bulleted-bold) are now seen and none of
them is `fixture-prose-negative` (anchoring holds). `fixture-maxcycle` is correctly resolved via the
MAX cycle (2, not the first-seen 1) and lands in "PASS not closed out" (its checker PASSed cycle 2,
but the manifest was never flipped off `ready-for-check`) rather than in "Checks pending" (which
would wrongly imply cycle 2 was never checked at all). `mc-precommit`'s WARN count rises from 3
(2 correct + 1 false positive) to 5 (all 5 true ready-for-check manifests, false positive gone).

Full assertion run (`qa/tests/mc-hooks-bolded-status.ps1`), re-run twice for stability:
```
[PASS] ISS-176 baseline MISSES bolded+listmarker (pending)
[PASS] ISS-176/183 fixed SEES bolded+heading+listmarker+unbolded (pending)
[PASS] Anchoring: fixed excludes prose-negative from pending
[PASS] Anchoring regression check: baseline WRONGLY includes prose-negative (false positive fixed)
[PASS] ISS-183 baseline: maxcycle invisible (pending excludes it, unclosed count=0)
[PASS] ISS-183 fixed: maxcycle resolved via MAX cycle (2) not first (1) (unclosed count=1)
[PASS] mc-precommit baseline WARN count (expected 3)
[PASS] mc-precommit fixed WARN count (expected 5)
TOTAL: 8 checks, 0 failed.  EXIT: 0
```
D-020 restore verification, printed by the script on both runs:
```
RESTORE VERIFIED byte-identical (Get-FileHash): mc-sessionstart.ps1=7572419965047942FA196528E85D065837CBB9381CD13DCD4E1CFD343E5A685C mc-precommit.ps1=920FF6FBA0E55B683C97EBBC7D94161C069BA617FA8D476F23C8CF6490EBC03E
```
`git diff --stat` before and after both runs was unchanged (`.claude/hooks/mc-precommit.ps1 | 2 +-`,
`.claude/hooks/mc-sessionstart.ps1 | 11 ++++++++---`) — the mutation-run left nothing armed.

**Measured against the ISS-176 / ISS-183 rows themselves (D-015):** ISS-176's evidence names three
literal manifest lines the old regex could not see: `write-guard-enforcement-gaps.md:12`,
`speaker-verbatim-token-boundary.md:12` (both `**Status:** ready-for-check`), and names
`hybrid-arms-binding.md:170`'s `## Status: ready-for-check` as "the one form the old regex could
see." All three of those manifests have since moved past `ready-for-check` in the live repo (checked
2026-09-27 — `write-guard-enforcement-gaps.md` and `speaker-verbatim-token-boundary.md` are now
STALLED/superseded, `hybrid-arms-binding.md` is `checked-PASS`), so their *current* state can no
longer reproduce the original counts; the fixture corpus above reproduces the exact three literal
line-forms ISS-176 quoted (bold, bold, heading) verbatim as `fixture-bolded` / `fixture-listmarker` /
`fixture-heading`, plus the ISS-183 max-cycle defect using the same `Select-Object -First 1` failure
mode the two issues describe. ISS-183's own live reproduction (`pend=2
[delivery-gate-manifest-blindness, hybrid-arms-binding]` pre-fix vs `pend=2
[delivery-gate-manifest-blindness, write-guard-enforcement-gaps]` corrected) is a 2026-09-09 snapshot
of a corpus that has since changed underneath it (same three manifests named above); it is recorded
here for traceability but is not re-runnable verbatim today because its inputs no longer exist in
that state.

## Cross-check against D-034's literal ask

- Must match: `Status: ready-for-check`, `**Status:** ready-for-check`, `## Status: ready-for-check`,
  `- **Status:** ready-for-check` — all four covered by fixtures above; all four PASS.
- Must NOT match: prose like `not ready-for-check` (fixture-prose-negative's "this unit is not
  ready-for-check anymore") or `Previous status: ready-for-check`-style mid-line mentions (the same
  fixture's second prose line) — anchored at line start; both PASS (excluded).
- Cycle read takes the MAX verdict cycle — fixture-maxcycle, PASS.
- Nothing else in the hooks changed — confirmed by `git diff` showing exactly the two authorized
  hunks (see Evidence) and no other line touched.

## Open

- ISS-307 (stall check reads only the first line of `qa/.last-tick`) remains open, out of scope per
  the unit brief and D-034.
- ISS-183's live-corpus reproduction can't be re-run verbatim (inputs moved on); flagged above rather
  than silently substituted, per D-015.

**Status:** checked-PASS (Cycle checked: 1, verdict `qa/verdicts/mc-hooks-bolded-status.md`, VERDICT: PASS, ISSUES-WRITTEN: none; wave/mc-hooks-bolded-status already merged into master) — closed out by /maker 2026-09-27
