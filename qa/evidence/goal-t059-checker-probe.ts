import assert from 'node:assert/strict';
import { rig, ORIGINAL } from '../../apps/api/src/evaluation-flywheel/test-fixture.js';
import { buildTestDeps, fakeKeyStore } from '../../apps/api/src/fixtures.js';
import { startTestServer } from '../../apps/api/src/testUtils.js';
import { buildEvaluationIntegrations } from '../../apps/api/src/composition/integrations/evaluation.js';
import { FlywheelError } from '../../apps/api/src/evaluation-flywheel/types.js';

const started = new Date().toISOString(), counts: Record<string, number> = {};
const base = buildTestDeps();
if (!process.argv.includes('--isolated')) {
const r = rig(); await r.workflow().open('t', 'loss');
r.tables.gaps![0]!.flywheel.lock = { token: 'PRIVATE_LOCK_TOKEN', requestId: 'held', expiresAt: '2099-01-01T00:00:00Z' };
const all = ['compete', 'gaps', 'ingest', 'ask'];
const server = await startTestServer(buildTestDeps({ evaluationFlywheel: r.workflow(),
  keyStore: fakeKeyStore({ full: { tenantId: 't', scopes: all }, gaps: { tenantId: 't', scopes: ['gaps'] },
    foreign: { tenantId: 'b', scopes: all } }),
  brain: { ...base.brain, listGaps: async () => [...r.tables.gaps!, { ...r.tables.gaps![0], tenantId: 'b', description: 'FOREIGN_SECRET' }] as never } }));
async function req(path: string, key?: string, body?: unknown) {
  const response = await fetch(`${server.baseUrl}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() as any };
}
try {
  assert.equal((await req('/evaluations/loss/flywheel')).status, 401);
  assert.equal((await req('/evaluations/loss/flywheel', 'gaps')).status, 403);
  assert.equal((await req('/evaluations/loss/flywheel', 'foreign')).status, 404);
  const listed = await req('/gaps', 'gaps'); assert.equal(listed.status, 200); assert.equal(listed.body.gaps.length, 1);
  assert.equal(listed.body.gaps[0].flywheel, undefined);
  for (const secret of ['PRIVATE_LOCK_TOKEN', ORIGINAL.question, 'FOREIGN_SECRET']) assert.ok(!JSON.stringify(listed.body).includes(secret));
  const inspect = await req('/evaluations/loss/flywheel', 'full'); assert.equal(inspect.status, 200);
  assert.equal(inspect.body.flywheel.loss.question, ORIGINAL.question); assert.equal(inspect.body.flywheel.lock.token, undefined);
  assert.equal(inspect.body.flywheel.lock.requestId, 'held');
  assert.equal((await req('/evaluations/loss/retest', 'full', { sourceUrl: 'https://example.org/session', requestId: 'a', tenantId: 'b' })).status, 400);
  counts.currentMountAuthPrivacy = 14;
} finally { await server.close(); }
}

let sideEffects = 0;
const fixture = rig();
const input: any = { db: fixture.db, env: {}, root: process.cwd(), index: async () => { sideEffects++; },
  ask: { ...base.ask, requestDepsFor: () => { sideEffects++; return {}; } },
  sourceIntake: { intake: async () => { sideEffects++; } }, routing: {} };
for (const [env, name, intake, bound] of [
  [{}, 'lkb_t059_checker', true, true],
  [{ LKB_EVALUATION_FLYWHEEL: '1' }, 'lkb_t059_checker', true, true],
  [{ LKB_EVALUATION_FLYWHEEL: '1', LKB_SOURCE_INTAKE: '1' }, 'lkb', true, true],
  [{ LKB_EVALUATION_FLYWHEEL: '1', LKB_SOURCE_INTAKE: '1' }, 'lkb_t059_checker', false, true],
  [{ LKB_EVALUATION_FLYWHEEL: '1', LKB_SOURCE_INTAKE: '1' }, 'lkb_t059_checker', true, false],
] as const) {
  const candidate = { ...input, env, db: { ...fixture.db, databaseName: name }, sourceIntake: intake ? input.sourceIntake : undefined,
    ask: { ...input.ask, requestDepsFor: bound ? input.ask.requestDepsFor : undefined } };
  assert.equal(buildEvaluationIntegrations(candidate).evaluationFlywheel, undefined);
}
const configured = buildEvaluationIntegrations({ ...input, env: { LKB_EVALUATION_FLYWHEEL: '1', LKB_SOURCE_INTAKE: '1' } });
assert.ok(configured.evaluationFlywheel); assert.equal(sideEffects, 0); counts.factoryGuards = 7;

for (const drift of ['original-score', 'captured-turn'] as const) {
  const f = rig(), w = f.workflow(), request = { sourceUrl: 'https://example.org/session', requestId: 'completed' };
  await w.open('t', 'loss'); const child = await w.retest('t', 'loss', request);
  const childBefore = structuredClone(f.tables.eval_runs!.find(row => row._id === child._id));
  if (drift === 'original-score') f.tables.eval_runs![0]!.score.ai = 2;
  else f.tables.turns![0]!.text = 'Changed after the completed child was saved.';
  await assert.rejects(f.workflow().retest('t', 'loss', request), (error: unknown) => error instanceof FlywheelError && error.code === 'input_drift');
  assert.deepEqual(f.tables.eval_runs!.find(row => row._id === child._id), childBefore);
  assert.deepEqual(f.calls, { intake: 1, index: 1, ask: 1 });
}
counts.completedChildDrift = 6;
{
  const f = rig(), w = f.workflow(); await w.open('t', 'loss');
  const firstRequest = { sourceUrl: 'https://example.org/session', requestId: 'first' };
  const first = await w.retest('t', 'loss', firstRequest);
  const second = await w.retest('t', 'loss', { ...firstRequest, requestId: 'second' });
  assert.notEqual(first._id, second._id);
  assert.equal((await w.inspect('t', 'loss')).flywheel.lastRetestId, second._id);
  assert.deepEqual(await w.retest('t', 'loss', firstRequest), first);
  assert.equal((await w.inspect('t', 'loss')).flywheel.lastRetestId, second._id,
    'replaying a completed historical request must not regress the current head to an older accepted child');
  counts.historicalReplay = 4;
}
console.log(JSON.stringify({ startedAt: started, completedAt: new Date().toISOString(), counts, result: 'PASS', externalCalls: 0 }));
