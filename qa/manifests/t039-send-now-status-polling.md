# t039-send-now-status-polling

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Checked: `qa/verdicts/t039-send-now-status-polling.md`, cycle 0. Maker rechecked all six final SHA256 pins unchanged before close-out.
Task: T-039. Priority tier: 3 (authorized roadmap completion slice).
Class: authenticated operator form / credential-bearing API calls; full ceremony.
Base: 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. Main-tree exclusive paths assigned by orchestrator; unrelated changes preserved.

## Authorized behavior
Connect the existing flag-gated GET `/calendar/send-now/:jobId` to the existing SendNowForm. Sequential polling every 2 seconds after an accepted launch, at most 60 requests, each with a 10-second logical deadline. Stop scheduling on not-running, errors, deadline, key/job change, replacement launch or unmount. Ignore late GET and POST results from an earlier key/job generation. Underlying HTTP cannot be aborted through the existing shared client; cancellation is logical and does not stop the recorder.

Process running does not establish admission. Every status label explicitly says meeting admission is unknown. Do not activate the server status flag. T-039's live 60-second admission criterion and production host acceptance remain open.

## Change map and consumers
- `apps/web/src/api/send-now.ts`: new `SendNowStatus`, `SEND_NOW_JOB_ID`, `getSendNowStatus`; exact scoped GET through existing apiFetch, validates job identity/status/joined=unknown. Existing POST body unchanged.
- `apps/web/src/pages/meeting-bot/useSendNowStatus.ts` (new; no base): sequential timeout/capped lifecycle and truthful status messages. Consumed only by SendNowForm.
- `apps/web/src/pages/meeting-bot/SendNowForm.tsx`: POST generation guard; owned job key prevents a replacement key polling the prior key's job; resets denial/busy/outcome on key changes; renders hook status.
- `apps/web/src/pages/meeting-bot/useSendNowStatus.test.tsx` (new; no base): lifecycle, cap, timeout, key/job cleanup, status errors, client response validation.
- `apps/web/src/pages/meeting-bot/SendNowForm.test.tsx`: downstream real form/API-fetch integration and key replacement cases; existing tests retained.
- `apps/web/src/pages/MeetingBotPage.test.tsx`: root-authorized downstream fixture repair; import current botEvents API and mock healthy events in beforeEach. Existing zero-alert assertion preserved.
- Immediate caller: `apps/web/src/pages/MeetingBotPage.tsx` (unchanged). Backend source: `apps/api/src/join-rules/send-now.ts`; real status reader: `scripts/webinar/send-now-host.ts` (both unchanged).

Security: key passed only to shared API authorization header; tenant never supplied by UI; job id regex-validated before GET; server detail from polling errors never displayed. Existing apiFetch auth-session invalidation stays unchanged. No knowledge writes, schemas, contract files, defaults or backend admission signals changed.

## Ground truth and acceptance
`qa/contracts/t039-send-now-status-polling.md` acceptance 1-7 is checker-owned scoped ground truth. `qa/contracts/t039-send-now-command.md` criteria 5/7 supply secret-handling/truthful-duplicate baseline; its CLI-specific criteria remain outside this web slice. `qa/verdicts/t039next.md` cycle 1 establishes GET process-only/flag-off behavior. No contract edit by maker.

Required checks: standing SendNowForm/useSendNowStatus tests; immediate downstream MeetingBotPage test; shared web typecheck; frozen contracts validator. Runtime coordinator reports standing Vitest blocked by esbuild EPERM, prior escalations cancelled; awaiting authorized safe ReactDOM/jsdom harness. Do not reattempt known blocked subprocess path without required approval. No live browser/provider/DB or full suite authorized for this unit.

## Evidence
Standing Vitest command (cwd apps/web): `node node_modules/vitest/vitest.mjs run src/pages/meeting-bot/SendNowForm.test.tsx src/pages/meeting-bot/useSendNowStatus.test.tsx src/pages/MeetingBotPage.test.tsx --pool=threads --maxWorkers=1 --minWorkers=1`. PASS 41/41, 3/3 files, exit 0, wall 9.0302363 seconds (runner 7.71 seconds, started 2026-10-14 09:33:33 UTC). Receipt `qa/evidence/t039-send-now-status-polling-vitest.receipt.json`, stdout matching .txt. Initial 40/41 and exact preserved fixture repair documented there. Approved elevated original Vitest context used after earlier esbuild EPERM, one worker and coordinated lightweight slot; slot released.

