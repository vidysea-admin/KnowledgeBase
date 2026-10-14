# Independent checker: t037-least-privilege-tenant-signal

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

## Current resumed verdict — 2026-10-14

This cycle-0 source-scope PASS supersedes the historical HOLD retained below. The manifest is now ready-for-check, cycle 0; all five candidate Git blob hashes match the Checked candidate hashes table below before and after independent execution. No product source/contract/ledger was edited by the checker.

Acceptance: the least-privilege gmail+calendar key obtains its authenticated tenant through `/meeting-candidates`; forged tenant query/header cannot select another tenant; refused callers receive no tenant signal and never reach candidate data; the actual HTTP key/candidate loaders feed the real scheduler and preserve matching/mismatching/unknown join-rule policy behavior. This removes the source dependency on sessions scope and webinar-operations state. One extra verification GET per enforcing tick remains.

Timing: resumed review/initial hash checkpoint 2026-10-14T09:28:46.4699518Z. Slot requested before that checkpoint, granted by runtime coordinator slot 2 before the independent command; exact dispatch/grant times unavailable. Commands ran after grant and before final hash checkpoint 09:30:02.6610733Z. Final draft/persist starts after that checkpoint; readback records confirmed completion. No privilege escalation requested; approved same-process TS hook avoids workers/esbuild subprocesses. Runtime slot released after both commands.

Persisted PASS readback confirmed at 2026-10-14T09:31:00.8463209Z; readback/hash bundle exit 0, 0.4730194 seconds; all five hashes unchanged. Measured resumed-review-to-confirmation span: 134.3763691 seconds. Exact dispatch-to-verdict and initial historical launch-to-verdict durations remain unknown rather than inferred.

Independent commands, root cwd:

1. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs tmp/security-checker-tenant-signal.mts`
   - Exit 0; elapsed 3.6847391 seconds; Node duration 3134.4576 ms; tests 1, pass 1, fail/cancelled/skipped/todo 0.
   - Exact final probe output: `Independent actual HTTP: authorized spoof probes 2/2, refused probes 3/3; ISS-TENANTSIG-001 matched opt-out 2/2 policies; ISS-WIREPRE-001 exact A/g1/configured B reproduction 2/2 policies.`
   - Actual API server over ephemeral loopback; real authenticated route, key-header loader, candidate loader and scheduler. Auth refusals include missing key, unknown key and calendar-only key. No refused request reached the candidate dependency. Temporary fixture state only; no real database/provider/task.
   - Probe SHA256: `3ba94840e7923a023b9de9c817015e065827faa3e4cd00cf87961a6a737c9ad5`.
2. `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --test-name-pattern='header table|unverified \(header missing' --import ./.cache/coordination/safe-test-runtime/register.mjs packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts`
   - Exit 0; elapsed 2.3429902 seconds; Node duration 1927.2489 ms; tests 2, pass 2, fail/cancelled/skipped/todo 0.
   - Original header/status table 20/20: only valid scalar tenant identity accepted; missing/empty/multiple/invalid/case/status/network/timeout/redirect refused; no secret/raw-header leakage. Original missing/403/500/network/invalid/uppercase corpus times both policies 12/12. Named tests independently passed in 44.7832 ms and 553.2379 ms.
3. Final readiness/hash/probe-hash checkpoint bundle: exit 0, 0.5609552 seconds; manifest ready-for-check cycle 0 and five product hashes unchanged.

Attributed maker evidence reused from the updated cycle-bound manifest/packet: full route/key-loader/hint suite exit 0, 28/28, 12351.9978 ms; sessions-only HTTP refusal 1/1; preserved ISS-359 3/3 tests, ISS-333 3/3 cases, ISS-CAPTURE-003 1/1; 500 seeds times both policies veto-only. Maker `python contracts/verify_contracts.py`: exit 0, 0.457 seconds, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. The validator is a required executed check, but provides no frozen behavioral coverage; independently checked runtime boundaries supply this unit's behavioral evidence.

Original issue counts: ISS-TENANTSIG-001 actual HTTP least-privilege loader succeeds 1/1; matched opt-out honored 2/2 policies; ISS-WIREPRE-001 / ISS-T037WIRE-001 verbatim A-rules/g1/configured-B/key-A mismatch 2/2 policies. Missing/invalid-header and all existing original unknown-policy cases independently replayed as above. No recorded issue case omitted. Fail-open intentionally preserves selection with a warning rather than stopping recording; that existing policy is unchanged.

Remaining whole-task gates: Approver policy/enablement decisions, live isolated tenant/key tick, deployed authenticated scope/route proof, state/operational reporting and other T-037 gates are not discharged. No key grant, enablement, live DB write, service activation or full T-037 completion is authorized by this PASS. Source issue closure may reference this verdict without claiming deployment acceptance. EXPLANATION: no independent acceptance violation found; no new issue filed. Historical timing/permission obstacles below remain historical evidence only.

## Historical HOLD — superseded by current resumed PASS

## Scope and remaining gates

Frozen main-tree packet `qa/packets/t037-least-privilege-tenant-signal.md`, maker manifest `qa/manifests/t037-least-privilege-tenant-signal.md` at `in-progress`, not ready-for-check. This verdict records source review and a missing execution prerequisite; it does not certify behavior, close any issue, or authorize enablement/deployment.

Required remaining evidence: authenticated HTTP route with a gmail+calendar-only key; direct tenant-header failure table; production-shaped scheduler mismatch/unknown policies; immediate downstream scheduler; `python contracts/verify_contracts.py`. The packet's Node command failed before loading every test file with spawn EPERM. Maker's subsequent elevated execution request was aborted by the user. No executing test session/PID or passing result exists. The checker did not repeat the known denied worker command or treat static assertions as executed reproductions.

## Phase timestamps and timing limits

- Checker dispatch/launch: exact timestamp unavailable in the inherited brief; first measured preparation timestamp is 2026-10-14T08:37:17.0162260Z. Preparation preceded that timestamp.
- Preparation included relevant ledger, auth, route and scheduler reads, then waiting for the frozen maker packet. Exact wait boundaries and launch-to-verdict duration are unavailable; do not present a 2–3 minute check claim.
- Candidate diff review: before packet; exact start unavailable. Frozen packet/hash review: 2026-10-14T08:50:02.2365032Z through 08:50:47.2925629Z.
- Approval request/resolution: checker requested none. Maker packet attributes its aborted approval wait as 468.3 seconds; this is reused evidence, not independently timed by the checker.
- Independent behavior commands: not started. Contracts-validator slot requested from orchestrator, not granted before this HOLD.
- Draft/persist started after 08:50:47.2925629Z; persisted verdict readback confirmed at 2026-10-14T08:52:00.6472000Z. Readback/hash bundle: exit 0, 0.5220001 seconds, all five hashes unchanged. Full launch-to-verdict elapsed remains unknown; earliest measured preparation-to-confirmation span is 14 minutes 43.631 seconds, including packet waits.

## Checked candidate hashes

All five Git blob hashes independently matched the frozen packet twice, including immediately before drafting:

| Path | Checked Git blob hash |
|---|---|
| apps/api/src/routes/meeting-candidates.ts | b12a0c8842251f54baf34af6178901ee316de2c3 |
| apps/api/src/routes/meeting-candidates.test.ts | 29454484fd11accda9c0a1e96e29b1aa03e61501 |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts | 86d2b11fd117ba5156567e83f91524150c7b01a7 |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts | 361857a03e6cc3084349922b83198d8d3b93e25b |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts | 6b682248eb68203d1140ce2e80cb4d2625753e29 |

Hash command: `git hash-object apps/api/src/routes/meeting-candidates.ts apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts`. First scoped review command bundle exited 0 in 0.7303658 seconds; final bundle exited 0 in 0.5909271 seconds. Outputs are the five hashes above, in that order.

Independent `git diff --check -- apps/api/src/routes/meeting-candidates.ts apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts` was in the final bundle: exit 0, no output. No candidate file was edited by the checker.

## Relevant clauses and independent review

Read `skills/checker/SKILL.md`; applicable AGENTS.md security class, original-corpus and definition-of-done rules; candidate scope/dependency map; `gmail-meeting-candidates-approval.md` criterion 6; `tenant-id-validity.md` clauses 1/2/4; `t037-join-rules-veto-select.md` W4 and Tenant verification outcomes.

Directly reviewed complete changed production logic and tests, `requireAuth`/`requireScope`, server auth/router mount, key-loader validation, scheduler acquisition and enforcement call boundary. Source review found no proven acceptance violation:

- The header is assigned from validated `req.auth.tenantId` after the existing gmail scope gate and successful candidate list. Request query/header does not supply its value. Authentication and scope refusals occur before this handler.
- The loader changes only endpoint and fixed diagnostic causes; same key/base URL, redirect refusal, 15-second timeout, non-2xx refusal, scalar store-valid tenant validation and body cancellation remain.
- No sessions-scope or webinar-operations-state read remains in this verification loader. One extra candidate GET per enforcing tick remains; removal of the extra request is not claimed.
- The scheduler still consumes loader identity before rules enforcement. Existing mismatch/unknown fail-closed and fail-open behavior remains; fail-open deliberately schedules unchanged selection with a warning. This unit does not strengthen that policy.
- Updated fixtures separate acquisition and verification responses, retaining the original mismatch and failure corpus. Test source assertions alone are not behavioral evidence.

## Original reproductions and independent probe

Read the exact rows from `qa/issues.tenantsig.jsonl`, `qa/issues.wirepre.jsonl`, and `qa/issues.t037wire.jsonl`.

- ISS-TENANTSIG-001: gmail+calendar key without sessions; matched opt-out under both policies. NOT MEASURED.
- ISS-WIREPRE-001 / ISS-T037WIRE-001: A's rules opt out g1; configured tenant B; key/API tenant A; both policies. NOT MEASURED (0 cases executed, not a 0/2 failure result).
- ISS-TENANTSIG-002: former operations-state coupling removed by source endpoint change; runtime candidate failure handling NOT MEASURED.
- Missing/invalid/multiple header, auth/scope refusal, network/timeout/redirect table: NOT MEASURED.

Prepared independent checker artifact `tmp/security-checker-tenant-signal.mts`, not executed. It uses the actual API HTTP DI server, two authenticated tenants with forged tenant query/header, missing/invalid/calendar-only key refusals, real HTTP candidate/key loaders and real scheduler, exact A/g1/configured-B reproduction under both policies, and temporary isolated state fixtures. It does not contact a real database/provider or install tasks. This artifact provides a concrete next check, not evidence of a result.

## Attributed maker evidence and explanation

Maker's packet/manifest attribute `node --test --test-concurrency=1 --import tsx apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts` to exit 1, three test-file startup failures, pass 0/fail 3, 25.5385 ms, spawn EPERM (-4048). Elevated retry aborted after 468.3 seconds. Neither was independently reproduced, deliberately, because that execution boundary is known and unresolved.

No new issue is filed: the demonstrated obstacle is missing test execution permission/evidence, not a proven product defect. Resume cycle-bound checking after an authorized runtime is available and recheck all five hashes. Existing Approver/operator/live-tick/enablement gates remain open. No whole-task completion claim is made.
