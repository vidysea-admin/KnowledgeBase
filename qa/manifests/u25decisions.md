# U2.5 decisions extraction (claims.ts template, decisions prompt)

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Task: U2.5 (deps U2.2 in_progress; extractor is built to be scorable by the U2.2 harness, no quality claim)
Priority: tier 3 roadmap task (goal.json U2.5 pending, dep U2.2 in progress).
Authorization: schema/decisions.schema.json and the generated Decisions type already exist (no schema change). Flag LKB_EXTRACT_DECISIONS, OFF by default.

## Scope
- New packages/index/src/pipeline/decisions.ts: extractDecisions(turns, complete) and decisionsEnabled(env). Injectable LLM (Job kind "decisions" via packages/ai), parseJsonLoose, schema-shaped output, fallback to degraded {reason} on provider error / non-array output (never throws), cited turn ids cross-checked against real turns (zero real ids => decision dropped), tStart/tEnd derived from the cited turns (never model-supplied), owner kept only if it equals a speakerRef of a cited turn.
- New apps/api/src/indexing/decisions-persist.ts: tenant-scoped (scopedCollection) replace-by-session; degraded run leaves existing decisions untouched (ISS-056 shape); status "proposed".
- Shared-file edits (minimal): apps/api/src/indexing/session.ts (+13: import, deps.extractDecisions, one flag-gated block before the return, one conditional spread in the result), types.ts (+2 optional result key), packages/index/src/index.ts (+1 export), config/ai-routing.yaml (+2: decisions chain = claims chain), packages/index/src/pipeline/notes/judge.test.ts (+1 entry in its pinned route map).
- NOT changed: schemas, contracts, claims.ts, eval/extraction.ts, speaker-tile-suggestions*, DECISIONS, hooks.
- Flag OFF => no decisions job, no decisions collection op, no `decisions` key in the result (tested: db call sequence identical with extractDecisions undefined vs false).
- Out of scope / open: no golden decision labels exist (not human-adjudicated); no precision/recall numbers claimed or invented; no live provider run.
- Merge note: u23topic will likely also add a route to ai-routing.yaml and to the pinned map in judge.test.ts; expect a trivial same-line conflict.

## Evidence (fake LLM only)
- packages/index: node --test --import tsx (all 43 test files in src): tests 647, pass 647, fail 0 (new decisions.test.ts: 12/12, includes harness evaluateExtractionCase over filtered and persisted shapes with 0 issues, and a tampered span caught as claim-span-mismatch).
- apps/api/src/indexing/*.test.ts (63 tests): pass 63, fail 0, incl. new session-decisions.test.ts 4/4. Run with a temporary tsconfig `paths` mapping @lkb/* to lane sources (junctioned node_modules point at main-tree packages); temp file deleted.
- Before updating judge.test.ts's pinned route map the full index run was 643/4 with the route-pin test failing as expected; the other 3 failures were an environment gap (root node_modules junction was broken: "Cannot find package 'tsx'"), fixed, then 647/0.
- tsc --noEmit: packages/index exit 0; apps/api (temp paths tsconfig) exit 0.
- node scripts/lint-loc.mjs --all: "lint-loc: OK (893 file(s) within budget)". lint:structure overall FAIL only on the snapshot stage (docs/SNAPSHOT.md stale, ordering of scripts/ entries; pre-existing, caused by no file of this unit; SNAPSHOT not regenerated).
