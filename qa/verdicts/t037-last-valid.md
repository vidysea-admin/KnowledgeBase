# Independent verdict — t037-last-valid

VERDICT: PASS
Cycle checked: 0
Scope: source-only snapshot storage, explicit last-valid enforcement and callback boundary; qa/contracts/t037-last-valid.md clauses 1–7. This is not T-037 completion or permission to enable production.
ISSUES-WRITTEN: none

## Scope and provenance

Manifest and packet are ready-for-check, cycle 0, base 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. Independently reviewed the complete new helper/tests, changed enforcement logic and immediate scheduler consumer. Included untracked helper/tests. Four candidate hashes matched before checking and again after the independent command. Scheduler/test hashes also match the separately attributed integration packet. No maker source was edited by this checker.

The new checker-owned contract is the narrow authorized amendment for this explicit mode; older veto-select W3/W4 and tenant-verification text still describes the legacy policies. Existing safeguards and whole-task gates remain. Preparatory review identified the missing-as-empty read race, stale concurrent cache refresh and missing evaluator degradation/recovery ordering; the maker corrected these before submitting the cycle-0 candidate. They are verified in the final source, not deferred findings.

## Independent behavioral evidence

Exact command, from repository root:

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs qa/evidence/t037-last-valid/checker-probe.mts`

PowerShell Start-Process, hidden window and redirected output, wrapped this command with WaitForExit(120000), killing the process tree on timeout. No timeout occurred. Receipt: qa/evidence/t037-last-valid/checker-receipt.json. Output: checker-stdout.txt and checker-stderr.txt in the same directory.

- Start 2026-10-14T09:14:51.0585862Z; end 09:14:52.2772619Z; wall 1.2186757 seconds; exit 0; TAP duration_ms 964.4487; tests 4/pass 4/fail 0/cancelled 0/skipped 0.
- Cache write failure emits degradation, does not clear recovery, does not alter authoritative policy bytes, and leaves no temporary/lock residue.
- Intervening new primary opt-out makes an older snapshot save refuse; prior complete cached bytes stay intact and the tenant lock is released.
- Persisted full opt-out state remains present at 3,599,999 ms; exact 3,600,000-ms expiry refuses; deleting the opt-out without renewing integrity refuses.
- Current-primary evaluator exception refuses the affected item, emits evaluation-failed and never clears the outage.

This is actual TypeScript transpilation using the inspected local registerHooks loader, not source-only assertion. It avoids the already demonstrated tsx/esbuild subprocess EPERM without changing runtime guards or product modules. No browser, real provider, API, database, scheduler task or notification was invoked.

## Attributed evidence reused

Maker cycle-0 packet supplies exact commands and final byte pins:

1. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid.test.ts packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts` — final 14/14 pass, exit 0, duration_ms 1560.2721, wall 1.98 s. Covers full cached approvals/opt-outs/deny, missing versus actual empty primary, exact expiry/future/integrity/envelope/file bounds, strict current tenant, read-only, callbacks, source subset and observed primary-change refusal. The helper uses descriptor-captured bytes and before/open/after regular-file identities, and shares the authoritative tenant lock while comparing current validated content.
2. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.test.ts packages/meeting-bot/src/calendar/join-rules/join-rules-enforce-preconditions.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts` — 38/38 pass, exit 0, duration_ms 22407.5088. This attributed earlier same-session run precedes only the final new-mode stale-primary guard; direct diff confirms the legacy branch is unchanged. It is not represented as an independent rerun against final bytes.
3. `node node_modules/typescript/bin/tsc --noEmit -p packages/meeting-bot/tsconfig.json` — final exit 0/no output, wall 6.40 s.
4. `python contracts/verify_contracts.py` — exit 0, wall 0.43 s, no frozen contracts/research phase PASS by vacuity. This does not establish pipeline or live acceptance.

Immediate consumer evidence is reused from qa/evidence/execution-wave1-integration-backend.receipt.json and stdout.txt, with source/test hashes independently checked against qa/packets/execution-wave1-integration.hashes.json:

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/schedule-tick-rules-integration.test.ts packages/meeting-bot/src/calendar/schedule-tick.test.ts apps/api/src/bot-events/router.test.ts apps/api/src/answer-policy/routes.test.ts`

