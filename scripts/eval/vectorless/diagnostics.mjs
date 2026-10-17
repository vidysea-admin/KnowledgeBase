/** Fixed-vocabulary diagnostics: never serialize exception/model/source text. */
export function contentFreeDiagnostic(error, stage, attempt = null, outputLimit = null, failure = null) {
  const stages = ['runtime-import', 'tree-build', 'node-selection', 'relevance-scoring', 'evidence-refinement', 'answer-generation', 'answer-grounding', 'provider-output', 'source-hydration', 'source-guard', 'source-current-check', 'graph-execution'];
  let safeStage = stages.includes(stage) ? stage : 'graph-execution';
  let name = 'Error'; try { name = ['Error', 'TypeError', 'SyntaxError', 'AbortError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error'; } catch {}
  const finishReason = ['stop', 'length', 'load', 'unload'].includes(attempt?.providerFinishReason) ? attempt.providerFinishReason : attempt?.providerFinishReason === null || attempt?.providerFinishReason === undefined ? null : 'unknown';
  const outputCapObserved = Number.isSafeInteger(outputLimit) && Number.isSafeInteger(attempt?.outputTokens) ? attempt.outputTokens >= outputLimit : null;
  let code = 'unknown-error';
  if (failure === 'admission-budget' || failure === 'pilot-cumulative-budget-or-identity') { code = 'admission-budget-refusal'; safeStage = 'admission'; }
  else if (failure === 'deadline-or-cancelled') { code = 'deadline-or-cancelled'; safeStage = 'admission'; }
  else if (failure === 'authorization-drift-or-expiry') { code = 'authorization-refusal'; safeStage = 'admission'; }
  else if (['source-hydration', 'source-guard', 'source-current-check'].includes(safeStage)) code = 'source-guard-refusal';
  else if (attempt?.diagnostic?.code) code = ['provider-authorization-refused', 'provider-model-or-endpoint-not-found', 'provider-rate-limited', 'provider-http-refusal', 'provider-usage-unknown', 'provider-observed-token-limit', 'provider-response-too-large', 'transport-timeout', 'transport-failure'].includes(attempt.diagnostic.code) ? attempt.diagnostic.code : 'unknown-error';
  else if (['node-selection', 'relevance-scoring', 'evidence-refinement', 'answer-generation', 'answer-grounding', 'provider-output'].includes(safeStage)) code = finishReason === 'length' ? 'provider-output-truncated' : outputCapObserved ? 'provider-output-possibly-truncated' : name === 'SyntaxError' ? 'model-output-syntax' : 'model-output-validation';
  return { stage: safeStage, code, errorName: name, providerHttpStatus: Number.isInteger(attempt?.providerHttpStatus) && attempt.providerHttpStatus >= 100 && attempt.providerHttpStatus <= 599 ? attempt.providerHttpStatus : null, providerFinishReason: finishReason, outputCapObserved };
}
