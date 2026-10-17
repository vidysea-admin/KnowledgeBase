import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { hash, freezeCorpus, verifyLoadedImplementation } from './u010-corpus.mjs';
import { providerConfiguration, productionScorer, boundedHttp } from './u010-provider.mjs';
import { runBounded, validateLimits, validatePredecessors } from './u010-baseline-run.mjs';
import { loadSnapshot, saveSnapshot, acquireCheckpoint } from './u010-state.mjs';
import { auditRun, auditHistorical } from './u010-baseline-audit.mjs';
import { pathToFileURL } from 'node:url';

const configuration = providerConfiguration('ollama', 'glm-5.3-flash', 'recall', 'synthetic-test');
const limits = { maxCalls: 14, maxSeconds: 30, callTimeoutMs: 1000 };
function corpusFixture(references = null) {
  const candidateIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const questions = [{ id: 'q1', query: 'same question', expectedSessionId: 'g' }, { id: 'q2', query: 'same question', expectedSessionId: 'a' }];
  const value = { format: 'u010-corpus-v1', tenantId: 'toc', questionIds: questions.map((q) => q.id), candidateIds, questions,
    nodes: candidateIds.map((sessionId) => ({ sessionId, node: { node_id: sessionId, title: sessionId, summary: 'summary', level: 'session', children: [] } })),
    sources: [], promptSha256: hash('prompt'), provenance: { sessions: 23 }, references, limitations: ['SYNTHETIC TEST ONLY'] };
  return { ...value, sha256: hash(JSON.stringify(value)) };
}
const scoreFactory = async (c, transport) => async (query, node) => {
  const response = await transport({ kind: 'http', url: `${c.origin}/api/chat`, method: 'POST', headers: {}, body: { model: c.model, query, title: node.title } });
  return { score: response.body.score ?? 0, fallback: response.status !== 200 || response.body.score === undefined, reasonClass: 'test', reasonSha256: hash('test') };
};
const goodHttp = async (request) => ({ status: 200, body: { score: request.body.title === 'g' ? 1 : 0.5, prompt_eval_count: 3, eval_count: 1 } });
async function temporary(run) {
  const root = mkdtempSync(join(tmpdir(), 'u010-test-'));
  try { await run(root); } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + requirePathSeparator()) && /u010-test-[^\\/]+$/.test(root));
    rmSync(root, { recursive: true, force: true });
  }
}
function requirePathSeparator() { return process.platform === 'win32' ? '\\' : '/'; }

test('ISS-U010CHECKPOINT-001 verbatim recorded frozen-clock reproduction: 1/1 owner preserved', () => {
const directory = mkdtempSync(join(resolve('qa/evidence'), 'goal-u010-checker-lock-'));
const originalNow = Date.now;
try {
  Date.now = () => 1700000000000;
  const release = acquireCheckpoint(directory, true);
  assert.throws(() => acquireCheckpoint(directory, true), /live\/unverifiable/);
  assert.equal(existsSync(join(directory, '.owner-lock')), true, 'refused same-process contender deleted another caller owner lock');
  release();
} finally {
  Date.now = originalNow;
  assert.ok(resolve(directory).startsWith(resolve('qa/evidence') + sep));
  rmSync(directory, { recursive: true, force: true });
}
});

