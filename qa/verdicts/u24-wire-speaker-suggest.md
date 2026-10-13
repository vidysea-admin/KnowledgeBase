# Verdict: u24-wire-speaker-suggest

VERDICT: PASS
Cycle checked: 0
Commit checked: 2d036804 (lane/wu24). No model calls; fakes only.

EXPLANATION:
1. No path writes a final speaker from the model. The hook calls extractSpeakersGrounded({suggest:true}) and uses only `suggested` through buildSuggestionDocs and insertSuggestionsIfAbsent (status must be "suggested", $setOnInsert); `resolved` is never read. The hook runs after indexing is complete and status.index=done, so earlier indexSession error paths never reach it, and every error inside it is caught; a partial insert failure leaves only suggestion rows. Mutation "also write a speakers row" is KILLED. The only path to `speakers` remains the human confirm function.
2. Tenant scope: every read and write goes through scopedCollection (speaker-suggestions.ts); the model route is the existing `speakers` kind with tenantId. Confirmed labels are not given a second AI name (mutation ignore-confirmed KILLED); a rejected row is never resurrected and a confirmed row is untouched (deterministic _id plus $setOnInsert, test covers it). Mutation ignore-rejected survives only because the deterministic _id already protects the same pair; equivalent in practice.
3. Flag off: no call, no collection touched, no `speakerSuggestions` key in the result (test); default-ON mutations in speaker-suggest.ts and session.ts KILLED. The production default itself (production.ts) has no test: mutation `?? true` SURVIVES (ISS-WU24-002, low).
4. "Never throws" is correct but the swallow is silent in practice: the error goes only into the returned result, nobody reads it, nothing is logged (ISS-WU24-001, medium). The catch itself is untested (rethrow mutant survives).
5. tsc clean. Full apps/api suite with D2_FIXTURE_PYTHON set: 813 pass, 0 fail on the rerun; one earlier run showed 2 transient failures (811/813), noted in ISS-WU24-002. Mutations: 8 run, 5 killed, 3 survived (above).

Safe to merge as an opt-in. Fix ISS-WU24-001 (add a console.warn) before turning KB_SPEAKER_SUGGEST on anywhere.

ISSUES-WRITTEN: ISS-WU24-001 (medium), ISS-WU24-002 (low) in qa/issues.wu24.jsonl
