import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const {Ajv2020} = apiRequire('ajv/dist/2020.js');
const addFormats = apiRequire('ajv-formats');
const workerAjv = new Ajv2020({strict: false}); addFormats(workerAjv);
const workerSchema = JSON.parse(readFileSync(new URL('../../schema/watch_state.schema.json', import.meta.url), 'utf8')).properties.workerSnapshot.properties.state;
const validateWorkerWire = workerAjv.compile(workerSchema);
import {join} from 'node:path';
import {ATTENDANCE_ACCOUNT, rawAttendanceObservation, attendanceFingerprint, selectVerifiedCalendarMeetings} from './calendar-attendance-policy.mjs';
import {createCalendarAttendanceSource, configureCalendarAttendance, checkCalendarAttendanceReady, createCalendarWorkerPublisher, resolveAttendanceExecutable} from './calendar-attendance-source.mjs';
import {runPipelineTick, validateRunGate} from './run-pipeline.mjs';
const {listUpcomingGwsMeetings} = await import('../../apps/api/src/gws/gws-calendar.ts');
const {validateWebinarCalendarAcquisition, prepareWebinarSourceState} = await import('../../packages/meeting-bot/src/calendar/state/schedule-state.ts');
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
  const office = choose([raw({attendees: undefined, organizer: {email: ATTENDANCE_ACCOUNT, self: true}})]);
  assert.equal(office.toSchedule.length, 0); assert.equal(office.skipped[0].reason, 'rule-denied');
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

test('sticky rejection, occurrence dedup, token rotation and scheduler-owned overlap', () => {
  const observation = rawAttendanceObservation(raw({})), value = input([observation.event]);
  const selected = selectVerifiedCalendarMeetings(value, () => observation).toSchedule[0];
  value.candidates = [{status: 'rejected', meetingUrl: observation.event.meetingUrl, startTime: START}];
  assert.equal(selectVerifiedCalendarMeetings(value, () => observation).toSchedule.length, 0);
  const rotated = rawAttendanceObservation(raw({hangoutLink: 'https://meet.google.com/abc-defg-hij?token=rotated'}));
  assert.equal(selectVerifiedCalendarMeetings({...input([rotated.event]), alreadyScheduled: [selected.sessionKey]}, () => rotated).toSchedule.length, 0);
  const overlapping = choose([raw({}), raw({id: 'second', hangoutLink: 'https://meet.google.com/klm-nopq-rst'})]);
  assert.equal(overlapping.toSchedule.length, 2); assert.ok(!overlapping.skipped.some(row => row.reason === 'overlap-lost'));
  const nextDay = rawAttendanceObservation(raw({start: {dateTime: new Date(Date.parse(START) + 86400000).toISOString()}, end: {dateTime: new Date(Date.parse(END) + 86400000).toISOString()}}));
  assert.notEqual(selected.sessionKey, selectVerifiedCalendarMeetings({...input([nextDay.event]), now: nextDay.event.startTime}, () => nextDay).toSchedule[0].sessionKey);
});

function provider(rows = [raw({})]) {
  const state = {rows, account: ATTENDANCE_ACCOUNT, afterAccount: undefined, accountCalls: 0, fail: false, conflict: false, failSyncOnce: false, args: []};
  state.run = async args => {
    state.args.push(args);
    if (state.fail) throw new Error('provider unavailable');
    if (args[0] === 'gmail') return JSON.stringify(args[2] === 'getProfile' ? {emailAddress: state.account} : {messages: [], resultSizeEstimate: 0});
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
  assert.equal(existsSync(join(f.stateDir, 'poller.lock')), false); assert.equal(f.sideEffects().registrations, 0); assert.ok(f.sideEffects().sends > 0);
  // D-244 (H1 self-heal, f2f2bee0): a capture that failed with its own error and no recording file, while the meeting still runs,
  // is rejoined like a crash on the next tick, up to ATTEMPT_LIMIT (3) attempts in all; after that it stays failed.
  for (let tick = 2; tick <= 5; tick++) await runPipelineTick(f.deps, true);
  assert.equal(f.calls.length, 3, 'rejoined by itself, but never past the attempt limit');
}, {proof: true}));

test('T-036 (ISS-T036CAL-009): the attendance selector never attends a link whose source is not conference data', () => {
  const observation = rawAttendanceObservation(raw({}));
  const run = source => selectVerifiedCalendarMeetings(input([source === undefined ? observation.event : {...observation.event, meetingUrlSource: source}]), () => observation);
  for (const source of [undefined, 'conference']) assert.equal(run(source).toSchedule.length, 1, String(source));
  for (const source of ['description', 'location', 'Conference', '', 'x']) {
    const r = run(source); assert.equal(r.toSchedule.length, 0, source); assert.deepEqual(r.skipped.map(s => s.reason), ['unverified-link-source'], source);
  }
});

test('explicit all mode admits verified unanswered invitations, retains every safety refusal and description', () => {
  const rows = [raw({attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'needsAction'}], description: 'Career discussion'})];
  const observation = rawAttendanceObservation(rows[0]);
  assert.equal(selectVerifiedCalendarMeetings({...input([observation.event]), attendanceMode: 'all'}, () => observation).toSchedule.length, 1);
  assert.equal(selectVerifiedCalendarMeetings(input([observation.event]), () => observation).toSchedule.length, 0);
  assert.equal(selectVerifiedCalendarMeetings({...input([observation.event]), attendanceMode: 'rules'}, () => observation).toSchedule.length, 0);
  assert.equal(observation.event.description, 'Career discussion');
  for (const change of [{status: 'cancelled'}, {attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]}, {attendeesOmitted: true}, {attendees: undefined}, {status: 'tentative'}]) {
    const refused = rawAttendanceObservation(raw(change));
    assert.equal(selectVerifiedCalendarMeetings({...input([refused.event]), attendanceMode: 'all'}, () => refused).toSchedule.length, 0);
  }
});

