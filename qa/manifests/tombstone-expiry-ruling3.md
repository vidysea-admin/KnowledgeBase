# tombstone-expiry-ruling3

Status: checked-PASS
Fix cycle: 0
Base SHA: 9e55b642 (origin/codex/kb-build-wave-2026-10-16). Candidate SHA: recorded in the commit on lane/w17-tombstone (see the review packet).
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-tombstone, branch lane/w17-tombstone
Security class: yes (ISS-TOMBSTONE-001; ruling 3, Approver Umesh, chat 2026-10-17). FULL ceremony.

## Changed paths
- packages/meeting-bot/src/calendar/tombstone/unknown-tombstone-reach.ts
- packages/meeting-bot/src/calendar/calendar-client.ts (reconcileWebinarSources, validateReconciliationState only)
- packages/meeting-bot/src/calendar/tombstone/unknown-tombstone-non-interference.test.ts (5 tests added)
Not touched: auto-join.ts, join-rules/*, packages/core (the stored field is typed locally: Occurrence & {firstSeen?: string}), qa/contracts, TASKS.md, DECISIONS.md.

## Behaviour
1. Every unknown-tombstone row stores `firstSeen` (the first tick that saw it). It is stamped after the merge in reconcileWebinarSources, never moved by later ticks, and dropped if the row stops being a tombstone. validateReconciliationState accepts it (valid ISO time, not in the future).
2. The id-only (NEAR) hold is released (a) when `checkedAt - firstSeen > MATCHED_HORIZON_MS` (existing D-159 constant, 30 days; strictly greater, so day 30 still holds, day 31 releases) and (b) when the tombstone predates the Gmail row's `receivedAt` (age = the earlier of Google `updated` and firstSeen; equal instants hold).
3. A stored row with no firstSeen is treated as first seen at read time: reconcile stamps it `checkedAt` on the migrating tick (held then, released 30d later); reachesUnlinkedGmail itself defaults a missing firstSeen to `now`, and with no usable `now` keeps the hold (fail closed).
4. NOT released by this change: LINK / HOST / START matches (identity or start evidence of a real cancellation), explicit Gmail rejections (status "rejected" is sticky), known cancellations of calendar rows and their linked Gmail copies.
Note: the id-only NEAR window was already [T-24h, T+48h] (fix cycle 2), so the new horizon binds on rows whose start sits in that window while the tombstone ages (the hold is evaluated every tick against the persisted tombstone).

## Contract / decision clauses
D-159 (30 d retention, +-24 h window; MATCHED_HORIZON_MS reused, no new constant). D-060 floor assertion (webinar-policy "available-source coverage") still passes. No qa/contracts clause contradicted.

## Corpus (D-015, replayed verbatim by the existing tests in the same file)
ISS-T036CAL-011 12/12; ISS-TOMBSTONE-001 2/2 (the recorded c0,c1,g1,g5,g6 + ghost case, both scopes); -002 16/16; -003 20/20; -004/001 6/6. Left open by design: ISS-TOMBSTONE-005 (start-copy), -007, -009, -010 (not part of ruling 3).

## Checks a checker must run (from packages/meeting-bot, node on PATH from the codex runtime)
- node --test --import tsx src/calendar/tombstone/unknown-tombstone-non-interference.test.ts  (16/16)
- same for unknown-tombstone-matched-hold (10/10), unknown-tombstone-property (2/2), src/calendar/webinar-policy.test.ts (19/19)
- node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json (exit 0)
- not run: schedule-state / auto-join suites (auto-join.ts is another lane's file)

## Evidence
Tests above: all pass, real counts. Mutation proof (per-mutation byte backup, trap, cmp restore, 300 s timeout), horizon test file:
- horizon check removed -> 3 tests fail (killed)
- `>` to `>=` (boundary) -> 1 fails (29d/30d/31d test, killed)
- predates check removed -> 1 fails (killed)
- missing-firstSeen default `now` -> 0 (survived through reconcile because reconcile stamps first); a direct reach-rule test was added, rerun: 1 fails (killed)
- reconcile stamp removed -> 2 fail (killed)
- horizon halved -> 2 fail (killed)
All six restored and verified with cmp before the next run; the files then differ from HEAD only by the intended change.
