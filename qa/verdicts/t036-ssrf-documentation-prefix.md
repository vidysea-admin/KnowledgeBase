# t036-ssrf-documentation-prefix — independent verdict

VERDICT: PASS
Cycle checked: 0
Scope: only the exact `3fff::/20` shared-egress guard repair and its regression/consumer boundary, under checker-owned `qa/contracts/t036-ssrf-documentation-prefix.md` C1–C5.
ISSUES-WRITTEN: none; verifies existing ISS-T036GUARD-001 after final source pins matched.

Full-parent `goal-t036`, T-045 and operational release remain HOLD. This verdict certifies neither mounted public discovery nor actual provider, host, account, admission, registration, capture, alert or release acceptance.

## Independent findings and acceptance

The inspected diff adds one numeric IPv6 refusal: first group `0x3fff` and second group below `0x1000`. Existing parsing normalizes valid compressed/expanded/case-varied inputs. No unrelated classifier policy changes occur. Outside the specific /20 remains allowed by this classifier subject to all other actual guards (C1/C2).

The standing test reads the unchanged original issue shard, checks the eight-case denominator, replays every recorded address/expectation verbatim and exercises both exact mixed-DNS arrays before any request. Unknown operations fail rather than disappear. Attributed executed maker evidence establishes **ISS-T036GUARD-001: 8/8**, comprising five in-prefix refusals, two mixed-DNS zero-request refusals and one correctly permitted outside-prefix boundary; additional spelling/mixed-DNS/redirect cases supplement this floor (C3).

Source review confirms both T-036 `discoverPublicWebinars` and T-045 `publicOnairPage` call the actual `createGuardedFetcher`, whose complete DNS-set check precedes the pinned request on every hop. The independent probe exercised the actual T-036 public caller: first resolution public, one same-host redirect, second resolution mixed public/documentation. It produced `complete:false`, no candidates, sanitized `unavailable` gap, two lookups and exactly one transport call. There was no second request to the documentation address. T-045's guarded call/export was inspected and pinned, not externally invoked (C4).

Current ready manifest/packet agree on slug and Fix cycle 0. Source/test/ledger/contract and the three immutable maker receipt hashes matched their packet pins. Broker receipts identify exact argv/cwd/times/exit, while all seven source/caller/ledger pins match before/after independent execution and the final 21:19:38 checkpoint. Frozen-verifier/registry bytes match their reusable central receipt (C5).

## Executed commands and attributed receipts

All runtime execution was performed by the sole CPU broker `/root/docker_checker`; this checker ran no duplicate suite, validator, external DNS, remote HTTP, browser, provider or mutation.

1. **Attributed maker regression:** `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/ingest/src/sources/guarded-fetch.test.ts`, cwd `C:/Users/product/Desktop/KnowledgeBase`, outer cap 120000 ms. Start `2026-10-14T21:12:29.353Z`, completion `21:12:30.260Z`, elapsed **902.8336 ms**, exit **0**, tests **42/pass42/fail0/skip0**. TAP reports internal test duration 727.9861 ms; process receipt elapsed is the separate wall measure. Original eight-case replay test passed. Receipt `qa/evidence/goal-t051checker-broker-t036-guard.json`; stdout/stderr `.stdout.txt`/`.stderr.txt` beside it. All three source/test/ledger hashes unchanged. No executed RED is claimed.
2. **Independently derived probe:** same bundled Node executable, `--import tsx --input-type=module -e <exact code in receipt>`, same cwd, outer cap 30000 ms. Start `2026-10-14T21:18:49.686Z`, completion `21:18:49.991Z`, elapsed **301.5871 ms**, exit **0**. Address boundaries **3/3**: `3fff:0fff::` refused, `3fff:1000::` and `3fff:ffff::1` outside prefix preserved. Actual public-caller redirected mixed-DNS refusal **1/1**, no second transport. Exact full inline code/argv, dependencies, output paths and before/after hashes: `qa/evidence/goal-t051checker-broker-t036-independent.json`; its sibling stdout says `T036 independent: address boundary3/3; actual public caller redirected mixed-DNS refusal1/1; no second transport`; stderr is empty.
3. **Attributed shared frozen verifier:** `python contracts/verify_contracts.py`, batch `2026-10-14T18:39:31.7184876Z..18:39:33.1459082Z`, exit **0**, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Individual duration unknown; combined central batch 1.4327147 seconds. `qa/evidence/goal-t051checker-validator.json` is reusable because validator/registry hashes still match. Its vacuity does not prove this fix; actual guard and downstream evidence above do.