test('attendance configuration retains Gmail discovery and dashboard notification dependencies', () => fixture(async f => {
  assert.equal(typeof f.deps.loadCandidates, 'function');
  await f.deps.notifyOperation({sessionId: 'sample', status: 'queued'});
  assert.equal(f.sideEffects().sends, 1);
}));

async function workerFixture(body) {
  const stateDir=mkdtempSync(join(tmpdir(),'lkb-worker-sample-')), generation='11111111-1111-4111-8111-111111111111';
  let clock=Date.parse(NOW), loseAck=false, dropBeforeCommit=false, begun=false, wrongOwner=false, badDigest=false, fresh=false, seq=0, acknowledgement, putFailure, getOverride; const sent=[], methods=[], wire=[];
  const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)).digest('hex');
  const reply=value=>new Response(JSON.stringify(value),{headers:{'X-LKB-Tenant':wrongOwner?'foreign':'fixture'}});
  const transport=async (_url,options)=>{
    methods.push(options.method); assert.equal(options.redirect,'error'); assert.equal(options.headers.authorization,'Bearer test-key');
    if(options.method==='GET') return getOverride ? getOverride() : reply({generation:begun?generation:null,sequence:seq,worker:{status:fresh?'fresh':'unavailable'}});
    const value=JSON.parse(options.body);
    if(options.method==='POST') {assert.deepEqual(value,{account:ATTENDANCE_ACCOUNT,hostId:'host-a',expectedGeneration:begun?generation:null}); begun=true; return reply({generation,sequence:0});}
    sent.push(value); wire.push(options.body);
    if(putFailure) return putFailure();
    if(dropBeforeCommit) {dropBeforeCommit=false; throw new TypeError('request not delivered');}
    if(!validateWorkerWire(value)) return new Response('{}',{status:400,headers:{'X-LKB-Tenant':'fixture'}});
    if(value.complete && clock-Date.parse(value.checkedAt)>=600000 && value.sequence>seq) return new Response('{}',{status:422,headers:{'X-LKB-Tenant':'fixture'}});
    if(value.sequence>seq) {seq=value.sequence; acknowledgement={generation,sequence:seq,digest:hash(value),receivedAt:new Date(clock).toISOString(),complete:value.complete};}
    if(loseAck) {loseAck=false; throw new TypeError('lost acknowledgement');}
    return reply({...acknowledgement,...(badDigest?{digest:'f'.repeat(64)}:{})});
  };
  const factory=()=>createCalendarWorkerPublisher({stateDir,account:ATTENDANCE_ACCOUNT,hostId:'host-a',tenantId:'fixture',apiUrl:'https://operator.example.test',apiKey:'test-key',fetch:transport,now:()=>new Date(clock).toISOString()});
  const scan=(changes={})=>({checkedAt:NOW,complete:true,sourceEvents:[],meetings:[],candidates:[],operations:{},...changes});
  try {await body({factory,scan,sent,wire,methods,stateDir,transport,failPut:fn=>{putFailure=fn;},readFence:fn=>{getOverride=fn;},generation,advance:ms=>{clock+=ms;},drop:()=>{dropBeforeCommit=true;},lose:()=>{loseAck=true;},foreign:()=>{wrongOwner=true;},bad:()=>{badDigest=true;},fresh:()=>{fresh=true;}});} finally {rmSync(stateDir,{recursive:true,force:true});}
}
test('worker lost-ack retry survives restart with identical generation, sequence, payload and original receipt', () => workerFixture(async f=>{
  const publisher=f.factory(); f.lose(); await assert.rejects(publisher.publish(f.scan()),/lost acknowledgement/);
  f.advance(1000); const ack=await f.factory().publish(f.scan());
  assert.equal(ack.receivedAt,NOW); assert.equal(ack.sequence,1); assert.deepEqual(f.sent[0],f.sent[1]); assert.equal(f.wire[0],f.wire[1]);
  assert.deepEqual(f.methods,['GET','POST','PUT','PUT']);
  f.advance(1000); assert.deepEqual(await f.factory().publish(f.scan()),ack); assert.equal(f.sent.length,2,'same scan never renews scheduling receipt');
}));
test('worker incomplete scan publishes degraded state without reusing old coverage; concurrent submissions serialize', () => workerFixture(async f=>{
  const publisher=f.factory(); await publisher.publish(f.scan()); f.advance(1000);
  const failed=await publisher.publish(f.scan({checkedAt:new Date(Date.parse(NOW)+1000).toISOString(),complete:false,meetings:[{title:'old'}]}));
  assert.equal(failed.complete,false); assert.deepEqual(f.sent[1].meetings,[]);
  f.advance(2000); await Promise.all([2000,3000].map(ms=>publisher.publish(f.scan({checkedAt:new Date(Date.parse(NOW)+ms).toISOString()}))));
  assert.deepEqual(f.sent.map(row=>row.sequence),[1,2,3,4]); assert.equal(new Set(f.sent.map(row=>row.generation)).size,1);
}));
test('worker refuses foreign owner, wrong acknowledgement, stale scan, budget overflow and fresh generation takeover', async()=>{
  await workerFixture(async f=>{f.foreign(); await assert.rejects(f.factory().publish(f.scan()),/ownership/); assert.equal(f.sent.length,0);});
  await workerFixture(async f=>{f.bad(); await assert.rejects(f.factory().publish(f.scan()),/acknowledgement/);});
  await workerFixture(async f=>{f.advance(600000); await assert.rejects(f.factory().publish(f.scan()),/stale/); assert.equal(f.methods.length,0);});
  await workerFixture(async f=>{await assert.rejects(f.factory().publish(f.scan({meetings:Array(2001).fill({})})),/budget/); assert.equal(f.methods.length,0);});
  await workerFixture(async f=>{f.fresh(); await assert.rejects(f.factory().publish(f.scan()),/generation/); assert.deepEqual(f.methods,['GET']);});
});
test('native Gmail account and message scan preserve hosted rejection across refresh and Calendar identity dedup', () => fixture(async f=>{
  const p=provider(); let remote=[{id:'recorded-id',messageId:'message-a',status:'rejected',meetingUrl:raw({}).hangoutLink,startTime:START}];
  const deps=await configureCalendarAttendance({...f.deps,loadCandidates:async()=>remote},ATTENDANCE_ACCOUNT,{transport:{runGws:p.run,listUpcomingGwsMeetings},gmail:{scanGmailForMeetingCandidates:async()=>[{messageId:'message-a',subject:'Repeated invitation',senderEmail:'host@example.test',senderDomain:'example.test',meetingUrl:raw({}).hangoutLink,startTime:START,endTime:END}]}});
  const acquired=await deps.calendarAttendance.load(), candidates=await deps.loadCandidates(true);
  assert.equal(candidates.length,1); assert.equal(candidates[0].id,'recorded-id'); assert.equal(candidates[0].status,'rejected');
  assert.equal(deps.calendarAttendance.select({...input(acquired.meetings),candidates,attendanceMode:'all'}).toSchedule.length,0);
  p.account='foreign@example.test'; await assert.rejects(deps.loadCandidates(true),/Gmail account mismatch/);
}));
test('executable resolver honors installed explicit/PATH tools and refuses missing or relative overrides',()=>{
  assert.equal(resolveAttendanceExecutable('node',process.execPath),process.execPath);
  assert.equal(resolveAttendanceExecutable('node',undefined,{PATH:join(process.execPath,'..')}),process.execPath);
  assert.throws(()=>resolveAttendanceExecutable('node','node.exe'),/missing/);
  assert.throws(()=>resolveAttendanceExecutable('node',join(tmpdir(),'absent-node-fixture.exe')),/missing/);
});

