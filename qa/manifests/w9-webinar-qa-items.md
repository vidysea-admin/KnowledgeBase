# Manifest — w9-webinar-qa-items
**Contract:** none (issue-driven unit; acceptance floor is the recorded row of ISS-WEBINARRELEASE-001 in qa/issues.WEBINARRELEASE.jsonl, D-015)
**Goal task:** none
**Date:** 2026-10-28
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** required
dual-trigger: prod-write scripts/webinar/sync-session.mjs:237
**Persona walk:** skip (no new screen, flow or user type; the web/API surfaces are untouched)
**Issues addressed:** ISS-WEBINARRELEASE-001 (observation 1 closed; observations 2-4 verified closed on the webinar path; legacy path left open as ISS-W9-003)
**Executor:** claude-opus-subagent (maker build)
**Executor rationale:** one precise, single-seam change; no external executor warranted.

Authority: docs/REMAINING-PLAN-2026-10-28.md Wave 2 W9, approved by Umesh 2026-10-28. Lane: w9 (worktree .worktrees/w9-webinar-qa-items, base 021bdea0, code commit cab0e0c8).

## Finding: which observations were still open
ISS-WEBINARRELEASE-001's row (retriaged 2026-10-26) lists four observations. On base 021bdea0:
1. `buildNotes` returned `decisions: []`, `actionItems: []`, `qa: undefined` -> STILL OPEN, fixed here.
2. `summarize.ts` prompt/`SessionSummaryResult` expose no structured Q&A -> already closed by T-040 on the webinar path: `strictWebinar` returns `citedItems` and `qa` (summarize.ts:32, grounded-summary.ts).
3. decisions/actions parsed as bare strings -> closed on the strict path (the page's `decisions`/`actionItems` are derived from accepted cited items).
4. `session.ts` persists generic all-turn evidence -> closed on the strict path (session.ts:131-133 persists `citedItems`/`qa` with per-item quoted evidence).
Every webinar caller indexes with `strictWebinar: true` (scripts/webinar/sync-session.mjs:261, apps/api/src/composition/integrations/transcripts.ts:39, apps/api/src/source-intake/jobs/entry.ts:36). Only the legacy non-strict path (non-webinar sources) still carries observations 2-4: named below, filed as ISS-W9-003, NOT changed (reason: it needs a persisted-shape or product decision for WhatsApp/URL sources; the unit brief says Tier L or HUMAN_GATE only for a shape change, and the webinar-release defect does not need one).
**summarize.ts and session.ts are therefore unchanged**; no schema file is changed (the new fields live in the local `notes.json` artifact, whose `notes` consumer in brain.ts reads only `notes.notes`).

## What changed
- scripts/webinar/slides/slide-knowledge.mjs: `NOTES_VERSION = 2`; `extractSpeechItems(sessionId, turns)` (deterministic, no model call): decisions, first-person action items and Q&A, each item ONE literal sentence (or <=280-char leading slice for an answer) of ONE real turn with `evidence:[{sessionId,turnId,tStart,tEnd,speakerRef,quote}]`; `verified:false`. Negated / conditional / hedged / interrogative sentences never become decisions or actions (HEDGED, case-sensitive modal "may" so the month May is not a hedge). A question is `answered` only by the next different-speaker turn within three turns (adjacency pointer, `link:'adjacent-turn'`), else `unanswered` with `answer:null`, `answerEvidence:[]`. A turn without a resolvable `_id`/timestamps/session is dropped and reported as gap `unresolvable-evidence`, never given other evidence. Lists capped at 100 with an `items-truncated` gap. `buildNotes` MOVED here from process-video.mjs (it now also returns `qa`, `decisions`, `actionItems`, `notesVersion: 2`).
- scripts/webinar/process-video.mjs: `buildNotes` is a one-line wrapper binding `VERSION` (public export and signature unchanged); on a reused video stage whose notes.json predates `NOTES_VERSION`, notes.json is rebuilt from the stored screen-evidence (no vision call, inputHash unchanged) and its digest re-pinned in video-stage.json.
- scripts/webinar/process-video.test.mjs: 9 new tests (below). qa/issues.w9.jsonl: ISS-W9-001..005.
- Why slide-knowledge.mjs and not a new file: process-video.mjs was at exactly its 300-line LOC budget (structure.config.json), so an in-place addition fails `lint:structure`; slide-knowledge.mjs is the existing sibling that already holds the video-stage knowledge builders and is imported by process-video. No new file, no duplicate function. This relocation of `buildNotes` is the only moved existing code.
- Persisted effect: `sessionDoc.notes` (scripts/webinar/sync-session.mjs:131) now carries the additive `decisions`/`actionItems`/`qa` arrays into the work-DB `$set` at sync-session.mjs:237. No schema, migration or write-code change; sessions.schema.json root is `additionalProperties: true`.

## Reproductions replayed (D-015), by id
ISS-WEBINARRELEASE-001 (row records one literal reproduction and four observations):
- Obs 1 literal repro `buildNotes('s1', [], [2 turns incl. a decision, an action and a question])`: base 021bdea0 -> decisions [] / actionItems [] / qa undefined; now decisions 1, actionItems 1, qa array (test "ISS-WEBINARRELEASE-001 recorded repro ...", RED before / GREEN after). 1/1 now produces items.
- Obs 2 (no structured Q&A in summarize) strict path: packages/index summarize.test.ts "strict windows cover early/middle/late ... separate cross-window QA" and grounded-notes.test.ts 15/15 pass: qa with separate question/answer evidence. Unchanged files, green.
- Obs 3 (strings without item evidence) strict path: grounded-notes.test.ts decision/action fixtures (lines 20-23: kinds insight/decision/action each with per-item evidence) pass.
- Obs 4 (all-turn evidence persisted) strict path: session-grounded-wire.test.ts 11/11 and session-grounded-notes.test.ts 3/3 pass (per-note citations resolve to a real turn and time).
- LEFT OPEN, named: Obs 2-4 on the legacy non-strict path (session.ts:198 all-turn evidence; no Q&A in SUMMARIZE_SYSTEM_PROMPT). Reason in Finding above; ISS-W9-003. 0 webinar callers reach it.
Open count: 3 of the row's 4 observations verified closed on the webinar path, 1 fixed here, legacy-path variant of 2-4 left open (ISS-W9-003).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 3 files, 5 criteria, est 40 min - single builder, per-file node --test runs, no checker dispatch by the builder
slow-plan: tier L because the notes payload flows into a persisted sessions write (additive shape); dual check required, but the diff itself is 3 scripts/webinar files + ledger/manifest
Tier: L (dual-trigger: prod-write scripts/webinar/sync-session.mjs:237 persists sessionDoc.notes, whose shape gains decisions/actionItems/qa; the diff does not touch auth, tenancy or consent code and cannot reach production Mongo: the write targets MONGO_WORK_DB)
Base / checked state: base 021bdea0; code commits ea39cc70 + cab0e0c8 on wave/w9-webinar-qa-items (the manifest commit follows and touches only qa/).
Affected tests: scripts/webinar/process-video.test.mjs, slides/slide-knowledge.test.mjs, process-video-slides.test.mjs, session-rows.test.mjs, session-inputs.test.mjs; packages/index summarize.test.ts + notes/grounded-notes.test.ts; apps/api session-grounded-wire/session-grounded-notes/session-strict tests. No full suite run (no auth/tenancy code touched; one file per invocation).
Baseline reds (identical at base 021bdea0, unrelated): process-video.test.mjs "exhausted provider failure is a counted safe gap" (2 !== 3) = ISS-W9-001; session-inputs.test.mjs "captured media cannot bypass validation" (consent proof) = ISS-W9-002.
Independent review: NOT run by the builder (writer never reviews its own output); the checker owns review.
Known limits: cue-based extraction is a deterministic draft with `verified:false`, high precision / low recall by design (first-person commitments and explicit "decided/agreed" phrasings only; no owner/date inference). Q&A pairing is adjacency, not an answer-relevance judgment (ISS-W9-004). The relevance-checked, model-backed items remain the strict index path. brain.ts session detail does not display the new arrays yet (ISS-W9-005).
Tests[C1]: scripts/webinar/process-video.test.mjs::"ISS-WEBINARRELEASE-001 recorded repro: a turn set with a decision, an action and a question yields non-empty structured items", "the month May is not a modal hedge, but a lowercase modal may still is" — the recorded reproduction and the hedge-vs-month boundary both exercise extractSpeechItems decisions/actionItems
Tests[C2]: scripts/webinar/process-video.test.mjs::"Q&A entries carry separate question and answer evidence; unanswered stays null with no answer evidence", "a question answered only by the same speaker is unanswered; answer is the next different-speaker turn" — cover qa shape, separate evidence and the adjacency rule
Tests[C3]: scripts/webinar/process-video.test.mjs::"every item resolves to exactly its own turn with a literal quote; none carries all-turn evidence", "an item whose evidence turn cannot be resolved is dropped and reported as a gap, never given other evidence" — cover item-level evidence and the unresolvable-drop rule
Tests[C4]: scripts/webinar/process-video.test.mjs::"negated, conditional, proposal and vague-commitment sentences are not decisions or actions", "no cues: arrays are empty and defined, qa is [] not undefined" — cover the ten refusals and the empty case
Tests[C5]: scripts/webinar/process-video.test.mjs::"processVideo writes structured items into notes.json and upgrades stale notes on reuse without calling vision again" — covers the NOTES_VERSION rebuild and digest re-pin
Tests[C6]: packages/index/src/pipeline/summarize.test.ts, packages/index/src/pipeline/notes/grounded-notes.test.ts, apps/api/src/indexing/session-tests/session-grounded-wire.test.ts, apps/api/src/indexing/session-tests/session-grounded-notes.test.ts, apps/api/src/indexing/session-tests/session-strict.test.ts — ledger floor for observations 2-4 on the strict webinar path; files unchanged, must stay green
Tests[I1]: scripts/lint-loc.mjs — structural budget (process-video.mjs sat at 300/300) plus the diff review that no provider/network import was added; extractSpeechItems is pure
Pre-check[C1]: cab0e0c8 node --test --import tsx --test-name-pattern="recorded repro|month May" scripts/webinar/process-video.test.mjs -> exit 0, 2 passed, 0 failed t=1 blobs=scripts/webinar/process-video.test.mjs:a2de4797,scripts/webinar/slides/slide-knowledge.mjs:2abeeffe
Pre-check[C2]: cab0e0c8 node --test --import tsx --test-name-pattern="Q&A entries|answered only by the same speaker" scripts/webinar/process-video.test.mjs -> exit 0, 2 passed, 0 failed t=1 blobs=scripts/webinar/process-video.test.mjs:a2de4797,scripts/webinar/slides/slide-knowledge.mjs:2abeeffe
Pre-check[C3]: cab0e0c8 node --test --import tsx --test-name-pattern="every item resolves|cannot be resolved" scripts/webinar/process-video.test.mjs -> exit 0, 2 passed, 0 failed t=1 blobs=scripts/webinar/process-video.test.mjs:a2de4797,scripts/webinar/slides/slide-knowledge.mjs:2abeeffe
Pre-check[C4]: cab0e0c8 node --test --import tsx --test-name-pattern="negated, conditional|no cues" scripts/webinar/process-video.test.mjs -> exit 0, 2 passed, 0 failed t=1 blobs=scripts/webinar/process-video.test.mjs:a2de4797,scripts/webinar/slides/slide-knowledge.mjs:2abeeffe
Pre-check[C5]: cab0e0c8 node --test --import tsx --test-name-pattern="upgrades stale notes" scripts/webinar/process-video.test.mjs -> exit 0, 1 passed, 0 failed t=1 blobs=scripts/webinar/process-video.mjs:7d66d45d,scripts/webinar/process-video.test.mjs:a2de4797
Pre-check[C6]: cab0e0c8 node --test --import tsx packages/index/src/pipeline/summarize.test.ts; node --test --import tsx packages/index/src/pipeline/notes/grounded-notes.test.ts; node --test --import tsx apps/api/src/indexing/session-tests/session-grounded-wire.test.ts; node --test --import tsx apps/api/src/indexing/session-tests/session-grounded-notes.test.ts; node --test --import tsx apps/api/src/indexing/session-tests/session-strict.test.ts -> exit 0, 10 passed + 15 passed + 11 passed + 3 passed + 4 passed, 0 failed t=5
Pre-check[I1]: cab0e0c8 node scripts/lint-loc.mjs --all -> exit 0, loc stage lint-loc: OK (1817 file(s) within budget) t=1
Metrics: builder_min=40 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (one per criterion)
Done in a throwaway COPY of scripts/ under .mut-copy/ (inside the worktree so node_modules resolves; deleted afterwards), one mutation at a time, per-mutation byte backup taken immediately before and restored immediately after, `timeout 120`, no EXIT trap. After each restore `git hash-object <copy file>` equalled `git rev-parse HEAD:<file>` (7/7 yes); the worktree has 0 changed files under scripts/ afterwards. Each run also shows the baseline-red ISS-W9-001 test failing, which is not counted.

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | slide-knowledge.mjs decision cue branch `DECISION_CUE.test(sentence) ? 'decision'` -> `false ? 'decision'` | process-video.test.mjs | pass 17 / fail 5 incl. recorded repro, May test, reuse test |
| C2 | slide-knowledge.mjs `if (i === questions.length - 1) {` -> `if (false) {` (no answers) | process-video.test.mjs | pass 19 / fail 3 incl. "Q&A entries carry separate ..." |
| C2 | slide-knowledge.mjs reply selection `next.speakerRef !== turn.speakerRef` -> `true` (same speaker counts as answer) | process-video.test.mjs | pass 20 / fail 2 incl. "a question answered only by the same speaker ..." |
| C3 | `evidence: [evidenceOf(turn, quote)]` -> `ordered.map(evidenceOf)` (all-turn evidence) | process-video.test.mjs | pass 18 / fail 4 incl. "every item resolves to exactly its own turn ..." |
| C3 | `if (sound) push(` -> `if (true) push(` (unresolvable turn kept) | process-video.test.mjs | pass 20 / fail 2 incl. "an item whose evidence turn cannot be resolved ..." |
| C4 | drop `HEDGED`/`MODAL_MAY` guard (only questions skipped) | process-video.test.mjs | pass 18 / fail 4 incl. "negated, conditional, proposal ..." |
| C5 | process-video.mjs stale-notes rebuild condition -> `if (false) {` | process-video.test.mjs | pass 20 / fail 2 incl. "processVideo writes ... upgrades stale notes on reuse" |
| C6 | not mutated: unchanged files, ledger floor only (criterion is "do not regress the strict path") | - | n/a |

## How to verify
- From the repo root, one file per run: `node --test --import tsx scripts/webinar/process-video.test.mjs` -> 21 pass, 1 fail (ISS-W9-001, same at base 021bdea0); `.../slides/slide-knowledge.test.mjs` -> 11 pass; `.../process-video-slides.test.mjs` -> 7 pass; `.../session-rows.test.mjs` -> 3 pass.
- `node scripts/lint-loc.mjs --all` -> `lint-loc: OK`.
- Strict-path floor: in packages/index `node --test --import tsx src/pipeline/summarize.test.ts` (10) and `src/pipeline/notes/grounded-notes.test.ts` (15); in apps/api `src/indexing/session-tests/session-grounded-wire.test.ts` (11), `session-grounded-notes.test.ts` (3), `session-strict.test.ts` (4).
- Red-before evidence: base 021bdea0 process-video.mjs + slide-knowledge.mjs under the new process-video.test.mjs: 9 fail / 13 pass; 8 of the 9 new tests fail (recorded repro, Q&A, every-item, unresolvable, same-speaker, no-cues qa undefined, May, processVideo/notes upgrade); only 'negated, conditional ...' passes vacuously at base (empty arrays); the 9th failure is baseline-red ISS-W9-001.
- No CORE-REQUEST: no file owned by w6 (approval CAS) or w7 (capture finalizer) was touched.
