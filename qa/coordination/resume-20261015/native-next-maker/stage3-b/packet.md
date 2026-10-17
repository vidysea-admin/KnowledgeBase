# Native seal Windows read-only copy correction — stage3 B

policy_version: managed-review/1
token_metric: actual_total
Status: authored-unverified; broker replay required
Fix cycle: stage3-b/1
Root: C:/Users/product/Desktop/KnowledgeBase
Base SHA: d50a25c200dcbcf574ecade0aa205f5fcb45c5f8
Candidate SHA: null (central owns combined shared-tree freeze)
Actual maker active_s / actual_total tokens / cost: null / null / null
No tests, build, decoder, ACL command, DB, browser or providers executed. No independent checker, PASS or efficiency claim.

## Exact scope and raw byte identity

Preimages: [preimages.json](preimages.json), [backups](backups/).
Final source pins and line counts: [source-pins.json](source-pins.json).
Changed existing source only:
- packages/meeting-bot/src/capture/native/native-capture-archive.ts
- packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts

native-archive-authority.ts is backed up/pinned but unchanged. No new source file, source schema, contracts, dependencies, enforcement or QA verdict changed. C's production fixture and A's private-directory files read-only; C notified no fixture change indicated. Previous maker artifacts remain immutable.

## Diagnosis and corrected behavior

Raw stage2 original: [native-next-stage2-atomic-consumer-floor.log](../../broker/native-next-stage2-atomic-consumer-floor.log), SHA2564bd64a356c42ba54812d756f98aab73ba13356208c96fabfb8078df7e9607be8. [Focused checkpoint](../../broker/native-next-stage2-focused-checkpoint.md), SHA256b4c3a0df30a1b249dd3bbbf160be64c38c892b8b6dab16ecb65e9b433a5e6cbf. Original206tests/184pass/18fail/4skip immutable. The genuine seal test executed despite requested negative pattern; its26.673s failure is real, never counted skipped. Read complete raw log in three bounded chunks.

Cause identified from code and exact failing call: native-spool.ts close at272 chmods actual raw IVF/PCM/journal/marker0400 after closing writable handles. fs.copyFile copies the read-only source mode/Windows attribute. Archive then attempted fs.open(copiedDestination,'r+') at136 and received EPERM on source.vp8.ivf. Root creation, private directory verification, source/provider guard, preflight and copy itself had succeeded before this failing reopen. A's atomic protected currentSID/SYSTEM/Admin directory descriptor already grants current writer full control; no evidence supports widening that ACL or changing testroot. This is a code-causal diagnosis; no isolated native reproduction has been run by maker.

Correction: private local copyRetainedBytes opens source read-only, creates destination wx0600 inside the unchanged verified private admission directory, streams through one64KiB buffer, handles partial writes, rejects source growth/truncation against preflight exact byteLength, fsyncs through the same original writable destination handle and closes both handles on failure/success. Never copies readonly attributes, reopens readonly copies for writing, mutates source mode, repairs ACL, or overwrites an existing destination. Source/destination before/after fingerprints, byte reservations, current binding, genuine capability checks and journal admission sequence retained. Partial failure remains an unadmitted orphan, as before; no new cleanup/recovery or shared quota design.

Immediate consumers: genuine store.seal through createNativeCaptureSealer and C's live production sealer; fresh-process public reproof relies on exactly identical retained bytes. No export/signature change.

## Authored regression and minimum sole-broker replay

New node in native-archive-recovery.test.ts: `genuine read-only closed spool seals without changing source mode or bytes`. Uses genuine FFmpeg receiver/finalizer/provider fixture with copies0, requires four actual closed raw files owner-read-only before sealing, then invokes genuine store.seal, verifies original modes and bytes unchanged, copied bytes exact, and retained public provider reproof accepted. No source chmod/mock/guard bypass. Native prerequisites unavailable is skip/incomplete evidence.

Minimum replay after central source freeze, under existing trusted approved native ACL fixture and same environment setup:
1. ORIGINAL regression: scripts/native-capture/production.test.ts node `genuine live seal precedes source ingestion; retained public recovery does not invent a clock` (original location49; C owns file). Actual positive must run, no negative pattern assumed effective. Same LKB_NATIVE_TEST_FFMPEG/LKB_NATIVE_TEST_FFPROBE executables; capture own exit/raw output/actual node count.
2. New read-only regression above; retained artifact tamper/revocation test and fair pending/quota/interrupted journal tests in native-archive-recovery.test.ts retain original corpus unchanged and must pass for copy boundary non-regression.
3. Existing `actual runRecord sealing child EXIT precedes fresh-process retained WAV/provider reproof` chain, additionally requiring LKB_NATIVE_TEST_BROWSER executable identity; fake tab launches no browser. This chain was NOT run in stage2 and remains required.
4. Bot typecheck and scoped repository structure/import-cycle gates on combined epoch; affected/downstream checks and original stage2 other17failures remain central-required. Broker chooses exact commands/environment from its existing receipts; this packet does not authorize host provisioning or extra CPU.

Authored test timeout240000ms, existing child timeout110000ms; no execution timings or green/red/restored receipts available. Mandatory private-transform/clock/platform/real Mongo and other original corpus gaps stay open as previously recorded. No private reproof claim.