test('configured attendance publishes actual adapter inventory and raw Gmail wire that matches the server schema', () => workerFixture(async f=>{
  const p=provider([raw({description:'Purpose supplied as untrusted source text'})]);
  const base={root:join(f.stateDir,'project'),stateDir:f.stateDir,env:{LKB_TENANT_ID:'fixture',LKB_CALENDAR_WORKER_HOST_ID:'host-a',LKB_API_URL:'https://operator.example.test',LKB_API_KEY:'test-key'},now:()=>NOW,loadCandidates:async()=>[]};
  const deps=await configureCalendarAttendance(base,ATTENDANCE_ACCOUNT,{transport:{runGws:p.run,listUpcomingGwsMeetings},fetch:f.transport,gmail:{scanGmailForMeetingCandidates:async()=>[{messageId:'mail-1',subject:'Career webinar',senderEmail:'host@example.test',senderDomain:'example.test',meetingUrl:raw({}).hangoutLink,startTime:START,endTime:END}]}});
  const acquired=await listUpcomingGwsMeetings(14,p.run,undefined,{syncToken:undefined}); const candidates=await deps.loadCandidates(true);
  await deps.publishWorkerState({checkedAt:NOW,complete:true,sourceEvents:acquired.sourceEvents,meetings:acquired.meetings,candidates,operations:{}});
  assert.equal(validateWorkerWire(f.sent[0]),true,JSON.stringify(validateWorkerWire.errors));
  assert.equal(f.sent[0].meetings[0].description,'Purpose supplied as untrusted source text');
  assert.equal(f.sent[0].candidates[0].subject,'Career webinar'); assert.equal('status' in f.sent[0].candidates[0],false);
}));

test('worker recovers an expired uncommitted retry only after the same-generation server fence proves it was not accepted',()=>workerFixture(async f=>{
  const publisher=f.factory(); f.drop(); await assert.rejects(publisher.publish(f.scan()),/not delivered/);
  f.advance(600001); const checkedAt=new Date(Date.parse(NOW)+600001).toISOString();
  const ack=await f.factory().publish(f.scan({checkedAt}));
  assert.equal(ack.sequence,2); assert.deepEqual(f.sent.map(row=>row.sequence),[1,1,2]);
  assert.deepEqual(f.methods,['GET','POST','PUT','PUT','GET','PUT']);
}));


test('discovery-only watch publishes without invoking capture or live readiness gates', async () => {
  const {runPipelineWatch} = await import('./run-pipeline.mjs');
  let ticks = 0, waits = 0;
  const shutdown = new AbortController();
  await runPipelineWatch({watch: true, discoveryOnly: true}, {signal: shutdown.signal, log: () => {},
    tick: async () => {ticks++; return {toRecord: [], skipped: []};},
    wait: async ms => {assert.equal(ms, 300000); waits++; shutdown.abort();}});
  assert.equal(ticks, 1); assert.equal(waits, 1);
  await assert.rejects(runPipelineWatch({run: true, discoveryOnly: true}, {tick: async () => {throw Error('must not capture');}}), /discovery.*capture/i);
});