Read/hash checks used `Get-FileHash -Algorithm SHA256 -LiteralPath ...` and scoped `git diff -- packages/ingest/src/sources/guarded-fetch.ts packages/ingest/src/sources/guarded-fetch.test.ts`; exit 0. Initial mistaken packet/stdout suffix reads failed path resolution and were immediately corrected using paths named by the manifest/receipt; they supplied no acceptance evidence.

## Checked SHA256 pins

| File | SHA256 |
|---|---|
| guard source | 9FA6EF04A97DB7096F30D1DE0F1F9EAD40FB54694F48A16071EAF387D7C9F914 |
| guard test | 2D7B6B9DD1797EDD647C990D376755C287B01D4051F5236CD0DD4EA9568B5BEA |
| original issue shard at execution/final check | 2189A1B0CF4A0ADAE86046A9DF30D00FF87BEB544E6EFFDB974CF5F1A99A562E |
| scoped contract | 06D3BD7DD07AF2B7344B73D5B34073EA1F837C32E819A266CFE5019DC7C77625 |
| T-036 public-webinars.ts | 7D2DCA798771C2D5CBFBBE3A30B6117C213F53F70AECF51D6F7BBB6BECC2B170 |
| native node-transport.ts dependency | 61D0C702BEAFC166B8111F53C5E6B639B55B48642C863854B2CEE8A97B2BEA10 |
| T-045 source-acquisition/onair.ts | 7418A4757F6BEC15EDD016C76D69553F26000C2BEC88504F0ACB3F2A798E7033 |
| ingestion export index | BD6EFF48332D6A650610A2F097F8FE30801B8668D002EC3060689A41105A43A6 |
| contracts/verify_contracts.py | 1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3 |
| contracts/contracts.json | D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940 |
| maker receipt json | 255C4DE0CB02B6074FEFD7970E91B24254FA651FFA596F3FAF0B4F8EFBB1C5F6 |
| maker stdout | 6A1147E88CCA97A2CB447876EDF1D53DB56BAEA7BC18D115E55762CC12E76AB4 |
| independent receipt json | C43E8BF9AFF4BFB2A154F559A63052D62B9F39C166367696DC3D7B330DDBFC83 |
| independent stdout | 8ECB85F2775609003AC7D23529682D0DC5C5AAD31D10C3C4EA62F9CB73DF5187 |
| both empty stderr files | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| shared verifier receipt json | 53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB |

## Phase checkpoints and timing

Checker launch recorded **2026-10-14T21:15:52Z**. Scope/source/caller review and reuse checks completed by the measured **21:16:58.2550855Z** read checkpoint. Exact broker queue-request/approval times were not independently clocked; execution timestamps above are known. Independent probe completed at **21:18:49.991Z**; receipt acquisition/final pin check confirmed at **21:19:38.3483696Z**, **226.3483696 seconds after recorded launch**, before verdict persistence. Draft/persist followed this checkpoint; completion is recorded below after confirmation. The focused target was exceeded while waiting for the sole shared broker and obtaining its receipt; no suite or acceptance coverage was expanded. Queue waits and individual review/draft intervals remain unknown rather than being attributed by subtraction.

EXPLANATION: C1–C5 passed for this current cycle and bounded repair. Existing eight-case evidence is reused with exact current pins; one independent caller probe adds relevant behavior without duplicating the suite. Issue verification metadata may subsequently change, but its original reproductions and executed shard hash remain permanently recorded here. Full T036/T045 readiness, actual connected sources, mounted owner/tenant/privacy enforcement, host recovery, alerts and release observation periods remain unverified.

Initial verdict persistence confirmed at `2026-10-14T21:20:57.0830684Z`, 305.0830684 seconds after recorded launch. The confirming hash command took 0.5113582 seconds, exit 0. A subsequent final seven-pin verification before issue-metadata closeout again matched all executed source/caller/ledger bytes; no candidate change was found. This timing annotation follows initial persistence and is not an invented end-to-end 2–3-minute measurement.
