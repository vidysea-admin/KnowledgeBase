# w23-sourcereader: ISS-SOURCEREADER-001 (POST /ingest path)

Status: ready-for-check
Fix cycle: 0
Base: 3c99337f (origin/master)
Branch: lane/w23-sourcereader

## Finding
`createSourceReader` (10s whole-response deadline, 1,000,000-byte streaming cap, abort and cancel, safe errors) already exists and is used by `source-intake/adapters.ts`. The remaining unbounded path was `apps/api/src/ingest-store.ts` `jinaReaderFetch` (POST /ingest): bare `fetch` plus `res.text()`.

## Changed paths
- apps/api/src/ingest-store.ts: `jinaReaderFetch` delegates to `createSourceReader({ apiKey })`.
- apps/api/src/source-intake/source-reader-http.test.ts (new): local http server tests (slow drip, never-responding headers, oversized chunked body, POST /ingest path).
- apps/api/src/tenant-guards/scoped-routing.test.ts, store-guards.test.ts: fetch stubs now return `new Response(text)` (the old `{ok,text}` fake has no body stream).

## Not changed (reported)
`/ingest` (ingest-store) applies no URL/DNS SSRF guard (`guardUrlFetcher` is only used on the source-intake path). Out of scope; owner policy/wiring decision.
Reader now sets `redirect: "manual"`, so a 3xx from Jina is refused instead of followed; error text is now the generic "source reader acquisition failed" (routes/ingest.test.ts passes).

## Checks
- node --test --import tsx src/source-intake/source-reader-http.test.ts src/source-intake/source-reader.test.ts src/routes/ingest.test.ts: 14 pass, 0 fail
- scoped-routing + store-guards tests: 132 pass, 0 fail (2 failed before the stub fix)
- tsc --noEmit apps/api: exit 0
- node scripts/lint-loc.mjs --all: OK (10 stages, 0 failed)

## D-015
ISS-SOURCEREADER-001: 3/3 recorded reproductions replayed verbatim in source-reader.test.ts (pass).

## D-020 mutation
ingest-store.ts reader replaced by bare `fetch().text()`: the POST /ingest test hangs on the endless body and the 40s timeout kills it (exit 124, detected). Per-mutation backup and trap; file restored (createSourceReader present, diff matches the intended change).
