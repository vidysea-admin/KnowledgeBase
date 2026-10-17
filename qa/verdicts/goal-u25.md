# Independent verdict — goal-u25

VERDICT: PASS
Cycle checked: 1
Scope: qa/contracts/goal-u25.md S1–S6 only; full U2.5 parent acceptance P1–P4 remains HOLD.
ISSUES-WRITTEN: none

The ready-for-check cycle-1 candidate satisfies the authorized local extraction/persistence safety scope. Earlier u25decisions cycle-0 acceptance is historical; it is not rewritten. This verdict permits the maker to close this matching safety manifest only. It does not mark U2.5 or U2.2 done, enable production extraction, or approve provider/semantic quality.

## Independent review and findings

Reviewed all changed extraction and persistence logic, all three candidate test files, the tenant-scoped accessor, schema shape, and the current indexSession flag/degradation consumer. Source validation rejects invalid or mixed scope, duplicate IDs and invalid times before provider/DB use. Unusable/partially filtered responses remain degraded and issue no decision writes. Genuine empty output remains distinct.

Content-addressed proposed IDs include tenant/session, normalized text, sorted deduplicated real evidence, source span and validated owner. Insert-only proposed upserts preserve previous bytes; pruning occurs only after every upsert succeeds and targets exact prior stale proposed IDs under tenant/session scope. Verified/needs-review legacy rows survive with IDs/status/content/provenance intact. Concurrent review cannot revert a row to proposed. Partial failure can retain additional proposals and is reported degraded by indexSession; this is explicitly not atomic replacement. Result.count is extracted candidates, not stored-row count or semantic quality.

Independent authored probes exercise two boundaries beyond the maker suite: a proposal becomes verified after the read but before stale cleanup; a proposal gains another session's evidence in that interval. Both must survive actual deletion-time predicate evaluation. Both passed.

ISS-U25DECISIONS-001: 2/2 recorded scenarios independently replayed and prior loss refused. The ledger contains two textual reproductions, no runnable command or larger corpus. The focused checker run retains their verbatim test descriptions: successful re-extraction must preserve verified/needs-review legacy rows; write failure must not erase preexisting rows. No recorded case omitted. No mutation/product file was applied for testing.

## Actual commands and attributed evidence

The sole CPU broker /root/docker_checker executed both bounded commands centrally. I authored the two independent probes, reviewed source and exact receipts/output, and performed current hash checks. No duplicate full suite, validator, typecheck, provider, browser, real DB, network or production write was run by this checker.

1. Reused current maker stage/downstream evidence: `C:/Program Files/nodejs/node.exe --test --test-concurrency=1 --import tsx packages/index/src/pipeline/notes/decisions.test.ts apps/api/src/indexing/decisions-persist.test.ts apps/api/src/indexing/session-decisions.test.ts`, timeout 60000 ms. 2026-10-14T20:02:23.574Z–20:02:26.735Z, exit 0, wall 3155.4434 ms, reporter duration 3054.8648 ms: tests 30/pass 30/fail 0/cancelled 0/skipped 0/todo 0. Exact receipt: qa/evidence/goal-t051checker-broker-u25.json (SHA256 1D5FFF33F073F7214F5BB79C047CBC0707CD8081A19111867CECA3031A284450); stdout SHA256 BBC811FEA804F8F67B96114066496BD49B3B1F5B4F6751BBF582326379B62068. Ten broker before/after pins unchanged. This includes default-off/on indexSession consumption, caught persistence degradation, actual 51-turn In-Focus source through scripted provider→persistence→actual extraction harness, and filtered/persisted provenance checks. semantic.measured remains false. The source is not labeled as a genuine semantic decision; it tests transport/provenance only.

2. Independent check: `C:/Program Files/nodejs/node.exe qa/evidence/goal-u25/run-check.mjs` (outer timeout 65000 ms), spawning `C:/Program Files/nodejs/node.exe --test --test-reporter=tap --test-concurrency=1 "--test-name-pattern=ISS-U25DECISIONS-001|independent atomic" --import tsx apps/api/src/indexing/decisions-persist.test.ts qa/evidence/goal-u25/independent.test.ts`, inner timeout 60000 ms. Outer 2026-10-14T20:11:17.312Z–20:11:20.057Z, exit 0, wall 2739.3588 ms; inner 20:11:17.419Z–20:11:20.032Z, wall 2609.1719 ms, TAP duration 2521.0134 ms. Exactly four selected tests: pass 4/fail 0/cancelled 0/skipped 0/todo 0. The name filter intentionally selects the two ledger cases and two independent races; the remaining maker coverage is attributed to command 1. Outer twelve pins unchanged; inner fourteen pins unchanged, hashChanges empty. Exact immutable outer receipt/logs: qa/evidence/goal-t051checker-broker-u25-independent.json and corresponding stdout/stderr. Inner receipt/output: qa/evidence/goal-u25/independent-receipt.json and independent-output.txt.

3. Reused frozen validator receipt qa/evidence/goal-t051checker-validator.json (SHA256 53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB): actual `python contracts/verify_contracts.py`, exit 0, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Batch 2026-10-14T18:39:31.7184876Z–18:39:33.1459082Z, combined duration 1.4327147 seconds; individual validator duration unknown. Registry SHA256 D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940 and script SHA256 1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3 match current bytes and independent runner before/after pins. Vacuity is not stage acceptance.

