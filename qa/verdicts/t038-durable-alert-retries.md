# Verdict — t038-durable-alert-retries

VERDICT: PASS
Cycle checked: 1
ISSUES-WRITTEN: none

Scoped acceptance: `qa/contracts/t038-durable-alert-retries.md` C1–C8, alert source and additive feed kind only. This certifies durable bounded lifecycle channel retries and the authorized once-per-outage rules safety sink. Producer callback on an empty scheduler tick, API/public-client/web visibility, real email receipt/Calendar readback, unattended recovery, seven-day observation, Ubuntu and whole T-038/T-051 remain separate unverified gates.

## Evidence and independent review

Reviewed the complete changed `alerts.ts`, additive `bot-events.ts` enum, full new source tests, original ISS-AUTOJOIN-001 ledger and standing reproduction, capture-watch boundary, existing flush caller, and unchanged GWS transport. The sink consumes its configured tenant; persisted rows require an exact tenant match. Replay projects bounded accepted fields, strips URLs/control characters, ignores stored recipients/provider commands, rejects malformed/future/expired rows, retains original age, and limits queue/drain to 50/10. Successful channels retain their dedupe keys, while failed transports share the existing three-attempt ceiling across direct delivery and replay. Calendar chronology suppresses stale replay behind a newer terminal marker. Private/transparent/no-attendees/sendUpdates-none/stored-id-only transport behavior remains intact.

Five independently authored public-boundary probes passed: a disappeared lifecycle transition recovers after reconstructed dependencies without repeating successful channels; three attempts across six drain ticks; calendar-only recovery with email disabled; cap/gap deferrals drain without re-raising the original event; and safety email bypasses the exhausted ordinary cap once, survives a 15-day ongoing outage, re-arms after healthy reset and refuses a foreign tenant. Probe file: `qa/evidence/t038-durable-alert-retries-checker.test.ts`. Its SHA-256 is `9693F6BA202B63D32C3E0A9CFA713F86D7D5903EC0B6F5A6ACA28F0329DD70F3`.

Independent exact command, root cwd:

```text
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs qa/evidence/t038-durable-alert-retries-checker.test.ts packages/meeting-bot/src/autojoin/alert-retries.test.ts packages/meeting-bot/src/autojoin/alerts.test.ts
```

Exit 0; tests 29, pass 29, fail/cancelled/skipped/todo 0. Process runtime 3.5324337 seconds; suite duration 3396.1094 ms. Exact test output: `qa/evidence/t038-durable-alert-retries-checker.log`. No GWS binary, real message, browser, provider, DB or mutation was executed. In-process TypeScript registration avoids the demonstrated sandbox subprocess limitation; only lightweight local fixtures ran in the resource coordinator's granted slot.

ISS-AUTOJOIN-001: **1/1 recorded scenario replayed verbatim**, twelve about-to-join then twelve distinct-session capture-failed events. Assertions passed: nine emails immediately, ten after the digest, all twelve failure dashboard rows and twenty-four calendar markers. No recorded cases omitted. The lifecycle ceiling remains six ordinary + three individual failures + one digest per rolling hour. The root-authorized rules safety email is a separate additional allowance once per outage; it is not counted as an ordinary lifecycle email.

Attributed maker cycle-1 evidence reused from the matching manifest: final source suite 38/38, including 14 immediate scheduling/watch consumer cases, exit 0, process runtime 3.9805984 seconds; exact command includes the same safe runner with `alert-retries.test.ts`, `alerts.test.ts`, and `tick-and-watch.test.ts`. Validator `python contracts/verify_contracts.py` exit 0, runtime 0.4612513 seconds, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. This vacuous validator does not certify behavior. Independent scoped `git diff --check -- packages/meeting-bot/src/autojoin/alerts.ts packages/meeting-bot/src/autojoin/bot-events.ts` exited 0 with no output; included in a 0.5743188-second scoped read/hash command, its individual duration is unknown.

## Checked bytes and timing

Base: `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`. Manifest Fix cycle and both ready-for-check fields independently confirmed. These final SHA-256 hashes matched the cycle-1 packet before execution and again at 09:31:23 UTC after execution:

| Path | SHA-256 |
|---|---|
| packages/meeting-bot/src/autojoin/alerts.ts | A9847BA5017E46C9A0785070E70A1715813958DE8AEE792D9D363EAA0DBF2A2A |
| packages/meeting-bot/src/autojoin/bot-events.ts | 11165942976EC2643F3720E891BDC74AE491CB75A364B682404C4CAFBEE5CD60 |
| packages/meeting-bot/src/autojoin/alert-retries.test.ts | DEF9C0A6629D3C2AE02003E7D88F7063111BC83561ECEADC94C7A20614FFABAB |

Actual checkpoints: initial preparation clock 08:36:41 UTC (dispatch timestamp unknown); formal supplied-packet check launched 09:01:15 UTC; cycle-1 remaining source review checkpoint 09:27:52 UTC; cycle-1 ready/hash review 09:29:48 UTC; execution slot granted before the measured 09:30:42 UTC command checkpoint; process start 09:30:43.7782483 UTC, completion 09:30:47.4719440 UTC; final hash recheck 09:31:23 UTC; verdict drafting/persistence began after that recheck. Confirmed persistence completion and formal launch-to-verdict elapsed are recorded below. Individual review start/end and dispatch/approval intervals were not separately clocked; they are unknown, not inferred by subtraction. No escalation/approval request was needed for these commands.

Initial verdict persistence was confirmed by the successful write and subsequent clock at **09:32:20 UTC**: formal packet-check launch-to-verdict **31 minutes 5 seconds**. Preparation-to-verdict from the first recorded preparation clock was **55 minutes 39 seconds**, excluding an unknown earlier dispatch interval. This timing annotation is appended after that measured completion; no shorter overall result is claimed.

EXPLANATION: The 120–180-second target was exceeded while awaiting exclusive lightweight test slots and a cycle-1 maker resubmission correcting ongoing-outage retention and final producer reason codes. No tests ran against building or superseded bytes. Only the requested source seam was checked; source review and attributed downstream evidence did not widen into live integration or broad suites. Existing low/file-don't-fix observations were not promoted or changed. Maker may close this manifest only against these matching cycle-1 hashes.
