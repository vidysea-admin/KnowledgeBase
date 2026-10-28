# goal-t038 checker packet — cycle 0

Repository: `C:/Users/product/Desktop/KnowledgeBase`. Contract: `qa/contracts/goal-t038.md` C1–C7. Manifest: `qa/manifests/goal-t038.md`. Verdict ownership: `/root/docker_dependency_review/checker_t038` only. Required full-parent evidence is absent as explicitly recorded below.

## Change map and immediate consumers

- `runPipelineTick(deps,run,{watch,signal})` owns the canonical durable state, token lock, source reconciliation queue, actual host/work DB/tenant gates and controlled child callbacks. Autonomous watch validates fixed capture slots and current controls. Existing `runPipelineWatch` and Windows/Ubuntu supervisor entrypoints consume the same runner.
- `selectAutoRecordItems(input,{parallel:true})` changes overlap resolution only; eligibility, rejection, cancellation and canonical meeting dedup remain unchanged. Omitted options preserves existing one-off behavior. The service uses it after reconciled T-036 feeds, then calls T-037 rules.
- `scheduler/service.mjs` holds bounded independent slots through capture/processing, runs recurring five-minute cycles without awaiting children, retries truthful discovery failures, and drains on shutdown.
- `scheduler/dispatch.mjs` persists queued/recording/capacity outcomes; applies verified rules before launches, prioritizes career content, recovers confined artifacts with bounded attempts and requires actual matching index proof. T-034 receives `--capture-slot` and explicit tenant. T-050 fresh graph capture returns only a confined actual artifact and stores/reuses the source fingerprint.
- `scheduler/watch-output.mjs` projects only finite public fields, including the T-052 finite registration reason vocabulary. Durable private state remains intact.
- `scheduler/privacy-lifecycle.mjs` retains actual-controller publication until child exit, then awaits disposal even after late publication. Explicit configured publication failure stops the owned child and prevents ready; errors expose no private locator/token detail. T-011's actual bridge and sealed child privacy/status methods remain central-owned dependencies.

Factory consumer `scripts/webinar/run-pipeline-deps.mjs` is central-owned. Required additions are `captureSlots`, actual `validateCaptureSlots`, `applyJoinRules(selection,{readOnly,now})` using verified equal API/configured tenant and raw/webinars rule store, and existing autojoin topic/alerts/tag integrations. No missing readiness proof is synthesized. T-052 registration and reconciliation share the acquisition queue; its maker is repairing stale async operation-state rebasing independently.

Additional exact factory callbacks consumed now: `captureSlotSupports(slot,item):boolean`, `validateCaptureSlot(slot,item):Promise<void>` and `refreshSchedulerPolicy():Promise<boolean>`. The first two bind accepted observed capabilities to the actual meeting platform derived from `item.meetingUrl` (AutoRecordItem has no platform field). Refresh must return exactly true before acquisition/registration and again before capture preparation; it reloads persisted controls/topic/capabilities. `publishCaptureControl({tenantId,sessionId,control})` returns an async disposer, or undefined only without explicit control-directory configuration. It adapts the actual T-011 bridge; configured failure persists a non-retriable `action_required/privacy-controller-unavailable` and stops only the actual owned controller.

Delegated `scheduler/deps-runtime.mjs` implements `createSchedulerRuntime(root,env,log,verifiedTenant)`, now imported/spread by the central factory. It uses actual autojoin config/topic/channel wiring, exact T-037 enforcement, T-034 physical workspace/readiness/privately reviewed acceptance APIs, and T-011 private bridge. Capability lookup uses finalize selection to avoid invalidating occupied slots; actual capture validation uses record selection. Autojoin reference stays stable across factory spread/reloads. Tags follow actual configured global recording root while rules/alert state remains canonical raw/webinars. T-034 now calls the fresh verifiedTenant callback at predicate entry/exit; the factory clears verification before each HTTP check, and actual controlled child privacy/status methods are wired. These late dependencies remain untested; actual accepted samples and host media are absent.

