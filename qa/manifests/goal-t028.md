# goal-t028 — counsellor accounts

**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 2
**Task:** T-028
**Priority tier:** 3 — current all-forty roadmap goal, explicit root scope ruling releases historical accounts priority deferral.
**Packet:** qa/packets/goal-t028.md
**Contract:** qa/contracts/goal-t028.md C1–C7 (checker-owned).
**Verdict:** qa/verdicts/goal-t028.md (checker-owned), PASS cycle2, SHA-256 830e01b40a6425d3f3d49d454cc41742eec2899bbd5319c29809540c27c892e7. Prior HOLD cycle1 preserved at qa/evidence/goal-t028-cycle1-verdict-preserved.md, SHA-256 96e3cdf78379bda14dc5df04dbcd619d504cb11d0713d5f52b39e1ea9e75d2a7.

## Authorized unit

Durable tenant counsellor profile CRUD, deactivation/reactivation and tombstone removal; roles through existing verified API-key identity and authoritative T-060 grants; immutable lifecycle/access audit; actual API and accounts page. No password, SSO, raw credential persistence, external account operation or production promotion.

## Ownership and remaining evidence

Maker owns apps/api/src/counsellor-accounts/** and apps/web/src/pages/accounts/** plus this manifest/packet. All are new files with no tracked base. Central integration owns auth keyId, production/service composition, App/nav, dependencies and trackers. T-060 owner supplies shared hosting service/journal/policy/state. Maker never edits checker contracts/verdicts.

Source and tests remain frozen. Cycle 2 is metadata-only resubmission after the sole cycle-1 HOLD gate acquired actual current green type/build receipts; no source repair, CPU or behavioral rerun occurred. Historical API6/UI3 evidence retains its original narrow attribution. The independent actual mounted four-case proof already passed on current relevant source bytes and is reused without rerunning. Current page wording was independently inspected; the old UI receipt is not claimed as a fresh run. Reused frozen-validator receipt is byte-matched and vacuous.

Actual central API/page mounts, lifecycle provider and global verified-key wiring are mapped/pinned. Independent createServer/buildHostingIntegrations mounted proof passed 4/4 with 76/76 execution pins unchanged; before this metadata resubmission all 76 matched current files. The build checkpoint covers 67 of those application/config pins with zero relevant mismatch; remaining pins are frozen-contract/QA artifacts inspected separately. New cycle-2 manifest/packet and checker evidence-status metadata intentionally acquire new hashes. Actual matching local-runtime PASS cycle2 is recorded below; whole-task/parent completion is not inferred.

The root's current scope ruling preserves independently granted API scopes: inactive profile refuses ordinary scoped consumers; active profile with null hosting role may use existing verified API scopes within the same tenant, while hosted/account endpoints require a fresh role grant. Revoked keys and pending commits still refuse. This is the existing API-key policy, not global RBAC.

Cycle-1 coherent type gate was red (API39/web5); that historical HOLD is preserved. Current local types and builds are green/stable: qa/goal-2026-10-14/ordinary-current-build-checkpoint-20261014T225425Z.json SHA-256 9901fc4b8ba492648072584796450e1c8ec3eedb87829e3e95b278750689ed68 reports four actual exit-0 stages, 1939 input pins and zero drift. The packet records exact receipt hashes, commands and durations. Current 38 source/caller pins and independent probe SHA-256 43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084 match unchanged checked source. This resolves the local gate only: supported-host/container/live provider, private production DB, real human accounts/credentials, public operations and deployment/promotion evidence remain separate HOLD gates.

## Security and transaction boundary

Auth, tenancy, role management and data writes: full ceremony, security findings uncapped. Profile state plus verified-actor audit is one fsynced account journal record. Grants use the authoritative hosting journal. Deactivation holds that hosting lock, writes role revocation plus pending intent first, writes profile inactive/tombstone state next, then writes completion; failures quarantine and preserve revocation. The account status provider prevents generic hosting roles from granting inactive/deleted identities. The lifecycle-aware global key store plus HostingService.isIdentityActive prevent other scoped consumers authenticating inactive/deleted or pending-recovery identities. Explicit bootstrap-owner and self-deactivation guards belong to T-060 authority.

## Scoped matching-cycle close-out

Independent checker PASS cycle2 persisted/read back at 2026-10-14T23:11:13.9829400Z, confirmed by qa/evidence/goal-t028-cycle2-verdict-persisted.json. Before close-out the exact ready manifest f0e48740c71f7eb4421b8626a1a40ac9410bcf8407caae1fb152849806c4f09b, unchanged packet cf7b3392a50cd2f36b6cded0aae066f8956f693d01cf268620af2e7950d35241 and contract ca67627935d47d6f6612f7e21fa8f85e31eda65d25d6d5826fd33e12401dc977 matched the checker's persistence receipt. Only this maker-owned manifest status/close-out metadata changed afterward; product/probe/tests remained frozen.

Accepted scope is local verified-key counsellor lifecycle/role/audit runtime and its actual mounted downstream consumer. Evidence: existing shared mounted4 receipt b286fe8d19e8a523f00159db2bf9518c5c321397a4bf4fe3d72c7b29a92a3866; global local type/build checkpoint 9901fc4b8ba492648072584796450e1c8ec3eedb87829e3e95b278750689ed68 with four actual exit0 stages/1939 inputs/zero drift; independently current38/38 packet pins,69/69 unchanged mounted source/validator pins and67 checkpoint-mapped source hashes. Historical API6/UI3 are retained with their original narrow attribution. No new CPU or behavioral execution occurred during this close-out.

**Whole task/parent: HOLD.** Real human accounts/credentials, private production DB/public operations, supported-host/container/live-provider evidence and production promotion/deployment remain separate gates. This scoped checked-PASS does not authorize their activation, waive a gate or mark the whole parent complete.
