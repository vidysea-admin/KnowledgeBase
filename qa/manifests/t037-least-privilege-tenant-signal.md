# t037-least-privilege-tenant-signal

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Priority tier: 2 — ISS-TENANTSIG-001 / ISS-WIREPRE-001, security class, uncapped.
Links: T-037; ISS-T037WIRE-001; ISS-TENANTSIG-001; ISS-TENANTSIG-002; ISS-WIREPRE-001
Authorization: implementation plan approved by Umesh; main orchestrator GO for five files on 2026-10-14.
Packet: `qa/packets/t037-least-privilege-tenant-signal.md`.

## Scope

Authenticate the scheduler's tenant under its already-required gmail scope, without depending on sessions scope or webinar operations state. GET /meeting-candidates emits X-LKB-Tenant from req.auth.tenantId after candidate listing succeeds. The key-tenant loader reads that endpoint; header validation, timeout, redirect refusal, body cancellation, and existing mismatch/unknown policies remain unchanged.

No enabling, key grants, shared scheduler edits, ledger-status changes, protected contracts/decisions, or live API/database effects. One extra verification GET remains per enforcing tick; eliminating that request is not claimed.

## Evidence

- `git diff --check -- apps/api/src/routes/meeting-candidates.ts apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts`: exit 0, no output.
- `node --test --test-concurrency=1 --import tsx apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts`: exit 1; tests 3, pass 0, fail 3; duration 25.5385ms. Every test-file process failed before loading source: `Error: spawn EPERM`, errno -4048, syscall spawn.
- Same command with require_escalated requested because of sandbox subprocess failure: approval call aborted by user after 468.3 seconds. No test result, PID, or running session was returned. No further retries issued.
- Historical cycle-0 HOLD: `qa/verdicts/t037-least-privilege-tenant-signal.md` recorded only static review while runtime was unavailable. Source candidate unchanged for resumption.

## Resumed runtime evidence, 2026-10-14

- Authorized cache-only, same-process TS runtime avoids child workers and esbuild without changing product dependencies or sandbox privileges. Exact command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts`. Exit 0; tests 28, pass 28, fail 0, cancelled 0, skipped 0, todo 0; duration 12351.9978 ms. Actual HTTP route and immediate downstream real dependency-builder/scheduler checks passed.
- Original ISS-T037WIRE-001 / ISS-WIREPRE-001 mismatch corpus: 2/2 policies as specified. Unverified header/403/500/network/invalid/uppercase corpus: 12/12 policy cases. Header/status table: 20/20. No original case left unmeasured.
- ISS-TENANTSIG-001 least-privilege HTTP: both tenant keys return own header (2/2), calendar-only/unknown keys refused with no tenant header (2/2), gmail+calendar key independently rejected by sessions-only endpoint (1/1). Forged query/header does not supply response identity.
- Existing recorded route regressions preserved: ISS-359 3/3 tests; ISS-333 3/3 recorded cases; ISS-CAPTURE-003 1/1 refused. Veto-only check passed 500 seeds times both policies.
- `python contracts/verify_contracts.py`: exit 0, elapsed 0.457 seconds, exact output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

## Checker close-out

Cycle-0 independent `qa/verdicts/t037-least-privilege-tenant-signal.md` records PASS, superseding historical HOLD. All five candidate hashes independently matched and maker rechecked them at close-out. Checker actual-HTTP/loader/scheduler probe exit 0: spoofed tenant probes 2/2, denied callers 3/3, least-privilege loader 1/1, matching opt-out 2/2 policies, exact mismatch reproduction 2/2 policies. Independent original header table 20/20 and unknown-policy corpus 12/12 passed. No issues written.

This closes the scoped source unit only. Live isolated tenant/key tick, deployed API route proof, policy/enablement and wider T-037 operational gates remain. No ledger status edit, enablement, deployment or whole-task completion claimed. One extra verification GET remains.