test('cycle1 discovery retains cancellation absent from window and literal all-day source without capture gates', () => workerFixture(async f => {
  const day = '2026-10-28', endDay = '2026-10-29', p = provider([raw({id:'cancelled-outside',status:'cancelled',start:undefined,end:undefined}), raw({id:'all-day',start:{date:day},end:{date:endDay}})]);
  const run = p.run; p.run = async args => {const value=JSON.parse(await run(args)); if(args[0]==='calendar' && args[1]==='events' && JSON.parse(args[args.indexOf('--params')+1]).singleEvents===true) value.items=value.items.filter(row=>row.status!=='cancelled'); return JSON.stringify(value);};
  const summary={listed:0,fetched:0,candidates:0,excludedNonMeeting:0,excludedInternal:0,refusedSender:0,incompleteMessages:0,complete:true};
  const deps=await configureCalendarAttendance({root:f.stateDir,stateDir:f.stateDir,env:{LKB_TENANT_ID:'fixture',LKB_CALENDAR_WORKER_HOST_ID:'host-a',LKB_API_URL:'https://operator.example.test',LKB_API_KEY:'test-key'},now:()=>new Date().toISOString(),loadCandidates:async()=>[],validateTenant:async()=>{},launch:()=>assert.fail('no capture')},ATTENDANCE_ACCOUNT,{transport:{runGws:p.run,listUpcomingGwsMeetings},fetch:f.transport,gmail:{scanGmailForMeetingCandidates:async(_max,_run,opts)=>{assert.deepEqual(opts.ownDomains,[ATTENDANCE_ACCOUNT.split('@')[1]]);opts.onSummary(summary);return [];}}});
  const result=await deps.calendarAttendance.publishDiscovery();
  assert.equal(result.status,'running'); assert.equal(result.discovery.calendar.status,'healthy');
  assert.ok(f.sent[0].sourceEvents.some(row=>row.id==='cancelled-outside' && row.cancelled));
  assert.equal(f.sent[0].meetings.some(row=>row.id==='cancelled-outside'),false);
  assert.equal(f.sent[0].meetings.find(row=>row.id==='all-day').startTime,day); assert.equal(f.sent[0].meetings.find(row=>row.id==='all-day').endTime,endDay);
  assert.deepEqual(f.sent[0].gmailSummary,summary); assert.equal(validateWorkerWire(f.sent[0]),true,JSON.stringify(validateWorkerWire.errors));
  const {projectWatchResult}=await import('./scheduler/watch-output.mjs'); assert.equal(projectWatchResult(result,[],v=>v).status,'running');
}));
test('cycle1 native attendance refuses MIME evidence barriers despite hosted approval and matching Calendar link',()=>fixture(async f=>{
  const acquired=await f.deps.calendarAttendance.load(), candidate={id:'mail',status:'approved',meetingUrl:acquired.meetings[0].meetingUrl,startTime:START,evidenceIssue:'unresolved-body'};
  const selected=f.deps.calendarAttendance.select({...input(acquired.meetings),candidates:[candidate]});
  assert.equal(selected.toSchedule.length,0);assert.equal(selected.skipped[0].reason,'needs-review');
  const id=f.deps.calendarAttendance.select(input(acquired.meetings)).toSchedule[0].sessionKey;
  assert.equal(f.deps.calendarAttendance.activeStopReason(id,{calendarEvents:acquired.meetings,candidates:[candidate]}),'cancelled');
}));

test('cycle1 native failed upload retains acknowledged source checkpoint without invoking capture',()=>fixture(async f=>{
  f.p.rows=[];await runPipelineTick(f.deps,true);
  const file=join(f.stateDir,'operations.json'), before=JSON.parse(readFileSync(file)).source;
  f.p.rows=[raw({id:'all-day',start:{date:'2026-10-28'},end:{date:'2026-10-29'}})];
  f.deps.publishWorkerState=async()=>{throw Error('fixture upload refused');};
  await assert.rejects(runPipelineTick(f.deps,true),/acquisition validation/);
  assert.deepEqual(JSON.parse(readFileSync(file)).source,before);assert.equal(f.calls.length,0);
},{proof:true}));

 test('office admission veto survives all mode, old Gmail approval and true domain boundaries', () => {
  for (const organizer of ['host@vidysea.com', 'HOST@VIDYSEA.COM', 'host@dept.vidysea.com']) {
    const observation = rawAttendanceObservation(raw({organizer: {email: organizer}}));
    for (const attendanceMode of [undefined, 'all', 'rules']) {
      const selected = selectVerifiedCalendarMeetings({...input([observation.event]), attendanceMode}, () => observation);
      assert.equal(selected.toSchedule.length, 0, organizer);
      assert.equal(selected.skipped[0].reason, 'rule-denied');
    }
  }
  for (const organizer of ['host@notvidysea.com', 'host@vidysea.com.evil.test', 'host@example.test']) {
    const observation = rawAttendanceObservation(raw({organizer: {email: organizer}}));
    assert.equal(selectVerifiedCalendarMeetings({...input([observation.event]), ownDomains: ['example.test']}, () => observation).toSchedule.length, 1);
  }
  const observation = rawAttendanceObservation(raw({}));
  for (const status of ['pending', 'approved', 'auto_approved', 'rejected']) {
    const candidates = [{id: 'old-internal', status, senderEmail: 'host@vidysea.com', senderDomain: 'external.test', meetingUrl: observation.event.meetingUrl, startTime: START}];
    const selected = selectVerifiedCalendarMeetings({...input([observation.event]), attendanceMode: 'all', candidates}, () => observation);
    assert.equal(selected.toSchedule.length, 0, status);
  }
});
 test('trusted canonical office domains veto without widening mode-absent external compatibility', () => {
  const observation = rawAttendanceObservation(raw({}));
  const ruleSet = {version: 1, ownDomains: ['EXAMPLE.TEST.'], rules: [], attendanceMode: 'all'};
  const selected = selectVerifiedCalendarMeetings(input([observation.event]), () => observation, ruleSet);
  assert.equal(selected.toSchedule.length, 0); assert.equal(selected.skipped[0].reason, 'rule-denied');
  assert.equal(selectVerifiedCalendarMeetings(input([observation.event]), () => observation).toSchedule.length, 1);
  assert.throws(() => selectVerifiedCalendarMeetings(input([observation.event]), () => observation, {...ruleSet, ownDomains: ['invalid/domain']}));
});

