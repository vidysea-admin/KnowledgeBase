# Manifest - w27-dropsentences
**Status:** ready-for-check
**Fix cycle:** 0
**Contract:** none (owner decision D-191, Umesh 2026-10-22)
**Lane:** w27-dropsentences (branch lane/w27-dropsentences, from origin/master c7574a5e)
**Backlog tier:** orchestrator-assigned (wave 27)

## What changed
- `packages/ask/src/answer.ts`: the grounding judge result is now applied per sentence. A sentence is kept only on an explicit `supported === true && answersQuery === true` decision for its own id. Missing, duplicate, unknown-id, non-boolean or malformed decisions drop that sentence (fail closed). Zero kept -> the same `BoundedAskError("answer support or relevance refused")` (code `source_context_unavailable`, route -> 503). Returns `removedSentences` (count).
- `packages/ask/src/ask-graph.ts`: copies `removedSentences` onto the result only when > 0, so the frozen `ask-graph.baseline.json` stays byte-exact. Absent means 0.
- `packages/ask/src/ask-shared.ts`, `apps/web/src/api/types.ts`: optional `removedSentences` field.
- `apps/web/src/pages/AskPage.tsx`: note "N unsupported sentences were removed from this answer." (singular for 1).
- `docs/DECISIONS.md`: D-191 appended via `scripts/append_decision.ps1`. Supersedes: none (no earlier decision mandated whole-answer refusal).

## Consumers
- `/ask` route (`apps/api/src/routes/ask/ask.ts`) spreads the result, so the field passes through; error mapping unchanged.
- Answer history / review (`answer-workflow.ts`): the stored candidate is the JSON response, so it holds the kept text plus `removedSentences`. Dropped sentence text is not stored anywhere.
- Citations: the response `sources` are the retrieved-evidence lists and were never per-sentence; they are unchanged. Dropped sentences' text and sourceIds appear in no returned field (asserted).

## Evidence
- `packages/ask`: answer, ask-graph, bounded-ask, source-context, ask-v2, bounded-evidence/*, -> tests 152 / pass 152 / fail 0 (5 new in answer.test.ts + 1 new askV2 integration test in bounded-ask.test.ts; rerun after merging into answer.test.ts: answer.test 6/6, mutation runs below use the final files).
- `apps/api`: routes/ask/ask, answer-policy/answer-workflow, answer-policy/routes, ask-tenant-hostile, ask-tenant-isolation, evaluation-flywheel/composition -> 120/120. ask/source-context, ask/source-exclusion, routes/compete/compete, native-evidence/vertical, native-evidence/message-vertical -> 56/56.
- `apps/web`: vitest run src/pages/AskPage.test.tsx -> 15/15 (2 new).
- tsc --noEmit: packages/ask, apps/api, apps/web all clean.
- D-020 mutations (per-mutation backup + trap, script outside repo, hash fidelity pre==post):
  - M1 `verdicts.get(s.id) === true` -> `true` (filter off): KILLED (7 failures).
  - M2 `if (!kept.length) throw` -> `if (false) throw` (no zero-remaining refusal): KILLED (4 failures).
- lint-loc --all: loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, dependencies exit 0. lint-tests and tracker hit the runner's fixed 120 s SIGTERM under load; rerun alone: `node --test scripts/lint.test.mjs` 18/18, `tracker-audit.mjs --gate g1,g4,g5` rc 0. (An earlier run failed dirsize at 31 files in packages/ask/src; the new tests were folded into answer.test.ts instead of a new file.)

## Live (staging lkb_staging, API on port 3399, stopped afterwards)
POST /ask "What funding and scholarship options were discussed?" -> 200 in 165 s, 9 sentences, `removedSentences` absent (0 removed this run; the judge accepted all), `excludedSessions` 2 (`unsupported-text`: 2). Drop behaviour on a real judge decision was not observed live; it is covered by the unit and askV2 tests.
Snippet: "Education loans were discussed as a funding option, with the observation that lending practices have been quite restrictive because lenders ask for collateral." / "A ULIP plan or certain investments that culminate at the time the child starts thinking about university were mentioned as a way families save for education." Citations: session 2026-05-08-funding-dreams-loans-forex turns t038 (1905-2417s), t065 (3607-3631s), t037 (1902-1905s).

## D-015
No filed issue. Not applicable.
