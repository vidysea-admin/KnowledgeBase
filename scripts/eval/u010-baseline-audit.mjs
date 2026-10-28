#!/usr/bin/env node
/** Independent report arithmetic; unavailable historical provenance stays unavailable. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, requireValue } from './u010-corpus.mjs';
import { loadSnapshot } from './u010-state.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function validateRun(state, corpus, configuration) {
  const { sha256, ...inputs } = corpus;
  requireValue(sha256 === hash(JSON.stringify(inputs)), 'corpus checksum mismatch');
  requireValue(Array.isArray(corpus.questions) && corpus.questions.length > 0 && new Set(corpus.questionIds).size === corpus.questionIds.length
    && same(corpus.questionIds, corpus.questions.map((q) => q.id)), 'invalid question population');
  requireValue(Array.isArray(corpus.nodes) && corpus.nodes.length > 0 && new Set(corpus.candidateIds).size === corpus.candidateIds.length
    && same(corpus.candidateIds, corpus.nodes.map((n) => n.sessionId)), 'invalid candidate population');
  requireValue(corpus.questions.every((q) => typeof q.query === 'string' && q.query.trim() && corpus.candidateIds.includes(q.expectedSessionId)), 'invalid expected question reference');
  if (configuration.kind === 'calibration') requireValue(corpus.references?.pairs.length === 30 && new Set(corpus.references.pairs.map((p) => p.id)).size === 30
    && corpus.references.pairs.every((p) => corpus.candidateIds.includes(p.sessionId) && Number.isFinite(p.referenceScore) && p.referenceScore >= 0 && p.referenceScore <= 1), 'invalid human reference population');
  requireValue(state?.format === 'u010-run-v1' && state.binding === hash(JSON.stringify({ corpus: corpus.sha256, configuration })), 'foreign/drifted checkpoint binding');
  requireValue(same(state.configuration, configuration) && same(state.corpus, corpus), 'checkpoint corpus/configuration changed');
  requireValue(Array.isArray(state.cells) && Array.isArray(state.attempts) && Array.isArray(state.invocations), 'corrupt checkpoint arrays');
  requireValue(typeof state.sourceDriftDetected === 'boolean', 'missing source-provenance disposition');
  const cellIds = new Set(), attemptIds = new Set();
  for (const attempt of state.attempts) {
    requireValue(Number.isSafeInteger(attempt.id) && attempt.id === attemptIds.size + 1, 'duplicate/nonsequential attempts');
    attemptIds.add(attempt.id);
    requireValue(['inflight', 'returned', 'failed', 'unknown'].includes(attempt.status), 'invalid attempt status');
    requireValue(typeof attempt.itemId === 'string' && (configuration.kind === 'recall' ? corpus.questionIds.includes(attempt.itemId)
      : corpus.references?.pairs.some((p) => p.id === attempt.itemId && p.sessionId === attempt.sessionId)), 'foreign attempt item');
    requireValue(corpus.candidateIds.includes(attempt.sessionId), 'foreign attempt candidate');
    requireValue(!('error' in attempt) && !('url' in attempt) && !('headers' in attempt), 'unsafe receipt fields');
    for (const key of ['costUsd', 'inputTokens', 'outputTokens', 'elapsedMs'])
      requireValue(attempt[key] === undefined || typeof attempt[key] === 'number' && Number.isFinite(attempt[key]) && attempt[key] >= 0, 'invalid receipt accounting');
  }
  for (const cell of state.cells) {
    const key = `${cell.itemId}\0${cell.sessionId}`;
    requireValue(!cellIds.has(key), 'duplicate score cell'); cellIds.add(key);
    requireValue(typeof cell.score === 'number' && Number.isFinite(cell.score) && cell.score >= 0 && cell.score <= 1 && typeof cell.fallback === 'boolean', 'invalid score cell');
    requireValue(Array.isArray(cell.attemptIds) && cell.attemptIds.length > 0, 'missing actual score receipts');
    requireValue(new Set(cell.attemptIds).size === cell.attemptIds.length, 'duplicate score receipt');
    for (const id of cell.attemptIds) {
      const attempt = state.attempts.find((a) => a.id === id);
      requireValue(attempt && attempt.itemId === cell.itemId && attempt.sessionId === cell.sessionId && attempt.status !== 'inflight' && attempt.status !== 'unknown', 'conflicting/incomplete score receipt');
    }
    requireValue(cell.fallback || cell.attemptIds.every((id) => state.attempts[id - 1].status === 'returned'), 'failed receipt presented as pure score');
    requireValue(corpus.candidateIds.includes(cell.sessionId), 'foreign score candidate');
    const question = corpus.questions.find((q) => q.id === cell.itemId), pair = corpus.references?.pairs.find((p) => p.id === cell.itemId);
    requireValue(configuration.kind === 'recall' ? question : pair?.sessionId === cell.sessionId, 'foreign score item');
  }
  requireValue(Number.isSafeInteger(state.sequence) && state.sequence >= 0, 'invalid snapshot sequence');
  return state;
}

function recallMetric(rows, corpus, k) {
  if (!rows.length) return { total: 0, recallAtK: null, controlRecallAtK: null, assessment: 'unavailable', misses: [] };
  const hits = rows.filter((r) => r.hit).length;
  const controlIds = corpus.candidateIds.slice(0, k);
  const controlHits = rows.filter((r) => controlIds.includes(r.expectedSessionId)).length;
  const recallAtK = hits / rows.length, controlRecallAtK = controlHits / rows.length;
  return { hits, total: rows.length, recallAtK, controlHits, controlRecallAtK, controlCandidateIds: controlIds,
    chanceFloor: Math.min(1, k / corpus.candidateIds.length), liftOverControl: recallAtK - controlRecallAtK,
    misses: rows.filter((r) => !r.hit).map((r) => r.id),
    assessment: recallAtK <= controlRecallAtK ? 'at-chance' : recallAtK === 1 ? 'saturated' : 'informative',
    approvedRemedyBand: recallAtK > 0.217 && recallAtK < 1 && hits < rows.length,
    warning: 'Model baseline is a separate instrument; remedy-band observation does not replace approved T-021 evidence or whole-task acceptance.' };
}

export function auditRun(state) {
  validateRun(state, state.corpus, state.configuration);
  const corpus = state.corpus, c = state.configuration;
  let rows, selectedIds;
  if (c.kind === 'recall') {
    selectedIds = corpus.questionIds;
    rows = corpus.questions.flatMap((question) => {
      const cells = state.cells.filter((cell) => cell.itemId === question.id);
      if (cells.length !== corpus.candidateIds.length) return [];
      const ranked = [...cells].sort((a, b) => b.score - a.score || (a.sessionId < b.sessionId ? -1 : 1));
      const topK = ranked.slice(0, c.k).map((cell) => cell.sessionId);
      return [{ id: question.id, expectedSessionId: question.expectedSessionId, topK, hit: topK.includes(question.expectedSessionId),
        fallback: cells.some((cell) => cell.fallback), scores: ranked }];
    });
  } else {
    requireValue(corpus.references?.pairs.length === 30, 'thirty approved human references required');
    selectedIds = corpus.references.pairs.map((pair) => pair.id);
    rows = corpus.references.pairs.flatMap((pair) => {
      const cell = state.cells.find((x) => x.itemId === pair.id && x.sessionId === pair.sessionId);
      return cell ? [{ id: pair.id, predicted: cell.score, reference: pair.referenceScore, absError: Math.abs(cell.score - pair.referenceScore), fallback: cell.fallback, attemptIds: cell.attemptIds }] : [];
    });
  }
  const scored = rows.map((row) => row.id), pure = rows.filter((row) => !row.fallback);
  const mae = (items) => ({ n: items.length, mae: items.length ? items.reduce((sum, item) => sum + item.absError, 0) / items.length : null });
  const attempts = state.attempts;
  const latencies = attempts.filter((a) => Number.isFinite(a.elapsedMs)).map((a) => a.elapsedMs).sort((a, b) => a - b);
  const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? null;
  const calls = { attempted: attempts.length, returned: attempts.filter((a) => a.status === 'returned').length,
    failed: attempts.filter((a) => a.status === 'failed').length, unknown: attempts.filter((a) => ['unknown', 'inflight'].includes(a.status)).length,
    fallbackCells: state.cells.filter((cell) => cell.fallback).length, providerReportedCostUsd: attempts.reduce((sum, a) => sum + (a.costUsd ?? 0), 0),
    spend: 'unpriced/unknown: zero provider-reported cost is not proof of free calls',
    inputTokens: attempts.reduce((sum, a) => sum + (a.inputTokens ?? 0), 0), outputTokens: attempts.reduce((sum, a) => sum + (a.outputTokens ?? 0), 0),
    usageUnavailableCalls: attempts.filter((a) => !a.usageAvailable).length, capReached: state.stopReason === 'call-cap',
    latencyMs: { n: latencies.length, mean: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null, p50: at(0.5), p95: at(0.95), max: at(1) } };
  const mixed = c.kind === 'recall' ? recallMetric(rows, corpus, c.k) : mae(rows);
  const pureProvider = c.kind === 'recall' ? recallMetric(pure, corpus, c.k) : mae(pure);
  return { format: 'u010-audit-v1', execution: c.execution, configuration: c, corpusSha256: corpus.sha256, stateSha256: hash(JSON.stringify(state)),
    sourceBindings: corpus.sources, candidateIds: corpus.candidateIds, historicalGenerationSessionCount: corpus.provenance.sessions,
    promptSha256: corpus.promptSha256, available: selectedIds.length, selectedIds, scoredIds: scored,
    unscoredIds: selectedIds.filter((id) => !scored.includes(id)), partiallyAttemptedIds: selectedIds.filter((id) => !scored.includes(id) && attempts.some((a) => a.itemId === id)),
    fallbackItemIds: [...new Set(state.cells.filter((cell) => cell.fallback).map((cell) => cell.itemId))],
    failedItemIds: [...new Set(attempts.filter((a) => a.status === 'failed').map((a) => a.itemId))], calls, mixed, pureProvider, rows,
    terminalStatus: state.stopReason, sourceDriftDetected: state.sourceDriftDetected,
    provenanceStatus: state.sourceDriftDetected ? 'invalid-source-drift' : 'bound-sources-verified',
    fullPopulationScored: scored.length === selectedIds.length, fullPurePopulationScored: pure.length === selectedIds.length,
    reportablePureBaseline: pure.length === selectedIds.length && !state.sourceDriftDetected,
    warning: calls.fallbackCells ? 'DEGRADED/MIXED: fallback-contaminated items are excluded from pure-provider metrics' : null,
    referenceClass: c.kind === 'calibration' ? 'individual human approval assertions; independent authenticity evidence still requires checker review' : 'approved Option C golden question references',
    wholeTaskStatus: 'HOLD: full ordered real-provider baselines plus genuine thirty-pair live human calibration require independent acceptance',
    limitations: corpus.limitations, invocations: state.invocations };
}

export function auditHistorical(bytes, path) {
  const r = JSON.parse(bytes.toString('utf8')), s = r.summary;
  requireValue(['recall', 'calibration'].includes(r.kind) && s, 'unsupported historical report');
  if (r.kind === 'recall') {
    requireValue(s.total > 0 && s.hits + s.misses === s.total && Math.abs(s.recallAtK - s.hits / s.total) < 1e-12, 'historical recall arithmetic mismatch');
    requireValue(r.questionsScored === s.total && r.questionsSelected === r.questionsScored + r.questionsNotScored, 'historical denominator mismatch');
    requireValue(r.report?.control?.recallAtK === s.controlRecallAtK, 'historical control mismatch');
  } else {
    requireValue(r.details?.length === s.n && s.n > 0 && Math.abs(r.details.reduce((sum, d) => sum + Math.abs(d.predicted - d.reference), 0) / s.n - s.mae) < 1e-12, 'historical MAE mismatch');
  }
  return { format: 'u010-historical-audit-v1', source: { path, bytes: bytes.length, sha256: hash(bytes) }, provider: r.provider, model: r.model,
    kind: r.kind, date: r.date, summary: s, selected: r.questionsSelected ?? r.pairsSelected, scored: r.questionsScored ?? r.pairsScored,
    unscored: r.questionsNotScored ?? r.pairsNotScored, fallbackCalls: r.calls.heuristicFallbacks,
    status: (r.questionsNotScored ?? r.pairsNotScored) > 0 ? 'PARTIAL' : 'FULL_REPORTED_POPULATION',
    referenceClass: r.kind === 'calibration' ? 'DERIVED proxy, NOT human gold' : 'historical golden references; hashes unavailable',
    evaluatedAlgorithm: 'exhaustive session relevance judge, NOT selectNodes traversal/embeddings/answer quality',
    unavailable: ['contemporaneous corpus/source/prompt hashes', 'complete ranked hit-question IDs', 'all unscored IDs', 'independent provider replay'],
    inferredCandidateCount: r.kind === 'recall' ? Math.round(5 / s.chanceFloor) : null,
    inferenceWarning: 'Candidate count inferred from reported chance floor; generation provenance count describes a different population. No historical stitching or direct delta to embedding baseline.',
    spend: 'unpriced/unknown', wholeTaskStatus: 'HOLD' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [input, output] = process.argv.slice(2);
    requireValue(input && output, 'usage: u010-baseline-audit.mjs <snapshot-or-historical.json> <NEW-output.json>');
    const bytes = readFileSync(resolve(input)), parsed = JSON.parse(bytes);
    const report = parsed.state || parsed.delta ? auditRun(loadSnapshot(dirname(resolve(input)), basename(input))) : auditHistorical(bytes, input);
    writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(`audit written; task ${report.wholeTaskStatus}`);
  } catch { console.error('audit refused: invalid input, arithmetic, checkpoint or output collision'); process.exitCode = 2; }
}