The first historical maker attempt's 29/30 sample-count failure (expected 291, actual 51) is acknowledged and superseded by command 1's corrected green result; no source data was altered. The direct TypeScript extraction harness was not among command 1's ten broker pins. Its extra post-run read and the independent command's before/after pin both match F61DB7DE33998EB2E9BF5D27904B22F625672DF002F35101A86A80675BE11430; no stronger historical provenance is inferred.

## Checked final hashes

Current candidate hashes rechecked 2026-10-14T20:12:00.7114601Z; all five match packet and both broker receipts:

| Candidate file | SHA256 |
|---|---|
| apps/api/src/indexing/decisions-persist.ts | 4E27DC1798C3707D871D90600089FFD119FC6566946D68BAC8126693C38C3975 |
| apps/api/src/indexing/decisions-persist.test.ts | AA25549E8ED90F22F56DF04F120C2C541EA4C92BB5E578F9F4D3622129C24EB7 |
| apps/api/src/indexing/session-decisions.test.ts | 794B9DF694B2E3AE5A1A6D3766183116B408CEADB1B017A7C6790A04E030B7F8 |
| packages/index/src/pipeline/notes/decisions.ts | 30B050B886A17BDD8661AF55F46C2A95D640A6C8F47077DA555CE7B9CBD84EE0 |
| packages/index/src/pipeline/notes/decisions.test.ts | D8508665B65D66648E3D0B6592AECE9AB6B80EF70F4D2567D6B3C05265C82EB7 |

Relevant dependency/contract hashes and all fourteen before/after pins are retained in independent-receipt.json. Current session.ts is C3A37514A70EABA215B58FF66DC92A64C8A06FAAD5D44920780E8B1B3D17FA39, tenantScope.ts F9AB2F8FA8D21DD661D9752CFA85912FA548255EF85A0018E048634BC95EE513. Source turns E831DC37EB547A4AFCFEC47287331D7785713F3116DB6D8CDA1486BCF04F243E. Contract 2BFC6CBA429B36DAF3BA7CAA6A068A42D40DD82E9C344D277E7039BF35575F73; independent probe 2E7D2A9A0FEEE2158EE8D2D33702A2CD7715E5C5405E0CDF435E6CE828E7A8E3; runner 95261759D653459E0F45D1A1E12CBE6B20A87E35FDD32587F7405E2C3E2646EE. Ready manifest at final read SHA256 93EEB5A3A3A2E845F92D3B546765075BC4E860CBC44B2F5D69198402D2C5B0F3; packet F57AC7E9E6D6A6880EF2B7EFB3130E6948EFF3E9C32CE03D3072D90ECCDA0757.

## Timing and remaining gates

Current READY verification launch/scope-read timestamp: 2026-10-14T20:05:02.9294054Z (first measured shell timestamp); exact dispatch time unknown. Prior contract/pre-read and the earlier user-directed pause/resume are separate historical preparation, not hidden inside a claimed 2–3 minute check. Current consumer/read checkpoint ended 20:05:20.6847127Z. Runner/count-selection preparation checkpoint 20:06:07.5730466Z. Fresh broker slot request followed; exact request, approval/grant and wait timestamps are unknown. Actual broker command timestamps above are measured. Final receipt/hash review began 20:12:00.7114601Z. Draft/persist start and confirmed completion are appended below; unmeasured gaps are not attributed to drafting or approval by subtraction. The 120–180-second efficiency target was exceeded because necessary independent CPU evidence remained in the serialized broker queue; required coverage was retained.

Full-parent P1–P4 remain HOLD: actual configured-provider extraction on decision/no-decision real sessions; actual persisted product/API/UI consumption; U2.2 dependency and separately acquired raw/parsed/filtered/persisted measurements; actual individual Umesh decision-gold approval under D-163; explicitly approved binding thresholds and semantic/precision/recall acceptance. Source fixtures, JSON declarations, fake providers and this safety PASS do not satisfy those gates. No genuine human decision gold or binding threshold is fabricated. Global integration/types/release gates remain separate and are not claimed green.

EXPLANATION: no independent acceptance violation found within S1–S6. No new issue filed. Existing issue's two data-loss scenarios are refused on these checked bytes; its tracker/ledger closure belongs to the assigned central owner and does not imply full-task acceptance.

Persist checkpoint: 2026-10-14T20:13:59.3191169Z; measured READY-review-start to this checkpoint: 536.39 seconds. Exact initial draft/write tool timestamp unknown.
Persistence checkpoint before final read-back: 2026-10-14T20:13:59.3914575Z; measured total to this checkpoint: 536.462 seconds. The subsequent command read back the verdict successfully and computed its hash; that command's exit was 0.

Confirmed final read-back timestamp: 2026-10-14T20:14:18.5150807Z. Post-persistence final-pin check at 20:14:36.4455033Z: all fourteen independent-receipt hashes unchanged, exit 0; manifest remains ready-for-check, Fix cycle 1. Measured READY-review-start through that final confirmation: 573.516 seconds. Final metadata append follows that confirmation; its exact completion timestamp is not measured here.
