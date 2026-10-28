# t035-lean-video-measured-encode — cycle 1 scoped helper/EOF candidate packet

Manifest: `qa/manifests/t035-lean-video-measured-encode.md`. Contract: checker-owned `qa/contracts/goal-t035.md`, especially C1/C3/C4/C5/C7/C8 (required T011 privacy and actual upload binding). Tier 3, D-170 ALL40 roadmap T-035. This packet prepares the scoped derivative/privacy engineering check. Full parent T-035 remains HOLD without actual >=60-minute live size/quality and applicable host/OBS proof. No checker verdict is implied by maker evidence.

ROOT authorizes cycle1 ready-for-check for **source-only local derivative/helper EOF behavior**, including source preservation and fail-closed typed masking. Shared consumer/upload binding is reference context, not included in this scoped PASS request; full parent remains HOLD. Current scoped frozen pins are `qa/evidence/t035-lean-video-measured-encode/scoped-helper-eof-pins.json`; shared `candidate-pins.json` stays a historical observed-not-frozen snapshot outside the handshake.

## Scope, ownership and source

Maker owns only `packages/meeting-bot/src/lean-video-ffmpeg.ts`, its adjacent test, `scripts/qa/t035-lean-video-measure.mjs`, new `scripts/qa/t035-lean-video-eof-probe.mjs`, and this unit's manifest/packet/evidence. These implementation paths were new at supplied base `ed542fd01c870e5d5b64e1d72b413062d595f675`; no original bytes existed there. Root/runtime owns shared finalizer/composition, T-034 owns record commands/workspace propagation, and T-011 owns durable receipt/private-window/provider helpers. Review current tracked AND untracked files; this is not a commit-only candidate.

Auth/tenancy: helper itself takes local media and typed numeric intervals; production must obtain them from tenant/session-bound durable receipts. Cross-tenant access and credentials: helper has no account/environment/provider reads, network or browser calls. Writes: YES, bounded original-adjacent scratch and exclusive derivative publication; no original rewrite/delete. Shared finalizer writes source/validation/audio, so its tenancy and path composition remain independently reviewable security boundaries. No provider call, browser, actual account, database or OBS operation was authorized or executed for this packet.

## Change map and adjacent composition

`lean-video-ffmpeg.ts:27` checks absolute regular local media, all ancestors and canonical paths; rejects UNC/device roots before filesystem access, symlinks, hardlinks, ADS/control characters, wrong Windows drive, unsupported extension, >8GiB or zero bytes. `:42` uses exact BigInt dev/ino/size/mtimeNs identity. `:46` hashes an exact bounded byte count in 64KiB chunks. `:60` requires actual readable audio/video packets and finite <=4-hour media. Local decoder protocols are only file/pipe, recognized capture containers only.

`:74` validates at most 128 finite numeric private intervals against probed duration, then sorts/merges. `:93` builds shell-free argv: 1280x720 aspect-preserving scale/pad, 5fps H264 <=500k target, mono48k AAC64k, mandatory AV maps, stripped metadata/chapters, one decoder/filter/encoder thread, no overwrite, and duration-derived `-fs` disk bound. Private video draws full black over original receipt intervals expanded 0.200001 seconds; sample-wise audio mute uses 0.100001 seconds. Every guarded private frame is forced to be an independent keyframe to prevent lossy prediction residue at the boundary. Actual proofs still determine publication.

`:112` fully checks guarded decoded frame coverage/timebase/pixel bytes: exact 1280x720 YUV420p constant black, MD5 `e98369d30f70b13ab3d816b346bcad35`, no missing/duplicate/unexpected frame; private-only decoded audio peak <=-80dB, missing proof refused. `:144` requires exactly one video + one mono48kAAC stream, duration agreement within 0.25 seconds, expected geometry/positive <=5fps/H264, actual strictly <400 decimal MB/hour. `:161` owns scratch with BigInt dev/ino, performs complete AV decode, rechecks candidate identity and SHA256/source identity, then publishes via exclusive hardlink. Scratch cleanup rechecks owned identity and canonical parent; suspicious replacements survive with visible cleanup failure. Optional public compression may return visibly unverified original; required privacy throws and never returns original as sanitized output.

