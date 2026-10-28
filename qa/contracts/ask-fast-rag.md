# Contract — ask-fast-rag
Authority: D-203 (draft), quoted in qa/QUEUE.md row 0c. Approver: Umesh. Make POST /ask behave like a standard RAG chatbot.

## Acceptance criteria
- [C1] Default path (no filters.mode, or mode != "deep"): retrieve top-k chunks via the same retrieval /search uses (reuse, don't duplicate), then exactly ONE answer LLM call that cites chunks, plus at most ONE cheap grounding/evidence check. No section select, per-candidate LLM scoring, evaluator loop or refine on this path. Assert the LLM call count in a test with a fake provider (<=2 total).
- [C2] filters.mode="deep" runs the existing multi-step graph unchanged. Its existing tests stay green untouched.
- [C3] Response shape identical to today: {answer, verdict, reason, scored, web_used, insufficient_coverage, sources:{internal,web}}. Snapshot/shape test on both modes. Empty retrieval gives insufficient_coverage true with an honest answer and no hallucinated citation.
- [C4] Tenancy and auth unchanged. Retrieval is tenant-scoped exactly like /search. Add a test that a second tenant's chunk is never returned or cited.
- [C5] Web fallback: the default path calls the injected tavilySearchFn only when retrieval is empty/insufficient and filters.sources allows web, and never when sources=internal. Do NOT edit apps/api/src/composition/production.ts or ask-web-fallback.ts (another unit owns them).
- [C6] A total wall-clock deadline on the default path (configurable, default 20 s) returning a degraded answer instead of hanging.
- [C7] Known 0-sources bug (answer-workflow.ts:144-157 marks an answer "stale" and replaces sources with {internal:[],web:[]} when verification returns false). On the default path a fresh answer whose citations are valid internal chunks must ship those sources. A verification failure must surface its real reason in "reason" instead of silently wiping sources. Regression test: valid internal citations -> sources.internal non-empty.

## Invariants
- [I1] Tenant isolation unchanged: retrieval goes through createAskArmsFor / createSourceHydrator and the tenant-tree membership guard.
- [I2] No database writes, no schema change (mode is a request filter, never stored).
