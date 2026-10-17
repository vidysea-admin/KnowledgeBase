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
