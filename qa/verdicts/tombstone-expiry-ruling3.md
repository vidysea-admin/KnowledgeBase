# Verdict: tombstone-expiry-ruling3 (ISS-TOMBSTONE-001, ruling 3)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 20b000e36da22865e3e1708a16660a6fcfc34fd1
Base SHA: 9e55b642
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-tombstone (lane/w17-tombstone)
Checker: independent checker subagent, fresh context, 2026-10-17
ISSUES-WRITTEN: none

## Identity
- Lane HEAD = 20b000e3 (one commit over 9e55b642). Diff = calendar-client.ts (+10/-2), unknown-tombstone-reach.ts (+23/-8), unknown-tombstone-non-interference.test.ts (+64), manifest.
- Final blob hashes (hash-object = HEAD blob, after the mutations): calendar-client.ts 9762e184..., unknown-tombstone-reach.ts bdbcd0b3..., non-interference.test.ts 24e9abd7.... `git diff --quiet HEAD -- packages` clean.

## Clauses covered
Ruling 3 (wave2-rules.md); D-159 (MATCHED_HORIZON_MS 30 d); qa/contracts/calendar-unknown-tombstone.md clauses 1-5; D-015 ledger replay; D-020 mutation safety.

1. **Release is limited to the id-only tier.** The two release lines (unknown-tombstone-reach.ts:90-92) sit after the LINK (`:82`), HOST (`:83`) and START (`:85`) returns, so they are reached only by a tombstone with no start and no link or host match. Explicit rejections are sticky in mergeOccurrence (calendar-client.ts:148,177). Known cancellations go through the linked snapshot and never through the reach rule. Probe P1 shows that the START, LINK (no start) and HOST (no start, no title) tiers still hold at +31 d, at +61 d, and for mail received after the tombstone. The maker's test covers rejections and real cancellations.
2. **`firstSeen` is monotonic and cannot be forged forward.** It is set with `??=` (calendar-client.ts:242), and the merge spreads the prior row, so the field survives. P3 shows it is not moved by a refetch, including a refetch carrying a newer Google `updated`. validate (`:113-114`) rejects a future value (beyond 60 s skew), a malformed value, a non-canonical value, a number and null, as shown by P4.
3. **Fail-closed.** A missing `firstSeen` falls back to `now`, so the row stays held. An epoch `firstSeen` is treated as missing and also stays held (P5). An invalid `firstSeen` throws the whole tick, so nothing is scheduled. With no `now`, the row stays held (maker test).
4. **The "predates the mail" comparison** is `min(updated, firstSeen) < receivedAt`, and equal instants keep the hold. `firstSeen` is always at or after the real cancellation. Google's `updated` is the last-modification time, so a cancellation bumps it. The live evidence (qa/evidence/tombstone-live-shape-2026-10-12/summary.md) records `updated` = cancellation time on 15/15 rows. The min is therefore still an upper bound on the cancellation time. Where Google sends no `updated`, base stamps `providerUpdated = checkedAt` (calendar-client.ts:218). The NEAR window was already anchored on `updated` at base, so this change adds no new trust in `updated`. `receivedAt` is Gmail `internalDate`, capped at now (apps/api/src/gws/gws-gmail.ts:267), so a sender cannot set it. This matches ruling 3's wording. P6 checks the boundaries.
5. **Migration.** State written by the base code validates, because `firstSeen` is optional. Those rows are stamped at the migrating tick, held then, and released 31 d later (P5 and the maker test).
6. **D-015 replay.** The candidate's own verbatim corpus tests (independent run) give ISS-T036CAL-011 12/12, ISS-TOMBSTONE-002 16/16, ISS-TOMBSTONE-003 20/20 and ISS-TOMBSTONE-004/001 6/6. The ISS-TOMBSTONE-001 recorded case (c0, c1 linked to g1, g1, g5, g6 + ghost) still holds g5 and g6 on tick 0, as ruling 3 intends. My probe P2 replays ISS-TOMBSTONE-004's recorded 5-tick probe verbatim: g5 is held on ticks 0-4, and at +40 d, where base recorded `cand=0`, g5 is released while the tombstone stays listed.

## Commands (all from packages/meeting-bot, Node v24.19.0 from the codex runtime, `timeout 600 node --test --test-force-exit --import tsx`)
Evidence is in qa/verdicts/tombstone-expiry-ruling3.evidence/ (runs.txt and *.log). It is not committed.

