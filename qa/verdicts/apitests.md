# Verdict: apitests
Cycle checked: 0
Commit checked: bdf935fb (test blob e4aa71d3, verified equal to HEAD blob)
VERDICT: PASS
ISSUES-WRITTEN: ISS-APITESTS-001 (medium), ISS-APITESTS-002 (low)

## Checks
1. Production claim: HOLDS. /ask hydration (apps/api/src/ask/source-context.ts) reads turns/chunks from Mongo only; no directory scan or empty-Mongo fallback. Only other data/toc-migrated reader is routes/brain.ts, which serves source.json/screen-evidence.json after a DB session+source tenant binding; never turns, not /ask. Not a product bug.
2. Semantics vs indextests 45076785: identical today. Divergence expected after indextests cycle 1 (array/non-object validation.json fails there; here null stays in corpus and an array is treated as in-progress). ISS-APITESTS-001 (medium): share one helper.
3. Assertions: still exactly 29 / 6 / 3424; not weakened.
4. Skip log: works. Against main data: "in-progress ingests skipped (2): 2026-10-13-zoom-webinar-p1 (validation failed), 2026-10-13-zoom-webinar-p2 (validated, awaiting finalize)".

## Evidence
- KB_REAL_DATA_DIR=main data/toc-migrated, node --test --import tsx src/ask/source-context.test.ts: pass 25 / fail 0.
- Full apps/api suite (D2_FIXTURE_PYTHON set, no override): tests 875 / pass 875 / fail 0. tsc --noEmit exit 0. lint-loc --all: OK (10 stages, 0 failed).
- Mutation (hand-rolled, per-mutation byte restore in finally, timeout 180s, HEAD blob verified after: e4aa71d3): no-exclusion killed (2 fail); one-file-as-in-progress killed; bad-JSON-as-in-progress killed; env-override-dropped SURVIVED (ISS-APITESTS-002); assertion-weakening is not a meaningful mutation of a test. Earlier equivalent survivors (no validation.json, null validation) are caught by the catch path.
- Main tree and real p1/p2 dirs untouched by this check.