test('office native acquisition blocks launch and refresh stops an active office meeting', () => fixture(async f => {
  f.p.rows = [raw({organizer: {email: 'host@vidysea.com'}, attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'needsAction'}]})];
  f.deps.applyJoinRules = async (selection, options) => options.selectWithRules({document: {stored: {ruleSet: {version: 1, ownDomains: [], rules: [], attendanceMode: 'all'}}}});
  const preview = await runPipelineTick(f.deps);
  assert.equal(preview.toRecord.length, 0); assert.ok(preview.skipped.some(row => row.reason === 'rule-denied' && row.detail === 'Skipped: office/internal'));
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.stateDir), false);
  const source = f.deps.calendarAttendance, acquired = await source.load();
  assert.equal(source.activeStopReason((await import('./calendar-attendance-policy.mjs')).attendanceSessionKey(acquired.meetings[0]), {calendarEvents: acquired.meetings}), 'cancelled');
}));
test('malformed organizer domains never acquire attendance approval', () => {
  for (const organizer of ['host@vidysea.com.', 'host@bad_domain.test', 'Name <host@vidysea.com>', 'host@vidysea.com '])
    assert.equal(choose([raw({organizer: {email: organizer}})]).toSchedule.length, 0, organizer);
});

test('worker schema400 legacy incomplete retry recovers only for an advanced scan across restart',()=>workerFixture(async f=>{
  f.drop(); await assert.rejects(f.factory().publish(f.scan({complete:false})),/not delivered/);
  const file=join(f.stateDir,'calendar-worker.json'), legacy=JSON.parse(readFileSync(file,'utf8'));
  delete legacy.pending.sourceEvents;
  assert.equal(validateWorkerWire(legacy.pending),false); assert.ok(validateWorkerWire.errors.some(row=>row.keyword==='required'&&row.params.missingProperty==='sourceEvents'));
  writeFileSync(file,JSON.stringify(legacy)); const before=readFileSync(file,'utf8');
  await assert.rejects(f.factory().publish(f.scan({complete:false})),/refused/);
  assert.equal(readFileSync(file,'utf8'),before); assert.equal(f.methods.filter(method=>method==='GET').length,1,'unchanged scan never abandons pending');
  f.advance(1000); const ack=await f.factory().publish(f.scan({checkedAt:new Date(Date.parse(NOW)+1000).toISOString()}));
  assert.equal(ack.sequence,2); assert.equal(ack.complete,true); assert.equal(validateWorkerWire(f.sent.at(-1)),true,JSON.stringify(validateWorkerWire.errors));
  assert.equal(f.wire[1],f.wire[2],'persisted legacy retry is replayed exactly');
  assert.deepEqual(f.sent.map(row=>row.sequence),[1,1,1,2]); assert.deepEqual(f.methods,['GET','POST','PUT','PUT','PUT','GET','PUT']);
}));
test('worker cannot discard rejected pending behind changed generation, invalid/equal/higher fence or refused read',async()=>{
  for(const status of [400,422]) for(const fence of ['changed-generation','equal','higher','negative','fraction','unsafe','read-refused','read-foreign','read-network']) await workerFixture(async f=>{
    f.drop(); await assert.rejects(f.factory().publish(f.scan({complete:false})),/not delivered/);
    const file=join(f.stateDir,'calendar-worker.json'), before=readFileSync(file,'utf8');
    f.failPut(()=>new Response('{}',{status,headers:{'X-LKB-Tenant':'fixture'}}));
    f.readFence(()=>{
      if(fence==='read-network') throw new TypeError('read failed');
      const sequence={equal:1,higher:2,negative:-1,fraction:0.5,unsafe:Number.MAX_SAFE_INTEGER+1}[fence]??0;
      return new Response(JSON.stringify({generation:fence==='changed-generation'?'22222222-2222-4222-8222-222222222222':f.generation,sequence}),{status:fence==='read-refused'?403:200,headers:{'X-LKB-Tenant':fence==='read-foreign'?'foreign':'fixture'}});
    });
    f.advance(1000); await assert.rejects(f.factory().publish(f.scan({checkedAt:new Date(Date.parse(NOW)+1000).toISOString()})));
    assert.equal(readFileSync(file,'utf8'),before,status+'/'+fence); assert.deepEqual(f.sent.map(row=>row.sequence),[1,1]);
  });
});
test('worker never discards on unauthenticated rejection, protocol/read failure, conflict or network error',async()=>{
  for(const kind of ['foreign400','foreign422','missing400','missing422','empty400','empty422','bad-json400','stream422','401','403','409','network']) await workerFixture(async f=>{
    f.drop(); await assert.rejects(f.factory().publish(f.scan({complete:false})),/not delivered/);
    const file=join(f.stateDir,'calendar-worker.json'), before=readFileSync(file,'utf8');
    f.failPut(()=>{
      if(kind==='network') throw new TypeError('write failed');
      const status=Number(kind.match(/\d+$/)?.[0]); const headers={'X-LKB-Tenant':kind.startsWith('foreign')?'foreign':'fixture'}; if(kind.startsWith('missing')) delete headers['X-LKB-Tenant'];
      const body=kind.startsWith('empty')?null:kind.startsWith('bad-json')?'{':kind.startsWith('stream')?new ReadableStream({start(controller){controller.error(new Error('read failed'));}}):'{}';
      return new Response(body,{status,headers});
    });
    f.advance(1000); await assert.rejects(f.factory().publish(f.scan({checkedAt:new Date(Date.parse(NOW)+1000).toISOString()})));
    assert.equal(readFileSync(file,'utf8'),before,kind); assert.equal(f.methods.filter(method=>method==='GET').length,1,kind); assert.deepEqual(f.sent.map(row=>row.sequence),[1,1]);
  });
});

