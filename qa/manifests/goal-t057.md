# goal-t057

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 0
Lane: lane/w16-t057ops (worktree C:/Users/product/Desktop/KnowledgeBase-lanes/w16-t057ops). Base a9fac545d0da015668d7dba455031b3a0fe52078. Candidate = the single lane commit that carries this manifest (its SHA is in the maker review packet; a commit cannot name itself).

Task: T-057 (operations workspace, source health, Explorer URL replay, notifications four-source, durable digest/Sheets schedule). Contract qa/contracts/goal-t057.md C1-C18 plus retained t057-b8-knowledge-explorer.md. Full ceremony (auth/tenancy/data-write/credentials). Feature unit, no filed-issue corpus claimed (D-015 n/a).

## What this maker pass did (2026-10-16, verification of the frozen candidate)
- The 39 leased files were already committed at base a9fac545. Of the 68 pins in qa/packets/goal-t057.md, 60 match byte-for-byte; 8 do NOT (see Pin drift).
- Ran every focused node and vitest file named in the packet in a lane worktree with node_modules junctions to the main tree. No browser, no live DB or provider, no Mongo migration applied, no native supervisor registered, no Google Sheets or Gmail account touched.
- One small defect fixed in a leased test: apps/web/src/pages/operations/OperationsIntegration.test.tsx first test used the default 5000 ms vitest timeout and measured 4804 ms alone (it timed out at 5000 ms under load in the 14-file run). Added an explicit 30000 ms per-test timeout (line 18, `}, 30000);`). No product code changed. New pin SHA256 3A7EB8B2B158518B9D281206FB9A6F918B6F94706B3DAF7DE4750AE30D67B41B; the packet pin 7880DEB63707DD2D1DBF80F60573713E9BFAB670DE30AF5194917F9A9285D744 is superseded.
- No other leased file was edited.

## Changed paths in this commit
- apps/web/src/pages/operations/OperationsIntegration.test.tsx (timeout only)
- qa/manifests/goal-t057.md (this file)

## Pin drift the checker must resolve (maker did not edit these; central/shared, or later than the packet)
Packet pin versus bytes committed at a9fac545 (also the current main-tree bytes):
- apps/web/src/pages/operations/OperationsPage.tsx: packet C44C24B40A67AF0358A67276E3BECAEF757ED3FECE7B7A6CDA21844B557DE062, committed B413ADEBA679683F06D7D5EEB5DBF689275BE2F30D2A033453DAC2747709FA52. This is a LEASED file, so the frozen packet is stale for it. The focused tests ran against the committed bytes, not the packet-pinned bytes.
- apps/web/src/App.tsx committed 5E547F5DC5FE736111C8347B497F66130AD16A286F71B01B2933B774CA6284B3
- apps/api/src/composition/production.ts committed 86EC1D549BA0B0FA3C9017FAE245C7237FDE7CC3BCDA90C4F534F3F0BC29F0FA
- apps/api/src/composition/integrations/routes.ts committed 5008201FED89EAAEEA6E52FCEBC719CEB6FF34D00BEF9632FDCC9A7EF585742E
- apps/api/src/composition/integrations/hosting.ts committed 9B97EEEF07C50B1D9326BAB9B80CB8E432DB41B9CCA2C3E679A31A1FDD4E26ED
- schema/index.json committed C949FE2697E3CF735601CAEE4372378E108E0BF3855079D299CB6CFFDA1483E8
- qa/goal-2026-10-14/web-types-receipt.json committed E6BC0657F9D6B6D7D75016F5EBB9D26E6BBD2C8146C2B6E3CD3A433C425BCE91 (exit 0, 2026-10-15T01:20, 11107 ms)
- qa/goal-2026-10-14/api-types-receipt.json committed C477E5BDD7ADB8A0963E6AD2BC20E4FBFA2D7B1DFDBD9D26ED4295FE41752FCC (exit 0, 2026-10-15T01:19, 15331 ms)
Both central typecheck receipts now show exit 0 (the packet pinned older exit 2 receipts). They predate this pass; this pass reran both typechecks itself (below).
Windows note: a fresh worktree checkout here applies core.autocrlf=true, so raw hashes of a lane checkout differ from the pins. Hash blobs (LF) or main-tree bytes. For this pass the 68 pinned files in the lane were byte-copied from the main tree.

## Commands and results (lane worktree, node 24.19.0, shared 8-core machine under load)
API (apps/api, `node --import tsx --test --test-concurrency=1 <file>`, one file per process, timeout 300):
- service.test.ts 11/11 pass (112 s). Includes "effect followed by terminal CAS failure survives restart as audited uncertainty without redelivery" (the uncertain-effect recovery fixture): PASS.
- store.test.ts 2/2 (20 s); adapters.test.ts 4/4 (16 s); router.test.ts 2/2 (19 s); producer-compat.test.ts 1/1 (22 s); serverIntegration.test.ts 1/1 (57 s). Total 21 tests, 0 fail.
- A first combined six-file invocation was killed at 600 s (esbuild "service was stopped" while serverIntegration compiled under load). That is an environment or load timeout, not a test failure. The per-file runs above are the receipts.
Root (`node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 scripts/operations/tick.test.ts scripts/operations/host.test.ts`): 6/6 pass (94 s).
Web (apps/web, `node node_modules/vitest/vitest.mjs run src/pages/operations src/pages/operations-integrations src/pages/explorer src/pages/notifications/producerCompat.test.tsx src/pages/notifications/NotificationsPage.test.tsx src/App.routes.test.tsx --maxWorkers=1 --minWorkers=1`): 14 files, 107 pass, 1 fail. The failure was OperationsIntegration "actual protected App/sidebar..." timing out at 5000 ms under load (385 s run). Rerun alone before the edit: 2/2 pass (tests 4.8 s, 99 s wall). After the 30000 ms edit, rerun alone: exit 0. The other 13 files were not rerun after the edit, which touches only that file.
Typecheck: apps/web `tsc --noEmit -p tsconfig.json` exit 0, empty output (107 s). apps/api exit 0, empty output (143 s). Used node_modules/typescript/lib/tsc.js from the main tree.
Frozen-contract verifier `python contracts/verify_contracts.py`: "no frozen contracts yet (research phase) -- PASS by vacuity". Vacuous.
Not run (not authorised or not required): web bundle/build, activity-health/router.test.ts (needs untracked .venv python, see ISS-T057OPS-002), any browser, full suite, mutation runs.
Raw outputs (untracked, outside git): C:/Users/product/Desktop/KnowledgeBase-lanes/w16-t057ops-*.out

