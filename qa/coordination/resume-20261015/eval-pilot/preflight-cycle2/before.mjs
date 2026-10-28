#!/usr/bin/env node
/** Production graph evaluation; CLI inspects only. Live dispatch requires an explicit API grant. */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync, openSync, closeSync, writeSync, fsyncSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const bytes = value => Buffer.byteLength(JSON.stringify(value));
export const PILOT = Object.freeze({ maxAttempts: 3, maxSeconds: 60, callTimeoutMs: 20000, maxInputBytes: 131072,
  maxRequestBytes: 65536, maxResponseBytes: 1048576, outputLimit: 256, maxKnownInputTokens: 32768, maxKnownOutputTokens: 768 });
// Capability ceilings only: an immutable per-run root authorization must approve the actual limits.
export const FULL_CEILING = Object.freeze({ maxAttempts: 1104, maxSeconds: 21600, callTimeoutMs: 30000, maxInputBytes: 24117248,
  maxRequestBytes: 65536, maxResponseBytes: 1048576, outputLimit: 768, maxKnownInputTokens: 4000000, maxKnownOutputTokens: 847872 });
const CODE = ['scripts/eval/vectorless-production-eval.mjs', 'packages/ask/src/ask-v2.ts', 'packages/ask/src/ask-graph.ts',
  'packages/ask/src/ask-shared.ts', 'packages/ask/src/select-nodes.ts', 'packages/ask/src/tree-routing.ts',
  'packages/ask/src/source-context.ts', 'packages/ask/src/router.ts', 'packages/ask/src/evaluator.ts',
  'packages/ask/src/bounded-refine.ts', 'packages/ask/src/answer.ts', 'apps/api/src/score.ts',
  'apps/api/src/ask/source-context.ts', 'apps/api/src/ask/passage-lexical.ts', 'apps/api/src/visibility/knowledge.ts',
  'apps/api/src/transcript-review/effective-reader.ts', 'packages/ai/src/providers/ollama-cloud.ts',
  'packages/index/src/tree/build.ts', 'packages/index/src/tree/search.ts', 'packages/index/src/search/lexical.ts',
  'packages/index/src/eval/baseline.ts'];
