# T037 scheduled dispatch policy — cycle 0 current packet

Root C:/Users/product/Desktop/KnowledgeBase. Maker skills/maker/SKILL.md; canonical checker C:/Users/product/.agents/skills/checker/SKILL.md explicitly read. Manifest qa/manifests/t037-scheduled-dispatch-policy.md,in_progress/cycle0. Checker owns contracts/verdict; root owns fresh-context reviewer dispatch after required assessment. Ground truth qa/contracts/goal-t037.md C3(optout),C5(tenant/security),C6(lastvalid),C8(dispatch consumer),C9(evidence). No maker contract edits.

## Candidate and exact behavior

BaseGit5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; maker8pin candidateF226E3B85C5407BBA9CE00D108BB9BF53C27CEBF68B90252B4147E26277222F8 is ordered SHA256,notGitcommit. Eight source/test/consumer pins qa/evidence/t037-scheduled-dispatch-policy-pins.json freshlymatchcurrent. New scheduled-dispatch.ts/test have no base; existing paths preserve prior working-tree edits. Source and scoped actual diff remain authoritative.

- schedule-tick.ts persists dispatchPolicyV1 directly from the selected AutoRecordItem. state/schedule-dedup-state.ts adds its transport type/optionalfield; optional only permits legacy reading, dispatcher refuses missing identity.
- NEW calendar/scheduled-dispatch.ts validates closed Calendar/Gmail source/sourceId<=1024,sessionKey<=196,IDs without whitespace/control,canonical sender<=256,HTTPSURL<=2048 withoutcredentials,realISOstart/end. Checks jobfile regular/non-symlink<=16KiB; runtime tenant equals authenticated keytenant; existing readScheduledJob validates outer savedtag. Bind policy session/url/end/optionalstart to capture fields and deriveJobKey. Validate futureend and existing planSendNow meetingidentity.
- Reuse existing enforceJoinRules singleton readOnly:true,current primary/last-valid semantics. NEWautomatic path only accepts last-valid/fail-closed per explicitroot; off/fail-open/unset refuse automatic_dispatch_rule_mode_unsupported. Globalparser/liveconfig unchanged. No primary/cache refresh,repair/delete or invented aliases. Legacyunidentified jobs require explicitrescheduling.
- Central-owned cli.ts72C7BC4D22CCCB6B0DFF17959E9F63524411C03C4B49B9B8A60E3BB0ED575B7D wires record-scheduled to runScheduledDispatch(rest:string[],deps?:ScheduledDispatchDeps):Promise<void>. Defaults load.env from module-root,existing authenticated keytenant loader,then claimedRecordWithDefaults(args,runRecord). Manualdirect record unchanged. Existing duplicateclaim behavior inherited,not strengthened; currentrule check does not promise instantaneous revocation after gate/capture.
- scripts/webinar/start-record-detached.ps1 -Job passes only checked record-scheduled key and rejects URL/time/title/session/extra/end-bound/replacementCLI overrides. Direct -Url argvquoting/liveness branch remains. Native launcher/test within lease; core/globalschema/enforcement untouched.

## Actual evidence and identities

All commands broker-owned at root with Node C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe,v24.19.0. Common Nodeflags --test --test-concurrency=1 --test-timeout=30000 --import tsx.

| Actual command suffix | Receipt under qa/goal-vectorless-2026-10-15/ | Result |
|---|---|---|
| packages/meeting-bot/src/calendar/scheduled-dispatch.test.ts | verification-t037-valid-fixture-seven.json | exit0,7/7,1499.5899ms,114capturedpinsstable |
| packages/meeting-bot/src/calendar/schedule-tick-rules-integration.test.ts | verification-t037-current-neighbour-four.json | exit0,4/4,543.8777ms,116capturedpinsstable |

Same-stem stdout/spec retained. Fourreceipt SHAFC9E53E921080A633A22A8FA37408D9566C0DCAA28FCAD651F8CDF140062375E. Full executable,environment,lock,importroot,command,timing and actual before/after maps reside in immutable receipts. Seven fullclosurecandidate def6e362392fa06c558b8aa9d1b9e9e0e999e37ee4d6f79dd9502c51af320d7e; four32dbdbee59469798152f8fc1064b9c61c8af7d2a406d6b6619033d5684809939 are receipt-pin identities,distinct from maker8pins and notGitcommits.

Explicit maker source-composite qa/evidence/t037-source-composite.json SHA280C3B0BFCF6AAB47522033F4542F9EB77726EBE6E4278D5192C259E70A73C97: two actual exit0commands7+4,not fabricated single-process11exit. Shared captured input hashesunchanged; executable/environment/lock match. Importroot slashspellings normalize to sameWindows path. Fourcurrentclosure adds core/domain/lean-video.ts and resolved obs-websocket-js/dist/msgpack.cjs. These current supplemental hashes were NOT in earlier7before/after captures; no retroactive historical-byte proof or exact-complete-runtime reuse identity claimed. Broker scoped closure reconciliation requested; current union pins recorded with limitation.

