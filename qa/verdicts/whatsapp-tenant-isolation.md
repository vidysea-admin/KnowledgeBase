# WhatsApp tenant isolation and message snapshot — independent checker

VERDICT: PASS (scoped source tenant isolation + single-message-snapshot boundary)
Cycle checked: 1
ISSUES-WRITTEN: none

Request manifest at ready-for-check/Fix cycle1 SHA ba160e388f6799f7b65655ca0d5b96228edee6eea955ed505d128e06ca276d1a. Source current identities:

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

The checker independently surveyed the actual upstream ObjectId owner/schema/index bindings, performed real API compiler overlays and authored the default-Mongo snapshot adversary. Maker project_handoff authored implementation/parser and the other focused tests. The independent adversary is one case, not the whole evidence: all13 existing security/HTTP cases and all3 maker snapshot cases also passed together. The checker did not implement or adopt the source fix and did not self-certify maker-only runs.

Independent17/17 PASS, no skips/failures (11680.5106ms), and actual compiler87 roots/zero diagnostics (4170ms) are saved in work/whatsapp-snapshot-race-checker-proof-v2.json SHA 94d56e91e49da75dd21367605112d22f4f979feafff5ebe38bd3da4876c5cc91. The exact subsequent adopted source17/17 serial test replay (6744.0656ms, tool bb80bf) and actual API tsc exit0 (tool a8120f) are maker-attributed outputs, recorded with exact commands in receipt ed07c8c0aeb356b884a2968407a145e9eefa3d595e569c39c8373d01efc8b3e5; no post-copy duplicate test run is claimed. Actual adapter and authenticated HTTP consumers ran in the suite; prior actual indexSession fake-DB source/session/turn/page/claim/tree isolation is recorded in f0677481ebb8784555539ae81854a86cc38331aac9591fb0e2b124c7a1315c9a.

Missing/unmapped/invalid owner configuration refuses before archive/write/index effects. The authenticated tenant wins hostile client payloads, owner/group checks reject foreign groups, and raw archive group/tracking/message/person reads remain owner-qualified. Same-group distinct owners retain isolated IDs and downstream entities. One normalized, frozen, request-local message snapshot supplies IDs and all actual adapter-read payload/time fields, so archive mutation after the first read cannot join different snapshots. No mutable shared cache or relaxed source authority was introduced.

Historical work-only V1 failed TS2322 and had global encoding/blank-line drift; proof3da485f85053ee7e51d26d15cc12079aeb125555bc05d3f8b767fcc540bf9866 is retained. Corrected sourcebe94fb is a byte-preserving three-segment patch; its exact inverse restores adopted7fc78a4f bytes. Initial owner-fix adoption af218595 and subsequent snapshot adoption ed07c8c0 receipts, c2f93 adoption verification, f067 schema/indexer proof and94d56 snapshot proof remain separately attributable; no historical result is rewritten.

Post-copy checker verified4 snapshot copies/preimage backups, unchanged other initial source/doc paths and ALL44 physical serving pins. HEAD020659549242faddba478362efe2d58e60cdf332/index997c44c99a0110a05f1ee158b0a6c8044b41ce32f114e522d985823076043c92 unchanged. The only prospective pin intersection is production.ts; reviewed V3 remains unapplied and server unchanged. Runtime/app/account/service state was not probed or changed.

EXPLANATION: scoped source PASS only. Global directory overages root33/31 and routes32/30 remain HOLD; new nested folder6/30. No meaningful frozen-contract coverage/global contract PASS is claimed. Guide contains a historical work-only-fix sentence; authoritative source adoption/current hashes here establish adoption, while loaded runtime remains pending. Scalar coercion is not a full malformed-upstream schema-validation unit.

Root Q4 consent is CLOSED by D-002→D-008, not an unresolved permission gate. Account/remote-vs-local archive choice, trusted owner MAP and real archive availability remain pending, alongside separate sole-integrator production deployment/restart and actual configured WhatsApp indexing/retrieval. Full WhatsApp/R2, Ask, web, gold and global/release acceptance remain HOLD. Only this dedicated manifest/verdict handshake is closed; no shared ledgers, TASKS, .goal or broader WhatsApp QA changed.
