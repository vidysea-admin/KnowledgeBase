# Verdict — delivery-gate-machine-wide-fix

**Cycle checked:** 0
**Date:** 2026-09-28
**Checker:** fresh Claude subagent (Opus 5), independent context, read-only toward the artifact
**Contract:** `qa/contracts/delivery-gate.md` (proposed, 2026-09-09)
**Manifest:** `qa/manifests/delivery-gate-machine-wide-fix.md` @ `6b624f3`, `Status: ready-for-check`, `Fix cycle: 0`
**Authority:** D-049 (`Approved-by: Umesh`). D-043 is **not** treated as authority for this file.
**Round cap:** not applicable — 0 prior PASSed verdicts name the `delivery-gate-stop.ps1` seam since D-049. Confirmed by `grep -l 'VERDICT: PASS' qa/verdicts/*` cross-referenced against manifests naming that path.

```
VERDICT: PASS
SCOREBOARD: 9/9 criteria met (C3 with a stated latent caveat, see below), 3/3 invariants hold
FAILURES: none
CAPABILITY-COVERAGE: 21/21 rows reproduced (34/34 assertions re-run by me; 6/6 falsifying edits red with controls green)
LIVE-BROWSER: not-applicable (changed paths: D:/ai_os/.claude/hooks/delivery-gate-stop.ps1, qa/tests/mc-hooks-fixgap-and-stripper.ps1 — no UI surface)
ISSUES-WRITTEN: none
EXECUTOR: claude (manifest names no external Executor) — checker: fresh claude subagent, no ANTHROPIC_BASE_URL override
EXPLANATION: All three fixes were re-derived rather than accepted. I ran the real hook against all
four live projects with both the shipped and the pre-unit binaries and confirmed independently that
no project flips from never-blocking to blocking; I re-ran the corpus no-op per file across 1004
verdicts and 843 manifests (a superset of the manifest's 166/167) with a live self-test proving the
two readers genuinely differ; and I confirmed M6 pins the cap as class-based, not count-based. The
live machine-wide file was byte-identical before and after my whole run, and the test wrote nothing
into the real marker directory. The unit is PASSable on its evidence; its central artifact being
uncommitted is a real, separately-tracked defect (ISS-190) that I recommend escalating, not a defect
in this unit.
```

---

## Hard constraints — checked first, each an immediate FAIL if violated

| Constraint | Result |
|---|---|
| `C:/Users/Lenovo/.claude/settings.json` untouched | **HELD.** Checked **directly**, not from the maker's assurance. mtime `2026-09-27 17:09` — the day *before* this unit. sha256 `05fa1540…118d`. Line 124 still registers the hook with `timeout: 15`. Not a git repo, so mtime + the unit's own 08:19–08:31 window is the evidence. |
| The hook parses cleanly and actually runs | **HELD.** Parser API: `PARSE OK - 0 errors`. Beyond parsing, I invoked the real hook **~50 times** — 34 assertions in the standing test, 4 real project roots × 2 binaries, plus 15 degenerate-input probes. None threw. |
| Nothing edited outside what D-049 names | **HELD.** `D:/ai_os` holds 32 dirty tracked files, but mtimes isolate this unit's window (hook 08:19, `decisions/log.md` 08:31; commit 08:35). Every other dirty file predates 2026-09-28 07:47 or belongs to an unrelated session (`umesh/decisions/log.md` 08:30 is HUNT/career content; `.goal/goal.json` + `umesh/goals/*` 08:38–08:39 are the goal dashboard). |
| `D:/ai_os/.claude/skills/maker/SKILL.md` **not** modified by this unit | **CONFIRMED.** It *is* dirty, but mtime `2026-09-26 19:32` — two days old — and its diff contains delegation and PLAN-gate prose with **zero** round-cap / seam / prior-PASS content (`git diff … | grep -i 'round cap\|seam\|prior PASS'` → empty). The manifest's claim is true. |
| Claimed hashes and line counts | **EXACT.** live `28c1ae44…7337` ✓; backup `70a242fb…0968` ✓; `git show 87042de:…` also `70a242fb…0968` — so **the backup restores byte-identically to the committed baseline**. `606 → 741` lines ✓; `git diff --stat` = `142 insertions, 7 deletions` ✓. |
| `git -C D:/ai_os diff` on that path is exactly this unit | **CONFIRMED.** The file was clean at `87042de`, so the working-tree diff is the whole unit and nothing else. I read it in full. |

