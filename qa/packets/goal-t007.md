# Checker packet — goal-t007, cycle 1

Repository: C:/Users/product/Desktop/KnowledgeBase. Maker source lease granted by root through implementation_status. Same-slug manifest ready-for-check, cycle1; focused retry passed final pinned bytes. Checker verdict path qa/verdicts/goal-t007.md. Maker does not write contracts/verdicts.

Ground truth: qa/contracts/whatsapp-ingestion-first-slice.md C12–13 UI behavior and qa/contracts/goal-t007.md map 5. Parent C1–14 and map 1–6 remain acceptance gates. This candidate implements missing shipped UI; it does not claim mounting, trusted retrieval or live persistence.

## Candidate identity

Base commit ed542fd01c870e5d5b64e1d72b413062d595f675. Review tracked changes with `git diff <base> -- apps/web/src/api/whatsapp.ts apps/web/src/pages/WhatsAppPage.tsx apps/web/src/pages/WhatsAppPage.test.tsx`; inspect both new nested files in full (untracked changes are included in this submission). Original tracked blob identities in the maker diff: whatsapp.ts 5ac16e8e; WhatsAppPage.tsx 34680e87; WhatsAppPage.test.tsx da0b035b. No base existed for ReviewQueue.tsx or its test.

| Path | Final SHA256 |
| --- | --- |
| apps/web/src/api/whatsapp.ts | BE1B77720EA928402845728502DCE314931AB07970B55DCC3CF0DAA534E8210A |
| apps/web/src/pages/WhatsAppPage.tsx | 885F1AF68ED4D21B00D141BB8DDD8631F732071621ED4471C5FBAB7693B651CB |
| apps/web/src/pages/WhatsAppPage.test.tsx | F10CF5883BFAA5B87B670AAE119B3C950AF077BD12864FDAAD751FCC53070E61 |
| apps/web/src/pages/whatsapp/ReviewQueue.tsx | 9FE70D1B8643A7878AA8A81650E85145E8002EC3D09AC4338A399ECE4D223D63 |
| apps/web/src/pages/whatsapp/ReviewQueue.test.tsx | D9812D471A8203543CAB8661CB9177662C00DB8B8F4191641DB2F73696019818 |

## Complete change map and immediate consumers

- api/whatsapp.ts adds HTTP candidate response shape (frontend deliberately has no domain imports), `listWhatsAppCandidates` GET `/whatsapp/review`, `decideWhatsAppCandidate` POST `/whatsapp/review/${encodeURIComponent(id)}/${action}` with `{}` body and shared `apiFetch` auth. No client-supplied tenant or reviewer. Server consumer apps/api/src/whatsapp/review/router.ts requires scope/verified tenant and rejects nonempty decision bodies; store.ts performs transaction-bound per-candidate publication.
- WhatsAppPage imports ReviewQueue, increments reviewRevision after successful ingest and mounts keyed by apiKey. Entire private page state is also keyed by verified AuthContext sessionVersion and apiKey, so explicit relogin (even reusing the same credential) cannot retain prior groups or late ingest results. Replaces obsolete ingestion-only copy. Existing group fetch and ingest behavior retained. Existing WhatsAppPage tests default the new review list to empty to isolate prior group regressions; added same-credential relogin/late-ingest privacy case.
- ReviewQueue.tsx complete new logic is the authoritative small module (~110 lines): wrapper returns credential-keyed ReviewQueueState; mounted live ref and request generation invalidate obsolete responses; list fetch takes apiKey/revision/refresh dependencies; success replaces rows with authoritative server pending list; failure clears rows and shows actionable error. Decision uses synchronous ref lock, invalidates older loads, calls API once, replaces only returned candidate state, and shows recorded/idempotent confirmation. Buttons disabled during requests, for missing/session-mismatched evidence, and approval for personal-excluded flag. Flags/reasons, exact speaker/time/quote and optional attachment metadata render as text. Link `/sessions/${encodeURIComponent(evidence.sessionId)}#turn-${encodeURIComponent(evidence.turnId)}` only for matching evidence session. Explicit refresh drops old local terminal snapshots, respecting later source edits/deletions. No auto-approval or optimistic success.
- Immediate evidence consumer apps/web/src/pages/sessions/SessionDetailPage.tsx already resolves `#turn-...`, marks and scrolls target. This unit changes no citation/session viewer source. Main App already mounts WhatsAppPage; no navigation glue added.

