/** Synthetic engineering fixtures only: actual production graph, no human labels or real corpus copies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluate, digest, PILOT, FULL_CEILING, initialState, boundedTransport, checkpoint, frozenDb, validateConfig, validateAuthorization, sourcePairIdentity } from './vectorless-production-eval.mjs';
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
