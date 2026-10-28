# Verdict — handshake-canonical-field · CYCLE 1

**Contract:** none governs the manifest record's own format; `qa/contracts/delivery-gate.md` [C7] applies by extension (per manifest header).
**Manifest:** qa/manifests/handshake-canonical-field.md (Fix cycle: 1 of max 3)
**Cycle checked: 1**
**Date:** 2026-09-27
**Checker:** fresh Claude Sonnet subagent (claude-sonnet-subagent), no session context shared with the maker or with the cycle-0 checker.
**Commit under judgement:** 1fe83d7 (HEAD at dispatch). Prior cycle-0 verdict below this one, unmodified.

```
VERDICT: PASS
SCOREBOARD: 6/6 manifest claims independently confirmed (exactly-once, distribution, unresolved-set,
  additivity, D-015 counts, u2-fix1-ingest-guards hand-adjudication); 0 FAILURES
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (pure documentation backfill; no code capability claimed)
LIVE-BROWSER: not-applicable (qa/manifests/*.md prose only; no UI surface touched)
ISSUES-WRITTEN: none (ISS-351 updated in place — see ruling below; this is a status correction on
  an existing row, not a new finding)
EXECUTOR: claude-sonnet-subagent (manifest declares none) (checker: claude-sonnet-subagent)
EXPLANATION: Cycle 1's method fix (read every anchored status statement, exclude cycle-history
  "superseded by" notes, hand-adjudicate genuine disagreement instead of guessing) is verified
  correct, including on the adversarial case. The maker's disagreement with cycle 0's ISS-351 is
  RULED IN THE MAKER'S FAVOR on independently re-run evidence (see below) — checked-PASS on
  qa/manifests/u2-fix1-ingest-guards.md is the correct derivation, not a false PASS. All five
  verification commands reproduce exactly as claimed. The additivity check initially appeared to
  disagree (577 vs the manifest's claimed 320) — independently traced to a baseline artifact (the
  manifest's own 320 excluded its own not-yet-committed 257-line file, since `git diff` omits
  untracked files) rather than any hidden edit; re-run against the correct baseline confirms 320/2
  on the 159 pre-existing files, byte-for-byte. ISS-351 corrected on the ledger to wontfix with a
  full adjudication trail, since its central claim does not survive verification.
```

## 1 · Ruling on the ISS-351 disagreement — the maker is correct, cycle 0 was wrong

This is the job I was dispatched to do first, so it comes first.

**Claim under dispute:** cycle 0 said `qa/manifests/u2-fix1-ingest-guards.md`'s true state is
`BLOCKED`, and that stamping it `checked-PASS` is a false PASS on an unfinished production-Mongo
live repair (filed as ISS-351, severity high).

**What I re-ran myself, fresh (not trusting the manifest's pasted `git log -S` output):**

```
$ git log --follow --format='%h %ad %s' --date=format:'%Y-%m-%dT%H:%M' -- qa/manifests/u2-fix1-ingest-guards.md
1fe83d7 2026-09-27T23:41 handshake-canonical-field cycle 1: derive from ALL status statements, refuse to guess
14f5771 2026-09-27T07:39 maker: close out u2-fix1-ingest-guards (checker PASS cycle 1)
e5ca83b 2026-09-27T07:26 maker: u2-fix1 ready-for-check (code claim; live index deferred to post-merge per Umesh)
9f6b784 2026-09-27T00:03 maker: u2-fix1 live repair run evidence (transcribe+seed OK, index failed on lane module-instance artefact)
87df8e8 2026-09-25T13:45 fix cycle 1 (u2-fix1-ingest-guards): coverage/index guards + session-id root cause for ISS-304/305/306
```

This confirms the maker's timing claim (checked-PASS field introduced by 14f5771, later than the
BLOCKED evidence in 9f6b784) and goes further — I read the actual diffs, not just the commit list:

```
$ git show 9f6b784 -- qa/manifests/u2-fix1-ingest-guards.md
```
Appends the "Live repair run — 2026-09-27" section ending "Status unchanged: BLOCKED (live proof
incomplete: chunks still 0)." At this point in real time, BLOCKED is genuinely the file's only and
current status.

