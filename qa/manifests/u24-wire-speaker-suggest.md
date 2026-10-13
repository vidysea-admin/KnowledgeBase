# u24-wire-speaker-suggest

**Handshake status:** ready-for-check
Fix cycle: 1
Tier: roadmap U2.4 wiring (D-141). Class: data write (new production caller of speaker_suggestions): FULL ceremony. Lane: lane/wu24. No ledger issue fixed; no new issue filed. Edits no qa/contracts or docs/DECISIONS.md.

## Scope
Wire `extractSpeakersGrounded({ suggest: true })` into the real index path. `indexSession` gains optional `suggestSpeakers` (default OFF). When true, after indexing it calls `suggestSpeakersForSession` (apps/api/src/indexing/speaker-suggest.ts), which loads confirmed + rejected pairs (`listConfirmed`/`listRejected`), runs the grounder with `suggest:true`, builds docs (`buildSuggestionDocs`) and `insertSuggestionsIfAbsent` ($setOnInsert). Never writes `speakers`, never uses `resolved`, never throws. `buildIndexer` (production.ts) passes `options.suggestSpeakers ?? speakerSuggestEnabled()` = env `KB_SPEAKER_SUGGEST === "1"`. Model route: job kind `speakers` (config/ai-routing.yaml `speakers: [ollama]`, unchanged); proposer and verifier both use it. Speaker-rules grounding and the speaker-tile fusion file untouched.

## Files
apps/api/src/indexing/speaker-suggest.ts (new), speaker-suggest.test.ts (new), session.ts (+dep, +call), types.ts (+optional result key), composition/production.ts (+flag).

## Evidence
```
apps/api speaker-suggest.test.ts: ℹ pass 9 ℹ fail 0
apps/api full suite: ℹ tests 812 ℹ pass 811 ℹ fail 1 (pre-wire count of new file excluded: 803 existing + 9 new... see below)
  the 1 failure: activity-health/router.test.ts "actual producer -> Python ..." (needs repo .venv python.exe, absent in the lane worktree; passes 3/3 in the main tree). Unrelated.
tsc --noEmit apps/api: clean. node scripts/lint-loc.mjs --all: OK (10 stages, 0 failed).
```
Flag-off proof: test "indexSession with the flag ABSENT/false" asserts no `speakers`-route call, no touch of speakers/speaker_suggestions collections, and `"speakerSuggestions" in result === false` (result shape identical). No real model call: scripted fake `complete`; in-memory Db.
Mutations (restored; hashes verified): flag default ON KILLED; flag ignored in indexSession KILLED; suggest:false KILLED; ignore confirmed/rejected SURVIVED until the "confirmed label not given a second AI name" test was added, then KILLED (pass 8 fail 1).

## U2.4 acceptance
Met in code: model path has a production caller; suggestions only, never auto-final; human-confirmed/rejected decisions respected; flag off by default; verifier route is the existing `speakers` route.
Needs a live run (not done): KB_SPEAKER_SUGGEST=1 against a real ollama qwen3:8b and real Mongo (migration for speaker_suggestions still unapplied); precision re-gate (ISS-282/ISS-255) on real sessions; the migration approval.

## Fix cycle 1 (verdict cycle 0: ISS-WU24-001 medium, ISS-WU24-002 low)
- Failures logged: catch and timeout call `log.warn(...)` with tenantId/sessionId/error class only (no message, no transcript); still never throws.
- Timeout: `SPEAKER_SUGGEST_TIMEOUT_MS` = 300000 race; returns `error:"timeout"`, logged, indexing continues.
- New tests: logged failure (asserts no secret in log), timeout, indexSession completes when hook fails, production default via `resolveSuggestSpeakers` (OFF unless KB_SPEAKER_SUGGEST=1), rejected pair gives suggested==0.
- Evidence: speaker-suggest.test.ts pass 13 fail 0; apps/api full suite (D2_FIXTURE_PYTHON set) tests 817 pass 817 fail 0; tsc --noEmit apps/api exit 0.
- Mutations (per-mutation byte restore in finally; git hash-object == HEAD blob for both files): `?? true` KILLED, rethrow in catch KILLED, ignore-rejected (`rejected: []`) KILLED. 3/3 killed.
