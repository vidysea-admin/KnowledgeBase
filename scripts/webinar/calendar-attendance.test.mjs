import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ATTENDANCE_ACCOUNT, rawAttendanceObservation, attendanceFingerprint, selectVerifiedCalendarMeetings} from './calendar-attendance-policy.mjs';
import {createCalendarAttendanceSource, configureCalendarAttendance, checkCalendarAttendanceReady} from './calendar-attendance-source.mjs';
import {runPipelineTick, validateRunGate} from './run-pipeline.mjs';
const {listUpcomingGwsMeetings} = await import('../../apps/api/src/gws-calendar.ts');
const {validateWebinarCalendarAcquisition, prepareWebinarSourceState} = await import('../../packages/meeting-bot/src/calendar/schedule-state.ts');
const {recordingBackend} = await import('../../packages/meeting-bot/src/capture/record-commands.ts');
const NOW = new Date().toISOString(), START = new Date(Date.parse(NOW) + 60000).toISOString(), END = new Date(Date.parse(NOW) + 3600000).toISOString();
const raw = changes => ({kind: 'calendar#event', id: 'personal-one', status: 'confirmed', summary: 'Personal catch-up',
  start: {dateTime: START}, end: {dateTime: END}, updated: NOW, hangoutLink: 'https://meet.google.com/abc-defg-hij?token=private-token',
  organizer: {email: 'host@example.test'}, attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'accepted'}], ...changes});
const input = events => ({calendarEvents: events, candidates: [], now: NOW, leadMinutes: 5, alreadyScheduled: []});
const choose = raws => {
  const observations = raws.map(rawAttendanceObservation), map = new Map(observations.map(row => [row.fingerprint, row]));
  return selectVerifiedCalendarMeetings(input(observations.map(row => row.event)), event => map.get(attendanceFingerprint(event)));
};

test('accepted generic, team and personal titles bypass webinar/organizer classification', () => {
  for (const summary of ['Personal catch-up', 'Team sync', 'Project check-in', 'University webinar']) assert.equal(choose([raw({summary})]).toSchedule.length, 1);
  assert.equal(choose([raw({attendees: undefined, organizer: {email: ATTENDANCE_ACCOUNT, self: true}})]).toSchedule.length, 1);
});
for (const [name, change] of Object.entries({
  declined: {attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]},
  tentative: {attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'tentative'}]},
  unanswered: {attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'needsAction'}]},
  unverified: {attendees: undefined}, foreign: {attendees: [{email: 'other@example.test', self: true, responseStatus: 'accepted'}]},
  ambiguous: {attendees: [{email: ATTENDANCE_ACCOUNT, responseStatus: 'accepted'}]}, malformed: {attendees: {}},
  omitted: {attendeesOmitted: true}, cancelled: {status: 'cancelled'}, tentativeEvent: {status: 'tentative'},
  missingStatus: {status: undefined}, foreignOrganizer: {attendees: undefined, organizer: {email: 'other@example.test', self: true}},
  contradictoryOwner: {organizer: {email: ATTENDANCE_ACCOUNT, self: true}, attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]},
  duplicateSelf: {attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'accepted'}, {email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'accepted'}]},
  missingLink: {hangoutLink: undefined}, registration: {hangoutLink: 'https://zoom.us/webinar/register/abc'},
  foreignHost: {hangoutLink: 'https://meet.google.com.evil.test/abc-defg-hij'}, unsafeScheme: {hangoutLink: 'http://meet.google.com/abc-defg-hij'},
  userinfo: {hangoutLink: 'https://user:password@meet.google.com/abc-defg-hij'}, invalidTime: {end: {dateTime: START}},
})) test(`attendance refuses ${name}`, () => assert.equal(choose([raw(change)]).toSchedule.length, 0));

test('sticky rejection, occurrence dedup, token rotation and single-lane overlap', () => {
  const observation = rawAttendanceObservation(raw({})), value = input([observation.event]);
  const selected = selectVerifiedCalendarMeetings(value, () => observation).toSchedule[0];
  value.candidates = [{status: 'rejected', meetingUrl: observation.event.meetingUrl, startTime: START}];
  assert.equal(selectVerifiedCalendarMeetings(value, () => observation).toSchedule.length, 0);
  const rotated = rawAttendanceObservation(raw({hangoutLink: 'https://meet.google.com/abc-defg-hij?token=rotated'}));
  assert.equal(selectVerifiedCalendarMeetings({...input([rotated.event]), alreadyScheduled: [selected.sessionKey]}, () => rotated).toSchedule.length, 0);
  const overlapping = choose([raw({}), raw({id: 'second', hangoutLink: 'https://meet.google.com/klm-nopq-rst'})]);
  assert.equal(overlapping.toSchedule.length, 1); assert.ok(overlapping.skipped.some(row => row.reason === 'overlap-lost'));
  const nextDay = rawAttendanceObservation(raw({start: {dateTime: new Date(Date.parse(START) + 86400000).toISOString()}, end: {dateTime: new Date(Date.parse(END) + 86400000).toISOString()}}));
  assert.notEqual(selected.sessionKey, selectVerifiedCalendarMeetings({...input([nextDay.event]), now: nextDay.event.startTime}, () => nextDay).toSchedule[0].sessionKey);
});

