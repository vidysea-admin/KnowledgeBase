# Checker verdict: w17-pivot (PIVOT D-179, contract C5 + tombstone clause 2 + U2.4 ruling)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 94f9850a03a4b51b7c60a61a21ba73f8b14f7a98
Base SHA: a0391420451b3a1f465d0862378cec3492f0133f
Checked at: 2026-10-17 (fix cycle 1, after the lane was reset to a0391420 and redone)
ISSUES-WRITTEN: none
Ledger rows may be flipped: no ledger rows are tied to this unit. The PIVOT may merge.

## Identity and diff (independently verified)
- Lane HEAD = 94f9850a; a0391420..94f9850a is one commit. Worktree clean before and after review.
- `git diff --numstat`: DECISIONS.md 17/0; calendar-unknown-tombstone.md 1/1; webinar-portable-release.md 1/1.
- No code changed: `git diff --quiet a0391420 94f9850a -- packages apps scripts` exits 0, so the code compared below is the a0391420 code.
- Line endings: 0 CR bytes at base and candidate in all three files (LF files, preserved). Contract line counts are unchanged (11/11, 31/31).
- sha256 prefixes at candidate: webinar-portable-release.md df3b6c75...; calendar-unknown-tombstone.md ba2d1ca3...; DECISIONS.md 6828201d...

## D-179 - PASS
- Additions-only: the first 369,522 bytes of the candidate file are byte-identical to the base file (`cmp` exit 0).
- D-179 directly follows D-178 (line 2362 vs 2340) and appears once. There is no `**Supersedes:**` line, so the resolver (lab-session-start.ps1:91) retires nothing, consistent with D-130. Approved-by: Umesh.
- Changes-authorized is exactly C5, clause 2, and the U2.4 ruling.
- Approval quotes "go for it too" and "jo best hai go for it" match the brief. The quoted Hindi proposal text was not verifiable by the checker.

## C5 vs code - PASS (cycle-0 finding 1 closed)
- The new text "skipped, never silently scheduled, unless a human approved it" matches auto-join.ts:110 (`preTrusted` on `status === "approved"`) and :230-233.
- It is pinned by sender-authentication.test.ts:104 (approved + failed or unknown authentication is scheduled).
- The other branches match: unknown authentication gives needs-review "needs approval"; authenticated is admitted; calendar-sourced is admitted; schedule-loaders.ts:42 and :86 agree.
- Low note, not a backlog item: "unknown, unauthenticated sender" remains readable as "not on the allowlist". The code routes any sender with unreported authentication to needs-review. D-179's own wording uses the same phrase as ruling 1.

## Clause 2 vs code - PASS (cycle-0 finding 2 closed)
- The migration sentence now matches the code. calendar-client.ts:242 stamps `??= checkedAt`, so reach.ts:90 cannot release at that tick, and reach.ts:91-92 rule (b) still applies.
- Independent probe re-run on legacy state (firstSeen deleted, migrated at day 40), both scopes:
  - With a mail received after `updated`: released (rule b).
  - With no receivedAt: held.
  - Probe exit 0; file w17p-c1-probe.out. The probe file was deleted afterwards.
- Unchanged and still matching:
  - The id-only tier only (reach.ts:82/83/85 return before :90).
  - Strict `>` 30 days.
  - `min(updated, firstSeen) < receivedAt`, with equal instants held.
  - An invalid or future firstSeen fails the tick closed (calendar-client.ts:113-114).

## U2.4 vs goal-U24 - PASS (cycle-0 finding 3 closed)
- The ruling is now limited to MODEL-derived names and leaves goal-U24 clause 3 (deterministic floor plus independent-pair auto-final) unchanged. That is consistent with clauses 3 and 4 and with speaker-segment-identity.md:62 (phase 4 = write unit). No goal-U24 edit is needed.
- Low note: "(LLM or tile suggestions)" also places T-042 tile names under suggestion-only. That is stricter than goal-U24 and does not contradict it.

## Mutation (own; per-mutation backup, trap on INT TERM ERR EXIT, timeout 600)
- unknown-tombstone-reach.ts:90 `>` changed to `>=`.
- Results: green 6/6 (exit 0); mutant 5/6 (exit 1, "scope=true day 30"); restored 6/6 (exit 0).
- `git hash-object` = HEAD blob = bdbcd0b3197edf54874141713ac9042767d2a63c.
- Temporary node_modules junctions were removed with `rmdir`; worktree clean.

## Mandatory commands
- `python -I contracts/verify_contracts.py`: exit 0, PASS by vacuity.
- `node scripts/tracker-audit.mjs`: exit 1 with G2 (155 fixed issues lacking verified_date) and G3 (stale qa/.last-sweep). The diff touches neither qa/issues*.jsonl nor qa/.last-sweep, so the result is identical without this unit. It is pre-existing repository state, recorded and not waived.