`capture-stop.mjs` persists and invokes only the already-owned generation-bound controller. Active API-owner failure is distinguished from ordinary feed outage and leaves coverage action-required. `lifecycle-alerts.mjs` derives bounded finite snapshots from actual artifact-start/discovery/durable operation producers, retains staging classification and flushes real durable retries independently of the old scheduled-job watcher. It bounds queued events at 50 and row visits at 25 per cycle, excludes foreign rows and uses fixed detail reasons. The checker found silent queue overflow could erase a transient start event. Now up to eight sanitized snapshots per operation/feed are saved before enqueue, overflow is reported, and replay is independent of current status/lookback. Discovery acquisition preserves pending snapshots before its initial save; failed/rate-limited/unavailable sink results retain them. The runtime serializes lifecycle/rules/flush writes against the same actual sink with current controls. Under explicit additional source lease, actual sink vocabulary/mappings include coverage-deferred and discovery-recovered under the existing ordinary ceiling, discovery-degraded under the existing failure ceiling/hourly digest. No recipient changes. Central API/UI vocabulary and labels are now mapped. The actual sink tests inject transport only; no delivery or visible UI evidence is claimed.

## Focused evidence scope

The new focused tests are fixture-only: capacity validation, truly overlapping pending promises, independent failure/release, deadline accounting, feed outage retry, safe abort, legacy/parallel eligibility, cancellation/dedup, durable bounded capacity with career priority, no-launch rule vetoes and refusal of unenforced/unproved automatic activation. Synthetic time and index fixtures are explicitly not C3/C4/C6 real evidence.

Exact command pending root CPU lease:

`node --test --test-concurrency=1 scripts/webinar/scheduler/service.test.mjs scripts/webinar/scheduler/selection.test.mjs scripts/webinar/scheduler/pipeline.test.mjs scripts/webinar/scheduler/dispatch.test.mjs scripts/webinar/scheduler/tags-consumer.test.mjs scripts/webinar/scheduler/privacy-lifecycle.test.mjs scripts/webinar/scheduler/deps-runtime.test.mjs scripts/webinar/scheduler/capture-stop.test.mjs scripts/webinar/scheduler/lifecycle-alerts.test.mjs scripts/webinar/scheduler/alert-kinds.test.mjs scripts/webinar/scheduler/index-proof-chain.test.mjs`

No test was attempted without the lease. No mutation, browser, network, host activation or real alert was performed. No linked filed issue is claimed fixed; this is the explicitly authorized feature task. Required `contracts/verify_contracts.py`, affected-stage and immediate downstream evidence remain pending. Existing legacy fixtures may require central T-052 amendments without changing their assertions.

## Contract mapping and missing evidence

C1: canonical autonomous cycles and durable dispatch implemented, actual deployment not verified. C2: safety/rules/priority/staging seams implemented, factory and accepted connected dependency behavior pending. C3: bounded parallel code/fixtures supplied; actual separate simultaneous media is absent. C4: actual media/downstream/email/dashboard proof absent. C5: existing actual proof gate retained; independent Ubuntu host and real interruption/recovery absent. C6: seven actual days absent. C7: packet and manifest prepared; command evidence, final hashes and independent verdict pending.

The checker must directly review complete source/diff, validate unchanged final hashes and report actual full-parent HOLD or FAIL where warranted. Source-only or fixture success cannot become full-parent PASS.

## Candidate working-file SHA256 (before focused checks)