function provider(rows = [raw({})]) {
  const state = {rows, account: ATTENDANCE_ACCOUNT, afterAccount: undefined, accountCalls: 0, fail: false, conflict: false, failSyncOnce: false, args: []};
  state.run = async args => {
    state.args.push(args);
    if (state.fail) throw new Error('provider unavailable');
    if (args[1] === 'calendars') return JSON.stringify({kind: 'calendar#calendar', id: ++state.accountCalls % 2 === 0 ? state.afterAccount ?? state.account : state.account});
    const params = JSON.parse(args[args.indexOf('--params') + 1]);
    if (state.failSyncOnce && params.syncToken) {state.failSyncOnce = false; throw Object.assign(new Error('Expired source token'), {statusCode: 410});}
    return JSON.stringify({kind: 'calendar#events', items: state.conflict ? [...state.rows, raw({attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]})] : state.rows,
      ...(params.singleEvents === false ? {nextSyncToken: 'sample-token'} : {})});
  };
  state.source = () => createCalendarAttendanceSource({account: ATTENDANCE_ACCOUNT, tenantId: 'fixture', run: state.run,
    acquire: listUpcomingGwsMeetings, validateAcquisition: validateWebinarCalendarAcquisition, now: () => NOW});
  return state;
}
test('actual native acquisition and reconciliation retain fresh matching acceptance proof', async () => {
  const p = provider(), source = p.source(), acquired = await source.load();
  const prepared = prepareWebinarSourceState({version: 1, tenantId: 'fixture', operations: {}}, acquired, [], NOW);
  assert.equal(source.select(input(prepared.calendarEvents)).toSchedule.length, 1);
  for (const key of ['id', 'meetingUrl', 'startTime', 'endTime', 'providerUpdated', 'organizer', 'recurringEventId']) {
    const changed = {...prepared.calendarEvents[0], [key]: `${prepared.calendarEvents[0][key] ?? ''}-changed`};
    assert.equal(source.select(input([changed])).toSchedule.length, 0, key);
  }
  assert.equal(source.select(input([{...prepared.calendarEvents[0], originalStartTime: {dateTime: START}}])).toSchedule.length, 0);
  assert.equal(source.select(input([{...prepared.calendarEvents[0], cancelled: true}])).toSchedule.length, 0);
});
test('missing/foreign/ambiguous owner and failed or incomplete acquisition clear prior proof', async () => {
  for (const account of [undefined, 'other@example.test', ['umeshsugara@vidysea.com']]) {
    const p = provider(); p.account = account; await assert.rejects(p.source().load(), /could not be verified/);
  }
  const p = provider(), source = p.source(), acquired = await source.load();
  assert.equal(source.select(input(acquired.meetings)).toSchedule.length, 1);
  p.afterAccount = 'other@example.test'; await assert.rejects(source.load(), /could not be verified/);
  assert.throws(() => source.select(input(acquired.meetings)), /Current attendance/);
  p.afterAccount = undefined; p.fail = true; await assert.rejects(source.load(), /could not be verified/);
  assert.throws(() => source.select(input(acquired.meetings)), /Current attendance/);
  const incomplete = createCalendarAttendanceSource({account: ATTENDANCE_ACCOUNT, tenantId: 'fixture', run: provider().run,
    acquire: async () => ({complete: false}), validateAcquisition: validateWebinarCalendarAcquisition, now: () => NOW});
  await assert.rejects(incomplete.load(), /could not be verified/);
});
test('conflicting same-generation duplicates never overwrite a refusal', async () => {
  const p = provider(); p.conflict = true; const source = p.source(), acquired = await source.load();
  assert.equal(source.select(input(acquired.meetings)).toSchedule.length, 0);
});
test('expired sync reset reacquires current proof; declined refresh refuses and stops the same active occurrence', async () => {
  const p = provider(), source = p.source(), first = await source.load(), id = source.select(input(first.meetings)).toSchedule[0].sessionKey;
  p.failSyncOnce = true; p.rows = [raw({attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]})];
  const reset = await source.load('expired-token'); assert.equal(reset.mode, 'reset');
  assert.equal(source.select(input(reset.meetings)).toSchedule.length, 0);
  assert.equal(source.activeStopReason(id, {calendarEvents: reset.meetings}), 'cancelled');
});

