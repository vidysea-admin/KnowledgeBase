# U2.3 — LLM topic extraction with regex fallback

Checker-owned acceptance contract. Roadmap tier 3; task U2.3 depends on U2.2.
This contract governs `goal-u23` and never promotes historical scoped PASSes.
Authoritative sources: TASKS.md U2.3, D-163, AGENTS.md, existing extractFn seam.

## Scoped source readiness

1. A current-cycle manifest/packet identifies every changed source/test/consumer,
   fixture, exact command/result and final SHA-256. A verdict certifies those bytes
   only; historical `u23topic` evidence is attributed preparation evidence.
2. Topic preparation uses the existing synchronous `ExtractTopicRefs` seam and
   feeds actual build/regenerate consumers. Root-owned production glue is separately
   evidenced; an unconnected helper cannot establish production integration.
3. Flag off/default preserves the regex extractor and tree behavior without model
   calls. Flag on precomputes per-page topics through the injected provider seam.
4. Bounded timeout, rejection, schema-invalid and all-ungrounded output fall back
   to regex. Valid empty arrays explicitly mean no topics. Accepted strings remain
   grounded in that page, bounded and deduplicated; degradation stays observable.
5. Tenant selection occurs before inference. Foreign tenant session/page/root input
   cannot reach another tenant's prompt/cache/tree or broaden persistence scope.
   Cache identity includes tenant and page; changed page text cannot reuse stale topics.
6. Fresh focused checks exercise the affected stage on source-bound sample data,
   fallback/error boundaries and immediate downstream tree construction/regeneration.
   Tenant/write boundaries receive independent probes. No production DB writes are
   authorized by this lane. Required frozen-contract validation must be evidenced.
7. Independent checker source review/probe and final unchanged hashes are required;
   maker tests alone and historical tests do not certify a new cycle.

## Full parent acceptance — remains gated

8. U2.2 must supply genuine item-by-item Umesh-approved, source-bound human topic
   gold and approved binding quality thresholds. AI drafts are never humanGold.
   Unreviewed precision/recall/omission values remain unknown/null, not passing zero.
9. The actual configured caller/provider path must run on the agreed real sample,
   with source/hash-bound quality and cost evidence judged against approved thresholds.
   Injected-provider tests certify mechanism only, not semantic/provider performance.
10. Canonical runtime integration, downstream consumption and any rollout/backfill
    need their own authorized current proofs. Existing targeting precondition U2.1b
    does not establish U2.2/U2.3 semantic acceptance or authorize live backfill here.

Scoped PASS closes only an unchanged goal-u23 source-readiness handshake satisfying
clauses 1–7. Full U2.3 stays HOLD while clauses 8–10 are unfulfilled. No labels,
thresholds, production writes, provider calls or whole-task completion are invented.
