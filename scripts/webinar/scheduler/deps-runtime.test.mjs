import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {register} from 'tsx/esm/api';
import {createSchedulerRuntime} from './deps-runtime.mjs';
register();
const {selectTabCaptureWorkspace} = await import('../../../packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts');
const {createCaptureSlotReadinessObserver} = await import('../../../packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts');
const {readBotEvents} = await import('../../../packages/meeting-bot/src/autojoin/bot-events.ts');
const configuration = enabled => ({discovery: enabled, webinarAutoJoin: enabled, careerPriority: enabled, testDataRouting: enabled});
function fixture(body) {
  const root = mkdtempSync(join(tmpdir(), 'lkb-scheduler-runtime-'));
  const env = {LKB_TENANT_ID: 'fixture', LKB_CAPTURE_SLOTS: 'career-a,career-b', LKB_JOIN_RULES_ENFORCE: 'last-valid'};
  mkdirSync(join(root, 'config')); writeFileSync(join(root, 'config/autojoin.json'), JSON.stringify(configuration(true)));
  writeFileSync(join(root, 'config/career-topics.json'), JSON.stringify({keywords: ['career']}));
  let verified = 'fixture';
  const runtime = createSchedulerRuntime(root, env, () => {}, () => verified);
  return Promise.resolve().then(() => body({root, env, runtime, owner: value => {verified = value;}}))
    .finally(() => rmSync(root, {recursive: true, force: true}));
}

test('real runtime preserves spread autojoin identity while rereading persisted controls/topic', () => fixture(async f => {
  const deps = {...f.runtime}, original = deps.autojoin;
  assert.equal(await deps.refreshSchedulerPolicy(), true); assert.equal(deps.autojoin.cfg.webinarAutoJoin, true);
  writeFileSync(join(f.root, 'config/autojoin.json'), JSON.stringify(configuration(false)));
  writeFileSync(join(f.root, 'config/career-topics.json'), JSON.stringify({keywords: ['counselling']}));
  assert.equal(await deps.refreshSchedulerPolicy(), false); assert.equal(deps.autojoin, original);
  assert.equal(deps.autojoin.cfg.webinarAutoJoin, false); assert.deepEqual(deps.autojoin.topic.keywords, ['counselling']);
}));

test('real runtime refuses lost or foreign verified authority even with configured tenant', () => fixture(async f => {
  const item = {sessionKey: 'session-a', source: 'calendar', sourceId: 'source-a', title: 'Webinar',
    startTime: '2026-10-14T12:00:00Z', endTime: '2026-10-14T13:00:00Z', meetingUrl: 'https://meet.google.com/abc-defg-hij'};
  for (const owner of [undefined, 'foreign']) {
    f.owner(owner);
    await assert.rejects(f.runtime.validateCaptureSlots(f.runtime.captureSlots), /verified API capture owner/);
    await assert.rejects(f.runtime.refreshSchedulerPolicy(), /verified API capture owner/);
    assert.equal(f.runtime.captureSlotSupports('career-a', item), false);
    const ruled = await f.runtime.applyJoinRules({toSchedule: [item], skipped: []}, {readOnly: true});
    assert.equal(ruled.toSchedule.length, 0); assert.equal(ruled.skipped[0].reason, 'rules-unevaluable');
  }
}));

test('physical workspaces and fixture admission/media receipts never become reviewed capability proof', () => fixture(async f => {
  const now = Date.now(), defaults = {tenantId: 'fixture', profileDir: join(f.root, 'data/bot-profile'), recordDir: join(f.root, 'raw/webinars')};
  for (const slot of f.runtime.captureSlots) {
    const workspace = selectTabCaptureWorkspace(['--capture-slot', slot], defaults, 'finalize');
    mkdirSync(workspace.profileDir, {recursive: true}); mkdirSync(workspace.recordDir, {recursive: true});
    const observer = createCaptureSlotReadinessObserver(workspace,
      {sessionId: 'fixture-recording', platform: 'meet', startedAt: now - 100, evidenceKind: 'fixture', generation: '11111111-1111-4111-8111-111111111111'}, () => now);
    observer.onCaptureEvent({event: 'admitted'}); observer.onCaptureEvent({event: 'capture-started', mediaStartedAt: now - 50});
  }
  await assert.rejects(f.runtime.validateCaptureSlots(f.runtime.captureSlots), /reviewed real host capability/);
  assert.equal(await f.runtime.refreshSchedulerPolicy(), true);
  const item = {meetingUrl: 'https://meet.google.com/abc-defg-hij'};
  assert.equal(f.runtime.captureSlotSupports('career-a', item), false);
  await assert.rejects(f.runtime.validateCaptureSlot('career-a', item), /accepted browser/);
}));

test('private publisher absence is unavailable; configured publication rejects unverified owner or relative path', () => fixture(async f => {
  f.owner(undefined);
  assert.equal(await f.runtime.publishCaptureControl({tenantId: 'fixture', sessionId: 'session-a', control: {}}), undefined);
  f.env.LKB_CAPTURE_CONTROL_DIR = 'relative-control-dir';
  await assert.rejects(f.runtime.publishCaptureControl({tenantId: 'fixture', sessionId: 'session-a', control: {}}), /verified API/);
  f.owner('fixture');
  await assert.rejects(f.runtime.publishCaptureControl({tenantId: 'fixture', sessionId: 'session-a', control: {}}), /local absolute directories/);
}));

test('real runtime tags target actual global configured recorder root while rule state stays canonical', () => fixture(async f => {
  const recordDir = join(f.root, 'custom-recordings');
  const runtime = createSchedulerRuntime(f.root, {...f.env, LKB_RECORD_DIR: recordDir}, () => {}, () => 'fixture');
  assert.equal(runtime.autojoin.tagsDir, join(recordDir, 'capture-tags'));
  assert.equal(await runtime.refreshSchedulerPolicy(), true);
  assert.equal(runtime.autojoin.tagsDir, join(recordDir, 'capture-tags'));
}));

test('real runtime serializes overlapping lifecycle writes and immediate tenant feed consumes both without transport', () => fixture(async f => {
  writeFileSync(join(f.root, 'config/autojoin.json'), JSON.stringify({...configuration(true), alerts: {dashboard: true}}));
  await f.runtime.refreshSchedulerPolicy();
  await Promise.all(['session-a', 'session-b'].map(sessionKey => f.runtime.autojoin.raise({kind: 'capture-started', sessionKey, title: 'Career webinar'})));
  const rows = readBotEvents(join(f.root, 'raw/webinars'), 'fixture', 10);
  assert.deepEqual(rows.map(row => row.sessionKey).sort(), ['session-a', 'session-b']);
  assert.equal(readBotEvents(join(f.root, 'raw/webinars'), 'foreign', 10).length, 0);
  await f.runtime.flushSchedulerAlerts();
  assert.equal(readBotEvents(join(f.root, 'raw/webinars'), 'fixture', 10).length, 2);
}));