**Diff scope (step 4c).** The repo commit `6b624f3` adds exactly two files (manifest, test) and deletes
nothing. The out-of-repo diff's 7 deleted lines are all in-place replacements (the `Strip-Code` return,
the counter initialiser, the `$backlog` sum, two `Add-Content` lines, the `$reason` string, the `Trace`
line). **No function, export, test or config key was removed or renamed.** Both changed files are named
in the manifest's "What changed". My own probing left `D:/KnowledgeBase` clean — `git status` shows only
`.goal/goal.json` and `qa/.last-tick`, both already dirty at dispatch and owned by other sessions, which
I did not touch.

---

## Fix 1 — the `Fix cycle` predicate bug, and the machine-wide behaviour claim

I did **not** replicate the counting logic. I ran the **real hook binary** — shipped and pre-unit — with
`cwd` set to each live project root, `$env:TEMP` redirected, a synthetic transcript (so `scheduled=False`,
the worst case for blocking). I first audited every write in the hook: all 20 `Set-Content`/`Add-Content`/
`New-Item` calls target `$markerDir` under `%TEMP%`, so this is read-only toward those projects.

| Project | pre-unit trace | shipped trace | blocked before | blocked after |
|---|---|---|---|---|
| `D:\KnowledgeBase` | `pend=2 unclosed=0 queue=0` | `pend=2 unclosed=0 queue=0 fixgap=1` | **BLOCK** (MAKER) | **BLOCK** (MAKER) |
| `D:\erp` | `pend=2 unclosed=12 queue=4` | `pend=2 unclosed=12 queue=4 fixgap=20` | **BLOCK** (MAKER) | **BLOCK** (MAKER) |
| `D:\vc` | `pend=0 unclosed=0 queue=19` | `pend=0 unclosed=0 queue=19 fixgap=0` | **BLOCK** (MAKER) | **BLOCK** (MAKER) |
| `D:\autoTesting` | `pend=0 unclosed=0 queue=0` | `pend=0 unclosed=0 queue=0 fixgap=0` | no-block | no-block |

**The "no project flips from never-blocking to blocking" claim is independently confirmed, and by a
stronger instrument than the manifest used** — the real hook's own block decision, not a replica of its
counting. `d:/erp`'s **fixgap=20** reproduces exactly. Two harmless divergences from the manifest's table:
KnowledgeBase now reads `pend=2` (not 1) because this unit's own manifest is itself a second pending
check, and the manifest omitted `d:/vc`'s pre-existing `queue=19` — which strengthens the claim, since vc
was already blocking for a reason this change does not touch. `pend`/`unclosed`/`queue` are **identical**
across the two binaries on every project: the only delta anywhere is the new counter.

`Trace` gained `fixgap=`, the marker line gained `fixgap=`, and the block reason names it in prose. All
three verified in live output.

---

## Fix 2 — the ISS-205 stripper clause

**The honesty claim checks out against the ledger.** ISS-205's row states the property "`Strip-Code` …
can MANUFACTURE a cycle stamp that appears nowhere in the file" and records three reproductions in its
`evidence` field. I extracted `Strip-Code` **verbatim from each hook binary** (so neither reader can drift
from the real code) and ran the row's three reproductions plus the three clause-3 forms through the hook's
own `Cycle checked` regex:

