# Checker packet — goal-u23-cached-root-taint, fix cycle 2

Repository: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/goal-u23-cached-root-taint.md
Verdict owner: /root/implementation_status/checker_u23, qa/verdicts/goal-u23-cached-root-taint.md
Independent contract: qa/contracts/u23-cached-root-taint.md, all six clauses.
Issue corpus: ISS-U23-CACHED-ROOT-001 in qa/issues.u23-cached-root.jsonl.
State: building/frozen source candidate; no GREEN execution asserted yet.

## Changed bytes and original baseline
- apps/api/src/indexing/eligible-tree.ts original040dc797ce8ccf404eb1d5b4c68eb629cdb6f58298491da5d9f2c00091fc454e;
  new0dfc6e5cdc067c176e50eb44189d9ef860e14cddaf8f8b537f7b5e3a71a88e8f.
- New apps/api/src/indexing/eligible-tree.test.ts; no base; SHA 3b7919c63d65cf6ecb63ef935aa71b1c6364e7b9e52a57f6f5c63134ec7cad89.
- New maker manifest/packet above. Original source snapshots live under qa/evidence/goal-u23/cached-root-original/.
No package/schema/generated/contract/ledger/shared reader or session source writes by this maker.

## Recorded reproduction floor and actual RED
Exact issue script qa/evidence/goal-u23/cached-root-taint-original.test.ts,
SHA022da5db68294a6020409f8bd3e18c4606b2f1b72b35e1a8d478518a5e96b64e,
contains the two recorded original cases. Its consent-positive fixture delta is documented separately
from the historicalc050 script (preserved .txt, never executed). Root/runtime approved separate replay
of that exact script, with no case/input/oracle changes, through an explicitly pinned original-consumer
QA loader because its collection-only mock predates the current mandatory snapshot-client interface.
Actual original readerD1 bytes must be honestly identified; historicalC3 alone is not mislabeled D1.
Recovered exactD1 file: qa/evidence/goal-u23/cached-root-original/d1afa507-actual-red-trusted-readers.ts.txt,
SHA d1afa507ba6d1f426d1da2c14f65178fb9d930e592cca0ee4b8d61e493727042. Runtime reconstructed
preservedC3 plus known public-projection delta and matched the actual RED receipt; no historical timestamp inferred.
Ordinary standing tests exercise the CURRENT full-snapshot reader with capable fixtures and no QA loader.
Actual RED receipt qa/evidence/goal-t051checker-broker-u23-cached-root-current-dependency-original-red.json,
SHAaae2a335627422e8619388eedf942bd14b8425a2d36bc600f6caa91c93b504c0;
stdout/stderr beside it bind the actual current dependency map, not the older seven snapshots.
Command from repo: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-u23/cached-root-taint-original.test.ts`.
Node runtime in receipt is bundled C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
UTC22:23:57.674..22:23:58.737, exit1, broker1058.1844ms, 1positivePASS/1securityFAIL, no skip/cancel.
Security trace: eligiblePages[new], retainedRoot/loadedMarker/resolvedMarker true; providerCalls0.
No GREEN issue count claimed yet; required original floor count is 2 cases, measured by issue ID separately from extra tests.

## Change map and immediate consumers
eligibleTreeInput still validates each input page against actual effective tenant-scoped turns.
Runtime authorized narrow current-content guard in this same lease: page indexArtifact version/generation,
session/source and exact indexTurnDigest(effective rows) must match. Existing citedItems/qa must still
pass validateRuntimePage. Unbound legacy summary/insight/decision/action text must be nonempty exact
current-evidence excerpts (each nonblank line copied from a current cited turn), otherwise withhold/reindex.
No policy exception, model validation weakening, environment bypass or backfill was introduced.
New cachedContributorsSafe recursively requires session nodes' single reference and every explicit
single/plural cached evidence reference to belong to current safe-page contributors.
A rejected page, withheld session, foreign root stamp or disappeared contributor invalidates the
entire cached root. Returned sessions are narrowed by tenant, visibility and safe-page membership.
Final root-authorized content/lineage repair additionally requires cached session summary and binding
presence/fields to match the CURRENT safe page; stale topic/org title/nonempty summary must remain
supported by all referenced current page text. A new valid page cannot authorize an old same-ID cache.
Return keys remain sessions/pages/existingRoot; valid cache is returned by reference unchanged.
apps/api/src/indexing/session.ts consumes existingRoot: undefined as a complete rebuild through
buildTopicIndex; stale untouched-year/topic/ancestor text is not incrementally reused.
Recorded cases reach the actual trustedTreeReads load and treeSearch, not a helper-only approximation.
Root/runtime separately owns trusted-readers.ts same-snapshot direct tree+graph use of the helper.
Standing extras assert root invalidation and safe contributors, vanished-page downstream consumption,
exact valid cache reference, and single/plural contributor mismatch refusal.
Security flags: tenancy/current-source read eligibility and the candidate used by tree persistence;
no auth/credentials/provider/DB writes in these two files or fixtures. Fake DB predicates are exercised.

## Proposed broker GREEN checks (not executed yet)
From repo, sole /root/docker_checker after exact source/dependency/caller pins:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/indexing/eligible-tree.test.ts`.
This registers eight CURRENT snapshot-capable cases, zero network/provider/production DB.
The exact recorded022 floor2 runs separately via broker's approved pinned original-consumer loader;
its ISS-U23-CACHED-ROOT-001 attack/control counts must be explicit, never replaced by the extra eight.
Current cases include same-ID corrected legacy text and generation/current transcript/source binding mismatch.
They also cover corrected current page versus stale cached summary through the actual reader, and
stale topic/org text when the parent session summary already matches the current page.
Checker's direct pre-index tree/graph probes must run after runtime's separate caller repair.
No maker CPU or independent duplicate full typecheck/build; central broker owns execution and final receipt.
Reuse required frozen-validator receipt only while validator/registry hashes remain unchanged; central receipt
qa/evidence/goal-t051checker-validator.json is historical attribution pending current hash confirmation.

## Known limitations
Legacy free summaries that cannot be proved extractive against current evidence are withheld for reindex.
Generation bindings prove current-source freshness, and cited pages retain strict quote verification;
none of these mechanisms constitutes semantic gold or full extraction-quality acceptance.
Full U2.3 human gold/thresholds/provider quality and production rollout remain HOLD.