Current production order is visible in `capture/record-finalize.ts`:

```ts
measuredDuration = (overrides.probeMedia ?? defaultProbeMedia)(video);
const prepared = await prepareRecordFinalizerInput({ video, recordDir,
  owner: { tenantId, sessionId }, duration: measuredDuration });
video = prepared.publicVideo;
// Size advisory, exclusive public audio extraction, silence gate, source binding.
await runPrivateCaptureProvider({ receipt: prepared.receipt,
  owner: { tenantId, sessionId }, duration: measuredDuration, audioPath: audio,
  originalAudioPath: prepared.originalVideo,
  sanitizedSha256: sourceDoc.captureConsent.sanitizedAudioSha256 },
  async (audioPath, checked) => {
    const generation = prepared.receipt.generation;
    if (!generation) throw new Error('Current capture generation required before provider dispatch');
    runTranscription(sessionId, { version: 1, tenantId, sessionId, audioPath,
      sha256: checked.sha256, receiptSha256: checked.receiptSha256,
      sourceSha256: createHash('sha256').update(readFileSync(path.join(dataDir, 'source.json'))).digest('hex'), generation });
  });
// Privacy-filter turns; validate transcript; return video to caller.
```

`record-consent/finalizer-input.ts` reads `readRecordConsent(actualRecordDir, owner)`, obtains **unguarded** `recordPrivacyMaskIntervals(receipt, owner, actualDuration)`, requires actual attempt generation for private facts, refuses all-private/unknown-origin coverage, and calls the real helper with `{enabled: lean, privateWindows, requirePrivacyMask:true}` when private windows exist. Encoder guards are applied exactly once. It now confines source/derivative to the actual capture slot, checks ancestors/canonical paths and rechecks exact BigInt dev/ino/size/mtimeNs during source binding. It binds public video/receipt hashes and publishes matching guarded windows. Source-private intervals alone never authorize a mask.

`record-commands.ts` normal and recovery paths pass `--lean-video` through `normalizeCapture`; the wrapper `workspace/finalize-workspace-recording.ts` passes actual slot and tenant to the finalizer and propagates its returned sanitized path to process-video. A void original-path fallback is explicit fixture-only, not the production default. WebM remux now uses `-n` and refuses a preexisting sibling; original is retained.

## Current shared integration limitations for the checker

Fresh finalizer/private caller changes were authored after the measured helper receipt and have not been compiled or behaviorally accepted in this unit. The checker and shared owners are settling consumer source pins. Static precheck found numeric file identity/ancestor/slot checks and a child re-selection of mutable `source.json.audioPath` after the parent provider guard. The latest observed source addresses them with BigInt/slot checks and a sealed parent input; independent behavioral verification remains required. Do not infer upload safety from helper proof alone. No provider dispatch is requested for verification; use disposable refusal seams with no-op fixture callbacks.

Current `defaultRunTranscription` passes the explicit guarded path/hash, receipt hash, source bytes hash, tenant/session and actual generation to `scripts/transcribe-long-session.mjs --capture-input-fd 0` over a pipe, with a two-hour timeout. The child parses at most 8192 bytes/exact envelope fields, resolves the sealed audio path instead of `findAudioFile`, and requires sealed input for known captured sources. New dependency `scripts/lib/transcription/private-recording.mjs` reads the actual durable receipt, matches receipt/owner/generation/source and public video/audio hashes, refuses all-private intervals, verifies current source/receipt/media again before the provider callback, and filters guarded overlap turns. The actual immutable upload snapshot must equal `privacy.sanitizedAudioSha256` before dispatch. `findAudioFile` remains the provided-source fallback and is not the captured sealed selection. The independent checker must cover changed/reselected artifacts, missing/foreign/mismatched facts and zero real provider calls for refusals, including direct-recovery entry points.

