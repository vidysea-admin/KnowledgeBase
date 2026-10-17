import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runPipelineTick} from '../run-pipeline.mjs';
import {NOW, event, withFixture, completed} from '../run-pipeline-fixtures.mjs';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const flush = () => new Promise(resolve => setImmediate(resolve));
function serviceFixture(f) {
  f.deps.env.LKB_JOIN_RULES_ENFORCE = 'last-valid';
  f.deps.captureSlots = ['career-a', 'career-b']; f.deps.validateCaptureSlots = async slots => assert.deepEqual(slots, f.deps.captureSlots);
  f.deps.captureSlotSupports = () => true; f.deps.validateCaptureSlot = async () => {}; f.deps.refreshSchedulerPolicy = async () => true;
  f.deps.flushSchedulerAlerts = async () => {};
  f.deps.applyJoinRules = async selection => selection;
  f.deps.autojoin = {cfg: {discovery: true, webinarAutoJoin: true, careerPriority: true, testDataRouting: true},
    topic: {keywords: ['career'], weights: {title: 3, description: 1, sender: 2}, minScore: 3},
    tagsDir: join(f.root, 'raw/webinars/capture-tags'), raise: async () => {}};
}

test('canonical autonomous acquisition continues during two owned captures; capacity and career priority are durable', {timeout: 15000}, () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), started = deferred(), pending = new Map(), launched = [];
  let time = Date.parse(NOW), waits = 0;
  const rows = [event({id: 'test-a', title: 'University webinar test'}),
    event({id: 'career', title: 'Career guidance webinar', meetingUrl: 'https://meeting.zoho.com/meeting/456'}),
    event({id: 'test-b', title: 'University webinar test B', meetingUrl: 'https://meeting.zoho.com/meeting/789'})];
  f.deps.now = () => new Date(time).toISOString(); f.deps.loadCalendarEvents = async () => rows;
  f.deps.launch = async args => {
    const id = args[args.indexOf('--session-id') + 1], hold = deferred(); pending.set(id, hold); launched.push(args);
    if (launched.length === 2) started.resolve(); await hold.promise; completed(f.root, id);
  };
  f.deps.schedulerWait = async ms => {
    waits++; assert.equal(ms, 300000); await started.promise; await flush();
    const state = JSON.parse(readFileSync(join(f.stateDir, 'operations.json'), 'utf8'));
    if (waits === 1) {
      assert.equal(launched.length, 2); assert.match(launched[0][launched[0].indexOf('--title') + 1], /Career/);
      assert.equal(Object.values(state.operations).filter(row => row.status === 'recording').length, 2);
      assert.ok(Object.values(state.operations).some(row => row.status === 'queued' && row.reason === 'capacity-full'));
      assert.notEqual(launched[0][launched[0].indexOf('--capture-slot') + 1], launched[1][launched[1].indexOf('--capture-slot') + 1]);
      pending.get(launched[0][launched[0].indexOf('--session-id') + 1]).resolve(); await flush();
    } else {
      assert.equal(launched.length, 3); for (const hold of pending.values()) hold.resolve(); stop.abort();
    }
    time += ms;
  };
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(waits, 2); assert.equal(launched.length, 3);
  assert.equal(Object.values(result.operations).filter(row => row.status === 'ready').length, 3);
  assert.ok(!existsSync(join(f.stateDir, 'poller.lock'))); assert.ok(!f.logs.join('\n').includes('private'));
}, true));

test('autonomous rule vetoes are persisted even with no allowed schedule and cannot launch', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(); let checked = 0;
  f.deps.applyJoinRules = async selection => {checked++; return {toSchedule: [], skipped: [...selection.skipped,
    ...selection.toSchedule.map(item => ({sessionKey: item.sessionKey, source: item.source, sourceId: item.sourceId, title: item.title, reason: 'opted-out'}))]};};
  f.deps.schedulerWait = async () => stop.abort();
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.ok(checked > 0); assert.equal(f.calls.length, 0);
  assert.ok(Object.values(result.operations).some(row => row.status === 'action_required' && row.reason === 'opted-out'));
}, true));