```
$ git show e5ca83b -- qa/manifests/u2-fix1-ingest-guards.md
```
This is the pivotal commit, and it is more decisive than the maker's own dispatch argued. It does
NOT merely coexist with the old BLOCKED text — it explicitly **rewrites the top field** from
`**Status: BLOCKED (not ready-for-check).**` to `**Status:** ready-for-check`, inserts a dated
"Status update" paragraph narrating the transition, **explicitly relabels the old paragraph
"Previous status (historical): BLOCKED..."**, and states in the same edit: *"The history below is
kept as written."* This is a first-person, contemporaneous authorial statement that the material
below is retained narrative, not the current state — not something inferred after the fact from
line position.

```
$ git show 14f5771 -- qa/manifests/u2-fix1-ingest-guards.md
```
Changes the top field from `ready-for-check` to `checked-PASS (verdict qa/verdicts/
u2-fix1-ingest-guards.md, cycle 1, ...)`, citing a real checker verdict.

**I independently read that cited verdict** (`qa/verdicts/u2-fix1-ingest-guards.md`, no cycle
suffix in its heading but body states `**Cycle checked:** 1`): `VERDICT: PASS`, scored 3/3 root-
cause fixes, 4/4 capability rows independently reproduced in a throwaway copy by that checker
(green-before/red-after/restored-clean), and it explicitly states *"ISS-304/305/306 correctly
remain OPEN in the ledger... pending the post-merge run Umesh already scheduled — that gap is
disclosed by the maker, not hidden."* This is a real, substantive, independently-reasoned PASS
verdict, not a rubber stamp.

**This settles the question two independent ways, not one:**

1. **Chronology + authorial intent.** The BLOCKED text was written earlier in real time and was
   explicitly, contemporaneously marked as retained history when the status transitioned. Cycle
   0's method — take the file's own later-in-position text as authoritative — silently assumes
   file position tracks edit time. It does not, here or anywhere STATUS sections get updated in
   place while historical narrative accumulates below them. This is the same class of assumption
   cycle 0 itself named as a risk for VERDICT files (newest-first ordering) but did not apply to
   this manifest's own STATUS section.
2. **What the field is actually for.** Per this unit's own "Why" section, the handshake field
   exists so "any session... learns that a check is owed." A checker DID check this exact
   manifest at the exact cycle it currently cites (cycle 1) and DID return PASS. No check is owed.
   That is what `checked-PASS` means, independent of any git archaeology.

