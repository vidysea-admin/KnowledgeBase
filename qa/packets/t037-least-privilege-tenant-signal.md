# Checker packet: t037-least-privilege-tenant-signal / cycle 0

Root: `C:\Users\product\Desktop\KnowledgeBase` (main tree, no commit made).
Base HEAD at candidate start: `4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd`.
Manifest: `qa/manifests/t037-least-privilege-tenant-signal.md`.
Verdict ownership: independent security checker only, `qa/verdicts/t037-least-privilege-tenant-signal.md`.

## Changed-file Git blob hashes

| Path | Base bytes | Frozen candidate bytes |
|---|---|---|
| apps/api/src/routes/meeting-candidates.ts | b80d6b48f86941328475012eb29735c10faefb99 | b12a0c8842251f54baf34af6178901ee316de2c3 |
| apps/api/src/routes/meeting-candidates.test.ts | 27edd6b94420d5d4523904ea4b00512f6cd9220d | 29454484fd11accda9c0a1e96e29b1aa03e61501 |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.ts | a5ac35dcb3185f541912201cc2cfbf2aa3020b9f | 86d2b11fd117ba5156567e83f91524150c7b01a7 |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts | 381b573d77c280c04917298a5caf6599a78a29ba | 361857a03e6cc3084349922b83198d8d3b93e25b |
| packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts | 6f8dc45092bc5faa6bbc91ed03ae28b53ac7c466 | 6b682248eb68203d1140ce2e80cb4d2625753e29 |

Manifest and packet are new files; no base existed. Recheck hashes before verdict because other authorized lanes share this main tree.

## Security boundary and complete change map

- Route: inside `router.get('/meeting-candidates', requireScope('gmail'), ...)`, await `deps.listCandidates(req.auth!.tenantId)`, then `res.setHeader('X-LKB-Tenant', req.auth!.tenantId)`, then existing 200 `{ candidates }`. Tenant remains authenticated-key-derived; input header/query cannot supply it. Auth and scope rejection execute before this handler, so denied requests cannot receive this signal.
- Loader: `KEY_TENANT_PATH` changes `/webinar-operations` to `/meeting-candidates`; 403 hint changes sessions to gmail; 503 hint refers to candidate discovery. All other request/validation logic unchanged. Same key/base URL, redirect error, 15-second timeout, non-2xx -> null, store validator for header, body cancelled, fixed logs.
- Route test: two keys with gmail+calendar and no sessions scope each receive their own header; hostile request header/query ignored; calendar-only and unknown key return 403/401 without signal; owner still gets 403 on sessions-only operations endpoint.
- Loader tests: existing status/header/production mismatch corpus uses candidates endpoint. Mock separates acquisition from verification so a verification-time error can be tested after successful acquisition. Tick still builds real dependencies and calls real loader. No production mocks changed.
- Hint tests: expected endpoint/scope diagnostics updated; redaction and non-2xx refusal retained.

Flags: auth YES (existing middleware scope retained); tenancy YES (key-authoritative rules attribution); cross-tenant access YES (tests forbid forged tenant signal); writes NO (GET signal and loader only); credentials YES (same Bearer key, no new destination/logging).

Immediate callers/consumers: `apps/api/src/server.ts` authenticates and mounts the router; `packages/meeting-bot/src/calendar/schedule-tick.ts` builds loader and calls it before `enforceJoinRules`; `calendar/join-rules/join-rules-enforce.ts` implements known-mismatch and unknown policy responses. Integrator owns the scheduler comment that still names the old endpoint; no runtime edits required there by this packet.

## Ground truth and original issue corpus

- `qa/contracts/gmail-meeting-candidates-approval.md` criterion 6: all candidate routes retain gmail scope and tenant scoping.
- `qa/contracts/t037-join-rules-veto-select.md` W4 and Tenant verification section: matching key/config tenant applies its rules; mismatch or unknown remains unevaluable under selected policy.
- `qa/contracts/tenant-id-validity.md` criteria 1/2/4: authenticated tenant only; invalid key tenant refused before route.
- ISS-TENANTSIG-001 in `qa/issues.tenantsig.jsonl`: exact least-privilege gmail+calendar/no sessions condition, now asserted through real HTTP route.
- ISS-TENANTSIG-002 same file: operations-state coupling removed from loader endpoint; candidate/API failures still unverified.
- ISS-WIREPRE-001 in `qa/issues.wirepre.jsonl`: production key-tenant input; original mismatch case preserved in key-tenant.test.ts.
- ISS-T037WIRE-001 in `qa/issues.t037wire.jsonl`: A rules opt out g1, configured B, API reports A; both policies explicitly tested. Fail-closed schedules nothing, fail-open retains baseline with loud warning and never applies B rules.
- Header table includes missing/empty/multiple/invalid/case/status/network/timeout/redirect refusal; unverified cases exercised under both existing policies. Existing policies are unchanged, not strengthened by this unit.

Corpus counts on resumed authorized same-process run: ISS-T037WIRE-001 / ISS-WIREPRE-001 mismatch 2/2 policies; unverified six-case corpus times both policies 12/12; header/status table 20/20. ISS-TENANTSIG-001 least-privilege HTTP own-tenant headers 2/2, denied keys without header 2/2, sessions-only control refusal 1/1. Existing route regressions: ISS-359 3/3 tests, ISS-333 3/3 recorded cases, ISS-CAPTURE-003 1/1 refused. New cases supplement rather than replace existing reproductions. No issue marked fixed/verified; independent verdict still required.

## Commands and execution prerequisite

Affected stage and immediate downstream together, root cwd, proved safe same-process command:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/routes/meeting-candidates.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant.test.ts packages/meeting-bot/src/calendar/join-rules-wiring/key-tenant-hints.test.ts`

Maker resumed evidence: exit 0; tests 28, pass 28, fail 0, cancelled 0, skipped 0, todo 0; duration_ms 12351.9978. Last assertion: veto-only 500 seeds times both enabling values, 7315.5045ms. Original HTTP route and scheduler assertions executed, not inferred. Source candidate hashes remain unchanged from historical HOLD.

Separate required validator, coordinated slot:
`python contracts/verify_contracts.py`

Maker validator: exit 0, 0.457s; exact output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`.

No external credentials or network API required; HTTP tests bind ephemeral loopback. Production-shaped fixtures scope environment and fake fetch. Safe runtime `.cache/coordination/safe-test-runtime/register.mjs` was prepared/proved independently by coordinator and authorized by root. It keeps execution in one Node process; no workers, subprocess esbuild, dependency change or privilege escalation. Do not rerun the historical worker command that was denied. Historical failed/aborted evidence retained in manifest. No browsers, media/model work, full test suite, mutation run or typecheck scheduled. Request your own coordinated light slot before independent checks.
