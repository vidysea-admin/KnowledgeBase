# Contract - t043-ask-webinar-citation-proof (T-043, Ask half, hermetic proof unit)

> Ground truth derived by the checker from docs/meeting-bot-roadmap.md:70 ("Index into the KB ... /ask across all
> webinars"; done-when a question about a webinar is answered with a citation from the session) and from the repo's
> tenant-isolation history (ISS-078). Scope: tests + fixture in `packages/ask/src/`. The unit does NOT complete T-043
> (live sync-session --index + real /ask is outside it); T-043 stays open.

## Criteria (each machine-checkable)

1. Multi-session retrieval: with three tenant-A sessions in the tree, askV2 (bounded source-context path) offers all
   three to the hydrator, and two different questions are answered from two different sessions.
2. Exact citation: the answer-grounding strip and the returned `sources.internal[].evidence` carry the fixture's exact
   session ref, turn id, speaker ref, tStart/tEnd and quote (deepEqual against the fixture), and only the matching
   session is a citation.
3. No scope widening, three seams: an arm returning a foreign node, a foreign node wearing a real node_id, a selector
   naming a foreign id, and a hydrator returning foreign quotes or a foreign node are each refused or neutralised
   (foreign node never reaches hydrator/result; hydrator violations raise BoundedAskError).
4. Bait containment: a higher-scoring tenant-B passage never appears in the result, audit log, job-ledger rows or any
   model prompt, and every job row carries the requesting tenant id.
5. Insufficient coverage: an off-corpus question yields `insufficient_coverage=true`, empty `sources.internal`, and no
   `ask.answer` generation.
6. Non-vacuity: single mutations of the production guards the tests claim to cover (arm resolve/membership, bounded
   re-resolve, validateHydration node and quote identity, hydration result use, citation tuple fields, speaker ref,
   evidence pass-through, threshold, insufficient-coverage flag, tenant stamping) are killed by the new test file. A
   surviving mutant is acceptable only if it is demonstrably redundant (covered by a second guard) or outside the
   unit's stated claims.
7. Fixture is synthetic: no sentence copied from `data/`, `qa/evidence/` or `docs/`; no real personal data.
8. Honest scope: the manifest states that tenant filtering is performed by apps/api (per-tenant tree, per-request arms,
   tenant-bound hydrator), not by packages/ask, and its "Not proven" list is accurate; an empty tenant cannot reach a
   store unscoped on the real apps/api path.
9. Neighbours and typecheck: source-context.test.ts, ask-v2.test.ts and `tsc --noEmit` for packages/ask pass.
10. Bounds: commit touches only `webinar-citation.test.ts`, `webinar-fixture.ts` and the manifest; no production source.
