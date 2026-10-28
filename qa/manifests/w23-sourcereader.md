# w23-sourcereader: ISS-SOURCEREADER-001 (POST /ingest path)

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w23-sourcereader.md
Fix cycle: 1
Base: 3c99337f (origin/master)
Branch: lane/w23-sourcereader

## Finding
`createSourceReader` (10s whole-response deadline, 1,000,000-byte streaming cap, abort and cancel, safe errors) already exists and is used by `source-intake/adapters.ts`. The remaining unbounded path was `apps/api/src/ingest-store.ts` `jinaReaderFetch` (POST /ingest): bare `fetch` plus `res.text()`.

## Changed paths
- apps/api/src/ingest-store.ts: `jinaReaderFetch` delegates to `createSourceReader({ apiKey })`.
- apps/api/src/source-intake/source-reader-http.test.ts (new): local http server tests (slow drip, never-responding headers, oversized chunked body, POST /ingest path).
- apps/api/src/tenant-guards/scoped-routing.test.ts, store-guards.test.ts: fetch stubs now return `new Response(text)` (the old `{ok,text}` fake has no body stream).

## Cycle 1: SSRF guard on POST /ingest
`ingest-store.ts` `jinaReaderFetch` is now `guardUrlFetcher(createSourceReader(...), lookup)`, the same composition as source-intake. `createMongoIngestDeps` gained a `lookup` seam (default: system resolver). New `tenant-guards/ingest-ssrf.test.ts` (no real network or DNS) drives POST /ingest and asserts 502 `url-blocked` with zero reader calls for 127.0.0.1, 10.x, 169.254.169.254, [::1], a hostname resolving to a private IP, a mixed public/private answer, and URL credentials; non-http scheme gets 400 at the route and `url-blocked` at the store (file:, ftp:, javascript:); a public host with injected lookup and fetch returns 201. Existing fetch-stub tests inject a public lookup. Mutation: guard bypassed in `ingest-store.ts`, 8 of 9 SSRF tests fail (detected); restored and hash-checked.

## Behaviour notes
The reader sets `redirect: "manual"`, so a Jina 3xx now fails closed (refused, never followed) instead of followed; error text is now the generic "source reader acquisition failed" (routes/ingest.test.ts passes).

## Checks
- node --test --import tsx src/source-intake/source-reader-http.test.ts src/source-intake/source-reader.test.ts src/routes/ingest.test.ts: 14 pass, 0 fail
- scoped-routing + store-guards tests: 132 pass, 0 fail (2 failed before the stub fix)
- Cycle 1: ingest-ssrf, source-reader-http, source-reader, routes/ingest, scoped-routing, store-guards, turn-timing-write: 165 pass, 0 fail
- tsc --noEmit apps/api: exit 0
- node scripts/lint-loc.mjs --all: OK (10 stages, 0 failed)

## D-015
ISS-SOURCEREADER-001: 3/3 recorded reproductions replayed verbatim in source-reader.test.ts (pass).

## D-020 mutation
ingest-store.ts reader replaced by bare `fetch().text()`: the POST /ingest test hangs on the endless body and the 40s timeout kills it (exit 124, detected). Per-mutation backup and trap; file restored (createSourceReader present, diff matches the intended change).
