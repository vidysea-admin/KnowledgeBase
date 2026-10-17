# Checker packet — t041-probed-duration-alignment / cycle 0

Repository: C:/Users/product/Desktop/KnowledgeBase. No commit created. Unit references T-041; no filed issue corpus is being substituted or closed.

## Changes and provenance
Only two tracked source/test files changed by this maker:

| Path | Original git blob | Candidate git blob |
|---|---|---|
| scripts/webinar/process-video.mjs | eab25b4ab3fa9c734caab332f59d8b4fa8483207 | 3d671f1141971df9a0ef415c648aab59ab12f9f8 |
| scripts/webinar/process-video-slides.test.mjs | bd1ff0db3ffac2bbf18207b0168c4fc7c319f019 | 8658f73e3a6d85b7ef6a077d7c67617ac0702cfc |

Complete diff: `git diff -- scripts/webinar/process-video.mjs scripts/webinar/process-video-slides.test.mjs`. Untracked additions owned by maker: this packet and matching manifest only.

- process-video.mjs:193–196 already probes and validates finite positive media duration and valid transcript scope. Fresh path :257 and reuse path :211 now carry that duration into `runSlideAlignment` :144.
- runSlideAlignment :149 passes `endSec: duration` to the injected hook. Scope validation, atomic output and temporary-frame cleanup are unchanged.
- keyframeOcrHook :172 passes `pipeline: { endSec }` to the existing core post-process call. This is the complete changed production logic.
- Existing immediate consumers: packages/core/src/keyframes/post-process.ts forwards `pipeline`; extract.ts uses `endSec` for dedupe and `sessionEndSec` alignment; domain/slide-turn-alignment.ts clips coverage/overlap by this bound.
- New integrated synthetic test uses real post-process, extraction, dedupe and aligner with fake ffmpeg bytes and OCR. Duration 2.3s, sample interval 2s, tolerated transcript end 2.6s; both fresh and reused output must end final slide and attachment at 2.3s and expose no OCR text.

## Contract and flags
qa/contracts/t041-keyframe-dedup.md clause 3: spans tile the explicit `endSec` bound. No dedicated slide-aligner contract exists; source semantics and roadmap T-041 define alignment to recording time. Maker has not edited contracts.

Auth/tenancy/credentials: no changed access boundary, tenant selection or credential handling. Data writes: YES, existing local `slide-alignment.json` output receives corrected timestamp ranges. No Mongo writes. Full independent handshake required; no UI/live-browser surface.

## Focused commands and environment
Successful focused command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs scripts/webinar/process-video-slides.test.mjs`. Exit0; tests7/pass7/fail0/skipped0; duration1004.9694ms, wall1.373s. All media/OCR/provider behavior in this file is fake; temp files are under OS temp and removed by test cleanup. New test imports actual TS core modules using the coordinator's synchronous installed-TypeScript hook, including relative .js-to-.ts resolution. No worker/esbuild subprocess is required. Hook file is scratch infrastructure, not a production source edit; inspect it before reuse.

Frozen contracts: `python contracts/verify_contracts.py` exit0, wall0.381s: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. No env keys required. No browser, network, DB, provider cost, mutation run, or broad suite required.

Earlier broad attempts: same runner over both process-video.test.mjs and slide test reported19PASS/1FAIL spawn EPERM; the existing real-ffmpeg test was unintentionally included. Second attempt adding `--test-name-pattern '^(?!real ffmpeg)'` still ran it under this environment and reported19/1. Both exits1, walls3.931s/1.856s. No subprocess launched. Do not replay the broad file without a separately approved media slot; final focused green scope is only the slide file. No real media evidence or whole T-041 PASS is claimed.

Manifest now ready-for-check cycle0. T-041 searchable OCR still requires its separate storage/retention/redaction decision and live acceptance. Candidate source/test blobs remain the pinned values above.