test('checkpoint refusal preserves exact owner; replacement file identity and post-acquisition failure stay safe', () => temporary(async root => {
  const directory = join(root, 'ownership'); mkdirSync(directory);
  const lock = join(directory, '.owner-lock');
  const release = acquireCheckpoint(directory, true);
  const token = readFileSync(lock, 'utf8');
  for (let i = 0; i < 32; i++) {
    assert.throws(() => acquireCheckpoint(directory, true), /live\/unverifiable/);
    assert.equal(readFileSync(lock, 'utf8'), token);
  }
  renameSync(lock, join(directory, 'old-lock'));
  writeFileSync(lock, token, { flag: 'wx' }); // equal bytes, different physical file
  release(); assert.equal(readFileSync(lock, 'utf8'), token);
  writeFileSync(lock, 'corrupt-owner');
  assert.throws(() => acquireCheckpoint(directory, true), /corrupt/);
  assert.equal(readFileSync(lock, 'utf8'), 'corrupt-owner');
  rmSync(lock);
  writeFileSync(join(directory, 'snapshot-00000000.json.tmp'), 'uncommitted');
  writeFileSync(join(directory, 'snapshot-00000000.json'), 'committed');
  assert.throws(() => acquireCheckpoint(directory, true), /conflicting temporary/);
  assert.equal(existsSync(lock), false); // cleanup only removes this successfully acquired lock
  assert.equal(readFileSync(join(directory, 'snapshot-00000000.json'), 'utf8'), 'committed');
  rmSync(join(directory, 'snapshot-00000000.json.tmp'));
  const again = acquireCheckpoint(directory, true);
  assert.notEqual(readFileSync(lock, 'utf8'), token); again(); again();
  mkdirSync(join(directory, '.acquire-lock-0-00000000-0000-0000-0000-000000000000'));
  assert.throws(() => acquireCheckpoint(directory, true), /live\/unverifiable/);
}));

test('full population has IDs even for duplicate question text; downstream arithmetic/control and no overwrite', () => temporary(async (root) => {
  const directory = join(root, 'run');
  const result = await runBounded({ corpus: corpusFixture(), configuration, limits, directory, scorerFactory: scoreFactory, http: goodHttp });
  assert.equal(result.report.execution, 'synthetic-test');
  assert.deepEqual(result.report.scoredIds, ['q1', 'q2']);
  assert.equal(result.report.calls.attempted, 14);
  assert.equal(result.report.mixed.recallAtK, 1);
  assert.equal(result.report.mixed.controlRecallAtK, 0.5);
  assert.equal(result.report.mixed.assessment, 'saturated');
  assert.equal(result.report.terminalStatus, 'completed');
  assert.match(result.report.calls.spend, /unknown/);
  assert.deepEqual(auditRun(loadSnapshot(directory)).mixed, result.report.mixed);
  await assert.rejects(runBounded({ corpus: corpusFixture(), configuration, limits, directory, scorerFactory: scoreFactory, http: goodHttp }), /EEXIST/);
  const delta = JSON.parse(readFileSync(join(directory, 'snapshot-00000001.json')));
  assert.ok(delta.delta && !delta.state);
}));

test('cap stops partial ranking; resume reuses verified individual receipts and completes all IDs', () => temporary(async (root) => {
  const directory = join(root, 'cap'); let calls = 0;
  const http = async (request) => { calls++; return goodHttp(request); };
  const partial = await runBounded({ corpus: corpusFixture(), configuration, limits: { ...limits, maxCalls: 8 }, directory, scorerFactory: scoreFactory, http });
  assert.equal(calls, 8); assert.equal(partial.report.terminalStatus, 'call-cap');
  assert.deepEqual(partial.report.scoredIds, ['q1']);
  assert.deepEqual(partial.report.unscoredIds, ['q2']);
  assert.deepEqual(partial.report.partiallyAttemptedIds, ['q2']);
  const full = await runBounded({ corpus: corpusFixture(), configuration, limits, directory, resume: true, scorerFactory: scoreFactory, http });
  assert.equal(calls, 14); assert.equal(full.report.fullPopulationScored, true);
  assert.equal(full.report.invocations[1].limits.maxCalls, 14);
}));

test('fallback HTTP failure contaminates a whole ranked question; pure subset gets its own control', () => temporary(async (root) => {
  let calls = 0;
  const result = await runBounded({ corpus: corpusFixture(), configuration, limits, directory: join(root, 'fallback'), scorerFactory: scoreFactory,
    http: async (req) => ++calls === 1 ? { status: 503, body: {} } : goodHttp(req) });
  assert.equal(result.report.calls.failed, 1); assert.equal(result.report.calls.returned, 13);
  assert.deepEqual(result.report.fallbackItemIds, ['q1']);
  assert.equal(result.report.pureProvider.total, 1); assert.equal(result.report.pureProvider.controlRecallAtK, 1);
  assert.match(result.report.warning, /DEGRADED/);
}));

