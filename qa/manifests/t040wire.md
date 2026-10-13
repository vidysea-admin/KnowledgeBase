# t040wire

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (next unblocked roadmap task: T-040). Class: data write (session_pages, claims via indexSession): full ceremony. Verdict by the checker only.
Lane: lane/t040wire (base ed7ff578). No lane ledger rows filed.

## Authorization
D-162 (Approved-by Umesh) lifts the D-119 driver-file hold for T-040 wiring with a default-off flag; D-126 approved the canonical-schema edit (already merged, t040-canonical-schema-grounded-notes); D-144 (LLM note judge) and D-151 (judge AND lexical rules both gate) govern what ships. No schema, contract, DECISIONS, hook or settings edit here.

## What existed (not rebuilt)
Grounded notes + Q&A producer, strict verifier, drop mode, judge and rules are merged in `packages/index/src/pipeline/{grounded*,summarize,claims}.ts` and `notes/`; `indexSession` already accepted `dropUnverified`. What was missing: nothing enabled it (`buildIndexer`, `sync-session.mjs` never passed it), the judge was never given a provider, and the write path was delete-then-insert.

## Change
- `apps/api/src/composition/production.ts`: `buildIndexer(..., { groundedNotes })`. `resolveGroundedNotes(option, env)`: caller choice wins, else ON only if `KB_GROUNDED_NOTES=1`. When ON: `dropUnverified: true`, `noteJudge = createLlmNoteJudge(routeComplete, job kind "note-judge")`, optional `judgeMaxCostUsd` from `KB_NOTE_JUDGE_MAX_USD` (invalid values ignored). When OFF none of these keys is set, so `indexSession` receives exactly what it received before.
- `scripts/webinar/sync-session.mjs`: `--grounded-notes` (with `--index`); passes `groundedNotes:true` only when given; prints one `grounded notes:` line (dropped counts, claim preserve/replace counts, judge totals). Proof/exit logic untouched. T-044/T-048 wiring (`transcribe-long-session.mjs`, ingest-chain) not touched.
- `apps/api/src/indexing/session.ts` + new `grounded-write.ts`: deps `noteJudge`, `judgeMaxCostUsd` passed to summarize and claims. Grounded mode (`strictWebinar && dropUnverified`) uses insert-first writes; the default path is the original code under `if (!grounded)`. Result gains `groundedNotes` ONLY in grounded mode (absent otherwise).
- `packages/index/src/index.ts`: exports `createLlmNoteJudge`, `NOTE_JUDGE_JOB_KIND`, types `NoteJudge`, `JudgeSidecar`.
- Tests: `apps/api/src/indexing/session-grounded-wire.test.ts` (9 tests; fake model, fake judge, fake db; no network, no Mongo, no browser).

## ISS-U25DECISIONS-001 (delete-then-insert) - how it is not repeated
- Claims: previous rows are read first; rows with `status` other than `needs-review` (`verified`, `conflicting` = a human/review decision) are never deleted; a fresh claim whose normalised text equals a preserved row is not inserted twice. New claims are INSERTED FIRST; only then are old `needs-review` rows deleted, by `_id $in` (not by a broad filter). A failed insert issues no delete (tested). Worst case on a crash between the two steps is duplicates, never loss.
- session_pages: INSERT first, then delete the previous page ids. Not applicable beyond that: `schema/session_pages.schema.json` has no human-review/verified field (citedItems.verification is the constant "unverified"), so every page is wholly machine-written and there is no state to preserve; inventing one would be a schema change this unit is not authorised for.
- Atomicity: Mongo is standalone (no transactions, per sync-session.mjs); insert-first is the available substitute.
- Note: the legacy (flag OFF) path still has the delete-then-insert pattern; unchanged on purpose (byte-identical when off).

## Grounding / degradation
- Citations: unchanged strict verifier gate (`resolveEvidence`): every kept note carries quotes that are verbatim slices of real turns of this session; `citationTimes` resolves to turn tStart/tEnd. Ungrounded or judge/rules-rejected items are dropped and counted (`summary.dropped`, `claims.dropped`), never persisted.
- Judge or LLM failure: a judge that throws or returns garbage fails closed per note (existing `judgeCandidates`); the model failing degrades summary/claims. In strict mode a degraded result makes `indexSession` throw `strict webinar index incomplete` BEFORE any write (pre-existing contract; status.index set to failed), so existing notes stay untouched. The judge itself never throws out of the pipeline.

## Evidence (node = codex runtime; lane `@lkb/*` resolved to lane sources via a temporary tsconfig `paths` + TSX_TSCONFIG_PATH, deleted before commit)
- `apps/api: node --test --import tsx src/indexing/session-grounded-wire.test.ts` -> pass 9 / fail 0.
- packages/index `node --test --import tsx "src/**/*.test.ts"` -> tests 657, pass 657, fail 0.
- apps/api `node --test --import tsx "src/**/*.test.ts"` (D2_FIXTURE_PYTHON=main .venv python) -> tests 867, pass 867, fail 0.
- scripts/webinar `node --test --import tsx "scripts/webinar/*.test.mjs" "scripts/webinar/*.test.ts"` -> tests 161, pass 161, fail 0. `node --check scripts/webinar/sync-session.mjs` exit 0; no-arg run prints the new usage.
- `tsc --noEmit` packages/index exit 0; apps/api exit 0 (temporary paths tsconfig). `node scripts/lint-loc.mjs --all` -> `lint:structure: OK (10 stages, 0 failed)`, exit 0.
- Byte-identical OFF: test "flag OFF" asserts no `groundedNotes` key, original `deleteMany` before `insertOne` for session_pages, and strict-without-drop also has no key; the pre-existing session.test.ts (28) and session-grounded-notes.test.ts (3) pass unchanged.
- Tenant scoping: every written session_pages / claims / chunks doc has `tenantId:"t"` (asserted); all handles are `scopedCollection`.
- /citations route: claims written in grounded mode (quote + origin) are rendered through the existing `GET /citations/:claimId` with the cited turn id, tStart and tEnd (tested through `startTestServer`). Only claims surface there; citedItems/qa have no API route, so no API change; no web UI change made (none needed for this wiring).
- Mutations (6, per-mutation byte backup restored in `finally`, `git hash-object` before == after printed True for all): M1 claims delete before insert KILLED (3 fail); M2 prune verified rows too KILLED (1); M3 grounded forced off KILLED (4); M4 judge not passed to claims KILLED (1); M5 page delete-first KILLED (1); M6 empty-fresh guard SURVIVED, so the guard was removed as unreachable (indexSession only calls the helper with at least one extracted claim) and replaced by a session-level test that a judge rejecting all claims leaves old claims untouched.

## NOT covered / open
- No live model, no real Mongo, no live webinar run (a live recording was in progress; none launched). Live-model eval gates of the repair plan are untouched.
- Judge-down in strict mode throws rather than returning a degraded result (pre-existing strict contract); a caller wanting soft failure must catch it.
- If the model proposes zero claims, old machine claims are neither replaced nor removed (helper not called) - the same as before for the empty case only in grounded mode.
- Web UI for citedItems/qa not built (out of scope per brief).