test('A9 (D-257, D-258): one meeting at a time needs no signed pool-slot acceptance; the pool, the default and operator sign-off still do', () => fixture(async f => {
  const media = async () => ({streams: [{codec_type: 'audio', channels: 2}, {codec_type: 'video', width: 1280, height: 720}], format: {duration: 5}});
  let slotChecks = 0;
  Object.assign(f.deps, {captureSlots: ['career-a'], validateCaptureSlots: async () => {slotChecks++; throw new Error('Each capture slot requires reviewed real host capability evidence');}});
  Object.assign(f.deps.env, {LKB_CALENDAR_WORKER_HOST_ID: 'kb-bot-1', LKB_API_URL: 'https://api.example.test'});
  await checkCalendarAttendanceReady(f.deps, validateRunGate, media, {autonomous: false});
  assert.equal(slotChecks, 0, 'single-meeting mode skips the pool-slot acceptance');
  await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, media), /reviewed real host capability/, 'a caller that does not say single-meeting stays strict');
  await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, media, {autonomous: true}), /reviewed real host capability/, 'the parallel pool stays strict');
  for (const value of ['operator', ' operator', 'OPERATOR']) {
    f.deps.env.LKB_SLOT_READINESS = value;
    await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, media, {autonomous: false}), /reviewed real host capability/, `${JSON.stringify(value)} restores the person sign-off`);
  }
  f.deps.env.LKB_SLOT_READINESS = 'machine';
  await checkCalendarAttendanceReady(f.deps, validateRunGate, media, {autonomous: false});
  delete f.deps.env.LKB_SLOT_READINESS;
  await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, async () => ({streams: [], format: {duration: 1}}), {autonomous: false}), /audio\/video/, 'the proof media probe (the machine check) still runs');
  delete f.deps.env.LKB_CALENDAR_WORKER_HOST_ID;
  await assert.rejects(checkCalendarAttendanceReady(f.deps, validateRunGate, media, {autonomous: false}), /hosted worker/, 'the hosted worker binding is still required');
  assert.equal(f.calls.length, 0);
}, {proof: true}));

test('A9 wiring: a one-shot --run tick with one unsigned slot reaches the runner; operator sign-off mode refuses it', () => fixture(async f => {
  let slotChecks = 0;
  Object.assign(f.deps, {captureSlots: ['career-a'], validateCaptureSlots: async () => {slotChecks++; throw new Error('Each capture slot requires reviewed real host capability evidence');}});
  Object.assign(f.deps.env, {LKB_CALENDAR_WORKER_HOST_ID: 'kb-bot-1', LKB_API_URL: 'https://api.example.test'});
  await runPipelineTick(f.deps, true);
  assert.equal(slotChecks, 0); assert.equal(f.calls.length, 1, 'the one meeting is recorded');
  f.deps.env.LKB_SLOT_READINESS = 'operator';
  await assert.rejects(runPipelineTick(f.deps, true), /reviewed real host capability/);
  assert.equal(f.calls.length, 1, 'operator sign-off mode blocks before any new capture');
}, {proof: true}));

// D-261 (U1): a direct join link that arrives in a plain mail to the bot mailbox is attended in attendance mode 'all'.
const ZOOM = 'https://us02web.zoom.us/w/81234567890?tk=personal-token';
const mail = changes => ({id: 'mail-1', title: 'Career webinar', status: 'pending', senderEmail: 'no-reply@zoom.us', senderDomain: 'zoom.us',
  senderAuthenticated: true, meetingUrl: ZOOM, startTime: START, endTime: END, ...changes});
const mailInput = (candidates, changes = {}) => ({calendarEvents: [], candidates, now: NOW, leadMinutes: 5, alreadyScheduled: [], attendanceMode: 'all', ...changes});
const pickMail = (candidates, changes) => selectVerifiedCalendarMeetings(mailInput(candidates, changes), () => undefined);

