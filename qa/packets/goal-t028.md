# Checker packet — goal-t028, cycle 2

**Candidate status:** ready-for-check, cycle 2 evidence-only resubmission. Consume prior matching HOLD cycle1 (SHA-256 96e3cdf78379bda14dc5df04dbcd619d504cb11d0713d5f52b39e1ea9e75d2a7); its required local coherence gate now has actual green/stable receipts. Source/tests, current page wording and mounted proof inputs are unchanged. No CPU, source change, behavior rerun or current verdict is inferred. Historical API6/UI3 remains narrowly attributed below; current mounted4 is reused only because relevant bytes match.

## Scope and authority

T-028 is counsellor accounts, not the historical Gmail feature that reused the label. Root's current-user all-forty scope ruling explicitly supersedes the old “baad mein” priority deferral and authorizes existing verified API-key identity/T-060 roles plus durable tenant lifecycle, grants and audit. Contract qa/contracts/goal-t028.md C1–C7 is independent ground truth. The scoped runtime is local fixtures and real application composition; real credentials/accounts, production writes and deployment proofs remain separate.

Current root authority interpretation preserves independently granted API scopes. Inactive/deleted account identity refuses ordinary scoped consumers; reactivation restores active profile but leaves hosting/account role null until an explicit role grant. Active/null-role identity may use its existing verified scope (for example search) within its own tenant; hosted/account routes still refuse. Revoked keys never reactivate and pending commits fail closed. The page now explicitly says “Hosting and account access requires a fresh role grant.” No global RBAC change is authorized or introduced.

## Changed source map

- apps/api/src/counsellor-accounts/types.ts: narrow hosting/key-directory interfaces and profile/audit views; identity is the verified key id, never a raw key.
- validation.ts: strict allowed fields, bounded profile/email normalization, required positive integer revisions, canonical timestamps.
- store.ts: replays tenant account journal; create/update/status preserve immutable key binding and increment revision. Profile mutation and actor audit share one durable journal record. Deletion is a retained tombstone. identityStatus includes tombstones and is the immediate generic-role/consumer guard.
- service.ts: uses hosting.withPermission for lifecycle reads/writes; grant/deactivate repeat durable profile validation under hosting.changeAccountRole. Inactive account cannot receive roles; reactivation deliberately restores no role. Deactivation null role is fsynced before profile mutation; partial failure stays revoked/quarantined.
- router.ts: mounts its own requireAuth; requires verified auth.keyId; strict payload fields never accept tenant/actor. Routes list/read/create/update, explicit status actions, authoritative role change, identity candidates and sanitized audit.
- key-store.ts: wraps existing authoritative API-key verification with durable account identity status before every scoped consumer. Inactive/deleted identities refuse; corrupt/unavailable journal throws a 503. Unbound existing keys retain the original verification policy.
- accounts.test.ts: actual HostingService/HostingJournal fixtures, mounted HTTP router and separate scoped consumer, reconstruction, tenant/role/forgery/stale input refusal, generic inactive-role bypass refusal, profile/hosting fsync faults, serialized concurrent grant, tombstone recreation requiring fresh grant, revoked identity cleanup and corrupt durable metadata.
- apps/web/src/pages/accounts/client.ts: actual API paths and revision-bearing requests.
- CounsellorAccountsPage.tsx: linked-profile form, edit/access/deactivate/reactivate/remove controls and profile/access audit. Auth generation suppresses delayed prior-tenant data and clears pending state.
- CounsellorAccountsPage.test.tsx: workflow request bodies, stale-revision failure and delayed tenant audit suppression.

These ten maker files are untracked/new, with no base versions. Final hashes and source/caller map below reflect current bytes after broker checks. No unrelated media/evaluation changes are included.

## Immediate dependencies and central integration

HostingPrincipal is {tenantId,keyId,scopes}, produced by actual server key verification. Shared auth/store wiring must carry keyId and still reject revoked keys. HostingService is T-060's authority; account lifecycle is not a second role registry. It enforces hosting scope, explicit operator bootstrap owner map and current role under its durable writer lock.

Central API composition:

