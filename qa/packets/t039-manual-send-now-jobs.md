# Checker packet — t039-manual-send-now-jobs, cycle 1

Repository: C:/Users/product/Desktop/KnowledgeBase. Maker skill: skills/maker/SKILL.md (read). Manifest: qa/manifests/t039-manual-send-now-jobs.md. Checker owns its verdict/contracts only. Root owns shared CLI/server/composition and tracker writes. Full-parent ground truth: qa/contracts/goal-t039.md; no maker edits.

## Candidate changes and SHA256 pins (cycle 1, not ready yet)

Base commit: ed542fd01c870e5d5b64e1d72b413062d595f675. Existing files: API send-now router; web send-now client; SendNowForm. All remaining paths below are new files/no base. Actual files and full diffs are authoritative; no commit excludes untracked edits. Cycle1 adds scripts/webinar/manual-jobs/worker-privacy.test.ts (new/no base) and changes worker.ts/worker.test.ts after the immutable cycle0 receipt.

| Path | SHA256 |
| --- | --- |
| apps/api/src/join-rules/send-now.ts | 8A93B70C4CB51A096E750BB4ED4D65CC8452EA759168D28DECBC0CE1A0470C68 |
| apps/web/src/api/send-now.ts | 1B9ADBF27DC2559AF87F27B2825967766805AFD217CC588F4E260E7F5AC09585 |
| apps/web/src/pages/meeting-bot/SendNowForm.tsx | A2FDFAFD8E9552D521E288F2558A42D93EBAFC53B0A5E287D6403E7F428F46A2 |
| apps/web/src/pages/meeting-bot/ManualJobsSection.tsx | 88B96E40F39662D38F5AD296E6118895DD773CAFEF6724DF58FE531B25EB1C14 |
| apps/web/src/pages/meeting-bot/ManualJobsSection.test.tsx | DCC672B6E0E10CBEA0566229AB8FBB8EA2FC3AEA760B59AEACE993A421BA5A7B |
| scripts/webinar/manual-jobs/host.ts | C7CCD395C44E1D5065B0F4F04F6FD76F3C14B127E271B55439D2C27A5DB63DB0 |
| scripts/webinar/manual-jobs/host.test.ts | FF4A4AABE209851FA3521EE617163DA5876D888C8F0DECB2891A88893C92E1F6 |
| packages/meeting-bot/src/manual-jobs/command.test.ts | 849B2762BC414FE8CBA94F226101C92FC42B2DD5054686622C4409EABA83310F |
| packages/meeting-bot/src/manual-jobs/command.ts | 6E2BE7C05548E30EBB7F1446137E1C4E319255D69F09114CF51EFBB89FD7F858 |
| packages/meeting-bot/src/manual-jobs/store.test.ts | 665C02922212972AAE2E1FA87F8ABB566A54FB63049E68791D40E3C1F8992F3A |
| packages/meeting-bot/src/manual-jobs/store.ts | 60D5369F2D46905BCF4499D42B98E8C1A43A7EB4A281975DD083A950FBEC856E |
| packages/meeting-bot/src/manual-jobs/worker.test.ts | D7F49575FA092E251A178D05EA17D73819FB59E19568B8E3414FC6F9820290E6 |
| packages/meeting-bot/src/manual-jobs/worker.ts | 80BFB70E0AA56723CB28921558552BE47B9A20FC4DEA2D96D5CF08A1D3AEA117 |
| scripts/webinar/manual-jobs/worker-privacy.test.ts | 95BF363D477B8DD5D78491CDBEFAB7B5656E44DB9033F8BB3AAE2D4074DF4139 |

## Immediate dependency/consumer pins (provisional until central integration freeze)

T011 reports its helper/client/receiver/fixture/connector source frozen, and actual reconnect-gaps private methods are observed installed. Central CLI manual-jobs branch and native join-rules-api-host managed-factory wiring are now observed installed. These hashes record present bytes; their owners must coordinate changes around broker freezes. The broker verifies before/after for the declared bounded stage; no mutable dependency or new hook inherits the old cycle0 receipt.