## Immutable pre-EOF helper evidence

Focused command from repository root, broker-run with 60-second outer timeout:

```text
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx packages/meeting-bot/src/lean-video-ffmpeg.test.ts
```

Receipt `qa/evidence/goal-t051checker-broker-t035-private-keyframes.json` and matching stdout/stderr: UTC 2026-10-14T20:43:32.851Z -> 20:43:33.509Z, exit0, 31 declared/30 PASS/1 host symlink SKIP/0 failed or cancelled, wall655.1032ms/TAP544.7305ms. Before/after helper/test pins unchanged. Symlink creation is host EPERM; standing hardlink/UNC/device/scratch replacement/candidate mutation refusal cases passed. This is fake subprocess behavior plus real disposable filesystem boundaries, not encoder/live proof.

Separately broker-granted real FFmpeg command:

```text
node --import tsx scripts/qa/t035-lean-video-measure.mjs --output qa/evidence/t035-lean-video-measured-encode
```

Receipt `qa/evidence/t035-lean-video-measured-encode/synthetic-m4VI4t/report.json`: UTC 2026-10-14T20:44:56.208Z -> 20:45:01.642Z, exit0/tool wall6.0991248s. FFmpeg `9.0.2-full_build-www.gyan.dev`; actual command argv/status/elapsed and bounded framemd5/audio proof output retained. A generated **12-second** 640x360/30fps test pattern plus sine tone is the source; every decoder/encoder/filter child is one-threaded, each <=120 seconds and total deadline <=4 minutes. No live source, speech, slide or producer timing calibration is claimed. All handles ended and exclusive CPU slot was released. Scratch candidates cleaned; evidence artifacts intentionally retained.

Observed runtime paths: Node `C:/Program Files/nodejs/node.exe`; FFmpeg/ffprobe under `C:/Users/product/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/`. The broker receipt records actual Node program path. These are local host observations, not Ubuntu/deployment proof.

| Artifact | Bytes | Actual duration | Decimal MB/hour | SHA256 |
|---|---:|---:|---:|---|
| source | 3199857 | 12s | source retained | 77bf67fed9e72e015ceb64805f236408300022732820b721c4e1880544f51db7 |
| public 1280x720/5fps derivative | 899654 | 12s | 269.8962 | e58a3cb953de5c111e52a3846b07545b9f974548a4498db3f448c62d8ef12ece |
| private 1280x720/5fps derivative | 779390 | 12s | 233.817 | aea341c8331de42ca4c4c04fc2d1fefb72f7e674d575b00a69d9e4e08676708d |
| downstream mono AAC | 131649 | 12s | not video target | f932d6bf92783c157e0a557f4f3cfc8cc699a5bb6b2ec472dc66f999e2cd1ede |

Original hash was equal before/after both derivatives. All 13 guarded private video frames (PTS14..26 at1/5) matched exact black bytes; private-only audio peak -91dB. Public 1s frame hash `59f39857cc64427527c6eda299b40da1` differed from black; public0..2s audio peak -12.7dB. Actual public derivative downstream extraction using mono AAC96k, complete audio decode and packet/duration probe passed. Private derivative AV/full decode and privacy proofs passed; this receipt does not include a separate re-extraction from private video or actual provider consumption.

Historical failed actual reports preserved: `synthetic-4pKiA4/report.json` (wrong generator audio map, fixed), `synthetic-YwNBww/report.json` and `synthetic-vMyFny/report.json` (strict private pixel rejection before independent private-frame keyframes). None is labeled successful. Historical initial/BigInt fake runs remain historical and do not pin changed privacy-keyframe bytes.