Start 09:07:31.0160487Z/end 09:07:34.8793215Z, wall 3.8634567 s, exit 0, 27/27 pass, duration_ms 3707.8256. The four scoped scheduler integration cases exercise real last-valid fallback with the injected tick clock, dry-run no writes/callbacks, healthy after persistence and no healthy after failed save. The 14 existing tick cases verify downstream scheduling/persistence consumption. Other cases in that shared run are not claimed as rules acceptance.

## Checked final SHA256

- join-rules-enforce.ts: DE752442003B219C088E082978AD1561CCAA679A8324D8E4CCF28545634E8FD7
- join-rules-last-valid.ts: 980F31D77263DAC2F9397BCCB4161D54C6F0234D6453671E500EF099CC42463C
- join-rules-last-valid.test.ts: 93DADC65C7CC629D1F0F88173E13A41AD4611E3B0374CB191E1A45543DD020F6
- join-rules-last-valid-enforce.test.ts: 639B677DA24A7D1185B56349C23B735F8BB272A2BEBEDF22159694AD2981DF23
- schedule-tick.ts: 145952AAF6D84865933E2B1E98520EE77AE1C9BEB7ED5AC7478DE708DFBE5C4B
- autojoin/tick-wiring.ts: D8D00D63B4DFDCEB59183546F23921C20926615CA4B14266DC07F24A3D96D970
- schedule-tick-rules-integration.test.ts: 9C3B2EDA352673D31579435B60E860AAD0DD6B84E71D40340165940FD498FB43
- checker-probe.mts: BDBD13E5BD8B0013046703E9F540CD14551D23CD227B11F46D1B0574290EC209

## Phase timestamps and limits

Final cycle-0 check launched 2026-10-14 09:11:13 UTC (tool clock, second precision). Initial scope read/hash/source review began immediately; review and allocator wait overlapped. At 09:13:45 UTC the consumer receipt/source had been read; the four candidate and consumer pins were rechecked after the command, with review completion observed by the 09:15:47 UTC tool clock. Command timestamps are exact in the receipt. Allocator GO arrived before command start, but its precise arrival time is unmeasured. No approval request was made by this checker. Preliminary contract/review work before final-check launch is excluded from this final-cycle elapsed interval; its total duration is unknown.

At the 180-second target the checker reported that only the required independent probe and final verdict remained, and continued because the short decisive check was feasible. The shared resource slot was queued; no unmeasured interval is attributed to approval or drafting by subtraction. Persist/confirmation time and measured total from final launch are recorded in qa/evidence/t037-last-valid/checker-verdict-timing.json. Scoped read/status command durations were 0.330, 0.533, 0.639, 0.482, 0.359 and final 0.440 seconds; exact read invocations remain in the tool trace. Review/wait/test phases overlap and must not be summed as elapsed time.

## Remaining whole-task gates

EXPLANATION: PASS applies only to the checked source/callback unit. Enforcement defaults off; JOIN_RULES_ENFORCED remains false. This check does not certify real email/dashboard delivery, authenticated live key/tenant pairing, enabling or live recording. Integrator and alert-lane source proofs have separate verdicts. Recurring/id-only gaps and ISS-376 remain separate owner gates.

Recorded ISS-T037W1-001 id-only corpus remains 0/2 refused and explicitly open; this unit does not fix or omit it. Attributed URL-hint 2/2 and sessionKey-hint 2/2 refusals remain intact. ISS-T037WIRE-002 original eight variants remain off with warning in the attributed regression evidence. Tenancy mismatch/unknown must refuse for the new mode; legacy fail-open behavior is preserved, not represented as safe to enable.

Freshness is persisted wall-clock age, not monotonic elapsed time through arbitrary clock manipulation; partial backward clock changes can extend elapsed real lifetime. SHA256 detects accidental content changes and is not an authentication MAC; local filesystem permissions remain a prerequisite. Existing authoritative-store lock host/PID assumptions remain. No whole-task acceptance or deployment claim follows from this source PASS.
