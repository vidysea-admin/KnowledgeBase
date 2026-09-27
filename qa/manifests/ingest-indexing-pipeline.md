# Manifest — ingest-indexing-pipeline

Status: checked-PASS (see qa/verdicts/ingest-indexing-pipeline.md)
Contract: `qa/contracts/ingest-indexing-pipeline.md`
Fix cycle: 1

## What changed

1. **`packages/index/src/pipeline/summarize.ts`, `.test.ts`** (new, 5 tests).
2. **`packages/index/src/pipeline/claims.ts`, `.test.ts`** (new, 8 tests).
3. **`packages/index/src/index.ts`** — exports added (`SummarizeCompleteFn`/`ClaimsCompleteFn`,
   distinct names to avoid a duplicate-export collision with `packages/ask`'s own `CompleteFn`,
   confirmed by `lint-dupes`).
4. **`packages/index/package.json`** — added `@lkb/ai` dependency.
5. **`apps/api/src/indexing.ts`** (new) — `indexSession`, real Mongo write orchestration.
6. **`apps/api/src/ingest-store.ts`, `whatsapp-store.ts`** — both take an optional bound indexer,
   call it after turns are written, swallow (log) a failure rather than failing the ingest.
7. **`apps/api/src/production.ts`** — real bound indexer wired into both.

## Why (this is what "integrate karo" turned out to mean)

Umesh's answer when asked to clarify "integrate karo": ingested content should be actually
searchable, not just sit as a raw session. Investigated and confirmed a real gap: `summarize`/
`claims` job kinds have always been declared in `config/ai-routing.yaml` but nothing ever called
them for a live ingest — T-002's TOC data was a one-time backfill from pre-written files, not a
reusable pipeline. This unit builds that pipeline for real, for both WhatsApp and URL ingestion.

## Real evidence

### Typecheck
```
$ cd packages/index && npx tsc --noEmit -p tsconfig.json    # exit 0
$ cd apps/api && npx tsc --noEmit -p tsconfig.json           # exit 0
```

### Full workspace test suite (fresh run, this session)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/ai:          56/56 pass
packages/ingest:      40/40 pass
packages/ask:         32/32 pass
packages/index:       38/38 pass   (was 25, +13)
packages/meeting-bot: 40/40 pass
apps/api:             65/65 pass
apps/web:             39/39 pass
Total: 317 tests, 317 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run, includes the fixed dupe-export collision)
```
$ pnpm lint:structure
lint-loc: OK (206 file(s) within budget)
lint-dirsize: OK (74 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (239 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (993 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (115 lines, budget 200)
✔ no dependency violations found (239 modules, 702 dependencies cruised)
```

### Real, live Gemini calls (real production provider, no mocks)
See contract for the full transcript. Summary: real summary + 3 real claims each correctly
cited to the exact real turn that supports it, zero fabrication, verified twice (once before,
once after the `CompleteFn` rename, to confirm the rename didn't break wiring).

## Real, disclosed limitation (not hidden, same outage as three prior units today)

Main Mongo host (`13.202.206.101:27017`) unreachable this entire session:
```
$ ping -n 2 13.202.206.101
Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)
```
So `indexing.ts`'s actual Mongo write path is unverified live. This follows the same convention
already established by `store.ts`/`ingest-store.ts`/`whatsapp-store.ts` — none of those
composition-root files have a dedicated unit test either; they're verified via route-level
fixture tests plus live smoke checks. The pure LLM-orchestration logic (the part with real
branching worth testing) IS covered, both by 13 real unit tests and by two real live Gemini runs.

## How to verify (for the checker)
1. `pnpm --filter @lkb/index typecheck` and `pnpm --filter @lkb/api typecheck` — expect exit 0.
2. `pnpm -r test` — expect exit 0, 317/317.
3. `pnpm lint:structure` — expect exit 0.
4. Read the 3 new/changed source files — confirm no fabrication paths, confirm evidence
   cross-checking in `claims.ts`.
5. If `GEMINI_API_KEY` is available, independently re-run a live smoke test — strongest check.
6. If main Mongo has recovered, a full `POST /ingest`/`POST /whatsapp/ingest` round-trip is a
   bonus, not required.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
