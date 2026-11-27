import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturePool} from './service.mjs';
import {runSchedulerCycle} from './dispatch.mjs';

test('shutdown during acquisition, registration, rules, preparation or ownership recheck admits no new capture', async () => {
  for (const phase of ['refresh', 'register', 'rules', 'launch-rules', 'prepare', 'ownership-final']) {
    const stop = new AbortController(), pool = createCapturePool(['a', 'b']), state = {operations: {}};
    let launches = 0, ownerChecks = 0, rulesChecks = 0;
    const item = {sessionKey: 'session-a', title: 'Career webinar', startTime: '2026-09-30T12:00:00Z',
      endTime: '2026-09-30T13:00:00Z', meetingUrl: 'https://meeting.zoho.com/meeting/123'};
    const c = {state, pool, signal: stop.signal, slots: ['a', 'b'], now: () => '2026-09-30T12:01:00Z', env: {},
      refresh: async () => {if (phase === 'refresh') stop.abort(); return {};},
      register: async () => {if (phase === 'register') stop.abort();},
      select: () => ({toSchedule: [item], skipped: []}), setPreview: () => {}, notify: () => {},
      update: (id, row) => {state.operations[id] = {...state.operations[id], ...row};},
      priority: () => 1, validId: () => true, reconsider: () => false, complete: () => false,
      execute: async () => {launches++;}, prepareCapture: async () => {if (phase === 'prepare') stop.abort();},
      safeText: String, log: () => {}, graphEnabled: () => false,
      deps: {refreshSchedulerPolicy: async () => true, captureSlotSupports: () => true, validateCaptureSlot: async () => {},
        validateTenant: async () => {ownerChecks++; if (phase === 'ownership-final' && ownerChecks === 2) stop.abort();},
        applyJoinRules: async selection => {rulesChecks++; if ((phase === 'rules' && rulesChecks === 1) ||
          (phase === 'launch-rules' && rulesChecks === 2)) stop.abort(); return selection;}}};
    await runSchedulerCycle(c); await pool.drain(); assert.equal(launches, 0, phase);
    assert.ok(!Object.values(state.operations).some(row => row.status === 'recording'), phase);
  }
});

/** Live 2026-11-27: a network blip before launch took queued -> failed with attempts 0, and nothing retried the row. */
function prelaunchHarness({failure, now = '2026-09-30T12:01:00Z', prior, failures = Infinity}) {
  const state = {operations: prior ? {'session-a': prior} : {}};
  const item = {sessionKey: 'session-a', title: 'Career webinar', startTime: '2026-09-30T12:00:00Z',
    endTime: '2026-09-30T13:00:00Z', meetingUrl: 'https://meeting.zoho.com/meeting/123'};
  const clock = {now}, counts = {launches: 0, validations: 0};
  const c = {state, slots: [], now: () => clock.now, env: {}, refresh: async () => ({}), register: async () => {},
    select: () => ({toSchedule: [item], skipped: []}), setPreview: () => {}, notify: () => {},
    update: (id, row) => {state.operations[id] = {...state.operations[id], ...row};},
    priority: () => 1, validId: () => true, reconsider: () => false, complete: () => false,
    execute: async () => {counts.launches++;}, prepareCapture: async () => {},
    safeText: String, log: () => {}, graphEnabled: () => false, tenantId: 't',
    deps: {captureSlotSupports: () => true, validateCaptureSlot: async () => {},
      validateTenant: async () => {counts.validations++; if (counts.validations <= failures) throw failure;}}};
  return {c, state, clock, counts};
}
const fetchFailed = () => Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error('read ECONNRESET'), {code: 'ECONNRESET'})});

test('a transient network failure before launch leaves the row queued for a later tick, never failed', async () => {
  const h = prelaunchHarness({failure: fetchFailed(), failures: 1});
  await runSchedulerCycle(h.c);
  assert.equal(h.state.operations['session-a'].status, 'queued');
  assert.equal(h.state.operations['session-a'].reason, 'prelaunch-transient');
  assert.equal(h.state.operations['session-a'].prelaunchRetries, 1);
  assert.equal(h.state.operations['session-a'].attempts ?? 0, 0);
  await runSchedulerCycle(h.c); // the next tick re-dispatches and the capture launches
  assert.equal(h.counts.launches, 1);
  assert.equal(h.state.operations['session-a'].status, 'recording');
  assert.equal(h.state.operations['session-a'].prelaunchRetries, undefined);
});

test('each narrow transient class is retried', async () => {
  const causes = [new DOMException('aborted', 'AbortError'), new DOMException('timed out', 'TimeoutError'),
    Object.assign(new TypeError('x'), {cause: {code: 'ECONNREFUSED'}}), Object.assign(new Error('x'), {cause: {code: 'ETIMEDOUT'}}),
    Object.assign(new Error('x'), {cause: {code: 'UND_ERR_CONNECT_TIMEOUT'}})];
  for (const failure of causes) {
    const h = prelaunchHarness({failure, failures: 1});
    await runSchedulerCycle(h.c);
    assert.equal(h.state.operations['session-a'].status, 'queued', String(failure.name + failure.cause?.code));
  }
});

test('a non-transient pre-launch error still fails exactly as before', async () => {
  for (const failure of [new Error('Connected API ownership mismatch'), new TypeError('x is not a function'), new Error('fetch failed')]) {
    const h = prelaunchHarness({failure});
    await runSchedulerCycle(h.c);
    assert.equal(h.state.operations['session-a'].status, 'failed', failure.message);
    assert.equal(h.state.operations['session-a'].reason, failure.message);
    assert.equal(h.state.operations['session-a'].prelaunchRetries, undefined);
  }
});

test('transient retries stop at the cap of 5 and raise action_required', async () => {
  const h = prelaunchHarness({failure: fetchFailed()});
  for (let tick = 1; tick <= 5; tick++) {
    await runSchedulerCycle(h.c);
    assert.equal(h.state.operations['session-a'].status, 'queued', `tick ${tick}`);
    assert.equal(h.state.operations['session-a'].prelaunchRetries, tick);
  }
  await runSchedulerCycle(h.c);
  assert.equal(h.state.operations['session-a'].status, 'action_required');
  assert.equal(h.state.operations['session-a'].reason, 'prelaunch-transient-limit');
  assert.equal(h.counts.launches, 0);
});

test('a transient failure after the meeting end time is never retried', async () => {
  const h = prelaunchHarness({failure: fetchFailed()});
  const base = h.c.deps.validateTenant;
  h.c.deps.validateTenant = async () => {h.clock.now = '2026-09-30T13:00:01Z'; return base();}; // the blip outlasts the meeting
  await runSchedulerCycle(h.c);
  assert.equal(h.state.operations['session-a'].status, 'failed');
  assert.equal(h.state.operations['session-a'].prelaunchRetries, undefined);
});

test('a transient failure after launch started is not treated as pre-launch', async () => {
  const h = prelaunchHarness({failure: fetchFailed(), failures: 0});
  h.c.execute = async () => {throw fetchFailed();};
  await runSchedulerCycle(h.c);
  assert.equal(h.state.operations['session-a'].status, 'failed');
  assert.equal(h.state.operations['session-a'].attempts, 1);
});
