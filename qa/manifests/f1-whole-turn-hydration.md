# Manifest — f1-whole-turn-hydration (F1B, follow-up of f1-waiver-condition)
**Contract:** qa/contracts/ask-condition-fidelity.md (synced unchanged at 85625836, commit f591873b)
**Criteria:** `F1B-C1`, `F1B-C2`, `F1B-C3`, `F1B-C4`, `F1B-C5`, `F1B-I1`, `F1B-I2`, `F1B-I3`, `F1B-I4`
**Policy-Version:** proportional-verification/2026-11-22.19
**Tier:** L (tick.mjs --route f7eb479f..HEAD: floor L, rule "contracts"; the diff also reads tenant-scoped turns in the hydrator)
**Status:** ready-for-check
**Fix cycle:** 0
**Round:** 7 source and test files, 9 criteria, est 150 min — the hydrator, the deep graph and the release gate had to be changed together; the first deep design failed the frozen ask-graph golden and was redone with a conditional marker
**slow-plan:** the deep answer node, the fast gate and the release gate each judged the same answer separately; one shared judgment (judgeCitedTurns) had to land in all three places before any criterion could be tested end to end
**Executor:** claude-sonnet-subagent (builder; never declares done)
**Dual check:** required — the hydrator now returns the text of turns read under the tenant and visibility of the caller (see the dual-trigger line)
dual-trigger: tenancy apps/api/src/ask/source-context.ts:250
**Base:** f7eb479f (the f1-waiver-condition close-out; red base) · code commit e7ef334f (final code SHA) · branch f1-whole-turn-hydration
**Issues addressed:** ISS-F1WAIVERCONDITION-001 (high), -002 (high), -005 (medium). Filed and NOT built here: -003, -004, -006.

## What changed
- apps/api/src/ask/source-context.ts:250 — `createSourceHydrator`: next to the unchanged slices it returns `liveTurns: [{ sessionId, turnId, text }]`, the stored text of each turn that has a hydrated quote, taken from the `byTurn` map built from the single existing read. A turn over `TURN_EVIDENCE_LIMITS.turnBytes` (16 KiB) is left out, never cut. The mixed (transcript plus native) hydrate passes it through. No new read.
- packages/ask/src/ask-graph.ts — deep path: `gatherCandidates` keeps `hydrated.liveTurns`; `refineNode` builds `evidenceTurns` and feeds generation `wholeTurnSources`; `answerNode` runs the new exported `judgeCitedTurns`. `holdForReview` and `transcriptQuotes` moved here from ask-v2.ts (exported, same code). Diff +48/-3.
- packages/ask/src/ask-v2.ts — deep wiring only: `askV2` is now `askGraphV2` (the post-hoc wrapper and its early return on `web_used` are gone); the fast gate calls the same `judgeCitedTurns` (the `!web.length` skip is gone). Diff +11/-26.
- apps/api/src/answer-policy/answer-evidence.ts — F1B-C4 only: `conditionReleaseHold` also skips an answer that carries the audit marker `ask.condition_checked`. +3/-2; the file is 547 lines (546 at base, already over the 300-line guideline; net +1 line).
- Tests: packages/ask/src/condition-fidelity.test.ts (+78), apps/api/src/ask/source-context.test.ts (+64), apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts (+113). Whole diff against f591873b: 7 files, +316/-39. No new source file.
- The marker `ask.condition_checked` is appended only when the hydrator supplied `liveTurns`, so the frozen ask-graph golden baseline stays byte-identical.
- One judgment: `judgeCitedTurns(result, turns, cited, live)` expands a cited id to its whole-turn quote ids, holds with `cited turn <id>: <incomplete>` when a cited turn is not whole, otherwise `conditionHold`. No model call. Web sources are never turns and never enter it.

