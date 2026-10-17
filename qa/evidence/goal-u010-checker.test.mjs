// Independent checker probes. Every response/approval here is SYNTHETIC, never live evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, rmdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { hash, freezeCorpus } from '../../scripts/eval/u010-corpus.mjs';
import { runBounded } from '../../scripts/eval/u010-baseline-run.mjs';
import { providerConfiguration, productionScorer } from '../../scripts/eval/u010-provider.mjs';
import { loadSnapshot, acquireCheckpoint } from '../../scripts/eval/u010-state.mjs';
import { auditRun } from '../../scripts/eval/u010-baseline-audit.mjs';

const evidenceRoot = resolve('qa/evidence');
const configuration = providerConfiguration('ollama', 'glm-5.3-flash', 'recall', 'synthetic-test');
const limits = { maxCalls: 6, maxSeconds: 5, callTimeoutMs: 40 };
function bind(value) { return { ...value, sha256: hash(JSON.stringify(value)) }; }
function fixture(sources = []) {
  const candidateIds = ['a', 'b', 'c'];
  const questions = [{ id: 'q1', query: 'student question', expectedSessionId: 'c' }, { id: 'q2', query: 'another question', expectedSessionId: 'a' }];
  return bind({ format: 'u010-corpus-v1', tenantId: 'toc', questionIds: questions.map(q => q.id), candidateIds, questions,
    nodes: candidateIds.map(sessionId => ({ sessionId, node: { node_id: sessionId, title: sessionId, summary: 'bound summary', level: 'session', children: [] } })),
    sources, promptSha256: hash('synthetic'), provenance: { sessions: 23 }, references: null, limitations: ['SYNTHETIC CHECKER ONLY'] });
}
const scorerFactory = async (config, transport) => async (query, node) => {
  const result = await transport({ kind: 'http', method: 'POST', url: `${config.origin}/api/chat`, body: { query, title: node.title }, headers: {} });
  return { score: result.body.score, fallback: false, reasonClass: 'synthetic', reasonSha256: hash('synthetic') };
};
const http = async request => ({ status: 200, body: { score: request.body.title === 'c' ? 1 : 0.2 } });
async function temporary(body) {
  const directory = mkdtempSync(join(evidenceRoot, 'goal-u010-checker-tmp-'));
  try { return await body(directory); }
  finally {
    assert.ok(resolve(directory).startsWith(evidenceRoot + sep));
    assert.match(directory, /goal-u010-checker-tmp-[^\\/]+$/);
    rmSync(directory, { recursive: true, force: true });
  }
}

test('A8/A14 each call is durably reserved before HTTP; cumulative resume honors actual receipts', () => temporary(async root => {
  const directory = join(root, 'checkpoint'); let observed = 0;
  const witness = async req => {
    const state = loadSnapshot(directory);
    assert.equal(state.attempts.length, ++observed);
    assert.equal(state.attempts.at(-1).status, 'inflight');
    assert.equal(state.attempts.at(-1).id, observed);
    return http(req);
  };
  const partial = await runBounded({ corpus: fixture(), configuration, limits: { ...limits, maxCalls: 2 }, directory, scorerFactory, http: witness });
  assert.deepEqual(partial.report.scoredIds, []);
  assert.deepEqual(partial.report.unscoredIds, ['q1', 'q2']);
  assert.deepEqual(partial.report.partiallyAttemptedIds, ['q1']);
  assert.equal(partial.report.mixed.recallAtK, null);
  const complete = await runBounded({ corpus: fixture(), configuration, limits, directory, resume: true, scorerFactory, http: witness });
  assert.equal(observed, 6);
  assert.equal(complete.report.calls.attempted, 6);
  assert.deepEqual(complete.report.scoredIds, ['q1', 'q2']);
  assert.deepEqual(auditRun(loadSnapshot(directory)).rows, complete.report.rows);
}));

test('A8/A9 actual production scorer sees per-HTTP abort and discloses fallback without raw secrets', () => temporary(async root => {
  const directory = join(root, 'timeout'); const previous = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      calls++; assert.equal(options.redirect, 'error');
      return new Promise((_resolve, reject) => {
        const abort = () => reject(new Error('synthetic-secret-must-not-persist'));
        if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
      });
    };
    // Keep the event loop alive while AbortSignal.timeout's timer is deliberately unref'ed.
    const keepAlive = setInterval(() => {}, 25);
    let result;
    try { result = await runBounded({ corpus: fixture(), configuration, limits: { ...limits, maxCalls: 1 }, directory, scorerFactory: productionScorer, env: { OLLAMA_API_KEY: 'synthetic-checker-key' } }); }
    finally { clearInterval(keepAlive); }
    assert.equal(calls, 1); assert.equal(result.report.calls.failed, 1);
    assert.equal(result.report.calls.fallbackCells, 1);
    assert.equal(result.report.terminalStatus, 'call-cap');
    assert.equal(result.report.pureProvider.recallAtK, null);
    assert.match(result.report.warning, /DEGRADED/);
    assert.ok(!JSON.stringify(loadSnapshot(directory)).includes('synthetic-secret-must-not-persist'));
  } finally { globalThis.fetch = previous; }
}));

