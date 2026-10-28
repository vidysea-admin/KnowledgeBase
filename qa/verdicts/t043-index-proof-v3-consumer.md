# Verdict — t043-index-proof-v3-consumer

VERDICT: PASS
Cycle checked: 0
Scope: C1–C7 of qa/contracts/t043-index-proof-v3-consumer.md, SHA256 26FB0A286D4A1913A61EE045E6143D6AD86F97FACF2BB9E67244949FB835C0B9. This is the narrow actual v3 proof block → capture validator compatibility repair with local synthetic index-boundary fixtures. It is not full T-043 acceptance; qa/manifests/goal-t043.md and parent T-043 remain in_progress.

## Candidate and independent review

Matching manifest was ready-for-check, Fix cycle 0, SHA256 2CC5BF2448671D47BDA9C92756B59C6C5CFABD85620CFF2CF430C3DDE10463B6; packet SHA256 C161B1CBBD3F212A2F878B0ACEB5F9AE72AD0D47DBE980B574C5FC058B681823. Maker's claim was independently checked against all new consumer/test/fixture logic, the actual sync proof block, the actual capture consumer, secure reader and preserved original capture bytes. Get-FileHash independently confirmed all nine current candidate pins equal both before/after maps in the actual repair receipt; final candidate/handshake check completed at 2026-10-15 00:24:06 UTC.

| Current file | SHA256 |
|---|---|
| packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs | 9EA8A3B811B71035746F70FB32B56A12E2CAB69F68C69F8CFFFB7B5190AD4527 |
| packages/meeting-bot/src/workspace/index-proof-fixture.mjs | 01498EA293641A4DF82AB472A0ACB8AB0C9FDBB9F08CE38682055756EDE2A844 |
| packages/meeting-bot/src/workspace/index-proof-identity.test.mjs | A33C5E184191CEE231470FB74837A7E0DE67BD1642AD64F86C574DCA515D9BCF |
| packages/meeting-bot/src/workspace/index-proof-consumer.ts | 1568F08EC400844F885DEFD9DB05D4B3B054A865BBB12911A2ECC7525B4B7E4A |
| scripts/webinar/sync-session.mjs | 9896EFF9E8FDC9E6298ACA5CF751C708C45E8C24CFD2ACF8B42ACB96FD5A4012 |
| packages/meeting-bot/src/capture/record-finalize.ts | 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8 |
| scripts/webinar/index-proof.mjs | 7E548F2C2F643D6D3F6AFBA6C2360AAF225A7B531B6DC7E2D0FB2439283843EB |
| packages/ingest/src/retention/production/private-summary.ts | E78E427AB662036994C846B62F9B904334FFB7D1A8270956B40035B24AF50181 |
| packages/ingest/src/retention/production/private-summary-read.ts | 3F451BF9B51D76671F28A7AE132C84F99E8D370FE86F131564CF6C65BA5554F0 |

Independent findings by criterion:

- C1: the fixture extracts the exact current `const baseProof = finalizeIndexProof(res);` through the following proof writer, invokes it using the real prepared helper and retention IO, and imports the actual capture validator. The valid case asserts version 3; it cannot hide the regression by relabeling the producer output. Original consumer/test/fixture hashes and two genuine failures are preserved, with the same six-case floor in the repaired ten-case replay.
- C2: v3 checks current source ID/hash, independently expected work DB (including refusal of lkb), current session source/tenant/identity and done status. testData true forces lkb_staging. Expected DB originates in the caller/environment, not proof contents. Reused wrong-source/database/session and test-data bait probes agree with the direct guard review.
- C3: literal artifact selection, exact byte hash/count, passed speech gate or done combined gate, and strict core stage/generation guards precede return. Actual valid speech-only and combined cases pass; changed bytes/count/status/gates refuse. Snapshots are re-read for unchanged bytes.
- C4: the added hostile-row probe rewrites matching input/gate/proof hashes before testing foreign tenant/session, duplicate identity, reversed/null timing and empty speaker/text. Thus those refusals cannot be credited merely to stale hashes. The new typed guards explicitly check record shape, finite ordered nonnegative timing and unique identities.
- C5: comparison to preserved original capture source identified only the new import and validateIndexProof delegation/signature in this existing file. The new consumer guards unknown JSON, makes bounded read-only reads and does not mutate or call providers. The reader checks physical directories, regular single-link files, descriptor/path identity and size/time before and after each read. Surrounding capture/provider/privacy flow is outside the changed hunk and unchanged relative to the preserved base.
- C6: legacy v2 deliberately retains core tenant/session/hash/stage guarantees plus count/string-generation checks. It does not inherit v3 source/database/session-status/row/gate guarantees. Manual downgrade rejection and authenticated proof provenance are not demonstrated; no such safety claim is made.
- C7: matching cycle/slug/contract, actual terminal receipts and nine final matching pins checked independently. No changed candidate or unsupported intended verdict was substituted.

## Attributed execution reused, not independently rerun

