# Contract — U0.10 honest real-LLM baseline

Independent checker: `/root/roadmap_status/checker_u010`.
Established: 2026-10-14. Priority: tier 3 roadmap, active ALL40 goal.

## Authority and scope

Sources: `TASKS.md` U0.10/T-021/T-022; `.goal/goal.json` U0.10;
`qa/contracts/golden-set-recall.md`, `evaluator-calibration.md`,
`eval-baseline-control.md`, `t022-calibration-human-review.md`;
`qa/gates/golden-set-redesign.md`; D-156 and D-164.
This contract combines existing whole-task requirements with independently derived
evidence conditions. It does not supersede approved decisions or lower acceptance.
D-156 ratifies the redesigned golden set and condition-4 baseline re-pointing.
D-164 authorizes existing-key model spend, Ollama Cloud GLM 5.3 Flash and DeepSeek
4.1 Flash first, Gemini last. It does not approve manufactured human references.

A source-scoped harness/audit/checkpoint PASS may establish completed engineering
criteria below. Whole-task U0.10 remains HOLD until actual real-provider recall
and genuine human-reference judge-agreement evidence are complete. Paid runs
require the orchestrator's resource lease, bounded calls and bounded time. Missing
provider access is a disclosed prerequisite, not evidence of successful execution.

## Full acceptance matrix

| ID | Acceptance | Required proof |
|---|---|---|
| A1 | State the exact evaluated algorithm and production seam. Exhaustive session ranking by `createLlmScorer` is distinct from `selectNodes` traversal, vector embeddings, hybrid retrieval, answer quality and the actual `/ask` route. | Entry point/caller map; relevant source hashes; report algorithm identity and explicitly bounded claims. Any claim of real production traversal requires that actual traversal to have been run. |
| A2 | Freeze the question population, selected IDs/order, expected sessions, candidate-session population, tenant scope and source inputs before scoring. Resolve each reference uniquely. | SHA-256/byte counts of golden set, provenance, session/page/tree inputs and evaluator prompt/source; current candidate IDs/count and question IDs/count. Reject missing, duplicate, contradictory or foreign inputs. A question-string map cannot silently merge distinct IDs. |
| A3 | Preserve approved Option C lineage and limitations. Different generator model/prompt from summarizer; raw transcript source; real student questions; near-neighbour distractors. | Existing generation provenance and independent diagnostics bound to the actual set; distinguish recorded-after-the-fact provenance from contemporaneous proof. State residual same-source leakage and unresolved sibling ambiguity. |
| A4 | Controls and comparisons use identical populations and algorithms. | Every recall score has its question-blind control, hits/denominator, misses and assessment beside it. Recompute control for a subset or changed candidate universe. Do not carry historical 0.217/23-session control into a different universe as its measured control. A 75-question/29-session score cannot be presented as a direct delta from the historical 92-question embedding score. |
| A5 | Approved redesign remedy remains falsifiable and honestly characterized. | Preserve gate conditions: recall strictly between 0.217 and 1.000 with nonzero misses for the approved remedy, near-verbatim diagnostics and turns-corpus pin rate well below historical 63%. D-156 already ratifies condition 4; no invented reapproval gate. New saturated redesign evidence is failure of the remedy, not proof of improvement. Model baselines below control are reported honestly, not adjusted to pass. |
| A6 | Each requested provider/model has actual generative-provider evidence, in the D-164 order. | Exact commands, dates, model IDs, provider and endpoint origin, jobKind, prompt hash, generation configuration, response/usage evidence, counts, terminal status, bounded-time result and immutable report path/hash. Existing Gemini embeddings are not a Gemini generative judge run. Fake transports prove code only. |
| A7 | Every selected item is accounted for, including partial work. | Questions available/selected/completely scored/unscored and their IDs; pairs available/selected/scored/unscored and IDs; per-question ranked top-k IDs, hit/miss and any fallback. Reconcile all identities and denominators. Count partially attempted questions/calls separately; never score an incomplete candidate ranking. Empty populations yield unavailable/null metrics, not successful zero-valued results. |
| A8 | Caps bind actual external calls and all retries; finite time bounds prevent an indefinite run. | Positive finite integer call cap, enforced before provider I/O; cancellation/deadline handling; attempted/success/failed/fallback counts and capReached/stopReason. Cost-only refusal stands while provider cost is reported as zero. Zero provider-reported cost is explicitly unpriced/unknown spend, not proof of free calls. |
| A9 | Fallback and provider failure are visible and cannot masquerade as pure LLM results. | Named affected question/pair IDs and aggregate counts; sanitized failure classes/reasons; top-level degraded/mixed warning; pure-provider and mixed metrics clearly separated when both are reported. A fallback anywhere in a ranked question contaminates that question's pure-LLM status. Partial, failed and mixed reports remain useful evidence, with disclosed limits. |
| A10 | Real baseline completion covers the selected full golden population and complete candidate rankings for the requested models. | All current golden questions, currently 92, fully accounted/scored for each model, or a separately authorized scoped task definition. Existing bounded 75/92 runs establish partial progress only. Checkpoint completion must recover full earlier ranks/scores/provenance or rerun; do not stitch a missing historical hit list from summary counts. No paid replay is required merely to PASS an explicitly source-scoped utility. |
| A11 | Calibration distinguishes derived, AI-drafted, synthetic and genuine human references. | Every report names reference class and binding source/hash. Existing own-session=1/other-session=0 calibration is DERIVED proxy even with a real provider. Agent draft or synthetic approval fixtures never count as human gold. |
| A12 | Human judge agreement uses the approved thirty-item intake and genuinely approved references. | Thirty neutral query/node items with current input bindings; finite approved score in [0,1], rationale, Umesh approval and date per item; verified source drift refusal; actual human-review evidence independent of software reviewer assertions. Export through the validated intake; consume exact exported references via `computeMAE` against actual LLM scorer. Pending null scores refuse before provider scoring or output export. |
| A13 | Calibration is reproducible and fully denominated without inventing a performance target. | For every pair: ID, predicted/reference scores, absolute error and provider/fallback status. Recompute MAE from details and reconcile n. Report all thirty scored pairs for full judge-agreement completion. No invented MAE pass threshold; no evaluator-threshold or routing tuning from proxy evidence. |
| A14 | Reports/checkpoints preserve evidence and bind resumed work to the same inputs and scorer. | Exclusive output ownership; collision refusal/no historical-report rewrite; versioned schema; source/config hashes; atomically persisted progress when checkpointing; duplicate/conflicting/foreign/drifted/corrupt resume refusal before paid calls. A completed item is skipped only from verified saved actual evidence. If resume is implemented, interruptions and cap stops preserve whole completed items and account for partial attempts. |
| A15 | Credentials, tenant isolation and production behavior remain safe. | No key values/auth headers/raw secret-bearing errors in logs, reports or packets; secret-safe tests. Provider configuration explicit to this eval process; no ambient cloud credential inheritance by local speaker path. No production Mongo/jobs writes, schema changes or default routing changes in this unit. Legitimate corpus egress is limited to D-164's existing authorized evaluation inputs. |
| A16 | Required verification establishes affected stage and downstream consumption on the checked bytes. | Focused fake-provider probes of exact paid path, cap boundaries, failures/fallbacks, empty/partial inputs, report arithmetic, corrupt/drift resume if applicable, neutral/pending human refusal and synthetic fractional export→MAE. Real sample scoring→report→independent audit consumption, exact command/duration/exit/counts/output path, `contracts/verify_contracts.py`, final hashes and relevant type/structure checks. Reuse attributed existing evidence when its bytes/cycle are verified. Full suites only by separate root lease. |

