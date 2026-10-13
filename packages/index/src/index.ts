// @lkb/index — tree (vectorless, T-004 port; topic/org levels + regenerate added T-004b).
// eval/ (recall@k harness + heuristic retriever) added T-021. vector/ and graph/ land in
// their own tasks (D-003).
export { buildTree, treeIndexRootFilter, type Summarize } from "./tree/build.js";
export { treeSearch } from "./tree/search.js";
export { buildChunks, coversAllTurns, type ChunkPlan, type ChunkableTurn, type ChunkOptions } from "./chunk/build-chunks.js";
export { extractTopicRefs, type ExtractTopicRefs } from "./tree/extract-topics.js";
export { prepareTopicExtractFn, extractTopicsLlm, isLlmTopicsEnabled, topicPredictedEntities, type TopicsCompleteFn, type TopicExtraction } from "./tree/extract-topics-llm.js";
export { regenerate } from "./tree/regenerate.js";
export { promoteTreeEntities, topicRefsForSession, type PromotedEntities, type PromotedTopic, type PromotedOrg } from "./tree/promote-entities.js";
export { flattenTreeToGraph, type Graph, type GraphNode, type GraphEdge } from "./tree/flatten-graph.js";
export { buildKnowledgeGraph, type BuildKnowledgeGraphInput, type KnowledgeGraphSessionRef } from "./graph/build-graph.js";
export type { KnowledgeGraph, KnowledgeGraphNode, KnowledgeGraphEdge, KnowledgeGraphEvidence, KnowledgeGraphNodeKind, KnowledgeGraphSource, KnowledgeGraphStats } from "./graph/types.js";

export { cosineSimilarity, rankByCosine, rankSessionsByCosine, type ScorableChunk, type ScoredChunk } from "./vector/cosine.js";
export { createVectorRetriever, type VectorRetrieverOptions } from "./vector/retriever.js";

export { computeRecallAtK, type GoldenQuestion, type RetrieveFn, type RecallResult, type RecallMiss } from "./eval/recall.js";
export { createHeuristicRetriever } from "./eval/heuristic-retriever.js";
export { createNullRetriever, assessBaseline, type BaselineAssessment, type BaselineVerdict } from "./eval/baseline.js";

export { lexicalSearchTurns, lexicalQueryTokens, type LexicalHit, type SearchableTurn } from "./search/lexical.js";

export { runtimeChronologicalTurns, assertGroundedTurns, validateRuntimePage, runtimeEvidence, runtimeExtractive, runtimeEvidenceOrigin } from "./pipeline/grounded.js";
export { resolveEvidence, extractiveText, citationTimes, auditGroundedNotes } from "./pipeline/notes/evidence.js";
export type { DroppedNote } from "./pipeline/notes/drop-mode.js";
export { summarizeSession, type SessionSummaryResult, type SummarizeResult, type SummarizeCompleteFn } from "./pipeline/summarize.js";
export { extractClaims, type ExtractedClaim, type ClaimsCompleteFn } from "./pipeline/claims.js";
export { resolveSpeakers, personIdFor, type ResolvedSpeaker, type SpeakerResolution } from "./pipeline/speakers.js";
export { extractSpeakers, extractSpeakersRuleBased, type SpeakersCompleteFn, type SpeakerExtractionResult } from "./pipeline/speakers-llm.js";
export { groundSpeakerProposals, extractSpeakersGrounded, selectSuggestions, dropOverriddenByConfirmed, type ConfirmedSpeaker, type EvidenceKind, type SuggestedSpeaker, type RejectedSuggestion } from "./pipeline/speakers-grounded.js";
export { buildSuggestionDocs, suggestionId } from "./pipeline/speaker-suggestions.js";
export { buildTileSuggestionDocs, parseTileCapture, storeTileSuggestions, type InsertSuggestions, type TileSuggestionOptions } from "./pipeline/speaker-tile-suggestions.js";
export { llmVerifier, type SpeakerVerifier, type VerifierQuestion } from "./pipeline/speakers-verifier.js";
export { looksLikeAName, isDiscourseOnly, containsNameVerbatim, citesNameAsAnIntroduction } from "./pipeline/speaker-name-rules.js";
export { buildSpeakerDocs, writeSpeakerDocs, isHumanConfirmed, type SpeakerWriteTarget, type SessionResolution, type SpeakerCollision, type SpeakerDocsResult } from "./pipeline/speaker-docs.js";

export { buildSourceSlices, sourceSpanText, type SourceSpan, type SourceSlicePlan } from "./chunk/source-spans.js";
export { verifyQuote, verifyQuotes, normaliseForQuote, type QuoteSourceTurn, type ClaimedQuote, type QuoteVerdict, type QuoteLocation, type QuoteRefusal } from "./pipeline/quote/quote-verify.js";
export { windowTranscript, type WindowTurn, type WindowEntry, type TranscriptWindow, type WindowOptions } from "./pipeline/quote/transcript-windows.js";
