# T-034/T-035 original private EOF across actual finalization

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 1
**Task:** T-011/T-034/T-035; ISS-CAPTUREMAKER-002.
**Priority tier:** 2 — uncapped high privacy/source-identity boundary, root explicitly authorized source integration.
**Authority:** D-173; root lease record-commands.ts, record-finalize.ts, workspace/finalize-workspace-recording.ts and focused tests, then additive original-capture helper notified before writing. No pre-READY checker.
**Contracts:** qa/contracts/goal-t034.md C4/C5/C6/C7; qa/contracts/goal-t035.md C4/C5/privacy extension. Scope is source-clock integration only; full parent remains HOLD.
**Base:** HEAD5c4cbade2d1a8aa4815de13d587db8de3b01cc4a plus preexisting working-tree capture/privacy implementation; new helper and new test paths had no base. Existing helper EOF fix already scoped-PASS and unchanged.
**Measured maker phase:** 2026-10-15 07:56:37 UTC→08:04:05 UTC wall448seconds includes broker freeze/wait; active CPU time unmeasured. Maker never ran tests. Source frozen08:04:05; subsequent packet-writing is separate.

## Candidate source pins and complete change map

Paths under packages/meeting-bot/src/capture/:

| Path | SHA256 | Change |
|---|---|---|
| record-commands.ts | 2470E5AE520AAE23B3493766304B8F07114D129ED9AB737F73A40C29C8C6CBF3 | Normal and recovery do remux-only before finalizer, forward explicit lean flag plus retained original path. Existing playable suffix recovery follows controller's established original mapping; missing original cannot fall back for private capture. |
| record-finalize.ts | EE71C4F75157800F2B68E38FC9E83B1C0E4049F61A659FA7C9C29C7CE587AA53 | Read exact owner consent, bind immutable original, private captures probe/encode original clock before lossy conversion. Unknown raw duration refuses instead of trusting remux. Recheck original hash and receipt before audio/source/provider; source includes original path/hash and existing generation. Public remux selection remains. |
| workspace/finalize-workspace-recording.ts | 3CB277951B09602E0D794C8D23387A8CCCDF38C6421001CF7B9DA5D82A521F63 | Compatible trailing optional lean/original args populate finalizer overrides. |
| workspace/original-capture.ts (new) | AC1D5EB40D775D1AB8678DC02F14E9FB5931B500F3BD519B2AFBDFAD9AF609E8 | Read-only physical slot/path/ancestor/hardlink/file-size guards; only exact original or its named playable remux. Bounded streaming SHA and identity/hash reread refuse mutation. |
| workspace/original-capture.test.ts (new) | 990E26664EEA989DADB190B69929F9A2EDB94328DAEB5D6A51B383FA37694ACD | Two cases: confinement/remux relation/changed bytes; actual recovery caller lean+original forwarding. |
| finalize-original-eof.test.mjs (new) | 006E687DB510AC829728FA6D2A103D779D3020F8D0139E314C2994F7C02120C8 | Five cases: actual finalizer direct privateEOF/closed publictail; actual remux variants; unknown originalclock refusal. Uses unchanged literalD07C93 corpus, real masking/extraction/probe/decoded tail, no provider. |
| workspace/record-stop-regression.test.ts | 55E23067E6B40CDF74023200C98FF22A86AEFC70F7FAEA16B1F88E74A956CC85 | Existing four fake-child caller regressions retain their cases; clean path adds --lean-video and asserts normalization=false, finalizer lean=true. |

Other writes: qa/issues.capturemaker.jsonl adds ISS-CAPTUREMAKER-002; this manifest. No contracts, verdicts, historical evidence, provider helpers, schemas, decisions or central trackers edited. Security flags: data writes, tenant/session consent, source identity, privacy before provider; no auth policy change.

## Exact ledger floor and consumers

Literal original corpus: qa/evidence/t035-lean-video-measured-encode/eof-baseline-zeYvkn/stale-duration-source.mkv SHA256d07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7, declared12.0s with actual audible tail beyond12s. No fixture regeneration. Existing helper's33case and prior retained-media GREEN remain attributed only to that unchanged helper, not fresh consumer proof.

Immediate caller runRecord/runFinalize→workspace wrapper→finalizeRecordingWith→prepareRecordFinalizerInput→unchanged normalizeLeanCapture. Before proof/provider/source publication original path/hash and exact receipt/generation remain bound. Public original and public prefix stay retained; whole derivative duration must remain>12 and<=12.25, EOFtail<=-80dB for9..12, later publictail>-60dB for9..10. Remux variants retain exact original packets with explicit Matroska because the existing corpus is H264/AAC, not Chrome VP8/Opus; this is declared synthetic regression only. Unknown raw duration has no guessed production fallback; real private Chrome timelines remain NOT VERIFIED.

