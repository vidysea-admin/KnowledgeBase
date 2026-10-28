# Evidence manifest — T-012 compete-screen

- **Contract:** `qa/contracts/compete-screen.md`
- **Goal task:** T-012
- **Date:** 2026-09-03
- **Fix cycle:** 1 of max 3

## What changed

Extends T-009's existing `apps/api` Express app (no second server) with a minimal internal-tier
counsellor "compete" screen, per D-007's credibility-tier rule.

- `schema/eval_runs.schema.json` (new) — `{_id, tenantId, question, counsellor:{name,org?},
  aiAnswer:{text,sources}, counsellorAnswer:{text}, score:{ai,counsellor,notes?}, credibility,
  createdAt}`, `required: [_id, tenantId, question, counsellor, credibility, createdAt]`.
  `aiAnswer.sources` is untyped (`{}`-ish) on purpose — it stores askV2's real
  `{internal, web}` sources object as-is, not a re-derived shape.
  Fixtures: `schema/fixtures/eval_runs/{valid,invalid}.json`.
- `schema/index.json` — added `eval_runs` index specs (`{tenantId:1}`,
  `{tenantId:1,credibility:1}`), same pattern as every other collection. No new migration file
  needed — `migrations/20260903100000-baseline.js`'s index loop applies `schema/index.json`
  generically via `createIndex` (which implicitly creates the collection), the same mechanism
  `gaps` already relies on without being in the migration's static `COLLECTIONS` array.
- `packages/core/src/generated/eval_runs.ts` + `packages/core/src/index.ts` — regenerated via
  `pnpm gen:types` (schema is the source of truth, nothing hand-typed).
- `packages/db/src/collections/eval-runs.ts` (new) — `evalRuns(tenantId)` accessor via
  `scopedCollection`, matching `gaps.ts`/`claims.ts`. Exports `createEvalRun`, `recordScore`,
  `listByCredibility`. Named `createEvalRun` (not `create`) because `gaps.ts` already owns the
  bare `create` export name and both land in the same `@lkb/db` barrel —
  `scripts/lint-dupes.mjs` caught this on the first pass and it was renamed. Re-exported from
  `packages/db/src/index.ts` alongside `claims.js`.
- `apps/api/src/routes/compete.ts` (new) — `POST /compete/start` (scope `compete`): body
  `{question, counsellor:{name,org?}}`, loads the tenant's tree the same way `routes/ask.ts`
  does, calls the real `askV2` composition (imported from `@lkb/ask`, never reimplemented) with
  the same `{tree, askDeps}` shape `AskRouteDeps` already declares, writes one `eval_runs` row
  with `credibility: 'internal'`, returns `{evalRunId, aiAnswer}`. `POST /compete/:id/score`
  (scope `compete`): body `{counsellorAnswer:{text}, score:{ai,counsellor}, notes?}`, calls
  `recordScore`, 404s when `matchedCount` is 0 (nonexistent id or wrong tenant).
  `auth.ts` was NOT changed — scopes are free strings there (no enumerated scope list exists to
  add `'compete'` to; `requireScope("compete")` works exactly like `requireScope("ask")` does
  today with zero code changes needed).
- `apps/api/src/routes/compete-page.ts` (new) — `GET /compete`, one inline plain HTML + vanilla
  JS page (no new frontend dependency). Sits behind the same global `requireAuth` as every other
  route (no route in this app is unauthenticated), so the page has one password-type "API key"
  field that stores the key in `localStorage` and sends it as the `Authorization: Bearer` header
  on its two `fetch` calls to `/compete/start` and `/compete/:id/score`.
- `apps/api/src/server.ts` — added `evalRuns: EvalRunStore` to `ServerDeps`, mounted
  `createCompeteRouter({...deps.ask, evalRuns: deps.evalRuns})` and `createCompetePageRouter()`
  alongside the existing `createAskRouter`/`createStubsRouter` mounts. Still 39 lines (budget
  <=80, own note).
- `apps/api/src/store.ts` — added `createMongoEvalRunStore()`, a thin wrapper over
  `@lkb/db`'s `createEvalRun`/`recordScore`, same composition-root pattern as
  `createMongoApiKeyStore`/`createMongoTreeStore`.
- `apps/api/src/production.ts` — wires `evalRuns: createMongoEvalRunStore()` into the real
  `ServerDeps`.
- `apps/api/src/fixtures.ts` — added `fakeEvalRunStore()` (in-memory `Map`, exposes `_rows` for
  test assertions) and included it in `buildTestDeps()`'s defaults.