```ts
const accountStore = new CounsellorAccountStore(new HostingJournal(absoluteAccountStateDirectory));
const lifecycleAwareKeys = createAccountAwareKeyStore(apiKeyStore, accountStore);
hostingService.setAccountStatusProvider(async (tenant, keyId) =>
  (await accountStore.identityStatus(tenant, keyId)) ?? "unbound");
const service = new CounsellorAccountsService(accountStore, hostingService, {
  activeKeyIds: async tenant => (await keysDeps.listKeys(tenant))
    .filter(key => key.revokedAt === null && key.scopes.includes("hosting"))
    .map(key => key._id),
});
// Global auth for existing scoped consumers must use lifecycleAwareKeys as well.
app.use("/counsellor-accounts", createCounsellorAccountRouter({ service, keys: lifecycleAwareKeys }));
```

Attach status provider and lifecycle-aware key verification before any mounted traffic. Account journal errors surface 503 without authentication success; central error handling must preserve that status. Add named/default CounsellorAccountsPage at /accounts and navigation; Settings must offer the hosting scope for eligible key creation. Account journal uses private persistent absolute state directory beside hosting state; no production collection write is introduced. Missing hosting configuration/provider/store cannot be called live evidence.

Actual current central callers now exist: apps/api/src/composition/integrations/hosting.ts buildHostingIntegrations creates separate explicitly configured LKB_COUNSELLOR_STATE_DIR account journal, attaches provider before wiring, and wraps global keyStore with both account metadata and hosting.service.isIdentityActive. Pending hosting role/key transactions therefore cannot authenticate through unrelated scoped APIs after a crash. The corrected factory directory queries revokedAt:null and scopes:"hosting", remains tenant-scoped, projects _id only and refuses capacity above 1000. apps/api/src/composition/production.ts merges these integrations into real ServerDeps. integrations/routes.ts mounts /counsellor-accounts after the shared perimeter. server.ts uses requireAuth(deps.keyStore) before all JSON routes and reports status-bearing errors as sanitized JSON. auth.ts and Mongo store.ts carry verified doc._id as keyId. apps/web/src/App.tsx mounts /accounts; layout/NavSidebar.tsx exposes navigation; SettingsPage.tsx offers hosting scope.

HostingService.changeAccountRole's pending event and account.complete event stop both generic-role regrant after an interrupted account mutation and authorization races. Callback audit failure prevents success; quarantine is explicit operator recovery, with no automatic clearing API. HostingJournal handles locks, secure paths, fsync and corruption refusal. This shared dependency is T-060-owned and must be independently checked/pinned with central mounts.

## Focused execution requested

Repository: C:\Users\product\Desktop\KnowledgeBase. Serial CPU permission delegated to /root/docker_checker; do not run concurrently with another local lease. No browser, full suites, production writes, external messages or deployment.

1. `node --test --import tsx apps/api/src/counsellor-accounts/accounts.test.ts` — six focused actual durable/HTTP tests; temporary tenant journals/fixture verified key registry are deleted after each case.
2. `pnpm --filter @lkb/web exec vitest run src/pages/accounts/CounsellorAccountsPage.test.tsx --maxWorkers 1 --minWorkers 1` — three jsdom page fixtures, no browser.
3. `python contracts/verify_contracts.py` — repository definition-of-done validator.

Dependencies are installed repo Node/tsx, Express, React/Vitest and Python. Subprocess/local-listener sandbox permissions are not assumed: record actual result and approved retry if restricted. Tests inject filesystem sync failures, not source mutations; there is no mutation-run restoration requirement.

## Current evidence and limits

Read-only scope/path survey completed; root source lease and actual scope release received. Execution was performed by the sole central serial CPU broker; maker neither duplicated the commands nor changed source after them.

| Evidence | Exact program/arguments | Result |
|---|---|---|
| qa/evidence/goal-t051checker-broker-t028-api.json and .stdout/.stderr.txt | C:\\Program Files\\nodejs\\node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/counsellor-accounts/accounts.test.ts | Exit 0; 6/6 pass, 0 skipped; elapsed 3.4504958s; 20:05:48.851Z–20:05:52.309Z; 27 source pins unchanged |
| qa/evidence/goal-t051checker-broker-t028-ui.json and .stdout/.stderr.txt | C:\\Program Files\\nodejs\\node.exe C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs --filter @lkb/web exec vitest run src/pages/accounts/CounsellorAccountsPage.test.tsx --maxWorkers 1 --minWorkers 1 | Exit 0; 3/3 pass; elapsed 38.6105076s; 20:05:55.679Z–20:06:34.298Z; Vitest duration 30.78s; same 27 pins unchanged |
| qa/evidence/goal-t051checker-validator.json (reused; not rerun by maker) | python contracts/verify_contracts.py | Exit 0; no frozen contracts, PASS by vacuity; executed 18:39:31.7184876Z–18:39:33.1459082Z combined checker batch, individual duration unknown; current validator/registry digests match reusable receipt |

