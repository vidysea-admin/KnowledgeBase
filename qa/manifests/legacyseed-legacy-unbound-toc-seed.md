# Manifest: legacyseed-legacy-unbound-toc-seed
**Handshake status:** checked-PASS
Fix cycle: 0
**Lane:** legacyseed (branch lane/legacyseed). **Authority:** D-143, D-149 (pending append) — Umesh 2026-10-12.

## Scope
Opt-in `--legacy-unbound` for `scripts/seed-toc.mjs`: sessions with NO `derivation-provenance.json` are seeded, every source/session/turn/claim/session_page doc stamped `provenance: {status:"legacy-unbound", reason:"D-149"}`. Chunks inherit the stamp via `writeSessionChunks(..., provenance)` (backfill `chunks` passes it when the session carries it). No real DB touched.

## Files
scripts/lib/transcript-provenance.mjs (loadSessionArtifacts, requireLegacyUnboundDatabase, LEGACY_UNBOUND), scripts/seed-toc.mjs, apps/api/src/indexing/session.ts, scripts/backfill.mjs, tests: scripts/lib/legacy-unbound.test.mjs, apps/api/src/indexing/legacy-unbound-chunks.test.ts.

## Criteria
1. Flag required; without it behaviour unchanged (provenance-less session refused).
2. A present proof (current/stale) is never bypassed by the flag. Identity/evidence integrity still enforced.
3. Staging DB accepted only with flag AND LKB_ALLOW_STAGING=lkb_staging AND MONGO_WORK_DB=lkb_staging; lkb, empty, other names refused. Existing loopback lkb_work_* guard untouched.
4. All doc types and chunks stamped. Schemas have additionalProperties:true and no provenance enum, so no schema change.

## Evidence
- node --test legacy-unbound.test.mjs + transcript-provenance.test.mjs: 20/20 pass; apps/api legacy-unbound-chunks 2/2, session.test.ts 28/28; tsc apps/api clean.
- Mutations (6/6 killed): guard accepts lkb; stamp missing; flag ignored; opt-in env not required; present proof bypassed; chunk stamp dropped.
- Real-data finding: with the flag, 21 of 32 data/toc-migrated dirs load; 8 real sessions fail `invalid derived evidence` (claims/page evidence turnIds absent from turns.json) and 3 synthetic-controlled dirs lack session.json. Integrity check deliberately kept ON: seed those 8 only after reconciling their claims/page, or exclude via `--sessions`.
- Not wired: /ask citations and UI (no contract requires the label). indexSession() (API path) does not yet propagate the stamp to chunks; only backfill chunks does.

## Addendum (coordinator request, same cycle 0): backfill / sync-speakers DB guard
- `scripts/backfill.mjs` (both `chunks` and `entities`) no longer defaults to `lkb` or localhost: it uses `requireBackfillDatabase` (refuses unset/empty/lkb; accepts isolated work DBs; lkb_staging only with `--legacy-unbound` AND LKB_ALLOW_STAGING=lkb_staging). `recovery-chunks` keeps its own loopback guard, untouched.
- `scripts/sync-speakers.mjs` now uses `requireWorkDatabase` (no lkb default).
- Tests: 22/22 (legacy-unbound + transcript-provenance); 3 more mutations killed (guard accepts lkb, staging without flag, backfill default restored).
- Other unguarded writers filed in qa/issues.legacyseed.jsonl: ISS-LEGACYSEED-001..005 (high: seed-demo-server.mjs:23, mint-key.mjs:43, watch-config.mjs:37, join-rules-api-host.ts:29, live-verify.mjs:113), 006-007 (medium: eval-recall.mjs:91, sync-session.mjs:193).
- Known gap, NOT fixed: `indexSession()` (API path, apps/api/src/indexing/session.ts:265) does not propagate the legacy-unbound stamp to chunks. Filed ISS-LEGACYSEED-008 (medium).
