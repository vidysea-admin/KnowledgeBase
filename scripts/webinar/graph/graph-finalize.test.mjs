// T-050 wiring: the flag-off path is the old sequential path; the flag-on path goes through the pipeline graph. Fakes only: no child, no network, no Mongo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runPipelineTick} from '../run-pipeline.mjs';
import {withFixture, completed} from '../run-pipeline-fixtures.mjs';
import {graphEnabled} from './graph-finalize.mjs';

// The same shape as run-pipeline.test.mjs "restart resumes saved artifact with finalize": tick 1 records and leaves no proof, tick 2 recovers.
function recorder(f, artifact, onFinalize) {
  f.deps.launch = async (args, _env, onLine) => {
    f.calls.push(args);
    if (args[0] === 'record') onLine(`audio/video recording started: ${artifact}`);
    else if (onFinalize) await onFinalize(args);
    else completed(f.root, args[args.indexOf('--session-id') + 1]);
  };
}
const status = (r) => Object.values(r.operations)[0].status;

test('graphEnabled is OFF unless LKB_PIPELINE_GRAPH is exactly 1', () => {
  assert.equal(graphEnabled({}), false);
  for (const v of ['0', '', 'true', 'yes', ' 1', '1 ', 'on']) assert.equal(graphEnabled({LKB_PIPELINE_GRAPH: v}), false, JSON.stringify(v));
  assert.equal(graphEnabled({LKB_PIPELINE_GRAPH: '1'}), true);
});

test('flag OFF (unset or non-1): recovery is the sequential finalize child, byte-identical args, graph never touched', async () => {
  for (const flag of [undefined, '0', 'true']) await withFixture(async (f) => {
    if (flag !== undefined) f.deps.env.LKB_PIPELINE_GRAPH = flag;
    const artifact = join(f.root, 'saved.webm'); writeFileSync(artifact, 'partial media');
    let graphCalls = 0; f.deps.runSessionGraph = async () => { graphCalls++; };
    recorder(f, artifact, async () => {});
    assert.equal(status(await runPipelineTick(f.deps, true)), 'failed');
    const id = Object.keys(JSON.parse(readFileSync(join(f.stateDir, 'operations.json'))).operations)[0];
    recorder(f, artifact);
    assert.equal(status(await runPipelineTick(f.deps, true)), 'ready');
    assert.equal(graphCalls, 0);
    assert.deepEqual(f.calls.at(-1), ['finalize', '--video', artifact, '--session-id', id, '--title', f.calls.at(-1)[f.calls.at(-1).indexOf('--title') + 1], '--transcribe', '--process-video', '--index']);
    assert.equal(existsSync(join(f.stateDir, 'pipeline-graph')), false, 'no graph state directory is created with the flag off');
  }, true);
});

test('flag ON: recovery goes through the graph runner, not the sequential finalize child', () => withFixture(async (f) => {
  f.deps.env.LKB_PIPELINE_GRAPH = '1';
  const artifact = join(f.root, 'saved.webm'); writeFileSync(artifact, 'partial media');
  const seen = [];
  f.deps.runSessionGraph = async (input) => { seen.push(input); completed(f.root, input.id); };
  recorder(f, artifact, async () => {});
  assert.equal(status(await runPipelineTick(f.deps, true)), 'failed');
  recorder(f, artifact);
  assert.equal(status(await runPipelineTick(f.deps, true)), 'ready');
  assert.equal(seen.length, 1); assert.equal(seen[0].artifact, artifact); assert.equal(seen[0].tenantId, 'fixture');
  assert.deepEqual(f.calls.map((a) => a[0]), ['record'], 'the only launch is the record from tick 1; no sequential finalize child');
}, true));

test('flag ON: a graph that does not complete leaves the operation failed (no ready without the index marker)', () => withFixture(async (f) => {
  f.deps.env.LKB_PIPELINE_GRAPH = '1';
  const artifact = join(f.root, 'saved.webm'); writeFileSync(artifact, 'partial media');
  f.deps.runSessionGraph = async () => { throw new Error('Pipeline graph failed-terminal index:stage-failed'); };
  recorder(f, artifact, async () => {});
  await runPipelineTick(f.deps, true);
  const second = await runPipelineTick(f.deps, true);
  assert.equal(status(second), 'failed'); assert.match(Object.values(second.operations)[0].reason, /failed-terminal index:stage-failed/);
  f.deps.runSessionGraph = async () => {};
  const third = await runPipelineTick(f.deps, true);
  assert.equal(status(third), 'failed', 'a graph that returns without writing the index marker is not ready');
}, true));

test('flag ON, real graph + real file queue/run-state in a temp dir: stages run in order; failure is a dead job; the next tick runs a new generation', () => withFixture(async (f) => {
  f.deps.env.LKB_PIPELINE_GRAPH = '1';
  const artifact = join(f.root, 'saved.webm'); writeFileSync(artifact, 'partial media');
  const ran = []; let failIndexOnce = true;
  f.deps.runScript = async (_root, script, args) => {
    const id = args[0], dir = join(f.root, 'data/toc-migrated', id); ran.push(script.split('/').pop());
    if (script.endsWith('transcribe-long-session.mjs')) writeFileSync(join(dir, 'turns.json'), '[{"text":"hello"}]');
    if (script.endsWith('sync-session.mjs')) { if (failIndexOnce) { failIndexOnce = false; throw new Error('index down'); } completed(f.root, id); }
  };
  recorder(f, artifact, async (args) => {
    const id = args[args.indexOf('--session-id') + 1], dir = join(f.root, 'data/toc-migrated', id);
    assert.ok(!args.includes('--transcribe') && !args.includes('--index'), 'graph media stage launches finalize without the later stages');
    completed(f.root, id); // media stage output (source.json); the index files are rewritten by the index stage
    writeFileSync(join(dir, 'pipeline-state.json'), '{}');
  });
  await runPipelineTick(f.deps, true); // record only; its finalize is the failing no-op above
  const second = await runPipelineTick(f.deps, true);
  assert.equal(status(second), 'failed'); assert.match(Object.values(second.operations)[0].reason, /failed-terminal index:stage-failed/);
  assert.deepEqual(ran, ['transcribe-long-session.mjs', 'process-video.mjs', 'sync-session.mjs']);
  const id = Object.keys(second.operations)[0];
  const queueFile = readdirSync(join(f.stateDir, 'pipeline-graph', id, 'queue'));
  assert.ok(queueFile.length > 0);
  const queueText = readFileSync(join(f.stateDir, 'pipeline-graph', id, 'queue', queueFile.find((n) => n.endsWith('.json'))), 'utf8');
  assert.match(queueText, /"dead"/, 'D-139: a terminally failed run is a FAILED (dead) job');
  const third = await runPipelineTick(f.deps, true);
  assert.equal(status(third), 'ready');
  assert.deepEqual(ran.slice(3), ['transcribe-long-session.mjs', 'process-video.mjs', 'sync-session.mjs'], 'resubmit started a new attempt');
}, true));