## Recorded reproductions, by issue id (F1B-C5, D-015)
Ledger: qa/issues.F1WAIVERCONDITION.jsonl (6 rows, last changed in f7eb479f), sha256 `166085f83a155203bb315f9281dd348c08c353105e3bef59f72b5db28bdc3ef9`.
- ISS-F1WAIVERCONDITION-001 repro, verbatim: "Fast Ask, real hydrator, fake model, archived turn t042 (over 1024 bytes), answer keeps the school-specific condition: held for review instead of released". Encoded by `[F1B-C1][F1B-C2] real hydrator, fast: the archived t042 turn ...` and `[F1B-C2] real hydrator, fast: an answer that keeps the school-specific condition is released ...` in apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts. **-001: 1/1 released on the kept condition, and the dropped-condition draft held** (red at f7eb479f: held for "excerpt" instead of released).
- ISS-F1WAIVERCONDITION-002 repro, verbatim: "Deep Ask over the 14 archived UC probes: generation receives slices; an incomplete cited turn does not trigger a hold". Encoded by `[F1B-C3][F1B-C5] ISS-F1WAIVERCONDITION-002 the 14 archived UC probes, real hydrator, deep` and the `[F1B-C3] deep` tests in packages/ask/src/condition-fidelity.test.ts. **-002: 14/14 held by the recorded school scope in deep** (see the table).
- ISS-F1WAIVERCONDITION-005: the row has no `repro` field; its title is "The release check runs again on slices when liveTurns is absent and for all internal sources; it may not skip web_used answers" and its fix_direction "judge whole turns once when liveTurns is present; covered by criterion F1B-C4". Encoded by the two `[F1B-C4]` tests in apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts and `[F1B-C4] deep with web_used sources` in packages/ask/src/condition-fidelity.test.ts. **-005: 3/3 tests green** (marker skip with the control that an unmarked slice answer is still held; web_used judged on internal sources only; deep web_used no longer skipped).

## The 14 archived UC probes, real hydrator, fake model (F1B-C3, each compared with the RECORDED outcome: held by the school scope)
Recorded outcome per probe: the answer is held for review, public answer and history empty, reason names the recorded school scope (`limits this rule to "...school..."`). 7 recorded claims x 2 recorded questions. The test prints one line per mode, `F1B-PROBES mode=<mode> held-by-recorded-scope=n/14 [...]`.

| Mode | Base f7eb479f (red) | e7ef334f |
|---|---|---|
| fast, real hydrator | **0/14** (every probe held for the reason "the hydrated excerpt is not the whole turn", never by the school scope) | **14/14** |
| deep, real hydrator | 14/14 (held by the old post-hoc check; the hydrator supplied no whole turns, and generation still read slices) | **14/14** |

Divergences: none from the recorded outcome. The deep column was already 14/14 at base through the old wrapper. What changed in deep is that generation now reads whole turns, a cited excerpt holds, one marker prevents a second judgment, and `web_used` answers are judged (the base wrapper returned early). Those are the deep tests that are red at base (see Red first).

## Red first (TDD), base f7eb479f
Run in the worktree with the new test files over the unchanged base source: 15 of 64 tests failed (49 passed) across the three touched test files (output kept in the builder scratchpad, f1b/red-base.txt). The red ones include the real-hydrator fast tests (t042 reaches generation whole; kept condition released), the fast probes line (`held-by-recorded-scope=0/14`), the source-context `liveTurns` tests, and the deep, marker and web_used tests. The same files at e7ef334f: 64 of 64 green.

## CORE-REQUEST and open points
- CORE-REQUEST-1 (contract F1B-C1 wording): the contract says an answer citing an over-cap turn is HELD. With the production hydrator the over-cap turn's quotes are removed by `validateHydration` in packages/ask/src/source-context.ts ("quote-proof-stale: live turn missing") before any answer can cite them, so the turn is EXCLUDED from the sources, not held; Ask may then answer from the other sources or fall back to web. It is never judged on slices and nothing is released from it (test: `[F1B-C1] real hydrator: a turn over the 16 KiB cap ...`). The hold on a cited turn absent from `liveTurns` is real and tested one layer up (`[F1B-C3] fast|deep: a cited turn that is only an excerpt ... holds the answer`, in packages/ask/src/condition-fidelity.test.ts). Making the production flow hold instead of exclude needs a change to `validateHydration`, outside this unit's scope. Checker: decide whether this meets F1B-C1.
- ISS-F1WAIVERCONDITION-003, -004, -006: filed, not built, not touched.
- Consent: out of scope (D-210), not touched.

## Tenancy (F1B-I1) and the dual-trigger
`liveTurns` is built from `byTurn`, the map made from the one turn read that already runs under the tenant scope, the effective-turn overlay and the visibility gate. No new query and no new collection read: `[F1B-I1] liveTurns adds no read` pins the store reads (two `turns` finds, same filters) against the base list. `[F1B-I1] two tenants ...` shows a tenant-B turn, a foreign-tenant row smuggled into the session (the scoped read rejects it with "invalid scoped source row") and a turn the visibility gate drops never appear in `liveTurns`. Reads are unchanged, so Dual check is required only because the hydrator output now carries turn text; the checker should read apps/api/src/ask/source-context.ts lines 247-253.

