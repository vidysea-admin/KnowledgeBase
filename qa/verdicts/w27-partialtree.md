# Verdict: w27-partialtree

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 773326497a54dde48b6574d5c2ae4051cfff989d
Base: 2ff2b7f3a64a2ebaea43781e08860de18de7f72c
Class: SECURITY (what Ask may cite; tenancy)
Decision: D-190 (2026-10-22)
Checker: independent (Sonnet 5.5), 2026-10-22

## Identity
Lane HEAD = 77332649 (full SHA above), single commit over base, working tree clean before review.

## Findings by focus
1. Leak / stale-root window: no leak found. `eligibleTreeInput` (apps/api/src/indexing/eligible-tree.ts) builds `contributors` only from sessions that are visible, have a safe page and are in the verified tenant. `cachedContributorsSafe` is re-run on every read and every index write, so a root that cites a session which became ineligible after caching is NOT served (read returns null -> 404) and is dropped on the next index write. Graph edges are filtered to eligible session ids and graph session list uses `eligible.sessions` only. Test 3 (stale root citing c, c then ineligible) proves not-served and rebuilt-without-c.
   - Note (non-security, not a unit): on read the dropped root is not rebuilt, so a tenant whose cached root cites a newly ineligible session 404s until the next index write. Fail-closed; same as base behavior; the maker disclosed it. Worth a TASKS follow-up if Umesh wants read-time rebuild.
2. Org-node relaxation: `session.org` is read from the tenant-scoped session row, and only from `contributors` (same tenant, visible, safe page). buildTree (packages/index/src/tree/build.ts:149-152) titles org nodes from that same field, so a match is current support. Relaxation requires an empty node summary and exact normalized title equality with the citing session's own org; a tampered title is refused (test 7). Forging needs write access to the tenant's own tree_index, and the title only echoes that tenant's own session.org. No cross-tenant path.
3. Counts-only: `excluded` is `{total, reasons}` built from tenantSessions only; no ids or titles. Test 5 (tenant-b sees zero counts of tenant-a) and test 6 (no ids in /ask and /graph bodies, no secret text) pass.
4. D-190: diff of docs/DECISIONS.md is additions-only (0 removed lines). I replayed scripts/append_decision.ps1 on base DECISIONS.md with the D-190 entry: accepted (sequential after D-189), output is byte-identical to the candidate except CRLF vs LF line endings (git normalisation). Cannot prove who ran the script, but the content is exactly what the script emits. Carries Approved-by Umesh with verbatim quote.
5. Re-runs (outputs in scratchpad w27chk/):
   - New file eligible-tree-partial.test.ts: 7/7 subtests pass in all 3 runs. On 2 of 3 runs node exited 1 from a Windows libuv teardown assertion (`UV_HANDLE_CLOSING, async.c:94`) after all subtests passed. Test-server shutdown flake, not a product failure. Low note.
   - cached-root-taint, ask.test, graph.test, eligible-tree.test: all pass (22 + 11 passed, 0 failed).
   - api tsc --noEmit: exit 0.
   - D-020 mutation (absolute-path trap per mutation, byte backup, timeout 300, HEAD hash check): M-a removing only the leaf `sessionRef` check and M-b also disabling the session-level check both SURVIVED, because the session-level `!page` test and ancestor `sessionRefs` check also reject an ineligible session (defence in depth, equivalent for the fixture). M-c removing both ref checks: no real kill either (only the flake). M-d `cachedContributorsSafe` forced to return true: KILLED by 2 tests (stale-root test and org-tamper test). Restored; `git hash-object` equals `git rev-parse HEAD:` blob 3b4f8fcd99950b879da9d874da5ece986f3b0425; tree clean.

## Not verified
Web AskPage rendering test and web tsc (maker claims 13/13 and exit 0, reused unverified); the 47-file related set and lint-loc; live staging results (maker claims; ask returned 503 downstream of the tree, not investigated); no Mongo-backed tests.

## Ledger
Zero ledger rows flip: the unit fixes no filed issue. ISSUES-WRITTEN: none.