| Path | SHA256 |
| --- | --- |
| scripts/webinar/run-pipeline.mjs | 0D3687D8453BA0C4FCD903624E9E1C4411B1D4FA8749BFE7D3C79EA91A50E7EF |
| packages/meeting-bot/src/calendar/auto-join.ts | AFAE8BFA9C7501EE6C86517122D87C3C72142C5DBF546454BF7DD2F1611D9C89 |
| scripts/webinar/scheduler/service.mjs | 6AA0BF1A4B037CAE61E0C6C7A9A0EDCA4C8692D30D2997C334B3A41EE19F3797 |
| scripts/webinar/scheduler/dispatch.mjs | A56750C2BBE76E34927D36A2E9847C20AC2280DA872D4CF715D0F1D78AD1F0BD |
| scripts/webinar/scheduler/watch-output.mjs | 9ADB18E61C54367CDF399928E18BF097F8AC854C470A1107472EC1072E3A210C |
| scripts/webinar/scheduler/service.test.mjs | CCCAEB35ACAEDF66B3B2A99761B18556F21F5E3EB745C7F5685F1DC607C31725 |
| scripts/webinar/scheduler/selection.test.mjs | 649C1009B0AE587D98532CF5B31804EE24FBB9856DCE531D5060BCB08D39E338 |
| scripts/webinar/scheduler/pipeline.test.mjs | 3B565BB2F805F4C7E1A554D9ABF5366421031547DBDFE2EC845AF4E85CE7F07C |
| scripts/webinar/scheduler/dispatch.test.mjs | 6C14DA63B9DEE177F91778F62555F91E1E142A092958A3DF0BA2798138D2B40F |
| scripts/webinar/scheduler/tags-consumer.test.mjs | 5EB852A32D77039370D6BFF969CC639761B4DCB56D31791AC94C3302504DFE88 |
| scripts/webinar/scheduler/privacy-lifecycle.mjs | 2A36173B30F40F4BB50D44C0BEAA035B08F871FC3AA41DCEDA5A75D553B9627C |
| scripts/webinar/scheduler/privacy-lifecycle.test.mjs | 342F673C91DA7DC398AE582ACCA2F38E5A8B20838DB971F862BC54003F137506 |
| scripts/webinar/scheduler/deps-runtime.mjs | 7D1ECB5FEC35717D68B2FD1491909EF4EB8945B1FFC69A2BAEF875E369B8B4B8 |
| scripts/webinar/scheduler/deps-runtime.test.mjs | DE0E08823674FBE3C84E3C03DE34356C907EF2EFBD88F29B02664DFF95043CA0 |
| scripts/webinar/scheduler/capture-stop.mjs | 83440379846CB046D374AA285372DE515C8349ADBA395865928569D860AFF736 |
| scripts/webinar/scheduler/capture-stop.test.mjs | 68B00EF42BBF11511778CFA10B20BA687B0CD9F307911C6354112EEA5003C145 |
| scripts/webinar/scheduler/lifecycle-alerts.mjs | 31309DBA926806A9AB4290641E64F2127DD1C68C8DB440664F8D2AB9D535FEF4 |
| scripts/webinar/scheduler/lifecycle-alerts.test.mjs | 4FAFCCD7618FE0C3124FA2EF5AF89747CE0A8D3DBA234F5AE1FB92E13780A9DE |
| packages/meeting-bot/src/autojoin/bot-events.ts | D04BAB556DDFEC6959BAB85C06E1D0E997DF535987D713785AB2BF1240B4141D |
| packages/meeting-bot/src/autojoin/alerts.ts | 753D7E3EA9A5C02BB430F044EA65AEF641FE694C16372B8EBE67BAEEEFCE8C8F |
| scripts/webinar/scheduler/alert-kinds.test.mjs | 9CA882AAB3723B0F04F65B5F7EC59885F5F1E808662E519262E64B507EE57A47 |
| scripts/webinar/scheduler/index-proof-chain.test.mjs | 5AA521860A8D3E9BE67C689B39798A5D9A8F9D7F6E4123A4B1C56ED0E05D2DD4 |

Read-only whitespace check: `git diff --check -- scripts/webinar/run-pipeline.mjs packages/meeting-bot/src/calendar/auto-join.ts`, exit 0, no diagnostic output (combined hash/check command elapsed 0.899 seconds). This is not behavior verification.

Read-only checker feedback before submission identified shutdown admission after awaits and ambiguous default-workspace recovery. The candidate now checks shutdown after acquisition, registration, rule and preparation/ownership awaits and immediately before a deferred child launch. A rejected deferred launch retains queued work with its prior attempt count. Autonomous partial recovery requires an explicitly persisted configured slot; default-workspace legacy partial rows are visible `action_required/capture-slot-unavailable` migration gates. Actual configured slot identity is passed to recovery and graph consumers. Added phase-table/microtask shutdown, legacy gate and owned-slot recovery regressions. No filed issue ID is claimed fixed.

The asserted slot-tag reader mismatch was withdrawn after the checker read the complete current finalizer: it uses the separate global tag root. The producer→actual selected-slot finalizer→staging resolver regression supplies its actual fixture consent receipt and selected recordDir required by current T-011 routing. Media probe/audio extraction are explicitly synthetic, not live usable-media evidence. The focused command covers forty-six tests, including real file-codec outbox saturation/restart and actual producer→sink→host reader→API projection. It remains held through the sole CPU broker pending current dependency/source pins; none has run yet.

