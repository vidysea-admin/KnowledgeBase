# Verdict: ocrretry-ocr-retry-fallback
**VERDICT:** PASS
Cycle checked: 0
Commit checked: f543e40f

EXPLANATION:
- D-137 conformance: retry with exponential backoff (bounded, default 2 retries, 750ms total), then one fallback attempt, then omit and report {frameId, code, attempts}. A failure is never converted to blank. "Blank is final" is consistent: it covers only a well-formed {text:""} answer. Non-object, missing or non-string text, and confidence that is out of range or not a number are all classed ocr-bad-result and retried, so malformed results cannot slip through as blank.
- Timeout: Promise.race abandons the attempt and the late result is discarded; a late rejection is swallowed. The timer is cleared in finally. The underlying OcrFn cannot be cancelled (no AbortSignal), which is inherent.
- Attempts: correct in all paths (retries=0 gives 1; fallback adds 1; exactly one fallback call per frame). ocrErrors.attempts is additive; callers and the t041 tests are unaffected. Existing tests updated only to add noSleep and attempts. No OCR text is logged or put in errors.
- Evidence: tsc clean; keyframes tests 21 total, 20 pass, 0 fail, 1 skipped (real ffmpeg).
- Mutations (7): no-fallback, malformed-final, off-by-one, fallback-attempt-uncounted and bad-confidence-accepted were KILLED. Timeout-not-enforced was caught (the suite hung and the harness timeout fired). Timer-leak (removing clearTimeout) SURVIVED. Each file was restored and its hash equalled the HEAD blob; the harness is deleted.
- Low notes (not backlog): (a) no test asserts the timer is cleared; (b) retries/backoffMs have no upper cap, so a caller passing huge values can sleep for a very long time (the defaults are sane); (c) a partial but well-formed string cannot be detected.

ISSUES-WRITTEN: none
