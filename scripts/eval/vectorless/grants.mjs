/** Shared constants, config validation and run-authorization checks for vectorless-production-eval.mjs. */
import { readFileSync, existsSync, writeFileSync, unlinkSync, openSync, closeSync, writeSync, fsyncSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
export const PILOT = Object.freeze({ maxAttempts: 3, maxSeconds: 60, callTimeoutMs: 20000, maxInputBytes: 131072,
  maxRequestBytes: 65536, maxResponseBytes: 1048576, outputLimit: 256, maxKnownInputTokens: 32768, maxKnownOutputTokens: 768 });
// Capability ceilings only: an immutable per-run root authorization must approve the actual limits.
export const FULL_CEILING = Object.freeze({ maxAttempts: 1104, maxSeconds: 21600, callTimeoutMs: 30000, maxInputBytes: 24117248,
  maxRequestBytes: 65536, maxResponseBytes: 1048576, outputLimit: 768, maxKnownInputTokens: 4000000, maxKnownOutputTokens: 847872 });

export const GRANT2_TIER = 'root-bound-single-question-grant2-v1';
export const GRANT2_ID = 'root-ollama-grant2-same-question-20261015';
const GRANT2_QUESTION = '2026-04-21-visa-blueprint-part2-italy-france-nz-gq01';
export const GRANT2_CEILING = Object.freeze({ maxAttempts: 2, maxSeconds: 60, callTimeoutMs: 25000, maxInputBytes: 32000,
  maxRequestBytes: 32000, maxResponseBytes: 1048576, outputLimit: 1024, maxKnownInputTokens: 32768, maxKnownOutputTokens: 2048 });
const GRANT2_BASE = 'qa/coordination/resume-20261015/eval-pilot';

export const COMPLETE_TIER = 'root-bound-complete-answer-v1';
export const COMPLETE_ID = 'root-ollama-complete-answer-same-question-20261015';
export const COMPLETE_CEILING = Object.freeze({ maxAttempts: 12, maxSeconds: 210, callTimeoutMs: 20000, maxInputBytes: 327680,
  maxRequestBytes: 65536, maxResponseBytes: 1048576, outputLimit: 768, maxKnownInputTokens: 131072, maxKnownOutputTokens: 9216 });
/** This exact grant is inert until explicit human approval is persisted; pending proposals are never authority. */
export function validateCompleteAuthorization(path, corpus, config, now = Date.now(), root = ROOT) {
  validateConfig(config);
  requireValue(config.execution === 'real-provider' && config.grant?.tier === COMPLETE_TIER, 'complete-answer explicit tier required');
  requireValue(typeof path === 'string' && resolve(path) === resolve(root, GRANT2_BASE, 'complete-answer/authorization.approved.json'), 'complete-answer canonical approved authorization path required');
  const raw = readFileSync(path), approval = JSON.parse(raw.toString('utf8'));
  requireValue(approval.approvalState === 'approved' && typeof approval.humanApprovalReference === 'string' && approval.humanApprovalReference.trim()
    && (resolve(root) !== ROOT || approval.syntheticFixture !== true), 'complete-answer awaiting human approval');
  const baselinePaths = ['receipt.remaining-probe.json', 'provider-request-ledger.jsonl', 'grant2/provider-request-reservations.jsonl', 'grant2/actual-receipt.json'];
  const baseline = baselinePaths.map(p => readFileSync(resolve(root, GRANT2_BASE, p)));
  const oldRows = baseline[1].toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(r => r.event === 'reserved');
  const newRows = baseline[2].toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const oldReceipt = JSON.parse(baseline[0]), receipt = JSON.parse(baseline[3]);
  requireValue(digest(oldRows.map(r => r.id)) === digest([1, 2, 3]) && digest(newRows.map(r => r.id)) === digest([4, 5])
    && newRows.every(r => r.event === 'reserved') && oldReceipt.totalProviderRequestsReserved === 3
    && receipt.cumulativeProviderRequests === 5 && receipt.actualNewProviderCalls === 2 && receipt.questionId === GRANT2_QUESTION
    && receipt.model === config.model, 'complete-answer immutable prior five requests required');
  const question = corpus.questions.find(q => q.id === GRANT2_QUESTION);
  const rawCorpus = corpus.bindings.find(b => b.path === 'data/eval/golden-set.json');
  requireValue(approval.format === 'vectorless-complete-answer-authorization-v1' && approval.authority === 'root-explicit-run-budget'
    && approval.actor === 'root acting on explicit user-approved Ollama goal' && approval.id === COMPLETE_ID && approval.id === config.grant.id
    && approval.tier === COMPLETE_TIER && approval.scope === config.grant.scope && approval.questionId === GRANT2_QUESTION
    && [...corpus.questions].map(q => q.id).sort()[0] === approval.questionId && approval.questionSha256 === digest(question?.question)
    && corpus.questions.length === 92 && corpus.candidateIds.length === 29 && approval.acceptedIdsSha256 === digest(corpus.questions.map(q => q.id).sort())
    && approval.candidateIdsSha256 === digest(corpus.candidateIds) && rawCorpus?.sha256 === approval.rawCorpusSha256
    && approval.rawCorpusSha256 === '07e507d5b1b297c97242d3d4f727f66227267378a4a8806006e533aac78e94be'
    && approval.endpoint === 'https://ollama.com/api/chat' && approval.model === config.model
    && approval.corpusSha256 === corpus.sha256 && approval.sourceCandidateSha256 === sourcePairIdentity() && approval.configSha256 === digest(config)
    && digest(approval.baselineHashes) === digest(baseline.map(digest)) && approval.firstRequestId === 6 && approval.lastRequestId === 17
    && approval.hardOuterSeconds === 240 && approval.usagePolicy === 'observed-tokens-stop-on-unknown-no-strict-input-token-cap'
    && Number.isFinite(Date.parse(approval.approvedAt)) && Date.parse(approval.approvedAt) <= now
    && Number.isFinite(Date.parse(approval.expiresAt)) && Date.parse(approval.expiresAt) > now
    && Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) <= 86400000, 'missing expired or mismatched complete-answer authorization');
  return { sha256: digest(raw), expiresAt: approval.expiresAt, tier: COMPLETE_TIER,
    ledgerPath: resolve(root, GRANT2_BASE, 'complete-answer/provider-request-reservations.jsonl'), checkpointDirectory: resolve(root, GRANT2_BASE, 'complete-answer/checkpoint'),
    configSha256: digest(config), corpusSha256: corpus.sha256, sourceCandidateSha256: sourcePairIdentity(), maxAttempts: config.limits.maxAttempts, priorRequests: 5, cumulativeCeiling: 17 };
}