Root explicitly authorized crediting the unchanged preserved ordinary-executor receipts and prohibited duplicating them without a new reason. The checker performed source/hash/provenance review; it did not execute these tests, mutate product files, start a process handle, or call a provider/database/browser.

Program: C:/Program Files/nodejs/node.exe; cwd C:/Users/product/Desktop/KnowledgeBase. Original exact argv:

```text
--test --import tsx --test-isolation=none --test-concurrency=1 --test-timeout=30000 packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs
```

Original `qa/evidence/goal-t043/v3-consumer-cycle1/original-red.receipt.json`, SHA256 4870246C67CA09DB89FFD62854F171669D1F28ABCBA3345DE74E69C11A4C0A93: started 2026-10-14T22:43:58.4970069Z, completed 22:43:59.7618207Z, elapsed 1267 ms; exit 1, terminal, no timeout; stdout 6 tests / 4 pass / 2 fail, test duration 1029.2706 ms. Failures: actual v3 output refused by the v2-only consumer, and speech-only input attempted missing knowledge-turns.json. Original before/after pins were unchanged. Original source snapshots independently match producer 9896EFF... and consumer 9996474DEDF2628151A5941B9A353FBE934C59A19348F87FD5E6BC682D64E056.

Repaired exact argv adds the four-case file:

```text
--test --import tsx --test-isolation=none --test-concurrency=1 --test-timeout=30000 packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs packages/meeting-bot/src/workspace/index-proof-identity.test.mjs
```

`repair-replay.receipt.json`, SHA256 EF596313AF5837A3C44E57C5D384A742B2E58D27E3F4CBD26F1972F119EB1744: started 2026-10-14T22:48:41.9139090Z, completed 22:48:43.9396604Z, elapsed 2028 ms; exit 0, terminal, no timeout; stdout 10 tests / 10 pass / 0 fail/cancel/skip/todo, test duration 1838.0198 ms. Both specs have 60000-ms outer timeout. Exact stdout/stderr remain beside each receipt. Replay spec SHA256 24F4E6EDC4A3BD7DA2161C7FDAAB1B32CE7A63037ECD370D760800EB19BEAA69; replay pin-map SHA256 3B5FF9AC2C9A75C9F85472E549559F857A579B8933CF39B35D27BD3EDE808E56. Source snapshot, spec, receipt and candidate hashes were independently compared with current files. No ledger issue was assigned to this repair; issue-reproduction count is not applicable.

## Timing and remaining gates

Exact dispatch/launch time is unknown; first recorded checker clock was 2026-10-15 00:18:47 UTC after initial source/pin reads. Scoped authorization and contract/packet preparation occurred during this resumed review; their exact individual message times are unknown. Review/final handshake and pin check ended at 00:24:06 UTC. Verdict drafting/persistence timing is recorded below after the write is confirmed. Total launch-to-verdict duration cannot be precisely measured; the known interval exceeds the 120–180 second efficiency target because scope/contract and a matching ready submission were established during this review. No unmeasured interval is attributed by subtraction to approval, execution or drafting.

Draft work began after the 00:24:06 UTC final review checkpoint; exact sampling start is unknown. Persist command started at 00:25:34 UTC. At 00:25:47 UTC, Test-Path/Get-FileHash confirmed the persisted verdict and a post-write audit confirmed zero changed candidate pins (nine paths checked); that read command exited 0 in 0.4147499 seconds. The measured first-clock-to-persist-confirmation interval is 420 seconds; actual launch-to-verdict total is unknown because the first reads preceded that clock. This timing annotation changes only verdict metadata, not checked candidate bytes.

Read-only independent commands used Get-Content for the named source/receipt/manifest/packet files; Compare-Object on preserved original versus current capture source; Get-FileHash for original snapshots, specs/receipts, all nine current candidate paths and three handshake paths; and clock reads. Final exact pin audit iterated `Get-Content qa/evidence/goal-t043/v3-consumer-cycle1/replay-source-pins.json -Raw | ConvertFrom-Json`, then `Get-FileHash -LiteralPath $_.Name -Algorithm SHA256` for each property and compared against its value. It returned nine Matches=true and the three matching handshake hashes, exit 0 in 0.4158927 seconds. Earlier source/read/hash command durations were 0.5745756, 0.807076, 0.5906189, 0.6687878 and 0.9137581 seconds, each exit 0; these are shell execution durations, not total thinking/waiting time. No new test execution is attributed to this checker.

contracts/contracts.json independently read as stages={}; no frozen-stage verifier execution is claimed or applicable to this scoped fixture proof. Project-wide typecheck, full sync CLI/media/provider/index/Mongo/Ask, real tenant isolation, original corpus accounting, separate marker gate and full T-043 C3–C10 remain unverified by this verdict. This PASS does not authorize production or live calls or any parent tracker completion.

ISSUES-WRITTEN: none
EXPLANATION: The unchanged original regression floor now consumes current v3 output through the actual immediate validator, and its four added hostile-identity probes pass on the independently pinned repair. Scoped C1–C7 hold. The full parent remains open, with the legacy limitation stated rather than inferred away.