test('automatic service refuses unenforced rules and absent real slot readiness before discovery', () => withFixture(async f => {
  serviceFixture(f); let loads = 0; f.deps.loadCalendarEvents = async () => {loads++; return [];};
  for (const mode of ['off', 'fail-open', 'typo']) {
    f.deps.env.LKB_JOIN_RULES_ENFORCE = mode;
    await assert.rejects(runPipelineTick(f.deps, true, {watch: true}), /enforced tenant-bound/);
  }
  f.deps.env.LKB_JOIN_RULES_ENFORCE = 'last-valid'; delete f.deps.validateCaptureSlots;
  await assert.rejects(runPipelineTick(f.deps, true, {watch: true}), /capture-slot readiness/); assert.equal(loads, 0);
}, true));

test('one owned capture failure never stops another owned slot or creates a false ready state', {timeout: 15000}, () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), started = deferred(); let calls = 0;
  f.deps.loadCalendarEvents = async () => [event(), event({id: 'second', meetingUrl: 'https://meeting.zoho.com/meeting/456'})];
  f.deps.launch = async args => {calls++; if (calls === 2) started.resolve();
    if (calls === 1) throw new Error('first capture failed'); completed(f.root, args[args.indexOf('--session-id') + 1]);};
  f.deps.schedulerWait = async () => {await started.promise; await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(calls, 2); assert.equal(Object.values(result.operations).filter(row => row.status === 'ready').length, 1);
  assert.equal(Object.values(result.operations).filter(row => row.status === 'failed').length, 1);
}, true));

test('a completed index marker cannot bypass graph recovery acknowledgement after interrupted completion', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), id = 'recovery-one'; let resumed = 0;
  completed(f.root, id); f.deps.env.LKB_PIPELINE_GRAPH = '1'; f.deps.loadCalendarEvents = async () => [];
  writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture', operations: {
    [id]: {tenantId: 'fixture', status: 'failed', attempts: 0, captureSlot: 'career-a', graphSourceFingerprint: 'approved-source-fingerprint'}}}));
  f.deps.runSessionGraph = async () => {resumed++; throw new Error('index written before acknowledgement');};
  f.deps.schedulerWait = async () => {await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(resumed, 1); assert.equal(result.operations[id].status, 'failed'); assert.equal(f.calls.length, 0);
}, true));

test('shutdown after recording disposition but before child microtask prevents launch and retains queued work', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), disposition = deferred();
  f.deps.log = line => {f.logs.push(line); if (line.endsWith(': recording')) {stop.abort(); disposition.resolve();}};
  // The cadence wait must not abort before the capture reaches the boundary under test.
  f.deps.schedulerWait = async () => disposition.promise;
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.ok(f.logs.some(line => line.endsWith(': recording')));
  assert.equal(f.calls.length, 0);
  assert.ok(Object.values(result.operations).some(row => row.status === 'queued' && row.reason === 'service-stopped' && row.attempts === 0));
  const persisted = JSON.parse(readFileSync(join(f.stateDir, 'operations.json'), 'utf8'));
  assert.deepEqual(persisted.operations, result.operations);
}, true));

test('autonomous recovery gates legacy default-workspace artifacts instead of allocating an unrelated slot', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), id = 'legacy-default'; f.deps.loadCalendarEvents = async () => [];
  writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture', operations: {
    [id]: {tenantId: 'fixture', status: 'processing', attempts: 1, artifact: join(f.root, 'proof.webm')}}}));
  f.deps.schedulerWait = async () => stop.abort();
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(f.calls.length, 0); assert.equal(result.operations[id].status, 'action_required');
  assert.equal(result.operations[id].reason, 'capture-slot-unavailable');
}, true));

test('owned slot recovery passes the persisted slot to the child and preserves its durable identity', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), id = 'owned-recovery'; f.deps.loadCalendarEvents = async () => [];
  writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture', operations: {
    [id]: {tenantId: 'fixture', status: 'processing', attempts: 1, captureSlot: 'career-b', artifact: join(f.root, 'proof.webm')}}}));
  f.deps.launch = async args => {f.calls.push(args); completed(f.root, id);};
  f.deps.schedulerWait = async () => {await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][f.calls[0].indexOf('--capture-slot') + 1], 'career-b');
  assert.equal(result.operations[id].captureSlot, 'career-b'); assert.equal(result.operations[id].status, 'ready');
}, true));

