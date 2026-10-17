# Independent security checker — cached-root taint

Current authoritative result (cycle 2 section at end of file): VERDICT: PASS; Cycle checked: 2; Reviewed SHA: 0d01e923ca3b1d4589959acf777d257cc5f9a226. The cycle-1 FAIL record below is preserved unchanged and certifies only its original-producer receipt.

VERDICT: FAIL
Cycle checked: 1
Scope: original vulnerable producer with explicitly pinned current dependencies.
Contract: qa/contracts/u23-cached-root-taint.md, clauses 1–4.

Actual intended RED established by the central broker, not inferred from source:
the exact recorded attack exposes rejected old-page knowledge through the production
trustedTreeReads loader and treeSearch after default-off incremental indexing.
Positive control passes. This FAIL certifies the original receipt candidate only;
subsequent repairs need their own cycle and matching independent verdict.
Historical goal-u23 helper cycle-1 PASS is preserved and certifies its prior scope only.

Exact command from C:/Users/product/Desktop/KnowledgeBase:
`C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-u23/cached-root-taint-original.test.ts`
UTC 2026-10-14 22:23:57.674..22:23:58.737; timeout60000ms; exit1, no signal/error;
2 tests, 1 positive PASS, 1 intended security FAIL, 0 skipped/cancelled/todo;
Node925.3992ms, broker1058.1844ms. Assertion identifies actual rejected-cache exposure,
not an import/type/harness failure. Marker diagnostics: eligiblePages=[new],
retainedRoot=true, loadedMarker=true, resolvedMarker=true, providerCalls=0.

Receipt: qa/evidence/goal-t051checker-broker-u23-cached-root-current-dependency-original-red.json
SHA256 aae2a335627422e8619388eedf942bd14b8425a2d36bc600f6caa91c93b504c0;
matching .stdout.txt and .stderr.txt independently read, including exact failing assertion.
Receipt before/after pins all match. Original eligible040dc797ce8ccf404eb1d5b4c68eb629cdb6f58298491da5d9f2c00091fc454e;
executed current readerd1afa507ba6d1f426d1da2c14f65178fb9d930e592cca0ee4b8d61e493727042;
knowledgee97c65c1a29304b78257b6880ce27de49bafcefa7d45d1f0ca5da1182d70ea04;
immutable floor022da5db68294a6020409f8bd3e18c4606b2f1b72b35e1a8d478518a5e96b64e.
Complete imported source/dependency pins and historical snapshots are in the receipt.

No old-seven-pin execution is claimed. Independently reviewed knowledge4ED→E97:
only explicit-false consent guards; fixture contains explicit positive mock consent.
Independently reviewed trusted-readersC3B→D1: public DTO projection changes;
trustedTreeReads logic is unchanged. Session673 generation writer is not invoked
by this probe; execution/import dependency and historical sessionB48 are pinned honestly.
Preserved old4ED reader and never-executed c050 probe remain historical snapshots.

ISSUES-WRITTEN: ISS-U23-CACHED-ROOT-001 in qa/issues.u23-cached-root.jsonl.
Recorded corpus: two cases (one attack, one positive control), exact full022 script
stored verbatim in the row. Original attack0/1 refused (1/1 exposed), control1/1 retained.
Repair acceptance must replay this floor verbatim and add direct pre-index reader cases.

Original checker launch21:46:33UTC; paused/readiness/hash-drift intervals explicit.
Current receipt-review resume22:29:39UTC; read command exit0/wall0.4151917s;
issue write exit0/wall2.6787128s. Earlier broker preflights skipped without running tests.
Broker execution times above are measured; grant/approval timestamps unknown.
Final persistence confirmation follows this write; exact persist start unknown.

EXPLANATION: Required high-severity security repair is authorized; producer and direct
reader guards are distinct. Root/runtime owns shared caller code, maker has eligible-tree
lease, checker owns QA evidence. No production DB, provider, browser or full-suite work
was performed. Full U2.3 human gold, threshold, provider and rollout gates remain HOLD.

## Cycle 2 — independent checker (lane lane/w16-u23taint)

VERDICT: PASS
Cycle checked: 2
Reviewed SHA: 0d01e923ca3b1d4589959acf777d257cc5f9a226 (base a9fac545, lane HEAD verified)
Contract: qa/contracts/u23-cached-root-taint.md clauses 2, 3, 4, 6 (scoped security only).
Evidence dir: qa/verdicts/goal-u23-cached-root-taint.cycle2-evidence/ (logs, exit files, hashes, metrics, assess).

Identity: diff a9fac545..0d01e923 = topic-indexing.ts (blob b146c3bd), new cached-root-taint.test.ts (74378cd4),
manifest. eligible-tree.ts (5be833ac), trusted-readers.ts (af797286), read-snapshot.ts (725d7326) identical at
base and candidate. Lane @lkb/* resolve via junction to MAIN packages; main packages/index|core|db equal a9fac545, clean.

Base producer/reader repair: CONFIRMED by source read and replay. eligibleTreeInput retains a cached root only if
every session is visible, every page is safe, and cachedContributorsSafe holds; trustedTreeReads serves only that
retained root (plus gated native branches), so any rejected page yields no transcript root. Candidate adds
defence-in-depth: buildTopicIndex drops a root whose untouched years differ from buildTree on current safe inputs.

ISS-U23-CACHED-ROOT-001 corpus (1 attack + 1 control):
- Verbatim committed script (blob sha256 022da5db): exit 1, 0/2, both throw 503 "Current knowledge tree
  unavailable" from withKnowledgeReadSnapshot (db double lacks client.startSession). Fail-closed, no exposure.
- Same bytes plus a client.startSession pass-through shim only (input, matcher and oracle unchanged): exit 0,
  attack refused 1/1 (retainedRoot false, loaded/resolved marker false), control retained 1/1, providerCalls 0.
  Shim judged legitimate: the snapshot gate is a consistency wrapper that production Mongo provides; it filters nothing.
- Checker probe, pre-index persisted tainted root + rejected page through actual reader: marker absent.
Focused: cached-root-taint + topic-indexing + regenerate + tree tests: exit 0, 33/33 (new file 13/13).
Mutation (own): dropped `want.summary !== node.summary` in check(); per-mutation backup + trap; exit 1,
4 named failures (year/month/session/topic summary taints); restored, git hash-object == HEAD blob b146c3bd.
contracts/verify_contracts.py: exit 0 (vacuous, no frozen contracts).
Reader survey: graph-context validates page/generation per session; search-store reads native locators only;
flywheel/connector readers only digest or check structure. No path to rejected-page text found.

ISSUES-WRITTEN: none
EXPLANATION (low notes, not backlog): (a) the reader serves an orphan tenant/year/month summary when all pages
are valid (probe: served true); no rejected page is involved, buildTree never writes ancestor summaries, and the
candidate purges it on the next index. (b) The guard skips non-"year" root children and root title, and
holdsChanged is depth-agnostic unlike regenerate; unreachable from buildTree-shaped trees.
Not verified: tsc typecheck, broker execution, sample-data run, maker revert 4/9 claim (own mutation substituted).
Ledger: ISS-U23-CACHED-ROOT-001 may be flipped to fixed for this scope once maker closes out this PASS.
Metrics: maker usage unknown, BOOTSTRAP_REVIEW, ratio unverified; checker ~1380 s active, ~97k tokens (approx).
Bootstrap default exceeded under brief allocation 120k; recorded, not waived. Full U2.3 gates stay HOLD.