Seven cover positive bound captureargv,source/session/meeting optout,email/domain deny afterscheduling,actual evaluator reached for eachpolicynegative,missing/wrong keytenant,unsupportedmodes,malformed/legacy/mismatched identity,expiry/future/corrupt/foreign snapshots,read-only bytes/mtime,retryafteroptout and actualtick->savedidentity->deny consumer. Four freshly cover existing rule/snapshot/outage consumer behavior; no reuse of oldfailedbatch needed.

## Preserved failure and issue floors

Immutable verification-t037-dispatch-eleven.json is exit1,9/11,2773.241ms,not relabeledPASS. Originalfake Zoho /meeting/123 lacked canonical key/sessionid; existing guard properly rejected positives beforepolicy. Fixed only fixture URLs to knownsupported /join?key=123; added actual canonical evaluateJoinRules call assertions so earlierrefusal cannot mask tested deny/optout. Producthelper998BC21F690AD40B7874F2FE916B795B6B328E138CA817D806F20870787E2A19 unchanged. Exact beforefixtures qa/evidence/t037-scheduled-dispatch-before-url.fixture.txt SHA2630F5DB... and t037-native-before-url.fixture.txt SHAD69F58FE... preserved. Current Node8C35278F... and nativeD30C5ABE... pins in8pinfile.

Existing ISS-ALERTTENANT-001 qa/issues.alerttenant.jsonl describes two scenarios,no literalcommand: missing and foreign savedtag. Both actualreader cases executedgreen2/2 in new7. NativePowerShell confirmation0/2: NOT YET EXECUTED. Inputs unchanged except validcanonicalURL necessary to isolate tagguard. No issueclosure or parentPASS claimed.

## Remaining mandatory checks and limits

Latest root narrowed native broker request to exact2 issue cases only: `node --test --test-concurrency=1 --test-timeout=120000 --test-name-pattern="^ISS-ALERTTENANT-001:" scripts/webinar/start-record-detached.test.mjs`, outer150s. One selected named node contains missing/foreign tag cases; no Node7/4 or other native/suite repeats. Nativefixture copies actualPS under exclusively owned repo.cache root and fixtureCLI calls actual checked TSmodule with injectedkeytenant/rules/capturemarker; no.env/defaultAPI/capture. Missing/foreigntag must fixedrefuse,preservejob and emitnocapturemarker; Override/manualpositive native cases remain authored but excluded from this exact root-narrowed request. This is injected bridge proof,not releasedhost/live acceptance.

Scoped meeting-bot typecheck and applicable contracts/verify_contracts.py evidence remain pending broker/current policy-permitted identity. No fullsuite/mutation/provider/browser/DB/livejoin/activation ran. Candidate stays in_progress/HOLD until nativefloor/type/evidence and independentreview complete. Fullparent remains HOLD for live/trust/registration/cross-source/series exception/degradation/downstream/Windows+Ubuntu/unattended acceptance.

## Actual usage and review gate

Metrics qa/evidence/t037-scheduled-dispatch-policy-maker-metrics.json: measured sourcephase476.7732772s and correctivephase101.1064316s QPC,wait0within those measuredwindows; initialreads unmeasured. Complete comparable makeractive,actual_total_tokens and actualcost remainnull. Sharedbroker suites retained separately; no hiddencost/paddeddenominator. Root says actual_total helper staged/notinstalled: no reviewerdispatch frommaker,legacy6000allocation never actualusage or verifiedratio. Root applies authorized installed assessment/actual_total workflow before fresh fork-none reviewer. Unknown remainsunknown.

## Native-floor request checkpoint and API attribution

Exact request qa/evidence/t037-native-tenant-floor-request.json sent solebroker: one selectedISS-ALERTTENANT-001 native node containing two original missing/foreign savedtag cases,outer150s. Nativefloor remains0/2until actualreceipt. Requires actual PowerShell/nativechildNode identities plus resolvedtsx/corelean/obsmsgpack and inheritedenvironment/lock fingerprints. No livehost/network/DB/provider effects, no7/4/suite repeats, no waiting bymaker.

qa/evidence/t037-api-repair-scoped-attribution.json identifies actual API diagnostic-repair type/build exit0 receipts15736.195ms/1857.4767ms. Authenticated current consumer bytes: apps/api/src/join-rules/router.ts,deps.ts,server.ts exactlymatch receiptpins. This is narrow APIconsumer compile context,not globalcurrentbuild proof. Broad allsourcepins also contain newhelper/CLI but no importmembership proof established: API tsconfig includes src/**/*.ts,buildentry src/index.ts; do NOT claim those broadpins alone prove standalone record-scheduled/helper compilation. No suite rerun requested. Engineering/checker readiness remainsHOLD pending exactnativefloor and authorized actual_total assessment; no reviewer dispatch.
