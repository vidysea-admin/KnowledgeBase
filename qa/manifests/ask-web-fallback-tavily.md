# Manifest — ask-web-fallback-tavily

Status: checked-PASS (see qa/verdicts/ask-web-fallback-tavily.md)
Contract: `qa/contracts/ask-web-fallback-tavily.md`
Fix cycle: 1

## What changed

1. **`packages/ask/src/ask-v2.ts`** — `AskV2Deps.tavilySearchFn` (optional, async), merge logic
   in `askV2` layered on top of the existing sync `webFallbackFn` path.
2. **`packages/ask/src/ask-v2.test.ts`** — 2 new tests.
3. **`apps/api/src/ask-web-fallback.ts`** (new) — real `createTavilySearchFn`.
4. **`apps/api/src/ask-web-fallback.test.ts`** (new, 3 tests).
5. **`apps/api/src/production.ts`** — wires it into `askDeps` conditionally.

`packages/ask/src/router.ts` and `router.test.ts`: zero lines changed.

## Why (ledger item this closes)

ISS-010's third sub-gap ("web-search provider absent from T-019"). The other two named sub-gaps
were checked this tick and found already resolved: `POST /ask` exists and is tested; `media`'s
schema already requires `retention` (D-002). Only the web-search provider was genuinely missing.

## Real evidence

### Typecheck
```
$ cd packages/ask && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json         # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/index:       25/25 pass
packages/ai:          56/56 pass
packages/ingest:      34/34 pass
packages/ask:         32/32 pass   (was 30, +2)
packages/meeting-bot: 40/40 pass
apps/api:             59/59 pass   (was 56, +3)
apps/web:             34/34 pass
Total: 287 tests, 287 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (195 file(s) within budget)
lint-dirsize: OK (73 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (227 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (968 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (226 modules, 648 dependencies cruised)
```

### Frozen interface respected
```
$ git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts
(empty output)
```

## Real, disclosed limitations (not hidden)

1. **No real `TAVILY_API_KEY` exists** — the live HTTP path to `api.tavily.com` is real code,
   unit-tested with a mocked `fetch`, but never exercised against the real vendor. Ships inert
   in production until Umesh adds a key (matches the `gws` Calendar/Gmail adapters' own
   "interface first, real wiring later" precedent, minus the live-verification step those units
   could do because `gws` was already authenticated).
2. **Live `/ask` server verification was blocked this session** by a real, transient
   infrastructure issue, not this code: the project's remote Mongo host
   (`13.202.206.101:27017`) was unreachable (`ETIMEDOUT`, confirmed via a 100%-loss `ping`) at
   verification time. The full test suite (287/287, no live Mongo required) is the evidence in
   its place.

```
$ ping -n 2 13.202.206.101
Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)
```

## How to verify (for the checker)
1. `pnpm --filter @lkb/ask typecheck` and `pnpm --filter @lkb/api typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 287/287.
3. `pnpm lint:structure` — expect exit 0.
4. `git diff --stat packages/ask/src/router.ts packages/ask/src/router.test.ts` — expect empty.
5. Read the 3 changed/new source files — confirm the design matches the contract.
6. If Mongo is reachable by check time, a live `/ask` smoke test is a welcome bonus, not required.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