export function freezeInputs(root = ROOT) {
  const bindings = [], load = (path, json = true) => {
    const raw = readFileSync(resolve(root, path)); bindings.push({ path, bytes: raw.length, sha256: digest(raw) });
    return json ? JSON.parse(raw.toString('utf8')) : raw;
  };
  const questions = load('data/eval/golden-set.json');
  for (const path of ['data/eval/golden-set-provenance.json', 'data/eval/golden-set-diagnostics.json', ...CODE]) load(path, false);
  requireValue(questions.length === 92 && new Set(questions.map(q => q.id)).size === 92, 'need accepted 92 distinct question IDs');
  const sessions = [], pages = [], turns = [], sources = [];
  for (const entry of readdirSync(resolve(root, 'data/toc-migrated'), { withFileTypes: true }).filter(x => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const prefix = `data/toc-migrated/${entry.name}`;
    const present = ['session.json', 'session_page.json'].map(p => existsSync(resolve(root, prefix, p)));
    if (present.every(x => !x)) continue;
    requireValue(present.every(Boolean), 'incomplete session/page pair');
    const [session, page, rows, source] = ['session.json', 'session_page.json', 'turns.json', 'source.json'].map(p => load(`${prefix}/${p}`));
    requireValue(session._id === entry.name && session.tenantId === 'toc' && page.tenantId === 'toc' && page.sessionId === session._id
      && source.tenantId === 'toc' && source._id === session.sourceId && source.kind !== 'whatsapp-batch'
      && source.consent?.given === true && Array.isArray(rows) && rows.every(t => t.tenantId === 'toc' && t.sessionId === session._id), 'foreign/unapproved source identity');
    sessions.push(session); pages.push(page); turns.push(...rows); sources.push(source);
  }
  const candidateIds = sessions.map(s => s._id);
  requireValue(new Set(candidateIds).size === candidateIds.length && candidateIds.length > 0
    && new Set(turns.map(t => t._id)).size === turns.length, 'duplicate or empty source identities');
  requireValue(questions.every(q => typeof q.question === 'string' && q.question.trim() && candidateIds.includes(q.expectedSessionId)), 'unresolved question');
  return { format: 'vectorless-inputs-v1', tenantId: 'toc', questions, sessions, pages, turns, sources, candidateIds, bindings,
    sha256: digest({ questions, candidateIds, bindings }) };
}
export function bindingsMatch(root, corpus) {
  return corpus.bindings.every(b => { try { const raw = readFileSync(resolve(root, b.path)); return raw.length === b.bytes && digest(raw) === b.sha256; } catch { return false; } });
}
/** Read-only exact-match collection adapter; unknown predicates/collections fail closed. */
export function frozenDb(corpus) {
  const collections = { sessions: corpus.sessions, sources: corpus.sources, turns: corpus.turns, transcript_reviews: [], whatsapp_candidates: [] };
  return { collection(name) {
    requireValue(Object.hasOwn(collections, name), 'collection outside frozen source inventory');
    const find = filter => {
      requireValue(filter.tenantId === corpus.tenantId, 'tenant required before read');
      return collections[name].filter(row => Object.entries(filter).every(([key, value]) => {
        requireValue(['tenantId', '_id', 'sessionId', 'sourceId'].includes(key), 'unsupported predicate');
        return value && typeof value === 'object' ? Object.keys(value).join() === '$in' && Array.isArray(value.$in) && value.$in.includes(row[key]) : row[key] === value;
      }));
    };
    return { find: filter => ({ toArray: async () => structuredClone(find(filter)) }), findOne: async filter => structuredClone(find(filter)[0] ?? null) };
  } };
}
export async function productionRuntime() {
  const { register } = await import('tsx/esm/api'); register();
  const [graph, tree, search, hydration, scorer, lexical, baseline, cloud] = await Promise.all([
    import('../../packages/ask/src/ask-v2.ts'), import('../../packages/index/src/tree/build.ts'), import('../../packages/index/src/tree/search.ts'),
    import('../../apps/api/src/ask/source-context.ts'), import('../../apps/api/src/score.ts'), import('../../packages/index/src/search/lexical.ts'),
    import('../../packages/index/src/eval/baseline.ts'), import('../../packages/ai/src/providers/ollama-cloud.ts')]);
  return { ask: graph.askV2, buildTree: tree.buildTree, treeSearch: search.treeSearch, hydrate: hydration.createSourceHydrator,
    scorer: scorer.createLlmScorer, lexical: lexical.lexicalSearchTurns, nullRetriever: baseline.createNullRetriever, assessBaseline: baseline.assessBaseline, Cloud: cloud.OllamaCloudProvider };
}
/** Fixed-vocabulary diagnostics: never serialize exception/model/source text. */
export function contentFreeDiagnostic(error, stage, attempt = null, outputLimit = null) {
  const stages = ['runtime-import', 'tree-build', 'node-selection', 'relevance-scoring', 'evidence-refinement', 'answer-generation', 'answer-grounding', 'provider-output', 'source-hydration', 'source-guard', 'source-current-check', 'graph-execution'];
  const safeStage = stages.includes(stage) ? stage : 'graph-execution';
  let name = 'Error'; try { name = ['Error', 'TypeError', 'SyntaxError', 'AbortError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error'; } catch {}
  const finishReason = ['stop', 'length', 'load', 'unload'].includes(attempt?.providerFinishReason) ? attempt.providerFinishReason : attempt?.providerFinishReason === null || attempt?.providerFinishReason === undefined ? null : 'unknown';
  const outputCapObserved = Number.isSafeInteger(outputLimit) && Number.isSafeInteger(attempt?.outputTokens) ? attempt.outputTokens >= outputLimit : null;
  let code = 'unknown-error';
  if (['source-hydration', 'source-guard', 'source-current-check'].includes(safeStage)) code = 'source-guard-refusal';
  else if (attempt?.diagnostic?.code) code = ['provider-authorization-refused', 'provider-model-or-endpoint-not-found', 'provider-rate-limited', 'provider-http-refusal', 'provider-usage-unknown', 'provider-observed-token-limit', 'provider-response-too-large', 'transport-timeout', 'transport-failure'].includes(attempt.diagnostic.code) ? attempt.diagnostic.code : 'unknown-error';
  else if (['node-selection', 'relevance-scoring', 'evidence-refinement', 'answer-generation', 'answer-grounding', 'provider-output'].includes(safeStage)) code = finishReason === 'length' ? 'provider-output-truncated' : outputCapObserved ? 'provider-output-possibly-truncated' : name === 'SyntaxError' ? 'model-output-syntax' : 'model-output-validation';
  return { stage: safeStage, code, errorName: name, providerHttpStatus: Number.isInteger(attempt?.providerHttpStatus) && attempt.providerHttpStatus >= 100 && attempt.providerHttpStatus <= 599 ? attempt.providerHttpStatus : null, providerFinishReason: finishReason, outputCapObserved };
}

export const GRANT2_TIER = 'root-bound-single-question-grant2-v1';
export const GRANT2_ID = 'root-ollama-grant2-same-question-20261015';
const GRANT2_QUESTION = '2026-04-21-visa-blueprint-part2-italy-france-nz-gq01';
export const GRANT2_CEILING = Object.freeze({ maxAttempts: 2, maxSeconds: 60, callTimeoutMs: 25000, maxInputBytes: 32000,
  maxRequestBytes: 32000, maxResponseBytes: 1048576, outputLimit: 1024, maxKnownInputTokens: 32768, maxKnownOutputTokens: 2048 });
const GRANT2_BASE = 'qa/coordination/resume-20261015/eval-pilot';
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
  requireValue(authorization?.tier === GRANT2_TIER && authorization.configSha256 === digest(config)
    && authorization.maxAttempts === config.limits.maxAttempts && authorization.priorRequests === 3 && authorization.cumulativeCeiling === 5, 'grant2 reservation binding mismatch');
  requireValue(Number.isSafeInteger(inputBytes) && inputBytes > 0 && inputBytes <= config.limits.maxRequestBytes, 'grant2 finite request bytes required');
  const lock = authorization.ledgerPath + '.lock'; writeFileSync(lock, 'owned', { flag: 'wx', mode: 0o600 });
  try {
    const rows = existsSync(authorization.ledgerPath) ? readFileSync(authorization.ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
    requireValue(rows.every((row, i) => row.event === 'reserved' && row.id === 4 + i && row.grantSha256 === authorization.sha256
      && row.configSha256 === authorization.configSha256 && row.corpusSha256 === authorization.corpusSha256 && row.sourceCandidateSha256 === authorization.sourceCandidateSha256
      && Number.isSafeInteger(row.inputBytes) && row.inputBytes > 0 && row.outputReservation === config.limits.outputLimit), 'grant2 cumulative ledger identity mismatch');
    requireValue(rows.length < authorization.maxAttempts && authorization.priorRequests + rows.length < authorization.cumulativeCeiling, 'grant2 cumulative request budget exhausted');
    requireValue(rows.reduce((sum, row) => sum + row.inputBytes, 0) + inputBytes <= config.limits.maxInputBytes
      && rows.reduce((sum, row) => sum + row.outputReservation, 0) + config.limits.outputLimit <= config.limits.maxKnownOutputTokens, 'grant2 cumulative byte/output budget exhausted');
    const row = { event: 'reserved', id: 4 + rows.length, inputBytes, outputReservation: config.limits.outputLimit, grantSha256: authorization.sha256, configSha256: authorization.configSha256,
      corpusSha256: authorization.corpusSha256, sourceCandidateSha256: authorization.sourceCandidateSha256, reservedAt: new Date().toISOString(), usage: null };
    const fd = openSync(authorization.ledgerPath, 'a', 0o600);
    try { writeSync(fd, JSON.stringify(row) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    return row.id;
  } finally { unlinkSync(lock); }
}

export function validateConfig(config) {
  requireValue(['offline-fixture', 'real-provider'].includes(config.execution), 'explicit execution classification required');
  for (const key of Object.keys(PILOT)) requireValue(Number.isSafeInteger(config.limits?.[key]) && config.limits[key] > 0, `finite positive ${key} required`);
  requireValue(config.model === 'glm-5.3-flash' || config.model === 'deepseek-v4.1-flash', 'unknown model');
  requireValue(Array.isArray(config.questionIds) && config.questionIds.length && new Set(config.questionIds).size === config.questionIds.length, 'explicit distinct selected IDs required');
  requireValue(config.mode === undefined || ['pilot', 'full-population'].includes(config.mode), 'unknown evaluation mode');
  if (config.mode === 'full-population') requireValue(config.questionIds.length === 92 && config.model === 'glm-5.3-flash'
    && config.verifierModel === 'deepseek-v4.1-flash' && Object.keys(FULL_CEILING).every(k => config.limits[k] <= FULL_CEILING[k]), 'full population/model/capability ceiling mismatch');
  if (config.grant?.tier !== undefined) requireValue(config.grant.tier === GRANT2_TIER && config.execution === 'real-provider' && config.mode !== 'full-population', 'unknown or misplaced pilot tier');
  if (config.execution === 'real-provider') {
    requireValue(config.dispatchReal === true && config.grant?.id?.trim(), 'explicit root pilot grant or full-population grant required');
    if (config.mode === 'full-population') requireValue(config.grant.scope === 'full-population', 'full-population grant required');
    else if (config.grant.tier === GRANT2_TIER) {
      requireValue(config.grant.id === GRANT2_ID && config.grant.scope === 'single-question-pilot-grant2' && config.questionIds.length === 1
        && config.questionIds[0] === GRANT2_QUESTION && config.model === 'glm-5.3-flash' && config.verifierModel === undefined, 'explicit root grant2 pilot identity required');
      requireValue(Object.keys(GRANT2_CEILING).every(k => config.limits[k] <= GRANT2_CEILING[k]), 'grant2 pilot ceiling exceeded');
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
export function initialState(corpus, config, authorization = null) {
  validateConfig(config);
  requireValue(config.questionIds.every(id => corpus.questions.some(q => q.id === id)), 'unknown selected question');
  if (config.mode === 'full-population') requireValue(digest(config.questionIds) === digest(corpus.questions.map(q => q.id)), 'full population must preserve all92 accepted IDs/order');
  return { format: 'vectorless-eval-v2', binding: digest({ corpus: corpus.sha256, candidateIds: corpus.candidateIds, config, authorization }), corpusSha256: corpus.sha256, authorization, elapsedRunMs: 0,
    candidateIds: corpus.candidateIds, config, attempts: [], invocations: [], rows: corpus.questions.map(q => ({ id: q.id, expectedSessionId: q.expectedSessionId,
    status: 'not-run', selectedSessionIds: [], passages: [], citations: [], answer: null, latencyMs: null, usage: null, semanticCorrectness: null })),
    totals: { inputBytes: 0, knownInputTokens: 0, knownOutputTokens: 0, unknownUsageAttempts: 0 }, failure: null, costStatus: 'unknown', strictInputTokenCap: false };
}
/** Physical HTTP boundary, shared across every completion/retry. Reserve before external I/O. */
export function boundedTransport(state, rawTransport, persist, signal, now = () => Date.now(), admissionCheck = () => {}, reserveAttempt = () => {}) {
  const limits = state.config.limits, started = now(), elapsedBefore = state.elapsedRunMs, deadline = started + limits.maxSeconds * 1000 - elapsedBefore;
  const chargeTime = () => { state.elapsedRunMs = elapsedBefore + Math.max(0, now() - started); };
  const fail = reason => { state.failure = reason; persist(); throw new Error(reason); };
  return async request => {
    if (state.failure) throw new Error(state.failure);
    try { admissionCheck(); } catch { return fail('authorization-drift-or-expiry'); }
    chargeTime();
    if (signal.aborted || now() >= deadline) return fail('deadline-or-cancelled');
    const url = new URL(request.url);
    requireValue(request.kind === 'http' && request.method === 'POST' && url.href === 'https://ollama.com/api/chat', 'unapproved endpoint');
    requireValue([state.config.model, state.config.verifierModel].filter(Boolean).includes(request.body?.model) && request.body.stream === false, 'unapproved model/stream');
    const body = { ...request.body, options: { ...request.body.options, num_predict: limits.outputLimit } }, size = bytes(body);
    const reservedOutput = state.attempts.filter(a => a.status === 'inflight').length * limits.outputLimit;
    if (state.attempts.length >= limits.maxAttempts || size > limits.maxRequestBytes || state.totals.inputBytes + size > limits.maxInputBytes
      || state.totals.knownInputTokens >= limits.maxKnownInputTokens || state.totals.knownOutputTokens + reservedOutput + limits.outputLimit > limits.maxKnownOutputTokens) return fail('admission-budget');
    let cumulativeRequestId = null;
    try { cumulativeRequestId = reserveAttempt(size) ?? null; } catch { return fail('pilot-cumulative-budget-or-identity'); }
    const attempt = { cumulativeRequestId, id: state.attempts.length + 1, model: body.model, status: 'inflight', providerHttpStatus: null, providerFinishReason: null, diagnostic: null, inputBytes: size, requestSha256: digest(body), inputTokens: null, outputTokens: null, startedAt: new Date(now()).toISOString() };
    state.attempts.push(attempt); state.totals.inputBytes += size; persist();
    const controller = new AbortController(), relay = () => controller.abort();
    signal.addEventListener('abort', relay, { once: true }); request.signal?.addEventListener('abort', relay, { once: true });
    if (request.signal?.aborted) controller.abort();
    let timer;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, Math.min(limits.callTimeoutMs, Math.max(1, deadline - now()))); });
      const response = await Promise.race([rawTransport({ ...request, body, signal: controller.signal }), timeout]);
      attempt.providerHttpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      attempt.providerFinishReason = typeof response.body?.done_reason === 'string' ? (['stop', 'length', 'load', 'unload'].includes(response.body.done_reason) ? response.body.done_reason : 'unknown') : null;
      requireValue(bytes(response.body) <= limits.maxResponseBytes, 'response byte limit');
      requireValue(response.status >= 200 && response.status < 300, 'provider failure');
      const input = response.body?.prompt_eval_count, output = response.body?.eval_count;
      requireValue([input, output].every(n => Number.isSafeInteger(n) && n >= 0), 'unknown usage');
      attempt.inputTokens = input; attempt.outputTokens = output;
      state.totals.knownInputTokens += input; state.totals.knownOutputTokens += output;
      requireValue(output <= limits.outputLimit && state.totals.knownOutputTokens <= limits.maxKnownOutputTokens
        && state.totals.knownInputTokens <= limits.maxKnownInputTokens, 'observed-token-limit');
      attempt.status = 'returned'; return response;
    } catch (error) {
      let message = ''; try { message = typeof error?.message === 'string' ? error.message : ''; } catch {}
      const status = attempt.providerHttpStatus;
      const code = message === 'timeout' ? 'transport-timeout' : message === 'response byte limit' ? 'provider-response-too-large' : message === 'unknown usage' ? 'provider-usage-unknown' : message === 'observed-token-limit' ? 'provider-observed-token-limit' : status === 401 || status === 403 ? 'provider-authorization-refused' : status === 404 ? 'provider-model-or-endpoint-not-found' : status === 429 ? 'provider-rate-limited' : status !== null && (status < 200 || status >= 300) ? 'provider-http-refusal' : 'transport-failure';
      attempt.diagnostic = { stage: 'provider-output', code };
      attempt.status = 'failed-or-unknown'; state.failure = 'provider-timeout-failure-or-usage-limit';
      if (attempt.inputTokens === null) state.totals.unknownUsageAttempts++;
      throw new Error(state.failure);
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', relay); request.signal?.removeEventListener('abort', relay);
      attempt.elapsedMs = Math.max(0, now() - Date.parse(attempt.startedAt)); chargeTime(); persist();
    }
  };
}
async function actualHttp(request, maxBytes) {
  const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: request.signal, redirect: 'error' });
  const chunks = []; let size = 0;
  if (response.body) for await (const chunk of response.body) { size += chunk.length; requireValue(size <= maxBytes, 'response byte limit'); chunks.push(chunk); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid provider JSON'); }
  return { status: response.status, body };
}
/** Append-only, exclusive local checkpoints. No corpus text or credentials in bindings. */
export function checkpoint(directory, initial, resume = false) {
  const target = resolve(directory); if (!resume) mkdirSync(target, { recursive: false });
  const lock = resolve(target, '.owner'); writeFileSync(lock, 'owned', { flag: 'wx', mode: 0o600 });
  try {
    const names = readdirSync(target).filter(n => /^snapshot-\d{6}\.json$/.test(n)).sort(); let sequence = names.length;
    const envelope = resume ? JSON.parse(readFileSync(resolve(target, names.at(-1)), 'utf8')) : null;
    if (resume) requireValue(envelope?.sha256 === digest(envelope.state), 'checkpoint integrity mismatch');
    const state = resume ? envelope.state : initial;
    requireValue(state.binding === initial.binding && state.format === initial.format && state.rows.length === initial.rows.length
      && state.rows.every((r, i) => r.id === initial.rows[i].id) && digest(state.config) === digest(initial.config)
      && digest(state.candidateIds) === digest(initial.candidateIds) && digest(state.authorization) === digest(initial.authorization)
      && Number.isFinite(state.elapsedRunMs) && state.elapsedRunMs >= 0, 'checkpoint binding drift');
    requireValue(Array.isArray(state.attempts) && state.attempts.every((a, i) => a.id === i + 1 && Number.isSafeInteger(a.inputBytes) && a.inputBytes > 0
      && ['inflight', 'returned', 'failed-or-unknown'].includes(a.status)), 'invalid checkpoint attempts');
    requireValue(state.totals.inputBytes === state.attempts.reduce((n, a) => n + a.inputBytes, 0)
      && state.totals.knownInputTokens === state.attempts.reduce((n, a) => n + (a.inputTokens ?? 0), 0)
      && state.totals.knownOutputTokens === state.attempts.reduce((n, a) => n + (a.outputTokens ?? 0), 0), 'invalid checkpoint totals');
    // No ambiguous in-flight attempt may be replayed or disguised as completed.
    for (const attempt of state.attempts.filter(a => a.status === 'inflight')) {
      attempt.status = 'failed-or-unknown'; state.totals.unknownUsageAttempts++; state.failure = 'unknown-inflight-attempt';
    }
    const persist = () => writeFileSync(resolve(target, `snapshot-${String(sequence++).padStart(6, '0')}.json`), JSON.stringify({ sha256: digest(state), state }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { state, persist, release: () => unlinkSync(lock) };
  } catch (error) { unlinkSync(lock); throw error; }
}
export async function evaluate({ corpus, config, directory, resume = false, credential, authorizationPath, pauseAfterQuestions = 92,
  fixtureTransport, fixtureCompletion, fixtureHydrator, root = ROOT, signal = new AbortController().signal }) {
  validateConfig(config); const real = config.execution === 'real-provider';
  const grant2 = real && config.grant?.tier === GRANT2_TIER;
  const authorization = grant2 ? validatePilotAuthorization(authorizationPath, corpus, config) : real && config.mode === 'full-population' ? validateAuthorization(authorizationPath, corpus, config) : null;
  requireValue(!grant2 || resolve(directory) === authorization.checkpointDirectory, 'grant2 checkpoint identity mismatch');
  const initial = initialState(corpus, config, authorization);
  requireValue(Number.isSafeInteger(pauseAfterQuestions) && pauseAfterQuestions > 0 && pauseAfterQuestions <= 92, 'invalid invocation pause bound');
  requireValue(!real || root === ROOT && bindingsMatch(root, corpus) && digest(freezeInputs(ROOT)) === digest(corpus)
    && !fixtureTransport && !fixtureCompletion && !fixtureHydrator, 'real execution requires current repository inputs');
  requireValue(real ? typeof credential === 'string' && credential.trim() : typeof fixtureTransport === 'function', 'explicit credential or offline fixture transport required');
  const store = checkpoint(directory, initial, resume), { state, persist } = store;
  const invocationStart = performance.now(), elapsedBeforeRun = state.elapsedRunMs; let completedThisInvocation = 0, activeRow = null, executionStage = 'runtime-import';
  try {
    const runtime = await productionRuntime(); executionStage = 'tree-build';
    const tree = runtime.buildTree(corpus.sessions, corpus.pages)[corpus.tenantId];
    const db = frozenDb(corpus), blind = runtime.nullRetriever(corpus.candidateIds);
    state.elapsedRunMs = elapsedBeforeRun + performance.now() - invocationStart;
    const admissionCheck = () => { if (authorization) requireValue((grant2 ? validatePilotAuthorization(authorizationPath, corpus, config) : validateAuthorization(authorizationPath, corpus, config)).sha256 === authorization.sha256, 'authorization drift'); };
    const transport = boundedTransport(state, real ? req => actualHttp(req, config.limits.maxResponseBytes) : fixtureTransport, persist, signal, undefined, admissionCheck, grant2 ? size => reservePilotAttempt(authorization, config, size) : undefined);
    const provider = new runtime.Cloud(transport, { apiKey: real ? credential : 'offline-fixture-no-secret', timeoutMs: config.limits.callTimeoutMs }, 'ollama-cloud', config.model);
    const verifier = config.verifierModel ? new runtime.Cloud(transport, { apiKey: real ? credential : 'offline-fixture-no-secret', timeoutMs: config.limits.callTimeoutMs }, 'ollama-cloud-verifier', config.verifierModel) : provider;
    const complete = async job => {
      const stage = ({ 'ask.select_nodes': 'node-selection', evaluator: 'relevance-scoring', 'ask.refine_batch': 'evidence-refinement', 'ask.answer': 'answer-generation', 'ask.answer_grounding': 'answer-grounding' })[job.kind] ?? 'graph-execution';
      if (activeRow) { activeRow.executionStage = stage; activeRow.providerStep = stage; }
      const selected = job.kind === 'ask.answer_grounding' ? verifier : provider;
      const result = await (fixtureCompletion ? fixtureCompletion(job, selected) : selected.complete(job));
      if (activeRow) activeRow.executionStage = 'provider-output'; return result;
    };
    state.invocations.push({ startedAt: new Date().toISOString(), execution: config.execution }); persist();
    for (const question of corpus.questions) {
      const row = state.rows.find(r => r.id === question.id);
      const lexical = [...new Set(runtime.lexical(question.question, corpus.turns, corpus.turns.length).map(h => h.sessionId))].slice(0, 5);
      row.controls = { lexical, blind: blind(question.question, 5), lexicalHit: lexical.includes(question.expectedSessionId), blindHit: blind('', 5).includes(question.expectedSessionId) };
      if (!config.questionIds.includes(row.id) || row.status !== 'not-run') continue;
      if (state.failure) { row.status = 'budget-not-run'; continue; }
      if (signal.aborted || completedThisInvocation >= pauseAfterQuestions) continue;
      const start = performance.now(), before = state.attempts.length; activeRow = row; row.executionStage = 'graph-execution';
      const actualHydrate = runtime.hydrate(corpus.tenantId, { db });
      const hydrate = fixtureHydrator ? (q, nodes) => fixtureHydrator(q, nodes, actualHydrate) : actualHydrate;
      try {
        if (real) { row.executionStage = 'source-current-check'; requireValue(bindingsMatch(root, corpus), 'source drift'); }
        const result = await runtime.ask(question.question, tree, { tenantId: corpus.tenantId, complete, scoreFn: runtime.scorer(complete),
          scoreFnForComplete: runtime.scorer, treeSearchFn: runtime.treeSearch, write: async () => {}, sourceContext: { hydrate: async (q, nodes) => {
            row.executionStage = 'source-hydration'; row.selectedSessionIds = nodes.map(n => n.evidence.sessionRef); const proof = await hydrate(q, nodes);
            row.passages = proof.nodes.flatMap(n => n.evidence.sourceQuotes.map(p => ({ ...p, quote: undefined, quoteSha256: digest(p.quote) })));
            row.excludedTurns = proof.excludedTurns ?? []; row.executionStage = 'source-guard'; return proof;
          } } });
        requireValue(!state.failure, 'sticky transport refusal');
        if (real) { row.executionStage = 'source-current-check'; requireValue(bindingsMatch(root, corpus), 'source drift'); }
        row.answer = result.answer; row.citations = result.sources; row.audit = result.auditLog;
        row.status = result.insufficient_coverage ? 'abstention' : 'answered';
      } catch (error) { row.status = state.failure ? 'budget-or-provider-refusal' : 'source-or-graph-refusal'; row.diagnostic = contentFreeDiagnostic(error, row.executionStage, state.attempts.slice(before).at(-1), config.limits.outputLimit); }
      row.latencyMs = performance.now() - start; const attempts = state.attempts.slice(before); row.attemptIds = attempts.map(a => a.id);
      row.usage = attempts.some(a => a.inputTokens === null || a.outputTokens === null) ? null : {
        inputTokens: attempts.reduce((sum, a) => sum + a.inputTokens, 0), outputTokens: attempts.reduce((sum, a) => sum + a.outputTokens, 0) };
      row.retrievalHit = row.selectedSessionIds.slice(0, 5).includes(question.expectedSessionId); persist();
      activeRow = null; completedThisInvocation++;
    }
    state.invocations.at(-1).endedAt = new Date().toISOString();
    state.invocations.at(-1).elapsedMs = performance.now() - invocationStart; state.elapsedRunMs = elapsedBeforeRun + state.invocations.at(-1).elapsedMs;
    state.fullPopulationAttempted = state.rows.every(r => !['not-run', 'budget-not-run'].includes(r.status));
    state.comparison = { k: 5, population: state.rows.length, attempted: state.rows.filter(r => !['not-run', 'budget-not-run'].includes(r.status)).length,
      retrievalRecallAt5: state.fullPopulationAttempted ? state.rows.filter(r => r.retrievalHit).length / state.rows.length : null,
      lexicalRecallAt5: state.rows.filter(r => r.controls.lexicalHit).length / state.rows.length, blindRecallAt5: state.rows.filter(r => r.controls.blindHit).length / state.rows.length,
      misses: state.rows.filter(r => !r.retrievalHit).map(r => ({ id: r.id, status: r.status })), semantics: 'unmeasured; no human labels synthesized' };
    const arm = matches => ({ k: 5, total: state.rows.length, hits: state.rows.filter(matches).length, recallAtK: state.rows.filter(matches).length / state.rows.length,
      misses: state.rows.filter(r => !matches(r)).map(r => ({ id: r.id, expectedSessionId: r.expectedSessionId })) });
    state.comparison.arms = { production: state.fullPopulationAttempted ? arm(r => r.retrievalHit) : null,
      lexical: arm(r => r.controls.lexicalHit), blind: arm(r => r.controls.blindHit) };
    state.comparison.assessment = state.fullPopulationAttempted ? runtime.assessBaseline(state.comparison.arms.production, state.comparison.arms.blind, corpus.candidateIds.length) : null;
    state.algorithm = 'production askV2 -> askGraphV2 -> selectNodes -> exact source hydration -> evaluate/refine/answer; no embeddings';
    state.acceptance = 'HOLD: execution coverage and retrieval are not independently reviewed semantic answer quality'; persist(); return state;
  } catch (error) { state.executionDiagnostic = contentFreeDiagnostic(error, executionStage); persist(); throw error; } finally { store.release(); }
}
export async function main(argv) {
  const corpus = freezeInputs();
  if (argv.length === 1 && argv[0] === '--inspect') return console.log(JSON.stringify({ questions: 92, candidates: corpus.candidateIds.length, corpusSha256: corpus.sha256, liveDispatch: false }));
  requireValue(argv[0] === '--run-authorized', 'explicit authorized execution flag required');
  const options = {}; for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--resume') { requireValue(!options.resume, 'duplicate resume'); options.resume = true; continue; }
    requireValue(['--config', '--authorization', '--checkpoint'].includes(argv[i]) && !options[argv[i]] && argv[i + 1] && !argv[i + 1].startsWith('--'), 'invalid run arguments'); options[argv[i]] = argv[++i];
  }
  const config = JSON.parse(readFileSync(options['--config'], 'utf8')); validateConfig(config);
  requireValue(config.execution === 'real-provider' && config.mode === 'full-population' && options['--checkpoint'], 'CLI full-population config required');
  validateAuthorization(options['--authorization'], corpus, config); // Gates precede credential access. No dotenv loading.
  const cancellation = new AbortController(), cancel = () => cancellation.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { const state = await evaluate({ corpus, config, directory: options['--checkpoint'], authorizationPath: options['--authorization'], resume: !!options.resume,
    credential: process.env.OLLAMA_API_KEY, signal: cancellation.signal }); console.log(JSON.stringify({ rows: state.rows.length, fullPopulationAttempted: state.fullPopulationAttempted, acceptance: state.acceptance })); }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('Vectorless evaluation refused: configuration, authorization, source, checkpoint or execution unavailable.'); process.exitCode = 2; });
