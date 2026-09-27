# Manifest — T-009 developer-api

**Contract:** `qa/contracts/developer-api.md`
**Goal task:** T-009
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

Filled in `apps/api` (empty placeholder since T-016) as a real Express server, the composition
root allowed to import both `@lkb/ask` and `@lkb/index` per ARCHITECTURE §5.

- `src/server.ts` (33 LOC, budget ≤80) — `createServer(deps)`: JSON body parsing → auth →
  per-key rate limit → `/ask` router → stub router. `startServer(deps, port?)` is the thin
  `listen()` wrapper.
- `src/auth.ts` — `requireAuth(store: ApiKeyStore)` reads `Authorization: Bearer <key>`, 401s on
  missing/malformed/invalid/revoked; `requireScope(scope)` 403s separately so "unauthorized" and
  "forbidden" never collapse into one status. `ApiKeyStore.verify(key)` is injected.
- `src/hash.ts` — `sha256Hex` via `node:crypto` (checked first: no existing hashing helper
  anywhere in the workspace — only hit was `packages/meeting-bot/src/cli.ts`, an unrelated id
  generator — so `node:crypto` is used directly, no new dependency).
- `src/routes/ask.ts` — `POST /ask` (scope `ask`): validates `{query: string}`, loads the
  tenant's tree via an injected `TreeStore`, calls `askV2` with an injected `treeSearchFn` /
  `complete` / `scoreFn` / `write` (same seam `askV2` already declared in T-005b) — no second,
  stub-only wiring path exists next to the real one.
- `src/routes/stubs.ts` — `/sources` `/sessions` `/search` `/citations/:claimId`
  `/webhooks/register`, each scope-checked then `501 {error:"not_implemented", message:"<route>
  is planned, not yet built — see TASKS.md"}`.
- `src/rate-limit.ts` — `express-rate-limit@8.6.2` (checked `sources/whatsapp_msg/package.json`
  first per the contract — it already depends on this exact package/version, reused rather than
  hand-rolled), keyed on the verified tenantId (falls back to `ipKeyGenerator(req.ip)` for
  pre-auth traffic, per express-rate-limit's own IPv6-safety guidance), `429` + `Retry-After`.
- **Production wiring (C3 — real, not another stub):**
  - `src/store.ts` — Mongo-backed `ApiKeyStore`/`TreeStore`/job-writer via `@lkb/db`'s `getDb()`
    (no dedicated `packages/db/collections/api_keys.ts`/`tree_index.ts` accessor exists yet —
    api-key lookup is deliberately *not* tenant-scoped, since the tenant is unknown until the key
    resolves it, so it can't use `scopedCollection`; reads via the same low-level `getDb()` those
    accessors themselves wrap).
  - `src/ai-transport.ts` — the first real `Transport` implementation for T-019's seam (`fetch`
    for http-kind, `child_process.spawn` for cli-kind) — none existed anywhere else in the
    workspace (every `packages/ai` test uses `testUtils.ts`'s fake).
  - `config/ai-routing.yaml` — added `ask: [gemini, claude-code]` (the jobKind the contract names
    did not exist before this task).
  - `src/production.ts` — assembles the real `ServerDeps`: `@lkb/index`'s real `treeSearch` as
    `treeSearchFn`, `@lkb/ai`'s real `complete("ask", job, {chains, providers, write})`.
  - `src/score.ts` — **disclosed gap, not hidden:** `@lkb/ask`'s `ScoreFn` (`evaluator.ts`) is
    synchronous, so a real async LLM judge cannot be plugged into it without changing that
    interface — out of this contract's scope (C1-C8 name `treeSearchFn` and `complete`, not a
    production `scoreFn`). `heuristicScore` is a deterministic keyword-overlap stand-in, clearly
    commented as non-LLM, so `/ask` isn't silently unscored while that seam stays sync.
  - `src/index.ts` — production entrypoint: connects Mongo, calls `startServer(buildProductionDeps())`.