## Evidence (scratchpad, session f9384bb3...)
w17p-c1-probe.out, w17p-c1-green.out, w17p-c1-mut.out, w17p-c1-restored.out, w17p-c1-verify.out, w17p-c1-tracker.out

## Accounting
- Maker usage: unknown (null). This cycle's checker active time is about 200 s to the evidence phase. Host tokens are not exposed (null). Ratio unverified.
- review_budget.py assess was not run per phase. This process lapse is recorded and changes no verification result.

---

# Superseded history

The coordinator designates the review below as cycle 0. Its header was written as "Cycle checked: 1" against the pre-reset candidate 33684aaa. It was committed as 74588fe3, which is no longer on the branch after the lane reset. The text is restored verbatim:

## (cycle 0) Checker verdict: w17-pivot (PIVOT D-179, contract C5 + tombstone clause 2 + U2.4 ruling)

Historical VERDICT (superseded): FAIL
Historical cycle label: 1 (designated cycle 0)
Historical reviewed SHA: 33684aaa6287761680f10e2cbea49b80c22a4710
Base SHA: a0391420451b3a1f465d0862378cec3492f0133f
Checked at: 2026-10-17T18:11:00Z
ISSUES-WRITTEN: none (findings below are for this unit's next cycle; no ledger rows written)
Ledger rows may be flipped: NO.

## Identity and diff (independently verified)
- Lane HEAD = 33684aaa; a0391420..33684aaa is one commit. Worktree clean before and after review.
- `git diff --numstat`: docs/DECISIONS.md 17/0; qa/contracts/calendar-unknown-tombstone.md 1/1; qa/contracts/webinar-portable-release.md 1/1.
- Line endings: all three files have 0 CR bytes at both base and candidate (LF files; nothing to preserve, no conversion). Line counts unchanged for both contracts (11, 31).
- DECISIONS.md additions-only: the first 369,522 bytes of the candidate file are byte-identical to the base file (`cmp` exit 0).
- sha256 at candidate: webinar-portable-release.md 628036b9...; calendar-unknown-tombstone.md 2173caa2...; DECISIONS.md 2c8c4102...

## Check 1: DECISIONS D-179 - PASS on its own terms
- D-179 follows D-178 directly (exactly one `## D-179` header). Approved-by: Umesh. No `**Supersedes:**` line, so the resolver (`.claude/hooks/lab-session-start.ps1:91`, which parses only `^\*\*Supersedes:\*\*`) retires nothing. It uses `Amends:` text, consistent with D-130 semantics.
- Changes-authorized lists exactly: C5 only, tombstone clause 2 only, and the U2.4 ruling.
- The quotes "go for it too" and "jo best hai go for it" match the brief. NOT verified: the two quoted Hindi proposal sentences. Only the orchestrator saw that chat.
- Note (low): "completing the contract update D-178 deferred" covers C5 only. D-178 never deferred a clause-2 edit.

## Check 2: one line per contract - PASS
Each contract changes exactly one line. Every other line is identical (numstat 1/1, hunks show only that line).

## Check 3a: C5 vs ruling 1 and code at a0391420 - FAIL (proven mismatch)
- qa/contracts/webinar-portable-release.md:13 (new): "in everyWebinar mode a Gmail candidate whose sender authentication explicitly failed is skipped, never silently scheduled; ... authenticated, human-approved and calendar-sourced candidates are admitted".
- Code: packages/meeting-bot/src/calendar/auto-join.ts:110 sets `preTrusted` for `status === "approved"` regardless of `senderAuthenticated`. The ISS-376 gate at auto-join.ts:230 only applies when `!item.preTrusted`. So a human-approved candidate whose authentication explicitly FAILED is ADMITTED.
- This is pinned in sender-authentication.test.ts:104: `for (const senderAuthenticated of [undefined, false]) ... status: "approved" ... toSchedule.length, 1` ("a human approval is the promotion path").
- The new C5 text says that candidate "is skipped", unconditionally. It also lists it as admitted under "human-approved". The clause contradicts the code and contradicts itself.
- Fix (one line, same clause): "a Gmail candidate whose sender authentication explicitly failed is skipped (never silently scheduled) unless a human approved it; a candidate whose sender authentication is unknown goes to needs-approval and is scheduled once a human approves it; authenticated, human-approved and calendar-sourced candidates are admitted".
- Note (low): "unknown, unauthenticated sender" can be read as "not on the allowlist". The code (auto-join.ts:230-233) sends any sender with unreported authentication to needs-review, allowlisted senders included, because the allowlist is skipped in everyWebinar. The fix wording above removes that ambiguity.
- Matches confirmed: failed authentication with pending status gives untrusted-sender; unknown authentication gives needs-review "needs approval"; authenticated is admitted; calendar-sourced is admitted (no `candidate`); auto_approved needs authentication (ISS-333); schedule-loaders.ts:42 keeps unknown distinct from false; schedule-loaders.ts:86 feeds pending rows only in everyWebinar.

## Check 3b: clause 2 vs ruling 3 and code - FAIL (one proven mismatch); other sub-claims match
Matches, verified against unknown-tombstone-reach.ts and calendar-client.ts:
- Id-only tier only. LINK returns at reach.ts:82, HOST at :83, START at :85, all before the release code at :90-92. The contract's definition "no start and no LINK or HOST match" equals the code path.
- Strict > 30 days: reach.ts:90 `reach.now - t.firstSeen > MATCHED_HORIZON_MS`. My own mutation to `>=` fails the "day 30" assertion (see Mutation).
- `min(updated, firstSeen) < receivedAt`, equal instants held: reach.ts:91-92 uses strict `<`, pinned by the "same instant is not proof: held" test.
- Invalid firstSeen fails closed: calendar-client.ts:113-114 `fail()` on a non-canonical value or one more than 60 s in the future, pinned by test :274-288.
- Missing firstSeen is stamped: calendar-client.ts:242 `row.firstSeen ??= input.checkedAt`.

Mismatch: qa/contracts/calendar-unknown-tombstone.md:6 says "A missing firstSeen is stamped at the migrating tick and the row stays held". In code the stamp only stops rule (a). Rule (b) still uses `min(updated, firstSeen)` (reach.ts:91), and a real tombstone's `updated` predates the migration. So a legacy row is RELEASED at the migrating tick whenever the Gmail row's receivedAt is later than `updated`.
- Independent probe: legacy state with firstSeen deleted, migrated at day 40, mail(5) received at CHECKED+1h. Result `released_at_migrating_tick=true` in both scopes (exit 0). Evidence: scratchpad w17p-probe.out. The probe file was deleted afterwards.
- The existing migration test (:195) uses mail(5) with no receivedAt, so it never exercises this case.
- Fix: "A missing firstSeen is stamped at the migrating tick, so rule (a) cannot release it at that tick; rule (b) still applies."

## Check 4: U2.4 ruling vs qa/contracts/goal-U24.md - tension, needs scoping or a contract edit
- Consistent: "no phase-4 write until a precision re-gate PASSes" agrees with goal-U24 clause 4 (precision gate for automatic finalization) and with qa/gates/speaker-segment-identity.md:62 (phase 4 = the approved write unit). "Suggestion-only with human confirmation" agrees with clause 3 for single-evidence model proposals.
- Conflict: D-179 says "Every name needs human confirmation". goal-U24 clause 3 says "Auto-final remains deterministic floor plus independent-pair", and clause 4 measures "auto-final identities". Taken literally, the ruling abolishes the auto-final path that clause 3 keeps, including the deterministic-floor names already written live (TASKS.md U2.4).
- Fix: either scope the ruling to model-derived names in the next cycle's entry ("every model-derived name needs human confirmation; the deterministic floor and independent-pair auto-final stay as goal-U24 clause 3"), or add goal-U24 clause 3 to Changes-authorized and edit it through PIVOT.

## Check 5: mandatory commands
- `python -I contracts/verify_contracts.py`: exit 0, "no frozen contracts yet -- PASS by vacuity".
- `node scripts/tracker-audit.mjs`: exit 1. The findings are G2 (155 fixed issues without verified_date) and G3 (qa/.last-sweep stale). Both read only qa/issues*.jsonl and qa/.last-sweep, which this diff does not touch, so they predate the unit. Not attributable to this unit; still red.

## Mutation (own, D-020 plus the 2026-09-28 amendment)
- Target: unknown-tombstone-reach.ts:90 `>` changed to `>=`.
- Byte backup taken immediately before this single mutation. trap on INT TERM ERR EXIT restored that same per-mutation backup. Run wrapped in `timeout 600`.
- Green baseline: 6/6 pass, exit 0. Mutant: 5/6, exit 1, "scope=true day 30". Restored: 6/6, exit 0.
- HEAD fidelity: `git hash-object` = `git rev-parse HEAD:<file>` = bdbcd0b3197edf54874141713ac9042767d2a63c.
- Tests ran via temporary node_modules junctions into the main tree. Both were removed with `cmd /c rmdir`, and the worktree was clean afterwards.

## Evidence (scratchpad, session f9384bb3...): w17p-probe.out, w17p-green.out, w17p-mut.out, w17p-restored.out, w17p-verify.out, w17p-tracker.out

## Accounting
- Maker usage: unknown (null). Checker: about 531 s wall time to verdict; tokens are not exposed by the host (null). Ratio unverified.
- The BOOTSTRAP_REVIEW default (180 s / 6,000 tokens) was exceeded. That overrun is recorded, not waived.
- review_budget.py assess was not run per phase. This is a recorded process lapse; it changes no verification result.

## What the next cycle must do
Re-run the PIVOT with corrected one-line texts for C5 (approved+failed-auth case) and clause 2 (migration sentence). Scope the U2.4 ruling, or authorize a goal-U24 clause 3 edit. Since DECISIONS is append-only, either replace the unmerged lane commit or append a corrective entry.