test('deadline, cancellation and secret-bearing transport failures stay bounded and sanitized', () => temporary(async (root) => {
  let clock = 1000, calls = 0;
  const result = await runBounded({ corpus: corpusFixture(), configuration, limits: { ...limits, maxSeconds: 1 }, directory: join(root, 'deadline'), scorerFactory: scoreFactory,
    now: () => clock, http: async (req) => { calls++; clock += 1001; return goodHttp(req); } });
  assert.equal(calls, 1); assert.equal(result.report.terminalStatus, 'deadline'); assert.equal(result.report.mixed.recallAtK, null);
  const cancellation = new AbortController(); cancellation.abort();
  const cancelled = await runBounded({ corpus: corpusFixture(), configuration, limits, directory: join(root, 'cancelled'), scorerFactory: scoreFactory, signal: cancellation.signal, http: goodHttp });
  assert.equal(cancelled.report.calls.attempted, 0); assert.equal(cancelled.report.terminalStatus, 'cancelled');
  await runBounded({ corpus: corpusFixture(), configuration, limits, directory: join(root, 'secret'),
    scorerFactory: async (c, transport) => async (query, node) => { try { await transport({kind:'http',method:'POST',url:`${c.origin}/api/chat?key=SECRET`,headers:{authorization:'SECRET'},body:{}}); } catch { } return {score:0,fallback:true}; },
    http: async () => { throw new Error('SECRET key=super-secret'); } });
  for (const file of readdirSync(join(root, 'secret'))) assert.ok(!readFileSync(join(root, 'secret', file), 'utf8').includes('SECRET'));
}));

test('corrupt/drift/conflicting resume and live owner refuse before scorer factory', () => temporary(async (root) => {
  const directory = join(root, 'drift'); let factories = 0;
  await runBounded({ corpus: corpusFixture(), configuration, limits, directory, scorerFactory: scoreFactory, http: goodHttp });
  const changed = corpusFixture(); changed.questions[0].query = 'foreign';
  await assert.rejects(runBounded({ corpus: changed, configuration, limits, directory, resume: true, scorerFactory: async () => { factories++; } }), /checksum|changed/);
  assert.equal(factories, 0);
  const release = acquireCheckpoint(directory, true);
  assert.throws(() => acquireCheckpoint(directory, true), /live/); release();
  const first = join(directory, 'snapshot-00000000.json');
  const bad = JSON.parse(readFileSync(first)); bad.state.binding = 'bad'; writeFileSync(first, JSON.stringify(bad));
  assert.throws(() => loadSnapshot(directory), /checksum/);
  const input=join(root,'bound-input.json');writeFileSync(input,'one');
  const value=corpusFixture();delete value.sha256;value.sources=[{path:'bound-input.json',bytes:3,sha256:hash('one')}];
  const boundCorpus={...value,sha256:hash(JSON.stringify(value))};let paid=0;
  const importDrift=await runBounded({corpus:boundCorpus,configuration,limits,directory:join(root,'import-drift'),inputRoot:root,
    scorerFactory:async(c,t)=>{writeFileSync(input,'two');return scoreFactory(c,t);},http:async(req)=>{paid++;return goodHttp(req);}});
  assert.equal(paid,0);assert.equal(importDrift.report.sourceDriftDetected,true);assert.equal(importDrift.report.reportablePureBaseline,false);
  writeFileSync(input,'one');
  const finalDrift=await runBounded({corpus:boundCorpus,configuration,limits,directory:join(root,'final-drift'),inputRoot:root,scorerFactory:scoreFactory,
    http:async(req)=>{writeFileSync(input,'two');return goodHttp(req);}});
  assert.equal(finalDrift.report.calls.attempted,14);assert.equal(finalDrift.report.provenanceStatus,'invalid-source-drift');
  assert.equal(auditRun(loadSnapshot(join(root,'final-drift'))).sourceDriftDetected,true);
}));