| Dependency or consumer | SHA256 |
| --- | --- |
| packages/meeting-bot/src/capture/reconnect-gaps.ts | A66449F9DE1110FC848967B160D31BDD907364809508C63716666D1DA6B7776A |
| packages/meeting-bot/src/capture/reconnect-gaps.test.ts | 4F3AFE203D5F4A25B2C6FC72050B2D39DBA3E078FD91E1DE82293070CAF9FF98 |
| packages/meeting-bot/src/capture/record-consent/controller-client.ts | A7E4F744DE243177176851D2DF6732E1F147F31AA3CD4531BF383F285B320D60 |
| packages/meeting-bot/src/capture/record-consent/controller-bridge.ts | 13DB1698E41B556A378896981CC642E4C28B8B5D29217C3EA890F9DEADE6F8AD |
| packages/meeting-bot/src/capture/record-consent/controller-worker.fixture.ts | C47CEC2BC29CBADEC93BFE42107AEB24BEEF2780F6F03AD485E4FD33FDECF965 |
| packages/meeting-bot/src/capture/record-consent/privacy.ts | D1BE5DF066B561BA2096491FB31780E2C1FDB9EC307D95D95F49A81E3D9594D2 |
| packages/meeting-bot/src/capture/record-consent/receipt-store.ts | 9F07A805EF13895E72F3392071191E00759E2C58AA0A397AA709A16E832EFD4C |
| packages/meeting-bot/src/capture/record-consent/context.ts | 19B232DC6163FF8FA54215313DAB0A003579058470A9271AF0B1851FC12D954C |
| apps/api/src/bot-privacy/host-connector.ts | 278547181750479CC79554C197DD59BFF5303D9F07D6B75250AE57A8EC0F8E7A |
| apps/api/src/bot-privacy/types.ts | 766C477BE471A39269C69C4B235A6B971174810EFA683CD64E6480D62C761314 |
| apps/api/src/routes/calendar.ts | 944C49E42590A1E27E624F8F497EF46BB44ACB66E2614E5A62F33AB65DD6DC16 |
| apps/web/src/pages/MeetingBotPage.tsx | B9BDA3E6242631A2C53DC5B0C93000552F4935553E5EE7AC8DD4B06D571E5153 |
| packages/meeting-bot/src/cli.ts | A883E3139DE355F0D1ECF565945E0CFB5DDB3E65E831094310A89CD86CEF7361 |
| scripts/webinar/join-rules-api-host.ts | 9509E942FFA5AE55550B9B82FC40A1ECEE6AB3F3F946F1C892422DB0D415D1B7 |
| packages/meeting-bot/src/capture/record-commands.ts | 83283B1CAB59D738F0DAAE5E5CCD76AE29DE3B6E21E2E9CF69394A701BD18552 |
| apps/web/src/api/client.ts | 854F0BC3301E097B83E2CAEFCD01A8EAE19530E3A6390ADD4DD6C9CFAF429802 |
| apps/api/src/auth.ts | 7492213E222053BB1E1120F0B5AFFC92639E4F913FCEAF7EE866CDB65FD62CF1 |
| packages/meeting-bot/src/capture/record-consent/private-acl.ts | DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0 |
| packages/meeting-bot/src/capture/record-consent/private-acl.ps1 | 47047E4D914122A3ADA2313C457D13AE60F283333122B162E9E092F9BE4894DD |
| apps/api/src/bot-privacy/private-acl.ts | DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0 |
| apps/api/src/bot-privacy/private-acl.ps1 | 47047E4D914122A3ADA2313C457D13AE60F283333122B162E9E092F9BE4894DD |
| packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1 | 667560A2805AF9E70C391D362E29306A98DA20CB6A2CBB6F9AF71048D152914B |
| apps/api/src/join-rules/send-now.test.ts | BAEFEC4C93CDEE2D1A0B9F9BA3F58288F063256D569851DCA51598CB3B4E2BE3 |
| apps/api/src/join-rules/send-now-status.test.ts | 760011F77AB49C9B43C1FD732BA091019A50B218CD4D5CC1528A8FF0A2F1A789 |
| apps/web/src/pages/meeting-bot/SendNowForm.test.tsx | 099E318D627D2D769F2AD076758374FE85E99A2508B602CE90E742AC32EA9727 |
| apps/web/src/pages/meeting-bot/useSendNowStatus.test.tsx | 5289A49D37C85AB61C0C7FB40C7D02ADB63941575A900FFBFFFF619412AB7E72 |