## Pre-checks (final code SHA e7ef334f; prefix every command with `TSX_DISABLE_CACHE=1`, run from the worktree root)
Pre-check[F1B-C1]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C1\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/ask/source-context.test.ts -> 4 passed, 0 failed
Pre-check[F1B-C2]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C2\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts -> 3 passed, 0 failed
Pre-check[F1B-C3]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C3\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts -> 12 passed, 0 failed (prints `F1B-PROBES mode=fast held-by-recorded-scope=14/14` and `mode=deep held-by-recorded-scope=14/14`)
Pre-check[F1B-C4]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C4\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts -> 3 passed, 0 failed
Pre-check[F1B-C5]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C5\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts -> 2 passed, 0 failed
Pre-check[F1B-I1]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-I1\]' apps/api/src/ask/source-context.test.ts -> 2 passed, 0 failed
Pre-check[F1B-I2]: e7ef334f node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts apps/api/src/answer-policy/answer-router.test.ts apps/api/src/answer-policy/answer-workflow.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/answer-policy/native-answer-evidence.test.ts apps/api/src/answer-policy/stale-citation-refusal.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/ask/source-exclusion.test.ts apps/api/src/evaluation-flywheel/composition.test.ts apps/api/src/native-evidence/message-vertical.test.ts apps/api/src/native-evidence/vertical.test.ts apps/api/src/production.test.ts apps/api/src/routes/championship/championship-proof.test.ts apps/api/src/routes/compete/compete.test.ts packages/ask/src/answer-policy.test.ts packages/ask/src/answer.test.ts packages/ask/src/ask-graph.test.ts packages/ask/src/ask-v2.test.ts packages/ask/src/bounded-ask.test.ts packages/ask/src/bounded-evidence/native-bounded-context.test.ts packages/ask/src/bounded-evidence/vectorless-multisource-language.test.ts packages/ask/src/bounded-evidence/webinar-citation.test.ts packages/ask/src/condition-fidelity.test.ts packages/ask/src/fast/ask-fast.test.ts packages/ask/src/quote-proof-live.test.ts packages/ask/src/source-context.test.ts -> 347 passed, 0 failed, 1 skipped (answer-persistence live NASA test, gated on LKB_TEST_LIVE_NASA); run one file per process under timeout 600, 27 files, all exit 0
Pre-check[F1B-I3]: e7ef334f node --import tsx --test --test-name-pattern='\[F1B-C1\]' apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/ask/source-context.test.ts -> 4 passed, 0 failed (the over-cap tests are among them; the evidenceTurns cap tests in packages/ask/src/answer.test.ts are in the I2 set and unchanged)
Pre-check[F1B-I4]: e7ef334f git diff f591873b e7ef334f -- apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/ask/source-context.test.ts packages/ask/src/condition-fidelity.test.ts | grep "^+" | grep -cE "lkb_prod|MONGODB|process.env|fetch(" -> ok, 0 matches (the new tests use stubs and the in-memory answerTestDb only; 0 live calls)
Typecheck: e7ef334f `npx tsc --noEmit -p tsconfig.json` in packages/ask exit 0 and in apps/api exit 0

## Tests (selection from the diff)
Tests[F1B-C1]: apps/api/src/ask/source-context.test.ts apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts — a 3 KB multibyte turn comes back whole byte for byte next to the unchanged slices; a 20 KB turn is absent from liveTurns and its quotes are excluded; the mixed hydrate passes liveTurns through; the real-hydrator over-cap turn releases nothing
Tests[F1B-C2]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts — real hydrator, fast, archived t042: generation reads the whole turn with its own identity; the kept condition is released, the dropped one is held
Tests[F1B-C3]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts — deep and fast, the 14 archived probes n/14 each; deep generation reads the whole turn; a cited excerpt holds; one marker only; the deep call sequence is unchanged (no extra model call)
Tests[F1B-C4]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts packages/ask/src/condition-fidelity.test.ts — the marker skips the release re-check, an unmarked slice answer is still held; a web_used answer is judged on internal sources only and web text alone is never judged
Tests[F1B-C5]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts — the 14-probe tests and the recorded corpus pin, by issue id as above
Tests[F1B-I1]: apps/api/src/ask/source-context.test.ts — the read-count pin and the two-tenant, foreign-row and gate-dropped-turn tests
Tests[F1B-I2]: apps/api/src/answer-policy/answer-workflow.test.ts packages/ask/src/ask-graph.test.ts packages/ask/src/ask-v2.test.ts packages/ask/src/fast/ask-fast.test.ts — the 27-file affected set listed in Pre-check[F1B-I2] (the same set as qa/manifests/f1-waiver-condition.md) stays green; these four cover the workflow shape, the frozen ask-graph golden and the fast and deep call sequences
Tests[F1B-I3]: apps/api/src/answer-policy/fast/condition-fidelity-corpus.test.ts apps/api/src/ask/source-context.test.ts — the over-cap turn is never cut and never judged on slices
Tests[F1B-I4]: none — static: the new tests use stubs only