| check | result |
|---|---|
| tombstone/unknown-tombstone-non-interference.test.ts | exit 0, 16/16 |
| tombstone/unknown-tombstone-matched-hold.test.ts | exit 0, 10/10 |
| tombstone/unknown-tombstone-property.test.ts | exit 0, 2/2 |
| state/schedule-state.test.ts (reads reconciliation state) | first run exit 1: 9 fails, all ERR_MODULE_NOT_FOUND (express, then mongodb), an environment gap. Re-run after junctioning the missing apps/api and packages/{ai,ask,core,db,index,ingest} node_modules to the main tree: **exit 0, 18/18** |
| state/schedule-state-safety.test.ts | exit 0, 10/10 |
| webinar-policy.test.ts (D-060 floor) | exit 0, 19/19 |
| `tsc --noEmit -p tsconfig.json` | exit 0 |
| contracts/verify_contracts.py | exit 0 (vacuous) |
| checker probe.test.ts (P1-P6) | exit 0, 6/6 |

## Mutations (D-020: per-mutation byte backup, EXIT/INT/TERM trap, timeout 600, HEAD-fidelity check)
- **M1, LINK tier released** (horizon release moved above `if (linkHit)`): **killed**. matched-hold 9/10 ("a stored tombstone with no clock and no start but a trusted link still holds its meeting") and probe P1 failed. HEAD-fidelity OK (bdbcd0b3).
- **M2, future `firstSeen` accepted** (the `> checkedAt+60000` clause removed): **survives the candidate's suites** (non-interference 16/16, matched-hold 10/10). Only checker probe P4 kills it. HEAD-fidelity OK (9762e184).
- Harness incident, recorded and not hidden: in attempts 1-2 of M1 an ERR trap restored the source early, at the first failing test. That direction is safe, and HEAD-fidelity was OK. Those logs are kept as `*.attempt1/2*`, marked invalid. The harness was fixed (ERR trap removed, mutant presence asserted after each test) and M1 was re-run.

## Findings (low, no blocker; EXPLANATION notes, not backlog)
- L1 (test gap, calendar-client.ts:113-114): no candidate test pins the rejection of a future `firstSeen`, because M2 survives. The only effect of a future `firstSeen` would be a later release, which is the safe direction. Fix: add the P4 assertions (a future, malformed or non-canonical `firstSeen` makes reconcile throw) to unknown-tombstone-non-interference.test.ts.
- L2 (rollback): base-code validate (`shape` without `firstSeen`) throws on state written by this candidate. A downgrade therefore refuses the persisted state, which fails closed: nothing is scheduled until the state is repaired. Record this in the rollback notes.
- L3 (residual accepted by the Approver): the predates release also frees a mail for the cancelled meeting itself if that mail was received after the cancellation, for example a platform reminder. Ruling 3 explicitly authorizes this. It sits in tension with contract clause 2 ("a meeting cancelled before the client ever stored its Calendar event, whose Gmail invite is still present, must not be scheduled ... for every tombstone shape ... (id only ...)"), because the original invite predates the cancellation and stays held, but later mails do not. Note this clause for /graduate.
- L4: the manifest does not state the candidate SHA, and the maker skipped the schedule-state tests. Both were verified here.

## Ledger
- **ISS-TOMBSTONE-001 may flip** to verified-fixed (cycle 0, 20b000e3) once the lane is merged.
- ISS-TOMBSTONE-002/003/004 are already verified-fixed, and their corpus still passes.
- ISS-T036CAL-011 was not assessed for a flip in this brief. Its recorded reproduction passes 12/12.

## Not verified
- No live Google tombstone was observed for a never-accepted outsider invite, which the evidence summary also lists as a limit.
- The `@lkb/*` imports in the lane resolve to the main tree's packages/core through the node_modules junction. This unit does not change core.
- The full combined suite was not run; that is the integration gate.

## Budget
Maker usage is unknown, so this ran as BOOTSTRAP_REVIEW and no ratio is verified. The startup alone breached the bootstrap limit of 180 s / 6,000 tokens. That breach is recorded, not waived. A finite escalation was recorded: 2,400 s / 200,000 tokens, under the authority of the dispatch brief (security class, full ceremony). Checker wall time was about 1,073 s. Actual runtime tokens are unknown; the debit is 150,000. Assess inputs and outputs: evidence/metrics-phase{1,2,3-finalization}.json and assess-phase{1,2,3}.out.

## Environment change (checker)
I created temporary node_modules junctions in the lane for apps/api and packages/{ai,ask,core,db,index,ingest}, pointing to the main tree, so that schedule-state.test.ts could run. Git ignores them, and I removed them with `cmd /c rmdir` after the verdict.
