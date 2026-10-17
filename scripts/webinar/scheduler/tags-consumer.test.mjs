import {register} from 'tsx/esm/api'; register();
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {withFixture} from '../run-pipeline-fixtures.mjs';
import {resolveWorkDb} from '../../watch/test-data-route.mjs';
const {selectTabCaptureWorkspace} = await import('../../../packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts');
const {writeCaptureTags} = await import('../../../packages/meeting-bot/src/autojoin/capture-tags.ts');
const {finalizeRecordingWith} = await import('../../../packages/meeting-bot/src/capture/record-finalize.ts');
const {writeRecordConsent} = await import('../../../packages/meeting-bot/src/capture/record-consent/receipt-store.ts');
const {recordMeetingHash} = await import('../../../packages/meeting-bot/src/capture/record-consent/context.ts');

test('slot media reaches the actual global finalizer tag reader and immediate staging resolver with correct session identity', () => withFixture(async f => {
  const recordDir = join(f.root, 'raw/webinars'), profileDir = join(f.root, 'data/bot-profile');
  mkdirSync(recordDir, {recursive: true});
  for (const [slot, career] of [['slot-a', true], ['slot-b', false]]) {
    const id = `session-${slot}`, workspace = selectTabCaptureWorkspace(['--capture-slot', slot], {profileDir, recordDir, tenantId: 'fixture'});
    mkdirSync(workspace.recordDir, {recursive: true}); const video = join(workspace.recordDir, `${id}.webm`);
    writeFileSync(video, `synthetic video ${id}`);
    writeRecordConsent(workspace.recordDir, {version: 1, tenantId: 'fixture', sessionId: id,
      generation: '11111111-1111-4111-8111-111111111111', meetingHash: recordMeetingHash('https://meeting.zoho.com/meeting/123'),
      captureMode: 'silent', operationalApproval: {approvedBy: 'Fixture only', reference: 'fixture-only', appliedAt: '2026-10-14T12:00:00.000Z'},
      organizerConsent: 'given', consent: {given: true, recordedBy: 'Fixture only'}, privateWindows: [], mediaStartedAt: Date.parse('2026-10-14T12:00:00.000Z')});
    writeCaptureTags(join(recordDir, 'capture-tags'), id, {careerGuidance: career, testData: !career}, () => {});
    await finalizeRecordingWith({repoRoot: f.root, tenantId: 'fixture', recordDir: workspace.recordDir, probeMedia: () => 60,
      extractAudio: (_video, audio) => writeFileSync(audio, `synthetic audio ${id}`),
      measureVolume: () => ({maxDb: -20, meanDb: -30})}, video, id, 'Fixture webinar', 'zoho', false, [], {notifyFinished: () => {}}, 60);
    const source = JSON.parse(readFileSync(join(f.root, 'data/toc-migrated', id, 'source.json'), 'utf8'));
    assert.equal(source.tenantId, 'fixture'); assert.equal(source._id, `${id}-src`);
    assert.equal(source.testData, !career); assert.equal(source.careerGuidance, career); assert.ok(source.path.includes(slot));
    const resolved = resolveWorkDb({testData: source.testData, workDb: 'lkb_work_fixture', env: {LKB_ALLOW_STAGING: 'lkb_staging'}});
    assert.equal(resolved.workDb, career ? 'lkb_work_fixture' : 'lkb_staging');
    if (!career) assert.throws(() => resolveWorkDb({testData: source.testData, workDb: 'lkb_work_fixture', env: {}}), /refusing/);
  }
}));
