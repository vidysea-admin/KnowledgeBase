# Verdict — revalidate

**Date:** 2026-10-14
**Contract:** none
**Manifest:** qa/manifests/revalidate.md (Status: ready-for-check, Fix cycle: 0)
**Cycle checked: 0**
**Checker:** independent, lane revalidate, commit 8e884f49
**VERDICT: PASS** (with 2 medium issues filed, 1 policy question for Umesh)

## Re-run (my own execution)
- Tests: scripts/webinar/*.test.mjs + validate-session.test.mjs + transcription-wiring + transcript-provenance + find-audio-file: tests 159 / pass 159 / fail 0. validate-session.test.mjs x3: 8/8 each time.
- `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed); `node scripts/lint-dirsize.mjs`: OK. (A first lint-root failure was my own harness file in the worktree root; gone after deleting it.)
- Real main-tree p2, `--dry-run --root <main>`: would write passed, 73 turns, coverage 1, partial false, QA clean; validation.json md5 unchanged (b6dcf9cc...) and no .validation-history created.

## Attacks (tmp roots, durationSec injected, canonical turns via writeTranscriptGeneration)
| Attack | Result |
|---|---|
| truncated 33% | failed (tail shortfall 601s) |
| empty / whitespace text | rejected at write by provenance; edited in post-write: failed "invalid transcript turn" |
| turns edited after QA (text, tEnd) | failed: non-canonical identity |
| QA outputCount != turns | failed (stale) |
| QA absent, flag on | failed; flag off: passes (as designed) |
| sessionId traversal (`../x`, `..\x`, `a/../b`, `C:\x`, empty) | all "invalid sessionId" |
| overlapping / swapped turns | PASS (original pipeline has same standard: validateTurns checks neither) |
| stale QA with equal count | PASS (ISS-REVALIDATE-001) |
| QA clamped=20, dropped=5, overshoot 400 | PASS (ISS-REVALIDATE-001) |
| identical repeated text, no QA | PASS (QA-dependent) |

Standard parity: the validator runs the same validateTurns (process-video.mjs) that submit.mjs and transcribe-long-session use, plus the immutable-identity, assertTurnTimings, gap/shortfall and QA checks the transcriber does. It is not weaker than the original path; it is stronger on gaps/shortfall. Its weakness (QA bound by count only) is inherited trust in the QA file.

## --accept-partial (policy exposure, not a FAIL)
A 33% transcript, or a single 1-turn transcript (coverage 0.0122), passes with --accept-partial. validation.json records partial:true, partialAccepted:true, coverage and gaps so downstream can see it, but session-rows.mjs:45 ignores partial, so the sync gate accepts. Needs Umesh's decision: ISS-REVALIDATE-002.

## Blessing arbitrary dirs
sessionId regex-confined (transcriptTenant). --root is trusted caller input: needs data/toc-migrated/<id>/source.json with tenantId, canonical-identity turns and a findable audio file; durationSec comes from ffprobe of that audio. Note (low, not filed): source.audioPath is joined unconfined, same as the existing findAudioFile. No stronger than hand-writing for someone with write access, but it adds no new capability.

## --range
Boundaries computed over the window then shifted by windowStart; chunkResults offsetSeconds = absolute start, ffmpeg cuts at absolute times, so turn times are absolute. Leading gap detected because findTimeGaps starts coveredUntil at 0 (needs --allow-partial). No flag: windowStart 0, windowEnd = duration, boundaries identical. Bad ranges (missing, abc, 5:2, 5:5, -5:10) print usage. No live Gemini run (not run by me either).

## Mutation (per-mutation byte backup, finally-restore, 120 s timeout, git hash-object == HEAD blob after each; final fidelity true)
15 mutations: 12 killed. SURVIVED: qa.nonMonotonic>0 off, qa.durationValid!==true off, assertTurnTimings step off (the last is largely redundant with validateTurns and the identity check; the first two are test gaps). Filed in ISS-REVALIDATE-001.
Killed: passed-always, partial gate, stale-count, pastEnd, repeatedRuns, QA-missing-with-flag, validateTurns, canonical identity, shortfall threshold, gaps, no-turns, transcriptValidated flag.

## Issues
ISS-REVALIDATE-001 (medium), ISS-REVALIDATE-002 (medium, policy) in qa/issues.revalidate.jsonl.