API output: tests 6, pass 6, fail 0, skipped 0, duration_ms 3338.5545. UI output: Test Files 1 passed, Tests 3 passed; fixture interactions include real client request bodies, mutation failure and prior-tenant late audit suppression. No browser/provider/real Mongo or external account operation was used.

These UI results precede the wording-only page change. The current exact wording was independently inspected in the cycle1 checker review. No fresh UI run is claimed and no duplicate unchanged behavioral check is requested. Shared independent mounted probe qa/evidence/goal-t028-central-check.test.ts exercised actual current factory/createServer, the role-versus-scope boundary, revoked identity and pending-crash fences and passed as recorded below.

Current shared mounted probe has four cases and SHA-256 43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084. Its single actual execution passed 4/4, exit0; source/probe edits and reruns are excluded. The current 38 table pins include final central factory f356f167a31cb52f47bc73eb62e7be84a4b08638ffe92babaf8e68d63bdd9ee8, routes d4c1a5c9a374225a08936b1d43d2f8ab3888bd0e5c51734e4cc7d17b3d342ace, production fabf236621196871d176327bea99d1c030fe5beb888829490b10f8e6373c0b5e, hosting composition fixture a0106030d8462a6b7ff0218cf79cc078e2122cf3035db98e2aaf0684a8373c55 and App eef7af89eb3c3c261678aed701f309d9399e0f77921b73e3b9ce97b1055571ea. The final factory adds read-only retention binding; unrelated production writes are not implied.

The **historical cycle1** coherent type gate was red (API39/web5), causing the matching checker HOLD with ISSUES-WRITTEN:none. The current local types/build checkpoint is **green/stable**, detailed below; it resolves that local gate without changing account/probe source. No current PASS or whole-task done is claimed before an independent matching cycle2 verdict.

No current checker PASS or task done is claimed. Actual central mounted HTTP/factory sample is recorded separately from historical isolated fixtures, and independent current receipt/hash review is required for cycle2. Fixture API identities prove tenant-key authorization only; they do not establish real human identity, private production DB, configured live account setup, supported-host/container operation, public operations or deployment/promotion. The checker must retain those remaining live gates; a local scoped acceptance cannot certify full live T-028.

## Cycle 2 actual evidence and current-byte verification

Prior matching verdict qa/verdicts/goal-t028.md was HOLD cycle1, SHA-256 96e3cdf78379bda14dc5df04dbcd619d504cb11d0713d5f52b39e1ea9e75d2a7. Criteria C1–C7 are unchanged; checker updated only contract evidence status. Current qa/contracts/goal-t028.md SHA-256 ca67627935d47d6f6612f7e21fa8f85e31eda65d25d6d5826fd33e12401dc977.

Independent current mounted receipt qa/evidence/goal-t051checker-broker-t028-t060-mounted-independent4.json SHA-256 b286fe8d19e8a523f00159db2bf9518c5c321397a4bf4fe3d72c7b29a92a3866: bundled Node `--test --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-t028-central-check.test.ts`; cwd repository, outer timeout90000ms. Actual start22:33:10.744Z, end22:33:17.477Z, exit0, 4/4, 0skips/failures, elapsed6708.752ms, empty stderr. Before/after all76 execution pins unchanged. Maker compared all76 against current before new cycle2 QA metadata: no mismatches. Tests cover actual factory/server tenant/scope/role/lifecycle/audit/restart paths, revoked credentials, pending mutation crash fences, real webhook service with controlled transport, and corrupt account/config refusal. No real accounts, DB/provider/browser or deployment was invoked.

Current green checkpoint qa/goal-2026-10-14/ordinary-current-build-checkpoint-20261014T225425Z.json SHA-256 9901fc4b8ba492648072584796450e1c8ec3eedb87829e3e95b278750689ed68: recorded22:59:38.3939433Z,1939 before/after source/config input files, inputDrift0, handlesNONE. Snapshots qa/goal-2026-10-14/ordinary-types-20261014T225425Z-before.json and ordinary-builds-20261014T225425Z-after.json cover67 mounted execution application/config pins; all67 agree with both snapshots and current mounted source. The other9 pins are contracts/QA/probe/spec artifacts checked independently, not claimed as compiler inputs. Cycle2 manifest/packet and contract evidence-status hashes intentionally change; application/probe bytes do not.