Root's finite v3 completion exception now calls actual validateIndexProof(dir,id,env.MONGO_WORK_DB), confines its validated selected artifact, requires matching marker/proof versions in {2,3}, preserves tenant/session/input/generation gates and additionally matches sourceId/sourceHash/workDb/inputArtifact for v3. One bounded test uses actual validator/consumer and fixture files for eleven positive/negative chain cases. T-043 validator maker ACKed its frozen third-string interface. No blind v3 allowlist or source/proof bypass is introduced. All other source/tests remain frozen; no CPU was used by this maker.

## Atomic producer correction (2026-10-15, not executed)

Root granted exactly three source/test files to close the separate transition-before-snapshot crash window. The canonical operation/artifact and discovery acquisition now save state plus event together before enqueue. The original 51-event overflow floor remains unchanged; one new first-write-crash/restart test has four fixture cases. Full authored scope is now 47 tests. Sole CPU broker is /root/docker_governance_review; prior references to 46 tests or /root/docker_checker describe the earlier unexecuted request. The separate maker packet qa/packets/t038-atomic-lifecycle-outbox.md supplies final hashes and scoped evidence status. All source/tests are frozen, no maker test ran, and full-parent HOLD remains.

## Attributed current lifecycle receipt (2026-10-15)

Broker terminal eleven focused lifecycle/actual sink/tenant reader/API fixture tests PASS; exit 0; 6605 ms; zero drift across 47 pins. Receipt qa/evidence/goal-t038-lifecycle-current-20261015T013043Z.receipt.json SHA256 E94E8C40F1F4574524827773D776898E081322D3EF24126B332C6A02D77E46EE. It does not execute/pin the canonical runner. Independent current-file hashes match runner0D368/helper31309/test4FAF; next meaningful runner regressions requested without repeating the eleven green tests. 36 authored cases remain unexecuted; prior all-unexecuted statements above are historical. Scoped atomic manifest is ready-for-check. Full-parent HOLD remains.

## Current immediate consumer/dependency observations (not frozen verification)

The API now accepts all three canonical kinds and the actual BotActivity component labels them; discovery degradation is an operational alert. Host `createBotEventsDeps({stateDir})` uses the actual tenant-filtered readBotEvents against the canonical raw/webinars feed, then projectBotEvent applies the API allowlist. The authored connected fixture exercises that exact producer/sink/host/API path. Actual rendered UI, real gws delivery, live media/host and seven-day acceptance remain gates. T-037 approve-once promotion is not inferred from aliases or the veto-only legacy evaluator.

| Dependency | SHA256 observed |
| --- | --- |
| scripts/webinar/run-pipeline-deps.mjs | 603D193DBDDE031621BC721AD8C2DED15C1BD9E825DE349FFEE09E2DC3D7036B |
| packages/meeting-bot/src/capture/reconnect-gaps.ts | A66449F9DE1110FC848967B160D31BDD907364809508C63716666D1DA6B7776A |
| packages/meeting-bot/src/capture/record-finalize.ts | 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8 |
| packages/meeting-bot/src/workspace/index-proof-consumer.ts | 1568F08EC400844F885DEFD9DB05D4B3B054A865BBB12911A2ECC7525B4B7E4A |
| packages/meeting-bot/src/capture/record-commands.ts | 83283B1CAB59D738F0DAAE5E5CCD76AE29DE3B6E21E2E9CF69394A701BD18552 |
| packages/meeting-bot/src/capture/record-consent/controller-bridge.ts | 13DB1698E41B556A378896981CC642E4C28B8B5D29217C3EA890F9DEADE6F8AD |
| packages/meeting-bot/src/capture/record-consent/controller-client.ts | A7E4F744DE243177176851D2DF6732E1F147F31AA3CD4531BF383F285B320D60 |
| packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts | 0A18BA7A1C8772909D36B32C413F6C2CA8A133A84F819A7338DCAE7BD09EE3D2 |
| packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts | 89B3D1F255EBCF895EAC6FCE5E0BD004C323A119C351D6B9106DF31B511D1DFE |
| apps/api/src/bot-events/router.ts | 4EEB3E6601367C7F3CCC3F8766404E62FEB35C5581FBB01B6D9119D2CD3D8978 |
| apps/web/src/pages/meeting-bot/BotActivity.tsx | BF48204845194B01B159B57E587BF95A2553B6D29386FBAE47A1D434F1669303 |