## Change/caller map

- `ManualJobStore`: immutable request under `<jobsDir>/<tenant>/<jobId>.json`; worker-only atomic `.state.json`; exclusive `.owner.json`; atomically published idempotent `.cancel.json`. A tenant dispatch directory lock serializes meeting claim selection; `meeting-*` claim references only a job id. Nonterminal/unknown states keep duplicate ownership. Every persisted read checks tenant/job/nonce, file type and size; tenant/job path components use strict regexes.
- `runManualWorker`: rechecks existing `planSendNow` URL allowlist and canonical UTC until bounds, claims one worker, and calls `launchControlledRecording` with safe `record` argv, authenticated tenant/session and the existing token/generation IPC protocol. Shared `reconnect-gaps.ts` owns token generation/exact ACK matching; unchanged by this maker, but changed by central runtime to supply actual privacy methods and pinned as a dependency. Readiness is the recorder's fixed stdout line after control installation, not admission. Before readiness, cancellation stays requested. A positive owned stop ACK stores cancel-acknowledged; cancelled requires actual child resolution. Active ACK work settles before terminal write. Readiness storage errors are contained and request owned stop.
- `createManagedSendNowDeps`: lawful scripts-layer bridge between API structural interface and meeting-bot implementation. Uses existing `createSendNowDeps.plan` for tenant/window/live-recorder safety, then durable duplicate view. Launch re-plans at the real seam, atomically persists job and spawns only a fixed worker entry with no shell. Only configured capture tenant is served. Returned process GET preserves existing recognized states and joined unknown; stale heartbeat returns unavailable.
- API `SendNowDeps.manualJobs` adds scoped GET list/detail and POST cancel under `/calendar/send-now/jobs`. Requires exact send-now scope; tenant exclusively req.auth.tenantId. Query substitution, unknown cancel body keys and malformed job ids are rejected. Metadata is explicitly projected; no nonce, URL, passcode, PID/path/control token/raw error is serialized. Unknown job returns 404; unserved host tenant 403; corrupt state 503.
- Explicit `durableDispatch: true` is trusted adapter metadata, not a request field. Only the managed adapter's atomic persisted meeting guard provides it. That adapter skips legacy ten-minute recent-launch memory, keeping in-flight and durable active-job exclusion, so terminal cancellation permits immediate re-dispatch. Legacy adapters remain unchanged. Real API+managed host fixture verifies cancelled terminal→new accepted job→active duplicate refusal with exactly two worker launches.
- `createHttpManualCommandDeps`/`runManualJobsCommand`: actual CLI consumer connects to the authenticated API via LKB_API_URL and LKB_API_KEY. Redirects forbidden; HTTPS or loopback HTTP origin only; no client tenant substitution. No retry after ambiguous network failure. Response metadata projected before JSON output.
- `SendNowForm` exposes Manage manual jobs toggle; `ManualJobsSection` retrieves persistent server history, refreshes explicitly and submits idempotent `{}` cancellation through shared apiFetch. Existing auth invalidation remains intact. Key generations suppress stale results. Requested/ACK/terminal/unknown are displayed separately with admission unknown; no secrets are echoed.
- Immediate shared consumers: `apps/api/src/routes/calendar.ts` already mounts createSendNowRouter from calendar.sendNow; `apps/web/src/pages/MeetingBotPage.tsx` already mounts SendNowForm. Central integration request: replace supported host createSendNowDeps with createManagedSendNowDeps; add cli.ts manual-jobs branch calling own-package runManualJobsCommand/default HTTP deps. Root runtime owns these changes and evidence.