## Current evidence floor, not a verdict

The existing `u010harness` cycle-1 checked-PASS covers its source-scoped plumbing,
cap refusal and fallback disclosure. It does not close U0.10.

Read-only inspection on 2026-10-14 found:

- DeepSeek recall: 57/75 = 0.760; control 14/75 = 0.1867; 18 misses;
  92 selected, 75 fully scored, 17 unscored; 2200-call cap; zero recorded fallbacks.
- GLM recall: 56/75 = 0.7467; control 14/75 = 0.1867; 19 misses;
  92 selected, 75 fully scored, 17 unscored; 2200-call cap; one recorded fallback.
- Both capped recall runs use 29 candidate sessions (chance floor 5/29), while
  generation provenance's 23 sessions describes the historical generation corpus.
  These populations must be named separately. Historical Gemini embedding recall
  86/92 = 0.935 with control 20/92 = 0.217 is a separate instrument/population.
- DeepSeek/GLM 30-pair MAE 0.04767/0.044 is DERIVED-reference proxy calibration.
  It is not human judge agreement. The neutral human intake remains a genuine gate.

These observations are report contents, not independently replayed provider proof.
Historical files must remain untouched. Any new audit must label inferred historical
metadata as inferred and report unrecoverable provenance as unavailable.

## Checker disposition

An explicit source-scoped verdict lists covered A-criteria and whole-task gates.
Full task PASS requires all applicable A1–A16 with actual provider/reference proof;
missing required evidence is HOLD, a demonstrated acceptance violation is FAIL.
Maker cannot edit this contract or manufacture approvals to obtain PASS. Only the
checker issues PASS; the manifest/verdict cycle and final hashes must match.
Shared integration files and trackers remain owned by `/root/docker_runtime`.