`python contracts/verify_contracts.py` earlier exited0 in0.636s; expressly vacuous because no frozen contracts. No mutation, broad suite, browser, provider, actual recording, OBS or notifications were run. Existing genuine encoder receipt is reusable if helper/test/script/evidence pins remain unchanged; no duplicate encode requested by default.

## Frozen helper/evidence SHA256

| Path | SHA256 |
|---|---|
| packages/meeting-bot/src/lean-video-ffmpeg.ts | 79b11336471e503b3e028ae4d865759c569a73b3782cd78858f39561e089cabc |
| packages/meeting-bot/src/lean-video-ffmpeg.test.ts | 9dd0095a3c2ca2aa74e51b538be78cfec6b8ac29135df3984947a309452e3526 |
| scripts/qa/t035-lean-video-measure.mjs | ca0ddc65257788e5011dca86f128377cd0d753b38ae20c6676061c7d09297ad4 |
| scripts/qa/t035-lean-video-eof-probe.mjs | ab56f6e9529ff1c93dbe029edd63fac813d131ed6f71ad80d799efe7c17fd845 |
| qa/evidence/t035-lean-video-measured-encode/pre-eof-helper.ts | ace429c916c8326dcbdc56c21585fd51ef6cf7637255fc4d1e259393894202c0 |
| qa/evidence/t035-lean-video-measured-encode/pre-eof-probe.mjs | 73b652d83b71b0399821130e959af45290e7597a354395a07e31180769585788 |
| qa/evidence/goal-t051checker-broker-t035-private-keyframes.json | ac1e66f5b26a2d4efecb623c1df57d2e9bd26283713a6095cb68017fbfcd6128 |
| qa/evidence/t035-lean-video-measured-encode/synthetic-m4VI4t/report.json | bf13f88f1704b8ea1ab518716720ca55986657e7b21e89f81c841970c35d62b9 |

Shared consumer dependency pins are captured separately in `qa/evidence/t035-lean-video-measured-encode/candidate-pins.json` when owners freeze them. A changed source invalidates only the affected evidence; helper-only measured evidence must not be stretched to certify untested shared changes.

## Check boundaries and remaining gates

ROOT appointed `/root/docker_governance_review` sole ordinary executor after the previous broker errored; obtain scheduling there for any focused refusal probe, compiler or test. Sandbox subprocess EPERM is already established; required narrow escalation was approved for the above actual commands. Runtime TSX dependency exists. Do not trigger a known failing default sandbox run or invoke a provider/browser/network. Proposed smallest remaining actual composition check is a fresh exported finalizer privacy-before-provider refusal probe using disposable owner-bound receipts, real source-binding selection and no-op extraction/provider fixtures; the checker derives the assertion independently.

No filed ledger issue ID was the purpose of this new seam; there is no substituted issue corpus. Precheck UNC/device, scratch replacement, candidate mutation and actual pixel findings are explicitly retained in source tests/failed receipts. Contract C2 live60-minute gate, actual speech/slide quality, real host/backend/downstream integration, timing calibration and applicable OBS restoration remain parent HOLD. Shared uncompiled/refusal/upload binding concerns remain explicit until independently checked. Maker does not change central tasks, goal, decisions, contracts or checker verdicts.

## EOF floor and current correction awaiting replay

The separately authorized real ordinary-media floor is now genuinely RED: `eof-baseline-zeYvkn/report.json` SHA820a3012a67ae700a5b49dd9df21854e6a3c5341b0cc549726dc453fc4dbe2ed; broker `goal-t051checker-broker-t035-eof-fixture-corrected-baseline.json` SHAd5f146c932186eb2635e110d48cc3fa8992abe0f87df60f9d8bfc905e7863f44, UTC22:34:11.556Z->22:34:14.953Z, exit1/wall3393.4354ms and unchanged old helper/probe pins. Setup-only failure `eof-baseline-YTx7AA` is preserved separately and never treated as product RED.

