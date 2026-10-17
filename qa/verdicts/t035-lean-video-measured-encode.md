# Independent verdict — t035-lean-video-measured-encode

VERDICT: PASS
Cycle checked: 1
Scope: ROOT-authorized local derivative/helper and EOF engineering behavior only, against `goal-t035.md` C4/C5 and the helper portion of C8. **Full parent T-035 remains HOLD.** Shared C1/C3 production consumption, C8 actual provider binding, live ≥60-minute size/quality, host/timing calibration and OBS restoration are excluded from this scoped PASS.

Manifest and packet were `ready-for-check`, Fix cycle 1, with the exact frozen scoped source/evidence map at the time of this check. The historical `candidate-pins.json` is observed-not-frozen and is not certified here. The maker may close only this scoped cycle; this verdict cannot support marking T-035 done.

## Independent finding and exact-corpus result

The independent precheck found that the original encoder clipped a private EOF suffix to declared source duration, while complete derivative audio could legitimately extend by the permitted 0.25 seconds. The original actual reproduction confirms the defect rather than inferring runtime failure from source:

- Archived helper `ACE429…202C0` actually published a derivative with 12-second video and 12.202667-second audio from retained corpus `D07C93…42DE7`. Source Matroska Duration was deliberately stale at 12 seconds; actual audio packets continued beyond it. The private-range proof was silent and video was black, but decoded published audio after 12 seconds peaked at **−17.8 dB**. `eof-baseline-zeYvkn/report.json` is `reproduced-private-tail-leak`. The earlier `eof-baseline-YTx7AA` fixture setup failure remains separately preserved and is not product RED.
- Current helper `79B113…9CABC` extends only an EOF-private interval through decoded EOF and verifies that same interval using original source duration; ordinary closed intervals retain bounded end guards. I reviewed the complete original helper earlier and the exact archive-to-current diff here: EOF predicate, expected-frame coverage and original-duration propagation changed; black/silence/size/duration thresholds and original-retention gates were not weakened.
- The current actual replay reuses the **same immutable original corpus**, not a regenerated easier fixture. Private EOF tail is **−91 dB**; the separately tested closed-window legitimate public tail remains **−17.8 dB**. Both outputs preserve **12.202667 seconds**. Public prefix audio remains −12.7 dB, and recorded public frames remain nonblack. Both real helper invocations completed strict decoded private AV checks before exclusive publication. All 24 native commands exited 0.
- Original recorded EOF corpus: **1/1 leakage case fixed**. Additional public-tail preservation oracle: **1/1 preserved**. No filed issue ID was assigned to this pre-handshake finding, so no ledger reproduction was replaced or omitted.

Current actual output hashes independently match the report: private EOF `569c392b1fa496db3d0fa37842c032422163a86926be09b67e029d73fc04b8f0`; closed-private/public-tail `eeb679029d1651d7f3840edabd3059376a19b195aa406d34c09f332ab674d877`. Source preservation, complete AV decode/probe and subsequent actual decoded-audio/image consumers are evidenced for these synthetic artifacts. The older 12-second AAC extraction evidence is attributed to archived ACE429 bytes and is not presented as a fresh current-source upload or live proof.

## Verification and evidence attribution

I independently read the contract, candidate manifest/packet, new helper/test/probe logic, original precheck safety fixes, immediate decoder/probe consumers and relevant source-preservation/mandatory-mask boundaries. I checked tracked and untracked candidate status, exact archive-to-current diff, all 14 frozen scoped pins, report/receipt contents, original/current corpus identity and published artifact hashes. All 14 pins matched at final readback. No source, fixture or previous evidence was changed by the checker.

Execution was performed by the sole authorized ordinary executor and is reused with exact current byte applicability:

