# Evaluator offline feasibility — cycle2

Candidate: 73299875b1da4b9bc8b2406cfce5179f4747e17ed5f07fc5fe5f51712186c52c
Status: source-frozen; broker7 pending; no reviewer dispatch or unitPASS. Priority tier3 U0.10 production pilot.

Only evaluator source/test pair changed. Explicit intent complete-answer computes a question-blind lower bound from the actual production sourceCatalog tree: shortest eligible session routing depth +one relevance score+answer+independent grounding per selected question. Insufficient or unreachable routing refuses before credential admission, checkpoint/provider creation or I/O. The public preflightEvaluation helper supports caller-side precredential checks; CLI calls it before process.env credential access. Additional candidates/refinement/retries may need more calls; lower-bound admission never guarantees answerability or quality.

Diagnostic-only intent permits bounded partial work. Absent intent preserves legacy grant/history behavior; old defaultPILOT/full92 caps, guards, corpus92 and controls unchanged. No lexical substitution. Known admission/deadline/authorization failure takes precedence over secondary model-output diagnostics, retaining last safe HTTP/finish metadata and providerStep.

Exact4new regressions +3adjacent invariants in broker-request.json. No selftests, production imports/builds or paid calls. Backups before.*. Existing requestIDs1–5, unknown lifetime usage and82.214s prior overrun retained; no grant2 rebind/replay authorized. Previous real-pilot authorization is now historical because sourcepair changed.

Ground truth: goal-u010 A1/A2/A8/A9/A14/A15/A16; contracts unchanged. Maker actual usage/time/cost unknown. Managed-review/1 packet remains draft pending complete readiness/startup/budget validation and independent verdict.
