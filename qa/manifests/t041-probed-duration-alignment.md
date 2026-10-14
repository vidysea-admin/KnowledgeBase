# Manifest — t041-probed-duration-alignment
**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Task:** T-041 (remains in_progress)
**Tier:** 3 — dependency-ready roadmap slice, assigned by orchestrator.
**Scope:** Bound final slide coverage and speech/slide overlap by the already validated ffprobe recording duration, including reused video outputs.
**Packet:** qa/packets/t041-probed-duration-alignment.md
**Verdict:** qa/verdicts/t041-probed-duration-alignment.md (independent PASS, cycle 0)

## Boundaries
No provider/model/router changes, live media job, OCR storage/retention decision, schema, renderer, feature flag enablement, central tracker edit, or whole-task completion. Existing flag-off and failure behavior retained. This is the first checked unit on the missing duration propagation seam; prior aligner implementation is reused.

## Evidence
Close-out: matching cycle-0 independent PASS verified; both candidate source/test blob hashes still match the checked packet. Independent distinct-slide core consumer probe 1/1 PASS, wall0.839s; maker suite7/7 and contract evidence reused with attribution. Full T-041 remains in_progress.

`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs scripts/webinar/process-video-slides.test.mjs` — exit 0; tests 7 / pass 7 / fail 0 / skipped 0; test duration 1004.9694ms, command wall 1.373s. The new test consumes actual core post-process/extraction/dedupe/alignment with injected fake ffmpeg/OCR: fresh and reused recording bound final slide and overlap at 2.3s.

`python contracts/verify_contracts.py` — exit 0; `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, wall0.381s.

Earlier broader invocation also included process-video.test.mjs: 19 passes, 1 environment-blocked failure (`real ffmpeg synthetic video yields timestamped playable frame evidence`, spawn EPERM). A negative-name-filter attempt did not exclude that test in this environment: same19/1 counts. No subprocess launched. Final scope uses only the fully green slide file; no real media proof claimed.
