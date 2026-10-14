# Verdict — u23topic

**Cycle checked:** 0
**Commit under check:** 594a4569 (lane/u23topic)
**Contract:** none for U2.3 (qa/contracts/entity-promotion.md scopes U2.3 out); graded against the manifest and TASKS.md U2.3 ("keep the regex heuristic as degradation fallback").

## VERDICT: PASS

## EXPLANATION
- Flag-off identity: LKB_LLM_TOPICS defaults OFF (only "1" enables). Off, `prepareTopicExtractFn` returns `extractTopicRefs` itself (reference-equal) and never calls the model; buildTree JSON output is identical to the default path (tested). Removing the early return was killed.
- Grounding: every topic must be a non-empty string of at most 80 chars that appears (case-insensitive) in the page's own summary/keyInsights, deduped, capped at 6. A topic injected through page text can only be a phrase already in that page; an invented topic is dropped, and all-ungrounded output falls back to the heuristic.
- Timeout and fallback: error, timeout (30 s default, injectable; tested at 20 ms), schema-invalid and all-ungrounded output all return the heuristic result with a reason; extractTopicsLlm never throws. Removing the timeout was killed.
- Tenant scoping: input is the single page, the prompt carries no tenant id (tested), and the cache key is tenantId+page _id; a same-id page in another tenant is never served (cache key mutation killed). Stale page text also falls back.
- No quality claim and no gold invented; acceptance waits on U2.2 labels (manifest says so). Callers are not yet wired to the prepared extractor, so the flag has no production effect yet (stated in the manifest).
- Suites: packages/index 649/649 pass; tsc exit 0; lint-loc and lint:structure OK (10 stages, 0 failed).
- Mutations (hash-verified, restored, blob equals HEAD 1f48dd9b): 7/7 killed (no grounding, flag-off still runs, cache key drops tenant, timeout removed, stale text ignored, no dedupe, flag value).
- Merge: judge.test.ts conflicts with lane u25decisions (same pinned-map line); ai-routing.yaml and index.ts auto-merge (git merge-tree). Resolution: keep `decisions: [...]` in the map line and `&& k !== "topics"` in the filter. docs/SNAPSHOT.md should be regenerated after merge (node scripts/snapshot.mjs).
- Notes (not backlog): grounding is substring, not word-boundary (a short topic can match inside a longer word); an empty array from the model is honoured as "no topics", not a fallback.

ISSUES-WRITTEN: none