```
case (real max stamp in every file = 1)
ISS-205(a) span-erased value adopts same-line digit  old=1 (ok)           new=1 (ok)
ISS-205(b) bare label + blank line + digit-leading   old=1 (ok)           new=1 (ok)
ISS-205(c) span value + next line leading digit      old=1 (ok)           new=1 (ok)
clause3 indented (4-space) code block                old=9 (MANUFACTURED) new=1 (ok)
clause3 ~~~ fenced block                             old=9 (MANUFACTURED) new=1 (ok)
clause3 unclosed ``` fence                           old=9 (MANUFACTURED) new=1 (ok)
```

So the manifest is telling the truth in both directions: ISS-205's own three reproductions **already
passed pre-unit** (it claims no credit, and says so), and the three forms it does close **genuinely
manufactured a stamp of 9 against a real maximum of 1**. This also answers ISS-229's complaint — that row
records reproduction (a) as *still silent* at 2/3; it now reads 1, and all three are pinned as standing
assertions (rows 7–9) for the first time.

**Corpus no-op, re-run by me per file.** My first attempt produced vacuous zeros (its `Invoke-Expression`
scoped the extracted functions locally, so every call silently errored and both sides read `-1`). I caught
that, rewrote it at global scope, and added a **self-test that fails the whole script unless the old reader
reads 9 and the new reads 1** on a known manufacturing case — so the comparison cannot pass by being inert:

```
SELF-TEST indented-block probe: old reads 9, new reads 1 (must be 9 then 1)
VERDICTS  n=1004 reads-higher=0 reads-lower=0
MANIFESTS n=843 status-diffs=0 fixcycle-diffs=0
no differences
```

That is a **strict no-op over all four projects** — 1004 verdicts and 843 manifests, a superset of the
manifest's 166/167 — with **0 reads higher** (the gate can never be silenced) and **0 reads lower**. The
aggregate `pend`/`unclosed` equality in the fix-1 table is the same result reached by a second route.

---

## Fix 3 — the ISS-346 round-cap check, and whether the cap stays class-based

**The cap is class-based, and M6 really pins it.** M6 deletes exactly one line —
`if ($p -match '(?im)^[\s\-*#>|]*Round cap:\s*\S') { continue }` — so the hook stops honouring the written
class decision and the cap becomes purely count-based. Its probe is the **security-class tree** (`Round
cap: SECURITY CLASS - cross-tenant read`), and `redWhen` is `$r.capBlocked`: red means a declared
security-class unit **got capped**. That is precisely the ISS-078 inversion — the cross-tenant read
disclosure first found at round 5 after four consecutive PASSes, which a count-based cap would have
shipped. Under M6 it goes red; in the shipped code it stays green. The harness also refuses a vacuous
mutation (`if (-not $src.Contains($mu.find)) { … the mutation is vacuous }`), and the control (a closed-out
manifest counting nothing) stays green under it, so the red is isolated.

**ISS-346's reproductions, re-run verbatim:**

1. `grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*` → `vector-gap-record.md`, `vector-gap-tenant-id.md`. **Reproduces.**
2. `qa/verdicts/vector-gap-tenant-id.md` lines 154 / 157 / 187 → all three present verbatim (the "not a unit of its own", the security-class exclusion, the round-3 prohibition). **Reproduces.**
3. `qa/manifests/vector-gap-durability.md` → `No such file or directory`. **Precondition genuinely gone.**

**The reasoning for leaving reproduction 3 open is right, not convenient, and I checked the authority
rather than taking the manifest's word.** D-044's Result section orders the sequence explicitly: *"(1)
build and check the ISS-346 mechanical cap check …; (2) file the `vector-gap-durability` manifest citing
this entry as its authorization"*. So the state reproduction 3 describes was dismantled **by the decision
that ordered this unit**, and re-creating it in the real repo to satisfy a measurement would be the exact
breach the check exists to prevent. D-015 requires an unfixed reproduction to be **named with its reason**,
which the manifest does. Its substance is measured instead in a throwaway tree using the row's **own**
seam (`apps/api/src/indexing/vector-gap.ts`) and **own** slugs (`vector-gap-record`,
`vector-gap-tenant-id`, `vector-gap-durability`) — I read the fixtures and confirmed they are the row's,
not a substituted corpus. `ISS-346: 2/3` stands.

**The keyword-sniffing measurement holds.** `qa/verdicts/vector-gap-tenant-id.md:157` does say *"I
considered whether this belongs in the **security class** (never capped). It does not"* about a durability
issue, while ISS-346's own evidence names `vector-gap.ts` and tenant scope throughout. Any generous
security keyword set would classify ISS-346's originating case as security and skip it. Requiring a
human-written `Round cap:` line instead of auto-classification is the correct call, and a PASS endorses it.

**Would-block census, re-derived by the real hook rather than a replica:** `ROUNDCAP candidates=0
capped=0` on all four projects (840 manifests). **0 false blocks.** In `D:/KnowledgeBase` the only
`ready-for-check`-with-no-verdict manifest is this unit's own, and it carries a `Round cap:` line at
line 8 — so the exclusion path is what produces the zero, correctly, not an inability to see candidates.
I also drove the block path directly in throwaway trees to confirm it fires when it should.

**Cost of the new requirement.** Every capped pull now needs a `Round cap:` line and no pre-existing
manifest has one — but the predicate only reads manifests that are `ready-for-check` **with no verdict
file**, of which there is exactly one on this machine right now, and it complies. The gate does not start
blocking everywhere.

---

## D-020 / D-050-SPEAKER ruling 3 — is the live file genuinely never armed?

**Yes. This is the strongest claim in the unit and it holds.** Three independent lines of evidence:

1. **Code:** the harness does `$src = Get-Content $hook -Raw` (a read) and writes each mutant to
   `$mutDir/hook-m<N>.ps1` under the system temp dir, then passes `-HookPath $mutPath`. The live file is
   never opened for write. `finally { Remove-Item -Recurse -Force $mutDir }`.
2. **Measurement:** I hashed `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` immediately before and
   immediately after the entire 34-assertion run — `28C1AE44…7337` both times, `identical: True`. That is
   my own hash, not the test's self-report.
3. **Timeout discipline:** every invocation runs under `Start-Job` with `Wait-Job -Timeout 90`, and a
   timeout **throws** (`throw "hook run timed out (90s)"`) rather than hanging — the `hop = -1` lesson.

This is strictly stronger than D-020's arm/restore, because there is no window in which a mutant is live
at all: the ISS-083 hazard class (a `score: 0.5` mutation found applied to production source) is removed
rather than mitigated. D-050-SPEAKER ruling 3's per-mutation scoping is satisfied by construction (one
copy per mutation), and its post-run touched-file check is present. One honest adaptation: the post-run
assertion compares against the **pre-run bytes**, not against HEAD — correct here, since the file is
legitimately dirty under D-049 and a HEAD comparison would fail by design.

**`$env:TEMP` redirection genuinely holds — and this is worth stating precisely, because the real
marker log *did* grow during my run.** `log.txt` went from 2,664,928 to 2,667,846 bytes. I chased it:
the real log contains **zero** lines from this test's temp trees (`grep -c 'dgt-'` → 0, `grep -c 'Temp.fx-'`
→ 0), and the real marker directory's file count was **1463 before and 1463 after** — no block budget
consumed. The growth came from concurrent activity in the same minutes: real Stop events from
`D:\KnowledgeBase` and `D:\autoTesting`, plus the maker's own ad-hoc probe trees (`lkb-roundcap-*`, `rc-*`
sids) from a session still running. The redirection is real; the log is simply shared with live sessions.

---

## Contract scoreboard

| Criterion | Judgement |
|---|---|
| **C1** all three `Status` forms seen | **met** — untouched, and re-verified empirically: `pend`/`unclosed` are identical between the two binaries on all four real corpora. |
| **C2** quoted prose is not counted | **met, strengthened** — indented blocks, `~~~` fences and unclosed fences now strip too. |
| **C3** cycle numbers are the HIGHEST, never the first | **met for this unit, with a disclosed latent caveat.** The verdict side takes the max (correct). The manifest side still takes the **first** `Fix cycle:` match — an asymmetry the manifest names rather than hides, measured at **0 divergences** over 167 manifests and independently at **0 over 843** by me. Not introduced here, not inside D-049's `Changes-authorized`, and fixing it would have been an unauthorized enforcement-path edit. Recorded, not charged. |
| **C4** stamp on its own line | **met** — untouched; the own-line form remains the read form. |
| **C5** fixtures pinned to the REAL corpus form | **met** — ISS-205's three fixtures are verbatim from the ledger `evidence` field; the ROUNDCAP fixtures use ISS-346's own seam and slugs; the handshake fixtures use `**Status:**` / `**Fix cycle:**` / `**VERDICT:**` as the corpus writes them. This is the criterion ISS-229 was filed against, and it is satisfied this time. |
| **C6** old-vs-new re-derivation over the real corpus | **met** — and I did not rely on the manifest's aggregate, which was thin. My per-file comparison with a falsifying self-test found 0 differences over 1004 verdicts / 843 manifests. |
| **C7** defect audited across every predicate and sibling hook, result stated | **met** — the manifest states the fixgap hole also exists in `mc-sessionstart.ps1` (ISS-267) and leaves it to its own unit. I confirmed independently that **neither** sibling defines `Strip-Code` at all, so clause 3 has no duplicate to audit. |
| **C8** fail-open preserved | **met** — I tested missing transcript, null `transcript_path`, null `session_id`, empty manifest, empty stdin, and malformed-argument input against **both** binaries: identical behaviour, every path exits unblocked (`EXIT no-transcript`, `EXIT empty-session-id`, `EXIT edits=0`). The new code sits inside the same `try`/`catch` fail-open. |
| **C9** block budgets and per-predicate markers hold | **met** — `ROUNDCAP` owns `<sid>.roundcap.blocked`, gated by `-not (Test-Path $markerCap)`, so it fires once per session and cannot consume MAKER's 3-block budget (which counts lines in its own marker). Placing it before MAKER is deliberate, so a capped pull is never masked. |
| **I1** never writes outside `%TEMP%/claude-delivery-gate` | **holds** — I audited all 20 write calls; every one targets `$markerDir`. Running the hook against four real project roots mutated nothing in them. |
| **I2** no C1-for-C2 trade | **holds** — every change is in the loud direction (0 reads higher anywhere) and a measured no-op on real data. |
| **I3** mutation evidence follows D-020 | **holds** — see the section above; exceeded, not merely met. |

**Performance, since the hook has a 15 s Stop budget and fix 3 adds directory work.** I timed both
binaries end to end (including ~0.7 s of PowerShell start and `Start-Job` overhead): `D:\erp` 9.71 s base
vs **9.15 s new**; `D:\autoTesting` 6.65 s vs 7.63 s; `D:\KnowledgeBase` 13.22 s vs **8.60 s**. No
regression — the candidate scan short-circuits at 0 candidates, as claimed, and now that is measured with
the real binary rather than outside it. The manifest's disclosure stands that this excludes a real
hundreds-of-MB transcript scan.

---

## The two flagged items, folded in as asked

### 1. The permission boundary — is the final state genuinely verified?

**Yes, and on my evidence rather than the maker's.** The auto-mode classifier denied the mandated
parse-check as `[Self-Modification]` mid-fix-3, and the maker **reverted its one unverified edit** back to
the last PARSE-OK state rather than leave unverified code live on a machine-wide hook. That was the right
call. The shipped state is verified three ways by me: the parser API reports `PARSE OK - 0 errors`; the
real hook executed ~50 times across four live project roots, the standing test's temp trees, and 15
degenerate-input probes without a single exception; and its sha256 matches the manifest's claim exactly.
Nothing about the final state rests on the denied command.

One unresolved observation I could not pin, recorded rather than charged: the real marker log holds **10**
`EXIT exception: You cannot call a method on a null-valued expression.` lines, all on 2026-09-28 at 08:35
and 08:41 — i.e. **after** the hook changed at 08:19 — every one in the maker's own ad-hoc
`lkb-roundcap-*` probe trees with `rc-*` sids, never from a real project. I tried to reproduce it against
the shipped binary on ten input shapes (missing/null transcript, null session id, empty manifest, empty
stdin, a PASS verdict with an empty manifest, a PASS verdict with no manifest, a candidate with an empty
`What changed`, the block path itself) and the shipped and pre-unit binaries behaved **identically** on
every one, with no exception. The same log also shows `EXIT exception: Invalid JSON primitive: rc-…` from
that harness at 08:24, which is the documented `-InputJson` quote-stripping failure — I reproduced that
one on demand. So the most likely explanation is the maker's hand-rolled probe harness, not the hook. It
is below the 80 % bar for a FAILURE line and I am not filing it; a reader should know it exists, and
`%TEMP%\claude-delivery-gate\log.txt` is where a real-session recurrence would show up.

### 2. Is the unit PASSable while its central artifact is only an uncommitted working-tree change?

**Yes — and I want to be precise about why, because the easy answer in both directions is wrong.**

It is PASSable. Everything a verdict can certify about this change, I certified against the artifact **as
it is actually running on this machine**: the bytes, the parse, the behaviour on all four live corpora,
the no-op, the falsifications, the fail-open. The repo-side artifacts are committed at `6b624f3`. The
pre-unit state is committed at `87042de` and the backup is byte-identical to it, so the change is exactly
attributable and fully revertable — `git -C D:/ai_os diff` on that path **is** this unit and nothing else,
which I confirmed rather than assumed. And the maker's reason for not committing is sound: D-049's
`Changes-authorized` covers editing the file, not making an enforcement-path commit in another repo, and
`D:/ai_os` currently carries ~30 unrelated dirty files from other sessions, so a commit there risks
capturing work that is not this unit's. **Declining was the conservative and reversible choice.** I did
not commit `D:/ai_os` either.

But the PASS carries a real limitation that should not be buried: **this verdict certifies a byte-state
that nothing pins.** The standing test asserts only that the live file is unchanged *across a run*; it
does not assert the file equals `28c1ae44…7337`. If any session edits or reverts that file, this PASS
silently stops describing reality, and there is no commit in any repo to compare against. That is exactly
the ISS-190 condition, and it now covers strictly more than before.

**My position on ISS-190's severity: it should rise from `high` to `critical`.** Its row describes three
uncommitted machine-wide hooks whose diff was an *unratified* work-in-progress. The condition now also
covers a **same-day, Approver-authorized** change to a Stop hook firing in every project on this machine,
together with the shared-log entry D-049 explicitly *requires* as the trace for projects that never saw
the decision — which is itself uncommitted, so that trace does not yet exist anywhere durable. The defect
has moved from "work in progress is unreviewable" to "an authorized machine-wide enforcement change exists
only in one volatile working tree". That is a step up in kind, not just in count.

**I am deliberately not editing the row myself.** Three other agents are live, two of them checkers that
may write the ledger, and D-019 records this repo's concrete history of concurrent lanes colliding on
`qa/issues.jsonl` — including the same finding getting two different ids. An in-place severity edit is not
an append and `merge=union` will not save it. The recommendation belongs to the sweep's single
consolidation writer, and I am stating it here so it is on the record rather than racing for it.

For the same reason I am leaving **ISS-205** and **ISS-346** at `open` rather than flipping them to
`fixed`. That is not only concurrency caution: the fixes are not durable until the artifact is committed,
so `fixed` would overstate the state. Flip them in the same move that resolves ISS-190.

---

## What I did not verify

- **Behaviour against a real live transcript in a real session.** Every run here — the maker's and mine —
  feeds a synthetic one-line transcript, so the `$scheduled` turn-boundary scan, the 40 MB tail read, the
  `tool_result` / `task-notification` discrimination and the 4,000-line window are untouched and
  unexercised. The manifest disclosed this plainly and I confirm the gap is real. The F1 false-block class
  of 2026-09-09 lives in that code.
- **`ROUNDCAP`'s once-per-session marker across a real multi-turn session** — asserted only within single
  synthetic runs.
- **The 15 s budget with a real transcript in play.** My timings isolate the corpus work only.

## Notes, none rising to a finding

- The predicate accepts **any** non-empty `Round cap:` value, including this unit's own `not applicable`.
  It forces a decision onto the record; it does not validate it. That is what the manifest says it is, and
  it is the right trade given the measured failure of keyword classification — but a maker could write
  `Round cap: fine` and pass. The mitigation is that a checker reads that line, as I did here.
- The indented-block strip `(?m)^(?:[ ]{4,}|\t).*$` is broader than markdown's true indented-code rule: a
  4-space-indented list continuation is stripped too. The direction is safe (a missed stamp biases to
  *pending*, i.e. louder) and my per-file comparison found **0 reads lower** across 1004 verdicts, so
  nothing live is affected.
- Because closed ``` fences are replaced with a single `~` *before* the `~~~` rule runs, three such
  replacements landing adjacent at line start could theoretically form a `~~~` fence and strip more.
  Loud direction only; 0 occurrences in the corpus.
