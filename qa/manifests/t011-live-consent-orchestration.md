# T-011 live consent and private capture orchestration

**Status:** checked-PASS — closed out 2026-10-26 by maker resume (non-live criteria only; live criteria and parent T-011 stay HOLD), citing qa/verdicts/t011-live-consent-orchestration.md
**Handshake status:** checked-PASS — closed out 2026-10-26 by maker resume (non-live criteria only; live criteria and parent T-011 stay HOLD), citing qa/verdicts/t011-live-consent-orchestration.md
**Fix cycle:** 1
**Task:** T-011 (full bot remains open)
**Priority tier:** 3 — assigned remaining roadmap task under D-170.
**Authorization:** root exclusive record-consent, bot-privacy API and privacy UI subtrees; own QA. Shared recorder/finalizer/composition remain separately leased.
**Packet:** qa/packets/t011-live-consent-orchestration.md

## Behavior

Actual operational authority, actor and organizer facts remain distinct. Actual receipt.generation is inherited controller UUID or standalone UUID persisted once; it is immutable provenance, never permission or timing proof. Historical missing generation is preserved and never gains private exemptions/provider access. Before join, owner/meeting-bound consent is privately persisted/fsynced; D-008 alternatives warning remains soft. Actual producer media clock anchors exclusion; missing clock makes accepted privacy conservative. Private-start ACK follows persisted open sentinel; persistence failure prevents later ACKs. Exact accepted operation replays cannot reopen closed windows.

Actual child sealed IPC readiness and private durable host descriptors connect detached workers to fresh/restarted API. Requests/responses have domain-separated HMAC proofs; secrets never enter HTTP/public status. Hostname/loopback confinement supports explicitly configured same-host directory only. API auth scopes and actual worker owner/generation remain authoritative. UI waits for acceptance and refreshed worker state.

Known private windows require proved masked video and sanitized audio before provider dispatch. Owner/receipt/audio SHA256/public complements are validated before calls; post-transcript filtering is an additional safeguard.

## Evidence and gates

- Original cycle-0 helper broker batch timed out at 120011.7972ms after consent8 green and known-clock transport's internal60s timeout. Raw receipt/stdout/stderr remain at qa/evidence/goal-t051checker-broker-t011-helpers.*; pins unchanged during that execution. No complete helper count/PASS.
- Actual API broker scope4/4 EXIT0 in1.090s with unchanged pins, qa/evidence/goal-t051checker-broker-t011-api.*. This evidence remains valid for its unchanged API scope.
- Cycle1 transport diagnostic changes are confined to controller-bridge.test.ts: nonsecret per-step timings; forged-HMAC fetch12s deadline; owned-child cancellation and bounded bridge/disconnect/termination cleanup. No native ACL/HMAC/durability/clock assertion weakened. The original output cannot identify the stalled step; source confirms unbounded fixture request/cleanup. Sole broker requested real native ACL probe and only known-clock transport case before any broader rerun.
- Separate actual central API compiler qa/goal-2026-10-14/api-types-current-freeze.json reported context.ts73 TS2532 for flag parser indices[0]. Cycle1 also narrows that optional index with an explicit undefined guard; generation/authority/historical behavior unchanged. Compiler rerun pending central broker.
- Focused native-acl EXIT1 0.931s and known-clock-diagnostic EXIT1 6.705s preserve real failures in qa/evidence/goal-t051checker-broker-t011-{native-acl,known-clock-diagnostic,native-script-diagnostic}.*. Raw script fails Get-Acl module load in450ms; this supplies no ACL safety proof. Known-clock publishes at18ms, fails native/readiness stage at944ms, then child-close cleanup misses its deadline. Added own exit/close diagnostics and original-error-preserving cleanup aggregation. Broker requested unchanged script with child-only trusted WinPS module directory; production verifier unchanged pending genuine experiment. No host/global module path, ExecutionPolicy or ACL mutations.
- Genuine unchanged-script child-native modulepath experiment EXIT0 1.253s emitted actual ACL JSON; actual source proof EXIT1 1.152s correctly refused unsafe Temp unrelated Allow identity. qa/evidence/goal-t051checker-broker-t011-native-modulepath-{experiment,proof}.* preserves both. Both equivalent readonly verifiers now isolate child's native Modules path; no global environment/policy changes, and semantic ACL allowlist is unchanged. Actual positive configured live-host root remains a gate.
- Root separately authorized NEW UUID-only protected fixture under qa/evidence/native-acl-fixtures for positive native/IPC test evidence. New native-acl-fixture.ps1 applies current SID/SYSTEM/Admin DACL at creation only, never changes existing directory ACL; cleanup validates confined UUID/marker/current owner/no redirects. Bridge test uses explicit broker LKB_PRIVATE_ACL_PROBE_DIR for exclusive nested fixture; unsafe ordinarytmp still refuses. Setup/native positive/negative/known-clock cleanup outputs pending sole broker. This test setup is not production/private-live-host acceptance.
- Genuine protected fixture evidence qa/evidence/goal-t051checker-broker-t011-protected-{setup,native-positive,unsafe-negative,known-clock,cleanup}.*: setup EXIT0 565ms; native3/3 EXIT0 1.210s; unsafe Temp exact unrelated-identity refusal EXIT1 1.295s; confined cleanup EXIT0 886ms; no children. Known-clock FAIL30.692s: every protocol/native/owner/generation/durable ACK/restart/HMAC/revoke assertion completes25.121s, child EXIT0 at25.137s, but aggregate close event never settles. Cleanup-only revision waits real exit then explicitly destroys/awaits owned stdout/stderr closure and asserts disconnected IPC; forced cleanup remains failure. Sole broker single-case replay pending, original failure preserved.
- Latest actual qa/evidence/goal-t051checker-broker-t011-protected-repaired-known-clock.json EXIT1 41416.4464ms, stable72118F3A: cleanup repair succeeds (childEXIT0, disconnected IPC/own pipes closed40.543s). New primary foreign-host oracle fails because fresh tenant-directory native ACL proof is unavailable at40.416s; earlier native/start/restarted durable state/end/HMAC assertions complete32.574s. No host-bypass or cleanup-regression claim. Paired checker agrees; contained fixture cleanup EXIT0/no children. Native error classification unavailable in that source version.
- Root-authorized diagnostic-only readonly verifier revision now adds sanitized internal cause stage/classification/code/monotonic elapsed/status/signal and fixed deadline5000. No raw output, target/SID/environment, permission/caching/timeout/oracle changes. Native fake failure regression checks deadline/module classification excludes sample secrets/path. Runtime finite source INPUT_FREEZE accepted these pins; next isolated protected known-clock diagnostic after types/build release only. No31 rerun, actual provider/browser/prod actions or production ACL changes.
- 31 helper tests authored, including three real Node cross-process fixtures; four actual authenticated loopback API and four UI tests authored. No maker test commands executed.
- T-034 hooks authored; central launcher methods, finalizer/API/page mounts and trusted source binding need final hashes/evidence. T-038/T-039 consume real publisher; old receipts do not check this candidate.
- No browser/provider/external message/service activation/database write executed.
- Ready-for-check for NON-LIVE criteria only (cycle 1, lane w16-t011clock, base a9fac545). Own-candidate pin table below is the pre-lane baseline; three files changed in this lane (see Cycle-1 closeout).
- Parent HOLD: connected candidate, actual host/profile/media, live controls/ACK, unattended overlap/recovery and cited ingest/Ask. Helpers/synthetic fixtures cannot close T-011.
- Frozen verifier/adopted baseline checks remain centrally scheduled.