## Historical cycle-0 broker receipt and cycle-1 remaining checks

`qa/evidence/goal-t051checker-broker-t039.json` records the cycle-0 four-file Node command executed centrally by /root/docker_checker, exact `C:\\Program Files\\nodejs\\node.exe` runtime/argv, cwd, timeout 120000 ms, and all 13 unchanged before/after candidate hashes. Exit 0, tests 16/pass16/fail0/skipped0/cancelled0. TAP 14975.6696 ms; wall15066.9095 ms; UTC19:53:09.943→19:53:25.014 on 2026-10-14. Matching stdout/stderr evidence files are named in the receipt. Maker consumed this immutable attributed result and did not run a duplicate process. API/web/typecheck/validator commands below remain pending; no grant is inherited.

New cycle-1 root integration requirement (not part of the cycle-0 receipt): T011 (/root/docker_frontend_review) owns private controller registry/transport at `capture/record-consent/controller-bridge.ts` and sealed IPC client `controller-client.ts`. The worker now initiates `publishCapturePrivacyController({directory,tenantId,sessionId,control})` only with both actual handle and recorder setup signal. Helper challenge/ACK, not stdout, proves actual privacy capability. Explicit absolute `LKB_CAPTURE_CONTROL_DIR` is required; absence leaves controls unconfigured. Retained pending publication settles and async disposer revokes private descriptor after actual child exit, including late publication. Failure triggers owned stop and failed status; acknowledged operator cancellation remains cancelled when exit invalidates a pending challenge. Descriptor/capability never enters public job metadata. Worker and managed-host source/tests changed plus one new cross-process fixture consumer; four lifecycle tests and one base-refusal redaction test are added, expected Node batch24. Current helper/receiver dependencies and actual launcher private-method glue are pinned; fresh broker execution remains pending.

From repository root, node runtime C:/Program Files/nodejs/node.exe:

```powershell
node --test --test-concurrency=1 --import tsx packages/meeting-bot/src/manual-jobs/store.test.ts packages/meeting-bot/src/manual-jobs/worker.test.ts packages/meeting-bot/src/manual-jobs/command.test.ts scripts/webinar/manual-jobs/host.test.ts scripts/webinar/manual-jobs/worker-privacy.test.ts
node --test --test-concurrency=1 --import tsx packages/meeting-bot/src/capture/reconnect-gaps.test.ts
node --test --test-concurrency=1 --import tsx apps/api/src/join-rules/send-now.test.ts apps/api/src/join-rules/send-now-status.test.ts
pnpm --filter @lkb/web exec vitest run src/pages/meeting-bot/ManualJobsSection.test.tsx src/pages/meeting-bot/SendNowForm.test.tsx src/pages/meeting-bot/useSendNowStatus.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter @lkb/meeting-bot typecheck
pnpm --filter @lkb/api typecheck
pnpm --filter @lkb/web typecheck
python contracts/verify_contracts.py
```

