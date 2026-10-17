# t040-canonical-schema-grounded-notes

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (next unblocked roadmap task: T-040 / T-051 schema blocker). Class: data-model change (canonical schema + generated types): full ceremony. Verdict by the checker only.
Lane: lane/schemaedit. Lane ledger `qa/issues.schemaedit.jsonl`: ISS-SCHEMAEDIT-001 (medium), ISS-SCHEMAEDIT-002 (low).

## Authorization (quoted)
Approver ruling 2026-10-12, docs/DECISIONS.md D-126 (`**Approved-by:** Umesh`), item (3): "Canonical-schema edit: 'Approve, aage badho' - the previously rejected canonical-schema edit that blocks T-040 (grounded notes/Q&A with timestamp citations) and T-051 is approved. No single concrete edit is named in the repo; this records the approval of 'the canonical-schema edits referenced at qa/manifests/webinar-portable-release.md:64'... the schema approval does not itself edit schema/ or ARCHITECTURE.md and the exact edit must still be named when made."
This manifest names the exact edit (below). It is the edit the earlier entries describe, and the only candidate found.

## The proposal (source) and how it was matched
- docs/DECISIONS.md:1420 (D-057, `**Changes-authorized:**`): "schema/session_pages.schema.json optional citedItems and qa with quoted item-level evidence and source status; schema/claims.schema.json optional evidence quote and origin; schema/turns.schema.json optional typed screenEvidence frame identity, confined file, hash and timestamp. Generate derived core types only with scripts/gen-types.mjs."
- qa/manifests/webinar-release-repair-plan.md:52-55 ("Canonical additive interfaces") gives the field-level spec: cited item = stable id, kind insight|decision|action, extractive text, origin speaker-statement|screen-ocr|visual-observation, verification unverified, evidence[{turnId,sessionId,quote}] nonempty; QA = stable id, extractive question, nonempty questionEvidence, answer string|null, separate answerEvidence, status answered|unanswered (unanswered => answer null and answerEvidence empty); claims: additive quoted evidence/origin, legacy stays valid; turns: optional screenEvidence for already-emitted frameId/file/hash/tStart.
- Rejection record: .handoffs/2026-10-09-124413-previous-HANDOFF.md:47 names exactly these three files; qa/manifests/webinar-portable-release.md:64 records the rejection by automatic approval review.
- Shapes cross-checked against code that already emits or consumes them: scripts/webinar/process-video.mjs:129 (`screenEvidence` = {frameId,file,hash,tStart}; file regex `^screen-frames/[a-zA-Z0-9-]+/frame-\d+\.jpg$`; hash 64 lowercase hex) and packages/index/src/pipeline/grounded.ts (RuntimeItem/RuntimeQA/RuntimeEvidence).

## Edit applied (all new fields OPTIONAL; no existing required field changed)
- `schema/session_pages.schema.json`: optional `citedItems[]` ($defs `CitedItem`: id, kind, text, origin, verification const "unverified", evidence minItems 1) and `qa[]` ($defs `QaEntry`: if status=unanswered then answer null and answerEvidence maxItems 0, else answer nonempty string and answerEvidence minItems 1); shared $defs `QuotedEvidence` {turnId, sessionId, quote}, all required. Legacy summary/keyInsights/decisions/actionItems/evidence untouched.
- `schema/claims.schema.json`: optional `origin` enum on the claim; optional nonempty `quote` on each evidence entry.
- `schema/turns.schema.json`: optional `screenEvidence` {frameId, file (confined `screen-frames/<id>/frame-N.jpg`, no traversal), hash (64 lowercase hex), tStart >= 0}; all four required inside it; no extra keys.
- `schema/index.json`: NOT changed (no new collection, no new index).
- Generated: `packages/core/src/generated/{session_pages,claims,turns}.ts` via `node scripts/gen-types.mjs` (new exports CitedItem, QaEntry, QuotedEvidence); `packages/core/src/index.ts` regenerated too (see ISS-SCHEMAEDIT-001: pre-existing drift).
- `schema/validate.py`: also runs optional `valid-*.json` (must pass) and `invalid-*.json` (each must fail) beside the required valid.json/invalid.json (backward compatible).
- New fixtures: session_pages valid-grounded + 4 invalid-grounded-*; claims valid-quoted + invalid-origin; turns valid-screen + invalid-screen-path-traversal + invalid-screen-missing-hash.
- Not touched: contracts/ (contracts.json has `stages: {}`, no frozen contract), qa/contracts/, docs/DECISIONS.md, ARCHITECTURE.md, .claude/, and any hand-written code under packages/ or apps/. No generation logic.

