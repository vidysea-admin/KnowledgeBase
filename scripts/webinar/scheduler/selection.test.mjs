import {register} from 'tsx/esm/api'; register();
import test from 'node:test';
import assert from 'node:assert/strict';
const {selectAutoRecordItems} = await import('../../../packages/meeting-bot/src/calendar/auto-join.ts');
import {NOW, event} from '../run-pipeline-fixtures.mjs';
const input = changes => ({calendarEvents: [event(), event({id: 'second', meetingUrl: 'https://meeting.zoho.com/meeting/456'})],
  candidates: [], now: NOW, leadMinutes: 5, trustedSenders: {emails: [], domains: []}, alreadyScheduled: [], everyWebinar: true, ...changes});

test('parallel tabs keep both eligible overlaps while the legacy selector still reports one lost', () => {
  const legacy = selectAutoRecordItems(input()), parallel = selectAutoRecordItems(input(), {parallel: true});
  assert.equal(legacy.toSchedule.length, 1); assert.ok(legacy.skipped.some(row => row.reason === 'overlap-lost'));
  assert.equal(parallel.toSchedule.length, 2); assert.ok(!parallel.skipped.some(row => row.reason === 'overlap-lost'));
});

test('parallel selection preserves cancellation, personal-meeting rejection and canonical dedup', () => {
  const result = selectAutoRecordItems(input({calendarEvents: [event(), event({id: 'duplicate'}),
    event({id: 'cancelled', cancelled: true, meetingUrl: 'https://meeting.zoho.com/meeting/333'}),
    event({id: 'personal', title: 'Team meeting', meetingUrl: 'https://meeting.zoho.com/meeting/789'})]}), {parallel: true});
  assert.equal(result.toSchedule.length, 1);
  assert.ok(result.skipped.some(row => row.reason === 'not-webinar'));
  assert.ok(result.skipped.some(row => row.reason === 'cancelled'));
});