Security flags: authenticated private review and explicit decision write; no credential serialization beyond shared request Authorization; credential switches clear state including late decision/list responses; no new cross-tenant selector. Backend source remains the authoritative trust boundary; UI gating cannot replace its quarantine or transaction checks.

## Exact focused verification (root CPU slot required)

Affected stage, cwd C:/Users/product/Desktop/KnowledgeBase/apps/web:
`node node_modules/vitest/vitest.mjs run src/pages/WhatsAppPage.test.tsx src/pages/whatsapp/ReviewQueue.test.tsx --maxWorkers=1 --minWorkers=1 --fileParallelism=false`

13 review cases cover flags/attachments/evidence; per-candidate approval; excluded rejection/idempotent receipt; 403/409/503/502 honest failure; absent endpoint retry; missing/mismatched evidence; ingest revision; late private list and decision responses after key switch; actual shared HTTP client endpoint/body/header consumer. Existing 5 group-page tests plus same-credential relogin/late-ingest case remain (actual19 focused cases total; initial authored count20 was corrected from runner output). No live provider/DB/browser calls.

Affected compiler, cwd repository (central integration owns its one coherent run; maker does not execute):
`node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`

Focused test command must be bounded at 90 seconds and single-worker invocation retained. No mutation command is prescribed. Actual default-sandbox startup proved esbuild spawn EPERM; exact same focused command requires require_escalated for its child process, rather than repeating the failing default. Approved exact retry succeeded; independent checker still needs its own CPU slot. Full compiler/suites are deferred to central integration. Commands need no secrets/env values. Frozen contracts check and broader integration evidence must be supplied by central integration, not inferred from this UI test.

## Evidence and gates

Actual first root-granted command used Start-Process node -WindowStyle Hidden, redirected logs to temporary goal-t007-vitest-c1.out/.err, WaitForExit(90000) with Kill(true) on timeout. Exit1, elapsed0.9268319s,0 cases. Retained tool output: `failed to load config from .../apps/web/vitest.config.ts`, `Error: spawn EPERM`, esbuild ensureServiceIsRunning -> Vite bundleConfigFile; syscall spawn, errno -4048. It did not reach tests. CPU slot released immediately. This is an execution prerequisite failure, not a source test PASS/FAIL.

Exact queue-granted require_escalated retry (same command/timeout/worker count; temp logs goal-t007-vitest-c1-approved.out/.err) returned unified exec session50242, polled once, then exit0. Output:
```
RUN v2.1.8 C:/Users/product/Desktop/KnowledgeBase/apps/web
✓ src/pages/whatsapp/ReviewQueue.test.tsx (13 tests) 1199ms
✓ src/pages/WhatsAppPage.test.tsx (6 tests) 516ms
Test Files 2 passed (2)
Tests 19 passed (19)
Duration 10.84s (transform273ms, setup592ms, collect4.10s, tests1.72s, environment2.78s, prepare583ms)
exitCode=0 elapsedSeconds=14.5147895
```
Stderr contains React Router v7 future-flag warnings in both files. No test failures; no zero-console/browser claim. Immediate downstream check inside this actual run uses real list/decide API wrapper and shared apiFetch with fake HTTP responses, asserting protected paths, encoded candidate ID, bearer auth and empty decision body, then React consumed the confirmed terminal candidate. CPU slot released before packet drafting. Final five hashes reread afterward and match Candidate identity table.

No filed issue is the purpose of this feature unit; issue-corpus substitution is not applicable. Checker independently tests current cycle final bytes after readiness, including privacy races and exact source-link consumption. Full-parent HOLD remains until backend mounting/quarantine, detection mutation proof, actual attachment acceptance, schema/drift/structure/full integration, live Mongo restart/tenant/approval/rejection retrieval, and shipped-browser Ask workflow pass. Main source mount still createMongoWhatsAppDeps(boundIndexer) at initial survey; review compose is unmounted. Integrator has received exact mounting/glue request and requirement to enforce quarantine first.