| Command | Actual result and receipt |
|---|---|
| `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx packages/meeting-bot/src/lean-video-ffmpeg.test.ts` | Exit 0; 33 declared, **32 PASS, 1 explicit Windows file-symlink capability SKIP**, 0 fail/cancelled. Outer timeout 60 seconds; PID 24068 terminal. UTC 23:03:09.2053079–23:03:10.0831450; wall 878 ms, TAP 679.698 ms. `ordinary-focused-20261014T230309Z.receipt.json`, matching stdout/stderr. All 8 execution pins unchanged. |
| `node --import tsx scripts/qa/t035-lean-video-eof-probe.mjs --phase current --fixture qa/evidence/t035-lean-video-measured-encode/eof-baseline-zeYvkn/stale-duration-source.mkv` | Exit 0; exact retained-corpus EOF and public-tail scenarios passed; 24 native commands, 0 failures. Outer timeout 245 seconds, individual native commands ≤120 seconds, cumulative native budget 240 seconds, one encoder thread; PID 21120 terminal. UTC 23:03:52.9805236–23:03:58.1673472; wall 5187 ms. `ordinary-retained-media-20261014T230352Z.receipt.json` and `eof-current-m5uNoV/report.json`. All 8 execution pins unchanged. |
| `python contracts/verify_contracts.py` | Reused actual exit-0 receipt `qa/evidence/goal-t051checker-validator.json`, UTC batch 18:39:31.7184876–18:39:33.1459082; individual duration unknown, combined batch 1.4327147 seconds. Exact current validator/registry hashes independently matched this receipt. Output: `no frozen contracts yet (research phase) -- PASS by vacuity`. This empty-registry result is not quality, downstream, host or parent acceptance. |

Evidence paths above are under `qa/evidence/t035-lean-video-measured-encode/` unless explicitly otherwise stated. Host symlink creation was unavailable and skipped openly; the source alias checks and independently reviewed owned-scratch/exclusive-publication logic are not described as an actual host symlink/ACL proof. No broad suite, duplicate encoding, new independent local CPU probe, provider, browser, native host action or mutation run was performed by this checker. Existing genuine exact-corpus behavior was sufficient; duplicating the encode would add no missing scoped evidence.

## Final byte pins

| File | SHA-256 |
|---|---|
| `packages/meeting-bot/src/lean-video-ffmpeg.ts` | `79b11336471e503b3e028ae4d865759c569a73b3782cd78858f39561e089cabc` |
| `packages/meeting-bot/src/lean-video-ffmpeg.test.ts` | `9dd0095a3c2ca2aa74e51b538be78cfec6b8ac29135df3984947a309452e3526` |
| `scripts/qa/t035-lean-video-measure.mjs` | `ca0ddc65257788e5011dca86f128377cd0d753b38ae20c6676061c7d09297ad4` |
| `scripts/qa/t035-lean-video-eof-probe.mjs` | `ab56f6e9529ff1c93dbe029edd63fac813d131ed6f71ad80d799efe7c17fd845` |
| Maker manifest, before close-out | `42b9e70a57bc23419203abeb3109e95c7423521f9a91370a322266c31fb655c1` |
| Maker packet | `aba8d6c6384198d70cc6b8e576b95a66b3b6676ce627563bad295c1ff478e315` |
| Scoped 14-pin map | `568cc83809cdffda53a1418b86e4700107d2c8e918ddb9976c2e4d280432d2b6` |
| Full parent contract | `a2013d417a5c37e84ff00a687a78479ef26c6f46d2030d72475fac93a590b3f5` |
| Current actual media report | `49ac3b6b654d9fb56152306604b9350bf89deec2ec7bed5b9b3b31ddf9504e8a` |
| Frozen validator / registry | `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3` / `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940` |

## Timing and remaining whole-task gates

Current resumed evidence-review measurement began **2026-10-14 23:06:09 UTC**. Cycle-1 READY was first observed at **23:12:24 UTC**; final scoped pin/source readback checkpoint was **23:12:56 UTC**. Earlier prechecks, root HOLD/resume periods and individual review/drafting/lease intervals were not measured and remain unknown. The resumed review exceeded the 2–3-minute target while waiting for exact ready-cycle metadata and checking reusable validator applicability; required evidence was not dropped. Executor commands occurred before this resumed checker measurement and are attributed above, not counted as this checker's own CPU time. Persisted verdict hash, actual completion confirmation and total resumed elapsed time are recorded in `qa/evidence/t035-lean-video-measured-encode/checker-verdict-confirmation.json`; no unmeasured interval is assigned by subtraction.

Full T-035 remains HOLD: actual ≥60-minute approved live recording and <400 decimal MB/hour result; useful real speech/slides; actual producer/media-clock calibration; shared finalizer/child/provider and downstream composition; applicable actual host/OBS restoration and any supported operational deployment acceptance. This source-only PASS does not certify private ACL operation, actual provider safety for a different shared byte set, an unattended release, or production promotion. Parent contract and historical whole-task HOLD are retained.

ISSUES-WRITTEN: none.
EXPLANATION: The actual original EOF privacy leak is repaired against its own retained runtime corpus without cuts or proof relaxation. The exact source-only cycle-1 scope is complete; full-parent and shared-consumer gates remain explicitly unpassed.
