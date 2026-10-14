# T-038 durable lifecycle retries and rules safety outage alerts

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 1
Priority tier: 3 — roadmap T-038/T-051 operational reliability, explicitly assigned by Umesh's implementation plan and root coordinator.
Base commit: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd
Root: C:\Users\product\Desktop\KnowledgeBase (shared main; exclusive changed paths below).

## Authorized source scope

- `packages/meeting-bot/src/autojoin/alerts.ts`: additive version-1 tenant-bound retry queue; 50 rows, 14-day original-age lifetime, ten replays per flush; existing channel dedupe/rate caps/three-attempt ceiling. Calendar replay cannot overwrite a newer marker transition.
- `packages/meeting-bot/src/autojoin/bot-events.ts`: additive `rules-degraded` event kind only.
- `packages/meeting-bot/src/autojoin/alert-retries.test.ts`: new fake-GWS, real temp-file acceptance scenarios; no tracked base existed.

Safety extension explicitly authorized by root after policy reconciliation: dedicated first email per tenant outage bypasses the ordinary cap, durable dashboard immediately, retry failed delivery, no repeated successful safety email across reason transitions, healthy reset re-arms later outages. Other lifecycle emails retain 6+3+1. Existing low/file-don't-fix ISS-AUTOJOIN-004 is not pulled or changed.

Cycle 1 finalizes the producer's six fixed reason codes (`primary-unavailable`, `no-valid-snapshot`, `primary-identity-invalid`, `snapshot-write-failed`, `evaluation-failed`, `primary-changed`), keeps active-outage dedupe across normal 14-day expiry, and bounds outage transition keys to reason + snapshot/no-snapshot mode. Changing timestamps alone cannot create repeated safety notifications. Healthy reset removes pending old-outage work and re-arms a later outage. Cycle 0's 37/37 evidence is historical only; current evidence follows.

Ground truth: `qa/contracts/t038-durable-alert-retries.md`, clauses 1–8 (checker-owned; maker never edited).
Security flags: tenancy=true (validated configured tenant and per-row binding); writes=true (alert state/feed); credentials=false (no credentials read or recorded); outward channels=true (existing GWS seam only); auth=false (sink consumes trusted configuration, no new HTTP endpoint).

## Interface and consumer map

- Existing `raiseAlert(AlertDeps, AlertInput)` and `flushFailureDigest(AlertDeps): Promise<boolean>` signatures preserved. Boolean remains digest-delivered only.
- New `RulesDegradedInput`: tenantId?:string, reason:string, usingSnapshot:boolean, snapshotValidatedAt?:number, snapshotExpiresAt?:number.
- New `raiseRulesDegraded(AlertDeps, RulesDegradedInput): Promise<AlertResult>` and `clearRulesDegraded(AlertDeps): void` consumed by integrator-owned tick-wiring callback glue.
- `deliverAlert` performs independent channel delivery, persists sanitized retry input, and preserves completed channel keys. `loadState` validates tenant, original age and accepted fields; `rememberRetry` bounds growth and prioritizes safety.
- `rulesOutage.id` persists a UUID across restarts; only matching active outage keys get the dedicated allowance. `clearRulesDegraded` removes outage/pending safety replay without sending anything.
- Immediate downstream: `packages/meeting-bot/src/autojoin/tick-wiring.ts` invokes flush after capture-watch. New integration callback producer is `packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts`; integrator owns those changes and their complete acceptance.
- Feed reader accepts the additive kind. API projection and BotActivity labeling are integrator-owned additions, excluded from this source packet's hashes.
- Existing transport `gws-channels.ts` remains private/transparent calendar, sendUpdates none, no attendees, configured recipient only. It is unchanged and fake-injected for every check.

## Evidence / execution facts

Focused maker run completed in the resource coordinator's lightweight slot. Normal tsx/esbuild subprocess launch has a demonstrated sandbox EPERM in this environment. The resource coordinator supplied an in-process TypeScript runner; no dependency or production change was needed. Do not repeat the known blocked invocation.

Executed exact command, root cwd:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/autojoin/alert-retries.test.ts packages/meeting-bot/src/autojoin/alerts.test.ts packages/meeting-bot/src/autojoin/tick-and-watch.test.ts`

Result, cycle 1: exit 0, process wall time 3.9805984 seconds; tests 38, pass 38, fail/cancelled/skipped/todo 0; suite duration 3478.4636 ms. Breakdown: new retry/safety 12/12, existing alert 12/12, immediate scheduling/watch consumer 14/14. Output included each named passing test and the exact counts above. New long-outage case: `an ongoing outage stays deduplicated after the ordinary 14-day retention period` passed; reason tests preserve evaluation-failed and primary-changed.

Standing original issue floor: `qa/issues.autojoin.jsonl`, ISS-AUTOJOIN-001: 1/1 recorded scenario replayed verbatim, original 12 about-to-join then 12 distinct failures. Existing `alerts.test.ts` case passed assertions immediate 9 emails, post-digest 10, all 12 failures on dashboard and 24 calendar markers. No ledger row status changes.

`python contracts/verify_contracts.py` → exit 0, 0.4612513 seconds, exact output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This validator contains no frozen stage criteria and does not independently certify the new behavior.

`git diff --check -- packages/meeting-bot/src/autojoin/alerts.ts packages/meeting-bot/src/autojoin/bot-events.ts` → exit 0, no output.

Final SHA-256 identities (source frozen for independent check):

| Path | SHA-256 |
|---|---|
| packages/meeting-bot/src/autojoin/alerts.ts | A9847BA5017E46C9A0785070E70A1715813958DE8AEE792D9D363EAA0DBF2A2A |
| packages/meeting-bot/src/autojoin/bot-events.ts | 11165942976EC2643F3720E891BDC74AE491CB75A364B682404C4CAFBEE5CD60 |
| packages/meeting-bot/src/autojoin/alert-retries.test.ts | DEF9C0A6629D3C2AE02003E7D88F7063111BC83561ECEADC94C7A20614FFABAB |

Tracked base is the commit above; alerts.ts base SHA-256 B049569025FCA7DD16E620C3F9C07CEAC86D33D2CF73DF86717BD88FB413B770. The new test had no base. Diff plus complete changed source and this inline packet are authoritative; unrelated concurrently edited paths are excluded.

Known tests used only in-memory GWS and local temporary files, no browser/provider/real message/database. No mutation tests requested or performed; checker-owned mutation work must use timeout/byte restoration.

## Acceptance limits

No claim of actual email receipt, live Calendar readback, unattended installation/recovery, seven-day observation, Ubuntu release, whole T-038/T-051 closure, scheduler producer callback on empty tick, or API/UI live rendering. Those are distinct integration/live gates.

## Independent close-out

`qa/verdicts/t038-durable-alert-retries.md`: PASS, Cycle checked 1, ISSUES-WRITTEN none. Independent public-boundary probes plus current source/original tests passed 29/29, exit 0, process 3.5324337 seconds. Original ISS-AUTOJOIN-001 recorded scenario independently replayed 1/1 with 9 immediate / 10 post-digest emails, 12 failure feed rows, 24 calendar markers. Checker reused the matching 14 downstream maker cases and validator evidence, and explicitly retained the live/integration limits above. Maker rechecked all three hashes after verdict; unchanged and matching cycle 1. Only this bounded source unit closes; roadmap tasks remain open.
