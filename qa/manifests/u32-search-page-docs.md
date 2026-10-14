# Manifest - u32-search-page-docs

**Handshake status:** ready-for-check
Fix cycle: 0
Lane: lane/u32docs (from c7b09b87)
Tier: 3 (roadmap precondition). docs/plan.md row 15 requires docs/features/u3.2-search-page/ before U3.2 work proceeds.
Scope: documentation only. No code, no contracts, no DECISIONS, no TASKS/goal changes.

## Files (new)

docs/features/u3.2-search-page/intent.md, spec.md, plan.md (same three names as docs/features/u4-watch-dashboard/).

## Criteria

1. Describes only what exists; pending items marked pending (semantic/hybrid ranking, Send to Ask, persona walk).
2. Covers behaviour, web routes, GET /search (lexical), tenant scoping, 512-char cap, ISS-U32LIVE-001 and -002.
3. Screenshots linked from qa/evidence/u32-browser-check-2026-10-13/, not copied.
4. All relative links resolve; lint budgets hold.

## Evidence

- Link check: every `](../../../...)` target in spec.md exists (no MISSING lines).
- `node scripts/lint-loc.mjs --all`: stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot exit=0; 2 stages failed (dependencies: Cannot find package 'json-schema-to-typescript'; lint-tests, same gen-types import). Both are worktree node_modules environment gaps, unrelated to docs.
- `node scripts/lint-dirsize.mjs`: OK (153 dirs within budget). SNAPSHOT stage passed; SNAPSHOT.md not regenerated (docs/features/ listing unchanged).

## NOT done

Facts were taken from the manifest, live README and source reads; no browser or test run. Claims not re-verified live: tenant/scope behaviour beyond live checks J and K.

Please issue the Cycle 0 checker verdict at qa/verdicts/u32-search-page-docs.md.
