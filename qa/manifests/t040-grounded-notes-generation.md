# t040-grounded-notes-generation

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (next unblocked roadmap task: T-040; the schema blocker was lifted by D-126 / merge c99c44d). Class: data write (session_pages, claims persisted through indexSession): full ceremony. Verdict by the checker only.
Lane: lane/t040gen (base 9e24d1f). Lane ledger `qa/issues.t040gen.jsonl`: ISS-T040GEN-001..005 (2 medium, 3 low; all open, none fixed here).

## What already existed (read first, so the diff is understood)
`strictWebinar` mode already had windowed extraction, a covered-span audit, an independent judge and persistence of citedItems / qa / claim quote + origin (`grounded.ts`, `grounded-summary.ts`, `claims.ts`, `apps/api/src/indexing/session.ts`). Its gaps against this task: (1) quotes were checked with `turn.text.includes(quote)`, not the merged strict verifier; (2) ONE bad item degrades the whole page (nothing is emitted); (3) it used its own `RuntimeItem/QA/Evidence` interfaces (ISS-SCHEMAEDIT-002). This unit closes those three and leaves the rest alone.

## Design
- **Types.** `RuntimeEvidence/RuntimeItem/RuntimeQA` in `grounded.ts` are now aliases of the generated `QuotedEvidence/CitedItem/QaEntry` from `@lkb/core`; `runtimeEvidence` returns the non-empty tuple the schema requires. No duplicated interface remains.
- **New mode `dropUnverified`** (option on `summarizeSession` / `extractClaims`, `IndexSessionDeps.dropUnverified`; effective only together with `strictWebinar`; default OFF, so default and plain-strict behaviour are byte-for-byte the old behaviour).
- **Verifier gate** (`pipeline/notes/evidence.ts`, `resolveEvidence`): each claimed quote is run through `verifyQuote` on its cited turn (same session id required), must lie entirely inside a submitted window span, and the EMITTED quote is the exact source slice `turn.text.slice(start,end)`, never the model's string. `extractiveText`: item text / question / answer must equal the joined verified quotes (modulo the verifier's normalisation); emitted text is the joined slices.
- **Dropped (logged in `result.dropped`, never persisted):** an item or claim whose quote the strict verifier refuses (not-found, partial-word / token-boundary, too-short, stitched ellipsis, cross-turn), whose turn / session is not in the session or not in the submitted spans, with no or malformed evidence, unknown kind, wrong origin or verification label, text that is not the quotes, or that the independent judge rejects (unsupported / wrong category). A Q&A whose QUESTION fails (or is judge-rejected) is dropped.
- **Marked unanswered (schema rule: answer null, answerEvidence empty):** a Q&A whose answer evidence fails the verifier, whose answer text is not its quotes, or whose answer the judge calls irrelevant; a rejected late answer in a later window leaves the earlier unanswered question standing.
- **Still degrades the whole page (unchanged protocol failures):** span-coverage acknowledgement wrong, judge incomplete / missing / duplicate / unknown verdicts, non-array model output, informative window with nothing verified (judge `noContent:false`), no verified insight left at all (`validateRuntimePage`).
- **Persistence:** the existing session-page write path in `indexSession` (tenant-scoped `scopedCollection` helpers only, no new write). Page `evidence` is the union of the item / Q&A evidence (item-level, with quotes), not the all-turn list. Claims persist `evidence[].quote` and `origin`. `IndexSessionResult.summary/claims.dropped` reports counts.
- **Timestamps:** the schema carries `turnId`, not times; `citationTimes(evidence, turns)` resolves each citation to its turn's `tStart/tEnd`.
- **`auditGroundedNotes(page, turns)`:** independent re-verification of an emitted page (strict verifier, verbatim slice, extractive text, origin, answered/unanswered coupling, id uniqueness); legacy pages audit clean.
- **Wiring:** ONLY `packages/index` pipeline + the `indexSession` session post-processing path (`apps/api/src/indexing/`). NOT wired into the live webinar runner (D-119 holds): `production.ts buildIndexer` and `scripts/webinar/sync-session.mjs` do not pass the option (ISS-T040GEN-005).

## Files
Edited: packages/index/src/pipeline/{grounded.ts, grounded-summary.ts, summarize.ts, claims.ts}, packages/index/src/index.ts (exports), apps/api/src/indexing/{session.ts, types.ts} (pass-through + counts). New: packages/index/src/pipeline/notes/{evidence.ts, drop-mode.ts, grounded-notes.test.ts}, apps/api/src/indexing/session-grounded-notes.test.ts, qa/issues.t040gen.jsonl, this manifest. Two packages (index + api) because pages are written in apps/api. Not touched: schema/, contracts/, qa/contracts/, DECISIONS, ARCHITECTURE, scripts/, migrations/, any other lane.

