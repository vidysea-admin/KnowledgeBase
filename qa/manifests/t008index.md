# t008index
Status: ready-for-check
Fix cycle: 0
Base: 9e55b642
Candidate: see lane HEAD (code commit aa999d6d; this manifest is the following commit)
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-t008index (lane/w17-t008index)

## Finding
routingSummary population ALREADY exists at the base: `bindIndexTree` (apps/api/src/indexing/generation.ts) sets it from accepted session pages only (page/stamp/tenant match), truncated at a UTF-8 code-point boundary to 768 bytes, and rebuilds parent summaries from child summaries; input-tree values are deleted. Called from indexing/session.ts after `eligibleTreeInput` (visibility filter: consent withdrawn / whatsapp-batch / unapproved excluded). No production change was needed.

## Changed paths
- apps/api/src/indexing/eligible-tree.test.ts (new test: withdrawn consent and unapproved whatsapp-batch sources never reach routingSummary; every routingSummary <= 768 bytes, valid UTF-8; leaking control proves the assertion is not vacuous)
- qa/manifests/t008index.md
packages/index/src/search: no change (lexical.test.ts 10/10 green, no defects found).

## Checks for a checker
- apps/api: `node --test --import tsx src/indexing/eligible-tree.test.ts src/indexing/generation.test.ts`
- packages/index: `node --test --import tsx src/search/lexical.test.ts`
- Mutation suggestion: make bindIndexTree ignore the 768 limit, or feed unfiltered pages to the tree; the new test must fail.

## Evidence
- eligible-tree.test.ts + generation.test.ts: tests 17, pass 17, fail 0
- eligible-tree.test.ts alone after control added: pass 9, fail 0
- lexical.test.ts: tests 10, pass 10, fail 0
- Not run: mutation, typecheck.
