# Verdict: vectorless-tree-retrieval (T-008)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 976fb396c1a0a03df6c81ce7022ee4ea7f7d1f55
Base: a9fac545 | Lane: lane/w16-t008vl | Scope: packages/ask module only (scoped unit; no parent closure)

## Diff reviewed (independently)
- packages/ask/src/select-nodes.ts: new exported SELECTED_NODE_LIMIT = 12 replaces literal 6 at the loop guard and the chosen.set guard. Round limit (3) unchanged.
- packages/ask/src/ask-graph.baseline.json: 13 lines changed. blob f776ad42... equals 976fb396 HEAD blob.
- qa/manifests/vectorless-tree-retrieval.md: close-out text only.

## Judgment 1: baseline regeneration is legitimate
Parsed old (a9fac545) and new (976fb396) JSON with qa/checker-scratch-t008/cmp.mjs: same 21 scenario keys; 8 byte-identical; 13 differ, and in all 13 result and writes are identical and calls are identical once the ask.select_nodes messages are masked. 0 other differences. The only change is the select_nodes prompt: new system message, only the offered bounded frontier (root no longer listed), JSON-quoted title/summary. That is the prompt change the contract requires (bounded frontier, untrusted metadata). No DECISION, contract or issue forbids regeneration: the test header says "Regenerate only deliberately: WRITE_ASK_BASELINE=1"; ISS-T050ASKGRAPH-002 only needs the baseline to guard askV2-vs-graph drift, which it still does (same results and writes).

## Judgment 2: cap 12 and contract bounds
Contract clause 1 requires candidate count to have an enforced bound. 12 is still enforced inside selectNodes; the bounded production path (deps.sourceContext) still slices to SOURCE_LIMITS.candidates = 6 before hydrate, with the ask.candidates_bounded disclosure, so hydration, scoring, privacy and call/byte bounds are unchanged (source-context.ts:174 still refuses >6). Provider calls in selectNodes still max 3. Previously the 6 cap made the disclosure unreachable for tree-only retrieval, so 12 is a real fix. My own mutation (limit back to 6) is killed by "bounded candidate cap: 8 candidates..." in both golden and official-graph tests (57/59, restored, hash == HEAD).
Note (not a finding): the legacy non-sourceContext path (no bounded option, not the production path) can now score up to 12 candidates instead of 6. It is still bounded and was unbounded already when extraCandidateArmsFn is supplied.

## Judgment 3: native-bounded-context 2 failures
Reproduced identically at the base copy (git archive a9fac545 under qa/checker-scratch-t008/base): 12/14 pass, same 2 failures. bounded-refine.ts and the test are unchanged by this diff. Root cause is a TEST-ISOLATION defect, not production: "refuses invented transcript times" does Object.assign(packed.sources[0].source, {tStart, tEnd}), and packed.source aliases the shared module-level fixture {sourceLocator}; the later "refuses a changed origin" test's packContext then correctly rejects the polluted tuple. Run alone (--test-name-pattern "changed origin"): 2/2 pass. Production unpackContext is behaving correctly. Worth a low-severity ledger note or one-line test fix (clone fixture per test); not in this unit's scope and not blocking.

## Independent evidence (own runs, node --test --import tsx from packages/ask; outputs in qa/checker-scratch-t008/)
- ask-graph.test.ts 59/59 exit 0
- select-nodes 4/4, tree-routing 5/5, source-context 18/18, bounded-ask 11/11: exit 0
- qa/checker-probes/vectorless-boundaries.test.ts 3/3 exit 0
- native-bounded-context 12/14 (2 pre-existing, see above)
- tsc --noEmit -p packages/ask/tsconfig.json exit 0
- Mutation: SELECTED_NODE_LIMIT=6 killed; per-mutation byte backup, timeout, trap on INT/TERM/ERR, restore verified by cmp and git hash-object (adbac4ed... == HEAD blob)
Not run: packages/index lexical tests, index typecheck, apps/api, any live/92-question eval, no browsers/DB/network.

## Limits
Module-only PASS. Does not certify mounted runtime, routingSummary population (index integration), T008SEARCH-001/002 (apps/api), or the 92-question live gate; the manifest correctly lists these as remaining. Manifest Change-map line "Returns at most six session/leaf candidates" is now stale (twelve; ask-graph cuts to six) - doc-only.
ISSUES-WRITTEN: none
Ledger rows may be flipped: none required by this unit (no filed issue targeted).
