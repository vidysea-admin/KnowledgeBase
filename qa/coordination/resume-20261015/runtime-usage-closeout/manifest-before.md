# Runtime token metadata — real-envelope compatibility

**Handshake status:** ready-for-check
**Status:** ready-for-check
**Fix cycle:** 1
**Task:** Explicit user/root priority: runtime ordinal/order compatibility.
**Priority tier:** Current explicit user priority, continuation.
**Root:** C:/Users/product/Desktop/KnowledgeBase
**Base SHA:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
**Candidate SHA:** 72a3514fbc8f65187af387d124c5cc28d711da3f807ba6169753af83318f16c8
**Maker:** /root/parallelism_snapshot
**Packet:** qa/packets/review-runtime-usage.md
**Verdict:** qa/verdicts/review-runtime-usage.md (existing PASS historical cycle0).

Cycle0 manifest/packet/PASS preserved byte-for-byte in qa/evidence/review-runtime-usage/{maker-manifest,maker-packet,checker-verdict-pass}-cycle0.md. Current cycle building, no activation based on old PASS.

| Path | Cycle1 SHA256 | Cycle0 base SHA256 |
| --- | --- | --- |
| scripts/qa/review-runtime-usage.mjs | 694c7971c24abf1d0534808fa77772acae3d9b49ddc08ee03ddacbcad75582cb | a4ac3716872f5d5490c01157500994c5524ab8f68b97376d758b730c206607c7 |
| scripts/qa/review-runtime-usage.test.mjs | 7e6c7e26f0d25b0247c39c779068d1d63b4341f7e1c6cc91d5e214e78c65d2bc | 52da208d9a7fefe39be7b563ca75aa40c1b9ecb50ae1d5efc319b05bd8feacfc |
| qa/fixtures/review-runtime-usage-ordinal.jsonl | 6dca42de2cb7e706102eae9463d8ca540558ffc831d085b82e0af71b8941f2e9 | NEW |

Actual timestamp,ordinal,type,payload order caused unknown. Sanitized actual metadata preserves ordinal,timestamps,counters,lifecycle; IDs/path aliased. No bodies/instructions retained. New test covers arbitrary envelope/payload order, whitespace, nested fake metadata type in unrelated event. Production delta only readSession envelope filtering; parsed JSON structure authoritative. All other boundaries unchanged.

Broker RED verification-telemetry-real-envelope-red.json: ownexit1,0PASS1FAIL,~252ms, expectedknown gotunknown; oldA4AC source/new33C7 test/fixture6DCA. GREEN verification-telemetry-real-envelope-green.json PASS5/5 ownexit0/438.0818ms; all current source/test/fixture pins unchanged, original4 plus affected node executed ONCE. Scoped candidate72a3514fbc8f65187af387d124c5cc28d711da3f807ba6169753af83318f16c8 is broker scoped-pin digest, not Gitcommit. No local tests. Maker scoped actual tokens/time/cost unknown; cycle0 checker actual614949TOTAL/4413output and all overruns preserved separately, no reset/efficiency claim. Independent cycle1 review required before use/global integration.
