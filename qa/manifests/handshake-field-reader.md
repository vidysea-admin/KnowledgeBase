# Manifest — handshake-field-reader

**Contract:** none governs the manifest record's own format (same ground as
`handshake-canonical-field.md` and `ledger-shard-union-reader.md`, this seam's predecessors).
**Goal task:** none (no `.goal/goal.json` task id matches this slug) — tier 2, D-043 item 3 / ISS-350
reproduction 2.
**Date:** 2026-09-28
**Fix cycle:** 0 of max 3
**Dual check:** no
**Persona walk:** skip (enforcement hook + library module, no screen — `audience: internal-tool`, diff
touches no UI surface)
**Issues addressed:** **ISS-350** reproduction 2 — with a correction to what that reproduction's own
cited live instance actually is (see "Measurement against the ledger" below). Reproductions 3-4 are
out of scope by D-043 item 3's own text (verdict-side, a separate concern).
**Executor:** claude-sonnet-subagent (bound to git worktree
`D:\KnowledgeBase\.claude\worktrees\agent-a0cdaee537b2064d9`), fix cycle 0.

## Authorization (enforcement path — recorded before the edit)

`.claude/hooks/mc-sessionstart.ps1` is an enforcement path under the project CLAUDE.md, so
`Changes-authorized` alone is insufficient. **D-043 carries `Approved-by: Umesh`** and its
`Changes-authorized` line names this exact file and change: `.claude/hooks/mc-sessionstart.ps1 (parse
**Handshake status:** checked-PASS -- closed out 2026-09-28 against verdict cycle 0 (VERDICT: PASS, commit
2b5acc8, merge b1c32fc). SCOREBOARD 6/6 claims independently re-derived, 3/3 authorization checks hold.

**The merge hazard was the crux and the checker settled it properly.** This worktree branched at 8cf88fc,
and master had since changed the same file (`ca86e53` / `0cf1b17`, the ISS-307 stall-check fix authorized by
D-050-SPEAKER ruling 2). The builder declined to re-fast-forward mid-unit with uncommitted edits in a shared
file and flagged it for the merge step -- the right call. The checker then trial-merged with
`git merge-tree --write-tree` (clean, exit 0), extracted the merged tree to a throwaway copy, and re-ran
everything against BOTH fixes applied: 22/22 handshake, 4/4 master's stall-detect suite, 4/4 ledger-union,
plus a live hook run with no false `STALL UNDIAGNOSED` banner and no spurious disagreement. A verdict that
passed this unit in isolation and clobbered an authorized fix on merge would have been worse than a FAIL.

**Checked beyond the claims:** all three legacy `Status` forms; disagreement surfacing in both directions
(a real conflict must fire, a canonical-only manifest must not); an independent live scan of all 162
manifests confirming the backtick fix gives 0 disagreements; and the widened PASS-closeout pattern checked
by hand against all 161 real verdict files -- **17 new matches, every one a genuine PASS in a format the old
regex missed, zero false positives.**

**ISS-350: reproduction 2 of 4**, and the accounting is honest -- the checker found it matches the ledger's
own `checker_note` almost verbatim. The code fix is delivered but verified against a **constructed fixture,
not a live reproduction**, because zero of 162 manifests are in the canonical-only blind state today.
Reproductions 3-4 (the verdict-side `VERDICT:`/`Verdict:` split, newest-first ordering) are deliberately
left open as outside D-043 item 3's scope, and are named rather than omitted, per D-015.

**Issues filed, neither blocking, both in the lane shard `qa/issues.a0cdaee.jsonl` per D-019:**
- **ISS-A0CDAEE-001 (medium)** -- `manifestCycle()` shares the identical backtick false-positive class this
  unit fixed in two sibling functions. 0/162 misreads today, but only because the quoted mention happens to
  sit after the real field in all 10 manifests that have one: an ordering coincidence, not a design.
  Confirmed by fixture (reads 9 instead of the real 1 when the quote comes first). Correctly out of scope.
- **ISS-A0CDAEE-002 (low)** -- a record-accuracy correction against **this session's own D-049**, which
  claims item 3 was "built and PASSed as `ledger-shard-union-reader`". That is false: that unit's
  checker-corrected manifest shows it touched only the D-019 ledger-union lines and never the handshake
  field. **`handshake-field-reader` is the actual first delivery of D-043 item 3.** The error is mine, in
  D-049's prose; the authorization itself is unaffected, and D-043 item 3 remains valid on its own terms.

## Worktree ancestry (recorded per a mid-task coordinator instruction)

This worktree's HEAD predated D-042/D-043 and the D-019 ledger-union fix. Verified clean-ancestor
status before editing anything: `git merge-base --is-ancestor HEAD master` (true) and
`git log master..HEAD --oneline` (empty — no unique commits), then `git merge --ff-only master`,
landing at `8cf88fc`. All D-042/D-043 text and the D-019 union logic quoted or built on in this
manifest come from that fast-forwarded state, not from memory of the brief.

**`master` has since advanced well past `8cf88fc`** (D-047 through D-051, an ISS-307 fix to this same
hook file at `ca86e53` in a section this unit does not touch, and other lanes' merges). This unit does
**not** incorporate that further history — re-fast-forwarding mid-unit, with uncommitted edits already
sitting in the same file another lane also modified, risks silently folding unreviewed work from other
lanes into a diff that is supposed to be exactly two files. That reconciliation belongs to the merge
step, not to this unit; flagging it here rather than resolving it unilaterally.

## Precedence decision: canonical wins, disagreement is surfaced, never silently resolved

D-042 makes `**Handshake status:**` the derived, authoritative signal. Both readers therefore:

1. Read the canonical field first. If present, its value decides pending/ready — the legacy `Status:`
   forms are not consulted for the decision.
2. Fall back to the legacy `Status:` reading only when no canonical field exists at all (pre-D-042
   manifests, or the latent fresh-authored-canonical-only case D-042's own fix_direction (d) named).
3. **Separately**, whenever a legacy field exists at all, compare it against the canonical answer. A
   mismatch is never silently dropped: it is collected and printed as its own banner line
   (`HANDSHAKE DISAGREEMENT: ...` in the PowerShell hook; a `disagreement` key attached to every
   `stateOf()` result in the JS module, on whichever branch the function returns). The reasoning is
   D-042's own: "a mismatch usually means one field was updated by an edit that missed the other,"
   which is exactly the drift D-042's fix_direction (d) warned would follow once the field existed to
   edit around.
4. Absence of a legacy field is explicitly **not** a disagreement — a fresh manifest authored with only
   the canonical field is the latent case D-042/ISS-350 disclosed, not a conflict. Both readers gate the
   disagreement check on "a legacy field exists AT ALL" before comparing, precisely to avoid this false
   positive (see "The bug I found in my own code" below for the one place this distinction still leaked
   through, in a different regex).

## What changed

- **`.claude/hooks/mc-sessionstart.ps1`** (39 lines changed, all additive except the widened
  PASS-closeout pattern) — the manifest-pending scan now reads `**Handshake status:**` first
  (`$HANDSHAKE_VOCAB`), falling back to the pre-existing legacy `Status:` regex only when no canonical
  field matches; a `$disagreements` array is collected (gated on `$legacyPresent`, not just
  `$legacyReady`, to avoid the canonical-only false positive) and printed as a `HANDSHAKE DISAGREEMENT:`
  banner line right after `MAKER-CHECKER ACTIVE:`, when non-empty. The PASS-not-closed-out check's
  existing `'VERDICT:\s*PASS'` pattern (confirmed already case-insensitive, catches `Verdict: PASS`) is
  widened to an alternation `'VERDICT:\s*PASS|Result:\s*PASS|\*\*PASS\*\*'`, added rather than replaced.
  The D-019 union ledger-counting block (`$LEDGERS`/`$LEDGER`/`$n`) and the ISS-307 stall check are
  untouched.
- **`scripts/lib/dispatch-state.mjs`** (100 lines changed) — added `HANDSHAKE_VOCAB`,
  `canonicalHandshakeStatus()`, `legacyReadyForCheck()`, `legacyStatusPresent()`, and
  `handshakeDisagreement()`; rewrote `isReadyForCheck()` to prefer the canonical field, falling back to
  the legacy reading; `stateOf()` now computes `disagreement` once at the top and tags it onto whichever
  result branch it returns, via a small `tag()` helper, rather than dropping it. `manifestCycle()`,
  `verdictCycle()`, `stripQuoted()`, `record()`, `clear()`, `readMarker()`, `sweep()` are untouched.
- **`scripts/lib/dispatch-state.test.mjs`** (138 lines added) — 12 new tests covering: every D-042
  vocabulary value; canonical-only ready-for-check and canonical-only checked-PASS (the constructed
  blind-spot case, since zero live manifests are in that state); canonical winning over a disagreeing
  legacy field in both directions; the legacy fallback when no canonical field exists; `null` for no
  canonical field, for canonical-only (no legacy to disagree with), and for agreement; naming both sides
  on a real disagreement; `stateOf` attaching/omitting `disagreement`; the canonical-only manifest
  end-to-end; and the inline-code-quoted false-positive class found and fixed during this unit (below).
- **`qa/tests/mc-hooks-handshake-field.ps1`** (new file, untracked) — 22-assertion regression test for
  the PowerShell hook, following `qa/tests/mc-hooks-ledger-union.ps1`'s shape (a throwaway
  `CLAUDE_PROJECT_DIR` tree per group, never touching this repo's own `qa/`). Five groups: canonical vs
  legacy precedence and disagreement surfacing; all six vocabulary values; all four PASS-closeout forms
  (2 real + 2 controls); and a non-regression check that the D-019 ledger-union count is unaffected.

## The bug I found in my own code, and the fix

Running a read-only scan of `handshakeDisagreement()` against the live `qa/manifests/*.md` corpus (161
files) surfaced 2 unexpected "disagreements": `delivery-gate-manifest-blindness.md` and
`mc-hooks-bolded-status.md`. Both files' real canonical and legacy fields agree (`STALLED` and
`checked-PASS` respectively) — the false match came from `legacyReadyForCheck()`'s leading character
class `[\s\-*#>|`]*`, carried over verbatim from the module's own pre-existing regex, which includes a
backtick. Both files contain a line that **opens with a backtick-quoted example** of the exact
bold-blindness bug class this repo keeps hitting, e.g.
`` `## Status: ready-for-check`, which is the one form the old regex could see `` at
`delivery-gate-manifest-blindness.md:35` (confirmed via `sed -n '35p'`) — prose *about* the bug, read as
a real field declaration because the code span's opening tick satisfied `^[\s\-*#>|`]*`.

**Fixed** by dropping the backtick from `legacyReadyForCheck()`'s and `legacyStatusPresent()`'s leading
character class only (`scripts/lib/dispatch-state.mjs`). `manifestCycle()` shares the same class but is
untouched — a separate reader, out of this unit's authorized scope, and it already has its own
documented reason for the broader `verdictCycle()`/`stripQuoted()` approach it does not share. The
**parallel PowerShell hook's own legacy regex was never affected**: its leading class
(`^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+...`) never included a backtick, confirmed
by the live hook run below showing no `HANDSHAKE DISAGREEMENT` line before or after this fix. A
regression test for this exact class (backtick-quoted prose, both agreeing and would-disagree wording)
was added to `dispatch-state.test.mjs`.

## How to verify (commands + expected)

1. **JS unit tests, full suite:**
   `node --test scripts/lib/dispatch-state.test.mjs`
   → expected: `tests 28`, `pass 28`, `fail 0`.
2. **PowerShell handshake-field regression suite:**
   `powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-handshake-field.ps1`
   → expected: `RESULT: PASS (22/22 assertions)`.
3. **PowerShell ledger-union regression suite (non-regression of D-019):**
   `powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-ledger-union.ps1`
   → expected: `RESULT: PASS (4/4 assertions)`.
4. **Live hook against the real repo:**
   `$env:CLAUDE_PROJECT_DIR = (pwd).Path; powershell -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/mc-sessionstart.ps1`
   → expected, **once this manifest itself exists** (it is `ready-for-check`): `Checks pending: 1
   [handshake-field-reader]`, `PASS not closed out: 0`, no `HANDSHAKE DISAGREEMENT` line, `Ledger:
   qa/issues*.jsonl (N file union)` with N unchanged by this unit. (The "Actual outputs" run below was
   captured before this manifest file existed, hence its `Checks pending: 0` — a second run after
   writing this file, pasted at the end of that section, confirms the `1 [handshake-field-reader]`
   count and that this manifest's own bug-discussion prose does not trip the disagreement check it
   describes.)
5. **Live disagreement scan of the real corpus, zero expected:**
   ```
   node -e "import('./scripts/lib/dispatch-state.mjs').then(async (mod) => { const { readdirSync, readFileSync } = await import('node:fs'); const { join } = await import('node:path'); const dir = 'qa/manifests'; const files = readdirSync(dir).filter(f => f.endsWith('.md')); let d=0; for (const f of files) { if (mod.handshakeDisagreement(readFileSync(join(dir,f),'utf8'))) { d++; console.log('DISAGREE:', f); } } console.log('total', files.length, 'disagreements', d); });"
   ```
   → expected: `disagreements 0` (both false positives named above, fixed).

## Actual outputs (from maker's own run)

```
$ node --test scripts/lib/dispatch-state.test.mjs
... (28 tests, all ✔, including "handshakeDisagreement: an inline-code-quoted `Status:` example
     in PROSE is not a real legacy field")
ℹ tests 28
ℹ pass 28
ℹ fail 0
```

```
$ powershell ... qa/tests/mc-hooks-handshake-field.ps1
  PASS  canonical-only ready-for-check is pending (constructed blind-spot case)
  PASS  canonical-only checked-PASS is NOT pending
  PASS  canonical + legacy agreeing on ready-for-check is pending
  PASS  no disagreement is reported when canonical and legacy agree
  PASS  disagreement (legacy ready, canonical PASS): canonical wins -> NOT pending
  PASS  disagreement (legacy PASS, canonical ready): canonical wins -> IS pending
  PASS  both disagreements are named in a HANDSHAKE DISAGREEMENT line
  PASS  all six vocabulary values parse without hook error (no exception text, exit handled)
  PASS  vocabulary value 'checked-PASS' pending=False
  PASS  vocabulary value 'ready-for-check' pending=True
  PASS  vocabulary value 'STALLED' pending=False
  PASS  vocabulary value 'BLOCKED' pending=False
  PASS  vocabulary value 'superseded' pending=False
  PASS  vocabulary value 'paused' pending=False
  PASS  pre-existing form VERDICT: PASS still counted (no regression)
  PASS  pre-existing case-insensitive Verdict: PASS still counted (no regression)
  PASS  NEW form **Result: PASS** now counted
  PASS  NEW bare **PASS** (no field label) now counted
  PASS  a FAIL verdict is never counted as unclosed-PASS (control)
  PASS  bold **PASSWORD** text does not false-positive on the bare-PASS widening (control)
  PASS  ledger union count (3 across 2 shards) is unaffected by the handshake-field change
  PASS  ledger union file-count string (2 file union) is unaffected
RESULT: PASS (22/22 assertions)
```

```
$ powershell ... qa/tests/mc-hooks-ledger-union.ps1
  PASS  counts the union (6), not the canonical file alone (2)
  PASS  reports how many files the union covered (3)
  PASS  excludes files not matching issues*.jsonl
  PASS  no ledger present still reports UNKNOWN, not 0
RESULT: PASS (4/4 assertions)
```

```
$ $env:CLAUDE_PROJECT_DIR = "D:\KnowledgeBase\.claude\worktrees\agent-a0cdaee537b2064d9"
$ powershell ... .claude/hooks/mc-sessionstart.ps1
MAKER-CHECKER ACTIVE: ... Open issues: 156 | Checks pending: 0 | PASS not closed out: 0 |
Queue TODO: 0 | Last tick: 365 min ago | Last sweep: 365 min ago | Ledger: qa/issues*.jsonl (12 file union)
STALL UNDIAGNOSED: ADVANCED -- run /agent-debugger on it before any new unit.
AUTO-CONTINUE REQUIRED: ...
```
(No `HANDSHAKE DISAGREEMENT` line — matches D-042's own census that all 161 live manifests currently
agree between canonical and legacy fields. The `STALL UNDIAGNOSED: ADVANCED` line is ISS-307, an
unrelated pre-existing finding on lines this unit does not touch — noted also in
`ledger-shard-union-reader.md`'s manifest as deliberately out of scope there too, though `master` has
since fixed it elsewhere at `ca86e53`, not yet in this worktree.)

```
$ node -e "<live disagreement scan, command 5 above>"
total manifests: 161 disagreements: 0 missing canonical field: 0
```
(Run twice: once before the backtick fix — `disagreements: 2`, naming
`delivery-gate-manifest-blindness.md` and `mc-hooks-bolded-status.md` — and once after, `disagreements:
0`. Only the "after" run is pasted above; the "before" run's two `DISAGREE:` lines are quoted verbatim
in "The bug I found in my own code" section.)

```
$ # re-run of command 4, AFTER writing this manifest file itself
$ powershell ... .claude/hooks/mc-sessionstart.ps1
MAKER-CHECKER ACTIVE: ... Open issues: 156 | Checks pending: 1 [handshake-field-reader] |
PASS not closed out: 0 | Queue TODO: 0 | ... | Ledger: qa/issues*.jsonl (12 file union)
STALL UNDIAGNOSED: ADVANCED -- run /agent-debugger on it before any new unit.
AUTO-CONTINUE REQUIRED: ...
```
(Correctly picks up this manifest as the one pending check, by name; no `HANDSHAKE DISAGREEMENT` line —
confirms this manifest's own "bug I found" prose, which quotes the exact backtick-led phrase that
caused the false positive elsewhere, does not retrigger it against its own file, since the fix already
lands before this file was written. Independently confirmed via
`node -e "...canonicalHandshakeStatus/isReadyForCheck/handshakeDisagreement against this file..."` →
`canonical: ready-for-check`, `isReadyForCheck: true`, `disagreement: null`.)

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | falsifying edit | observed |
|---|---|---|---|
| Canonical field decides pending/ready when present, over a disagreeing legacy field | `mc-hooks-handshake-field.ps1` groups 1 ("disagreement (legacy ready, canonical PASS)" / "(legacy PASS, canonical ready)") + JS test "canonical field WINS over a disagreeing legacy field, in both directions" | revert the `if ($canon) { $isReady = ... } else` branch to always use `$legacyReady` | RED: canonical-PASS/legacy-ready fixture would report pending when it must not, and vice versa |
| A disagreement is surfaced, never silently resolved | `mc-hooks-handshake-field.ps1` "both disagreements are named in a HANDSHAKE DISAGREEMENT line" + JS "names both sides when canonical and legacy disagree" | remove the `$disagreements +=` / `handshakeDisagreement()` call sites | RED: banner line / `disagreement` key would never appear |
| Absence of a legacy field is NOT a disagreement (canonical-only case) | JS "handshakeDisagreement: null for a canonical-only manifest" + PS "canonical-only ready-for-check is pending (constructed blind-spot case)" gives no disagreement banner | drop the `$legacyPresent` / `legacyStatusPresent()` gate, comparing `$isReady`/`canonicalReady` to the legacy boolean unconditionally | RED (this is the exact bug I hit and fixed mid-unit, see "Errors and fixes" in the earlier cycle of this same investigation): every canonical-only fixture would spuriously disagree against a legacy field that does not exist |
| All six D-042 vocabulary values parse and classify correctly | PS group 3 (6 assertions) + JS "canonicalHandshakeStatus reads every D-042 vocabulary value" | narrow `$HANDSHAKE_VOCAB` / `HANDSHAKE_VOCAB` to a subset | RED on the omitted value(s) |
| PASS-closeout widened to `**Result: PASS**` and bare `**PASS**`, without regressing `VERDICT:`/`Verdict:` or false-firing on `**PASSWORD**` | PS group 4 (6 assertions: 2 pre-existing controls, 2 new forms, 1 FAIL control, 1 PASSWORD control) | revert the pattern to `'VERDICT:\s*PASS'` alone | RED on the two NEW-form assertions only; the four control assertions stay green, isolating the claim |
| D-019 ledger union count is unaffected by this unit | PS group 5 (2 assertions) — same fixture shape as `mc-hooks-ledger-union.ps1` | none applied (non-regression check, run against the unmodified union logic) | GREEN, both before and after this unit's edits |
| The backtick/inline-code false-positive is fixed and covered | JS "an inline-code-quoted `Status:` example in PROSE is not a real legacy field" (3 assertions: agreeing prose, would-disagree prose, and a real-field control) + live corpus scan (command 5) | restore the backtick in `legacyReadyForCheck`'s/`legacyStatusPresent`'s character class | RED: the live scan reports 2 disagreements again; the prose-fixture assertions fail while the real-field control stays green |

**Mutation-run safety (D-020):** not applicable — no mutation testing was performed against any
production/repo file. Every fixture in both test suites is built in a throwaway
`CLAUDE_PROJECT_DIR`/temp-directory tree (PowerShell `$tmp` under `[System.IO.Path]::GetTempPath()`;
JS via `mkdtempSync`/`tmpdir()`), and the one "mutation-shaped" comparison in this manifest (the
before/after backtick fix) was a real code fix measured by re-running the live read-only scan, not a
mutation-and-restore cycle against this repo's own files.

## Measurement against the ledger (D-015)

ISS-350 records **4 reproductions**. Reporting by id, against the ledger's own recorded cases, per
`checker_note`'s correction (2026-09-28 consolidation sweep) rather than a self-authored corpus:

**ISS-350: reproduction 2 of 4 — code-level fix delivered; the reproduction's own cited live instance
does not reproduce via this mechanism (a pre-existing checker_note correction, not new to this unit).
Reproductions 3-4 deliberately left open, out of D-043 item 3's scope.**

| # | reproduction (verbatim, per `qa/issues.jsonl`) | result |
|---|---|---|
| 1 | only 30 of 159 manifests match a line-anchored `**Status:**` | **Already CLOSED by D-042** — not this unit's work; restated for completeness. |
| 2 | "Read the session-start hook output ... 'Checks pending: 0 \| PASS not closed out: 0' -- then read `delivery-gate-stamp-adoption.md` Status (ready-for-check, cycle 1) against its verdict (Cycle checked 1, VERDICT FAIL). A fix cycle is owed and the hook counted zero." | **Code-level fix delivered here** — both readers now parse `**Handshake status:**` when present. **But**: the `checker_note` on this row already established that this specific cited instance does not reproduce through the mechanism this reproduction names — `delivery-gate-stamp-adoption.md` already carried a bold `**Status:**` field (one of the 30 the *old* regex could already see), and its "Checks pending: 0" outcome is the separate, already-known **ISS-267** gap (a FAIL at current cycle counts as neither pending nor unclosed) — not a canonical-field blindness. A full live scan (this unit's own, reconfirming the checker_note) found **zero of 161 manifests** in the canonical-only, no-legacy-field state that reproduction 2's *mechanism* actually targets, so the mechanism-level fix in this unit had to be verified against a **constructed fixture**, not a live reproduction (see JS tests "canonical-only ready-for-check is ready" / "canonical-only checked-PASS is NOT ready", and PS group 1). Marking this **fixed at the code level, reproduction not independently re-observable live today** — an honest distinction, not a claim of a live-observed closure. |
| 3 | last `VERDICT` match in `hybrid-merge.md` reads the oldest cycle (newest-first ordering) | **OPEN, deliberately** — verdict-side, D-043 item 3 authorizes only the manifest-side reader; `verdictCycle()` is explicitly untouched (see Authorization). |
| 4 | ≥40 verdicts write `Verdict: PASS`, unmatched by an uppercase-only anchor | **OPEN, deliberately** — verdict-side, same scope boundary. Note also (from the `checker_note`) that the PASS-closeout widening in this unit (`**Result: PASS**` / bare `**PASS**`) is a *different* axis (the manifest-pending-check's own PASS detection in `mc-sessionstart.ps1`, welcomed by the 2026-09-28 consolidation sweep note) — it does not close reproduction 4, which is about `verdictCycle()`/the verdict census, not the hook's PASS-closeout grep. |

## What this unit does NOT do

- Does not touch `delivery-gate-stop.ps1` (does not exist in this repo; machine-wide; gated separately,
  `qa/gates/d043-machine-wide-scope.md`).
- Does not touch `verdictCycle()`, `stripQuoted()`, or any verdict-side reading (ISS-350 reproductions
  3-4, D-043 item 3's own stated scope boundary).
- Does not touch `manifestCycle()`'s regex, which shares the pre-existing backtick-inclusive character
  class this unit removed from two *other* functions — out of authorized scope, and it has its own
  documented reasoning (see its docstring) for a different, fence-aware approach via `stripQuoted()`
  that this unit did not need to touch.
- Does not re-derive or rewrite any manifest's `**Handshake status:**` value — that backfill is
  `handshake-canonical-field.md`'s completed work; this unit only teaches readers to consume the field.
- Does not merge or rebase onto `master`'s further history past `8cf88fc` (D-047–D-051, the `ca86e53`
  ISS-307 fix, other lanes' merges) — flagged above for the merge step, not resolved here.
- Does not claim a PASS. Only `/checker` can PASS this unit.

## **Status:** checked-PASS (cycle 0)
**Handshake status:** ready-for-check
