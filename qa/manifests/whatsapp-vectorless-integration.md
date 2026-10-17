# Manifest — whatsapp-vectorless-integration

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 2
Task: T-007
Priority tier: 2 — high uncapped source-consent/data-write security.
Issues: ISS-WAVECTORLESS-001, ISS-WAVECTORLESS-003; ISS-WAVECTORLESS-002 race explicitly remains open.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md C9–12; qa/contracts/goal-t007-visibility.md C1–3, C6.
Packet: qa/packets/whatsapp-vectorless-integration.md

Authorized scope: refuse explicitly withdrawn source consent in the canonical WhatsApp evidence check before insertion, review reads, decisions and idempotent retries. Existing transaction, candidate-only materializer, reader quarantine and central route composition remain intact. No keys, provider, real database, browser, upstream archiver or external send used.

Security flags: tenant-scoped source evidence, consent, review data writes and trust publication. Full ceremony is required. Maker does not edit contracts or checker verdict.

## Exact leased changes

| Path | Base SHA256 | Candidate SHA256 |
| --- | --- | --- |
| apps/api/src/whatsapp/review/store.ts | F987AF4E47CBBC3E27C565BE8F8F8E462A099CF738E81D88EA60CA7B6F2839B3 | 3FC69E145C88BE966CB37427FB9E7586FD570005FFDDE7F7CA94E476DB96F8B2 |
| apps/api/src/whatsapp/review/store.test.ts | F31F4614867BC0C75475A69A4BB130D87D0F6144BDAD107A45CA6D96D12AF5E9 | BD3B077E9E473B0B2ED1F60E82EF4C050BA4FC394E03F1067671FC1BA2878985 |
| apps/api/src/whatsapp/store.ts | 7E35AA7EAFFB70229D8646AEF7CF43EE37E97F077CF3D4ECF8DD27200ECE0AA4 | 75995F58961B2F5DA3F2B39C5CF440FC0C726D6540D947FEA79ABAA0A8132882 |
| apps/api/src/whatsapp/store-source-id.test.ts | 435D427232E75199DBC27E49C3A5B21F0643B2AC1933577CF1E248B649703839 | E811B1153342B5B239EE313616B88935A4599737C29E94743466B1555C6E20E2 |
| apps/api/src/whatsapp/store-snapshot.test.ts | A926E8BCC00048FDB582FD905BDDF08BB1EA64C1F34CC1919F200C1AE190F3CF | 4A366FEDC467B60621C29C602500A8BAA723D7E149F1E1F748523726F8D63CDB |
| apps/api/src/whatsapp/store-isolation.test.ts | 2D7B883F8E1C429DB1D15478B611BBF5BFC892E2D3A083DF1670C4DC0A92B199 | 140C61CF6B87C2C4CC9D087576EB322D660315873195F7406C742B79680BFC12 |
| apps/api/src/whatsapp/store-mongo-snapshot.test.ts | 2816D149BDB0D818F307E7898CA959CAD04D8EC97862FD0D61CC7363816D51EB | 889681A2A936DDFDECF6A9DEFC63D5767758F7F9B6F8208124BF9F2F5F77668E |

Byte backups reside in the current TEMP wa-vectorless-store-backup directory; pre-existing uncommitted source preserved. New manifest, packet and lane issue shard had no base.

## Evidence and remaining gates

Focused command requested through root CPU broker, not yet executed. No PASS, reproduction count or typecheck result claimed. ISS-WAVECTORLESS-001 floor is exactly the three new named tests; all existing nine store cases remain. Historical ISS-377/378 floor remains in unchanged checker test and store verbatim regression. Whole T-007 gates include complete trusted-reader/graph coverage, real restart/concurrency persistence, actual Ask/citation integration, shipped review UI and detection/mutation criteria.

ISS-WAVECTORLESS-002 remains HOLD: transaction-snapshot refusal does not prove linearizable simultaneous withdrawal. No shared source revision/CAS protocol exists in this leased interface; fresh readers deny withdrawn sources but this is not substituted for write-side race proof. Central integration/schema owner must implement and independently verify the shared authorization revision protocol.

## Resumed source-authority preservation

Root authorized issue003 extension after efficiency-fix PASS. sources update now uses only `$setOnInsert`: periodic ingest initializes a new source and leaves all existing consent/authorization/future metadata unchanged. Both legacy and namespaced source identities retained. Source-id tests replay the issue's three literal cases with real adapter-produced full sources; snapshot/isolation/VM fixtures merely support the new source-write shape and retain existing assertions. wire-fixtures.ts already models `$setOnInsert` and remains unchanged (SHA1472CADA1FCBDE87DC8C5E8A0E5CEAB281C281159B577F23BB43AC7F461929F4).

Maker prospective resumed active phase began 2026-10-15T07:53:07.0597921Z; includes implementation/packet preparation, excludes earlier user freeze and broker waiting. Maker token count: null (runtime telemetry unavailable; no estimate). End timestamp/elapsed and broker evidence will be recorded on ready handoff. Issue003 solution remains unverified until broker/checker; issue002 is not solved.

Prospective phase checkpoint ended 2026-10-15T07:56:52Z: elapsed224.940seconds, explicit idle tool waits70seconds, measured maker active window154.940seconds. Token count remains null. Broker receipt/independent review waiting after this checkpoint is excluded; any later repair/preparation starts a separate phase. Measurements cover only this resumed window, not earlier pre-freeze work.

## Cycle 2 — declaration-only test collection repair

Actual cycle1 broker receipt `qa/goal-vectorless-2026-10-15/verification-whatsapp59-20261015T0824.json`: exit0, 59/59 PASS, no failures/skips/cancel/todo, elapsed11183.7536ms; issue0013/3 and issue0033/3 literal cases pass. Subsequent integrated API compiler exit2 identified exactly three untyped Mongo fixture collection filters defaulting `_id` to ObjectId (`verification-api-types-20261015T0932.stdout.txt`, lines117/130/146 in test). Cycle2 imports the canonical `Sources` type and gives those three collection calls `collection<Sources>`; type-only import erases at runtime and all payloads/assertions remain byte-for-byte unchanged. Cycle1 test hash7BD6924 remains historical; current test hashBD3B077 is above. No production file changed in cycle2. No local tests/compiler ran; fresh broker attribution/compiler and independent checker pending. Parent T007/issue002 remain open.

Prospective cycle2 phase start2026-10-15T08:34:16Z; tokens:null (unavailable). End measurement follows packet freeze. Source fingerprint epoch is cycle2; no reuse of the old receipt as current-byte proof.

Cycle2 prospective active phase ended2026-10-15T08:34:43Z, elapsed/active27seconds, no broker/tool idle waits, tokens:null. Frozen afterward pending root broker.