**Fresh evidence beyond what either side cited:** I checked the current state of ISS-304/305/306
in `qa/issues.jsonl` (not referenced by either the manifest or cycle 0's verdict). All three now
carry `"status": "fixed"`, `"fixed_date": "2026-09-27"`, and `"live_evidence"` recording a
post-merge `--reingest` run (commit `db6de4e`) that produced `chunks=27, EXIT 0`, cross-checked
against a read-only Mongo query showing 41 turns / 27 chunks under the corrected session id. The
live repair ISS-351 was worried about as "unfinished" has since completed and is on record. This
does not retroactively make cycle 0 wrong (that evidence postdates its check), but it does confirm
the maker's design — PASS the code, leave the ISS rows open until live proof lands — worked exactly
as intended.

**Ruling: checked-PASS is CORRECT for `qa/manifests/u2-fix1-ingest-guards.md`. ISS-351's central
claim does not hold.** I have corrected the ledger row myself (I am the ledger's writer): `ISS-351`
status changed `open -> wontfix`, with a `checker_note` carrying this adjudication and its evidence
inline, exactly as the manifest requested ("I have not touched ISS-351's row... the cycle-1 checker
should rule on this adjudication"). Severity is not escalated for a row that was itself
methodologically wrong but made in good faith on a real ambiguity in the source file — this is not
a case of the maker or cycle-0 doing something wrong, it is two readers reasonably reaching
different conclusions from a file whose own internal ordering invites exactly this confusion (which
is why the maker's own "Note to the checker" independently flags the two-fields-can-drift risk as a
real, unmitigated one — that concern stands on its own, separate from ISS-351's specific and now-
refuted claim).

## 2 · Method fix — adversarial test

The corpus has exactly two manifests with 3+ anchored status-like statements:
`u2-fix1-ingest-guards.md` (above) and `u0-zoom-iframe-traversal.md`. Independently re-derived the
latter:

```
$ grep -n '^\*\*Status\|^## Status' qa/manifests/u0-zoom-iframe-traversal.md
340:**Status (cycle 1):** superseded by cycle 2 below.
529:**Status (cycle 2):** superseded by cycle 3 above.
531:**Status:** checked-PASS (cycle 3, checker verdict `qa/verdicts/u0-zoom-iframe-traversal.md` "Cycle 3")
$ grep '^\*\*Handshake status:\*\*' qa/manifests/u0-zoom-iframe-traversal.md
checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
```

Correctly excludes both "superseded by cycle N" notes (cycle-history, not the unit's status) and
derives `checked-PASS` from the one real, current statement — matches independent reading exactly.
No manifest in the corpus of 160 has genuinely disagreeing non-history statements other than
`u2-fix1-ingest-guards.md` itself, which is the adversarial case: the field does not silently guess
there either — it names the disagreement, cites the resolving evidence inline, and marks itself
`HAND-ADJUDICATED`, which a reader can verify by re-running one command. That is the right shape for
a case a script legitimately cannot resolve alone.

Spot-checked 9 additional files at random spanning all four status forms
(`T-001-knowledge-base-schema`, `T-006-recording-gap-tracking`, `delivery-gate-manifest-blindness`,
`delivery-gate-stamp-adoption`, `write-guard-enforcement-gaps`, `golden-set-regeneration`,
`hybrid-merge`, `embed-on-index`, `roadmap-tracker-reconciliation`) — all derive correctly,
including `delivery-gate-manifest-blindness` (STALLED, cycle 3) which cycle 0 already confirmed is
not fooled by its own quoted decoy text.

## 3 · Verification commands — all reproduce exactly

```
$ grep -c '^\*\*Handshake status:\*\*' qa/manifests/*.md | grep -v ':1$'
(no output)                                                          -- matches "expect no output"

$ grep -h '^\*\*Handshake status:\*\*' qa/manifests/*.md | sed 's/^\*\*Handshake status:\*\* //; s/ —.*//' | sort | uniq -c
      2 STALLED
    152 checked-PASS
      3 ready-for-check
      3 superseded
                                                                      -- matches exactly (total 160)

$ grep -l '^\*\*Handshake status:\*\* \(ready-for-check\|STALLED\)' qa/manifests/*.md
qa/manifests/delivery-gate-manifest-blindness.md
qa/manifests/delivery-gate-stamp-adoption.md
qa/manifests/handshake-canonical-field.md
qa/manifests/u2-4-phase3-precision-regate.md
qa/manifests/write-guard-enforcement-gaps.md
                                                                      -- matches exactly, 5 named files
```

## 4 · Additivity — confirmed, after tracing an apparent discrepancy to its real cause

The manifest claims `git diff --numstat qa/manifests/` → `320 2`. Re-running the equivalent
post-commit comparison, `git diff --numstat fd8162d..1fe83d7 -- qa/manifests/`, initially gave
**`577 2`** across 160 files — a real, unexplained gap worth chasing rather than dismissing.

Traced it directly: `git diff --numstat fd8162d..1fe83d7 -- qa/manifests/handshake-canonical-field.md`
shows `257 0` — the manifest's own file is **brand new** (its entire git history is the single
commit `1fe83d7`; `git log --follow` on it shows nothing earlier). `git diff` never lists untracked
files, so the manifest's own pre-commit `320 2` measurement legitimately excluded its own
not-yet-`git add`ed 257-line self. `257 + 320 = 577` — exact. Re-running the numstat excluding that
one file:

```
$ git diff --numstat fd8162d..1fe83d7 -- qa/manifests/ | grep -v handshake-canonical-field | awk '{a+=$1; d+=$2; n++} END {print n, a, d}'
159 320 2
```

Matches the manifest exactly. Per-file shape confirms clean, uniform appends:

```
157 files: +2 / -0   (blank line + field line, clean append)
  2 files: +3 / -1   (iss-262-lint-loc-split.md, u2-4-phase3-precision-regate.md)
```

Read both `+3/-1` diffs directly: in each, the old final line (`## Status: ...`) is re-added
byte-identical, only losing its "no newline at end of file" marker, followed by a blank line and
the new field — exactly the trailing-newline artifact the manifest describes, confirmed by reading
the diff text myself, not taken on trust. **No governance text was altered anywhere in
`qa/manifests/`.**

## 5 · D-015 — ISS-350 counts confirmed against the ledger row

Read `qa/issues.jsonl` line 348 (`ISS-350`) directly: it records exactly 4 `reproductions` entries,
in the same order and substance as the manifest's table (form-count, hook-miscounted-owed-cycle,
newest-first-VERDICT-misread, unmatched-lowercase-`Verdict:`). The manifest's "1 closed / 3 open,
each named with its reason" maps 1:1 onto those four, restates none as easier, and drops none.
Confirmed compliant.

## 6 · Vocabulary — `paused` and `BLOCKED` both match zero files; neither is a defect

- **`paused`:** `u2-4-phase3-precision-regate.md`'s only anchored status statement is
  `## Status: ready-for-check` (confirmed by direct grep). The unit IS separately gated by
  `qa/.paused.u2-4-phase3-precision-regate` (RAM condition, extensively documented in
  `docs/DECISIONS.md` D-036/D-038) — but that pause marker governs a live sub-process (a qwen3:8b
  eval run), not this manifest's own document-level claim that its current deliverable is ready for
  a checker. These are legitimately different axes, the same distinction this cycle's own ISS-351
  ruling turns on (unit-handshake-state vs. issue/subtask state). The backfill's own stated scope
  is "derived from the file's own existing status text, never invented" — it was never designed to
  cross-reference `qa/.paused.*` markers, which are a separate governance surface. Not a defect.
- **`BLOCKED`:** added to the vocabulary specifically for the one candidate file that had literal
  BLOCKED status text, and that file resolved to `checked-PASS` via the hand-adjudication ruled
  correct above. An unused vocabulary value is not itself a defect — it is available should a
  future file's current status genuinely resolve to it.

## 7 · Everything else

Confirmed no new repo file was added outside `qa/manifests/` (the note about `scripts/` staying at
32/32 is accurate and unaffected). No test suite covers `qa/` prose, consistent with the manifest's
own statement — the commands above are the complete evidence and all were re-run, not pasted.

---

# Verdict — handshake-canonical-field

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude Sonnet subagent (claude-sonnet-subagent), no session context shared with the maker.

## What I re-ran myself

All commands below were executed fresh in `D:\KnowledgeBase`, not copied from the manifest.

1. `git log -1 --format=%H` → `76c33634cd52426f23e1bbd75cc1d2161beb8c6e` (base for this check).
2. `grep -n '"id": "ISS-350"' qa/issues.jsonl` — read the row in full (reproductions, evidence,
   fix_direction, notes) before touching the manifest's summary of it.
3. `grep -c '^\*\*Handshake status:\*\*' qa/manifests/*.md | grep -v ':1$'` →
   **`qa/manifests/handshake-canonical-field.md:2`** (not empty, contra the manifest's "expect no
   output" — see Finding 2).
4. `grep -h '^\*\*Handshake status:\*\*' qa/manifests/*.md | sed 's/^\*\*Handshake status:\*\* //; s/ —.*//' | sort | uniq -c`
   → `1 <state>` / `2 STALLED` / `152 checked-PASS` / `3 ready-for-check` / `3 superseded` (not the
   manifest's claimed `2 ready-for-check`; see Finding 2 — explained, low severity).
5. `grep -l '^\*\*Handshake status:\*\* \(ready-for-check\|STALLED\)' qa/manifests/*.md` → the 4
   claimed files plus the unit's own manifest (expected — it hadn't been checked yet when it wrote
   itself; see Finding 2).
6. `git diff --numstat qa/manifests/ | awk '{a+=$1; d+=$2} END {print a, d}'` → **`320 2`**, matches
   the manifest exactly.
7. `git diff -- qa/manifests/iss-262-lint-loc-split.md` and
   `git diff -- qa/manifests/u2-4-phase3-precision-regate.md` — both deletions are confirmed
   byte-identical, trailing-newline artifacts: the old `## Status: ...` line is re-added unchanged
   (`\ No newline at end of file` on the old side), with only a blank line + the new field appended
   after it. No governance text was altered in either file.
8. `git status --short` — the only untracked/changed paths touched by this unit are inside
   `qa/manifests/`, plus the new file `qa/manifests/handshake-canonical-field.md` itself. The other
   dirty paths in the tree (`.goal/goal.json`, `docs/DECISIONS.md`,
   `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md`,
   `qa/gates/iss-322-sender-spoofing.md`, `qa/gates/ledger-shard-union-hook.md`) were already
   modified before this unit started (they match the git-status snapshot recorded at this session's
   start, from prior work) — not touched by this unit. The "nothing else was changed anywhere in
   the repo" claim holds.
9. `find .claude -iname '*sessionstart*'` → `.claude/hooks/mc-sessionstart.ps1` exists, is a real
   enforcement path, and is untouched by this diff — corroborates the claim that fixing the reader
   half needs an `Approved-by` DECISIONS entry and legitimately could not land in this unit.
10. Spot-checked derivation against independent reading on 15 files, spanning all three original
    status forms plus a fourth variant discovered in the wild (`**Status: checked-PASS**`, bolded
    including the value): `T-001-knowledge-base-schema`, `T-005-ask-router`,
    `T-006-recording-gap-tracking`, `golden-set-regeneration`, `hybrid-merge`, `web-settings-keys`,
    `speaker-verbatim-token-boundary`, `iss-262-lint-loc-split`, `search-prefilter-bypass-pin`,
    `delivery-gate-stamp-adoption`, `dispatch-state-quoting-and-vacuity`, `speaker-resolution-llm`,
    `session-loading-verification`, `chunk-schema-and-chunker`, `u2-fix1-ingest-guards`,
    `delivery-gate-manifest-blindness`, `evidence-trust-by-content`, `score-input-trust-complete`.
    14 of 15 derived correctly, including a good save on `delivery-gate-manifest-blindness.md`
    (correctly picked STALLED despite the file's own prose *quoting* `**Status:** ready-for-check`
    and `## Status: ready-for-check` as examples of the bug it documents — the script did not get
    fooled by that decoy text). **One is wrong: `u2-fix1-ingest-guards.md` — see Finding 1.**

## Findings

**[Finding 1] sev: high — wrong derivation on `qa/manifests/u2-fix1-ingest-guards.md`, filed as ISS-351.**
The file's top `**Status:** checked-PASS (...)` line is immediately followed, in the same section,
by a dated "Status update 2026-09-27T07:30+05:30 (maker): moved to ready-for-check on the code claim
only," then further down a `## Status: BLOCKED — code complete and unit-tested; live repair ...
requires a human` heading, then a "Live repair run — 2026-09-27" section recording an attempted
`--reingest` that hit ISS-308 and failed ("Index: FAILED loudly"), ending in the file's own last
line: **"Status unchanged: BLOCKED (live proof incomplete: chunks still 0)."** The backfill derived
`checked-PASS` — matching neither of the file's later, superseding statements. This looks like the
script took the first `**Status:**` match rather than the file's own most recent status language.
This is exactly the disease ISS-350 exists to cure, reproduced inside the cure, and it landed on a
manifest that concerns an *unfinished* production-Mongo live-repair (ISS-304/305/306 stay open) — a
reader trusting the new field could wrongly conclude that work is done. This is the file the
manifest's own step 5 invited the checker to look for ("look hard for a file where the derived value
is wrong or where two plausible statuses exist"), and it is real, not suspected: >80% confidence.
Filed **ISS-351** (high), fix direction included (resolve to the last-written status, or emit
`UNDERIVABLE` on a multi-status file rather than guess).

**[cycle-1 note, added retroactively by the cycle-1 checker]:** this finding's premise — that file
position reflects edit chronology — is disproven by the actual commit history (see CYCLE 1 verdict
above, section 1). ISS-351 has been corrected on the ledger to `wontfix`.

**[Finding 2] sev: low — the unit's own manifest breaks its own "exactly once" and count claims** (not
filed to the ledger — this repo's D-013/D-014 override sends low-severity observations to this
EXPLANATION-equivalent, not the backlog). `qa/manifests/handshake-canonical-field.md` itself contains
the field pattern twice: once as a real field (line 168) and once inside a fenced code-block example
in "What changed" (line 38, showing `<state>` as a placeholder). A naive column-0-anchored grep — the
manifest's own verification command 1 — cannot tell the difference, so it flags the manifest's own
file and the claimed distribution counts (`2 ready-for-check`, no `<state>` row) are off by the time
the manifest submits itself for check. This is confined to the unit's own newly-added file, does not
touch any of the 159 backfilled manifests, and does not misrepresent any unit's real status — it's
circular self-reference (a file can't audit itself before it exists). Worth a one-line cleanup (fence
the example differently, e.g. indent it or use inline code) but not a defect in the backfill itself.

**[cycle-1 note]:** fixed in cycle 1 (example now indented); verification command 1 now returns
empty, confirmed above.

## Ruling on the manifest's specific questions

- **D-015 compliance:** confirmed. ISS-350's ledger row records exactly 4 reproductions; the
  manifest's table maps 1:1 onto them (same wording, same order), reports 1 closed / 3 open-with-reason
  against the ledger's own cases, and does not substitute a self-authored corpus for them. No
  reproduction was dropped or restated into something easier.
- **Additive-only:** confirmed. `320 2` reproduced exactly; both deletions are byte-identical
  trailing-newline artifacts, verified directly (not taken on the manifest's word). No governance
  text was altered anywhere in `qa/manifests/`, and no file outside it was touched by this unit.
- **Derivation correctness:** **not fully confirmed** — 1 of 15 spot-checked files is wrong
  (Finding 1 / ISS-351). The claimed exact set of 4 unresolved units is accurate as far as the field
  goes, but the field's trustworthiness elsewhere in the 159 is now in question until ISS-351 is
  resolved and a broader check is run for the same first-match bug on other multi-status files.
- **Second-field-vs-normalize tradeoff:** the reasoning (92 headings are cited by commit
  messages/verdicts; rewriting them repoints live references, same logic as D-019's non-renumbering
  of lane ids) is sound and I would make the same call. The manifest is honest that it creates a
  two-field drift risk with no mitigation — and Finding 1 is a small preview of exactly that risk
  materializing (a status field that can silently go stale relative to the file's own prose). This
  does not block the unit — the tradeoff was disclosed, reasoned, and not a safety/data invariant —
  but I'd treat "the two fields can be inspected out of sync" as more than theoretical from now on.
- **Scope honesty:** accurate, not an overclaim. `mc-sessionstart.ps1` is a real, unmodified
  enforcement path, confirming the reader-side fix legitimately needs an `Approved-by` DECISIONS
  entry and could not land here. The verdict-side gaps (`VERDICT:` vs `Verdict:`, newest-cycle-first
  verdict ordering) are correctly described as untouched and out of scope — ISS-350's own
  reproductions 3 and 4 (verdict-side) are unaddressed by this unit, exactly as the manifest states.

## Verdict rationale

The unit's mechanical, additive backfill claim is materially true for 158 of 159 pre-existing
manifests I could sample confidence in, but the checker's job under this repo's own rules is to
verify the claim, not credit the intent, and one of the spot-checked files is provably wrong in a way
that defeats the field's whole purpose on a manifest that matters (an unfinished production-data
repair). Per the checker SKILL's "PASS requires every criterion evidenced... default to FAIL when
proof is absent," and the manifest's own step 5 claim ("Derivation agrees with an independent
reading"), this fails on the evidence found.

```
VERDICT: FAIL
SCOREBOARD: 4/5 manifest-stated verification claims met, 1/5 failed (derivation correctness)
FAILURES (if any):
- [How-to-verify #5, derivation correctness] sev: high · qa/manifests/u2-fix1-ingest-guards.md derived `checked-PASS` but the file's own later status text says BLOCKED / ready-for-check, over unfinished production-Mongo live-repair work · fix direction: resolve multi-status files to the last-written status (or emit UNDERIVABLE), then re-audit the 152 checked-PASS files for the same first-match bug · issue: ISS-351
CAPABILITY-COVERAGE: not-applicable (pure documentation backfill; no code capability claimed, nothing to falsify by edit)
LIVE-BROWSER: not-applicable (qa/manifests/*.md prose only; no UI surface touched)
ISSUES-WRITTEN: ISS-351
EXECUTOR: claude-sonnet-subagent (manifest declares none) (checker: claude-sonnet-subagent)
EXPLANATION: The backfill is additive, D-015-compliant, and correctly derived on 14 of 15 spot-checked files including a good save against decoy quoted text in delivery-gate-manifest-blindness.md — but one wrong derivation (u2-fix1-ingest-guards.md) lands on exactly the kind of file where it matters (an open production-data repair), undermining the "purely mechanical, trustworthy" claim the unit rests on. A separate low-severity, self-referential quirk (the manifest's own file trips its own "exactly once" grep via a fenced example) is noted but not filed, per this repo's low-severity-to-EXPLANATION rule.
```