test('canonical recording publication failure stops its actual controller and prevents a false ready result', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), childStopped = deferred(), calls = [];
  let launches = 0, waits = 0;
  f.deps.env.LKB_CAPTURE_CONTROL_DIR = join(f.root, 'private-controls');
  const control = {generation: '11111111-1111-4111-8111-111111111111', stop: async reason => {calls.push(reason); childStopped.resolve(); return 'accepted';}};
  f.deps.publishCaptureControl = async input => {
    assert.equal(input.control, control); assert.equal(input.tenantId, 'fixture');
    throw new Error('private credential detail');
  };
  f.deps.launch = async (args, env, onLine, onControl) => {
    launches++; onControl(control); await childStopped.promise;
    completed(f.root, args[args.indexOf('--session-id') + 1]);
  };
  f.deps.schedulerWait = async () => {await childStopped.promise; await flush(); if (++waits === 2) stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.deepEqual(calls, ['cancelled']);
  assert.equal(launches, 1); assert.equal(waits, 2);
  assert.equal(Object.values(result.operations)[0].status, 'action_required');
  assert.equal(Object.values(result.operations)[0].reason, 'privacy-controller-unavailable');
  assert.deepEqual(Object.values(result.operations)[0].stopDisposition, {tenantId: 'fixture', sessionId: Object.keys(result.operations)[0],
    generation: '11111111-1111-4111-8111-111111111111', reason: 'cancelled', requestedAt: new Date(NOW).toISOString()});
  assert.ok(!JSON.stringify(result).includes('private credential detail'));
}, true));

test('canonical pool uses only accepted matching capabilities and keeps unsupported coverage queued', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController();
  f.deps.loadCalendarEvents = async () => [event(), event({id: 'unsupported', meetingUrl: 'https://meeting.zoho.com/meeting/456'})];
  f.deps.captureSlotSupports = (slot, item) => slot === 'career-b' && !item.meetingUrl.includes('456');
  f.deps.validateCaptureSlot = async (slot, item) => assert.equal(f.deps.captureSlotSupports(slot, item), true);
  f.deps.launch = async args => {f.calls.push(args); completed(f.root, args[args.indexOf('--session-id') + 1]);};
  f.deps.schedulerWait = async () => {await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][f.calls[0].indexOf('--capture-slot') + 1], 'career-b');
  assert.ok(Object.values(result.operations).some(row => row.status === 'queued' && row.reason === 'capture-slot-unavailable'));
}, true));

test('fresh slot validation refuses capture when previously accepted evidence is revoked', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(); let checks = 0;
  f.deps.validateCaptureSlot = async () => {checks++; throw new Error('Capture slot evidence revoked');};
  f.deps.schedulerWait = async () => {await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(checks, 1); assert.equal(f.calls.length, 0);
  assert.ok(Object.values(result.operations).some(row => row.status === 'failed' && row.reason === 'Capture slot evidence revoked'));
}, true));

test('disabled refreshed scheduler controls prevent discovery, registration and capture admissions', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(); let loads = 0;
  f.deps.refreshSchedulerPolicy = async () => false;
  f.deps.loadCalendarEvents = async () => {loads++; return [event()];};
  f.deps.schedulerWait = async () => stop.abort();
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.equal(loads, 0); assert.equal(f.calls.length, 0); assert.deepEqual(result.operations, {});
}, true));

test('active capture loses verified authority, stops its owned generation, and cannot become ready', () => withFixture(async f => {
  serviceFixture(f); const stop = new AbortController(), ended = deferred(), stops = [];
  let validations = 0;
  f.deps.validateTenant = async () => {if (++validations === 5) throw new Error('foreign API tenant');};
  f.deps.captureWait = async () => {};
  f.deps.launch = async (args, env, onLine, onControl) => {
    onControl({generation: '11111111-1111-4111-8111-111111111111', stop: async reason => {
      stops.push(reason); ended.resolve(); return 'accepted';
    }});
    await ended.promise; completed(f.root, args[args.indexOf('--session-id') + 1]);
  };
  f.deps.schedulerWait = async () => {await ended.promise; await flush(); stop.abort();};
  const result = await runPipelineTick(f.deps, true, {watch: true, signal: stop.signal});
  assert.deepEqual(stops, ['cancelled']);
  assert.equal(Object.values(result.operations)[0].status, 'action_required');
  assert.equal(Object.values(result.operations)[0].reason, 'coverage-review');
  assert.equal(Object.values(result.operations)[0].stopDisposition.generation, '11111111-1111-4111-8111-111111111111');
}, true));