test('D-261: a plain-mail direct join link is scheduled in attendance mode all', () => {
  const out = pickMail([mail({})]);
  assert.equal(out.toSchedule.length, 1);
  const row = out.toSchedule[0];
  assert.equal(row.source, 'gmail'); assert.equal(row.sourceId, 'mail-1'); assert.equal(row.meetingUrl, ZOOM);
  assert.equal(row.startTime, START); assert.equal(row.endTime, END); assert.equal(row.sender, 'no-reply@zoom.us');
  for (const url of ['https://meet.google.com/abc-defg-hij', 'https://zoom.us/j/81234567890?pwd=x', 'https://teams.microsoft.com/l/meetup-join/19%3ameeting'])
    assert.equal(pickMail([mail({meetingUrl: url})]).toSchedule.length, 1, url);
});

test('D-261: mail links are never scheduled outside attendance mode all', () => {
  for (const attendanceMode of [undefined, 'accepted', 'none']) assert.equal(pickMail([mail({})], {attendanceMode}).toSchedule.length, 0, String(attendanceMode));
});

for (const [name, change] of [
  ['registration-only', {registrationOnly: true}], ['evidence issue', {evidenceIssue: 'time-unclear'}], ['rejected', {status: 'rejected'}],
  ['cancelled', {cancelled: true}], ['unauthenticated sender', {senderAuthenticated: false}], ['missing authentication', {senderAuthenticated: undefined}],
  ['authentication not literally true', {senderAuthenticated: 'true'}],
  ['registration page', {meetingUrl: 'https://zoom.us/webinar/register/WN_abc'}], ['zoho link', {meetingUrl: 'https://meeting.zoho.com/meeting/register?sessionId=1'}],
  ['look-alike host', {meetingUrl: 'https://meet.google.com.evil.test/abc-defg-hij'}], ['look-alike zoom', {meetingUrl: 'https://zoom.us.evil.test/j/81234567890'}],
  ['http scheme', {meetingUrl: 'http://meet.google.com/abc-defg-hij'}], ['userinfo', {meetingUrl: 'https://u:p@meet.google.com/abc-defg-hij'}],
  ['no link', {meetingUrl: undefined}], ['no end time', {endTime: undefined}], ['end before start', {endTime: START, startTime: END}],
  ['past', {startTime: new Date(Date.parse(NOW) - 7200000).toISOString(), endTime: new Date(Date.parse(NOW) - 3600000).toISOString()}],
]) test(`D-261: mail link refused (silently: no alert row) when ${name}`, () => {
  const out = pickMail([mail(change)]);
  assert.equal(out.toSchedule.length, 0); assert.deepEqual(out.skipped, []);
});

test('D-261: an office sender mail is refused and listed once as office/internal (unchanged)', () => {
  const out = pickMail([mail({senderEmail: 'host@vidysea.com'})]);
  assert.equal(out.toSchedule.length, 0); assert.deepEqual(out.skipped.map(row => row.reason), ['rule-denied']);
});

test('D-261: a mail link more than the lead window away waits (neither scheduled nor skipped)', () => {
  const later = new Date(Date.parse(NOW) + 3600000).toISOString(), end = new Date(Date.parse(NOW) + 7200000).toISOString();
  const out = pickMail([mail({startTime: later, endTime: end})]);
  assert.equal(out.toSchedule.length, 0); assert.equal(out.skipped.length, 0);
});

test('D-261: the calendar wins over a mail for the same meeting; repeats of one mail link are scheduled once', () => {
  const observation = rawAttendanceObservation(raw({}));
  const same = mail({meetingUrl: 'https://meet.google.com/abc-defg-hij'});
  const both = selectVerifiedCalendarMeetings({...mailInput([same]), calendarEvents: [observation.event]}, () => observation);
  assert.equal(both.toSchedule.length, 1); assert.equal(both.toSchedule[0].source, 'calendar');
  // a declined calendar invite for the same meeting is not overridden by the mail
  const declined = rawAttendanceObservation(raw({attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]}));
  assert.equal(selectVerifiedCalendarMeetings({...mailInput([same]), calendarEvents: [declined.event]}, () => declined).toSchedule.length, 0);
  const twice = pickMail([mail({}), mail({id: 'mail-2', meetingUrl: ZOOM.replace('personal-token', 'other')})]);
  assert.equal(twice.toSchedule.length, 1);
  const first = twice.toSchedule[0];
  assert.equal(pickMail([mail({})], {alreadyScheduled: [first.sessionKey]}).toSchedule.length, 0);
});