async function fixture(body, {proof = false} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lkb-attendance-sample-')), stateDir = join(root, 'data/webinar-release');
  const p = provider(), calls = [], logs = []; let registrations = 0, sends = 0;
  const original = {root, stateDir, env: {LKB_TENANT_ID: 'fixture', MONGO_WORK_DB: 'lkb_work_sample'}, now: () => NOW,
    validateTenant: async () => {}, log: message => logs.push(message), loadCandidates: async () => [],
    launch: async (args, env) => { calls.push({args, env}); throw new Error('Controlled downstream failure; no real browser or media'); },
    registerWebinar: async () => {registrations++;}, notifyOperation: async () => {sends++; return 'sent';}};
  if (proof) {
    mkdirSync(stateDir, {recursive: true}); writeFileSync(join(root, 'sample.webm'), 'ISOLATED UNIT TEST DOUBLE; NOT LIVE PROOF');
    writeFileSync(join(stateDir, 'live-proof.json'), JSON.stringify({status: 'passed', backend: 'tab', platform: process.platform, audio: true, video: true,
      sessionId: 'sample', verifiedAt: NOW, recording: 'sample.webm'}));
  }
  try {
    const deps = await configureCalendarAttendance(original, ATTENDANCE_ACCOUNT, {transport: {runGws: p.run, listUpcomingGwsMeetings},
      probe: async () => ({streams: [{codec_type: 'audio', channels: 2}, {codec_type: 'video', width: 100, height: 100}], format: {duration: '1'}})});
    await body({root, stateDir, deps, p, calls, logs, sideEffects: () => ({registrations, sends})});
  } finally {rmSync(root, {recursive: true, force: true});}
}
test('opt-in preview is nonmutating and redacts join tokens', () => fixture(async f => {
  const result = await runPipelineTick(f.deps);
  assert.equal(result.toRecord.length, 1); assert.equal(existsSync(f.stateDir), false); assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(result).includes('private-token')); assert.deepEqual(f.sideEffects(), {registrations: 0, sends: 0});
}));
test('foreign tenant/account refusal happens before operation writes or launch', () => fixture(async f => {
  f.deps.validateTenant = async () => {throw new Error('Tenant mismatch');};
  await assert.rejects(runPipelineTick(f.deps), /Tenant mismatch/); assert.equal(existsSync(f.stateDir), false);
  f.deps.validateTenant = async () => {}; f.p.account = 'other@example.test';
  await assert.rejects(runPipelineTick(f.deps), /mismatch/); assert.equal(existsSync(f.stateDir), false); assert.equal(f.calls.length, 0);
}));
test('mutating configured tenant cannot borrow a previous account-bound source', () => fixture(async f => {
  await runPipelineTick(f.deps); f.deps.env.LKB_TENANT_ID = 'foreign';
  await assert.rejects(runPipelineTick(f.deps), /tenant binding changed/);
  assert.equal(existsSync(f.stateDir), false); assert.equal(f.calls.length, 0);
}));
test('missing genuine live gate prevents unattended capture', () => fixture(async f => {
  await assert.rejects(runPipelineTick(f.deps, true), /Manual live/); assert.equal(f.calls.length, 0); assert.equal(existsSync(f.stateDir), false);
}));
test('readiness rejects missing audio/video media streams without work writes', () => fixture(async f => {
  await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, async () => ({streams: [], format: {duration: 1}})), /audio\/video/);
  assert.equal(existsSync(join(f.stateDir, 'operations.json')), false); assert.equal(f.calls.length, 0);
}, {proof: true}));
test('accepted ordinary meeting reaches actual runner and downstream CLI backend with true bounds; processing failure remains failed', () => fixture(async f => {
  const result = await runPipelineTick(f.deps, true);
  assert.equal(f.calls.length, 1); const {args, env} = f.calls[0];
  assert.equal(args[0], 'record'); assert.equal(args[1], raw({}).hangoutLink);
  assert.equal(args[args.indexOf('--until') + 1], END); assert.equal(args[args.indexOf('--title') + 1], 'Personal catch-up');
  assert.equal(env.LKB_TENANT_ID, 'fixture'); assert.equal(recordingBackend(args.slice(1), env), 'tab');
  assert.equal(Object.values(result.operations).filter(row => row.status === 'failed').length, 1);
  assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false); assert.deepEqual(f.sideEffects(), {registrations: 0, sends: 0});
  await runPipelineTick(f.deps, true); assert.equal(f.calls.length, 1, 'restart must not rejoin the failed occurrence without its explicit recovery flow');
}, {proof: true}));
