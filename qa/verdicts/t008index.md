# Verdict: t008index
VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 704223eae78dd0afb3b5d0427d520c9692c7fe7f
Base: 9e55b642 (code commit aa999d6d; manifest 704223ea)
Checker: independent; evidence in lane .chk/ (untracked, not committed)

## Claim "already at base" - VERIFIED
`git diff 9e55b642 704223ea --stat`: only apps/api/src/indexing/eligible-tree.test.ts (+34) and qa/manifests/t008index.md (+25). generation.ts and session.ts are untouched, so bindIndexTree behavior is the base's.
bindIndexTree (generation.ts:~110-140): deletes inherited routingSummary; stamps session summary only when page matches tenant+sessionId+summary and a stamp exists; boundedSummary caps 768 bytes on a code-point boundary; parent summaries built from child summaries (max 8). session.ts:278-290 calls eligibleTreeInput before building the tree, then bindIndexTree.
Contract note: no qa/contracts clause names routingSummary literally. Applicable clauses: vectorless-tree-retrieval.md items 1-2 (source-derived routing summaries; never answer evidence). Covered at base by generation.test.ts lines 14-32 (inheritance deleted, foreign tenant refused, <=768 bytes) plus the new test (withdrawn / whatsapp-batch sources excluded).

## Non-vacuous control - VERIFIED
New test builds the tree from eligibleTreeInput output, passes ALL pages to bindIndexTree, asserts no marker leak, <=768 bytes, no U+FFFD, UTF-8 round-trip, summaries.length>=2. The control binds the unfiltered tree and asserts the marker DOES leak. Mutation 2 below confirms the test fails when filtering is removed.

## Commands (exit files in .chk/)
- eligible-tree.test.ts + generation.test.ts: tests 17 pass 17 fail 0, exit 0 (green.txt)
- tsc --noEmit -p apps/api/tsconfig.json: exit 0, no output (tsc.txt)
- Mutation 1 (generation.ts: 768 cap removed -> `if (false) break;`): KILLED, eligible-tree.test.ts 8/9, the new routingSummary test fails.
- Mutation 2 (eligible-tree.ts: return unfiltered `sessions, pages`): KILLED, 5 of 9 fail including the new test.
- Per-mutation byte backup + trap (EXIT/INT/TERM/ERR) + timeout 600; restored, cmp vs backup identical.
- HEAD fidelity: after restore, LF-normalized hash == HEAD blob for both files (eligible-tree.ts 5be833ac, generation.ts f86b1aa7). NOTE: lane working files are CRLF (i/lf w/crlf) so raw `git hash-object` differs and `git status` shows them M. Content is unchanged vs HEAD; the EOL state is a lane checkout artifact (backups taken before mutation are CRLF too) - not a candidate defect, not caused by the mutation content.
- MAIN leak check (`git -C KnowledgeBase status --porcelain -- apps/api/src/indexing qa/manifests/t008index.md`): empty, exit 0. MAIN has no t008index.md; its eligible-tree.test.ts is tracked and does not contain the new test. No leak.

## Not verified
packages/index lexical.test.ts (maker's 10/10 not rerun; unrelated to diff). No full suite, no browser, no live Mongo.

## Findings
None. ISSUES-WRITTEN: none
Ledger rows may be flipped for t008index (scoped test-only unit; does not close parent T-008).