// review A: matching is by the meeting (code / number / Teams path) within a time window, never by link text.
const meetVariants = ['https://meet.google.com/abc-defg-hij?authuser=0', 'https://meet.google.com/abc-defg-hij/', 'https://meet.google.com/abc-defg-hij?hs=224'];
test('D-261 review A: a declined calendar invite is never overridden by a variant link or a shifted mail time', () => {
  const declined = rawAttendanceObservation(raw({attendees: [{email: ATTENDANCE_ACCOUNT, self: true, responseStatus: 'declined'}]}));
  const shifted = new Date(Date.parse(START) + 60000).toISOString();
  for (const meetingUrl of meetVariants) for (const startTime of [START, shifted])
    assert.equal(selectVerifiedCalendarMeetings({...mailInput([mail({meetingUrl, startTime})]), calendarEvents: [declined.event]}, () => declined).toSchedule.length, 0, meetingUrl + startTime);
});
test('D-261 review A: one meeting is scheduled once across link variants (Meet query, Zoom subdomain, Zoom /j vs /w)', () => {
  const groups = [meetVariants.concat('https://meet.google.com/abc-defg-hij'),
    ['https://us02web.zoom.us/j/81234567890', 'https://zoom.us/j/81234567890', 'https://us02web.zoom.us/w/81234567890?tk=a', 'https://us06web.zoom.us/w/81234567890?tk=b']];
  for (const urls of groups) {
    const out = pickMail(urls.map((meetingUrl, n) => mail({id: 'mail-' + n, meetingUrl})));
    assert.equal(out.toSchedule.length, 1, urls[0]);
    const again = pickMail(urls.map((meetingUrl, n) => mail({id: 'next-' + n, meetingUrl})), {alreadyScheduled: [out.toSchedule[0].sessionKey]});
    assert.equal(again.toSchedule.length, 0, 'a later tick with another variant is the same session');
  }
  // two different meetings both go
  assert.equal(pickMail([mail({}), mail({id: 'other', meetingUrl: 'https://zoom.us/j/99999999999'})]).toSchedule.length, 2);
});
test('D-261 review A: a rejected, cancelled, review or office sibling mail for the same meeting blocks the good one', () => {
  for (const sibling of [{status: 'rejected'}, {cancelled: true}, {evidenceIssue: 'unresolved-body'}, {registrationOnly: true}, {senderEmail: 'x@vidysea.com'}])
    assert.equal(pickMail([mail({}), mail({id: 'sib', meetingUrl: 'https://zoom.us/j/81234567890', ...sibling})]).toSchedule.length, 0, JSON.stringify(sibling));
});
test('D-261 review A: a mail-sourced capture stops when its mail turns bad or the calendar takes the meeting', () => fixture(async f => {
  const acquired = await f.deps.calendarAttendance.load(), good = mail({});
  const selected = f.deps.calendarAttendance.select({...input([]), candidates: [good], attendanceMode: 'all'});
  assert.equal(selected.toSchedule.length, 1); const id = selected.toSchedule[0].sessionKey;
  const stop = (candidates, calendarEvents = []) => f.deps.calendarAttendance.activeStopReason(id, {calendarEvents, candidates});
  assert.equal(stop([good]), undefined);
  for (const change of [{status: 'rejected'}, {cancelled: true}, {evidenceIssue: 'unresolved-body'}]) assert.equal(stop([{...good, ...change}]), 'cancelled', JSON.stringify(change));
  assert.equal(stop([good, mail({id: 'sib', meetingUrl: 'https://zoom.us/j/81234567890', status: 'rejected'})]), 'cancelled');
  assert.equal(stop([{...good, senderAuthenticated: false}]), 'cancelled');
  assert.equal(stop([good, mail({id: 'sib', meetingUrl: 'https://zoom.us/j/81234567890', senderEmail: 'x@vidysea.com'})]), 'cancelled');
  const copy = {...acquired.meetings[0], meetingUrl: 'https://zoom.us/j/81234567890', startTime: START, endTime: END};
  assert.equal(stop([good], [{...copy, cancelled: true}]), 'cancelled', 'a cancelled calendar copy stops it');
  assert.equal(stop([good], [{...copy, organizer: 'host@vidysea.com'}]), 'cancelled', 'an office calendar copy stops it');
  assert.equal(stop([good], [copy]), undefined, 'an attendable calendar copy hands over: the live capture keeps running');
  assert.equal(stop([good], acquired.meetings), undefined, 'another calendar meeting does not stop it');
}));

// review B
test('D-261 review B: the mail session key is the reconciler key for that mail row', async () => {
  const {webinarIdentity, webinarSessionKey} = await import('../../packages/meeting-bot/src/calendar/auto-record-policy.ts');
  assert.equal(pickMail([mail({})]).toSchedule[0].sessionKey, webinarSessionKey(webinarIdentity(ZOOM, START)));
  // the representative mail is the oldest received, so the key is stable when a newer variant arrives
  const out = pickMail([mail({id: 'z-new', receivedAt: '2026-11-27T10:00:00Z', meetingUrl: 'https://zoom.us/j/81234567890'}), mail({id: 'a-old', receivedAt: '2026-11-20T10:00:00Z'})]);
  assert.equal(out.toSchedule.length, 1); assert.equal(out.toSchedule[0].sourceId, 'a-old');
});
test('D-261 review B: a mail meeting longer than 8 hours is refused', () => {
  assert.equal(pickMail([mail({endTime: new Date(Date.parse(START) + 9 * 3600000).toISOString()})]).toSchedule.length, 0);
  assert.equal(pickMail([mail({endTime: new Date(Date.parse(START) + 7 * 3600000).toISOString()})]).toSchedule.length, 1);
});
test('D-261 review B: while a mail session runs, a calendar copy of the meeting is a duplicate, not a second capture', () => {
  const variant = 'https://meet.google.com/abc-defg-hij?authuser=0', running = pickMail([mail({meetingUrl: variant})]).toSchedule[0].sessionKey;
  const observation = rawAttendanceObservation(raw({}));
  const out = selectVerifiedCalendarMeetings({...mailInput([mail({meetingUrl: variant})]), calendarEvents: [observation.event], alreadyScheduled: [running]}, () => observation);
  assert.equal(out.toSchedule.length, 0); assert.ok(out.skipped.some(row => row.source === 'calendar' && row.reason === 'duplicate-session'));
  // without a running mail session the calendar item is scheduled as before
  assert.equal(selectVerifiedCalendarMeetings({...mailInput([]), calendarEvents: [observation.event]}, () => observation).toSchedule.length, 1);
});
