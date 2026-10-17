# Exact stage1 graph/compiler repair freeze

Validation contract: managed-review/1 maker fragment. Unit native-next-vertical-integration, fix cycle2.
Status: SOURCE-FROZEN; broker verification outstanding, not PASS.
Root C:/Users/product/Desktop/KnowledgeBase. Base d50a25c200dcbcf574ecade0aa205f5fcb45c5f8; shared dirty candidate, no commit/push.

Scope: exact root grant from native-next-stage1-checkpoint.md and native-next-dependency-cycles.log. Raw preimages in backups/, initial base-pins.json and extra-base-pins.json. Exact9 final source pins in source-pins.json. Root granted source worker entry and API capture-readiness typed host seam; no dependency policy/Core/schema/generated changes.

Changed source paths and reason

- apps/api/src/composition/integrations/hosting.ts: use existing neutral IntegrationRouting instead of reverse type import of buildRouting from production.ts. Removes hosting->production backedge used by two logged cycles, including server/routes/hosting cycle.
- apps/api/src/composition/integrations/source-jobs.ts: accept trusted BoundIndexer instead of importing production builder. apps/api/src/source-intake/jobs/entry.ts constructs the SAME buildIndexer(buildRouting(), strictWebinar:true, groundedNotes:true) and passes it. No provider/index fallback, execution or retry behavior rewritten. Removes source-jobs->production runtime cycle.
- apps/api/src/capture-readiness/host-connector.ts and types.ts: typed HostCaptureReadinessAdapter boundary. API retains authoritative hosting transaction, active key/scope, tenant, physical local-root and configured slot gates. Hostless ordinary API is explicitly unavailable. No API imports of meeting-bot workspace, readiness or acceptance modules remain.
- scripts/native-capture/server.ts: actual static host adapter implementation invokes the original selectTabCaptureWorkspace/readCaptureSlotObservation/publishCaptureSlotAcceptance/revokeCaptureSlotAcceptance under the same API gates. This explicit trusted root launcher injects it via production options. No module path supplied by environment, HTTP or source JSON; constructors remain filesystem-lazy.
- apps/api/src/composition/production.ts: optional typed captureReadinessHost injection; configured native root launcher supplies it. Standard API with no host remains honestly unavailable. Lightweight source count300 nonblank, actual broker parser required.
- scripts/native-capture/server.test.ts: root bootstrap fixture asserts actual host adapter injection; constructor-lazy fixture added. Existing capture-readiness/router.test.ts remains mandatory for real HostingService authorization/current key/tenant gates.
- packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts: replace invalid undefined AssertPredicate argument with valid Error shape matcher while retaining artifact-specific assertion message and rejection requirement.

All3 logged cycles and all3 forbidden host import edges have source fixes. This is a source claim only; no compiler/dependency checker has run after repair. Atomic owner independently fixes publication unknown narrowing/DB tuple fixture; no publication.ts edit or DTO import change here. No neutral Core module was needed and none created. DB directory relocation runs disjointly after overlap freeze; its adoption/pins are separate. No concurrent writes on its13paths by central.

Required immediate checks: existing combined request plus stage2 supplement at ../combined-broker-request-stage2.md. Recheck full API/DB/bot and six root scripts types, full configured graph, affected structure; only then original semantic/native/API-write floor. Include capture-readiness/router.test.ts, source-intake/jobs/jobs.test.ts, privacy.test.ts and scripts/native-capture/server.test.ts. No real DB/browser/provider/ACL/decoder/build/test execution by this maker. No outcome claimed from prior red/green receipts for changed bytes.

Accounting: token_metric actual_total; actual tokens/active time/cost unknown/null. Prior joined independent HOLD and conservative270s/360000 charges preserved. Actual host qualification, symlink privilege, private corpus and real Mongo replica-set/standalone operational gates remain open. No independent checker or PASS issued.
