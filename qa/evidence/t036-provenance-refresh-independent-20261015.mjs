import assert from 'node:assert/strict';
import test from 'node:test';
import { createIfNew } from '../../packages/db/src/collections/meeting-candidates.ts';
import { createMeetingCandidatesDeps } from '../../apps/api/src/store.ts';
import { createHttpCandidateLoader } from '../../packages/meeting-bot/src/calendar/schedule-loaders.ts';
import { selectAutoRecordItems } from '../../packages/meeting-bot/src/calendar/auto-join.ts';

// Public deterministic model only: no Mongo/provider/network/disk persistence is exercised.
const receipt = '2026-10-01T12:00:00.000Z';
const seed = status => ({_id: 'stored-public-row', tenantId: 'owner', messageId: 'synthetic-message',
  subject: 'Career guidance webinar', senderEmail: 'host@publisher.test', senderDomain: 'publisher.test',
  status, detectedAt: receipt, decidedAt: receipt, senderAuthenticated: false,
  meetingUrl: 'https://zoom.us/j/1234567890', startTime: '2026-10-15T12:00:00.000Z', endTime: '2026-10-15T13:00:00.000Z'});
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function model(input) {
  const rows = structuredClone(input);
  let writes = 0;
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$expr') return value.$and.every(expression => {
        const [field, expected] = expression.$eq;
        assert.equal(field.$getField.input, '$$ROOT');
        return eq(row[field.$getField.field.$literal], expected.$literal);
      });
      if (value && typeof value === 'object') {
        if (Object.hasOwn(value, '$exists')) return Object.hasOwn(row, key) === value.$exists;
        if (Object.hasOwn(value, '$eq')) return eq(row[key], value.$eq) ||
          (Array.isArray(row[key]) && row[key].some(item => eq(item, value.$eq)));
        assert.fail('unsupported synthetic filter operator');
      }
      return row[key] === value;
    });
  }
  const db = {collection(name) {
    assert.equal(name, 'meeting_candidates');
    return {
      async findOne(filter) {return structuredClone(rows.find(row => matches(row, filter)) ?? null);},
      async insertOne(doc) {writes++; rows.push(structuredClone(doc)); return {insertedId: doc._id};},
      async updateOne(filter, update) {
        assert.deepEqual(Object.keys(update), ['$set']);
        const row = rows.find(value => matches(value, filter));
        if (!row) return {matchedCount: 0, modifiedCount: 0};
        writes++; Object.assign(row, structuredClone(update.$set)); return {matchedCount: 1, modifiedCount: 1};
      },
    };
  }};
  return {db, rows, writeCount: () => writes};
}
async function factoryRefresh(m, extra) {
  const deps = createMeetingCandidatesDeps('owner', async () => [{messageId: 'synthetic-message',
    subject: 'Career guidance webinar', senderEmail: 'host@publisher.test', senderDomain: 'publisher.test',
    threadId: 'new-provider-thread', senderAuthenticated: true, receivedAt: receipt, ...extra}],
  () => 'public_synthetic_work', {getTrustedSender: async () => ({autoApprove: true}),
    createMeetingCandidateIfNew: (tenantId, doc) => createIfNew(tenantId, doc, m.db)});
  assert.deepEqual(await deps.scanGmail('owner'), {created: 0, autoApproved: 0});
}
async function consume(rows) {
  const priorFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(url, 'https://synthetic.invalid/meeting-candidates');
      return new Response(JSON.stringify({candidates: structuredClone(rows)}), {status: 200});
    };
    const candidates = await createHttpCandidateLoader('https://synthetic.invalid', 'synthetic-key', () => {}, true)();
    return {candidates, selected: selectAutoRecordItems({calendarEvents: [], candidates,
      now: '2026-10-15T12:00:00.000Z', leadMinutes: 5, trustedSenders: {emails: [], domains: []},
      alreadyScheduled: new Set(), everyWebinar: true})};
  } finally {globalThis.fetch = priorFetch;}
}
test('actual factory refresh reconstructed model retains rejected decision and zero counts', async () => {
  const original = seed('rejected'); const m = model([original]);
  await factoryRefresh(m, {});
  assert.deepEqual(m.rows[0], {...original, senderAuthenticated: true, receivedAt: receipt});
  assert.equal(Object.hasOwn(m.rows[0], 'threadId'), false);
  const restarted = model(m.rows); await factoryRefresh(restarted, {});
  assert.equal(restarted.writeCount(), 0);
  assert.equal((await consume(restarted.rows)).selected.toSchedule.length, 0);
});
test('healthy approved control remains eligible through actual loader and selector', async () => {
  const m = model([seed('approved')]); await factoryRefresh(m, {});
  assert.equal((await consume(model(m.rows).rows)).selected.toSchedule.length, 1);
});
test('new refusal evidence on approved legacy link remains blocking after reconstructed factory refresh', async () => {
  const m = model([seed('approved')]); await factoryRefresh(m, {meetingLinkIssue: 'ambiguous'});
  assert.equal(m.rows[0].status, 'approved'); assert.equal(m.rows[0].meetingLinkIssue, 'ambiguous');
  const restarted = model(m.rows); await factoryRefresh(restarted, {});
  assert.equal(restarted.writeCount(), 0);
  const {candidates, selected} = await consume(restarted.rows);
  assert.equal(candidates[0].meetingLinkIssue, 'ambiguous');
  assert.equal(selected.toSchedule.length, 0, 'new ambiguity must veto prior approved join, not just survive in metadata');
});