## Evidence (node = codex runtime; run from each package dir; apps/api run with `TSX_TSCONFIG_PATH` and a typecheck `paths` mapping of `@lkb/index` to this lane's source, in the scratchpad, because `@lkb/*` otherwise resolves to the main tree)
- `node --test --import tsx src/pipeline/notes/grounded-notes.test.ts` -> `tests 14, pass 14, fail 0` (verifier gate; 15-case refusal table; typography; timestamps; Q&A answered-only-with-evidence (5 answer variants + fabricated question); judge flags; late answer; outside-span quote; protocol failures degrade; default strict unchanged; seeded property 200 garbled quotes; claims; schema validation; tampered-page audit).
- Schema validation: emitted page (items of three kinds + answered Q&A) and an emitted claim validated with python 3.12 `jsonschema` Draft 2020-12 against `schema/session_pages.schema.json` / `claims.schema.json` -> `[]` errors; negative control (answered flipped to unanswered with an answer) rejected; the legacy fixture `schema/fixtures/session_pages/valid.json` valid and audits clean. (ajv is not installed; the test prints SKIP and passes vacuously only if python/jsonschema is missing: it ran here.)
- apps/api: `session-grounded-notes.test.ts` -> `tests 3, pass 3` (fabricated item and claim never appear in any written document; page evidence is exactly the cited turns q,a,d,f while coveredTurnIds lists all 5; claims carry quote + origin; without the flag the same input still rejects and writes nothing; non-strict path writes a legacy page with no citedItems / qa).
- Regression: packages/index `claims.test.ts summarize.test.ts quote/*.test.ts notes/grounded-notes.test.ts` -> `tests 146, pass 146, fail 0`; apps/api `src/indexing/*.test.ts` (session, session-grounded-notes, vector-gap, promote-entities) -> `tests 57, pass 57, fail 0`.
- Typecheck: packages/index `tsc --noEmit -p tsconfig.json` exit 0; apps/api via the temporary tsconfig (paths mapping, `--listFilesOnly` confirmed the lane copy is used) exit 0.
- `lint-dirsize` / `lint-loc` / `lint-dupes` report only pre-existing violations in other directories (none in packages/index or apps/api/src/indexing; new files 80 / 85 / 278 / 140 lines).

### Count against the ledger's recorded reproductions (ISS-WEBINARRELEASE-001, 4 recorded observations in its `evidence`)
1. `process-video.mjs buildNotes returns decisions:[] and actionItems:[]`: **0/1, NOT addressed** (scripts/webinar not touched; named as ISS-T040GEN-005).
2. `SessionSummaryResult exposes no structured Q&A`: replayed: drop-mode result carries `qa` with question / answer evidence (grounded-notes tests) 1/1.
3. `decisions/actions parsed as strings without item-level evidence`: replayed: every `decisions` / `actionItems` string equals a citedItem text whose evidence is a verified quote with a resolvable turn time; fabricated variants dropped 1/1.
4. `session.ts persists them with generic all-turn page evidence`: replayed through `indexSession`: page.evidence = the cited turns only (4 of 5) with quotes 1/1.
ISS-WEBINARRELEASE-002 (ready after degradation) is not in this unit; the degrade-on-protocol-failure behaviour it relies on is unchanged and still tested by the existing session.test.ts case.

## Mutations (12; harness `mut-t040gen.mjs` in the scratchpad: 120 s timeout, byte backup PER mutation restored in `finally`, `git hash-object` before == after printed true for all)
All 12 killed: M1 model quote emitted instead of source slice; M2 span check off; M3 judge verdict always passes; M4 origin check off; M5 extractive-text check off; M6 session binding off; M7 failed answer kept; M8 verifier bypassed by `includes`; M9 judge-rejected question kept (first run SURVIVED, test added, re-run killed); M10 late answer not judged; M11 api pass-through removed; M12 claims judge ignored.

## NOT covered / remaining for T-040
- No live model run and no live webinar: `dropUnverified` is not enabled by `buildIndexer` or `sync-session.mjs`; the live-model eval gates of the repair plan are untouched. `buildNotes` / final-notes sync and API/UI rendering of citations with times are later units.
- Findings: ISS-T040GEN-001 (12-code-point minimum refuses real short answers such as "In March."), -002 (sentence-span rule from the verifier manifest not enforced; a verified quote can drop a negation), -003 (4000-char span cuts), -004 (no "numbers" category in the schema), -005 (not wired / buildNotes). 001, 002 and 004 need an owner decision.
- The judge is a model: a semantically wrong but verbatim item that the judge accepts is emitted (labelled `unverified`).