## Security flags

Auth/tenancy: verified API tenant/scope, inherited IPC owner/token/generation, receipt/descriptor binding. Writes: private receipts/locator and masked/filtered artifacts. Credentials: URL SHA256 only; control secrets stay private. Actual bounded read-only native Get-Acl/current SID verifies configured existing private root, tenant directory and descriptor allowlist/identity/inode pin before capability use; no ACL mutations. POSIX modes alone are not Windows proof. Remote/container control unavailable without separately authorized trusted host bridge/shared mount; localhost inside Docker unsupported.

## Own candidate pins

No base existed for these 31 source/test/fixture/ACL files. A change requires fresh pins and affected checks.

| File | Base | SHA256 |
| --- | --- | --- |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/host-connector.ts` | no base; new file | `278547181750479CC79554C197DD59BFF5303D9F07D6B75250AE57A8EC0F8E7A` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/private-acl.ps1` | no base; new file | `47047E4D914122A3ADA2313C457D13AE60F283333122B162E9E092F9BE4894DD` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/private-acl.ts` | no base; new file | `DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/router.test.ts` | no base; new file | `F2D5C521CF3E8C42D38ECDFEFA8BB8834D10A836ECE80379F81D1277FF7733E7` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/router.ts` | no base; new file | `EB084E4A843A4D7B1C32E107FE079324EB64AE8F08ECE0597752D78F732AD4B5` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/api/src/bot-privacy/types.ts` | no base; new file | `766C477BE471A39269C69C4B235A6B971174810EFA683CD64E6480D62C761314` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/web/src/pages/meeting-bot/privacy/api.ts` | no base; new file | `AA16515817DF8B3DB40FA6F20D79D619DDA9FC72704DE2BE9E0171EB7495CB8D` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/web/src/pages/meeting-bot/privacy/BotPrivacyControls.test.tsx` | no base; new file | `6BF2469A22720530C2F9942905A0E6B53877E1465CEC424CDB4AB2D5B374A33D` |
| `C:/Users/product/Desktop/KnowledgeBase/apps/web/src/pages/meeting-bot/privacy/BotPrivacyControls.tsx` | no base; new file | `8DF662F9C528532AF377E715C438F516D0D083E575EAE016A8C9E7BD389157E8` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/context.test.ts` | no base; new file | `9E524A4EEBADB6AD97391C60D876187C2744491AE0E70C8DCF6C82E751799184` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/context.ts` | no base; new file | `19B232DC6163FF8FA54215313DAB0A003579058470A9271AF0B1851FC12D954C` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/controller-bridge.test.ts` | no base; new file | `72118F3A47B3EE843C55D935A6867CEE2F667F168EB29DE73CFF9E5948512BF4` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/controller-bridge.ts` | no base; new file | `13DB1698E41B556A378896981CC642E4C28B8B5D29217C3EA890F9DEADE6F8AD` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/controller-client.ts` | no base; new file | `A7E4F744DE243177176851D2DF6732E1F147F31AA3CD4531BF383F285B320D60` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/controller-worker.fixture.ts` | no base; new file | `C47CEC2BC29CBADEC93BFE42107AEB24BEEF2780F6F03AD485E4FD33FDECF965` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/coverage.test.ts` | no base; new file | `A1B923F1ACC027F18A1FAE9486FEE44A19DF3A67EE47219D0B7676E4417891AF` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/coverage.ts` | no base; new file | `F26A0F5F9F65F5AAD39D1D29CBF1A86D5D72B3CF033F155CBE460C1C57AAF99E` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/downstream.test.ts` | no base; new file | `FD4C492DCF7718D2A707F900CE80327FC858201F8F95C866393A9B7D8B2D2DCC` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/downstream.ts` | no base; new file | `4AF59D15B0B2624281B6F27F0C35D9CF3BC89994954034C59A3C2C01C63EC230` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/finalizer-input.test.ts` | no base; new file | `76D4462932C18CB0CB4F185A656AEACB64354C02FFBC391903621CB79A3424CF` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/finalizer-input.ts` | no base; new file | `933F943B04176BCB6047FC6044C77459D6291D94659AFB620DD07A30DEE3BECB` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/privacy.test.ts` | no base; new file | `A2F1AAA0F74614978063BD9A7F17D785299FDB8A896AA5BB90259CB9860B8A74` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/privacy.ts` | no base; new file | `D1BE5DF066B561BA2096491FB31780E2C1FDB9EC307D95D95F49A81E3D9594D2` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/private-acl.ps1` | no base; new file | `47047E4D914122A3ADA2313C457D13AE60F283333122B162E9E092F9BE4894DD` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/private-acl.test.ts` | no base; new file | `F95FB0A7EAD72ADC91F57F436968F1AD8029AFE97CA0405089615F5D733FFEA5` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/private-acl.ts` | no base; new file | `DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/native-acl-fixture.ps1` | no base; new file | `667560A2805AF9E70C391D362E29306A98DA20CB6A2CBB6F9AF71048D152914B` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/provider-input.test.ts` | no base; new file | `6472D427C31F54A31A45B2B791664EBBAF1DAF49E00F3E240F081B2D4FCA97F4` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/provider-input.ts` | no base; new file | `2AAEE99D57EAD94FA1C5D2820FFD4C7E06814C6AA60970B40BEE7C3D2A4A379A` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/receipt-store.ts` | no base; new file | `9F07A805EF13895E72F3392071191E00759E2C58AA0A397AA709A16E832EFD4C` |
| `C:/Users/product/Desktop/KnowledgeBase/packages/meeting-bot/src/capture/record-consent/runtime.ts` | no base; new file | `140E6A16501A6F5CDDB785241B8C902B8A4C661ED5EDF9C7DBF2962ECF9E093F` |

## Cycle-1 closeout (lane w16-t011clock, base a9fac545)

Changed: controller-bridge.test.ts, controller-worker.fixture.ts, privacy.ts (all under packages/meeting-bot/src/capture/record-consent/).
- Cleanup defect (genuine): worker privacy.ts ack sends used try/catch around process.send; an asynchronous EPIPE after the parent disconnected became an unhandled process error, so the worker exited 1 (reproduced run1 stderr, privacy.ts:55) and cleanup then missed its deadline. Fixed with deliver() that passes a no-op send callback; receipt still governs exclusion, no ACK semantics changed.
- Test fixture now sends a test-only t011-fixture-ready beacon and the test waits for it (45s deadline) before publishing, because cold tsx start under shared CPU took 4-15s versus the publisher 5s status window.
- Result: 15/15 runs close deterministically (child exit code=0, no forced termination, no missed cleanup deadline, no cancelled). Evidence: ../w16-t011clock-logs/loop-1..15.txt (outside repo).
- OPEN: 0/15 full passes. Every run fails at native ACL verification: private-acl.ts fixed 5000ms powershell deadline (cause stage native-acl-process, ETIMEDOUT, elapsed 5.3-6.0s) while the host CPU was 100% and a bare powershell.exe -Command 1 took 8s. Environmental; production deadline NOT changed (policy/security constant). Checker must rerun the known-clock case on a quiet host with LKB_PRIVATE_ACL_PROBE_DIR set to a fixture from native-acl-fixture.ps1 Create.
- Other checks: privacy.test.ts 10/10, coverage.test.ts 1/1. No browser/provider/meeting. Typecheck not run (CPU).
