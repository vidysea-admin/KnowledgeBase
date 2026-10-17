import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonicalOperationAlert, createCanonicalAlerts} from './lifecycle-alerts.mjs';
const {readWebinarOperationState, writeWebinarOperationState} = await import('../../../packages/meeting-bot/src/calendar/state/schedule-state.ts');
const NOW = '2026-10-14T12:00:00.000Z', generation = '11111111-1111-4111-8111-111111111111';
const row = status => ({tenantId: 'tenant', status, updatedAt: NOW, title: 'Career webinar', careerGuidance: true, testData: false});
function fixture(state, sink = async () => {}) {
  const notices = [], logs = []; let writes = 0, flushes = 0;
  const alerts = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: sink}),
    flush: async () => {flushes++;}, assertOwned: () => {}, save: () => {writes++;}, enqueueNotification: id => notices.push(id),
    log: line => logs.push(line), now: () => NOW});
  return {alerts, notices, logs, writes: () => writes, flushes: () => flushes};
}

test('canonical alert projection keeps finite coverage detail, staging, exact output and no private row fields', () => {
  const input = canonicalOperationAlert('session-a', {...row('ready'), controlToken: 'private-secret', artifact: 'private-file'});
  assert.equal(input.kind, 'capture-done'); assert.equal(input.outputPath, 'data/toc-migrated/session-a');
  assert.equal(input.testData, false); assert.ok(!JSON.stringify(input).includes('private'));
  const unknown = canonicalOperationAlert('session-a', {...row('failed'), careerGuidance: undefined, testData: undefined, reason: 'private-secret'});
  assert.equal(unknown.detail, 'Coverage requires review.'); assert.equal(unknown.testData, true);
  assert.equal(canonicalOperationAlert('../foreign', row('ready')), undefined);
  assert.equal(canonicalOperationAlert('session-a', {...row('action_required'), stopDisposition: {generation}}).kind, 'capture-stopped-early');
  assert.equal(canonicalOperationAlert('session-a', {...row('queued'), reason: 'capacity-full'}).kind, 'coverage-deferred');
});

test('canonical updates/artifact events/terminal outcomes reach the configured sink in order', async () => {
  const state = {operations: {'session-a': row('recording')}}, delivered = [];
  const f = fixture(state, async input => {delivered.push(input);});
  f.alerts.operation('session-a', 'capture-started');
  f.alerts.update('session-a', {status: 'ready'}); await f.alerts.wait();
  assert.deepEqual(delivered.map(input => input.kind), ['capture-started', 'capture-done']);
  assert.deepEqual(f.notices, ['session-a']); assert.ok(f.writes() >= 2);
  assert.equal(state.operations['session-a'].schedulerAlertOutbox.length, 2, 'unacknowledged injected sink remains replayable');
});

test('discovery degradation and recovery retain the same outage identity and never copy provider error values', async () => {
  const delivered = [], state = {operations: {}, discovery: {}}, f = fixture(state, async input => {delivered.push(input);});
  const failed = {status: 'failed', lastSuccessAt: '2026-10-14T11:00:00.000Z', error: 'private-token'};
  state.discovery.calendar = failed;
  f.alerts.discovery('calendar', {status: 'healthy'}, failed);
  state.discovery.calendar = {status: 'healthy', lastSuccessAt: NOW};
  f.alerts.discovery('calendar', failed, state.discovery.calendar);
  await f.alerts.wait();
  assert.deepEqual(delivered.map(input => input.kind), ['discovery-degraded', 'discovery-recovered']);
  assert.equal(delivered[0].sessionKey, delivered[1].sessionKey); assert.ok(!JSON.stringify(delivered).includes('private-token'));
});

test('canonical replay is bounded, excludes foreign tenant rows, and flushes actual durable retries', async () => {
  const operations = Object.fromEntries(Array.from({length: 100}, (_, index) => [`session-${index}`, row('failed')]));
  operations.foreign = {...row('ready'), tenantId: 'foreign'};
  const delivered = [], f = fixture({operations}, async input => delivered.push(input));
  f.alerts.tick(); await f.alerts.wait(); assert.equal(delivered.length, 25); assert.equal(f.flushes(), 1);
  f.alerts.tick(); await f.alerts.wait(); assert.equal(delivered.length, 50); assert.equal(f.flushes(), 2);
  assert.equal(new Set(delivered.map(input => input.sessionKey)).size, 50);
  f.alerts.operation('foreign'); await f.alerts.wait(); assert.equal(delivered.length, 50);
});