## Criteria map (evidence is the test named; LIVE/HUMAN means not provable here)
- C1 mounted navigation: OperationsIntegration.test.tsx (real App and NavSidebar, "Operations workspace" link, login gate); App.routes.test.tsx 3/3. Live browser gate C8 open.
- C2 honest session views: operationsModel.test.ts "worklist readiness requires both stages..."; OperationsPage.test.tsx "current 401 signs out, and filtered-empty differs from an empty returned source".
- C3 independent panels: OperationsPage.test.tsx "source outage and capped notification window remain visible", "actual strict queue sample reports limit, truncation, retries...". No N+1 fetch campaign is asserted separately.
- C4 deep links and Explorer replay: operationsModel.test.ts "query parser allowlists one enum; raw IDs are encoded exactly once"; ExplorerUrl.test.tsx 9/9 including removed selection; ExplorerIntegration.test.tsx 2/2; explorerModel.test.ts 4/4 (retained B8 provenance).
- C5 saved views: operationsModel.test.ts "saved storage accepts only unique enum codes..."; OperationsPage.test.tsx "blocked storage produces usable session-only Save/Open/Remove...".
- C6 auth generation: OperationsPage.test.tsx "rotation/logout hide content immediately and anonymous page never fetches" and "current 401 signs out"; producerCompat.test.tsx "rotation/logout hide old notification data..."; OperationsIntegrationsPanel.test.tsx "partial configuration failure and unmount...". Same-key re-login is covered only where those tests exercise it; the checker should confirm.
- C7 focused evidence and pins: this section. Pins drifted (above), verifier vacuous, both typechecks green, web bundle not run.
- C8 independent live UI gate: NOT DONE. LIVE/HUMAN gate (independent browser, mobile/tablet/desktop, accessibility, real request observation).
- C9 handshake: this manifest; the checker must re-verify pins given the drift list.
- C10 source counts and health: sourceHealthModel.test.ts 8/8 (unknown kinds preserved, no health score); OperationsPage.test.tsx source-outage test.
- C11 durable configuration: store.test.ts 2/2 (actual scopedCollection accessor, production-write gate), router.test.ts 2/2, serverIntegration.test.ts (real createServer, private temporary journal). Migration and index source present but NOT applied; Mongo migration/runtime proof is a LIVE gate.
- C12 authorization and audit: router.test.ts "real verified auth/roles distinguish viewer reads, admin mutation and foreign tenant config"; service.test.ts "role revalidation precedes executor..." and the audit-capacity 9997 and 9996 tests.
- C13 CAS and worker: service.test.ts "concurrent/stale revision can initialize only one side effect", "future due schedule has no side effect..."; tick.test.ts 2/2; host.test.ts 4/4. Actual supervisor registration and scheduling NOT proven (LIVE gate).
- C14 target and credential boundary: adapters.test.ts 4/4 (disabled or foreign tenant never invokes transport, RAW range, privacy). Real account identity and approval are a LIVE/HUMAN gate.
- C15 payload and receipt semantics: adapters.test.ts "Gmail accepted send alone cannot establish success...", "Sheets RAW bounded dedicated range...", "privacy export refuses foreign rows..."; producer-compat.test.ts digest counts.
- C16 durable uncertainty and receipt recovery: service.test.ts "possible-delivery failure disables schedule; expired lease cannot resend after restart", "effect followed by terminal CAS failure survives restart as audited uncertainty without redelivery", "reconciliation verifies a stored content-bound receipt...", "last permitted run leaves capacity..."; OperationsIntegrationsPanel.test.tsx uncertain and reconcile tests. Native 60 s / 10 s force-exit lifecycle NOT executed (LIVE gate).
- C17 actual consumers and notification compatibility: serverIntegration.test.ts, producer-compat.test.ts (real collectNotifications), producerCompat.test.tsx 7/7, NotificationsPage.test.tsx 9/9, OperationsIntegrationsPanel.test.tsx 5/5.
- C18 independent focused proof: a checker must reproduce independently. This maker pass is not independent.

## Whole-T057 gates still open (unchanged)
D1 and coverage semantics approval; independent D-024 browser proof across the catalogue; approved real Gmail/Sheets target and account and actual downstream proof; production DB writes; actual Mongo migration/runtime; native host invocation, shutdown and scheduling. Export is session-metadata only. No Approved-by, PASS or task completion is claimed.

## Ledger notes
- ISS-T057SCREEN-001: ledger row already has status verified (verdict iss-t057screen-001-health-liveness-only.md). Nothing to fix.
- ISS-T057OPS-002 (low): not touched. Per verdict t057-jobs-health-and-usage-analytics.md the cause is a missing untracked .venv/Scripts/python.exe in lane worktrees (D2_FIXTURE_PYTHON overrides it). The test file is outside the 39 leased files and the row is deliberately kept open.
