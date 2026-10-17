# t036-ssrf-documentation-prefix — cycle 0 source checkpoint

Parent full acceptance: HOLD. Scoped source candidate: checked-PASS, cycle 0, with matching independent verdict and actual broker receipts attributed below.
Manifest: qa/manifests/t036-ssrf-documentation-prefix.md
Checker-owned contract: qa/contracts/t036-ssrf-documentation-prefix.md
Original issue floor: qa/issues.T036GUARD.jsonl, ISS-T036GUARD-001, eight cases.

| File | SHA256 |
|---|---|
| packages/ingest/src/sources/guarded-fetch.ts | 9FA6EF04A97DB7096F30D1DE0F1F9EAD40FB54694F48A16071EAF387D7C9F914 |
| packages/ingest/src/sources/guarded-fetch.test.ts | 2D7B6B9DD1797EDD647C990D376755C287B01D4051F5236CD0DD4EA9568B5BEA |
| qa/issues.T036GUARD.jsonl | 2189A1B0CF4A0ADAE86046A9DF30D00FF87BEB544E6EFFDB974CF5F1A99A562E |

Actual consumer map: T036 discoverPublicWebinars -> createGuardedFetcher -> isBlockedAddress; T045 source-acquisition/onair -> same guard, before pinned native request. The function export/call shapes are unchanged. Five original address spellings plus outside-prefix boundary call the actual address guard; both original mixed-DNS sets call the actual guarded-fetch path with injected resolver/transport and assert no transport call. Additional redirect coverage asserts refusal at the second hop. No external DNS, HTTP or provider endpoint is involved.

Independent static issue source and exact policy were recorded before repair; no failing test output is asserted. Root-granted repair mirrors the existing T052/T060 documentation-prefix range semantics. Tests read the original recorded corpus directly. Attributed final result must name the 8-case floor instead of reporting only the supplementary corpus.

Actual 120-second-capped broker command: bundled node --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/ingest/src/sources/guarded-fetch.test.ts. Exit 0, 42/42 PASS, fail 0, elapsed 902.834 ms; original issue replay test passes. ISS-T036GUARD-001: 8/8 recorded cases passed (five blocked, two mixed-DNS refused with zero request, one outside-prefix allowed). Original source-line count 21 did not count dynamic declarations; actual 42 supersedes it. Three source/test/ledger hashes unchanged before/after. No RED/endpoint-exploit evidence is inferred.

| Immutable broker evidence | SHA256 |
|---|---|
| qa/evidence/goal-t051checker-broker-t036-guard.json | 255C4DE0CB02B6074FEFD7970E91B24254FA651FFA596F3FAF0B4F8EFBB1C5F6 |
| qa/evidence/goal-t051checker-broker-t036-guard.stdout.txt | 6A1147E88CCA97A2CB447876EDF1D53DB56BAEA7BC18D115E55762CC12E76AB4 |
| qa/evidence/goal-t051checker-broker-t036-guard.stderr.txt | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |

Independent contract SHA256: 06D3BD7DD07AF2B7344B73D5B34073EA1F837C32E819A266CFE5019DC7C77625. Shared frozen-contract validator evidence was reused by the independent checker after matching verifier/registry bytes; its research-phase vacuity is not behavioral proof of this repair.

Matching verdict qa/verdicts/t036-ssrf-documentation-prefix.md is PASS, Cycle checked 0, SHA256 BA47AD2BD849CF46A35C03A0374394E836EBCDA644F5E3E41A9F8B72A95E43F4. Independent smallest broker probe, qa/evidence/goal-t051checker-broker-t036-independent.json, exited 0 in 301.5871 ms: exact address boundaries 3/3 and actual public caller redirected mixed-DNS refusal 1/1 with no second transport. Receipt SHA256 C43E8BF9AFF4BFB2A154F559A63052D62B9F39C166367696DC3D7B330DDBFC83; stdout SHA256 8ECB85F2775609003AC7D23529682D0DC5C5AAD31D10C3C4EA62F9CB73DF5187; stderr empty with SHA256 E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855.

Maker closeout rechecked all six tested source/caller pins; they still match the executed candidate. The issue shard subsequently changed only through checker verification metadata, current SHA256 943E1AAD3C821151E25A02D397E3D4AC3B5DA6848809F1C29339EEC223EF0411. Its original eight reproductions are unchanged, and the original executed shard SHA above remains the permanent measurement reference. No duplicate suite, validator or provider execution occurred. Full T036/T045 host/live/privacy/provider gates remain unchanged; this PASS does not verify the separately queued native transport or full discovery suite.
