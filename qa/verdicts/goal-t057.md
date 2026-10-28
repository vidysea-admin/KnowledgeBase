# Verdict: goal-t057 (operations workspace, source health, Explorer URL replay, notifications four-source, durable digest/Sheets schedule)

VERDICT: HOLD
Cycle checked: 0
Reviewed SHA: 6c27d4180346f4abca59961eca13e5676da71d53
Base SHA: a9fac545d0da015668d7dba455031b3a0fe52078
Checker: independent, fresh context (Sonnet 5.5). Date 2026-10-16.

## Summary
No product defect found. HOLD solely because required gates that no agent can supply remain open: C8 (independent live browser UI gate) and the live parts of C18 (disposable Mongo migration/runtime, native supervisor invocation and forced-exit path, real Gmail/Sheets account and delivery). Agent-verifiable criteria C1-C7 (browser parts of C7 are owned by C8) and C9-C17 are PASS at focused/hermetic scope. T-057 as a whole, the all-forty goal and the D-024 UI gate remain NOT closed. Ledger rows must NOT be flipped to done.

## Identity and diff (verified by me)
- `git diff a9fac545 6c27d418` = OperationsIntegration.test.tsx (one-line 30000 ms timeout on the first test) + qa/manifests/goal-t057.md. No product bytes changed; the 39 leased files are the committed a9fac545 bytes. Lane HEAD = 6c27d418; `git diff --ignore-cr-at-eol` is empty (the lane `git status` " M" lines are autocrlf stat noise; blob hashes equal HEAD).
- Pin drift re-derived: 9 packet pins differ from committed bytes (the maker's 8 plus the superseded OperationsIntegration.test.tsx pin, which the manifest discloses): OperationsPage.tsx, App.tsx, production.ts, composition/integrations/routes.ts, composition/integrations/hosting.ts, schema/index.json, and the two central typecheck receipts, plus the edited test.
- OperationsPage.tsx drift: pinned C44C24B4 = blob at 5c4cbade; committed B413ADEB = blob at a9fac545. The diff is exactly two added lines: the `EvaluationFlywheelPanel` import and `<EvaluationFlywheelPanel apiKey={apiKey} />`. The panel belongs to a different task, does not fetch on mount (its own test asserts load/open are not called until a user action), is keyed by apiKey, and its tests pass inside the operations directory run. It does not alter C1-C7 behaviour. Accepted as additive and non-material; the packet pin is stale and root should repin it to B413ADEB.
- Other central drift (App.tsx +2, production.ts +53/-58, routes.ts +17/-2, hosting.ts +2/-2, schema/index.json +16) is other-task evolution since 5c4cbade. The operations mount (routes.ts, hosting.ts, production.ts:290 real collectNotifications incl. fileQueue) is present and exercised by serverIntegration.test.ts. Root should repin these centrally.

## Independent source review (sampled, risk-ordered)
- Notifications (cross-tenant): `GET /notifications` takes tenant from `req.auth.tenantId` only, `requireScope("jobs")`, query/body refused, fixed-template titles, allow-listed file-queue error labels, validated ids. The digest path `notificationWindow` counts only (no ids/titles/details) and rejects malformed, duplicate or non-error rows. production.ts binds the tenant argument. No cross-tenant path found.
- Operations router: tenant/key/scopes exclusively from `req.auth`; every route behind `hosting.withPermission` (operations:read/manage/run) and the `operations` scope check at hosting/policy.ts:17; unknown query/body fields refused (strict key set, literal confirm strings); run/reconcile re-check permission at mutate and at executor initialize without holding the journal lock during external IO; no-store headers; sanitized errors.
- Service/store: CAS on revision + lease token, claim then second fingerprint-bound claim before outbound, ambiguous failure or expired lease -> uncertain+disabled, reconcile read-only and bound to the persisted attempt, append-only audit with 9995/9996 capacity reserves, strict validateSchedule (tenant/natural-id/foreign data refused), production write gate `() => false`.
- Adapters (credentials): passive and default unavailable; exact tenant/approval-ref/recipient/Sheet ID from env only; execFile no shell, absolute .exe on win32, 15 s, 2 MiB; Sheets fixed https origin, `redirect:"error"`, 2 MiB bounded read, RAW values, fixed dedicated range A1:E502 with padding and exact readback; token never in URL, response or audit; fixed error strings; Sheet ID/recipient bound into the run fingerprint. No credential leakage found. No real account touched.
- Supervisor/host/tick: passive import; requires LKB_OPERATIONS_WORKER_ENABLED=1; verifies the configured service key each cycle and derives identity from it; uses the existing runAutonomousCycles; fixed log strings. The documented caveat stands: SIGINT/SIGTERM force-exit after 10 s can precede the 60 s outbound deadline; recovery is lease expiry -> uncertain -> receipt-only reconcile (no resend). Not executed natively here.
- Observation (low, no action): a crash after the first run-claim but before the prepared claim means no outbound occurred, yet lease expiry marks it uncertain and reconcile can never verify it. The schedule stays safely disabled (conservative, never resends).

## Commands run by me (exit codes captured to files)
Node from C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin, lane node_modules junctions, timeouts <= 600 s, no browser/Mongo/network.
1. apps/api: `node --test --test-force-exit --test-concurrency=1 --import tsx` over service, store, adapters, router, producer-compat, serverIntegration tests: exit 0, 21/21 pass (70.9 s). Includes "effect followed by terminal CAS failure survives restart as audited uncertainty without redelivery", the exact-9997 refusal, last-permitted run then reconcile, and one side effect under concurrent claims.
2. root: tick.test.ts + host.test.ts via the apps/api tsx loader: exit 0, 6/6 (18.0 s).
3. apps/web vitest (maxWorkers=1): src/pages/operations, operations-integrations, notifications/producerCompat.test.tsx, App.routes.test.tsx: exit 0, 9 files / 74 tests. The first OperationsIntegration test that timed out at 5 s for the maker passed (5.25 s under load; the 30 s timeout is the fix). Second run src/pages/explorer + src/pages/notifications: exit 0, 6 files / 41 tests. 0 failures in 115 tests.
4. tsc --noEmit: apps/web exit 0, apps/api exit 0 (empty output).
5. vite build with outDir in the scratchpad (not the lane): exit 0 (chunk-size warning only).
6. `python contracts/verify_contracts.py`: exit 0, "no frozen contracts yet -- PASS by vacuity" (vacuous, disclosed).
7. Mutations in apps/api/src/operations-integrations/router.ts (per-mutation byte backup, `timeout 300`, trap on EXIT/INT/TERM/ERR; scripts kept inside the lane):
   - M1 PUT permission `operations:manage` -> `operations:read`: applied; router.test.ts FAILED at the viewer-PUT assertion (actual 200, expected 403) in "real verified auth/roles distinguish viewer reads, admin mutation and foreign tenant config". Killed.
   - M2 `service.list(p.tenantId)` -> `service.list("A")`: applied; the same test FAILED at the foreign-tenant revision assertion (actual 1, expected 0). Killed (cross-tenant read).
   - Procedural note (disclosed): my first script attempt used a relative backup path after a `cd`, so its trap restore failed and the file stayed mutated for about a minute; the M2 run stacked on M1 and was discarded. I restored from the HEAD blob, reran both mutations cleanly with an absolute backup path, and confirmed `git hash-object router.ts` = `git rev-parse HEAD:router.ts` = a2a869518f331646803f2e35584dc479e86d125d after each. Candidate bytes are unmodified.

## Criteria
- C1 mounted navigation: PASS (App/Nav integration test, App.routes 3/3).
- C2 honest session views: PASS (operationsModel and OperationsPage tests).
- C3 independent panels / no N+1: PASS (OperationsPage useEffect reviewed: three bounded GETs, per-panel state, cancelled flag).
- C4 deep links / Explorer replay: PASS (ExplorerUrl and explorer tests green).
- C5 saved views: PASS.
- C6 auth generation / tenant: PASS at jsdom/hermetic scope (apiKey-keyed snapshots, cancelled owner). Real browser behaviour is C8.
- C7 focused evidence: PASS (focused tests, tsc, bundle, verifier vacuous and disclosed). Pins: drift enumerated and resolved above; root must repin.
- C8 independent live UI gate: HOLD. Not performed; no browser authorised.
- C9 handshake/pins: PASS with disclosed drift; candidate bytes and cycle verified before and after (HEAD 6c27d418 unchanged).
- C10-C17: PASS at hermetic scope (tests above, source review, and two own mutations at the auth/tenant router boundary).
- C18: PARTIAL. Independent focused API/root/web reproduction done and two router mutations killed. Exact absent proofs (HOLD): (a) disposable-Mongo migration/runtime proof (migration 20261014200000 source present, not applied); (b) native supervisor invocation and the 10 s forced-exit versus 60 s deadline path; (c) real Gmail account/recipient and sent-message proof; (d) real Sheet destination/account and sheet content proof; (e) production DB write authority; (f) D1/coverage semantic approval; (g) independent D-024 browser proof across the catalogue.

## Ledger
Do NOT flip T-057 or the all-forty task to done. goal-t057 stays at HOLD pending C8 and the live gates above. No new issues filed. ISSUES-WRITTEN: none.

## Budget
Tool time was roughly 25 minutes, dominated by test and build runs under load. Token totals are not exposed by the host (unknown, not claimed). No maker-usage ratio is claimed.
