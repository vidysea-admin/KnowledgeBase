# Verdict — delivery-gate-stamp-adoption

**Cycle checked:** 2
**Date:** 2026-09-28
**Checker:** Mode A, fresh context, bound to `D:/KnowledgeBase`. self != executor — did not write
`2bf1a49` or any commit on this branch.
**Commit under check:** `2bf1a49` (fix cycle 2), on branch `wave/stamp-adoption-cycle2`. Judged in
isolation via `git diff f622418 2bf1a49`; the branch also carries `c4387ef` and `f622418` from other
sessions and `5a25b12` (a bookkeeping tick, `qa/.last-tick` only) that landed on the branch **during
this check** — none of the three is this unit's work and none is scored here.
**Contract:** `qa/contracts/delivery-gate.md` (status `proposed`).

```
VERDICT: PASS
SCOREBOARD: ISS-227 confirmed closed at live sha (independently, by reading the hook's own source,
  not the manifest's paraphrase) · ISS-228 confirmed closed at live sha (independently) · ISS-230's
  two recorded reproductions (prose parenthetical, list-row parenthetical) fixed by the packaged
  diff — reproduced myself in both directions: LIVE unpatched RESULT: FAIL (3 assertions), PATCHED
  candidate RESULT: PASS, byte-identical to the manifest's own claimed run · diff-apply verified
  clean at --fuzz=0 against the live sha, result sha256 969a1d581a2a12a7b49a62e6ae10b3e01cf6f5e9e9b1
  5386fd0703db2bfe9eef matches the manifest exactly · the one real corpus control
  (transcription-empty-result-guard.md's "**Status: PASS** (Cycle checked: 1)") verified genuinely
  singular across all 175 verdicts (a second grep hit is a citation of the form inside a DIFFERENT
  checker's report, not a second live occurrence) and confirmed still readable after the fix, both
  live and patched · ISS-229 (D-015) satisfied: measured by issue id against the ledger's own
  recorded reproductions, not a self-authored table · ISS-231 satisfied with a disclosed shortcut
  (one aggregate LIVE-vs-PATCHED corpus line rather than a per-manifest table; not blocking — see
  below) · live hook byte-identical start-to-end of this checker's run AND across the maker's own
  session (5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162, 823 lines, four
  independent readings) · trial-merge against master (`git merge-tree --write-tree master HEAD`):
  clean, exit 0, no conflicts
ISSUES-WRITTEN: ISS-STAMPADOPT-001 (medium — see "third attack shape" below; not a failure of this
  cycle's own stated scope)
EXPLANATION: Re-derived every headline figure myself rather than trusting the manifest — ran the full
qa/tests/mc-hooks-fixgap-and-stripper.ps1 suite against a fresh scratch copy of the live hook and
against the packaged diff applied to a second scratch copy, both to completion, and got the identical
RESULT lines and hook sha256 values the manifest reports. Went one step further than the brief's own
"try to find a third attack shape" on the one point most worth testing: I found one, and it is real —
the pinned alternative still adopts an inline PROSE sentence that merely quotes or paraphrases the
real corpus form ("Status: FAIL (Cycle checked: 9)" inside a sentence, not as its own stamp line),
identically on the live hook and the patched candidate. This narrows but does not close the class
ISS-230 named. It is not grounds to FAIL this cycle: it is outside the two reproductions ISS-230's own
ledger row recorded, the unit disclosed — accurately — that it had not searched exhaustively for a
fourth shape, and the fix demonstrably closes what it claimed to close, in both directions, matched
exactly. Filed as ISS-STAMPADOPT-001 for a follow-up cycle or unit.
```

---

## What I independently verified, and how

### 1. ISS-227 and ISS-228 — really already fixed at the live sha, not just claimed