Final shared whole-web typecheck PASS exit 0, stdout/stderr empty, 8.6013715 seconds. Receipt `qa/evidence/t039-send-now-status-polling-web-typecheck.json` pins configs and five owned files. Earlier eight owned-test diagnostics were corrected (typed initialProps, proven mock-call indices). This pass predates only the downstream MeetingBotPage import+healthy-spy fixture change; final integration typecheck owner notified. Production and other test files unchanged since pass. No whole-task completion claim.

Independent checker: PASS cycle 0, original standing 41/41 attributed plus four actual ReactDOM/client/form boundary probes 4/4 (hanging JSON-body deadline, late old-login 401, 403 session preservation/private-detail suppression, replacement same-key/new-job isolation). Final independent whole-web typecheck PASS exit 0, 9.5914537 seconds, covers all six final candidates; receipt `qa/evidence/t039-send-now-status-polling-checker-typecheck.receipt.json`. Exact commands, hashes and timed evidence in matching verdict. No issue filed; no mutation tests, live browser/provider/DB or capture acceptance claimed.

Reusable frozen validator evidence: `qa/evidence/execution-wave1-integration-validator.receipt.json` and matching stdout, `./.venv/Scripts/python.exe contracts/verify_contracts.py --repo-root C:/Users/product/Desktop/KnowledgeBase`, exit 0, 0.133968 seconds, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Validator/registry untouched here.

Equivalent actual ReactDOM/jsdom adapter ready (NOT yet executed): `node --test --test-isolation=none --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register-react.mjs .cache/coordination/sendnow-polling.node.test.tsx`. Ten cases exercise real hook/client/form and immediate MeetingBotPage/AuthProvider consumer. Node loader uses installed TypeScript transpileModule/ReactJSX, resolves missing relative .js imports to .ts/.tsx, and replaces only import.meta.env with the explicit test fixture `{MODE:"test",DEV:true,PROD:false,VITE_API_BASE_URL:""}`; no production file rewriting, network, subprocess or auth bypass. Equivalent harness is not a standing Vitest PASS.

Harness SHA256 pins:
```
.cache/coordination/sendnow-polling.node.test.tsx B7D4F2AE54FFF8B61EBA9FB7DF21129C2F163BF77082ADE75FD148E1A0F51226
.cache/coordination/safe-test-runtime/register.mjs FE80C5A2C766A6A20AD2532F434541D381E45EF77C90D9C7F485C939A11AF644
.cache/coordination/safe-test-runtime/register-react.mjs DED9F20F16C15FCDC82E1B355EB13FEFBA7989F0294966936ED3660EA7B85F82
.cache/coordination/safe-test-runtime/react-harness.mjs 3E4B648688FB8A2D643158A4995A76D8235CED1033A6D4AEFEAE242D9C6F5068
```

Final source SHA256 before independent check (subject to test-driven correction):
```
apps/web/src/api/send-now.ts 31D3BDBADE0B8135512512C1305F02118719F0BE20A491112E44E9BD5E98BA01
apps/web/src/pages/meeting-bot/SendNowForm.tsx D03AA61A38204FCAA2936F3F031029D5ADFD846FF2D9ADC3E3639AEE7E3910D9
apps/web/src/pages/meeting-bot/SendNowForm.test.tsx 099E318D627D2D769F2AD076758374FE85E99A2508B602CE90E742AC32EA9727
apps/web/src/pages/meeting-bot/useSendNowStatus.ts C9C81C331B508E5AA427FCF3C758FF2CFCCEBD67B1AC3D1EF97D82A2ED5C479D
apps/web/src/pages/meeting-bot/useSendNowStatus.test.tsx F04DCCFEC1B1686BCAB0620682F0299F60FFF5551BBEECF2FE4AA3F351D65DB5
apps/web/src/pages/MeetingBotPage.test.tsx A6912D2C95BE119FF5005FAAC99C7D1DE5F025A704E7861D8D742B693312DE63
```

No filed-issue fix claimed. ISS-SENDNOWAPI-003 remains open for admission measurement; low restart issue 002 and host issue 004 are not changed here. Existing send-now UI seam has one previous PASS; new polling behavior is independently bounded; credential handling is security-class and uncapped.
