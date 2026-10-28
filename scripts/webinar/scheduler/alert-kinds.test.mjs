/** Actual sink/tenant feed consumer with injected transport; no provider or delivery proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {register} from 'tsx/esm/api';
import {createCanonicalAlerts} from './lifecycle-alerts.mjs';
register();
const {raiseAlert, flushFailureDigest, describeAlert} = await import('../../../packages/meeting-bot/src/autojoin/alerts.ts');
const {ALERT_KINDS, readBotEvents} = await import('../../../packages/meeting-bot/src/autojoin/bot-events.ts');
const {createBotEventsDeps} = await import('../../watch/bot-events-host.ts');
const {projectBotEvent} = await import('../../../apps/api/src/bot-events/router.ts');
const NOW = '2026-10-14T12:00:00.000Z';
async function fixture(body) {
  const stateDir = mkdtempSync(join(tmpdir(), 'lkb-scheduler-kinds-')), calls = [];
  let time = Date.parse(NOW);
  const deps = {stateDir, tenantId: 'fixture', now: () => new Date(time).toISOString(), log: () => {},
    cfg: {present: true, discovery: true, webinarAutoJoin: true, careerPriority: true, testDataRouting: true,
      alerts: {email: true, dashboard: true, calendar: false, emailTo: 'operator@example.test', emailTestData: false},
      rateLimit: {emailPerHour: 2, failureEmailPerHour: 1, calendarMinGapSeconds: 60}},
    gws: async args => {calls.push(args); return '{}';}};
  try {await body({deps, calls, stateDir, advance: ms => {time += ms;}});}
  finally {rmSync(stateDir, {recursive: true, force: true});}
}
const event = (kind, sessionKey) => ({kind, sessionKey, title: 'Career webinar', careerGuidance: true, testData: false});

test('new canonical kinds use actual mappings and separate existing ordinary/failure ceilings; tenant feed consumes all', () => fixture(async f => {
  for (const kind of ['coverage-deferred', 'discovery-degraded', 'discovery-recovered']) assert.ok(ALERT_KINDS.includes(kind));
  assert.match(describeAlert(event('coverage-deferred', 'session-a')), /^Coverage deferred:/);
  assert.match(describeAlert(event('discovery-degraded', 'discovery-a')), /^Discovery unavailable:/);
  assert.match(describeAlert(event('discovery-recovered', 'discovery-a')), /^Discovery recovered:/);
  assert.equal((await raiseAlert(f.deps, event('coverage-deferred', 'session-a'))).email, 'sent');
  assert.equal((await raiseAlert(f.deps, event('discovery-degraded', 'discovery-a'))).email, 'sent');
  assert.equal((await raiseAlert(f.deps, event('discovery-recovered', 'discovery-a'))).email, 'sent');
  assert.equal((await raiseAlert(f.deps, event('coverage-deferred', 'session-b'))).email, 'rate-limited');
  assert.equal(f.calls.length, 3);
  for (const args of f.calls) {
    const raw = JSON.parse(args[args.indexOf('--json') + 1]).raw;
    assert.match(Buffer.from(raw, 'base64url').toString('utf8'), /^To: operator@example\.test\r\n/);
  }
  assert.equal(readBotEvents(f.stateDir, 'fixture', 10).length, 4);
  assert.equal(readBotEvents(f.stateDir, 'foreign', 10).length, 0);
}));

test('discovery failure overflow uses the existing one-per-hour durable digest across restart', () => fixture(async f => {
  const first = event('discovery-degraded', 'discovery-a'), second = event('discovery-degraded', 'discovery-b');
  assert.equal((await raiseAlert(f.deps, first)).email, 'sent');
  assert.equal((await raiseAlert(f.deps, second)).email, 'digest-queued');
  assert.equal((await raiseAlert({...f.deps}, second)).email, 'duplicate');
  f.advance(300001); await flushFailureDigest({...f.deps});
  assert.equal(f.calls.length, 2); await flushFailureDigest({...f.deps}); assert.equal(f.calls.length, 2);
  assert.equal(readBotEvents(f.stateDir, 'fixture', 10).length, 2);
}));

test('non-career deferred test data stays out of ordinary email but remains visible to its tenant', () => fixture(async f => {
  const result = await raiseAlert(f.deps, {...event('coverage-deferred', 'session-a'), careerGuidance: false, testData: true});
  assert.equal(result.email, 'skipped-test-data'); assert.equal(result.dashboard, 'sent'); assert.equal(f.calls.length, 0);
  const rows = readBotEvents(f.stateDir, 'fixture', 10);
  assert.equal(rows[0].kind, 'coverage-deferred'); assert.equal(rows[0].testData, true);
}));

test('actual canonical producer reaches durable sink, real tenant host reader and API projection for all three new kinds', () => fixture(async f => {
  const state = {operations: {}}, alerts = createCanonicalAlerts({state, tenantId: 'fixture', now: () => NOW,
    assertOwned: () => {}, save: () => {}, enqueueNotification: () => {}, log: () => {},
    autojoin: () => ({raise: input => raiseAlert(f.deps, input)}), flush: () => flushFailureDigest(f.deps)});
  alerts.update('session-a', {status: 'queued', reason: 'capacity-full', title: 'Career webinar', careerGuidance: true, testData: false});
  const outage = {status: 'failed', checkedAt: NOW, lastSuccessAt: '2026-10-14T11:00:00.000Z'};
  state.discovery = {calendar: outage};
  alerts.discovery('calendar', {status: 'healthy'}, outage);
  state.discovery.calendar = {status: 'healthy', checkedAt: NOW, lastSuccessAt: NOW};
  alerts.discovery('calendar', outage, state.discovery.calendar);
  await alerts.wait();
  const host = createBotEventsDeps({stateDir: f.stateDir}), rows = host.list('fixture', 10).map(projectBotEvent).filter(Boolean);
  assert.deepEqual(rows.map(row => row.kind).sort(), ['coverage-deferred', 'discovery-degraded', 'discovery-recovered'].sort());
  assert.ok(rows.every(row => row.sessionKey && row.title)); assert.equal(f.calls.length, 3);
  assert.deepEqual(host.list('foreign', 10).map(projectBotEvent), []);
}));
