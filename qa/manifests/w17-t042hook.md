# w17-t042hook: T-042 P9 tile-speaker suggestion hook in indexSession

Status: checked-PASS
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t042hook (branch lane/w17-t042hook)
Base SHA: 9e55b642
Candidate SHA: the single lane commit containing this manifest (`git log -1 lane/w17-t042hook`)

## Changed paths
- apps/api/src/indexing/session.ts (hook after finishIndexAttempt; new result key)
- apps/api/src/indexing/types.ts (additive types only: `IndexSessionDeps.tileSuggest`, `IndexSessionResult.tileSpeakerSuggestions`). Brief named session.ts only; types.ts is required for tsc and is a pure type addition.
- apps/api/src/indexing/session-tile-suggest.test.ts (new)
- qa/manifests/w17-t042hook.md

## Contract: qa/contracts/goal-T042.md P9
- Hook effective only when `deps.tileSuggest?.enabled === true && tileSpeakerSuggestEnabled()` (LKB_TILE_SUGGEST=1) AND `committed` is set (finishIndexAttempt ran). Failed/degraded index never reaches it.
- Outcome under separate key `tileSpeakerSuggestions`; omitted entirely when hook off (spread-conditional, like speakerSuggestions).
- try/catch: throw -> `{suggested:0, inserted:null, reason:"failed"}`; the producer itself maps write failures to `write-outcome-unknown`. `completion` and other fields untouched.
- No speaker write; U2.4/D-141 block untouched. `allowTileOnly` left default (ISS-T042FUSION-004). `options` passes only `{enabled:true}` (no publication fence: see open items).

## Checks a checker should run (apps/api, node via codex runtime PATH)
- node --test --import tsx src/indexing/session-tile-suggest.test.ts
- node --test --import tsx src/indexing/session.test.ts src/indexing/tile-speaker-suggest.test.ts src/indexing/speaker-suggest.test.ts
- node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
- Mutation: delete `committed &&` in the hook condition; expect the "NOT committed" test to fail.

## Evidence
- session-tile-suggest.test.ts: tests 6, pass 6, fail 0
- session.test.ts: 26/26; tile-speaker-suggest.test.ts: 14/14; speaker-suggest.test.ts: 13/13
- tsc --noEmit -p apps/api/tsconfig.json: no output (clean)
- D-020 mutation (per-mutation byte backup, trap, restore): removing `committed &&` -> pass 5 / fail 1, killed by "enabled but index NOT committed"; restored, diff vs HEAD is the intended 12-line change.

## Open items / out of scope
- No production source for the registry's `readCommitted`/`measureDecodedClock`; the hook takes `context` and `readCapture` from the caller. Central integration must supply them and may need to pass a `TileSuggestionPublication` (assertCurrent/write fence); this hook calls the producer without one.
- Hook runs after finishIndexAttempt, so the tile rows are written post-commit (idempotent insertSuggestionsIfAbsent; retry safe).
- Worktree shows ~58 phantom CRLF-only modifications from checkout; not staged.
