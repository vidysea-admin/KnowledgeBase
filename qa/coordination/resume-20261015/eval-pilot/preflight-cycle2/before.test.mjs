/** Synthetic engineering fixtures only: actual production graph, no human labels or real corpus copies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluate, digest, PILOT, FULL_CEILING, initialState, boundedTransport, checkpoint, frozenDb, validateConfig, validateAuthorization, sourcePairIdentity, contentFreeDiagnostic, GRANT2_TIER, GRANT2_ID, GRANT2_CEILING, validatePilotAuthorization, reservePilotAttempt } from './vectorless-production-eval.mjs';
const fixture = () => {
  const sessions = ['a', 'b'].map((id, i) => ({ _id: id, tenantId: 'toc', sourceId: 'source-' + id,
    title: i ? 'Other unrelated topic' : 'Visa October', date: '2026-01-01', org: 'fixture', status: {} }));
  const pages = sessions.map(s => ({ sessionId: s._id, tenantId: 'toc', summary: s.title, topics: [] }));
  const turns = sessions.map(s => ({ _id: 'turn-' + s._id, sessionId: s._id, tenantId: 'toc', speakerRef: 'spk:0',
    text: s._id === 'a' ? 'Visa applications open in October.' : 'Unrelated topic.', tStart: 1, tEnd: 5 }));
  const sources = sessions.map(s => ({ _id: s.sourceId, tenantId: 'toc', kind: 'recording', consent: { given: true } }));
  const questions = Array.from({ length: 92 }, (_, i) => ({ id: 'fixture-' + i, question: 'When do visa applications open?', expectedSessionId: 'a' }));
  return { format: 'vectorless-inputs-v1', tenantId: 'toc', sessions, pages, turns, sources, questions,
    candidateIds: ['a', 'b'], bindings: [], sha256: digest({ sessions, pages, turns, questions, sources }) };
};
const config = (overrides = {}) => ({ execution: 'offline-fixture', model: 'glm-5.3-flash', questionIds: ['fixture-0'],
  limits: { ...PILOT, maxAttempts: 20, maxKnownOutputTokens: 5120 }, ...overrides });
const fullConfig = corpus => config({ mode: 'full-population', verifierModel: 'deepseek-v4.1-flash', questionIds: corpus.questions.map(q => q.id), limits: { ...FULL_CEILING } });
const response = (value, input = 10, output = 5) => ({ status: 200, body: {
  message: { content: JSON.stringify(value) }, prompt_eval_count: input, eval_count: output } });
function scripted(request) {
  const messages = request.body.messages, system = messages[0].content, user = messages.at(-1).content;
  if (system.startsWith('Select only')) {
    const ids = [...user.matchAll(/^- (\S+) \|/gm)].map(m => m[1]);
    return response({ node_ids: ids.filter(id => !id.includes('session:b')) });
  }
  if (system.startsWith('You are a retrieval relevance judge')) return response({ score: 0.95, reason: 'Synthetic protocol judgment, not human gold.' });
  const payload = JSON.parse(user);
  if (system.startsWith('For every supplied strip')) return response({ decisions: payload.strips.map(s => ({ id: s.id, keep: true })) });
  if (system.startsWith('Answer ONLY')) return response({ sentences: [{ text: 'Visa applications open in October.', sourceIds: [payload.context.sources[0].sourceId] }] });
  if (system.startsWith('Independently judge EVERY')) return response({ decisions: payload.sentences.map(s => ({ id: s.id, supported: true, answersQuery: true })) });
  throw new Error('unexpected actual graph request');
}
async function temporary(fn) {
  const root = mkdtempSync(join(tmpdir(), 'vectorless-fixture-'));
  try { return await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('actual production graph selects, hydrates current literal turns, refines and grounds an answer; all92 IDs retained', async () => temporary(async root => {
  const corpus = fixture(), requests = [], kinds = [];
  const state = await evaluate({ corpus, config: config(), directory: join(root, 'run'), fixtureTransport: async req => { requests.push(req); return scripted(req); },
    fixtureCompletion: async (job, provider) => { kinds.push(job.kind); return provider.complete(job); } });
  assert.equal(state.rows.length, 92); assert.equal(state.rows[0].status, 'answered');
  assert.equal(state.rows[0].answer, corpus.turns[0].text); assert.deepEqual(state.rows[0].selectedSessionIds, ['a']);
  assert.equal(state.rows[0].passages[0].quoteSha256, digest(corpus.turns[0].text));
  assert.equal(state.rows[0].passages[0].speakerRef, 'spk:0'); assert.equal(state.rows[0].passages[0].turnId, 'turn-a');
  assert.equal(state.rows[0].citations.internal[0].evidence.sessionRef, 'a');
  assert.equal(state.rows[0].citations.internal[0].evidence.sourceQuotes[0].quote, corpus.turns[0].text);
  assert.deepEqual(state.rows[0].citations.web, []);
  assert.equal(state.rows[0].semanticCorrectness, null); assert.equal(state.rows[91].status, 'not-run');
  for (const kind of ['ask.select_nodes', 'evaluator', 'ask.answer', 'ask.answer_grounding']) assert.ok(kinds.includes(kind), kind);
  assert.ok(!kinds.includes('ask.refine_batch'), 'correct evidence uses direct exact source strips');
  assert.ok(requests.every(r => r.url === 'https://ollama.com/api/chat' && r.body.options.num_predict === 256));
  assert.ok(!requests.some(r => /embed/.test(r.url))); assert.equal(state.strictInputTokenCap, false); assert.equal(state.costStatus, 'unknown');
  assert.ok(state.rows.every(r => r.controls.lexicalHit && r.controls.blindHit));
  const ambiguousKinds = [], ambiguousRequests = [];
  const ambiguous = await evaluate({ corpus, config: config(), directory: join(root, 'ambiguous'),
    fixtureCompletion: async (job, provider) => { ambiguousKinds.push(job.kind); return provider.complete(job); },
    fixtureTransport: async req => { ambiguousRequests.push(req); return req.body.messages[0].content.startsWith('You are a retrieval relevance judge')
      ? response({ score: 0.5, reason: 'Synthetic ambiguous protocol judgment.' }) : scripted(req); } });
  assert.ok(ambiguousKinds.includes('ask.refine_batch')); assert.ok(ambiguousKinds.includes('ask.answer_grounding'));
  assert.equal(ambiguous.rows[0].status, 'abstention'); assert.equal(ambiguous.rows[0].answer, corpus.turns[0].text);
  assert.equal(ambiguous.rows[0].citations.internal[0].evidence.sessionRef, 'a');
  assert.equal(ambiguous.rows[0].citations.internal[0].evidence.sourceQuotes[0].quote, corpus.turns[0].text);
  assert.equal(ambiguous.failure, null); assert.ok(ambiguous.attempts.length <= config().limits.maxAttempts);
  assert.ok(ambiguousRequests.every(r => r.body.options.num_predict === 256));
}));
test('three physical attempts stop before answer, sticky across repeated graph/scorer calls and resume', async () => temporary(async root => {
  const corpus = fixture(), c = config({ limits: { ...PILOT } }), directory = join(root, 'run'); let calls = 0;
  const state = await evaluate({ corpus, config: c, directory, fixtureTransport: async req => { calls++; return scripted(req); } });
  assert.equal(calls, 3); assert.equal(state.rows[0].status, 'budget-or-provider-refusal'); assert.equal(state.rows[0].answer, null);
  const resumed = await evaluate({ corpus, config: c, directory, resume: true, fixtureTransport: async req => { calls++; return scripted(req); } });
  assert.equal(calls, 3); assert.equal(resumed.attempts.length, 3);
}));
test('source drift/forged citation offsets fail through actual hydration validation', async () => temporary(async root => {
  const state = await evaluate({ corpus: fixture(), config: config(), directory: join(root, 'run'), fixtureTransport: async req => scripted(req),
    fixtureHydrator: async (q, nodes, real) => { const proof = await real(q, nodes); proof.nodes[0].evidence.sourceQuotes[0].charEnd = -1; return proof; } });
  assert.equal(state.rows[0].status, 'source-or-graph-refusal'); assert.equal(state.rows[0].answer, null);
}));
test('byte, token admission and unknown usage refuse before further physical calls', async () => {
  const req = { kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false, messages: [] } };
  const state = initialState(fixture(), config({ limits: { ...PILOT, maxInputBytes: 1 } })); let calls = 0;
  const send = boundedTransport(state, async () => { calls++; return response({}); }, () => {}, new AbortController().signal);
  await assert.rejects(send(req), /admission-budget/); await assert.rejects(send(req)); assert.equal(calls, 0);
  const unknown = initialState(fixture(), config()), missing = boundedTransport(unknown, async () => { calls++; return { status: 200, body: { message: { content: '{}' } } }; }, () => {}, new AbortController().signal);
  await assert.rejects(missing(req)); await assert.rejects(missing(req)); assert.equal(calls, 1);
  assert.equal(unknown.totals.unknownUsageAttempts, 1); assert.equal(unknown.attempts[0].inputTokens, null);
});
test('deadline cancels hanging transport without admitting another attempt', async () => {
  const state = initialState(fixture(), config({ limits: { ...PILOT, callTimeoutMs: 15 } })); let aborted = false;
  const send = boundedTransport(state, req => new Promise(() => { req.signal.addEventListener('abort', () => { aborted = true; }); }), () => {}, new AbortController().signal);
  await assert.rejects(send({ kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false } }));
  assert.equal(aborted, true); assert.equal(state.attempts.length, 1); assert.ok(state.failure);
});
test('checkpoint integrity/config/candidate binding refuses tampering and collisions', async () => temporary(async root => {
  const initial = initialState(fixture(), config()), directory = join(root, 'run'), store = checkpoint(directory, initial);
  store.persist(); assert.throws(() => checkpoint(directory, initial, true)); store.release();
  const changed = initialState(fixture(), config({ questionIds: ['fixture-1'] })); assert.throws(() => checkpoint(directory, changed, true), /binding drift/);
  const path = join(directory, readdirSync(directory).find(n => n.endsWith('.json'))), envelope = JSON.parse(readFileSync(path));
  envelope.state.totals.inputBytes = 999; writeFileSync(path, JSON.stringify(envelope));
  assert.throws(() => checkpoint(directory, initial, true), /integrity/);
}));
test('question-blind same-population control ignores query and offline reader refuses foreign scope', async () => temporary(async root => {
  const corpus = fixture(); corpus.questions[1].question = 'Unrelated topic';
  let dispatches = 0;
  await assert.rejects(frozenDb(corpus).collection('turns').find({ tenantId: 'foreign' }).toArray(), /tenant/);
  assert.equal(dispatches, 0);
  const state = await evaluate({ corpus, config: config({ questionIds: ['fixture-0'] }), directory: join(root, 'run'), fixtureTransport: async req => { dispatches++; return scripted(req); } });
  assert.deepEqual(state.rows[0].controls.blind, state.rows[1].controls.blind);
  assert.notDeepEqual(state.rows[0].controls.lexical, state.rows[1].controls.lexical);
  assert.throws(() => frozenDb(corpus).collection('chunks'), /outside/);
}));
test('live disabled by default; pilot expansion refused and full92 needs distinct finite mode/grant', () => {
  assert.throws(() => validateConfig(config({ execution: 'real-provider' })), /pilot grant/);
  assert.throws(() => validateConfig(config({ execution: 'real-provider', dispatchReal: true, grant: { scope: 'single-question-pilot', id: 'root' },
    questionIds: fixture().questions.map(q => q.id), limits: { ...PILOT } })), /pilot grant/);
  assert.doesNotThrow(() => validateConfig(config({ execution: 'real-provider', dispatchReal: true, grant: { scope: 'single-question-pilot', id: 'root' }, limits: { ...PILOT } })));
  assert.doesNotThrow(() => validateConfig({ ...fullConfig(fixture()), execution: 'real-provider', dispatchReal: true, grant: { scope: 'full-population', id: 'root-future-grant' } }));
});
test('all92 production-graph rows execute after clean pause/resume; same controls, verifier model and lifetime usage retained', async () => temporary(async root => {
  const corpus = fixture(), c = fullConfig(corpus), directory = join(root, 'run'), models = [];
  const first = await evaluate({ corpus, config: c, directory, pauseAfterQuestions: 1, fixtureTransport: async req => { models.push(req.body.model); return scripted(req); } });
  assert.equal(first.rows[0].status, 'answered'); assert.equal(first.rows[1].status, 'not-run'); assert.equal(first.comparison.retrievalRecallAt5, null);
  assert.equal(first.comparison.assessment, null); assert.equal(first.comparison.arms.production, null);
  assert.equal(models.at(-1), 'deepseek-v4.1-flash'); assert.ok(models.slice(0, -1).every(m => m === 'glm-5.3-flash'));
  const firstAttempts = first.attempts.length, firstTokens = first.totals.knownInputTokens, firstTime = first.elapsedRunMs;
  const final = await evaluate({ corpus, config: c, directory, resume: true, fixtureTransport: async () => response({ node_ids: [] }) });
  assert.equal(final.fullPopulationAttempted, true); assert.equal(final.comparison.attempted, 92); assert.equal(final.rows.filter(r => r.status === 'abstention').length, 91);
  assert.equal(final.attempts.length, firstAttempts + 91); assert.equal(final.totals.knownInputTokens, firstTokens + 910); assert.ok(final.elapsedRunMs >= firstTime);
  assert.equal(final.rows[0].citations.internal[0].evidence.sourceQuotes[0].quote, corpus.turns[0].text);
  assert.equal(final.comparison.retrievalRecallAt5, 1 / 92); assert.equal(final.comparison.misses.length, 91); assert.equal(final.comparison.blindRecallAt5, 1);
  assert.equal(final.comparison.arms.production.hits, 1); assert.equal(final.comparison.arms.production.total, 92); assert.equal(final.comparison.arms.production.misses.length, 91);
  for (const name of ['lexical', 'blind']) { assert.equal(final.comparison.arms[name].hits, 92); assert.equal(final.comparison.arms[name].total, 92); assert.equal(final.comparison.arms[name].misses.length, 0); }
  assert.equal(final.comparison.assessment.verdict, 'at-chance'); assert.equal(final.comparison.assessment.chanceFloor, 1);
  assert.equal(final.comparison.assessment.saturated, false); assert.equal(final.comparison.assessment.liftOverControl, 1 / 92 - 1);
  assert.ok(final.rows.every(r => r.semanticCorrectness === null)); assert.ok(final.attempts.length <= c.limits.maxAttempts);
  await assert.rejects(evaluate({ corpus, config: { ...c, limits: { ...c.limits, maxAttempts: 1103 } }, directory, resume: true, fixtureTransport: async () => response({}) }), /binding drift/);
  assert.throws(() => initialState(corpus, { ...c, questionIds: [...c.questionIds].reverse() }), /accepted IDs\/order/);
}));
test('persisted finite authorization binds exact code/corpus/config/usage semantics and expiry without executing transport', async () => temporary(async root => {
  const corpus = fixture(), c = { ...fullConfig(corpus), execution: 'real-provider', dispatchReal: true, grant: { scope: 'full-population', id: 'fixture-authorization-only' } };
  const path = join(root, 'approval.json'), now = Date.now();
  const approval = { format: 'vectorless-run-authorization-v1', authority: 'root-explicit-run-budget', id: c.grant.id,
    evidenceReference: 'Synthetic authorization protocol test; never dispatched', usagePolicy: 'observed-tokens-stop-on-unknown-no-strict-input-token-cap',
    corpusSha256: corpus.sha256, sourceCandidateSha256: sourcePairIdentity(), configSha256: digest(c), approvedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 10000).toISOString() };
  writeFileSync(path, JSON.stringify(approval)); assert.ok(validateAuthorization(path, corpus, c, now).sha256);
  assert.throws(() => validateAuthorization(path, corpus, { ...c, limits: { ...c.limits, maxAttempts: 100 } }, now), /mismatched/);
  assert.throws(() => validateAuthorization(path, corpus, c, now + 11000), /expired/);
  writeFileSync(path, JSON.stringify({ ...approval, usagePolicy: 'strict-input-token-cap' })); assert.throws(() => validateAuthorization(path, corpus, c, now), /mismatched/);
  await assert.rejects(evaluate({ corpus, config: c, directory: join(root, 'not-created'), authorizationPath: path, credential: 'fixture-not-a-secret' }), /mismatched/);
}));
test('inflight output reservations and prior elapsed runtime prevent cumulative budget reset', async () => {
  const req = { kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false } };
  const state = initialState(fixture(), config({ limits: { ...PILOT, maxKnownOutputTokens: 256 } })); let release, calls = 0;
  const send = boundedTransport(state, () => { calls++; return new Promise(resolve => { release = resolve; }); }, () => {}, new AbortController().signal);
  const first = send(req); await assert.rejects(send(req), /admission-budget/); release(response({})); await first;
  assert.equal(calls, 1); assert.equal(state.attempts.length, 1); assert.equal(state.totals.knownOutputTokens, 5);
  const expired = initialState(fixture(), config()); expired.elapsedRunMs = expired.config.limits.maxSeconds * 1000;
  const blocked = boundedTransport(expired, async () => { calls++; return response({}); }, () => {}, new AbortController().signal);
  await assert.rejects(blocked(req), /deadline/); assert.equal(calls, 1);
});

// Content-free diagnostics use synthetic failures; no paid providers or human labels.
test('diagnostics sanitizer never persists arbitrary error bodies or unknown stages', () => {
  const diagnostic = contentFreeDiagnostic({ name: 'SECRET_NAME', message: 'SECRET_BODY credential', code: 'SECRET_CODE' }, 'SECRET_STAGE');
  assert.deepEqual(diagnostic, { stage: 'graph-execution', code: 'unknown-error', errorName: 'Error', providerHttpStatus: null, providerFinishReason: null, outputCapObserved: null });
  assert.ok(!JSON.stringify(diagnostic).includes('SECRET'));
  const capOnly = contentFreeDiagnostic(new SyntaxError('SECRET parse body'), 'provider-output', { outputTokens: 256, providerFinishReason: 'stop' }, 256);
  assert.equal(capOnly.code, 'provider-output-possibly-truncated'); assert.equal(capOnly.providerFinishReason, 'stop');
});
test('diagnostics transport preserves safe HTTP refusal without provider error bodies', async () => {
  const state = initialState(fixture(), config());
  const send = boundedTransport(state, async () => ({ status: 401, body: { error: 'SECRET authorization body', done_reason: 'SECRET_FINISH' } }), () => {}, new AbortController().signal);
  await assert.rejects(send({ kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false } }));
  assert.equal(state.attempts[0].providerHttpStatus, 401); assert.equal(state.attempts[0].providerFinishReason, 'unknown');
  assert.equal(state.attempts[0].diagnostic.code, 'provider-authorization-refused');
  assert.ok(!JSON.stringify(state.attempts).includes('SECRET'));
});
test('diagnostics provider truncation and malformed output stay distinct from graph authorization', async () => temporary(async root => {
  const state = await evaluate({ corpus: fixture(), config: config(), directory: join(root, 'truncated'), fixtureTransport: async () => ({ status: 200, body: { message: { content: '{' }, prompt_eval_count: 10, eval_count: 256, done_reason: 'length' } }),
    // Explicit consumer failure injection: production node selection normally abstains on malformed JSON.
    fixtureCompletion: async (job, provider) => { await provider.complete(job); throw new SyntaxError('SECRET explicit consumer validation failure'); } });
  assert.equal(state.rows[0].status, 'source-or-graph-refusal'); assert.equal(state.rows[0].answer, null);
  assert.equal(state.rows[0].diagnostic.code, 'provider-output-truncated');
  assert.equal(state.rows[0].diagnostic.providerFinishReason, 'length'); assert.equal(state.rows[0].diagnostic.outputCapObserved, true);
  assert.equal(state.rows[0].providerStep, 'node-selection'); assert.equal(state.rows[0].diagnostic.providerHttpStatus, 200);
  const unknownUsage = initialState(fixture(), config());
  const send = boundedTransport(unknownUsage, async () => ({ status: 200, body: { message: { content: '{}' } } }), () => {}, new AbortController().signal);
  await assert.rejects(send({ kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false } }));
  assert.equal(unknownUsage.attempts[0].diagnostic.code, 'provider-usage-unknown');
}));
test('diagnostics source authorization refusal stays source scoped after a successful provider call', async () => temporary(async root => {
  const state = await evaluate({ corpus: fixture(), config: config(), directory: join(root, 'authorization'), fixtureTransport: async req => scripted(req), fixtureHydrator: async () => { throw new Error('SECRET source authorization detail'); } });
  assert.equal(state.rows[0].status, 'source-or-graph-refusal');
  assert.equal(state.rows[0].diagnostic.stage, 'source-hydration'); assert.equal(state.rows[0].diagnostic.code, 'source-guard-refusal');
  assert.equal(state.rows[0].answer, null); assert.ok(!JSON.stringify(state.rows[0]).includes('SECRET'));
}));

test('diagnostics legitimate malformed selector abstention preserves production semantics', async () => temporary(async root => {
  const state = await evaluate({ corpus: fixture(), config: config(), directory: join(root, 'legitimate-abstention'), fixtureTransport: async () => ({ status: 200, body: { message: { content: '{' }, prompt_eval_count: 10, eval_count: 256, done_reason: 'length' } }) });
  assert.equal(state.rows[0].status, 'abstention'); assert.equal(state.failure, null);
  assert.equal(state.rows[0].diagnostic, undefined); assert.equal(state.rows[0].semanticCorrectness, null);
  assert.deepEqual(state.rows[0].selectedSessionIds, []); assert.equal(state.rows[0].retrievalHit, false);
  assert.equal(state.attempts.length, 1); assert.equal(state.attempts[0].providerFinishReason, 'length');
  assert.equal(state.attempts[0].outputTokens, 256); assert.equal(state.rows[0].providerStep, 'node-selection');
}));

const grant2Question = '2026-04-21-visa-blueprint-part2-italy-france-nz-gq01';
const grant2Config = (extra = {}) => config({ execution: 'real-provider', mode: 'pilot', dispatchReal: true,
  questionIds: [grant2Question], grant: { tier: GRANT2_TIER, id: GRANT2_ID, scope: 'single-question-pilot-grant2' }, limits: { ...GRANT2_CEILING }, ...extra });
function grant2Fixture(root, c = grant2Config()) {
  const corpus = fixture(); corpus.questions[0].id = grant2Question; corpus.sha256 = digest(corpus.questions);
  const base = join(root, 'qa/coordination/resume-20261015/eval-pilot'); mkdirSync(join(base, 'grant2'), { recursive: true });
  const priorPath = join(base, 'receipt.remaining-probe.json'), baselinePath = join(base, 'provider-request-ledger.jsonl');
  const prior = JSON.stringify({ totalProviderRequestsReserved: 3, remainingProviderRequests: 0, questionId: grant2Question,
    selectedModel: 'glm-5.3-flash', inferenceHttpStatus: 200, modelAccessConfirmedByActualInference: true });
  const baseline = [1, 2, 3].map(id => JSON.stringify({ event: 'reserved', id, usage: null })).join('\n') + '\n';
  writeFileSync(priorPath, prior); writeFileSync(baselinePath, baseline);
  const path = join(base, 'grant2/authorization.json'), now = Date.now();
  const approval = { format: 'vectorless-pilot-grant2-authorization-v1', authority: 'root-explicit-run-budget',
    actor: 'root acting on explicit user-approved Ollama goal', id: GRANT2_ID, scope: c.grant.scope, tier: GRANT2_TIER,
    questionId: grant2Question, model: c.model, corpusSha256: corpus.sha256, sourceCandidateSha256: sourcePairIdentity(), configSha256: digest(c),
    baselineReceiptSha256: digest(prior), baselineLedgerSha256: digest(baseline), approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(), usagePolicy: 'observed-tokens-stop-on-unknown-no-strict-input-token-cap', evidenceReference: 'root-authorized synthetic engineering fixture, no human acceptance' };
  writeFileSync(path, JSON.stringify(approval)); return { corpus, c, path, approval, now, baselinePath, baseline };
}
test('grant2 preserves legacy ceilings and rejects unbound scope, IDs and nonfinite limits', () => {
  assert.equal(PILOT.outputLimit, 256); assert.equal(PILOT.maxKnownOutputTokens, 768); assert.equal(FULL_CEILING.outputLimit, 768);
  const c = grant2Config(); assert.doesNotThrow(() => validateConfig(c));
  assert.throws(() => validateConfig({ ...c, grant: { scope: 'single-question-pilot', id: 'legacy' } }), /pilot ceiling/);
  for (const grant of [{ ...c.grant, tier: 'unknown' }, { ...c.grant, id: 'random-config-id' }, { ...c.grant, scope: 'full-population' }]) assert.throws(() => validateConfig({ ...c, grant }));
  assert.throws(() => validateConfig({ ...c, questionIds: [grant2Question, 'easier-question'] }));
  assert.throws(() => validateConfig({ ...c, verifierModel: 'deepseek-v4.1-flash' }));
  for (const value of [0, NaN, Infinity, 1.5, 1025]) assert.throws(() => validateConfig({ ...c, limits: { ...c.limits, outputLimit: value } }));
  assert.throws(() => validateConfig({ ...c, limits: { ...c.limits, maxAttempts: 3 } }));
  assert.throws(() => validateConfig({ ...c, limits: { ...c.limits, maxInputBytes: 32001 } }));
});
test('grant2 authorization binds canonical artifact, actor, scope and current source corpus config', async () => temporary(async root => {
  const f = grant2Fixture(root), accepted = validatePilotAuthorization(f.path, f.corpus, f.c, f.now, root);
  assert.equal(accepted.tier, GRANT2_TIER); assert.equal(accepted.priorRequests, 3); assert.equal(accepted.cumulativeCeiling, 5);
  for (const patch of [{ actor: 'Umesh' }, { scope: 'single-question-pilot' }, { id: 'arbitrary' }, { sourceCandidateSha256: digest('old-code') },
    { corpusSha256: digest('foreign-corpus') }, { configSha256: digest('foreign-config') }, { baselineLedgerSha256: digest('reset') }, { questionId: 'easier-question' },
    { expiresAt: new Date(f.now - 1).toISOString() }]) {
    writeFileSync(f.path, JSON.stringify({ ...f.approval, ...patch })); assert.throws(() => validatePilotAuthorization(f.path, f.corpus, f.c, f.now, root));
  }
  writeFileSync(f.path, JSON.stringify(f.approval));
  assert.throws(() => validatePilotAuthorization(join(root, 'foreign.json'), f.corpus, f.c, f.now, root));
  await assert.rejects(evaluate({ corpus: f.corpus, config: f.c, directory: join(root, 'unbound') }), /canonical authorization path/);
}));
test('grant2 cumulative ledger permits only two physical calls across fresh transport instances', async () => temporary(async root => {
  const f = grant2Fixture(root), auth = validatePilotAuthorization(f.path, f.corpus, f.c, f.now, root); let calls = 0;
  const request = { kind: 'http', method: 'POST', url: 'https://ollama.com/api/chat', body: { model: 'glm-5.3-flash', stream: false, messages: [] } };
  const make = () => boundedTransport(initialState(f.corpus, f.c), async () => { calls++; return response({}); }, () => {}, new AbortController().signal, undefined, () => {}, size => reservePilotAttempt(auth, f.c, size));
  await make()(request); await make()(request); await assert.rejects(make()(request), /pilot-cumulative-budget-or-identity/);
  assert.equal(calls, 2); const rows = readFileSync(auth.ledgerPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(r => r.id), [4, 5]); assert.ok(rows.every(r => r.outputReservation === 1024 && r.usage === null));
  assert.equal(readFileSync(f.baselinePath, 'utf8'), f.baseline);
}));
test('grant2 byte reservations and crash debits cannot reset with new authorization or directory', async () => temporary(async root => {
  const c = grant2Config({ limits: { ...GRANT2_CEILING, maxInputBytes: 1000, maxRequestBytes: 1000 } });
  const f = grant2Fixture(root, c), auth = validatePilotAuthorization(f.path, f.corpus, f.c, f.now, root);
  assert.equal(reservePilotAttempt(auth, c, 600), 4); // Simulated crash after reservation: never refunded.
  assert.throws(() => reservePilotAttempt(auth, c, 500), /cumulative byte/);
  assert.throws(() => reservePilotAttempt({ ...auth, sha256: digest('new-artifact') }, c, 100), /ledger identity/);
  assert.equal(reservePilotAttempt(auth, c, 400), 5);
  assert.throws(() => reservePilotAttempt(auth, c, 1), /cumulative request budget/);
  assert.equal(readFileSync(f.baselinePath, 'utf8'), f.baseline);
}));