- The manifest's fix-1 census names 3 of `d:/erp`'s 20 fix-gapped slugs and elides "(17 more)". C6 asks
  for itemisation; for this repo's corpus the single affected unit **is** named, and I re-derived the erp
  count independently with the real binary.
- `mc-sessionstart.ps1` has no code-stripping of any kind, so it is *more* exposed to prose stamps than
  this hook was. That is pre-existing (ISS-183 / ISS-267 territory) and is a live concurrent unit's file —
  out of scope here, and I stayed out of it.
- `lint:structure` cannot go green for pre-existing reasons (4 `lint-loc` violations, root-file count,
  stale `docs/SNAPSHOT.md`, 5 tracker-audit findings). None attributed to this unit.

## What I re-ran

- `[System.Management.Automation.Language.Parser]::ParseFile(…)` on the live hook → `PARSE OK - 0 errors`.
- `qa/tests/mc-hooks-fixgap-and-stripper.ps1` → `RESULT: PASS`, exit 0, 34/34, M1–M6 all red with controls green, with my own sha256 of the live file taken before and after.
- The real hook binary vs the pre-unit backup, `cwd` = each of `D:\KnowledgeBase`, `D:\erp`, `D:\vc`, `D:\autoTesting`, `$env:TEMP` redirected — block decision, `MAKER` and `ROUNDCAP` trace lines, and wall-clock timing.
- A checker-authored per-file corpus comparison with a falsifying self-test, `Strip-Code` extracted verbatim from both binaries, over 1004 verdicts and 843 manifests in all four projects.
- ISS-205's three recorded reproductions and the three clause-3 forms, on both binaries.
- ISS-346's reproductions 1–3, and D-044's ordering clause.
- 15 degenerate-input probes against both binaries (fail-open).
- Direct reads: `settings.json` (hash, mtime, line 124), `git status`/`git diff`/mtimes in `D:/ai_os`, D-049, D-051, D-050-SPEAKER ruling 3, D-044, D-014's round-cap section, and the ledger rows for ISS-205, ISS-229, ISS-266, ISS-190, ISS-209, ISS-346.
