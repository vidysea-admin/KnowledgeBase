# Check packet - goal-t060, cycle 2 (in progress)

Risk: authentication, tenant reads/writes, role grants, signing credentials, durable mutation and outbound delivery runtime. Full maker/checker ceremony; no seam cap for security.

## Current evidence-only submission

Cycle0 HOLD below is preserved history. Cycle1 resubmits the same66 unchanged source/caller/contract pins after actual required coherence became green; there are no source/test changes or duplicate behavior executions. Actual checkpoint `qa/goal-2026-10-14/ordinary-current-build-checkpoint-20261014T225425Z.json` SHA9901fc4b8ba492648072584796450e1c8ec3eedb87829e3e95b278750689ed68 certifies1939 inputfiles/0drift. Maker readback confirms its four receipt hashes and exit0/timedOutfalse: API types12325ms ea924c1c643ab2a119fd425586157cdba6998a93195e29f222055077c936ac8e; web types11000ms8d86e8aff8190748f9e4cdd0c369ea790f66ff53edbedc604fd714506633dc16; API build1718ms a7b46a3e65d50d5fb4ea39b699a625cd3e848a678b0b97d0a83de78f01edb9f1; web build16070ms87edab7b2841af78e70e58072a7cc693671cf1ccc96767ea055c0f6fb78a92a1. Checkpoint links exact receipt paths/Node/pnpm commands/raw output and actual server/source-worker/PS asset/web outputs. No external imports, native ACL, container or provider execution is asserted.

Current acceptance evidence combines original22 unchanged nonfactory cases, currentfactory3 and independent real mounted4, all exactly attributed below. Earlier pending/BUILDING/redgate prose describes historical submissions and is superseded by this current section. Full parent live-host/privateDB/public operations, global mutation audit and retention/deletion target gates remain HOLD; this request is scoped source/runtime acceptance only. Checker must independently establish all C1–C7 criteria within that named scope and matching cycle1 before any close-out.

## Changed logic and consumers

