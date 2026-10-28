# T-045 cycle 0 maker packet

Manifest: qa/manifests/goal-t045.md; contract: qa/contracts/goal-t045.md C1-C8.
Candidate is in_progress, not ready for full parent acceptance. This packet supports focused source review.
Read base at packet preparation: ed542fd01c870e5d5b64e1d72b413062d595f675. Root's shared tree continues;
the final publication/check must use exact pinned source bytes, not assume HEAD freezes this lane.

## Change map and consumers

- `apps/api/src/source-intake/wiring.ts`: existing default-OFF LKB_SOURCE_INTAKE gate remains. Missing
  explicit trusted model/key returns the existing unconfigured deps; injected Transcribe takes precedence.
  Production HTTP now refuses inline SDK STT; explicit execution:worker composes createSourceMediaTranscriber.
  Immediate consumers: production.ts returns the gated direct intake; separate durable worker consumes actual intake, and
  authenticated routes/ingest-source.ts. No caller-controlled credentials/model are accepted.
- `source-intake/media-runtime.ts`: explicit model configuration, configuration-only inspector, bounded
  Google-origin UploadTransport, normalized MP4/m4a signature/size refusal, actual File API upload/poll/
  candidate-text parsing, mandatory measured-duration clamp/coverage validation, bounded time and cleanup. Uploaded media deletion
  failure refuses successful return. Provider errors expose fixed messages, never raw diagnostics/keys.
  Existing @lkb/ai uploadFile/pollFileState/transcribeUploadedAudio/parseDiarizedTranscript are reused.
  Upstream upload-finalize failure before a valid file name leaves no safe deletion target; operational
  provider reconciliation remains a disclosed gap, not a deletion claim.
- `source-intake/adapters.ts`: default real media reader rejects oversized/symlink/outside-root files.
  Actual YouTube uses boundedMediaExec and fresh physical scratch, preserving injected fixtures.
  Hosted acquisition is separately default-OFF at LKB_HOSTED_SOURCE_ACQUISITION; tests can still inject
  a downloader and unconfigured hosts still refuse. Registry/order and generic guarded URL adapter remain.
- `packages/ingest/src/source-acquisition/exec.ts`: shell-free bounded process/tree termination, combined
  stdout/stderr cap, application-credential-free child environment, disabled user plugins, size/socket/
  retry bounds and specific-extractor defaults. Node's current executable explicitly supplies the JS
  runtime; remote EJS fetches are disabled. Immediate consumer: YouTube and hosted acquisition.
- `source-acquisition/onair.ts`: validates the exact canonical OnAir event, uses all-address guard and
  pinned transport. The T036-owned backwards-compatible resolveAll(host,{timeoutMs:30000}) form supplies
  cancellable DNS acquisition; no shared transport was edited by this lane. Optional trusted session
  cookies stay at that exact HTTPS origin, no redirect.
  Tokenizes complete HTML tags/quoted attributes, excluding anchors/comments/raw-text/inert templates.
  Exactly one actual iframe src YouTube embed qualifies; ambiguous/dynamic/auth-unavailable pages refuse. It
  does not assert arbitrary OnAir templates or real authenticated events work.
- `source-acquisition/hosted.ts`: validates platform/id/canonical URL before side effects, creates a
  fresh scratch directory, dispatches only the YouTube or Zoom extractor, validates real physical output,
  and removes only its freshly-created job directory on error. Success retains media for persistence/
  retention. Immediate unchanged consumers: createOnairSource/createZoomRecordingSource → fetch/toTurns
  → intakeFromSource → createMongoIntakeSink, tenant source/media/session/turn docs.
- `sources/youtube.ts`: optional production scratch allocator isolates concurrent requests; the returned
  file must be within that request's directory. Existing default/injected adapter semantics are preserved.
- `source-acquisition/duration.ts`: bounded ffprobe metadata using file protocol only. Production
  youtube/hosted toTurns propagate the measured duration to the real STT wrapper, which requires it.
