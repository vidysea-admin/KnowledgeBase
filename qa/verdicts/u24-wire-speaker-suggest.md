# Verdict: u24-wire-speaker-suggest

VERDICT: PASS
Cycle checked: 1
Commits checked: 4d04e205, e0569bc5 (lane/wu24). Fakes only, no model calls.

EXPLANATION:
1. ISS-WU24-001 fixed: catch and timeout both call log.warn with tenantId, sessionId and error class only (errorName) or timeoutMs. No message, no transcript, no key. Mutations "catch unlogged", "timeout branch unlogged", "log leaks message" all KILLED. Still never throws (rethrow mutant KILLED).
2. ISS-WU24-002 fixed: the 300000 ms race exists and returns error:"timeout"; resolveSuggestSpeakers defaults OFF unless KB_SPEAKER_SUGGEST=1 (mutant `?? true` KILLED), buildIndexer uses it. Ignore-rejected mutant KILLED.
3. D-141 holds: only `suggested` is used, via buildSuggestionDocs and insertSuggestionsIfAbsent; no speakers write, nothing auto-confirmed. D-132 intent unchanged.
4. Full apps/api suite (D2_FIXTURE_PYTHON set): tests 817 pass 817 fail 0. tsc --noEmit exit 0.
5. Mutations, hash-verified (applied, then git hash-object == HEAD blob): 8 run, 7 killed (flag ON, rethrow, ignore-rejected, opts timeout ignored, 2 unlogged, log leak). Survivor: constant 300_000 -> 3_000_000 (tests inject timeoutMs).
6. Bypass hunt: Promise.race does not cancel run(); after a timeout the work continues and may still insert suggested-only rows. Not a safety breach. Filed, not fixed.

ISSUES-WRITTEN: ISS-WU24-003 (low) in qa/issues.wu24.jsonl
