# Verdict - w23-sourcereader (ISS-SOURCEREADER-001 + SSRF guard on POST /ingest)

**VERDICT: PASS**
**Verdict:** PASS
**Cycle checked:** 1
**Reviewed SHA:** 3e44a76872ea7ab2942f55769dff388562067e7e
**Base:** 3c99337f (cycle 0 was a3a5babc)
**Reviewer:** Sonnet 5.5 checker. Opus is at its weekly limit, so this is a Sonnet review, not the Opus review the policy prefers for security units.

## Findings (no blocking)
1. Guard target (verify 1): the guard wraps the USER URL. `jinaReaderFetch` is `guardUrlFetcher((url) => createSourceReader(...)(url), lookup)` (apps/api/src/ingest-store.ts:25). The `https://r.jina.ai/` prefix is added inside the reader (source-reader.ts) only after the guard accepted the user URL. A private target is refused before Jina is contacted. Probes: 2130706433, 0x7f.1, 127.1, 0, [::ffff:127.0.0.1], [::ffff:7f00:1], [fd00::1] are all blocked.
2. DNS rebinding (verify 2): NOT pinned. `guardUrlFetcher` (source-intake/adapters.ts:46-66) resolves once with `lookup`, judges every address, then forwards the URL string. The real connection is made by Jina from its own network, which this process cannot pin or observe. The guard is a pre-check, so it does not stop a rebinding host or a Jina-side redirect to a private address. That is the same documented design as ISS-W045-001 and source-intake, and the traffic leaves our network via a third party, so it is not blocking. The reader sets `redirect: "manual"` for the Jina hop itself. Note only.
3. Seam safety (verify 3): `lookup` is optional and defaults to `resolveAll`, the real resolver. The only production caller is composition/production.ts:226, `createMongoIngestDeps(boundIndexer)`, with no seams. A permissive stub appears only in tests. `seams.urlSource` bypasses the guard but is documented as a test seam, and production passes none.
4. Stub change (verify 4): the stubs now return a real `Response`, because the reader needs a body stream. The assertions are unchanged. Both files inject a public lookup (93.184.216.34). The tenant-isolation assertions are intact: row stamping and tenant sets are unchanged. They are not weakened.
5. D-015 (verify 5): ISS-SOURCEREADER-001 reproductions 3/3 replayed verbatim in source-intake/source-reader.test.ts, all passing: never-resolving transport, stalled body cancelled, chunked body above cap.
6. Environment note: routes/ingest.test.ts passes 4/4 (exit 0, run twice without `--test-force-exit`). With `--test-force-exit` the process sometimes dies at teardown with the libuv assertion `UV_HANDLE_CLOSING` (win/async.c:94). The first run was exit 1 and one rerun was exit 1, both with 4 tests passing and 0 test failures. This is a Windows/Node 24 teardown artifact, not a test failure. That test file uses fake ingest deps and does not exercise the changed code.

## Commands (timeout 600, from apps/api; outputs under the session scratchpad sr/)
- source-reader-http: exit 0
- source-reader: exit 0
- routes/ingest: 4 pass / 0 fail (see note 6)
- tenant-guards/ingest-ssrf: exit 0, 9 pass / 0 fail
- tenant-guards/scoped-routing: exit 0
- tenant-guards/store-guards: exit 0
- tsc --noEmit -p apps/api: exit 0
Not run: full suites, lint-loc, turn-timing-write (the maker reports them; not independently reproduced).

## Mutation (own, D-020)
Mutant: guard only the Jina host (`guardUrlFetcher(async () => "", lookup)("https://r.jina.ai/")`) and skip the target.
- ingest-ssrf.test.ts: 8 of 9 fail, 1 pass (the public-host acceptance test, as expected). Mutant KILLED.
- Defect in my own harness: the trap restored from a relative backup path after `cd apps/api`, so the restore failed and the mutant stayed applied. I restored it with `git checkout -- apps/api/src/ingest-store.ts`.
- HEAD fidelity afterwards: `git -c core.autocrlf=true hash-object apps/api/src/ingest-store.ts` = c776caffc9deaca1e7f128ad9908ceabf4935509 = `git rev-parse HEAD:apps/api/src/ingest-store.ts`. `git status` is clean. The harness dir was removed.

## Ledger
ISSUES-WRITTEN: none
The ISS-SOURCEREADER-001 row may be flipped to verified. Keep the DNS-pinning limit (finding 2) as a noted residual, not a new issue.