- types.ts: explicit principal, role/permission, journal/job/audit types; strict scalar ID/body field validation. Caller tenant/key identity is never accepted from request payload.
- policy.ts: explicit operator bootstrap owner or durable viewer/editor/admin binding; dedicated hosting scope plus webhooks/keys/operations upper bounds. Named permission matrix includes account/automation/operations consumers. Static destination rejects wrong scheme/origin/credential/query/fragment, private/reserved literal IPv4/IPv6; canonical expanded URL length is bounded before persistence.
- journal.ts: tenant SHA256 path, private owned directory and symlink/hardlink checks, exclusive writer.lock, checksum-chain replay. One fsynced record is both mutation and audit. Truncated/corrupt/unknown replay fails closed. Fsync error and incomplete account callback quarantine tenant; no unaudited successful response. Account after-callback occurs only after role commit, followed by a completion append. Abandoned process locks require operator recovery; no stale-lock threshold/automatic stealing.
- state.ts: strict replay of role, pending/completion, webhook registration/revocation, event queue, claim and result. Revoke increments generation and cancels undelivered jobs. Public audit excludes record data.
- service.ts: rechecks tenant key membership/current role under the journal lock; ineligible accounts fail closed. changeAccountRole before callback is read-only validation; after callback durably changes account metadata only after audited role append. Role pending target forbids regrant after crash. AES-GCM signing secret binds tenant/subscription AAD and returns plaintext only once at creation. Public list/audit/status excludes signing blob/body. Event identity is tenant-bound and conflicting replay is refused.
- transport.ts: bounded DNS resolution rejects any private result, connects the validated numeric address with original certificate/Host checks, TLS verification on, fixed POST, no redirects or body logging, bounded request. No resolve-then-fetch re-resolution.
- worker.ts: durable unique attempt/lease and generation fence, HMAC over exact timestamp/delivery ID/transmitted body, retry backoff, stable IDs, explicit remote ACK uncertainty. After DNS resolution a connect callback rechecks persisted generation/attempt/lease/current verified authority under lock and synchronously initializes the validated TLS request; it releases the lock while waiting for the response. Revocation aborts in-flight same-process work and persisted state fences other runtimes. A request initialized before revoke may already be on the wire; no remote unsend/exactly-once guarantee. Callable authenticated dispatch exists; mounted production receipt remains pending.
- router.ts: role/audit and webhook register/list/revoke/event/status/dispatch routes, auth principal exclusively req.auth tenant/keyId, strict body fields, clear unavailable503. Central mount must precede legacy 501 stub.
- config.ts: explicit absolute private state root, operator bootstrap JSON map, approved HTTPS origin JSON list and 32-byte encryption key; missing/invalid values make feature unavailable, never first-caller owner promotion. No secret value printed or persisted in docs.
- composition/integrations/hosting.ts: actual optional dependency factory binds tenant-pinned key membership, separate account journal/status provider before traffic, account-aware global auth plus incomplete-commit replay guard, audited key callbacks and operations schedules/passive approved adapters. Key creation cannot grant scopes the verified actor does not hold; bootstrap owner key revocation is operator-managed. No constructor journal/Mongo/provider write. No production operations Mongo write target is enabled by this source packet. After actual job/CLI source adoption, optional retention reader binds only explicit absolute LKB_RETENTION_DATA_ROOT to the same tenant-private root; no legacy/global fallback or readiness flag.
- journal/service/transport/worker/router/composition tests + test-kit: current25 authored role/foreign-ID/identity, persisted replay, fsync/corruption/abandoned lock/symlink, role-account/key partial crash, private DNS, actual transport socket pin, paused-DNS fresh-runtime and persisted-only revoke fence, signature/retry/ACK uncertainty, production factory key/account/retention consumers and HTTP probes. Original24/24 is retained for exact old bytes; its22 unchanged non-factory cases plus all3 supplemental current factory cases provide attributed maker coverage. No single25-case run is claimed; independent mounted proof remains pending.

## Central interfaces and execution prerequisites

HostingService.withPermission(principal, permission, callback) holds authoritative lock and membership/role checks while a consumer commits its own atomic data+audit transaction. changeAccountRole(principal,keyId,role,beforeReadOnly,afterMutation?) records pending role state then completion; no consumer may write in before callback. CounsellorAccountStore.identityStatus is attached with setAccountStatusProvider before traffic. Dedicated key scope is hosting; webhook methods also require webhooks. Automation scopes remain additional route checks in T-061, not a substitute role source.

Root policy ruling after rereading the authoritative T-028/T-060 contracts: inactive/deleted/revoked or pending-recovery identity is refused globally. Reactivation restores active profile eligibility and independently approved API scopes for the same verified tenant; covered hosting/account roles stay null until a fresh role grant. This does not introduce global role-based authorization for pre-existing scope-only consumers. The shared actual server/factory probe must distinguish inactive /search refusal, reactivated scope-only /search success, hosted/account refusal until fresh grant, revoked-key refusal and pending-commit fail-closed behavior. No checker execution is implied by authored cases.

Factory createConfiguredHostingDeps(env,{keyExists,accountStatus?}) returns {service,worker} or undefined. Exact environment names: LKB_HOSTING_STATE_DIR, LKB_HOSTING_BOOTSTRAP_ADMINS, LKB_HOSTING_WEBHOOK_ORIGINS, LKB_HOSTING_ENCRYPTION_KEY. No secret values. State parent must already exist and be operator-controlled/private; new final directory is private. Windows ACL/private exposure is an operator prerequisite, not an auto-verified deployment claim.