/** Only the named root grant can use this tier; structural validation is not run authorization. */
export function validatePilotAuthorization(path, corpus, config, now = Date.now(), root = ROOT) {
  validateConfig(config);
  requireValue(config.execution === 'real-provider' && config.mode !== 'full-population' && config.grant?.tier === GRANT2_TIER,
    'grant2 authorization only applies to its explicit pilot tier');
  requireValue(typeof path === 'string' && resolve(path) === resolve(root, GRANT2_BASE, 'grant2/authorization.json'), 'grant2 canonical authorization path required');
  const raw = readFileSync(path), approval = JSON.parse(raw.toString('utf8'));
  const priorRaw = readFileSync(resolve(root, GRANT2_BASE, 'receipt.remaining-probe.json'));
  const priorLedgerRaw = readFileSync(resolve(root, GRANT2_BASE, 'provider-request-ledger.jsonl'));
  const prior = JSON.parse(priorRaw.toString('utf8'));
  const priorReservations = priorLedgerRaw.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(row => row.event === 'reserved');
  requireValue(prior.totalProviderRequestsReserved === 3 && prior.remainingProviderRequests === 0 && prior.questionId === GRANT2_QUESTION
    && prior.selectedModel === config.model && prior.inferenceHttpStatus === 200 && prior.modelAccessConfirmedByActualInference === true
    && digest(priorReservations.map(row => row.id)) === digest([1, 2, 3]), 'grant2 prior request/model identity mismatch');
  requireValue(approval.format === 'vectorless-pilot-grant2-authorization-v1' && approval.authority === 'root-explicit-run-budget'
    && approval.actor === 'root acting on explicit user-approved Ollama goal' && approval.id === GRANT2_ID && approval.id === config.grant.id
    && approval.scope === 'single-question-pilot-grant2' && approval.scope === config.grant.scope && approval.tier === GRANT2_TIER
    && approval.questionId === GRANT2_QUESTION && approval.questionId === config.questionIds[0]
    && [...corpus.questions].map(q => q.id).sort()[0] === approval.questionId && approval.model === config.model
    && approval.corpusSha256 === corpus.sha256 && approval.sourceCandidateSha256 === sourcePairIdentity() && approval.configSha256 === digest(config)
    && approval.baselineReceiptSha256 === digest(priorRaw) && approval.baselineLedgerSha256 === digest(priorLedgerRaw)
    && approval.usagePolicy === 'observed-tokens-stop-on-unknown-no-strict-input-token-cap' && typeof approval.evidenceReference === 'string' && approval.evidenceReference.trim()
    && Number.isFinite(Date.parse(approval.approvedAt)) && Date.parse(approval.approvedAt) <= now
    && Number.isFinite(Date.parse(approval.expiresAt)) && Date.parse(approval.expiresAt) > now
    && Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) <= 86400000, 'missing expired or mismatched root grant2 authorization');
  return { sha256: digest(raw), expiresAt: approval.expiresAt, tier: GRANT2_TIER,
    ledgerPath: resolve(root, GRANT2_BASE, 'grant2/provider-request-reservations.jsonl'), checkpointDirectory: resolve(root, GRANT2_BASE, 'grant2/checkpoint'), configSha256: digest(config), corpusSha256: corpus.sha256,
    sourceCandidateSha256: sourcePairIdentity(), maxAttempts: config.limits.maxAttempts, priorRequests: 3, cumulativeCeiling: 5 };
}
/** Fsynced, exclusive reservations count crashes/unknown outcomes and never reset across directories or retries. */
export function reservePilotAttempt(authorization, config, inputBytes) {
  const prior = authorization?.tier === GRANT2_TIER ? 3 : authorization?.tier === COMPLETE_TIER ? 5 : null;
  const ceiling = prior === 3 ? 5 : prior === 5 ? 17 : null;
  requireValue(prior !== null && authorization.tier === config.grant?.tier && authorization.configSha256 === digest(config)
    && authorization.maxAttempts === config.limits.maxAttempts && authorization.priorRequests === prior && authorization.cumulativeCeiling === ceiling, 'grant2 reservation binding mismatch');
  requireValue(Number.isSafeInteger(inputBytes) && inputBytes > 0 && inputBytes <= config.limits.maxRequestBytes, 'grant2 finite request bytes required');
  const lock = authorization.ledgerPath + '.lock'; writeFileSync(lock, 'owned', { flag: 'wx', mode: 0o600 });
  try {
    const rows = existsSync(authorization.ledgerPath) ? readFileSync(authorization.ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
    requireValue(rows.every((row, i) => row.event === 'reserved' && row.id === prior + 1 + i && row.grantSha256 === authorization.sha256
      && row.configSha256 === authorization.configSha256 && row.corpusSha256 === authorization.corpusSha256 && row.sourceCandidateSha256 === authorization.sourceCandidateSha256
      && Number.isSafeInteger(row.inputBytes) && row.inputBytes > 0 && row.outputReservation === config.limits.outputLimit), 'grant2 cumulative ledger identity mismatch');
    requireValue(rows.length < authorization.maxAttempts && authorization.priorRequests + rows.length < authorization.cumulativeCeiling, 'grant2 cumulative request budget exhausted');
    requireValue(rows.reduce((sum, row) => sum + row.inputBytes, 0) + inputBytes <= config.limits.maxInputBytes
      && rows.reduce((sum, row) => sum + row.outputReservation, 0) + config.limits.outputLimit <= config.limits.maxKnownOutputTokens, 'grant2 cumulative byte/output budget exhausted');
    const row = { event: 'reserved', id: prior + 1 + rows.length, inputBytes, outputReservation: config.limits.outputLimit, grantSha256: authorization.sha256, configSha256: authorization.configSha256,
      corpusSha256: authorization.corpusSha256, sourceCandidateSha256: authorization.sourceCandidateSha256, reservedAt: new Date().toISOString(), usage: null };
    const fd = openSync(authorization.ledgerPath, 'a', 0o600);
    try { writeSync(fd, JSON.stringify(row) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    return row.id;
  } finally { unlinkSync(lock); }
}

export function validateConfig(config) {
  requireValue(['offline-fixture', 'real-provider'].includes(config.execution), 'explicit execution classification required');
  requireValue(config.intent === undefined || ['diagnostic-only', 'complete-answer'].includes(config.intent), 'explicit valid evaluation intent required');
  for (const key of Object.keys(PILOT)) requireValue(Number.isSafeInteger(config.limits?.[key]) && config.limits[key] > 0, `finite positive ${key} required`);
  requireValue(config.model === 'glm-5.3-flash' || config.model === 'deepseek-v4.1-flash', 'unknown model');
  requireValue(Array.isArray(config.questionIds) && config.questionIds.length && new Set(config.questionIds).size === config.questionIds.length, 'explicit distinct selected IDs required');
  requireValue(config.mode === undefined || ['pilot', 'full-population'].includes(config.mode), 'unknown evaluation mode');
  if (config.mode === 'full-population') requireValue(config.questionIds.length === 92 && config.model === 'glm-5.3-flash'
    && config.verifierModel === 'deepseek-v4.1-flash' && Object.keys(FULL_CEILING).every(k => config.limits[k] <= FULL_CEILING[k]), 'full population/model/capability ceiling mismatch');
  if (config.grant?.tier !== undefined) requireValue([GRANT2_TIER, COMPLETE_TIER].includes(config.grant.tier) && config.execution === 'real-provider' && config.mode !== 'full-population', 'unknown or misplaced pilot tier');
  if (config.execution === 'real-provider') {
    requireValue(config.dispatchReal === true && config.grant?.id?.trim(), 'explicit root pilot grant or full-population grant required');
    if (config.mode === 'full-population') requireValue(config.grant.scope === 'full-population', 'full-population grant required');
    else if (config.grant.tier === GRANT2_TIER) {
      requireValue(config.grant.id === GRANT2_ID && config.grant.scope === 'single-question-pilot-grant2' && config.questionIds.length === 1
        && config.questionIds[0] === GRANT2_QUESTION && config.model === 'glm-5.3-flash' && config.verifierModel === undefined, 'explicit root grant2 pilot identity required');
      requireValue(Object.keys(GRANT2_CEILING).every(k => config.limits[k] <= GRANT2_CEILING[k]), 'grant2 pilot ceiling exceeded');
    }
    else if (config.grant.tier === COMPLETE_TIER) {
      requireValue(config.grant.id === COMPLETE_ID && config.grant.scope === 'single-question-complete-answer' && config.intent === 'complete-answer'
        && config.questionIds.length === 1 && config.questionIds[0] === GRANT2_QUESTION && config.model === 'glm-5.3-flash' && config.verifierModel === undefined, 'explicit complete-answer pilot identity required');
      requireValue(Object.keys(COMPLETE_CEILING).every(k => config.limits[k] <= COMPLETE_CEILING[k]), 'complete-answer pilot ceiling exceeded');
    }
    else { requireValue(config.grant.scope === 'single-question-pilot' && config.questionIds.length === 1 && config.model === 'glm-5.3-flash', 'explicit root pilot grant required');
      requireValue(Object.keys(PILOT).every(k => config.limits[k] <= PILOT[k]), 'pilot ceiling exceeded'); }
  }
}
export const sourcePairIdentity = () => digest(['scripts/eval/vectorless-production-eval.mjs', 'scripts/eval/vectorless-production-eval.test.mjs']
  .map(path => ({ path, sha256: digest(readFileSync(resolve(ROOT, path))) })));
export function validateAuthorization(path, corpus, config, now = Date.now()) {
  const raw = readFileSync(path), approval = JSON.parse(raw.toString('utf8'));
  requireValue(approval.format === 'vectorless-run-authorization-v1' && approval.authority === 'root-explicit-run-budget'
    && approval.id === config.grant?.id && approval.evidenceReference?.trim() && approval.usagePolicy === 'observed-tokens-stop-on-unknown-no-strict-input-token-cap'
    && approval.corpusSha256 === corpus.sha256 && approval.sourceCandidateSha256 === sourcePairIdentity()
    && approval.configSha256 === digest(config) && Number.isFinite(Date.parse(approval.approvedAt)) && Date.parse(approval.approvedAt) <= now
    && Number.isFinite(Date.parse(approval.expiresAt)) && Date.parse(approval.expiresAt) > now
    && Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt) <= 86400000, 'missing, expired or mismatched explicit persisted run authorization');
  return { sha256: digest(raw), expiresAt: approval.expiresAt };
}
