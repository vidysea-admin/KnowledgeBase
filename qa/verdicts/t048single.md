# Verdict - t048single (T-048 C3 slice)

VERDICT: PASS (scoped to C3 and to the test-only closure/timeout repair; NOT a parent T-048 PASS)
Status: PASS
Cycle checked: 1
Reviewed SHA: fb83229e853679c897e7aaec24af282b42c0cbcf
Base SHA: a9fac545
Contract: qa/contracts/goal-t048.md (C3 only). Parent HOLD qa/verdicts/goal-t048.md stays open for C1, C6, C7 (not judged here; flags stay OFF per D-162).

## Identity
- git diff a9fac545 fb83229e changes only scripts/lib/transcription/private-recording-driver.test.mjs and qa/manifests/t048single.md. scripts/transcribe-long-session.mjs and scripts/lib/transcription/recording-dispatch.mjs are byte-identical to base (hash d63ed92e... for the driver, both before and after my mutation run).

## C3 already-fixed-at-base claim: VERIFIED against base a9fac545
- Base driver line 256: singleAttempt -> checkedAttempt(transcribeSpanOnce(readFileSync(snapshotAudioPath), "single-a1", ...)). transcribeSpanOnce (base 165-190) does upload, poll, exactly one transcribeUploadedAudio (generateContent) with no loop.
- MAX_ATTEMPTS_PER_SPAN (3) loop and MAX_RECURSE_DEPTH tail recursion live only in transcribeSpan (base 193-237), reached solely via chunkAttempt (base 258).
- recording-dispatch.mjs: single branch calls singleAttempt once (singleAttempts = 1); on throw or complete()==false it logs a fixed code and falls to chunks; the failed single turns are never pushed to results. The goal-t048 HOLD cited lines 217-240 that predate this checkpoint.

## Independent evidence (all run by me)
- transcription-wiring.test.mjs, full file: exit 0, 23/23 pass (75s). Includes 3600s single = 1 call, 5400s inclusive = [5400], single error = [3600,2400,1200], incomplete/empty/malformed/gapped single fall back to chunks, 6000s and unset model chunked. The fake provider (transcribeUploadedAudio stub) appends one trace row per generateContent-level call, so these assert real call counts through the real CLI child.
- Own mutation: singleAttempt retries once on error (byte replace, per-mutation backup, timeout 600, trap EXIT/INT/TERM/ERR). Applied; "single call fails ... (1 failed + 2 chunk calls)" FAILED (call-count deepEqual), run exit 1; the 1-call happy-path test still passed, so the kill comes from the error-path count assertion. Restored; git hash-object == HEAD blob (d63ed92e...); git status shows no tracked modifications.
- private-recording-driver.test.mjs third test ("actual child source/audio/receipt mutation..."), run alone: exit 0, pass (75.5s). Full file also run once: exit 0, 3/3 pass (311s; third test took 177s under load, i.e. about 3 child spawns of roughly 59s each).

## Timeout 30s -> 240s judgement: does not hide a defect
- The timeout is per spawnSync child. Cold tsx children measured around 59s under current load, so 30s was a load artefact, not a product bound. If a child hangs or is killed, status becomes null and assert.equal(result.status, 1) still fails, so a hang is still a failure; zero-upload, status, stderr and no-turns.json assertions are unchanged.
- The test asserts correctness, not latency. The only thing lost is a (never intended) 30s startup ceiling. Residual note: slow startup would be tolerated up to 240s.
- copyTypedClosure fix is sound: it recursively copies the .js-specifier -> .ts import chain of provider-input/receipt-store/context/coverage so the temp copy resolves ./native-provider-audio.js; the diagnostic message only adds child output to a failing assertion.

## Findings
None in scope. Low note: copyTypedClosure matches only single-line import/from statements (regex), so a future multi-line import would regress the temp closure loudly (module-not-found), not silently.

## Not verified / limits
- C1, C6, C7 (promotion authorization, real paired TOC comparison, live downstream): not judged and not achieved. C2, C4, C5, C8, C9 not independently re-audited beyond what the 23 wiring tests incidentally exercise.
- No provider calls, browsers or real Mongo. contracts/verify_contracts.py not run (contracts currently trivial; out of this slice). Token/time telemetry for this checker not measured from the host; ratio unverified.

ISSUES-WRITTEN: none
Ledger rows: no issue rows relate to this unit; nothing to flip. The unit may flip to checked-PASS for the C3 slice only; t048-sealed-private-capture-20261014 and the parent T-048 remain open.
