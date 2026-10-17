# Same-question complete-answer pilot — proposed only

No paid call, source edit, import, test, DB or network operation is authorized/performed by this plan. Prior five provider requests and unknown lifetime usage remain immutable; the last two-request human grant is exhausted.

## Exact unchanged target and inputs

Question ID:2026-04-21-visa-blueprint-part2-italy-france-nz-gq01. Question-text SHA256484335769f0957e252b9ae16e6372953344f0b951845b1598abcc51be83611c1. Require data/eval/golden-set.json rawSHA25607e507d5b1b297c97242d3d4f727f66227267378a4a8806006e533aac78e94be; accepted92-ID-setSHA25649881f7e8f47896c9a104c908d089a15cf3fe5908ea7a69e6bff61cc31f526b6; candidate29/orderSHA256033745a6e7b31dd23300281355fc87d57a156885fd0b4e65918e32b1cd53752c. Rebind current production source pair, all approved raw input bytes, config and authorization; retain all92 controls. No easier question, RAG/lexical substitution or synthetic label.

Existing endpoint/model only:https://ollama.com/api/chat, glm-5.3-flash. Reuse the existing secret locally; never print it. Payload fields:model,stream:false,messages(role/content),options.num_predict. Scope is the same private question, bounded routing metadata and legitimately retrieved private evidence from the same approved29-session population, not full92 model execution. Original snapshots/audit/citations remain intact; additive safe receipts only.

## Structural bounds from current source

Tree:tenant/year/month/session. selectNodes performs at most3 rounds and chooses at most6 candidates; routingFrontier exposes at most48 nodes/24KiB per frontier. Scoring makes one completion per selected candidate, at most6, dispatched as one parallel score batch. Direct high-confidence evidence skips refinement; ambiguous evidence uses at most3 sequential16KiB refinement batches. Grounded answer then uses one answer completion and one independent grounding completion. Minimum supported path:3+1+0+1+1=6 calls. One-candidate refined normal path:3+1+3+1+1=9. Current SOURCE_LIMITS independently caps all completions at12, one job64KiB, aggregate job input256KiB, source context48KiB and start deadline240s. Cloud adapter has no automatic retry loop. Worst combinatorial6-candidate/3-refine path would need14 calls and legitimately refuses at existing12; this plan does not relax that guard or guarantee success.

Sources:packages/index/src/tree/build.ts; packages/ask/src/select-nodes.ts,tree-routing.ts,evaluator.ts,bounded-refine.ts,answer.ts,source-context.ts; packages/ai/src/providers/ollama-cloud.ts.

## Concrete proposed NEW finite grant (not currently approved)

One invocation/one question, intent:complete-answer. Maximum12 inference requests including every fallback/retry; no metadata calls, no blind retry or rerun. Reserve cumulative IDs6..17 in an exclusive fsynced quota ledger bound to the immutable prior1..5 ledger identities. Output<=768 per request, aggregate<=9216 reported output tokens. HTTP serialized input<=65536 UTF8bytes per request and<=327680(320KiB) aggregate; this covers the production256KiB job budget plus bounded provider JSON/schema/envelope overhead without sending whole corpus. Response<=1MiB per request. Observed input-token stop<=131072, unknown usage stops further dispatch; this is not a strict tokenizer-based guarantee. Price and monetary cost remain unknown.

HTTP deadline<=20s each. Scoring is parallel, so the long permitted normal sequential path is three routing stages+one scoring batch+three refine batches+answer+grounding=9 network waits, <=180s at20s each. Propose evaluation hard210s, outer verified Job Object hard240s including cold imports and finalization, retaining the existing production240s start guard. Slow provider/import/refinement/large-answer cases can still stop safely; no cap authorizes dropping guards, truncating sources or claiming a lower bound guarantees quality.

Before credential read/I/O: explicit complete-answer feasibility on actual production catalog must pass; preflight minimum remains6 and lower-bound-only. Verify exact raw corpus, question/ID set, model/endpoint, current source/config/auth and both prior ledgers. Refuse before payment on drift/expired grant. Preserve actual per-attempt HTTP/finish/stage/error/usage and real answer/citation evidence or legitimate abstention/refusal. Process exit0 alone is not completion or quality PASS; human semantic acceptance remains open.

## Why a source authorization extension is unavoidable

Legacy PILOT permits only3 attempts/256output/60s; FULL_CEILING output768 is usable only in full-population mode requiring all92 and a second verifier model. Existing named grant2 tier permits only2 attempts, is bound to the consumed grant2 artifact, and its cumulative ledger refuses reset. No current single-question real-provider configuration admits a complete-answer12-call plan. Do not reuse full92/offline mode, change IDs to bypass quota, or raise a generic ceiling. A separate root code lease would need an exact immutable complete-answer grant tier (or narrowly generalized equivalent) with these caps and cumulative IDs6..17, preserving legacy/default/full92 budgets and source guards. Source edits/fixture checks/independent readiness precede paid dispatch.

Pending root-obtained HUMAN approval must name:this same question/private retrieved evidence→existing OllamaCloud GLM; NEW max12 requests/768each/9216aggregate/320KiB input/20sHTTP/210sevaluation/240souter; original audit intact; unknown monetary cost; all old spend/unknowns preserved. Root requests approval after reviewing this plan. This lane does not ask for approval or start execution.