Owned source leases apps/api/src/hosting/** and apps/api/src/composition/integrations/hosting.ts. Central owner /root/docker_runtime owns VerifiedKey.keyId and createMongoApiKeyStore verified stored ID, ServerDeps and actual production mounts, KeysDeps verified actor plumbing and schema/migration/shared files. Exact separate account config: LKB_COUNSELLOR_STATE_DIR, absolute/private and distinct from hosting journal. Partial/invalid configured authority fails global authentication; absent authority cannot fall back to ungated key mutations. Final source-review receipt must pin actual server/production/auth/store/keys route and account/operations consumers after integration; missing/unmounted consumers require HOLD.

## Checks and limits

Original focused command is in the manifest and broker spec qa/evidence/goal-t060-maker-spec.json. Actual broker receipt qa/evidence/goal-t051checker-broker-t060-maker.json, stdout/stderr alongside; outer bound45 seconds, Node per-test30 seconds, test concurrency1. Start 2026-10-14T21:12:16.535Z, completion21:12:25.473Z, broker elapsed8922.4856ms; exitCode0, signal/error null. Node24/24, fail/cancelled/skipped/todo0, duration8770.7345ms. The broker executed, no inherited lease/selfstarted process. All45 before/after pins and then-current readback matched before the later factory/test changes. No broad suite/browser/production/provider execution; no mutation run. Ledger reproductions N/A: this is a new feature, no filed issue claimed fixed.

Later changed factory/test and adopted reader/writer dependencies are covered by actual supplemental qa/evidence/goal-t051checker-broker-t060-retention-factory.json/stdout/stderr, current52pin spec9dec55dbf95cbdd8e72290bc9f1879091586ad1dfc3eaa168f2c36c848243b47. Exact command `node --import tsx --test --test-timeout=30000 --test-concurrency=1 apps/api/src/hosting/composition.test.ts`, outer45000ms. Start21:43:00.486Z, completed21:43:02.691Z, elapsed2191.8519ms, exit0/signal-error null, all52before/after unchanged. Node3/3, fail/cancelled/skipped/todo0, duration2028.2071ms. This supersedes old factory coverage without a duplicate full24 run. The current broader API39/web5 compiler failures remain a required gate; no earlier green global checkpoint is credited as current.

Coherence provenance: qa/goal-2026-10-14/api-types-current-freeze.json (SHA28cde10c6a2fdbab4b84fcbb168bbd8150ef98cac81995373ab9cfef8255eda3) runs bundled Node/bundled pnpm.mjs `--filter @lkb/api typecheck`, exit2,18553ms,timedOutfalse,39 TS diagnostics and no owned hosting/factory diagnostic. qa/goal-2026-10-14/web-types-current-freeze.json (SHA2fd4b5fab37429c3a3f89b4f71f4cecf5c7992d84a77a048fab38520918553fe) runs `--filter @lkb/web typecheck`, exit2,13182ms,timedOutfalse,5 TS diagnostics. Exact output is inline stdout/stderr; before-current-freeze JSON companions pin those runs' source snapshots. These are project gate failures, not inferred own-hosting defects. Assigned owner repairs and acknowledgements do not imply a subsequent green compiler execution.

Frozen contracts verifier receipt qa/evidence/goal-t051checker-validator.json may be reused only while validator and registry pins match; it is PASS by vacuity, not runtime evidence. Central types/bundle and scoped hosting HTTP/store consumer proof still required. Full T-060 retains global-key/all-mutation audit, actual deployment/tenant onboarding, hosting/retention live evidence and approval-gated media deletion as named umbrella requirements; this source packet does not close them.

Durability guarantee is acknowledged fsynced journal append plus process restart/replay under owned filesystem; no unverified power-loss/HA guarantee. Failed partial write, fsync or account metadata leaves explicit recovery-needed state. Remote delivery is at-least-once under ACK uncertainty; consumers deduplicate stable X-LKB-Webhook-Id. Automatic background activation is not implied by callable dispatch. All unrelated evaluation/media and parallel work is preserved.

Submitted source/dependency hashes below are the exact 45 maker-tested pins plus explicitly labelled central caller/contract pins. Those central caller pins are source-review inputs, not execution evidence. Independent actual mounted HTTP checking waits ROUTE_FREEZE and must confirm or refresh current bytes before a verdict; a changed pre-verdict packet is explicitly withdrawn/resubmitted at cycle0, never silently treated as old checked bytes. This packet requests checking and claims no PASS.

## Submitted byte pins

Pre-verdict cycle0 resubmission: earlier packet/source tables are withdrawn; original24 and current3 receipts keep exact byte attribution. Current52 supplemental paths and additional central caller/frozen/probe inputs are below. Source-review-only caller pins are not execution proof; independent mounted4 and current coherent green gate remain pending.

| Path | SHA256 |
| --- | --- |
| apps/api/package.json | 678346dcccc8310496005a777fd289ccb4fbe5cae08b529f717d7259d7578ede |
| apps/api/src/auth.ts | 7492213e222053bb1e1120f0b5affc92639e4f913fceaf7ee866cdb65fd62cf1 |
| apps/api/src/composition/integrations/hosting.ts | f356f167a31cb52f47bc73eb62e7be84a4b08638ffe92babaf8e68d63bdd9ee8 |
| apps/api/src/counsellor-accounts/accounts.test.ts | 013b110efcb2b702cfa5f3ec2145a75f182799d24dfdcb91accd223a045ca85d |
| apps/api/src/counsellor-accounts/key-store.ts | b5cd919376738ace917e20871b9dce3238ed523c19f2d97b71bc66284b4d1b52 |
| apps/api/src/counsellor-accounts/router.ts | d804d07f75effd93f27870f9553b4e6c99b6b071e6a0c9fc22f80fb6735cb7f4 |
| apps/api/src/counsellor-accounts/service.ts | b6e186ece8418dbfe74e31189b04f55d1e361202750412a78a3133fc36dbec56 |
| apps/api/src/counsellor-accounts/store.ts | 91253b33268e017fcc6f0144c5eaae211974f29c9336fc75db673b904d0b924a |
| apps/api/src/counsellor-accounts/types.ts | 31ef15aa61a1ccf1bc2cdc9772a1df86b436e2427ee4e9e1bd80f45cbb0f4baf |
| apps/api/src/counsellor-accounts/validation.ts | a49bb57ad3a326652b6a0c76831953ed826fe0e8c480f7daaebcef643d84da97 |
| apps/api/src/hosting/composition.test.ts | a0106030d8462a6b7ff0218cf79cc078e2122cf3035db98e2aaf0684a8373c55 |
| apps/api/src/hosting/config.ts | 67b41a15fba0f8f109d4b127ba1829dc5983cb533a6ca1acf3e384414763aadc |
| apps/api/src/hosting/journal.test.ts | 50cecb58ce06c2bbc3b18555a03fc34d151954837e192a717440ed7313ff0705 |
| apps/api/src/hosting/journal.ts | 55dac9c879e4f6a0364f6bf12c7271b7f2b93e3932429066d684685c9e217725 |
| apps/api/src/hosting/policy.ts | 1a22c1dccd26c7b1cff96d02ddfebde9a6b6b06c95199c59205f4a68005b36fa |
| apps/api/src/hosting/router.test.ts | 9b5d6099933391ed636149c7b6d53e5e207a334d847531785593c85774429445 |
| apps/api/src/hosting/router.ts | 8e08315c1609ca07d2ad0737a9d3b49cbdbeea6adecea529cc1e59632778ae51 |
| apps/api/src/hosting/service.test.ts | 1b0d962c7aafff0693e240aae8053463e7541d02a13f97648ae306cf0696e9cd |
| apps/api/src/hosting/service.ts | 322f352c404b8ddf472e0a789824e5cd351e7f98d27e861cf112eb0afcefefbb |
| apps/api/src/hosting/state.ts | 39a8bc57b4ec32894b2e9f6a69d0a08a40f3396ade04c5f7cfb976579b65e83a |
| apps/api/src/hosting/test-kit.ts | 7a5d7ac173410687a6d3c6f6b5532bfb9803e69c0fce15f3a88b469f1557e72e |
| apps/api/src/hosting/transport.test.ts | 549d6a9968aeb843fa805c3ebc6cc767930bd8d639accc12a32c24a47b9fa352 |
| apps/api/src/hosting/transport.ts | aecfffbe1d51e7120b1e37130245047f7bf3fbcdb0f6a7f44de540c30db61f14 |
| apps/api/src/hosting/types.ts | 8df6c9cf90f7835025496793183fe05342cb7d8e623c6fc001c952647e4318f4 |
| apps/api/src/hosting/worker.test.ts | b34b7bde0493d04b65ebdc7fd10519d1f7c3b940d2f210ae144cf6987b261bab |
| apps/api/src/hosting/worker.ts | 0be7c6bdd193b155c2d2e6658d81c36eded2757c5d045748dfdc2c6cbce76dd4 |
| apps/api/src/operations-integrations/adapters.test.ts | ae88e7009cd95eeb47df338ecf6d12e8830590441485b88f231cff9b42878279 |
| apps/api/src/operations-integrations/adapters.ts | bdb1ce4fd146ee857b93d3f686dadae3712304e3cfc7f8923fab21e999d0dbbb |
| apps/api/src/operations-integrations/model.ts | 099092ec6308cda30fac6d7e32b4a761f579a3c85a26590402658307cf87ce77 |
| apps/api/src/operations-integrations/notification-window.ts | 749e0fd114de0f7f5b2aabb7642ec8675531a83b8958f1e58755cb82e536f2a4 |
| apps/api/src/operations-integrations/payload.ts | 5fe047563ef6356dbe66a8a3cf7756e49698ea83b688204e88c06928706c69fc |
| apps/api/src/operations-integrations/producer-compat.test.ts | 6baf6d8e4b0d54f7616b896e1708357489ec3c2a97e383e6d40a25e881f2c850 |
| apps/api/src/operations-integrations/router.test.ts | 67b65d7a918ef2855783e0742e0e8f334b9749fb8651a341b28467c66d9e610c |
| apps/api/src/operations-integrations/router.ts | 021b55ebc8f000971316550295eaf575a4a99deaf459793acac4768dad7a0ccb |
| apps/api/src/operations-integrations/serverIntegration.test.ts | 62149b95df9a456e2b164baad7cc609e8f43245c9e4dbcf2de106be39512a859 |
| apps/api/src/operations-integrations/service.test.ts | bea5b813df8cb3f920f2338fbe9cc761fe613dc3c6396a512c14599925e24461 |
| apps/api/src/operations-integrations/service.ts | 9900bbdf03810aa611668a46ba3382f2b563e2b39c8072ee6d187f2dd725cb4c |
| apps/api/src/operations-integrations/snapshot.ts | 2129070cb70d00b32b43a329dddf17d7b9a06e4d36a3f26cf31bf083d97df10d |
| apps/api/src/operations-integrations/store.test.ts | 4bb7f18fc36ca2b9c0227fd5ba2a3fb66bce61be2a49b9bc479b32ec80a336d9 |
| apps/api/src/operations-integrations/store.ts | 0ede985f2fe43aafb790091a25e6aa677f314137d7bf2282542ba86aa6de8bbd |
| apps/api/src/retention-status/router.ts | c02f529501a7d09611cedaed0767745ddb5d3b15beef55d5849f7cf40d69bdc6 |
| apps/api/src/retention-status/store.ts | e0496679485dcb1cd704f3a2362622731e04db56acc68791ef8aa0de20ec736d |
| apps/api/src/retention-status/summary.ts | 214eecb9ae3caa6943319907ff127d64657f8620dcdde953241a719b01ee352a |
| apps/api/src/routes/keys.ts | d627471a7c018c6aae4312387d325d8a74df7eb3c9072337f203c4e7d0322bef |
| apps/api/tsconfig.json | e37d70f01dd85f180c1e3070dbed968acd2d610beb3ec9040a78259aa8ca1b03 |
| package.json | 390796f4fb84efb09f72ce233564a05e1a69e4c2b0b6806415e9677ef6234778 |
| packages/db/src/lib/tenantScope.ts | f9ab2f8fa8d21dd661d9752cfa85912fa548255ef85a0018e048634bc95ee513 |
| packages/ingest/src/retention/production/private-summary-read.ts | 3f451bf9b51d76671f28a7ae132c84f99e8d370fe86f131564cf6c65ba5554f0 |
| packages/ingest/src/retention/production/private-summary.ts | e78e427ab662036994c846b62f9b904334ffb7d1a8270956b40035b24af50181 |
| packages/ingest/src/retention/retention-last-run.ts | 157cbae69179a7c2f115a8e7a4a60e7f799e5d1a60e6f5e96e558661e465c576 |
| packages/ingest/src/strict-record.ts | 90bb8445801ec758b490c917522c9850da3f6f3111251ff5c7df6348212e5f9b |
| pnpm-lock.yaml | 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd |
| apps/api/src/composition/integrations/routes.ts | d4c1a5c9a374225a08936b1d43d2f8ab3888bd0e5c51734e4cc7d17b3d342ace |
| apps/api/src/composition/production.ts | fabf236621196871d176327bea99d1c030fe5beb888829490b10f8e6373c0b5e |
| apps/api/src/fixtures.ts | 3a6018a7f922f98fdcdd41cc284c8ca434fd987ab2b5bd50abff5c4cd418585b |
| apps/api/src/server.ts | 5730f4aeb2086999ebe08e81a729055db118d9a42efd3e425ae7572eaa2328d2 |
| apps/api/src/store.ts | 9d976378610a30d56ae12842f2d5024a1363206923dd56325f8e839beaf45907 |
| apps/web/src/App.tsx | eef7af89eb3c3c261678aed701f309d9399e0f77921b73e3b9ce97b1055571ea |
| apps/web/src/layout/NavSidebar.tsx | 39319e1ce324ec1110ee101528c08a56f88eb8d46032074cb54d69fbd4ca23f6 |
| apps/web/src/pages/MeetingBotPage.tsx | b9bda3e6242631a2c53dc5b0c93000552f4935553e5ee7ac8dd4b06d571e5153 |
| apps/web/src/pages/sessions/SessionDetailPage.tsx | 16bd213ad66f6c76b2555cce655fa7e2a880f0be5b170e2022aeb41db2620487 |
| contracts/contracts.json | d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 |
| contracts/verify_contracts.py | 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 |
| qa/contracts/goal-t060.md | 338522bed6524192b70203fb7d478d1f2ab314adce1f1d83dcb91bc9ffcee1eb |
| qa/evidence/goal-t028-central-check.test.ts | 43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084 |
| qa/goal-2026-10-14/route-freeze.json | 311fbd974e54da6442737f197f26d08c8bfdab92d875f36e06c0a5ccc8c640b4 |

## Post-verdict evidence record — cycle 0 HOLD

This section records a completed handshake; it is not a new ready submission. The checker inspected packet93129f72f358f4568787e628b683fccf0a6a4273efa3407d73e2a00f1516bb07 and ready manifest9ec2664fec513e2b82abebb64cc2e72b7ce2ffedfaa3af3cacfc1c7efdd4db6b against the unchanged66-source map above.

Independent shared mounted4 now actually passed: receipt `qa/evidence/goal-t051checker-broker-t028-t060-mounted-independent4.json` SHA b286fe8d19e8a523f00159db2bf9518c5c321397a4bf4fe3d72c7b29a92a3866, raw stdout/stderr alongside. Exact command `node --test --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-t028-central-check.test.ts`, outer90000ms; execution2026-10-14T22:33:10.744Z–22:33:17.477Z, elapsed6708.752ms, exit0,4/4 pass, no skipped/cancelled/todo, signal/error null. All75 unionpins plus spec stable before/after. Spec `qa/evidence/goal-t028-t060-mounted-checker-spec.json` SHA d6798526db23bf5c85d47766c23dba11eab1c3107bbe8f3eb9023a1cb40f754f. Actual factory/server identity/roles/lifecycle/crash fences and worker/HMAC/status/restart were exercised; DNS/HTTPS adapters remain deterministic, no external delivery/production DB.

Checker verdict `qa/verdicts/goal-t060.md` HOLD cycle0 SHA97056f1e533ab7ae7e17ec3294516adef423a54003c7c8d0892009050e09d798, ISSUES-WRITTEN none, identifies no source acceptance violation. C1–C6 scoped runtime is exercised, but mandatory recorded API/web coherence remains exit2 with39/5 diagnostics until a fresh actual green receipt. C7 production retention/live hosting, global audit and whole-task operational gates remain named. Maker manifest now in_progress awaiting prerequisite; unchanged22 maker cases, currentfactory3 and independentmounted4 need no blanket duplicate execution. No PASS, task completion or automatic environmental retry. Next candidate increments cycle only when ready for a new evidence-backed request.

## Post-verdict cycle 1 FAIL

Cycle1 matching verdict `qa/verdicts/goal-t060.md` SHA1b31672960824decef94d11c7abb4bb9975c3e81ea53e811d9d7c9d8d9d66d45 records actual coherent green types/builds and1939 stable inputs, so the earlier coherence HOLD is resolved. It checked ready manifest19280640074c58237a441754b94e0a62d3ddc5d94f66f75476e4dcd94ea63f85 and this packet before append, SHA7649d818e0018b52c627e1026566728b544ad92ca71bb978fb60ec35e7b88291. Runtime4/22/3 attribution remains unchanged.

C3 documentation is a demonstrated violation: actual generated `/docs-ui` consumes shared STUB_ROUTES and renders `POST /webhooks/register` as501/not_implemented with webhooks-only scope, while centrally mounted runtime requires hosting+webhooks/current role and returns201/config-unavailable503. Shared stubs/pages are integration-owner paths; owner received exact metadata correction and medium ledger request. No source/test writes during freeze, no acceptance waiver and no close-out. Manifest is in_progress cycle1; corrected next candidate will be cycle2 with affected documentation consumer explicitly repinned and meaningfully verified, without blanket rerun of unchanged behavior. Full-parent live/production gates persist.


## Cycle 2 current candidate — metadata reconciliation, 2026-10-15

Root-approved metadata continuation; no source edit. C3 repair is already implemented in current pages.ts/stubs.ts/pages.test.ts and is documented accurately in the manifest's current-cycle section. It supersedes the earlier packet's unresolved C3 description as a source condition, while preserving the cycle1 FAIL history.

Focused actual consumer proof: qa/goal-2026-10-14/ordinary-docs-consumer-20261014T232052Z.receipt.json; five/five, exit0, 4826ms, outer120000ms, all eleven current source hashes match the receipt. It exercises rendered API documentation plus mounted hosting/webhooks scope refusal and missing-runtime503. No rerun, provider, DB, browser or heavy process was launched in this reconciliation.

Current seventy-path inventory: qa/evidence/goal-t060-cycle2-pins.json. The approved vectorless/Ollama production.ts change is newly inventoried, not silently covered by the old mounted receipt. Its relevant hosting composition behavior needs independent changed-caller review at final freeze. Shared source is actively changing; do not treat these pins as a readiness freeze. Existing ordinary green checkpoints are historical pending root's current integrated coherence receipt. Manifest is in_progress, fix cycle2; no ready request or PASS is issued yet. Contract C1-C7 and all explicit umbrella/live gates are unchanged. Root owns assigning the independent checker after this prerequisite.