test('inflight attempt recovers as unknown; completed cells cannot be rewritten in deltas', () => temporary(async (root) => {
  const directory = join(root, 'unknown');
  await runBounded({ corpus: corpusFixture(), configuration, limits: {...limits,maxCalls:1}, directory, scorerFactory:scoreFactory,http:goodHttp });
  const state = loadSnapshot(directory); state.sequence++; state.attempts.push({id:2,itemId:'q1',sessionId:'b',status:'inflight'}); saveSnapshot(directory,state);
  const orphan=join(directory,`snapshot-${String(state.sequence+1).padStart(8,'0')}.json.tmp`);writeFileSync(orphan,'interrupted uncommitted bytes');
  assert.throws(()=>process.kill(2147483647,0),error=>error.code==='ESRCH');
  mkdirSync(join(directory,'.acquire-lock-2147483647-00000000-0000-4000-8000-000000000000'));
  const result = await runBounded({corpus:corpusFixture(),configuration,limits:{...limits,maxCalls:15},directory,resume:true,scorerFactory:scoreFactory,http:goodHttp});
  assert.equal(result.report.calls.unknown,1); assert.equal(result.report.calls.attempted,15);
  const final = JSON.parse(readFileSync(result.snapshot)); final.delta.updatedAttempts=[{index:0,attempt:{...state.attempts[0],status:'failed'}}];
  final.checksum=hash(JSON.stringify({delta:final.delta}));writeFileSync(result.snapshot,JSON.stringify(final));
  assert.throws(()=>loadSnapshot(directory),/terminal receipt/);
}));

test('pending human references and invalid caps refuse before paid I/O; model order refuses missing predecessor', async () => {
  for(const maxCalls of [0,-1,1.5,Infinity,NaN]) assert.throws(()=>validateLimits({...limits,maxCalls}),/integer/);
  let factory=0;
  await assert.rejects(runBounded({corpus:corpusFixture(),configuration:{...configuration,kind:'calibration'},limits,directory:'unused',scorerFactory:async()=>{factory++;}}),/human/);
  assert.equal(factory,0);
  const asserted=corpusFixture({pairs:Array.from({length:30},(_,i)=>({id:`p${i}`,sessionId:'a',query:'q',node:{title:'a',summary:'s'},referenceScore:0.5}))});
  delete asserted.sha256;asserted.humanVerification={operatorBound:true,verifiedReceiptSha256:'a'.repeat(64)};asserted.sha256=hash(JSON.stringify(asserted));
  await assert.rejects(runBounded({corpus:asserted,configuration:providerConfiguration('ollama','glm-5.3-flash','calibration'),limits,directory:'unused',computeMAE:()=>{}}),/operator-bound/);
  assert.throws(()=>validatePredecessors(corpusFixture(),providerConfiguration('gemini','gemini-2.5-flash','recall','synthetic-test'),[]),/predecessor/);
});

test('unknown provider host and credential-bearing URLs refuse before corpus/provider transport',()=>temporary(async(root)=>{
  let calls=0;
  await assert.rejects(runBounded({corpus:corpusFixture(),configuration:{...configuration,origin:'https://unapproved.example'},limits,directory:join(root,'foreign'),scorerFactory:scoreFactory,http:async()=>{calls++;}}),/configuration\/host/);
  const result=await runBounded({corpus:corpusFixture(),configuration,limits,directory:join(root,'credentials'),
    scorerFactory:async(c,t)=>async()=>{await t({kind:'http',method:'POST',url:'https://private:secret@ollama.com/api/chat',body:{}});return{score:1,fallback:false};},
    http:async()=>{calls++;return{status:200,body:{score:1}};}});
  assert.equal(calls,0);assert.equal(result.report.calls.attempted,0);assert.equal(result.report.terminalStatus,'scorer-or-checkpoint-failure');
  const previousFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'error');return new Response('{"ok":true}',{status:200});};
    await boundedHttp({kind:'http',method:'POST',url:'https://ollama.com/api/chat',body:{}},new AbortController().signal);
  } finally {globalThis.fetch=previousFetch;}
}));