Read `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` directly (not the manifest's account of it):

- **ISS-227** (span-erased value adopts a same-line digit): line 50, `` `[^`]*` `` is replaced with
  `~` (a sentinel), not `''`, with an inline comment naming the exact reproduction this closes
  ("a stamp value erased by code-span stripping still adopts a later digit on the SAME line"). My own
  run of `qa/tests/mc-hooks-fixgap-and-stripper.ps1` against the live hook confirms all three of
  ISS-205's own recorded reproductions (a)/(b)/(c) — which is the same underlying mechanism ISS-227
  re-reported — now read `pend=1` (PASS on all three, `FIX 2` section).
- **ISS-228** (`Fix cycle` predicate shares the newline-crossing bug): line 372,
  `` Fix cycle:[^\S\r\n]*(\d+) `` already uses the whitespace-except-newline character class, not
  `\s*`. The sibling audit (`mc-sessionstart.ps1`, `mc-precommit.ps1` are `Select-String`-based and
  unaffected) is written in the live hook's own comment block (lines ~384–397), matching what the
  cycle-1 checker itself found and asked for.

Both are genuinely closed at the current live sha — the builder is correctly crediting the concurrent
D-049 lane rather than claiming its own progress here, which is exactly the shape this brief told me
to scrutinize rather than accept, and it holds up.

### 2. ISS-230 — the fix, reproduced in both directions myself

Copied the live hook to a disposable scratch path (`pristine.ps1`, sha256
`5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162`, 823 lines — matched the live file
exactly at the moment of copy) and applied the packaged diff to a second scratch copy (`cand.ps1`):

```
$ patch -p0 --fuzz=0 cand.ps1 < qa/evidence/delivery-gate-stamp-adoption/delivery-gate-stop.paren-scope-fix.diff
patching file cand.ps1
$ sha256sum cand.ps1
969a1d581a2a12a7b49a62e6ae10b3e01cf6f5e9e9b15386fd0703db2bfe9eef  cand.ps1
```

Clean apply, no fuzz, no rejects — matches the manifest's claimed result sha exactly.

Ran the actual standing test (`qa/tests/mc-hooks-fixgap-and-stripper.ps1`), to completion, against
each copy via `DG_HOOK`:

**Against `pristine.ps1` (live, unpatched):**
```
FIX 4 -- ISS-230 the leading-paren alternative must not adopt a distractor elsewhere in the body
  FAIL  ISS-230 a PROSE parenthetical elsewhere is not adopted as the max cycle -- ... pend=0 unclosed=1
  FAIL  ISS-230 a LIST-ROW parenthetical elsewhere is not adopted as the max cycle -- ... pend=0 unclosed=1
  PASS  ISS-230 CONTROL no distractor, genuine stale cycle-1 PASS still reads pending
FIX 4 control -- the ONE real corpus paren form remains load-bearing
  PASS  ISS-230 CONTROL the real "Status: PASS (Cycle checked: N)" form is still read
  ...
  FAIL  M7 DIFF (ISS-230): ... -- anchor text not found in the hook; the mutation is vacuous
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 5D6E09943119B4F26B13C93DD32D8E28BD11099447B13C4D32DED074A51EC162
RESULT: FAIL (3 assertion(s))
```

**Against `cand.ps1` (patched candidate):**
```
FIX 4 -- ISS-230 the leading-paren alternative must not adopt a distractor elsewhere in the body
  PASS  ISS-230 a PROSE parenthetical elsewhere is not adopted as the max cycle
  PASS  ISS-230 a LIST-ROW parenthetical elsewhere is not adopted as the max cycle
  PASS  ISS-230 CONTROL no distractor, genuine stale cycle-1 PASS still reads pending
