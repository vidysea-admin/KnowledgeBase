# Verdict: goal-u32 (U3.2 Search page / global search bar), fix cycle 1, non-live criteria

VERDICT: HOLD
Cycle checked: 1
Reviewed SHA: d61c555b6eed51685a45fd4bc03fabf9da60174c
Base SHA: a9fac545
Lane: C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u32search (branch lane/w16-u32search)
Non-live slice result (C1-C6, C8 source/focused part): PASS, no defects found
Why HOLD overall: goal-u32 C7 (real authenticated browser, two-persona walk) and live ranked retrieval/provider evidence are absent by the maker's own statement. Contract says missing live evidence yields HOLD and a scoped PASS is never upgraded. This is not a FAIL.
Ledger rows may be flipped: NO (U3.2 stays in_progress). The non-live slice may be recorded as checked-clean.
ISSUES-WRITTEN: none

## Diff reviewed (independently, git diff a9fac545 d61c555b)
3 files only: apps/web/src/api/search/client.ts (+4/-1), client.test.ts (+14), qa/manifests/goal-u32.md. Final blob of client.ts hashes b5d67cff... equal to HEAD blob (git hash-object == git rev-parse HEAD:file) before and after my mutation.

## Commands and results (exit codes persisted in the scratchpad: u32-*.out)
- Baseline: vitest run --no-file-parallelism src/api/search/client.test.ts semanticClient.test.ts: exit 0, 18 passed.
- Mutation (own): per-mutation byte backup, trap INT/TERM/ERR, timeout 300; replaced try/catch with bare `encodedQuery = encodeURIComponent(normalized);`. Result exit 1, 1 failed: "lone high/low surrogate queries refuse with ApiError 400 ... expected URIError: URI malformed to be an instance of ApiError". Other 9 passed. Restored; cmp to backup OK; git hash-object == HEAD blob b5d67cff. Mutant killed.
- Focused set (client, semanticClient, pages/search/*, GlobalSearchBar): exit 0, 8 files, 83 tests passed. (One earlier attempt of the wider glob exited 127 with truncated output under load; re-run clean. Not a product failure.)
- tsc --noEmit -p apps/web/tsconfig.json: exit 0.
- contracts/verify_contracts.py: exit 0, PASS by vacuity (no frozen contracts).
Maker's 75-test figure is not contradicted (my set adds semanticClient.test.ts, 8 tests).

## Judgement: 400 before 401
Acceptable. The refusal is purely client-side, runs before any network call, and its text is fixed and carries no key, tenant, or server information, so nothing leaks. It does not contradict C3: C3 requires safe sign-in messages for invalid authentication, which come from server 401/403 responses; a malformed query never reaches the server, so no auth claim is made. There is precedent in the same function: blank query and bad limit already precede the missing-key 401. SearchPage never calls searchTranscripts without an apiKey (lines 47, 55, 76), so the ordering is unobservable through the UI. URL-origin queries come from URLSearchParams, which yields U+FFFD, never lone surrogates; only typed input can reach this guard, so the fix is defence in depth. Note (not an issue): SearchPage maps 400 to "Enter a search query.", slightly generic for a malformed query; safe. There is no SearchPage-level test for typed lone surrogates; client-level test suffices for this unit.

## semanticClient.ts lone-surrogate check (report only)
Not vulnerable to the crash. searchSemantic builds the query with URLSearchParams (comment at semanticClient.ts:74), which does not throw on lone surrogates (it substitutes U+FFFD), and compares response.query to params.get("q"). encodeURIComponent is used only inside id() (line 34) in a try/catch that returns false. Side effect to know about: a lone-surrogate semantic query is silently sent as U+FFFD rather than refused. Behaviourally safe, inconsistent with the lexical client's refusal, no crash. No fix made.

## Non-live C-criteria to evidence map
- C1 global bar/entry: GlobalSearchBar.test.tsx (14 tests, pass); SearchPage.test.tsx "proposed real App/Nav seam mounts Search without querying"; SearchPage.url "global bar from another route runs ONE search". Source/jsdom only.
- C2 URL/state: SearchPage.url.test.tsx (10 pass): one request per distinct q incl. StrictMode, Back/Forward, same-query retry, malformed percent decoded once, new auth session clears results. Plus this cycle's surrogate guard (client.test.ts, mutation-verified). 512-code-point bound not independently re-probed beyond existing tests.
- C3 tenant lexical + validation: client.test.ts (10) incl. identity/duplicate/nonfinite validation; SearchPage.test "empty response and API scope failure", "key change hides old results". Fake-HTTP, not the real mounted route (live gate).
- C4 exact evidence/navigation: SearchPage.test "explicit submit loads literal passage ... encoded anchor", "actual Search to SessionDetail late UUID target, at most 200 rows", unanchored/malformed anchors. jsdom only.
- C5 ranked retrieval: semanticClient.test.ts (8), SemanticResults.test.tsx (13), SemanticSearchIntegration. Source/mock only; live ranked retrieval NOT evidenced (open, C7/live).
- C6 Send to Ask: AskHandoff.test.tsx (8 pass) with actual App consumer per the manifest; explicit POST discipline. Mock only.
- C7: OPEN, no evidence.
- C8: manifest present with cycle 1 and candidate identity; focused commands rerun independently; verify_contracts exit 0. Manifest records "Candidate SHA: the commit containing this manifest" rather than a literal hash (minor, SHA verified by me). Full-parent PASS needs C7 and completed U3.1.

## Not verified
Browser/live API/provider, C7 personas, malformed-percent Vite 500 on served target, mobile layout, full suite, U3.1 completion, maker/checker token ratios (no telemetry available to me).