## Broker request and pending evidence

Bundled node C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, cwd packages/meeting-bot, sequential commands:

1. `node --test --import tsx src/capture/workspace/original-capture.test.ts src/capture/workspace/record-stop-regression.test.ts` — six expected, real disposable Node children/loopback+filesystem, outer60seconds.
2. `node --test --import tsx src/capture/finalize-original-eof.test.mjs` — five expected, tiny retained12s corpus real FFmpeg only, outer245seconds/pertest120seconds. Sole broker schedules after current index batch under root smallfixture media lease; no browser/media capture/provider/database/external send.

Actual receipts, counts, exit codes, unchanged pins and independent checker pending. No production writes, browser, host capture or maker CPU. Full60minute/two-tab/actual private timeline/provider/OBS/Ubuntu/sevenday gates remain open. Earlier literalT03815 PASS and vectorlessconsumer9 PASS are separate receipts; no automatic whole-suite replay requested for this additive lean/source repair.

## Actual broker group A

Sole broker reports six filesystem/fake-child/caller cases PASS6/6, exit0, no failures/skips/cancelled,16892.8706ms, all7pins stable. Receipt qa/goal-vectorless-2026-10-15/verification-capture-original-six-20261015T0828.json with full stdout/spec/reuse identity. Exact original/mismatched/foreign/mutated path guards and recovery lean/original forwarding plus existing four stop regressions were exercised. GroupB actualfinalizer retained-media checks remain pending explicit soleCPU lease confirmation; no READY or privacy-leak closure inferred from groupA.

## Actual broker group B and READY

GroupB completed PASS5/5, exit0, no failures/skips/cancelled,11634.5882ms wall/TAP11525.0443ms. Receipt qa/goal-vectorless-2026-10-15/verification-capture-eof-five-20261015T0832.json, full stdout/spec and complete reuse identity. Source7, exact retainedD07 fixture and FFmpeg/FFprobe pins unchanged; one test worker, production encoder/filter/decode threads1. No duplicate helper suite or media fixture regeneration.

Actual original12.0s→complete derivative12.202667s in all four media cases. Direct and actual-remux private9..12 tails measured-91dB; direct and actual-remux closed9..10 publictails remained-17.8dB. Exact original bytes remained unchanged and public prefix audio stayed audible. Fifth case actually refused unknown original clock before encoder/extraction/source registration. Source/originalSHA/current-generation checks passed inside actual finalizer; no real provider/livehost conclusion is inferred. ISS-CAPTUREMAKER-002 complete recorded reproduction set covered: four media variants plus unknownclock, with foreign/mismatch/changedsource and normal/recovery caller checks in groupA. No recorded case silently omitted.

This supersedes earlier pending-groupB notes. Candidate is ready-for-check cycle0 under root fresh-context reviewer budget. All7source pins above remain frozen. Whole-parent T034/T035/T011 still HOLD for real privacy timing calibration and full live/downstream evidence. Runtime/schema/production activation unchanged.

## Combined independent-review handoff — metadata reconciliation

Review only this cycle0 EOF candidate and qa/manifests/t034-startup-owned-cleanup.md cycle0. No new product edits or execution occurred during this reconciliation. Existing pin table above is authoritative; all7 EOF source/test pins match both dedicated receipts and current files. Five direct privacy dependencies (finalizer-input, receipt-store, coverage, context, provider-input) also match the media receipt before/after/current. Unchanged lean helper remains79b11336471e503b3e028ae4d865759c569a73b3782cd78858f39561e089cabc.

Dedicated execution evidence, under qa/goal-vectorless-2026-10-15/:

- verification-capture-original-six-20261015T0828.json: exit0,6PASS,16892.8706ms; original binding/confinement/mutation, actual recovery forwarding and four existing capture-stop cases.
- verification-capture-eof-five-20261015T0832.json: exit0,5PASS,11634.5882ms; unchanged literalD07C93 original floor, four real finalizer/media variants and unknown-clock refusal. Original12.0→output12.202667; EOFprivate9..12 tails-91dB, closed9..10 later publictails-17.8dB; direct/remux agree, originals unchanged.
- verification-capture-consumer-startup-20261015T0815.json: exit0,11PASS combined,11487.7102ms. Credit ONLY the two explicitly named ISS-CAPTUREMAKER-001 tests here, with TAP2206.4241ms/1450.1627ms; the other nine belong to proof-consumer scope.

Current runtime/media identity matches the EOF receipt: Nodev24.19.0 executable3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237; pnpm lock2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd; FFmpeg589e50b766d251afdf181dd664d40bd94407e200b019989fd7468c7d118a28d0; FFprobe02264dfa4f56baaa31e443ece8aa16d397f6b008200e7fd184d22b9009e75fd3. All three execution receipts record environment fingerprint5a6c76842393ea3da73877690619d5b36fa69e6c45271966cfd5d261ae09532f; current process-environment equivalence was not recomputed or inferred.