- `apps/api/src/routes/compete.test.ts` (new) — 6 tests, in-process via `startTestServer`,
  mirroring `server.test.ts`'s pattern exactly.
- `docs/SNAPSHOT.md` — regenerated via `node scripts/snapshot.mjs` (now lists `eval_runs`
  alongside the other 20 collections; required for `pnpm lint:structure`'s snapshot-staleness
  check to pass).

## How to verify

```
pnpm -r typecheck
pnpm -r test
pnpm gen:types --check
python schema/validate.py
pnpm lint:structure
```

## Actual outputs (verbatim, this run)

### `pnpm -r typecheck`
```
Scope: 9 of 10 workspace projects
packages/core typecheck: Done
packages/ai typecheck: Done
packages/db typecheck: Done
packages/index typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/meeting-bot typecheck: Done
apps/api typecheck: Done
```

### `pnpm -r test` (apps/api slice — full run: 0 failures across all 9 packages)
```
apps/api test: ✔ POST /compete/start produces an eval_runs row with credibility 'internal' (104.5026ms)
apps/api test: ✔ POST /compete/start with a missing question returns 400 (12.7061ms)
apps/api test: ✔ POST /compete/:id/score updates the existing row, not a new one (11.7256ms)
apps/api test: ✔ POST /compete/start without the compete scope returns 403 (7.655ms)
apps/api test: ✔ POST /compete/:id/score with a nonexistent id returns 404 (6.6081ms)
apps/api test: ✔ GET /compete serves the plain HTML form (6.1479ms)
apps/api test: ✔ POST /ask with a valid key + ask scope returns 200 with an AskResult shape (81.2383ms)
apps/api test: ✔ POST /ask with no Authorization header returns 401 (14.9738ms)
apps/api test: ✔ POST /ask with an invalid/unknown key returns 401 (6.2595ms)
apps/api test: ✔ POST /ask with a valid key that lacks the ask scope returns 403, not 401 (6.8534ms)
apps/api test: ✔ a valid key hitting a stub route gets 501 (authorized but not built), never 403 or 200 (13.4868ms)
apps/api test: ✔ a valid key lacking a stub route's scope still gets 403 there (scope check runs before the 501) (8.7417ms)
apps/api test: ✔ rate limit trips after N requests with 429 and a Retry-After header (8.5303ms)
apps/api test: ✔ fixtures sanity: fakeTreeStore/fakeAskDeps build injectable deps without touching Mongo/network (0.1664ms)
apps/api test: ℹ pass 14
apps/api test: ℹ fail 0
```
(the other 8 pre-existing apps/api tests, plus every other package's full suite, all passed —
grep for `Failed|ERR_PNPM` across the full `pnpm -r test` run returned nothing)

### `pnpm gen:types --check`
```
> node scripts/gen-types.mjs "--check"
OK: 21 generated type file(s) + index.ts match schema/
```

### `python schema/validate.py`
```
OK: eval_runs — valid fixture passes, invalid fixture correctly rejected (1 error(s))
...(20 other collections, all OK)...
PASS: 21 collection schema(s) validated correctly.
```

### `pnpm lint:structure`
```
lint-loc: OK (113 file(s) within budget)
lint-dirsize: OK (56 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (161 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (656 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (109 lines, budget 200)
✔ no dependency violations found (126 modules, 341 dependencies cruised)
```

## Criteria coverage

| # | Criterion | Status |
|---|---|---|
| C1 | `schema/eval_runs.schema.json` + fixtures, 20→21 in `validate.py` | Met |
| C2 | `packages/db/src/collections/eval-runs.ts` (`coll`, create/recordScore/list) | Met — create is named `createEvalRun`, see note above |
| C3 | `POST /compete/start` + `POST /compete/:id/score` on the existing T-009 app | Met — `auth.ts` needed no change since scopes aren't enumerated there |
| C4 | `GET /compete` plain HTML+JS form | Met — behind the same global auth as every route; page holds an API-key field rather than being made auth-exempt |
| C5 | `apps/api/src/routes/compete.test.ts`, in-process, matching `server.test.ts` | Met — 6 tests, all passing |
| C6 | No regression: typecheck/test/gen:types/validate.py/lint:structure all clean | Met |

No criterion left unmet.

## Status: checked-PASS
Verdict: qa/verdicts/T-012-compete-screen.md (Cycle checked: 1, commit 71b5fd2) — 6/6 criteria met; credibility:'internal' confirmed hardcoded, no path to misrepresentation.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