FIX 4 control -- the ONE real corpus paren form remains load-bearing
  PASS  ISS-230 CONTROL the real "Status: PASS (Cycle checked: N)" form is still read
  ...
  PASS  M7 DIFF (ISS-230): ... -> RED after
  PASS    control stays green under M7 DIFF (ISS-230)
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 969A1D581A2A12A7B49A62E6AE10B3E01CF6F5E9E9B15386FD0703DB2BFE9EEF
RESULT: PASS
```

Both runs match the manifest's claimed output **exactly**, assertion-for-assertion and sha-for-sha,
including M1–M6 (which I re-ran fresh, not merely re-checked as "still passing" — the harness applies
each mutation and probes it independently every invocation, so this is a genuine independent
re-falsification, not a reuse of the manifest's prior run). M7's "anchor not found — vacuous" reading
against the live hook is correct and expected: the diff is packaged, not applied.

### 3. The control — verified the real corpus form is genuinely singular

```
$ grep -rlE '\*\*Status: (PASS|FAIL)\*\* \(Cycle checked' qa/verdicts/
qa/verdicts/delivery-gate-manifest-blindness.md
qa/verdicts/transcription-empty-result-guard.md
```

Two files matched, not one — checked the second before accepting the manifest's "1 occurrence"
census. `delivery-gate-manifest-blindness.md` is a *different, earlier* checker's report **about**
this same hook's stamp-form census; its match is the line `1x **Status: PASS** (Cycle checked: N)`
— a citation documenting the count, not a second live occurrence of a real stamp needing to be read.
`transcription-empty-result-guard.md:3` (`**Status: PASS** (Cycle checked: 1)`) is the only genuine
one. The census claim holds. Confirmed the control assertion passes on **both** copies above
(`ISS-230 CONTROL the real "Status: PASS (Cycle checked: N)" form is still read`) — pinning did not
break the one real verdict it exists to preserve.

### 4. Live file integrity — four independent readings, all agreeing

| When | sha256 | Lines |
|---|---|---|
| Start of this check | `5d6e0994...ec162` | 823 |
| Mid-check (copied for `pristine.ps1`) | `5d6e0994...ec162` | 823 |
| Standing-test's own internal pre/post hash (both directions) | `5d6e0994...ec162` (live run) | 823 |
| End of this check | `5d6e0994...ec162` | 823 |

Did not move during this check, and matches the maker's own claimed start/end state for its session.
Nothing in this check wrote to, edited, or applied anything to `D:/ai_os` — every mutation, patch, and
probe ran against disposable scratch copies under this session's own scratchpad directory, never
against the live file or this repo's `D:/ai_os` working tree.

### 5. Trial-merge against master

```
$ git rev-parse master HEAD
97756f5ef9bc4be7d70a13c55509eb48f65ede3f
5a25b128b002882272f7e6922fdc1d99667fbb7e
$ git merge-tree --write-tree master HEAD
1738b64271eee57eb0dce7e521723e082fea3bf
$ echo exit=$?
exit=0
```

Clean, no conflicts. (Master is 5 commits behind this branch's tip, as the brief said — this is
reported, not "fixed": this checker does not merge or push, and merging the branch is a decision
outside this unit's scope.)

### 6. The branch moved under me — recorded, not treated as this unit's business

Git log at the moment I started: `2bf1a49` was the tip. Partway through this check, `5a25b12` landed
— `tick: stamp-adoption cycle 2 ready-for-check; records branch/HEAD state oddities`, touching only
`qa/.last-tick` (one line). Its own message says "the checker judges `2bf1a49` alone," which matches
what I was told to do and what I did. Noted for the record; not scored, not treated as authorization
to expand scope, and not something I am "fixing" per this task's standing instruction not to.

## Ruling on the two questions the builder left open

**1. Pinning vs. deleting the paren alternative — pinning was the right call.**
Verified independently (§3) that `transcription-empty-result-guard.md` is the one genuine live
occurrence of the paren form, and that deleting the alternative would make that real, already-PASSed
verdict unreadable by the gate — silently converting an audit-record file's real PASS into a
false PENDING. That is the same asymmetry the hook's own comments treat as the important one
throughout this file (missing a stamp is noisy; inventing/misreading one is silent) applied to a
different case: here, *deleting* the read path is the change that damages a real artifact, while
*pinning* preserves it and only removes the unbounded blast radius. Editing a historical verdict file
to dodge a hook limitation is also the wrong direction on its own terms — verdict files are part of
the audit trail, and reformatting one to satisfy a regex is optimizing the map to fit the territory
backwards. I do not think editing `transcription-empty-result-guard.md` should have been on the table
at all, and I would have ruled the same if the unit had reached the opposite conclusion by luck.

That said, §"third attack shape" below shows pinning is not a complete fix for the *class* ISS-230
named — only for the two reproductions it recorded. A tighter fix (anchor the paren alternative to
line-start too, not just to the `Status:...(` phrase appearing anywhere) would close the residual gap
without touching the real verdict file, and is what I'd ask the next cycle to attempt — filed as
ISS-STAMPADOPT-001 rather than blocking this one.

**2. Diff-only delivery for a unit that owes a fix cycle — acceptable, and consistent with today's
own precedent.**
Verified `qa/gates/ai-os-enforcement-hooks-uncommitted.md` is genuinely `OPEN — awaiting the Approver`
(`**Answered:** _(pending)_`), not something the manifest is over-reading. The identical packaging —
diff evidence artifact + extended standing test, not a live edit — was independently PASSed by a
different checker earlier the same day for `iss-346-round-cap-mechanical-check` (`2776aac`), against
the same gate, the same live file, and the same "no reviewed baseline to diff against" reasoning. I
see no principled basis to hold this unit to a different standard than one already ratified today on
identical facts. The alternative — editing a machine-wide Stop hook while its own governance gate
records 56 dirty files and no reviewed baseline — is worse, for the reasons `qa/gates/
ai-os-enforcement-hooks-uncommitted.md` itself lists (unreviewable by construction, no rollback path).
I am not overruling.

## My own attempt at a third attack shape (requested by the brief) — found one

The brief specifically asked me to try, given this defect family's recurrence (ISS-307's substring
match on prose, iss-346's H3 regex returning the stray token `RULE`, and now ISS-230). I did, and
found a real bypass surviving the patched candidate:

```
Manifest: Fix cycle 3, ready-for-check.
Verdict:  Cycle checked: 1
          **VERDICT: PASS**

          Note: an earlier draft wrongly wrote Status: FAIL (Cycle checked: 9) here before it was
          corrected.

LIVE (unpatched):   pend=0 unclosed=1   -- WRONG (same direction as the two ISS-230 fixtures)
PATCHED candidate:  pend=0 unclosed=1   -- IDENTICAL. The fix does not close this route.
```

The pinned alternative `Status:?[^\S\r\n]*(?:PASS|FAIL)[^\S\r\n]*\(Cycle checked` has no line-start
anchor and does not require the phrase to be its own line, bulleted, or bolded — so any prose sentence
that happens to contain that exact substring, even one plainly *quoting or discussing* a stamp rather
than stating one, is adopted as if it were the real thing. The fix genuinely narrows the attack surface
(previously ANY `(` anywhere in the file could lead in; now only text matching the specific
`Status:...( ` prefix can), but does not close the underlying class. Filed as **ISS-STAMPADOPT-001**
(medium, matching ISS-230's own severity for the same dangerous-but-non-silencing direction) with a
concrete fix direction (anchor the whole alternative to line-start) and a regression probe. Not
charged against this cycle: it falls outside ISS-230's own two recorded reproductions, and the unit
disclosed, accurately, that it had not searched exhaustively for a fourth shape.

## D-015 — checked against the ledger, not against the manifest's self-report

| Issue | Ledger's own reproduction(s) | Re-run by me | Result |
|---|---|---|---|
| ISS-205 | (a)/(b)/(c), verbatim | via `FIX 2` section of the standing test, live hook | 3/3 — matches manifest |
| ISS-227 | span-erased value + same-line digit | same mechanism as ISS-205(a); confirmed via source read + FIX-2 pass | closed |
| ISS-228 | `Fix cycle` value in a span, next line begins `1 file changed` | confirmed via source read (`[^\S\r\n]*` present) | closed |
| ISS-230 | prose parenthetical / list-row parenthetical | `FIX 4` section, both hooks | fixed by the diff, not yet live (blocked on the open gate, as disclosed) |
| ISS-231 | old-vs-new re-derivation, itemised per manifest | manifest gives one aggregate LIVE-vs-PATCHED line over 175 files, not itemised | **partial** — see below |

**ISS-231 is not fully satisfied as C6 originally asked** (itemised per manifest), and the unit says
so itself rather than hiding it ("itemised as one aggregate LIVE vs PATCHED line ... I am naming the
shortcut rather than silently taking it"). I am not failing on this: the aggregate figure is truthful
(0 differences over 175 files means an itemised table would show 175 identical rows — there is no
information the itemisation would add on *today's* corpus that the aggregate omits), the disclosure is
honest and prominent, and `iss-346-round-cap-mechanical-check` — PASSed by another checker the same
day — accepted a comparable aggregate-corpus figure as satisfying its own re-derivation requirement.
Holding this cycle to a stricter standard than that same-day precedent would not be principled.

## What the maker must carry forward

1. **ISS-STAMPADOPT-001** (this verdict, medium): the leading-paren alternative still adopts a prose
   quote/paraphrase of the real corpus form. Fix direction: anchor line-start on both alternatives, not
   just the `Status:...(` phrase. Re-verify `transcription-empty-result-guard.md` still reads correctly
   under a line-start anchor before shipping — that is the one real artifact any future fix on this
   seam must not silently break, same as this cycle's own control.
2. **The packaged diff is still not landed.** `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` remains
   at `5d6e0994...ec162`, 823 lines, unpatched. ISS-230 stays `open` in the ledger (not `fixed`) until
   the Approver answers `qa/gates/ai-os-enforcement-hooks-uncommitted.md` and the diff actually lands —
   the same durability caveat ISS-372 raised for the D-049 fixes applies here too.
3. Nothing else from cycle 1's five findings is open: ISS-227, ISS-228 confirmed closed at the live
   sha; ISS-229 satisfied; ISS-231 satisfied with a disclosed, accepted shortcut.

---

# ARCHIVE — cycle 1 (superseded by cycle 2 above; kept verbatim, not edited)

# Verdict — delivery-gate-stamp-adoption

**Cycle checked:** 1
**Date:** 2026-09-09
**Checker:** Mode A, fresh context, bound to `D:/KnowledgeBase`.
**Commit under check:** `91b051c` (KnowledgeBase) / `e5402d6` (`D:/ai_os`, the artifact).
**Contract:** `qa/contracts/delivery-gate.md` (status `proposed`).

```
VERDICT: FAIL
SCOREBOARD: 5/9 criteria met, 2/3 invariants hold
FAILURES:
- [C2][C3][I2] sev: high · ISS-205's own recorded reproduction (a) still silences the gate at HEAD: a
  span-erased value whose SAME line later carries a digit reads that digit — the fix moved the
  boundary to the line, not to the stamp · apply the second half of ISS-205's own fix_direction
  (reject a label whose value the stripper erased — match before stripping, or leave a sentinel) ·
  issue: ISS-227
- [C7] sev: high · the Fix cycle predicate five lines above the changed line carries the identical
  newline-crossing defect and was neither fixed nor audited; it silences the gate in the same
  direction · apply the same whitespace-except-newline class there too, and state the audit for
  every stamp predicate and both sibling hooks · issue: ISS-228
- [D-015] sev: high · the unit measured itself against a four-row probe table it authored, not
  against ISS-205's three recorded reproductions; measured against the ledger the result is 2/3,
  and the miss is the reproduction the issue's fix_direction names · report by issue id against the
  ledger corpus · issue: ISS-229
- [C5] sev: medium · fixture side 2 is not the second side of a discrimination — it passes
  byte-identically before and after the fix (my mutant M1 kills side 1 only) · make side 2 assert
  something the pre-fix hook fails, or describe it as the regression guard it is · issue: ISS-230
- [C6] sev: medium · no old-vs-new re-derivation itemised per manifest was submitted; aggregate
  safety-property counts are not that evidence · issue: ISS-231 (I supplied the re-derivation; see
  below — the change is inert on today's corpus)
LIVE-BROWSER: not-applicable (D:/ai_os/.claude/hooks/delivery-gate-stop.ps1,
  D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1 — two PowerShell hook files; no match against
  D-024's surface list, which additionally names packages/ask/**, packages/index/src/{vector,tree,
  search}/**, apps/web/**; verified against DECISIONS D-024 Result + Changes-authorized, not against
  the manifest's paraphrase)
ISSUES-WRITTEN: ISS-227, ISS-228, ISS-229, ISS-230, ISS-231
EXPLANATION: The fix is real and I reproduced it independently in the hook's own runtime — three
constructed corpora that the pre-fix hook read as fully checked (span value + digit next line, value
in a fenced block, and the same under CRLF) all go PENDING at HEAD, and the whole fixture suite is
green with the five prior properties still pinned. It is not sufficient. ISS-205's own ledger row
records three reproductions and names two remedies; this unit implemented one and closed neither the
reproduction that survives nor the predicate five lines above it that shares the bug. The unit is
also the first built under the stall diagnosis's preventives, and only one of the two held: the
diff-derived mutant is genuine, but the "both sides" fixture pair has one vacuous side.
```

---

## 1. What I re-ran (nothing below is the maker's evidence)

Harness: `scratchpad/chk/probe-chk.ps1` + `mutrun.sh`. Every case builds a throwaway project tree
(`qa/manifests/a.md`, `qa/verdicts/a.md`, `qa/QUEUE.md` with one TODO row so the block always emits)
and drives the **real hook** end to end, parsing `pend`/`unclosed` out of the block reason. The
pre-fix comparator is the shipped file with the one token reverted (`old.ps1`), asserted to be a
single-occurrence replacement.

**D-020 posture, stronger than the rule requires: no mutation ever touched a tracked file.** Mutants
were applied to an isolated `cp -r` of `D:/ai_os/.claude/hooks`, whose own copy of the fixture suite
runs green unmutated (the suite is `$PSScriptRoot`-relative, so it exercises the copy). Restore from
a pristine byte backup runs in a `trap ... EXIT INT TERM ERR` and is verified with `cmp`; every suite
run is wrapped in `timeout 900`.

### 1a. The defect and the fix — reproduced

| case | pre-fix | at HEAD |
|---|---|---|
| span value, digit on next line (the ISS-205 shape) | pend=0 unclosed=0 — **silent** | pend=1 — pending |
| value in a **fenced block**, digit next line | pend=0 unclosed=0 — **silent** | pend=1 |
| the same with **CRLF** line endings | pend=0 unclosed=0 — **silent** | pend=1 |
| baseline stamp on its own line (LF and CRLF) | pend=0 unclosed=1 | pend=0 unclosed=1 |
| TAB between label and digit | reads it | reads it |
| stamp split across a table row | pend=1 | pend=1 |
| NBSP between label and digit | pend=1 (noisy; a BOM-less decode, not the regex) | pend=1 |

The fix does what it claims for the newline class, including under CRLF and inside fences, and does
not regress the forms the corpus actually uses.

### 1b. Survivor hunt — three survivors, all in the silencing direction

Manifest at `Fix cycle: 3`, verdict genuinely at cycle 1. Same file, one token apart:

| verdict body | at HEAD |
|---|---|
| stamp value in a span, then `9/9 criteria met` **on the same line** | **pend=0 — SILENT** (reads 9) |
| the same line without the stray digit (control) | pend=1 |
| genuine `Cycle checked: 1`, plus prose `The predecessor unit (Cycle checked: 9) is unrelated.` | **pend=0 — SILENT** |
| genuine `Cycle checked: 1`, plus a list row `- see (Cycle checked: 4) elsewhere` | **pend=0 — SILENT** |
| genuine `Cycle checked: 1` alone (control) | pend=1 |

The first is ISS-205 reproduction **(a)** — see §2. The last two come from the leading paren
alternative in the pattern, which **no fixture pins**: my mutant M2 deletes it and the whole suite
still passes. The hook's own comment says the paren heading form is deliberately unreachable; the
alternative that remains therefore buys nothing and costs a prose-adoption path.

### 1c. Mutation — including tokens the maker did not change

| mutant | result |
|---|---|
| M0 no-op control (comment only) | **survived (clean)** |
| M1 **DIFF**: revert the whitespace class to `\s*` | **killed** — by fixture side 1, and by side 1 alone |
| M2 untouched: delete the leading paren alternative | **SURVIVED** — unpinned, and it is a survivor's mechanism |
| M3 untouched: drop the list-marker class before the label | **SURVIVED** — unpinned |
| M4 untouched: make the colon mandatory | **SURVIVED** — unpinned |
| M5 untouched: highest-cycle `-gt` → `-lt` | killed (5 checks) |
| M6 untouched: pending boundary `-lt` → `-le` | killed (5 checks) |
| M8 untouched: tighten the `Fix cycle` predicate the same way | **SURVIVED** — and that is the §3 bug |

(M7, dropping `Singleline` from the inline-span strip, is an equivalent mutant — the negated
character class matches newlines regardless of the flag — so it is excluded rather than counted as a
survivor.)

The maker's claim that the mutant is diff-derived **holds**, and M1's kill is real. What the table
adds is that the fixtures are **over-fitted to the one line touched**: four tokens in the same two
regexes can be changed with the suite still green.

## 2. Measured against the ledger, not against a probe table (D-015)

`qa/issues.jsonl` ISS-205 records three reproductions. Re-run verbatim in the hook's runtime:

| ISS-205 reproduction | pre-fix | at HEAD |
|---|---|---|
| (a) span-erased value, digit later on the same line → reads 9 | silent | **silent — STILL OPEN** |
| (b) bare label, blank line, `9 issues were written.` | silent | pending — fixed |
| (c) span value + next line `3 criteria met.` | silent | pending — fixed |

**ISS-205: 2/3.** The manifest reports four probe rows it authored this cycle, all passing, and does
not name (a) as deliberately left open. ISS-205's `fix_direction` has two clauses; the unit
implemented the first and silently dropped the second — *"Reject a label whose value was erased by
code-span stripping (match before stripping, or leave a sentinel)"* — which is precisely the clause
that closes (a). This is the exact habit D-015 exists to stop: a fix measured against a corpus its
own author chose that cycle.

## 3. C7 — the audit that was not done, and what it would have found

C7 requires a defect found in one predicate to be audited across every predicate sharing the pattern,
with the result stated. The manifest states nothing. Five lines above the changed line, in the same
block, in the same file, the `Fix cycle` predicate still ends in `\s*(\d+)` — same stripper upstream,
same newline crossing. Measured, on two manifests identical except for one pair of backticks, each
with a genuine cycle-1 verdict:

| manifest | at HEAD |
|---|---|
| `Fix cycle` value inside a code span, next line begins `1 file changed` | **pend=0, reported only as "1 PASS not closed out" — SILENT on a cycle-3 unit** |
| the same manifest with the value on its own line (control) | pend=1 — pending |

Silencing is I2's expensive failure, and here the gate reports the unit as merely awaiting close-out
while a cycle-3 check sits unanswered.

**The siblings, audited (the answer the manifest owed):** `mc-sessionstart.ps1:17,19` and
`mc-precommit.ps1:43` use `Select-String`, which is line-oriented, so no pattern there can cross a
newline — **checked, not affected.** That is a one-line answer the maker could have written; C7's
complaint is the silence, not the outcome.

## 4. C6 — the re-derivation, supplied

Old vs new over the live `qa/manifests` + `qa/verdicts` corpus, itemised: three manifests are at
`ready-for-check` today — one with no verdict, two `quiet` — and **the two readers agree on all
three**. The counting change is inert on today's corpus. That is a satisfactory answer; it is not one
the manifest gave, and C6 asks for the itemisation, not an aggregate.

## 5. The safety-property framing (Known Gap 2) — still overclaiming

Gap 2 concedes "corroboration, not proof" and then reasserts: *"It cannot manufacture a stamp, so it
remains a usable upper bound."* **That sentence is false, and its own issue says so.** ISS-205's title
is "the cycle-3 safety property is **false**: Strip-Code + `\s*` can **MANUFACTURE** a cycle stamp
that appears nowhere in the file." §1b's first row manufactures one at HEAD: the reader returns 9 and
the string `Cycle checked: 9` occurs nowhere in that file. The honest statement is that the bound is
**refuted**, not merely unsound, and that `higher=0` over 118 verdicts is a statement about today's
corpus and nothing more. Downgrading a refuted claim to "corroboration" while restating the refuted
sentence is a smaller retreat than the evidence requires.

## 6. Known Gaps 3 and 4

- **Gap 3 (fenced branch unfixtured) — confirmed, still true.** My fenced-block case exercises it; the
  maker's fixtures do not. Carried, not charged beyond ISS-230.
- **Gap 4 (six verdicts read lower) — accepted.** Noisy direction, none live; my §4 re-derivation
  agrees that nothing live changes.

## 7. The ruling the maker asked for (Known Gap 1)

**A unit MAY touch an unauthorized enforcement path to fix a defect in it. I am not FAILing on this.**

On the merits:

1. **The alternative is not neutrality, it is choosing the defect.** `4a71633` is already live and
   already uncovered; leaving a manufacture-a-stamp bug in a hook that runs on every session on this
   machine does not reduce the governance exposure by one line, it adds a correctness exposure on top
   of it. There is no "leave it alone" state — the file executes from the working tree.
2. **Reverting is not the safer option here either.** Reverting to a reviewed commit is the clean
   remedy when one exists; the gate file itself records that the whole file has been running
   uncommitted all day, so there is no reviewed state to revert *to*. That is the Approver's question,
   not a unit's.
3. **The scope test is what keeps this from becoming a licence.** This change is one token plus
   comments, wholly inside the defect, and it is committed — so the Approver rules on a diff rather
   than on a moving working tree. A unit that *extended* an unauthorized enforcement path, changed
   what it blocks, or widened its blast radius would get the opposite answer, and I would FAIL it.
4. **Referencing the existing gate was correct.** ISS-214 filed duplicate gates for one file; a tenth
   gate would restate a question already asked in
   `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md`, whose §2 restatement was written
   to be durable against exactly this — a file that keeps moving while the gate waits.

One condition, and it is the reason that gate exists: **its durable question now covers a second
commit and does not say so.** "Commit or revert what is live, and retro-authorize or revert
`4a71633`" should read on `4a71633` **and `e5402d6`**, or the Approver will ratify one commit and
believe the file is covered. Recorded in ISS-228's remediation note rather than as a new gate.

## 8. What a PASS needs

1. Close ISS-205 (a) — the stripper-erased-label clause of its own `fix_direction`.
2. Fix the `Fix cycle` predicate in the same block, and state the C7 audit across all stamp
   predicates (the sibling answer is in §3; it still has to be written down by the unit that owns it).
3. Re-measure against `qa/issues.jsonl`'s recorded reproductions and report `ISS-205: N/3` by id.
4. Either make fixture side 2 discriminate, or stop describing it as the second side.
5. Extend the existing gate's durable question to name `e5402d6`.
