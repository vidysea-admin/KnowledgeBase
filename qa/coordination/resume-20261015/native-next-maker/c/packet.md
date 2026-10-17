# Native next C — authored maker fragment

Validation contract: managed-review/1. Unit native-next-c; fix cycle 1. This is a maker
fragment for central's combined packet, not a checker dispatch, verdict or acceptance claim.
Root C:/Users/product/Desktop/KnowledgeBase. Base d50a25c200dcbcf574ecade0aa205f5fcb45c5f8;
candidate SHA not yet assigned. Exact four source paths, raw SHA256 and lightweight
nonblank line counts are in packet.json. All four paths were absent at initial authoring;
see backups/preimages.txt and lease-transfer.md for the authorized new-file path correction.
Unrelated dirty/index state was preserved. The shared type-only interface was read, not edited.

Changed behavior and consumers:
- API-owned createNativeArchiveBindingReader(db, trustedCurrentCaptureReader).read(owner)
  joins tenant/session/source association, complete verified index artifacts, effective turns,
  review completion/revision and trusted physical/current receipt binding. Missing source
  remains pending. Repeated reads detect changed source/receipt/sampler/generation/review.
  It imports no meeting-bot module and issues no media/clock authority.
- Static script-root createNativeArchiveProductionService(config) opens a private archive,
  creates only missing new private roots via A's helper, verifies existing roots, exposes A's
  live sealer plus committed hook and bounded pending-cursor drain. Sealing uses physical
  source/sidecar/current receipt before DB ingestion; restart publication separately requires
  API authoritative readback. Fixed source convention is workspaceRoot/data/toc-migrated/
  session/source.json; actual sampler must write recordDir/session.tiles.jsonl.
- Recovery uses B's genuine store/recoverer. Retained public WAV identity supplies no native
  clock. Real qualification uses createNativeCaptureClockQualifier; absent verifier returns
  null. When explicitly configured, real measurement authority and registry resolve before
  the existing suggestTileSpeakersForSession; supplied publicationFor must fence writes.
  Journal markPublished remains a hint and never suppresses future authority checks.

Frozen factory config/export signature is in scripts/native-capture/production.ts:
db, workspaceRoot, recordDir, archiveRoot, finite maxArchiveBytes, decoder paths;
optional verifyPlatformQualification and optional tiles {enabled,clockBudget,publicationFor}.
Factory returns Promise<NativeArchiveServerService>. Central owns actual launcher config,
API/index/transcript/sync-session wiring and downstream transactional fence.

Applicable clauses: exact C leases and root-granted path transfer; no API->meeting-bot edge,
no arbitrary module/JSON issuer, actual tenant/source/effective transcript/review/current
receipt readback, pending missing source, no fabricated clocks, hints not atomic proof,
finite fair cursor, private root guard, existing suggestion consumer only. No protected
policy/QA-contract/dependency changes, child agents, checkers or semantic PASS.

Required broker checks, NOT EXECUTED:
1. Combined @lkb/api + @lkb/meeting-bot typechecks and root script type/import checks.
2. API native-archive/binding.test.ts: actual indexSession+notifyIndexCommitted integration;
   tenant/source absence, receipt/capture/index/effective-turn change and readback race.
3. scripts/native-capture/production.test.ts: config refusal before I/O; real private store
   bounded empty drain; genuine native media/provider fixture -> production seal before DB
   source exists -> B admitted retained public recovery, with no invented canonical clock.
   LKB_NATIVE_TEST_FFMPEG / LKB_NATIVE_TEST_FFPROBE are decoder path names only. Missing
   paths skip that fixture and remain incomplete native evidence, never software acceptance.
4. A/B capture/restart/security corpora plus central actual entrypoints/postcommit/fence tests;
   combined structure/cycle/contracts, affected stage and downstream checks. Sole CPU broker
   owns execution and environment/lock/test receipt fingerprints.

Remaining gates: native tile publication lacks an approved current-generation/review
transaction protocol. An injected publicationFor is not proof that protocol exists; default
launchers omit tiles and keep the publication gate HOLD. Real host measurement corpus,
approved writer/deployment root and actual native Mongo transactional environment remain
external gates. This fragment's genuine recovery test stays in-process; B owns fresh process
exit/reopen, central owns full outer committed hook/registry/suggestion chain. No test was run.

Evidence/accounting: only scoped reads, four new source writes, authorized byte-preserving
path transfer, raw hashes/counts and this packet. No tests/build/browser/DB/provider/ACL/
decoder execution. token_metric actual_total; maker total tokens, active time and monetary
cost are null/unknown, not zero. No reviewer dispatched, no efficiency-success or PASS claim.
