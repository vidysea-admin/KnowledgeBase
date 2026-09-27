# Manifest — watched-sources (T-027)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/watched-sources.md`
Contract: `qa/contracts/watched-sources.md`

## What changed

1. **`schema/watched_sources.schema.json`** + fixtures (22nd collection) — `{_id, tenantId, url,
   label?, reputationTier: 'official'|'community'|'blog', checkIntervalHours, active, lastFetch?:
   {fetchedAt, hash, diffFrom}}`. `schema/index.json` gained a `watched_sources` index entry
   (`tenantId` + unique `tenantId+url`), matching the existing pattern for other collections.
2. **`packages/db/src/collections/watched-sources.ts`** (new) — `coll(tenantId)` accessor +
   `createWatchedSource`, `recordFetch`, `listActive`, matching `eval-runs.ts`'s exact shape;
   exported from `packages/db/src/index.ts`.
3. **`packages/ingest/src/watched/schedule.ts`** (new) — `isDueForCheck(source, now)`: never
   fetched → always due; inactive → never due regardless of elapsed time; otherwise due iff
   elapsed >= `checkIntervalHours`.
4. **`packages/ingest/src/watched/check.ts`** (new) — `checkWatchedSource(source, fetcher,
   hasher, now)`: reuses T-023's `UrlFetcher`/`UrlHasher` types (imported from `sources/url.ts`,
   not redeclared); first check is always `changed: true`; otherwise diffs the new hash against
   `lastFetch.hash`.
5. **`docs/adr/0004-watched-sources-scheduling.md`** (new, 44 lines, under the 60-line budget) —
   reputation-tier ownership (human, at bookmark time) + default 24h cadence + justification,
   matching ADR-0001/0002/0003's format.
6. **`packages/ingest/src/index.ts`** — exports the new `watched/` module.
7. **`docs/SNAPSHOT.md`** — regenerated (new schema row + FEATURES table shift).

## How to verify (all commands run, real output below)

```
$ pnpm gen:types
wrote packages\core\src\generated\watched_sources.ts
wrote packages\core\src\index.ts
done: 22 collection(s), 2 file(s) written

$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/ingest test
tests 34 / pass 34 / fail 0   (26 pre-existing + 8 new: 5 schedule.test.ts + 3 check.test.ts)

$ pnpm -r test
core 7 / index 19 / ai 23 / ingest 34 / ask 30 / meeting-bot 20 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (135 file(s) within budget)
lint-dirsize: OK (61 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (191 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (706 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (145 modules, 409 dependencies cruised)
```

## Files touched
- `schema/watched_sources.schema.json` (new)
- `schema/fixtures/watched_sources/{valid,invalid}.json` (new)
- `schema/index.json` (new watched_sources entry)
- `packages/core/src/generated/watched_sources.ts` (generated)
- `packages/core/src/index.ts` (regenerated)
- `packages/db/src/collections/watched-sources.ts` (new)
- `packages/db/src/index.ts` (export)
- `packages/ingest/src/watched/schedule.ts` (new)
- `packages/ingest/src/watched/schedule.test.ts` (new)
- `packages/ingest/src/watched/check.ts` (new)
- `packages/ingest/src/watched/check.test.ts` (new)
- `packages/ingest/src/index.ts` (export)
- `docs/adr/0004-watched-sources-scheduling.md` (new)
- `docs/SNAPSHOT.md` (regenerated)
- `qa/contracts/watched-sources.md` (new contract, maker-drafted)

## Follow-up (not this unit, disclosed in contract Non-goals)
A future scheduled worker composes `listActive` + `isDueForCheck` + `checkWatchedSource` +
`recordFetch` + T-023's `createUrlSource` (for actual re-ingestion on `changed: true`) + a real
notification channel. Not built here.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
