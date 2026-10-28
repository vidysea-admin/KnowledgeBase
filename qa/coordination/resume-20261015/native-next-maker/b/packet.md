# Native archive next slice — Maker B fragment

policy_version: managed-review/1
token_metric: actual_total
Status: authored-unverified; combined maker packet and broker receipts required
Fix cycle: 1
Root: C:/Users/product/Desktop/KnowledgeBase
Base SHA: d50a25c200dcbcf574ecade0aa205f5fcb45c5f8
Candidate SHA: null (shared working tree; central must freeze exact combined candidate)
Unit: native-next / durable-public-recovery
Maker runtime active_s: null
Maker runtime actual_total tokens: null
Maker cost: null
No checker dispatch, verdict, acceptance, or efficiency claim.

## Identity / exact write scope

Raw-byte preimages: [preimages.json](preimages.json), [backups](backups/).
Final source bytes/line counts: [source-pins.json](source-pins.json).
Existing changed paths:
- packages/meeting-bot/src/capture/native/native-capture-archive.ts
- packages/meeting-bot/src/capture/native/native-archive-authority.ts
- packages/meeting-bot/src/capture/record-consent/native-provider-audio.ts

New source paths:
- packages/meeting-bot/src/capture/native/native-archive-recovery.ts
- packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts
- packages/meeting-bot/src/capture/native/native-archive-restart.testsupport.ts

Original native-capture-archive.test.ts, native-provider-audio.test.ts, native-archive-spool.ts were backed up but left untouched. Original reproduction corpus retained. No protected path, QA contract, index or unrelated file modified. Parent owns final combined changed/untracked inventory.
Frozen type SHA256 remains 6c8e2318cfca5a103501c8b88bb106bdc5d1ef3fc7687f97a865e022c24262e7.
Lock SHA256: 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd.

## Behavior / exports / immediate consumers

openNativeArchiveStore retains existing exports and adds:
- findByOwner({tenantId,sessionId,sourceId}) -> current fully admitted {archiveId,binding}[]; journal-issued candidates only.
- pendingPage({limit,cursor?}) -> {entries:{archiveId,binding}[],pending,cursor?}; UUID cursor resumes after last entry in sealed journal order, omitted at exhaustion. pending counts all sealed entries; published records remain hints and remain eligible for current-state revalidation. Cursor survives store/process reopening. Unknown cursor refuses.
- seal accepts remainingReservationBytes?:number; preflights complete copy inventory plus 65536 manifest reservation before directory/copy; effective bound is min(remaining,configured max). Old callers default configured max. Actual createPrivateDirectory from A creates each admission directory with verified private ACL.

createNativeArchiveRecoverer({store,decoder}) -> frozen NativeCaptureRecoverer interface; trusted configured decoder only. Public ready carries genuine decoded media + privately reissued retained provider.wav capability; no WAV allocation and no QualifiedCaptureClock invention. Each provider guard verifies admitted current binding both before/after readback, exact canonical PCM/header/EOF and receipt. privateWindows refuses private-transform-unsupported before decoder/provider publication. Original selected-provider.wav remains originalAudioPath.
Authority now requires identity-owner/generation, complete inventory and source/sidecar provenance consistency. markPublished is unchanged replay hint, rechecks existing binding; no DB atomicity claimed.
Immediate consumers: C's scripts/native-capture/production.ts; A's native-archive-capture.ts; existing provider dispatch guard. Actual platform measurement and downstream DB publication remain separate.

## Authored checks — NOT RUN

