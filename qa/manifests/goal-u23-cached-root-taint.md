# U2.3 cached-root provenance taint repair

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 2
Issue: ISS-U23-CACHED-ROOT-001, qa/issues.u23-cached-root.jsonl
Task: U2.3; priority tier 2, reproduced security/data-write provenance finding.
Contract: qa/contracts/u23-cached-root-taint.md
Packet: qa/packets/goal-u23-cached-root-taint.md

## Actual original RED
Receipt qa/evidence/goal-t051checker-broker-u23-cached-root-current-dependency-original-red.json:
exit1, positive control1PASS/security attack1FAIL, zero skip/cancel; broker1058.1844ms,
UTC2026-10-14T22:23:57.674Z..22:23:58.737Z; providerCalls0.
Unsafe page was withheld but retainedRoot/loadedMarker/resolvedMarker remained true.
Original eligible source040dc797ce8ccf404eb1d5b4c68eb629cdb6f58298491da5d9f2c00091fc454e remained unchanged during that run.
The executed current source/dependency pins and public DTO/consent deltas are attributed in the receipt/spec;
this is not claimed as execution of the historical seven-byte snapshot map.
Recorded corpus floor is the exact022 consent-positive script; historicalc050 fixture/4ED knowledge bytes remain preserved.

## Scoped repair candidate
Exclusive runtime lease: apps/api/src/indexing/eligible-tree.ts and new eligible-tree.test.ts.
Rejected pages or cached contributors without current eligible pages invalidate the entire cached root,
including ancestor summaries and untouched years. Returned sessions now contain only safe-page contributors.
Valid cache retains its exact reference. No provider, persistence, transcript repair or helper/source schema changes.
Source frozen SHA0dfc6e5cdc067c176e50eb44189d9ef860e14cddaf8f8b537f7b5e3a71a88e8f;
standing test SHA3b7919c63d65cf6ecb63ef935aa71b1c6364e7b9e52a57f6f5c63134ec7cad89.
Runtime additionally authorized current-content privacy guard: bound pages must match exact effective
turn digest and session/source; cited pages retain strict quote validation; unbound legacy free text
must be exact copied current cited text or is withheld for reindex. No environment bypass.
Runtime authorized one final cached-content guard: session summaries and generation bindings must
match current safe pages, and cached topic/org display text must remain supported by contributing pages.

## Pending evidence and boundaries
No GREEN run claimed; sole broker must execute exact original floor plus standing and actual reader consumption.
Root/runtime owns direct pre-index tree/graph snapshot caller changes; these are separate current candidate pins.
The original022 collection-only fixture cannot satisfy the newly mandatory snapshot-client gate.
Its bytes/oracle remain unchanged; root/runtime approved separate pinned original-consumer replay plus
current full-snapshot standing/reader probes. Original ledger counts must be recorded separately,
with honest actual-original reader attribution; historicalC3 bytes cannot stand in for actualD1 silently.
ActualD1 reader snapshot recovered with exact receipt hash at qa/evidence/goal-u23/cached-root-original/d1afa507-actual-red-trusted-readers.ts.txt;
recovery is reconstructed from preservedC3 plus known projection delta, not an invented historical save timestamp.
Ordinary standing fixtures provide snapshot lifecycle capability without weakening the production gate.
Same-ID corrected legacy text and generation-digest changes are covered by added standing cases,
pending actual broker execution. ID existence alone no longer grants page reuse in this candidate.
Existing goal-u23 helper cycle1checked-PASS remains unchanged and cannot certify this repair.
Full U2.3/U2.2 human gold/threshold/provider/runtime acceptance remains HOLD.

## Fix cycle 2 (lane lane/w16-u23taint, base a9fac545)
Changed paths: packages/index/src/tree/topic-indexing.ts, packages/index/src/tree/cached-root-taint.test.ts (+ this manifest).
Fix: buildTopicIndex now drops an existing cached root unless every reused (untouched) year matches what buildTree emits from the CURRENT safe sessions/pages:
root/year/month/topic/org summaries empty, session summary == page summary, topic/org titles and sessionRef supported. Divergence => whole root rebuilt (contract clause 2).
Contract clauses 2,3,4. Reader paths covered: cached root summary, trustedTreeReads.load, treeSearch, rebuilt root; positive control retains knowledge.
Ledger corpus ISS-U23-CACHED-ROOT-001 (1 attack + 1 control): verbatim script run as-is in lane = 0/2 (503 snapshot-gate environment gap, not exposure);
same fixture/oracle with snapshot-capable db double: attack 1/1 refused, control 1/1 retained, for both current and original-producer (cache retained) inputs.
Checks: cd packages/index; node --test --test-isolation=none --import tsx src/tree/cached-root-taint.test.ts => pass 13 fail 0;
with topic-indexing.ts reverted to HEAD: pass 4 fail 9 (mutation, restored, cmp ok). src/tree/topic-indexing.test.ts tree.test.ts flatten-graph.test.ts => pass 20 fail 0.
tsc: only env errors (@lkb/* and mongodb unresolved under lane junction); none in topic-indexing.ts.
