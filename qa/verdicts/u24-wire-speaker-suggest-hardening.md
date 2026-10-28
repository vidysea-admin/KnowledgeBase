
# Verdict: u24-wire-speaker-suggest-hardening (cycle 0)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 000cbd5c2f0f0bfedd5381760b7080cca158cbb0
Base: a0391420

## Evidence (independently produced)
- Diff reviewed: speaker-suggest.ts (+AbortController, class-name error, degraded warn) and test (+4 tests). session.ts, production.ts untouched.
- D-015 replay of the rows' recorded reproductions: ISS-WU24-001 2/2 (find() throws: one log line, result.error "TypeError", secret absent; degraded run logs once with reason). ISS-WU24-002 1/1 (resolveSuggestSpeakers test, production.ts:162 delegates to it; timeout wrapper exists). ISS-WU24-003 2/2 (constant == 300000; fake-timer default timeout abandons, late run inserts 0 rows).
- Abandoned-run race: speaker-suggest.ts:67 aborts check; lines 68-78 have no await between the check and the insertSuggestionsIfAbsent call (buildSuggestionDocs and speakerTranscriptHash are sync, verified). Only an insert already in flight at timeout can land, which is unavoidable and idempotent ($setOnInsert, suggested-only).
- Consumers: grep of apps/api and apps/web: no reader of speakerSuggestions.error text (types.ts, session.ts passthrough; source-intake strips the key).
- Tests (timeout 600, exit 0): speaker-suggest.test.ts 17/17; session.test.ts 26/26; tsc --noEmit -p apps/api exit 0.
- Own mutation: moved the signal.aborted check before the await on extractSpeakersGrounded (per-mutation backup + trap): KILLED (ISS-WU24-003 default-timeout test fails). Restored; hash-object -c core.autocrlf=true equals HEAD blob c2da952e; git status clean.

## Not verified
- lint-loc not run by checker; maker's other four mutations not re-run; no full suite.

## Ledger
ISSUES-WRITTEN: none
ISS-WU24-001, ISS-WU24-002, ISS-WU24-003 MAY be flipped open -> verified.
