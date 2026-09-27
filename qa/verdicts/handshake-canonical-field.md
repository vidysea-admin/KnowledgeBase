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