Exact limitation: startup receipt pins both changed startup files, which still match, but lacks five direct runtime-dependency pins: controller-state.ts, tab-receiver-guard.ts, tab-silence-health.ts, tab-remux.ts and browser/browser-profile.ts. Do not claim complete historical startup import-graph identity from its broader unrelated pin inventory. Independent reviewer should inspect/reconcile that narrow dependency gap; no replay was ordered or run by maker. No scoped source drift was found. Current independent verdicts and any shared frozen-contract verifier receipt remain mandatory separate evidence; no parent PASS is requested. Actual60min/two-tab capture, host/private-PTS calibration, real provider/OBS downstream and other operational gates remain NOT VERIFIED.

## Dedicated startup refresh — review handoff amendment

The historical startup missing-pin gap above is now resolved by the sole broker's new dedicated verification-capture-startup-two-20261015T1120.json (same evidence directory): original corrupt/foreign nodes2PASS,exit0,8329.5662ms. All7 startup source/test/direct-dependency hashes are present before/after and match current bytes; Node executable and pnpm lock match. Fresh environment fingerprint1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac differs from the older receipt only in the T054_AUTHENTIC_INPUT_OPT_IN/LKB_WHATSAPP_CONSENT_MONGO_RUN whitelist hashes; this fresh execution is credited without pretending the old environment matches. No secret values printed.

EOF's7 candidate files plus literalD07 original and lean helper still match its dedicated media receipt before/after/current. Its six/five receipts remain attributable to that scope; startup's refresh does not rerun or certify media. Both cycle0 scopes are READY for independent review. Current verdicts and separately supplied shared required contracts-verifier evidence remain pending. No product edits, tests or live acceptance performed during metadata authentication; preserved historical limitations are superseded only where the fresh receipt supplies actual evidence.

## Wave-2026-10-16 lane w16-t034cap — cycle 1 (maker re-verification, tests only)

Base a9fac545 (checkpoint, already contains the 7 EOF source/test files). Candidate = the single lane commit on lane/w16-t034cap carrying this manifest (hash in the review packet). Environment: node v24.19.0 (codex bundled runtime), cwd packages/meeting-bot, lane /c/Users/product/Desktop/KnowledgeBase-lanes/w16-t034cap (branch lane/w16-t034cap, base a9fac545), node_modules junctioned to the main tree. Machine heavily loaded (~18 lanes). Test-only fixes in this cycle; no production source changed.
Source files from the pin table were NOT edited; the pinned SHA256 values above no longer match live bytes (checkpoint normalized line endings or later edits) so they must be re-hashed by the checker. Review the source semantically at the candidate.

Changed in this cycle (all under packages/meeting-bot/src/capture/):
- workspace/record-stop-regression.test.ts: fake extension child give-up raised 6000 ms -> 30000 ms. The first case ("failed stop at end of recording", --until 4000) failed deterministically under machine load (stop arrived after the child had exited, so the receiver reported "did not acknowledge final flush" instead of "reported a failed stop"). Fixture timing only; assertions unchanged.
- record-commands.test.ts: legacy finalizer cases predated T-011/original-binding and failed 10/20 at base (missing explicit tenant, no consent receipt, media outside the slot). Added a local wrapper that seeds a fixture tenant "lane" and a consent receipt for the session, moved fixture media to raw/webinars, added validateTranscription stub to the -50 dB boundary case, and raised the tab-launcher startup timeout 3000 -> 15000 ms. No assertion weakened.

Evidence (actual, sequential, timeout 600; raw output in the maker's temp dir C:/Users/product/AppData/Local/Temp/t034cap-*.txt):
- `node --test --import tsx src/capture/workspace/original-capture.test.ts src/capture/workspace/record-stop-regression.test.ts`: first run 5 pass / 1 fail (the stop-failed case above); after the timing fix that case passes alone (1/1). Remaining 5 passed in the first run. Combined re-run after fix not repeated.
- `node --test --import tsx src/capture/finalize-original-eof.test.mjs`: 5 pass / 0 fail (real FFmpeg on the retained 12 s literal corpus D07C93, SHA256 verified; no capture, no browser, no provider). The corpus file is untracked in the main tree, so it was copied unchanged into the lane (hash d07c93e9...42de7 verified, not committed).
- `node --test --import tsx src/capture/record-commands.test.ts`: 20 pass / 0 fail after fixes (10 failed before).
- tsc --noEmit -p packages/meeting-bot: 2 errors, both outside this unit (capture/native/windows-capture-clock.ts:169, capture/tiles/native-measurement.test.ts:70).
Not run: real-capture/60-min/two-tab/provider gates, contracts/verify_contracts.py.