test('actual production scorer and provider use fakeHTTP through the exact bounded paid path, with no key persistence', () => temporary(async(root)=>{
  const result=await runBounded({corpus:corpusFixture(),configuration,limits,directory:join(root,'production'),scorerFactory:productionScorer,
    env:{OLLAMA_API_KEY:'fake-secret-123456'},http:async(req)=>{
      assert.equal(req.headers.authorization,'Bearer fake-secret-123456');assert.equal(req.body.model,'glm-5.3-flash');
      return {status:200,body:{message:{content:JSON.stringify({score:0.5,reason:'fake-secret-123456'})},prompt_eval_count:3,eval_count:1}};
    }});
  assert.equal(result.report.calls.returned,14);assert.equal(result.report.calls.fallbackCells,0);
  for(const file of readdirSync(join(root,'production')))assert.ok(!readFileSync(join(root,'production',file),'utf8').includes('fake-secret-123456'));
}));

test('complete verified Ollama predecessors permit Gemini LAST; actual Gemini adapter receives bounded fakeHTTP',()=>temporary(async(root)=>{
  const corpus=corpusFixture();
  const glm=await runBounded({corpus,configuration,limits,directory:join(root,'glm'),scorerFactory:scoreFactory,http:goodHttp});
  const deepseek=await runBounded({corpus,configuration:providerConfiguration('ollama','deepseek-v4.1-flash','recall','synthetic-test'),limits,directory:join(root,'deepseek'),predecessors:[glm.snapshot],scorerFactory:scoreFactory,http:goodHttp});
  let calls=0;
  const gemini=await runBounded({corpus,configuration:providerConfiguration('gemini','gemini-2.5-flash','recall','synthetic-test'),limits,directory:join(root,'gemini'),predecessors:[glm.snapshot,deepseek.snapshot],scorerFactory:productionScorer,
    env:{GEMINI_API_KEY:'fake-gemini-secret'},http:async(req)=>{
      calls++;const url=new URL(req.url);assert.equal(url.origin,'https://generativelanguage.googleapis.com');
      assert.equal(url.pathname,'/v1beta/models/gemini-2.5-flash:generateContent');assert.equal(url.searchParams.get('key'),'fake-gemini-secret');
      return{status:200,body:{candidates:[{content:{parts:[{text:JSON.stringify({score:0.5,reason:'synthetic'})}]}}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:2}}};
    }});
  assert.equal(calls,14);assert.equal(gemini.report.fullPurePopulationScored,true);assert.equal(gemini.report.invocations[0].predecessorBindings.length,2);
  for(const file of readdirSync(join(root,'gemini')))assert.ok(!readFileSync(join(root,'gemini',file),'utf8').includes('fake-gemini-secret'));
}));

// Authentic local archives/corpus are never opened or registered without this literal opt-in.
if (process.env.LKB_U010_PRIVATE_TESTS === '1') {
  const fixturePath = resolve('tmp/u010-private-tests/u010-baseline-private-cases.mjs');
  const fixtureBytes = readFileSync(fixturePath);
  assert.equal(hash(fixtureBytes), '6cb99b00c90b2b0a224e76a41c7bb4e2df19a2376e29ebab1b2de99affc005ca', 'private regression oracle changed');
  const { registerPrivateTests } = await import(pathToFileURL(fixturePath).href);
  const { exportCalibrationReferences } = await import('./calibration-review.mjs');
  registerPrivateTests({ test, assert, readFileSync, readdirSync, resolve, join, hash,
    auditHistorical, verifyLoadedImplementation, freezeCorpus, temporary,
    exportCalibrationReferences, runBounded, providerConfiguration, limits,
    scoreFactory, goodHttp });
} else {
  for (let index = 1; index <= 3; index++)
    test(`private local regression ${index}`, { skip: 'requires LKB_U010_PRIVATE_TESTS=1 and the pinned ignored local oracle' }, () => {});
}
