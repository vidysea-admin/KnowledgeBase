# Manifest — t048single (lane/w16-t048single)

**Status:** checked-PASS
**Fix cycle:** 1
**Base SHA:** a9fac545 (checkpoint). **Candidate SHA:** see commit on lane/w16-t048single.
**Parent:** qa/verdicts/goal-t048.md HOLD. Defaults stay OFF (D-162); no promotion; no provider calls.

## C3 finding
At base a9fac545 the driver (scripts/transcribe-long-session.mjs) already routes the initial single
strategy through `dispatchRecordingTranscription({ singleAttempt })`, and `singleAttempt` calls
`transcribeSpanOnce` directly (one upload, poll, ONE generateContent). It no longer calls the
retrying/recursing `transcribeSpan`. The retry loop (MAX_ATTEMPTS_PER_SPAN=3) and tail recursion
(MAX_RECURSE_DEPTH=3) are reached only from `chunkAttempt`, i.e. after fallback. Dispatch falls back
only on thrown error (fixed redacted code single-failed) or `complete(turns)` false (single-incomplete);
the failed/partial single turns are discarded before chunk merge. No production code change was needed
in this lane for C3; the verdict's inspected lines 217-240 predate the checkpoint.

## Behavioural evidence (real CLI child, fake ffmpeg/provider)
scripts/lib/transcription-wiring.test.mjs: single on 3600s = 1 call; 5400s inclusive boundary = [5400]
one call; single provider error = [3600,2400,1200]; incomplete single = [3600,2400,1200] with single-a1
accepted=false; empty/malformed/gapped go straight to chunks; 6000s and unset model chunked.

## Changed paths
- scripts/lib/transcription/private-recording-driver.test.mjs (test-only): the temp-copy closure was stale
  (provider-input.ts now imports native-provider-audio.ts and the native/tiles chain), giving
  "Cannot find module ./native-provider-audio.js". Added copyTypedClosure (recursive .js->.ts import
  copy); spawn timeout 30s->240s (cold tsx child exceeded 30s under load); mutation assertion now prints
  child output on failure.

## Not done / left open
- t048-sealed-private-capture-20261014 stays `building`: its manifest names unmet prerequisites outside
  this lane (original-duration EOF baseline evidence and producer/helper repair owned by T011/root/runtime).
  Manifest file not edited (checker/root owned). Driver 327 lines unchanged.
- C1, C6, C7 (promotion authorization, real TOC pair, live downstream) remain unachieved.