test('saturated started event survives real durable write, terminal transition, old lookback and restart replay', {timeout: 15000}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lkb-scheduler-alert-outbox-')), file = join(directory, 'operations.json'), logs = [];
  let state = {version: 1, tenantId: 'tenant', operations: Object.fromEntries(Array.from({length: 51}, (_, n) => [`session-${n}`, {...row('recording'), updatedAt: '2026-09-01T00:00:00.000Z'}]))};
  let release; const held = new Promise(resolve => {release = resolve;});
  const accepted = {email: 'sent', dashboard: 'sent', calendar: 'disabled'};
  const make = sink => createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: sink}), assertOwned: () => {},
    save: () => writeWebinarOperationState(file, state), enqueueNotification: () => {}, log: message => logs.push(message), now: () => NOW});
  try {
    const initial = make(async () => {await held; return accepted;});
    for (const id of Object.keys(state.operations)) initial.operation(id, 'capture-started');
    initial.update('session-50', {status: 'ready'});
    state.operations['session-50'].updatedAt = '2026-09-01T00:00:00.000Z'; writeWebinarOperationState(file, state);
    const durable = readWebinarOperationState(file, 'tenant', NOW);
    assert.deepEqual(durable.operations['session-50'].schedulerAlertOutbox.map(input => input.kind), ['capture-started', 'capture-done']);
    assert.ok(logs.some(message => message.includes('queue full; durable events await replay')));
    release(); await initial.wait(); state = readWebinarOperationState(file, 'tenant', NOW);
    const replayed = [], restarted = make(async input => {replayed.push(input); return accepted;});
    for (let n = 0; n < 3; n++) {restarted.tick(); await restarted.wait();}
    assert.deepEqual(replayed.filter(input => input.sessionKey === 'session-50').map(input => input.kind), ['capture-started', 'capture-done']);
    assert.deepEqual(readWebinarOperationState(file, 'tenant', NOW).operations['session-50'].schedulerAlertOutbox, []);
  } finally {release(); rmSync(directory, {recursive: true, force: true});}
});

test('failed channel stays durable and feed acquisition preserves queued outage snapshots before first save', async () => {
  const failed = {status: 'failed', checkedAt: NOW, lastSuccessAt: '2026-10-14T11:00:00.000Z'};
  const state = {operations: {}, discovery: {calendar: failed}}, f = fixture(state, async () => ({email: 'failed', dashboard: 'sent', calendar: 'disabled'}));
  f.alerts.discovery('calendar', {status: 'healthy'}, failed); await f.alerts.wait();
  assert.equal(failed.schedulerAlertOutbox.length, 1);
  const acquired = {calendar: {status: 'healthy', checkedAt: NOW, lastSuccessAt: NOW}, gmail: {status: 'healthy', checkedAt: NOW}};
  state.discovery = f.alerts.preserveDiscovery(state.discovery, acquired);
  assert.equal(state.discovery.calendar.schedulerAlertOutbox[0].kind, 'discovery-degraded');
  f.alerts.discovery('calendar', failed, state.discovery.calendar); await f.alerts.wait();
  assert.deepEqual(state.discovery.calendar.schedulerAlertOutbox.map(input => input.kind), ['discovery-degraded', 'discovery-recovered']);
});

test('first durable transition save includes its event and restart replays after crash before enqueue', {timeout: 15000}, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'lkb-scheduler-alert-transition-'));
  const accepted = {email: 'sent', dashboard: 'sent', calendar: 'disabled'};
  try {
    for (const kind of ['capture-started', 'capture-done', 'discovery-degraded', 'discovery-recovered']) {
      const file = join(directory, `${kind}.json`), initialCalls = [], crash = new Error('fixture crash after atomic durable write');
      const failed = {status: 'failed', lastSuccessAt: '2026-10-14T11:00:00.000Z', checkedAt: NOW};
      const healthy = {status: 'healthy', lastSuccessAt: NOW, checkedAt: NOW};
      let state = {version: 1, tenantId: 'tenant', operations: {'session-a': row('recording')},
        discovery: {calendar: kind === 'discovery-recovered' ? failed : healthy, gmail: healthy}}, writes = 0;
      const initial = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: async input => {initialCalls.push(input); return accepted;}}),
        assertOwned: () => {}, save: () => {writes++; writeWebinarOperationState(file, state); throw crash;},
        enqueueNotification: () => {throw new Error('notification must follow durable commit');}, log: () => {}, now: () => NOW});
      assert.throws(() => {
        if (kind === 'capture-started') initial.update('session-a', {artifact: 'fixture-recording.webm'}, kind);
        else if (kind === 'capture-done') initial.update('session-a', {status: 'ready'});
        else initial.acquireDiscovery({calendar: kind === 'discovery-degraded' ? failed : healthy, gmail: healthy});
      }, error => error === crash);
      await initial.wait(); assert.equal(writes, 1); assert.deepEqual(initialCalls, []);
      state = readWebinarOperationState(file, 'tenant', NOW);
      const carrier = kind.startsWith('capture-') ? state.operations['session-a'] : state.discovery.calendar;
      assert.deepEqual(carrier.schedulerAlertOutbox.map(input => input.kind), [kind]);
      if (kind === 'capture-started') assert.equal(carrier.artifact, 'fixture-recording.webm');
      if (kind === 'capture-done') assert.equal(carrier.status, 'ready');
      if (kind.startsWith('discovery-')) assert.equal(carrier.status, kind === 'discovery-degraded' ? 'failed' : 'healthy');
      const replayed = [], restarted = createCanonicalAlerts({state, tenantId: 'tenant', autojoin: () => ({raise: async input => {replayed.push(input); return accepted;}}),
        assertOwned: () => {}, save: () => writeWebinarOperationState(file, state), enqueueNotification: () => {}, log: () => {}, now: () => NOW});
      restarted.tick(); await restarted.wait(); assert.deepEqual(replayed.map(input => input.kind), [kind]);
      const durable = readWebinarOperationState(file, 'tenant', NOW);
      assert.deepEqual((kind.startsWith('capture-') ? durable.operations['session-a'] : durable.discovery.calendar).schedulerAlertOutbox, []);
    }
  } finally {rmSync(directory, {recursive: true, force: true});}
});
