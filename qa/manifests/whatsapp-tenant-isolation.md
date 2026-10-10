# Manifest — whatsapp-tenant-isolation

Status: checked-PASS
Fix cycle: 1
Scope: source acceptance for authenticated tenant→owner isolation and one immutable authorized message snapshot.

## Paths and current identities

| Source/test/document | SHA256 |
|---|---|
| apps/api/src/whatsapp-store.ts | be94fb37f23075ea14d92923061a0ee1fe9f74b0063fe18a85657c55e5b6e77b |
| apps/api/src/routes/whatsapp.ts | f83e63c7f8430c32b00289a48a6a5b8ab7bd0749d6be22341cdc0058a3378f74 |
| apps/api/src/whatsapp/owner-config.ts | 5ed810b3a7f45cc6ee221d1564535c6ccd54a3f46fe08405ecc5067baaeba1be |
| apps/api/src/whatsapp/owner-config.test.ts | 4f748515938dd3d261edee3c764ef23cf119d74e94887cae80662e09c16b38c2 |
| apps/api/src/whatsapp/store-isolation.test.ts | d3944666e824251406b0e38d0cdab7fba9b4d0c18e8c93d5e19db0ae56a58b9e |
| apps/api/src/whatsapp/route-tenant.test.ts | 7698cf423e5be10c91c5885aead9ef432cc4e01fc6d781e77da070d4b7f34727 |
| docs/whatsapp/SETUP.md | 5bb248197e135be95e497f2789cb6e0507ccd5375f5f1e198a8207d1ab3addc0 |
| apps/api/src/whatsapp/store-snapshot.test.ts | f78db0c9d8d8a4bd5b0248b404002490838393e6f457824790c5cc4a47f8f789 |
| apps/api/src/whatsapp/store-mongo-snapshot.test.ts | 853b583a385232beb4244da95b7e3e6cf4be3cbedccb657e39ac50e82c6e2c83 |

Own QA: qa/manifests/whatsapp-tenant-isolation.md and qa/verdicts/whatsapp-tenant-isolation.md. The combined source/docs/tests/QA allowlist is 11 paths. No production.ts/server.ts, runtime pin, .env, private submodule, shared ledger or roadmap change.

## Behavior and invariants

Routes forward the authenticated key tenant and ignore client owner/tenant injection. Trusted canonical24hex owner grants reject duplicate tenants/owners; missing grants refuse before archive/app/index effects. Groups, tracking, messages and people remain owner-qualified. Different owners sharing a group JID retain distinct source/session/turn identities and tenant-scoped downstream pages/claims/tree.

Each authorized ingest reads archive messages once. Copied normalized messageId/personId/displayName/text/ISO time fields and their array are frozen before application writes. A request-local adapter consumes the same snapshot for IDs, text, speaker/labels, occurredAt, relative times and session date. No shared mutable cache, source-interface/schema change or invented replacement evidence. Provided-capture consent provenance remains unchanged.

## Attributed maker and independent evidence

Maker adoption receipt outputs/knowledgebase-whatsapp-snapshot-adoption.json SHA ed07c8c0aeb356b884a2968407a145e9eefa3d595e569c39c8373d01efc8b3e5: actual source command from apps/api: node --import tsx --test --test-concurrency=1 src/whatsapp/owner-config.test.ts src/whatsapp/store-isolation.test.ts src/whatsapp/route-tenant.test.ts src/whatsapp/store-snapshot.test.ts src/whatsapp/store-mongo-snapshot.test.ts src/routes/whatsapp.test.ts. Output: 17/17 PASS, 0 failures/skips, 6744.0656ms, tool bb80bf. Actual node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json exit0, tool a8120f.

Independent exact logical overlay: 17/17 PASS, 0 failures/skips, 11680.5106ms; real API compiler87 roots, zero diagnostics, 4170ms. work/whatsapp-snapshot-race-checker-proof-v2.json SHA 94d56e91e49da75dd21367605112d22f4f979feafff5ebe38bd3da4876c5cc91 records commands/output hashes and source identity. The independent repository regression exercises the actual default Mongo reader with fake archive data, mutation/reordering during source write, one owner-qualified message/person query and exact ID/payload/speaker/time preservation.

Earlier independent source-schema/config/compiler/actual indexSession fake-DB evidence f0677481ebb8784555539ae81854a86cc38331aac9591fb0e2b124c7a1315c9a is retained, distinct from initial adopted13-case receipt and current17-case run. Initial adoption verification c2f93ab844f2159b19eb883d5a5a42b307f615d2786a7a2dd84f7dee16ddf9a4 is historical. Source stage and actual adapter/HTTP downstream consume the snapshot without error; prior actual indexSession tenant-isolated effect proof is unchanged.

## Failed draft and byte preservation

V1 source66dab609 and testf78db were work-only. Its actual API compiler (86 roots) failed TS2322 (nullable displayName violates existing string interface), with globally doubled blank lines/Unicode drift. work/whatsapp-snapshot-checker/v1-review-proof.json SHA 3da485f85053ee7e51d26d15cc12079aeb125555bc05d3f8b767fcc540bf9866 preserves the failure; it was never adopted. Corrected be94fb source uses empty missing displayName and a byte-preserving three-segment edit; independent reversal restores exact7fc78a4f preimage. Initial869e4d25 store, be9f32d7 route and dbae178c guide byte backups are retained.

## Explicit acceptance boundary

All44 serving pins freshly rehashed unchanged; production remains ff65725758a0ed858dda585f8ef469ffb32bf2a7afea375d0e650396b448ac1e and server fa4129a968966c6cceb1c9adc6443f42bc9f584ac7cb2feb698c07da2218bef5. Reviewed production V3 7b8e492504d4b32f2fdda2a8c65a146547b585e8efcc43cfc1e239d8b8befb64 is unapplied. No loaded runtime or live capture acceptance follows from source tests.

Root33/31 and routes32/30 structural overages remain HOLD; nested whatsapp6/30. No new direct files worsen those overages. No global structure, contracts, quality or release PASS. Existing contract verification is vacuous (no frozen contracts), not meaningful acceptance coverage.

Q4 is CLOSED by root ARCHITECTURE:124 and D-002→D-008. Remaining inputs/gates are intended archive/account selection, trusted owner MAP, real archive availability, separate sole-integrator production deployment/restart and actual configured indexing/retrieval acceptance. Full WhatsApp/R2, main Ask, web, human gold and global goal remain HOLD. Malformed upstream value/schema validation is outside this typed snapshot unit.

Checker verdict: qa/verdicts/whatsapp-tenant-isolation.md
Cycle checked: 1
Verdict SHA256: 4dd4731374a71069316333a0d75b34001586b3dd97bae50c3a7fb355e5a68d9d
Scoped source acceptance only; full configured WhatsApp/global gates remain HOLD.