test('A2/A14 source drift during factory loading stops before HTTP and cannot be resumed after bytes restore', () => temporary(async root => {
  const file = join(root, 'bound-source.txt'); writeFileSync(file, 'initial');
  const corpus = fixture([{ path: 'bound-source.txt', bytes: 7, sha256: hash('initial') }]);
  let calls = 0;
  const result = await runBounded({ corpus, configuration, limits, directory: join(root, 'drift'), inputRoot: root,
    scorerFactory: async () => { writeFileSync(file, 'changed'); return () => { throw new Error('must never score'); }; },
    http: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal(result.report.sourceDriftDetected, true);
  assert.equal(result.report.terminalStatus, 'source-drift');
  assert.equal(result.report.fullPopulationScored, false);
  writeFileSync(file, 'initial');
  await assert.rejects(runBounded({ corpus, configuration, limits, directory: join(root, 'drift'), inputRoot: root, resume: true, scorerFactory, http }), /source-drift/);
}));

test('A12 real exported entry rejects fabricated human proof even when typed flags and current corpus checksum agree', () => temporary(async root => {
  const current = await freezeCorpus(resolve('.'), 'toc');
  const { sha256: ignored, ...value } = current;
  value.references = { pairs: Array.from({ length: 30 }, (_, i) => ({ id: `forged${i}`, query: 'synthetic', sessionId: current.candidateIds[0], node: current.nodes[0].node, referenceScore: 0.5 })) };
  value.humanVerification = { operatorBound: true, verifiedReceiptSha256: 'a'.repeat(64) };
  value.humanProofInputs = { reviewExport: 'qa/evidence/goal-u010-checker-NONEXISTENT-export.json', humanConfirmations: 'qa/evidence/goal-u010-checker-NONEXISTENT-confirmations.json', verifiedReceipt: 'qa/evidence/goal-u010-checker-NONEXISTENT-receipt.json' };
  const previous = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new Error('network must not be reached'); };
    await assert.rejects(runBounded({ corpus: bind(value), configuration: providerConfiguration('ollama', 'glm-5.3-flash', 'calibration'), limits,
      directory: join(root, 'forged'), computeMAE: () => {}, env: { OLLAMA_API_KEY: 'synthetic' } }), /operator evidence changed/);
    assert.equal(calls, 0); assert.equal(existsSync(join(root, 'forged')), false);
  } finally { globalThis.fetch = previous; }
}));

test('A14 PID acquisition guards refuse live and ambiguous owners while verified dead guards recover', () => temporary(async root => {
  const directory = join(root, 'owners'); mkdirSync(directory);
  const suffix = '00000000-0000-0000-0000-000000000000';
  const live = join(directory, `.acquire-lock-${process.pid}-${suffix}`); mkdirSync(live);
  assert.throws(() => acquireCheckpoint(directory, true), /live\/unverifiable/);
  assert.equal(existsSync(live), true); rmdirSync(live);
  const ambiguous = join(directory, '.acquire-lock'); mkdirSync(ambiguous);
  assert.throws(() => acquireCheckpoint(directory, true), /unknown/);
  assert.equal(existsSync(ambiguous), true); rmdirSync(ambiguous);
  const deadPid = 2147483647;
  assert.throws(() => process.kill(deadPid, 0), error => error.code === 'ESRCH');
  const dead = join(directory, `.acquire-lock-${deadPid}-${suffix}`); mkdirSync(dead);
  const release = acquireCheckpoint(directory, true);
  assert.equal(existsSync(dead), false); release();
  // Same PID + millisecond is possible for two exported callers: refusal must not
  // delete the first caller's owner lock. Freeze time only inside this fixture.
  const originalNow = Date.now;
  try {
    Date.now = () => 1700000000000;
    const firstRelease = acquireCheckpoint(directory, true);
    assert.throws(() => acquireCheckpoint(directory, true), /live\/unverifiable/);
    assert.equal(existsSync(join(directory, '.owner-lock')), true, 'refused same-process contender deleted another caller owner lock');
    firstRelease();
  } finally { Date.now = originalNow; }
}));

test('A7/A9 audit rejects unknown or foreign receipts and duplicate scored cells instead of counting them', () => temporary(async root => {
  const result = await runBounded({ corpus: fixture(), configuration, limits, directory: join(root, 'audit'), scorerFactory, http });
  const state = loadSnapshot(join(root, 'audit'));
  const variants = [
    s => { s.attempts[0].status = 'unknown'; },
    s => { s.attempts[0].sessionId = 'foreign'; },
    s => { s.cells.push({ ...s.cells[0] }); },
    s => { s.attempts[0].status = 'failed'; },
  ];
  for (const change of variants) { const copy = structuredClone(state); change(copy); assert.throws(() => auditRun(copy)); }
  assert.equal(auditRun(state).calls.attempted, result.report.calls.attempted);
}));