Stage coverage: store restart/tenant/traversal/malformed ownership/duplicate/exclusive worker/redaction/idempotence; worker pre-ready cancellation/no-launch, ready→ACK→exit distinction, failure before readiness, outstanding final-tick race, callback storage failure; immediate API+host POST/list/detail/cancel loopback consumption and exact auth/tenant/body/query/URL boundaries; CLI actual HTTP client/output projection; mounted real-form durable controls and stale key result suppression; legacy process polling regressions. Cycle1 adds four private publisher lifecycle tests and one cross-process actual child/client/bridge/API connector test, including persisted private receipt before ACK, replacement API connector, generation/tenant refusal, public metadata redaction and actual child-exit descriptor revocation. This child is the explicit T011 actor/meeting fixture with real sealed IPC/receipt I/O; no browser/provider/real meeting/capture media is started. Existing recorder IPC tests in packages/meeting-bot/src/capture/reconnect-gaps.test.ts independently pin cancellation generation/token/tenant/session ACK checks.

Known environment: CPU restricted while the Chrome worker runs, so request permission only from designated internal CPU broker; no browser or full suites. Runtime install readiness is being handled by root. Tests use temp dirs and loopback listeners only; no MongoDB/provider credentials. No prior sandbox failure established for these exact commands, and no escalation attempted.

Cycle1 private transport adds mandatory real native ACL verification of the pre-existing configured root, tenant directory and descriptor. The fixture explicitly creates its private temp root with directory creation only, inherits actual OS ACLs, performs no ACL mutation/fake proof, and has timeout60000ms. Bounded readonly native PowerShell Get-ACL checks are security dependencies; source/script counterparts are pinned. Production operators must pre-protect/configure the absolute shared root; same-host/native control remains the proven topology, while remote/container trust bridging is not inferred.

## Full-parent gates not fulfilled

Current owner-confirmed diagnostic dependency checkpoint: both private-acl.ts helpers now DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0. Forty paths revalidated; other38 matched, and these two QA rows refreshed only after T011 owner confirmed freeze. Native permission/physical-identity checks and fixed5s bound remain actual. New sole CPU broker /root/docker_governance_review has the exact focused commands above queued; source/test execution is held by central U24 freeze until runtime releases. No local test, no proof waiver, no promotion of older sixteen-test/native evidence to these bytes.

Latest resumed execution snapshot: own14 plus immediate26 source/test/setup dependencies, 40 SHA256 rows. All rows were refreshed after owner freeze and the authorized worker-privacy fixture adaptation. Its private temp child now inherits from explicit local absolute `LKB_PRIVATE_ACL_PROBE_DIR` when supplied by the CPU broker; absent configuration uses ordinary temp and must still face/refuse broad native ACLs. The sole broker owns test-only UUID-root setup/verified cleanup through pinned native-acl-fixture.ps1. No existing/live-host ACL is mutated by this maker. Current private-acl.ts helpers are F3F26D13… and context.ts19B232DC…; other receipt-generation dependencies are current pins above. No production source changed during this resumed adaptation. Current focused Node24, immediate IPC12, mounted UI three-file stage, legacy API and type/validator results remain pending exact attributed receipts.

Resumed candidate adds two declared regressions (total five-file Node batch24): API cancellation intent before worker/readiness remains launching until persisted worker recorderReady is true, and an actual shared cli.ts subprocess consumes the real managed API's durable history over loopback. No browser/provider/recorder is launched by the CLI list fixture. ManualJobStore.recorderState reads worker phase/readiness independently of the public cancel-intent overlay; runManualWorker persists its observed setup readiness with each progress write. Public metadata projection remains unchanged. Own14/immediate21 pins define a 35-file snapshot including the immediate cancellation IPC test dependency. Its focused twelve-case command above verifies actual child ACK/flush, owner/generation capability boundaries, disconnect and ACK timeout. Tests remain pending CPU broker execution; shared native ACL dependency changes must be frozen and repinned first.

Actual supported host and shared CLI integration evidence, independent real admission ≤60 seconds, media signal verification and immediate capture downstream consumption remain missing. No Windows/Ubuntu/live/restart deployment proof claimed. The directory is single-host durable storage; unknown worker liveness is fail-closed and cannot be automatically reclaimed. Human host/live/production approvals retain their existing boundaries. T-039 remains open/in_progress and this packet must not be used to close it.