- `source-intake/store.ts`: root's explicit resume exception, coordinated with T053. Source creation
  remains 201 and duplicate 200; the body separately reports indexing done/failed/pending. Done needs
  matching session, positive complete version2 tree/chunk receipt and nondegraded summary/claims.
  Only core receipt fields are serialized; optional provider diagnostics never escape. Failure keeps
  raw rows and emits a fixed safe reason; duplicates neither index nor create/delete anything and
  report pending/already-ingested. T053 can reuse a positive receipt and verifies/retries separately.
- `docs/t045-source-coverage.md`: actual runtime instructions, portable dependency provision and explicit
  five-source/full-downstream acceptance gates, with no completion or deployment claim.
- `docs/t045-runtime-provision-proposal.md`: exact immutable yt-dlp 2026.08.19 native assets/digests,
  reviewable Windows .cache/Docker provision plan, Node JS runtime and bundle-external resolution.
  No artifact download, install, cookie, provider call or deployment occurred.

Checker feedback incorporated on resume: ordinary YouTube links and commented/inert embeds no longer
qualify as event recordings; real STT requires measured duration and clamps/validates its bounds/tail.
These corrections await executed focused probes and independent review; no full acceptance inferred.

Security flags: authentication/session cookies, application provider credentials, filesystem writes and
media cleanup, tenant-scoped persistence and external tool/provider calls. No real provider, browser,
database, host configuration, package installation, secret disclosure or Git mutation was run by maker.

## Evidence receipts and planned focused checks

- Metadata-only command inspection: node/ffmpeg/ffprobe present; yt-dlp absent PATH. Environment booleans
  only: GEMINI_API_KEY defined/nonempty; source-intake/model/yt-dlp-path flags absent. Secret values were
  not emitted. This is configuration evidence, not authorization, provider readiness or a real source run.
- `git diff --check -- apps/api/src/source-intake/adapters.ts apps/api/src/source-intake/wiring.ts
  packages/ingest/src/sources/youtube.ts`: exit 0, no output, 1.9826-second tool batch including metadata.
- Static LOC: API runtime 154; adapters 103; wiring 39; YouTube 277; acquisition modules <=79 each.
  All changed source files fit their declared 300-line budget. No full structure check was inferred.
- First hash-report PowerShell attempt had a parser error (pipeline after foreach); corrected native
  PowerShell report exited 0 in 0.8906 seconds. Hash pins below are from the corrected result.
- Planned affected/downstream fixture checks, awaiting root CPU slot:
  `node --test --import tsx apps/api/src/source-intake/media-runtime.test.ts
  packages/ingest/src/source-acquisition/hosted.test.ts`.
  Runtime protocol fixtures exercise real candidates response parsing, safe errors, processing/deadline,
  cleanup and foreign upload endpoints. Hosted fixtures use actual temporary files and unchanged source/
  intake consumer with an in-memory sink, D-135 repeat and D-136 two-tenant source IDs. They are unit proof,
  not playable media/provider/Mongo/index/cited Ask evidence.
