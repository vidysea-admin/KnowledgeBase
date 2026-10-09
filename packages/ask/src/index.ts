// @lkb/ask — CRAG-style evaluator + router (T-005 port).
export { evaluate, UPPER_THRESHOLD, LOWER_THRESHOLD } from "./evaluator.js";
export type { ScoreFn, ScoreResult, Verdict, Scored, Evaluation } from "./evaluator.js";
export { ask } from "./router.js";
export type { AskResult, InternalSource, TreeSearchFn, WebFallbackFn, WebSource } from "./router.js";

// T-005b — the missing selectNodes -> evaluate -> refine -> answer pipeline (contract
// ask-router-v2.md), built on the exports above; none of them are modified or duplicated.
export { selectNodes, parseNodeIds } from "./select-nodes.js";
export type { CompleteFn, NodeSearchFn } from "./select-nodes.js";
export { refine, decompose, parseKeep } from "./refine.js";
export type { RefinableDoc } from "./refine.js";
export { answer } from "./answer.js";
export type { AnswerResult } from "./answer.js";
export { askV2 } from "./ask-v2.js";
export type { AskV2Deps, AskV2Result, AuditEntry } from "./ask-v2.js";

// T-022 — evaluator calibration harness (MAE against an injected ScoreFn, no I/O).
export { computeMAE } from "./eval/calibration.js";
export type { CalibrationPair, CalibrationDetail, CalibrationResult } from "./eval/calibration.js";
export { heuristicScorer } from "./eval/heuristic-scorer.js";

// Runtime-only bounded source hydration and production-caller boundaries.
export { BoundedAskError, SOURCE_LIMITS, payloadBytes, sourceCatalog, sourceQuotes, validateHydration, completionBudget } from "./source-context.js";
export type { SourceQuote, SourceHydration, HydrateSourcesFn, SourceContextDeps } from "./source-context.js";