Original generated Matroska Duration-only edit12221->12000ms leaves AV packet bytes unchanged; exact retained corpus SHAd07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7. Source tail peak-18dB. Old helper published12.202667s audio with12s video/private window9..12; guarded video44..59 was exact black and bounded private proof-91dB, yet published decoded tail after12s peaked-17.8dB. Published artifact SHAf8a21f7e59af5d6cde1687296d6fc3d5a1c42a8e889d19a1059bc711ae16945c. These retained measurements establish the EOF proof gap.

Current helper uses unbounded `gte(t,start)` only for a validated interval ending exactly at original declared source EOF; both encode and proof cover actual decoded EOF. Frame expectations cover derivative video EOF. Existing start guards, complete-duration validation, exact black pixels,<=-80dB silence and fail-closed publication remain. Closed private windows retain existing bounded end guards; media is never cut to eliminate a legitimate public tail. Suite33 and exact-corpus replay actually completed on current pins, below. Historical green31/normal12s receipts do not pin these changed helper/test bytes.

`eof-current-spec.json` freezes current hashes and exact commands for sole executor. Replay reused the original corpus rather than regenerating it; verified silent private suffix, audible closed-window public tail, nonblack public images/prefix audio, original hashes and unchanged>12s full derivative audio. Archived baseline helper/probe bytes remain unchanged. This packet is ready-for-check cycle1 for exact source-only helper/EOF evidence; shared consumer and full-hour acceptance remain HOLD.

## Current exact receipts consumed

Focused actual command from the unchanged spec exited0, UTC23:03:09.2053079Z->23:03:10.0831450Z, receipt wall878ms/TAP679.698ms:33 declared,32PASS,1 host Windows symlink capability SKIP,0fail/cancelled. `ordinary-focused-20261014T230309Z.receipt.json` SHA256 `c708157c3f72073c8e1211d5addda6da5b3088909d564642487db8cc72c53150`; matching actual stdout/stderr preserved.

Current replay command `node --import tsx scripts/qa/t035-lean-video-eof-probe.mjs --phase current --fixture qa/evidence/t035-lean-video-measured-encode/eof-baseline-zeYvkn/stale-duration-source.mkv` exited0 without timeout, UTC23:03:52.9805236Z->23:03:58.1673472Z, wall5187ms. Actual receipt `ordinary-retained-media-20261014T230352Z.receipt.json` SHA256 `4d3382b15e202cf7f73357caccba46adf0af1ea2ebf27e1c0e070387cbfa3700`; report `eof-current-m5uNoV/report.json` SHA256 `49ac3b6b654d9fb56152306604b9350bf89deec2ec7bed5b9b3b31ddf9504e8a`. All8 execution pins unchanged before/after; all24 native commands exited0, all handles ended. Exact retained original D07C93 corpus unchanged.

Actual private EOF9..12 output635904bytes/12.202667s (187.6028 decimal MB/h), SHA569c392b1fa496db3d0fa37842c032422163a86926be09b67e029d73fc04b8f0: tail-91dB; public1s image nonblack/public prefix-12.7dB. Actual closed-private9..10 output757512bytes/12.202667s (223.4793 decimal MB/h), SHAeeb679029d1651d7f3840edabd3059376a19b195aa406d34c09f332ab674d877: legitimate public tail-17.8dB; public1s/11s images nonblack/public prefix-12.7dB. Both real helpers proved every selected private frame exact black and required private audio silent before their two exclusive publications. Complete audio duration remains unchanged; no cut/fallback/proof relaxation.

This fresh current result closes the observed EOF helper defect against the original runtime floor, subject to independent matching cycle1 verdict. Baseline product RED and setup-only failure remain archived. No new maker CPU, source edits, original12s rerun, provider/browser/live/host proof or parent task completion. Matching verdict requested at `qa/verdicts/t035-lean-video-measured-encode.md`; maker may close only this exact scoped source unit after PASS.