## Migration: NO
Additive optional fields on `additionalProperties: true` collections; no collection, index or required field added; no stored document needs rewriting. Precedent: qa/manifests/T-006-recording-gap-tracking.md and t-029-reconnect.md (no migration for additive fields); migrations/ holds only collection/index changes (schema/index.json unchanged).

## Evidence (node = codex runtime; python 3.12.10 + jsonschema 4.26.0; no installs, no DB)
- `python schema/validate.py` -> exit 0, `PASS: 27 collection schema(s)`; session_pages 2 valid/5 invalid, claims 2/2, turns 2/3. Each new invalid fixture is rejected for its intended reason (messages checked one by one).
- Old documents: HEAD's `schema/fixtures/{session_pages,claims,turns}/valid.json` (via `git show HEAD:`) validate against the NEW schemas: 3/3. Those files are unchanged in this diff.
- Real emitter output: `screenEvidenceTurns()` (scripts/webinar/process-video.mjs) rows for an OCR and a visual frame -> 2/2 valid against the new turns schema.
- `node scripts/gen-types.mjs --check` -> `OK: 27 generated type file(s) + index.ts match schema/` after generation. At HEAD (this lane's changes stashed) the same check FAILED on index.ts only: pre-existing, ISS-SCHEMAEDIT-001.
- Typecheck `tsc --noEmit -p tsconfig.json` (main-tree tsc.js, run in each dir): packages/core, ai, ask, db, index, ingest, meeting-bot, apps/api, apps/web -> all exit 0, 0 errors.
- `python contracts/verify_contracts.py` -> exit 0 "no frozen contracts yet (research phase) -- PASS by vacuity" (not quality evidence).
- Consumer tests re-run: packages/index summarize.test.ts 10/10; apps/api indexing/session.test.ts 28/28; routes/brain.test.ts 11/11; scripts/webinar/session-inputs.test.mjs 11/11.
- `scripts/lint-dirsize.mjs` fails with 3 violations identical at HEAD (meeting-bot/src/calendar, apps/api/src, apps/api/src/routes): unrelated.

## Handoff to the next T-040 unit (generation logic; NOT done here)
In the existing files: replace the duplicate RuntimeEvidence/RuntimeItem/RuntimeQA in packages/index/src/pipeline/grounded.ts with the generated CitedItem/QaEntry/QuotedEvidence from @lkb/core (ISS-SCHEMAEDIT-002); have summarize.ts/claims.ts strict mode emit citedItems/qa/quote/origin; apps/api/src/indexing/session.ts persist them on session_pages/claims; scripts/webinar process-video buildNotes/sync-session populate final notes; API/UI show citations with the cited turn's tStart/tEnd. The schema cannot enforce that `quote` is a substring of the turn text or that kind/origin are semantically right: those stay runtime checks. Live-model eval gates in the repair plan still apply. (A separate manifest qa/manifests/t040-strict-quote-verifier-and-windowing.md already exists; coordinate with it.)

## NOT covered
- No generation, no live model, no database, no real stored session validated beyond fixtures and the emitter's synthetic output; additive-optional design means no legacy document can newly fail.
- TypeScript does not enforce the QaEntry answered/unanswered coupling (JSON-schema only).