All stages invoke bundled Node and bundled pnpm with `--filter @lkb/api` or `--filter @lkb/web` and the indicated command. Receipt hashes were read and matched, exits0, timedOutfalse, signalsnull:

| Phase / exact receipt under qa/goal-2026-10-14/ | Command | UTC start → end | Milliseconds | SHA-256 |
|---|---|---|---|---|
| api-types-ordinary-20261014T225425Z.json | --filter @lkb/api typecheck | 22:54:38.754 → 22:54:51.079 |12325|ea924c1c643ab2a119fd425586157cdba6998a93195e29f222055077c936ac8e|
| web-types-ordinary-20261014T225425Z.json | --filter @lkb/web typecheck |22:55:22.504 → 22:55:33.504|11000|8d86e8aff8190748f9e4cdd0c369ea790f66ff53edbedc604fd714506633dc16|
| api-build-ordinary-20261014T225425Z.json | --filter @lkb/api build |22:56:23.497 → 22:56:25.215|1718|a7b46a3e65d50d5fb4ea39b699a625cd3e848a678b0b97d0a83de78f01edb9f1|
| web-build-ordinary-20261014T225425Z.json | --filter @lkb/web build |22:57:47.944 → 22:58:04.014|16070|87edab7b2841af78e70e58072a7cc693671cf1ccc96767ea055c0f6fb78a92a1|

Actual checkpoint scope is local current typechecks and API/server-worker/web builds. Container/native ACL/live provider execution is not claimed. Supported-host/privateDB/public-operations/real-account/production-promotion gates remain HOLD outside this scoped resubmission.

## Final checked-byte pins — 2026-10-14

At initial receipt consumption all 27 broker scope pins matched. After root resumed central integration, the final pin table was refreshed: hosting/service.ts and hosting/composition.test.ts plus central hosting factory, route composition, production composition, server, Mongo store, App and Settings changed. Nine account-owned files remain unchanged; CounsellorAccountsPage.tsx now contains the root-directed wording correction (SHA-256 697bf11269d1cf1b6d89d84d0b6663d5d6675a519a606e6f01d13ce20479e7e4). Historical broker receipts retain their original pins; changed UI/dependency/caller bytes require fresh UI/current independent mounted proof. Central caller pins are source inspection only, not mounted HTTP evidence.

| Path | SHA-256 |
|---|---|
| apps/api/src/auth.ts | 7492213e222053bb1e1120f0b5affc92639e4f913fceaf7ee866cdb65fd62cf1 |
| apps/api/src/composition/integrations/hosting.ts | f356f167a31cb52f47bc73eb62e7be84a4b08638ffe92babaf8e68d63bdd9ee8 |
| apps/api/src/composition/integrations/routes.ts | d4c1a5c9a374225a08936b1d43d2f8ab3888bd0e5c51734e4cc7d17b3d342ace |
| apps/api/src/composition/production.ts | fabf236621196871d176327bea99d1c030fe5beb888829490b10f8e6373c0b5e |
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
| apps/api/src/server.ts | 5730f4aeb2086999ebe08e81a729055db118d9a42efd3e425ae7572eaa2328d2 |
| apps/api/src/store.ts | 9d976378610a30d56ae12842f2d5024a1363206923dd56325f8e839beaf45907 |
| apps/web/src/api/client.ts | 854f0bc3301e097b83e2caefcd01a8eae19530e3a6390add4dd6c9cfaf429802 |
| apps/web/src/App.tsx | eef7af89eb3c3c261678aed701f309d9399e0f77921b73e3b9ce97b1055571ea |
| apps/web/src/layout/NavSidebar.tsx | 39319e1ce324ec1110ee101528c08a56f88eb8d46032074cb54d69fbd4ca23f6 |
| apps/web/src/pages/accounts/client.ts | 80ff5d18e0bf9255c66d11a55e1ca32dd3db07b93fcb0733c671c425d7392c65 |
| apps/web/src/pages/accounts/CounsellorAccountsPage.test.tsx | 77c07eb3762686885dad4ce42d228f8441182c73e56de84068261d5f2b9bb498 |
| apps/web/src/pages/accounts/CounsellorAccountsPage.tsx | 697bf11269d1cf1b6d89d84d0b6663d5d6675a519a606e6f01d13ce20479e7e4 |
| apps/web/src/pages/SettingsPage.tsx | fc77d243a62a12fa3c314c9d39294eecc495320923f1130ce43e7c7709f993e4 |
| contracts/contracts.json | d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 |
| contracts/verify_contracts.py | 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 |