- Planned regression checks: existing packages/ingest/src/sources/youtube.test.ts and the existing
  apps/api/src/source-intake/*.test.ts files, smallest necessary set only; contracts/verify_contracts.py
  under root/checker coordination. No full local suite or mutation run is planned.
- Central verifier receipt reused with current hashes independently compared: qa/evidence/goal-t051checker-validator.json
  records `python contracts/verify_contracts.py`, exit 0, output `verify_contracts: no frozen contracts yet
  (research phase) -- PASS by vacuity`, combined checker batch 1.4327147 seconds (individual duration unknown).
  Current validator SHA256 1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 and
  registry SHA256 d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 match the receipt.
  This satisfies only the unchanged vacuous verifier, not stage or downstream acceptance.
- Native Python metadata command `python -c "import importlib.util,json; print(json.dumps({'yt_dlp_module_present':importlib.util.find_spec('yt_dlp') is not None}))"`:
  exit 0, output `{"yt_dlp_module_present": false}`, 0.5945 seconds. No package install or provider request.

Upstream CLI compatibility was checked against primary yt-dlp options.py and extractor/zoom.py source.
The unsupported --no-netrc flag was removed before execution; netrc stays disabled by default and config
loading is disabled. References: https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/options.py and
https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/zoom.py. Actual pinned tool/version behavior
and actual download still require execution; upstream current source is not that evidence.

## C1-C8 reconciliation

| Criterion | Present source preparation | Remaining full-parent proof |
| --- | --- | --- |
| C1 | YouTube/hosted acquisition; reuse T011/T034 live bot paths | Actual five independent source runs; hosted Zoom is not Zoom live |
| C2 | Existing production composition caller can obtain configured STT deps | Windows operational entrypoint/configuration and actual execution |
| C3 | Nonempty size/signature/shape guards; m4a acquisition and mandatory ffprobe duration/clamp/coverage | Playable speech, real measured bytes and correct real transcription/completeness |
| C4 | Tenant persistence; explicit safe index status/receipt and T053 verified receipt reuse | Real tenant readback, actual fresh index and source-cited Ask on every row |
| C5 | Default flags, trusted config, sanitized subprocess, canonical IDs, existing tenant source IDs | Independent current route auth/tenant/cross-tenant probes and actual persistence |
| C6 | Bounded failure/cleanup, existing dedupe planner; new fixture tests authored | Executed fixtures plus actual-media duplicate/recovery/gap proof |
| C7 | Pinned OnAir network, no generic extractor, safe argv, owned paths and safe diagnostics | Independent hostile URL/redirect/exec/path and auth/session probes |
| C8 | This file map and source hashes | Executed focused checks, frozen full packet, verifier and independent matching-cycle verdict |

## Raw SHA256 pins

| Path | SHA256 |
| --- | --- |
| apps/api/src/source-intake/adapters.ts | 43e8f16b78b6fdd091c769f3851e0dacf65f7a3ebac820f74c62133c2eac2414 |
| apps/api/src/source-intake/wiring.ts | 90c0f8add44b68e40e4659f4f328e7767bdf54d14a4d71ab54d3eb493b37ac06 |
| apps/api/src/source-intake/media-runtime.ts | b0eaaf3e9f957a61efba55d3b1c980a70ea8f8ded893962044f936bf91a5e772 |
| apps/api/src/source-intake/media-runtime.test.ts | b80ffe1380d44bf110008283f6cef5bbf2884cef21681db51f36bd50bdc309a0 |
| apps/api/src/source-intake/store.ts | 8f57fb2fcf1f245aa5d978b0e1858d6debc34126a82e6a26233be20dba35dcf6 |
| apps/api/src/source-intake/source-intake.test.ts | f4c5a607c4c36b92735594d2bcbbf744bc7b904eb10328ceac48bed51c559f5a |
| packages/ingest/src/sources/youtube.ts | c5d70c9b4ec16930e01fc1d46a86657662d451e1e7cfa803fc687170107dd6ae |
| packages/ingest/src/sources/hosted-recording.ts | 90f89813033e33f4fcc2f9b04ad65e40ebdc8af0484180198250ed8b69dab4c2 |
| packages/ingest/src/source-acquisition/exec.ts | 1ae1105fc749441810c82e102a6b3f24273956ebb06fd2b68c240293af75fd50 |
| packages/ingest/src/source-acquisition/hosted.ts | 6fc00d436ce399086e70df2b01867db45c714b058568699c3d92c6acdb387fe2 |
| packages/ingest/src/source-acquisition/onair.ts | 7418a4757f6bec15edd016c76d69553f26000c2bec88504f0acb3f2a798e7033 |
| packages/ingest/src/source-acquisition/duration.ts | 85d0ebf98200b8f2b130a66c410c0af53f203b95fdc0707ddef17d801c09ba79 |
| packages/ingest/src/source-acquisition/hosted.test.ts | ae637b319df78035a15e2edee543aa20a3f3982f95fc78da7687e7dc9a4ac427 |
| docs/t045-source-coverage.md | 62ddc8af50457cc5364d34133319629a86c67ea2c37327bd0d86f059a0115702 |
| docs/t045-runtime-provision-proposal.md | f2c99ad7a021e7fa94c8ae7e0ff4f9cbbb9524588c091cec34afe2fc9523c836 |

New modules/tests/docs had no base blobs before this maker unit. Six tracked edits are adapters.ts,
wiring.ts, store.ts, source-intake.test.ts, youtube.ts and hosted-recording.ts. No standalone issue-fix
unit is claimed and no ledger corpus is replaced by new fixtures. Current-source diff --check exited 0
in the 0.5556-second hash/diff batch after resume corrections; no tests ran in that batch.

## Durable separate worker extension (2026-10-14)

Root granted source-intake/jobs/** for real private shared-spool execution. New input/types/receipt/store/worker modules and eight jobs.test.ts fixtures are authored; API default wiring refuses inline SDK work. Store enqueue never runs acquisition, immutable tenant/actor/source approval is fsynced, poll omits URLs/approvals/provider diagnostics, internal completed() returns narrow complete index proof. Expired/lost claims become uncertain and cannot blindly retry; direct failure/incomplete indexing cannot become succeeded. No new Mongo canonical collection or migration. T053 coordinates202/poll/physical floor/recording receipt CAS, and watches remain honest503 until immutable snapshot executor exists. Actual compiled entry/root authorization factory/shared runtime mounts are still pending; no fixture or live test was run. docs/t045-source-worker.md states operational requirements and limits.

### Current durable worker source candidate

Actual jobs/entry.ts, lazy root composition/integrations/source-jobs.ts and separate Docker worker-tools CMD are now authored. Runtime shared bundler keeps both real entry guards and outputs source-worker.js; build has not run. API helper is pure/lazy until actual operations; enqueue and execution recheck fresh tenant-scoped nonrevoked stored ingest identity and protected DB target, plus immutable server approval. Worker current receipt is positive only after strict index completion; expired claims are uncertain and cannot replay. Ten own FS fixture tests are authored/unrun. Exact new/updated source pins follow; earlier same-path pin is superseded by this current table.

| Path | SHA256 |
| --- | --- |
| apps/api/src/composition/integrations/source-jobs.ts | 856267db87a4ce32a8e1993a35ca2cee88adabb39d8fb31f9978da1245bf5d6b |
| apps/api/src/source-intake/wiring.ts | 90c0f8add44b68e40e4659f4f328e7767bdf54d14a4d71ab54d3eb493b37ac06 |
| docs/t045-source-worker.md | 62757be25e0696abf6dad786bd11a621263f337a4141e97de98202a85a957137 |
| apps/api/src/source-intake/jobs/entry.ts | a5112e9ad7c949ccb0f2976aaa05e4051b897c0c2fe8430cf07b475084e27fd1 |
| apps/api/src/source-intake/jobs/input.ts | 6670ef0b2cfd4ef4238a4486e41b998aaefef5227afd00b07147ad8d00584528 |
| apps/api/src/source-intake/jobs/jobs.test.ts | 615d6d8b32e2c0c11eb0c0c5e5f231629b588ef962096e17d941f97f1ebdae34 |
| apps/api/src/source-intake/jobs/receipt.ts | c95ed1ae1943a27311cdb99181566c0b39f00cd6c5824b1e748f9868ab8e373f |
| apps/api/src/source-intake/jobs/store.ts | cc65d9826ad8d35f3289e636994517046454512299c38af1f9fbba1aa537096d |
| apps/api/src/source-intake/jobs/types.ts | 4d21094d10621281c2176987d10a6bd6d7019a3bccd93eb835648d4e61249581 |
| apps/api/src/source-intake/jobs/worker.ts | 5760cfc5a6026ee38bb3d9e41b5eda6e349d4ddff04cd814e6a47356b1737fed |

## Reused central build checkpoint

Read actual central receipts qa/goal-2026-10-14/api-types-attempt-3.json (exit0,14239ms, raw SHA25689e14679eb16194ccf20fc00ad52b1dd5c03ba4fe9f6cc3121f08628e403d57d) and api-build-attempt-1.json (exit0,1845ms, c8ef1a75a60679e40d6c9a808b25a14f7d1e2fadc7ff30cb590b705b5c048468). Observed actual server.js1094357 bytes and source-worker.js412045 bytes; worker direct-execution guard retains real import.meta.url. Authoritative runtime-externals.json lists @langchain/langgraph, ajv/dist/2020.js, dotenv, express, express-rate-limit, mongodb, pdfjs-dist/legacy/build/pdf.mjs. This is a build checkpoint, not final-image or source/provider acceptance.

Compared own source-intake/factory/worker raw hashes against compile-attempt-3-before.json: all match except subsequent input.ts duplicate-v refusal and jobs.test.ts concurrent-claim/duplicate-v fixture additions. Therefore do not claim this prior checkpoint as current whole-candidate type/build proof. Shared runtime is notified to include those in its next necessary final integration checkpoint. No extra maker compiler/test process was run.

## Security floor extension after roadmap resume

Root requires ISS-T045WORKER-001 and ISS-T045WORKER-002 fixes before READY. Read qa/issues.T045WORKER.jsonl exact two rows; privacy.test.ts consumes reproduction.input verbatim and authors all4 ACL cases plus all4 OnAir cases. Current executed count: ISS-T045WORKER-001 0/4 (UNRUN); ISS-T045WORKER-002 0/4 (UNRUN). Native Windows positive receipt is a distinct missing prerequisite; the deterministic ACL snapshot reader is explicitly a protocol model, not native proof. Actual POSIX/default guard control and current owned/public OnAir controls are authored. No recorded case is omitted or silently replaced.

PrivateSourceJournal now invokes actual default native owner/DACL or POSIX private verifier before root/tenant/artifact access and before mutation. OnAir queue approval contains immutable account/tenant/event/actor/provider-processing binding+session fingerprints; generic intake has no source cookie; executeJob alone fresh-checks current binding/stored identity and creates scoped protected intake. API can use trusted session fingerprint without cookie. Provided/public capture provenance is preserved instead of labeling protected supplied content public. Current source owner/env binding authority must reference actual approved session/event permissions; this is code preparation, not login or live account proof. Current compiled Windows ACL-script asset routing is pending shared integration.

New source paths are private-journal.ts, source-privacy.ts, privacy.test.ts and test-fixture.ts in source-intake/jobs. Earlier protocol jobs.test.ts uses explicit native-reader model on Windows to keep fixture checks bounded; actual native receipt remains separate. Container build tests readonly-mount only the exact synthetic checker shard to consume its corpus; no QA/raw evidence is baked into final images.

| Current security path | Raw SHA256 |
| --- | --- |
| apps/api/src/source-intake/jobs/private-journal.ts | fdf33826f28438f1964d4c44d28f6bd322f1ed8d86d60a725b7b4e8eed4ee14e |
| apps/api/src/source-intake/jobs/source-privacy.ts | 244adfee86121df68dc2667f8d79709620a33509d7746662e83f8c6fa10b5c79 |
| apps/api/src/source-intake/jobs/privacy.test.ts | e56cae40deba1b7ff6d984400ba9b7d736e665ad3ad3b523644e5b6feb36b574 |
| apps/api/src/source-intake/jobs/test-fixture.ts | a547e8519ff7bd58eab31b7f2e06b08f5384643cb745bb4dbcaecc9c7cfc8bf9 |
| apps/api/src/bot-privacy/private-acl.ts | 073bfa2de3471ca812c1957c72d7eb0a0683f05344090d2293cbdefe266c1239 |
| apps/api/src/bot-privacy/private-acl.ps1 | 47047e4d914122a3ada2313c457d13ae60f283333122b162e9e092f9be4894dd |
| qa/issues.T045WORKER.jsonl | 7852649e56c2c5065a310dcc5c0a1b58427d2dd860218a74bc8b5d73fb7d50c6 |

| Shared source dependency | Raw SHA256 |
| --- | --- |
| packages/ingest/src/sources/guarded-fetch.ts | 9fa6ef04a97db7096f30d1de0f1f9ead40fb54694f48a16071eaf387d7c9f914 |
| packages/ingest/src/sources/node-transport.ts | 61d0c702beafc166b8111f53c5e6b639b55b48642c863854b2cee8a97b2bea10 |

### Shared frozen dependency proof and bundled ACL asset preparation

Received frozen T036 dependency handoff and independently read/hash-compared qa/evidence/goal-t051checker-broker-t036-guard.json SHA256 255c4de0cb02b6074fefd7970e91b24254fa651ffa596f3faf0b4f8efbb1c5f6. Actual command node --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/ingest/src/sources/guarded-fetch.test.ts; exit 0, 42 pass/0 fail/0 skipped, elapsed 902.834 ms; guarded-fetch/test/ledger before/after pins unchanged. T036 packet measures its original ISS-T036GUARD-001: 8/8 recorded cases. This receipt certifies that scoped guard suite, not socket/DNS native tests or T045 whole caller/live acceptance. Matching independent T036 verdict was still pending at handoff.

Frozen API native ACL helper073bfa2de3471ca812c1957c72d7eb0a0683f05344090d2293cbdefe266c1239/script47047e4d914122a3ada2313c457d13ae60f283333122b162e9e092f9be4894dd received from owner. Shared bundler now emits static .ps1 sibling assets under dist/runtime-assets and rewrites helper URLs to actual bundle-relative paths. Source remains unbuilt at this update; old build/type receipt does not cover these security or bundler changes. Docker recursive dist copy preserves them and runtime-assets.mjs asserts actual script bytes. No Windows native execution is inferred from Linux asset presence. Container TAP consumers now explicitly request reporter=tap to match their count assertions.

### Final security candidate update

Current protected executeJob repeats current identity/source permission directly before acquisition, every Gemini upload/poll/generation request and index-stage entry; only cleanup DELETE for this attempt's validated remote file is exempt after permission loss. privacy.test.ts adds a deterministic permission-loss transport fixture (no actual provider). Source spool uses actual verifier by default; queue model fixtures remain explicitly injected. Shared ACL scripts are now prepared for bundle-relative dist/runtime-assets output, pending fresh build/native receipts. New source/type/worker/factory/consent changes all postdate the earlier central build checkpoint and require current source checks; the earlier two-file delta description was historical.

Read/verified independent shared guard verdict qa/verdicts/t036-ssrf-documentation-prefix.md PASS cycle0 SHA256 ba47ad2bd849cf46a35c03a0374394e836ebcda644f5e3e41a9f8b72a95e43f4. Its independent broker probe qa/evidence/goal-t051checker-broker-t036-independent.json SHA256 c43e8bf9aff4bfb2a154f559a63052d62b9f39c166367696dc3d7b330ddbfc83 exit0/301.587ms, three boundaries+actual public caller redirect/mixedDNS probe. This accepts the /20 guard seam only; OnAir caller bytes inspected/pinned, no external OnAir run or full T045 acceptance inferred.

### Current diagnostic reconciliation

Central api-types-current-freeze.json records exit 2 after 18.553 seconds. Its diagnostics contain no leased source-intake/source-jobs/acquisition path; this is scoped diagnostic evidence, not a successful current typecheck/build. T053's read-only hasConsumedSource boolean validates current physical outputs but exposes no receipt extraction or generation freshness proof. Therefore duplicate worker intake remains uncertain rather than constructing an unsupported positive receipt or repeating data writes. Exact security floor execution remains 0/4 per issue; current native Windows ACL and all actual five-source/downstream/provider proofs remain pending.