Sole CPU broker must run on frozen combined candidate with configured LKB_NATIVE_TEST_FFMPEG and LKB_NATIVE_TEST_FFPROBE; the actual runRecord subprocess chain also needs LKB_NATIVE_TEST_BROWSER executable identity (no browser is launched by the fixture). Skip means missing native evidence. Commands, environment identity, exact source pins, independent checks and raw outputs are still required:
- `pnpm --filter @lkb/meeting-bot typecheck` and API typecheck (shared integration cost).
- `node --test --import tsx packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts` from repository root.
  Parent test deadlines240000ms; each seal/reopen child spawn110000ms with bounded1MiB output, fixture FFmpeg encode30000ms, native runtime finalization120000ms. These are authored deadlines, not execution measurements. LKB_NATIVE_TEST_FFMPEG/LKB_NATIVE_TEST_FFPROBE/LKB_NATIVE_TEST_BROWSER contain trusted local executable paths; no other settings/host activation requested.
  - actual runRecord sealing child EXIT precedes fresh-process retained WAV/provider reproof: actual runRecord calls real finalizeRecordingWith through A's runtime/sealer; genuine FFmpeg/spool/finalizer/provider/seal; child reaped before fresh Node/module/WeakMap lifetime. Reopen receives trusted fixture root/archive ID/owner/decoder only and independently reconstructs current binding from live original source/sidecar/current receipt paths and hashes; no binding JSON argv or capability import. Guard uses live receipt/owner/original/duration then fake provider consumes exact WAV. No host qualification.
  - retained artifact tampering, copied orphan, owner/current changes and revoked proof refuse: every inventory artifact append, WAV truncation, unadmitted copy, hardlink alias, extra file, owner/session/source/generation/receipt/source/sidecar changed and revocation invalidate an issued provider cap; missing decoder and serialized provider refuse.
  - fair bounded pages, quota-before-allocation and interrupted journal refuse: four genuine admissions, limit two, reopened store cursor reaches later entries; unknown cursor refusal, zero spare allocation refusal leaves exact root inventory, incomplete journal refuses and restored bytes reopen.
- Original native-capture-archive.test.ts, native-spool.test.ts, native-media-finalize.test.ts, native-provider-audio.test.ts remain required regression corpus as selected by central/broker.
- Actual repository structure/<=300LOC/<=30files/import cycle checks, stage/downstream checks, contracts/verify_contracts.py remain required. Lightweight author line counts only: all six changed/new files below300; native directory24 files at author read. This is not parser verification.

## Explicit gaps / limitations

No tests/build/decoder/ACL/DB/provider/browser command executed. Only scoped source reads, byte backup/copy, edits, hashes, git scoped diff stats and lightweight counts. No receipts exist for authored assertions; no green/red/restored measurement claim.
Private retained mask reproof, actual qualified clock + outside-mask PCM/silence/receipt proof and private public-video transform remain unsupported/open; public success is mandatory broker evidence.
Fresh subprocess chain now authors actual runRecord -> real finalizer/sealer -> EXIT -> fresh reopen -> provider guard in one test. Extension to index outer commit -> registry -> consumer remains central integration gap; no execution evidence exists.
Mandatory refusal coverage authored: copied orphan/unadmitted JSON, serialized provider cap, all seven owner/current generation/hash binding fields, revoked current binding, all eleven retained inventory artifact append mutations, WAV truncation/EOF alteration, extra unlisted file, hardlink alias, missing decoder, quota preallocation failure with zero new inventory, incomplete journal and fair four-admission cursor across store reopen.
Outstanding mandatory corpus: symlink/replaced-ancestor; interrupted-seal fault between copy/journal append; changed-valid-decoder binary; sampler semantic mismatch retaining otherwise genuine admission; raw ledger gapped sequence and marker count semantic replay probes beyond outer inventory hash refusal; qualified private partial-sample/overlap/last-frame/audio-EOF/mask/outside-PCM corpus. Original spool/finalizer boundary corpus must be reconciled by central; no missing case is silently counted covered. Current missing-decoder refusal is not changed-valid-binary proof. Private reproof is not implemented and remains an explicit open feature gap.
Real DB generation/review publication fence is follow-on per parent's checkpoint. Journal is never cross-store atomic proof. Same trusted OS writer identity remains boundary; copied facts alone cannot issue capabilities.
Central must assemble/validate full managed-review/1 input and preserve existing checker HOLD and all prior usage/debits before any future fresh checker dispatch. This fragment is not a review-budget validation receipt.
