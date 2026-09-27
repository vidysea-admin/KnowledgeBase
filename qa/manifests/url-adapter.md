# Manifest — url-adapter (T-023)

Status: checked-PASS
Cycle checked: 1
Verdict: `qa/verdicts/url-adapter.md` — PASS, commit `bcc6f1e`
Contract: `qa/contracts/url-adapter.md`

## What changed

1. **`schema/sources.schema.json`** — `kind` enum gains `"url"`; new optional `url: {type:
   "string"}` property. Additive only (`additionalProperties: true` already existed).
   `pnpm gen:types` regenerated `packages/core/src/generated/sources.ts`.
2. **`packages/ingest/src/sources/url.ts`** (new) — `createUrlSource({hasher, fetcher, now?})`:
   `detect` matches a bare `http(s)://` string or a `{kind:"url", url}` hint; `fetch` requires
   `tenantId` (throws otherwise), calls the injected `fetcher(url)` for extracted text, hashes it,
   returns a `SourceDoc` with `kind:"url"`, `url`, no media; `toTurns` requires `source.url`,
   re-fetches via the same injected `fetcher`, and reuses `document.ts`'s exported
   `splitIntoParagraphTurns` (imported, not duplicated), tagging each turn `speakerRef: "url"`.
3. **`packages/ingest/src/sources/document.ts`** — one disclosed necessary fix (not scope creep):
   `hasDocumentExtension` now returns `false` for an http(s)-shaped string BEFORE checking the
   extension suffix. Without this, `https://example.com/report.pdf` matched BOTH the document
   adapter (via its `.pdf` suffix) and the new url adapter, and `detectSource` picks the first
   match — silently routing a URL through the wrong adapter. `document.ts`'s own 4 pre-existing
   tests are unmodified and still pass (confirms no behavior change for any actual local path).
4. **`packages/ingest/src/testUtils.ts`** — added `fakeUrlFetcher(pages)`, mirroring the existing
   `fakeTextReader`/`fakeBytesReader` shape (in-memory, throws on an unknown url).
5. **`packages/ingest/src/index.ts`** — re-exports `./sources/url.js`.
6. **`packages/ingest/src/sources/url.test.ts`** (new, 9 tests) + **`registry.test.ts`** (1 new
   test proving the url/document boundary is unambiguous, adapters array extended to include the
   url adapter — 3 pre-existing registry tests unmodified and still pass).

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... 9 workspace projects ... all Done

$ pnpm --filter @lkb/ingest test
tests 26 / pass 26 / fail 0   (17 pre-existing + 9 new url.test.ts, +1 new registry test folded
                                into the existing count since it's an addition to registry.test.ts)

$ pnpm -r test
index 11 / ai 23 / ingest 26 / ask 21 / meeting-bot 20 / apps/api 18 — all green, 0 regressions

$ pnpm gen:types --check
OK: 21 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 21 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (116 file(s) within budget)
lint-dirsize: OK (56 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (169 unique export(s), 21 unique schema $id(s))
lint-migrations: OK (666 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (109 lines, budget 200)
✔ no dependency violations found (129 modules, 353 dependencies cruised)
```

## Files touched
- `schema/sources.schema.json` (kind enum + url field, additive)
- `packages/core/src/generated/sources.ts` (regenerated, not hand-edited)
- `packages/ingest/src/sources/url.ts` (new)
- `packages/ingest/src/sources/url.test.ts` (new)
- `packages/ingest/src/sources/document.ts` (1-line URL-exclusion fix, disclosed above)
- `packages/ingest/src/registry.test.ts` (extended, 1 new test)
- `packages/ingest/src/testUtils.ts` (new `fakeUrlFetcher` helper)
- `packages/ingest/src/index.ts` (re-export)
- `qa/contracts/url-adapter.md` (new contract, maker-drafted)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