- **Tests:** `src/server.test.ts` (8 tests, node --test, in-process via `src/testUtils.ts`'s
  ephemeral-port helper — no supertest-style library exists in the workspace, checked first) +
  `src/fixtures.ts` (shared fakes, C7's "tests use fakes for these").
- `apps/api/package.json` — added `express`, `express-rate-limit` deps, `@lkb/ai`/`@lkb/ask`/
  `@lkb/db`/`@lkb/index` workspace deps, `@types/express` devDep, `test` script.

## How to verify

```
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd apps/api && npx node --test --import tsx "src/**/*.test.ts"
pnpm -r typecheck
pnpm -r test
pnpm gen:types --check
python schema/validate.py
pnpm lint:structure
```

## Actual outputs (verbatim)

### `apps/api` typecheck
```
$ cd apps/api && npx tsc --noEmit -p tsconfig.json
(no output — exit 0)
```

### `apps/api` tests (node --test)
```
✔ POST /ask with a valid key + ask scope returns 200 with an AskResult shape (73.4952ms)
✔ POST /ask with no Authorization header returns 401 (9.5ms)
✔ POST /ask with an invalid/unknown key returns 401 (5.7019ms)
✔ POST /ask with a valid key that lacks the ask scope returns 403, not 401 (5.6598ms)
✔ a valid key hitting a stub route gets 501 (authorized but not built), never 403 or 200 (7.2708ms)
✔ a valid key lacking a stub route's scope still gets 403 there (scope check runs before the 501) (4.5989ms)
✔ rate limit trips after N requests with 429 and a Retry-After header (13.5833ms)
✔ fixtures sanity: fakeTreeStore/fakeAskDeps build injectable deps without touching Mongo/network (0.2212ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### `pnpm -r typecheck` (all 9 workspace projects with a typecheck script)
```
packages/core typecheck: Done
packages/ai typecheck: Done
packages/db typecheck: Done
packages/index typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done
```

### `pnpm -r test` (full monorepo — pre-existing suites unaffected + new apps/api suite)
```
packages/index test: tests 4, pass 4, fail 0
packages/ai test:    tests 23, pass 23, fail 0
packages/ingest test: tests 15, pass 15, fail 0
packages/ask test:   tests 18, pass 18, fail 0
packages/meeting-bot test: tests 19, pass 19, fail 0
apps/api test:        tests 8, pass 8, fail 0
```
(87 tests total across the workspace, 0 failures.)

### `pnpm gen:types --check`
```
OK: 19 generated type file(s) + index.ts match schema/
```

### `python schema/validate.py`
```
PASS: 19 collection schema(s) validated correctly.
```

### `pnpm lint:structure`
```
lint-loc: OK (102 file(s) within budget)
lint-dirsize: OK (54 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (145 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (629 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (107 lines, budget 200)
✔ no dependency violations found (113 modules, 290 dependencies cruised)
```

### Real curl-shaped example against a locally-started test instance

Started `createServer(deps)` on `127.0.0.1:3999` with a fake key store (`demo-key` → tenantId
`tenant-1`, scopes `["ask","sources"]`), a fake tree (`n1` = "Topic One"), and fake
`complete`/`scoreFn` (fixtures identical in shape to `src/fixtures.ts`, driven through the real
`createServer`/`askV2`/`ask()`/`evaluate()` code path — nothing about the HTTP layer or the
ask-pipeline composition is mocked, only the LLM/DB edges are).

```
$ curl -s -X POST http://127.0.0.1:3999/ask \
    -H "Authorization: Bearer demo-key" -H "Content-Type: application/json" \
    -d '{"query":"tell me about topic one"}'

{"verdict":"correct","reason":"at least one candidate scored >= upper threshold 0.7",
 "scored":[{"node":{"node_id":"n1","title":"Topic One","level":"topic",
   "summary":"everything about topic one","children":[]},"score":0.9,"reason":"fixture"}],
 "web_used":false,"insufficient_coverage":false,
 "sources":{"internal":[{"node_id":"n1"}],"web":[]},
 "answer":"This is the demo answer.",
 "auditLog":[
   {"jobKind":"ask.select_nodes","step":"select_nodes","provider":"fake","model":"fake-1","costUsd":0},
   {"jobKind":"ask.score","step":"score"},
   {"jobKind":"ask.answer","step":"answer","provider":"fake","model":"fake-1","costUsd":0}]}

$ curl -s -i -X POST http://127.0.0.1:3999/ask -H "Content-Type: application/json" -d '{"query":"x"}'
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
{"error":"unauthorized","message":"missing or malformed Authorization: Bearer <key> header"}

$ curl -s -i http://127.0.0.1:3999/sources -H "Authorization: Bearer demo-key"
HTTP/1.1 501 Not Implemented
RateLimit-Policy: 60;w=60
RateLimit-Limit: 60
RateLimit-Remaining: 58
RateLimit-Reset: 60
Content-Type: application/json; charset=utf-8
{"error":"not_implemented","message":"GET /sources is planned, not yet built — see TASKS.md"}
```

## Criteria checklist (C1-C8)

1. `server.ts` — DONE (33 LOC ≤ 80; `createServer(deps)`; ephemeral-port-friendly, no forced bind).
2. Auth middleware — DONE (`auth.ts`; hash-based verify via injected store; 401 vs 403 split).
3. `POST /ask` real wiring — DONE (`routes/ask.ts` + `production.ts` real `treeSearch`/`complete`;
   tests use fakes per C3's own instruction).
4/5. Stub routes incl. webhooks — DONE (`routes/stubs.ts`, exact message shape, scope-checked first).
6. Rate limiting — DONE (`rate-limit.ts`, reused `express-rate-limit` per the whatsapp_msg check,
   429 + `Retry-After`).
7. Tests — DONE (8 tests, all 5 required behaviors covered, in-process, no avoidable network bind
   beyond the documented ephemeral-port fallback).
8. No regression — DONE, see verbatim outputs above.

**Known, disclosed gap (not a criterion, called out for the checker):** production `scoreFn` is a
heuristic (`score.ts`), not a real LLM judge, because `@lkb/ask`'s `ScoreFn` type is synchronous.
This is a pre-existing interface constraint from T-005, out of C1-C8's scope, not something this
task silently papered over.

## Status: checked-PASS
Verdict: qa/verdicts/T-009-developer-api.md (Cycle checked: 1, commit cb04252) — 8/8 criteria met; scoreFn scoping ruled legitimate (follow-up T-009b); shell:true command-injection fixed post-verdict (commit be86bf8), before push.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