## Falsification (one per criterion; scratch copy of e7ef334f outside the worktree, own @lkb junctions)
Each mutation had a per-mutation byte backup, a subshell trap on EXIT/INT/TERM that restores it, tests under `timeout 300`, and a HEAD-fidelity check afterwards (LF-normalized `git hash-object` of the copy equals `git rev-parse e7ef334f:<file>`; OK for all five touched files after all mutations). The 82 junctions of the copy were unlinked (link only) before the copy was deleted.
- F1B-C1: in source-context.ts removed the cap filter (`.filter(() => true)`) -> 2 failed (the over-cap real-hydrator test and the 3 KB / 20 KB test). Also removed `liveTurns` from the return -> 10 failed in the two API files (whole-turn generation, the 14 probes, the mixed hydrate) · restored, fidelity OK
- F1B-C2: in ask-graph.ts removed the whole-turn feed `boundedSources = wholeTurnSources(...)` -> 2 failed (deep generation read the excerpt: the real-hydrator deep test and the `[F1B-C3] deep: generation reads the whole turn` test) · restored, fidelity OK
- F1B-C3: in ask-graph.ts replaced the answer node's `judgeCitedTurns(...)` by `answered` -> 6 failed (the deep 14-probe test, the F1-C2 deep test, and three deep tests plus the web_used test in condition-fidelity.test.ts) · restored, fidelity OK
- F1B-C4: removed `|| e.jobKind === "ask.condition_checked"` in answer-evidence.ts -> 1 failed (`[F1B-C4] the release check does not run again on slices ...`) · restored, fidelity OK
- F1B-C5: changed the recorded claim "Applicants can apply without TOEFL scores." to "... IELTS scores." in the corpus JSON -> 1 failed (the corpus pin) · restored, fidelity OK
- F1B-I1: (a) added a second `turns` read in the hydrator -> 1 failed (`liveTurns adds no read`); (b) built liveTurns from `effective` (rows before the visibility gate) -> 1 failed (the two-tenant / gate-dropped test) · restored, fidelity OK. A first I1 attempt, building liveTurns from every row of `byTurn`, survived (all green): that map already holds only rows that passed scope and the gate, so it is not a leak, only a wider set of the same visible turns; (a) and (b) are the real tenancy mutations.
- F1B-I2..I4 are guarded by the unchanged existing suites and the over-cap tests.

## Metrics
Metrics: affected tests 27 files, 348 tests (347 passed, 1 skipped) · typecheck packages/ask exit 0 and apps/api exit 0 · new tests 22 (64 in the three touched files, 42 before) · LLM calls added on any path 0 (the deep call sequence is asserted unchanged) · reads added 0 · diff +316/-39 across 7 files

## Notes
- The affected run of apps/api/src/evaluation-flywheel/composition.test.ts rewrites the tracked file qa/evidence/goal-t059-maker/rows.json; it was restored with `git checkout` and is not in any commit.
- One affected-set loop was stopped with TaskStop but its shell kept going, so two copies of the loop overlapped for part of the run (two test processes at once for a while). Every file exited 0 in both copies. The counts above are one result per file.
- Nothing connected to lkb_prod. No .env file was read. No live model or web call was made (stubs only). No push and no deploy.
- Commit trailer: the harness attribution for this session names Claude Sonnet 5.5, so the code commit carries that co-author line rather than the Fable 5.2 line the brief named.
- Consent is out of scope (D-210) and was not touched.
