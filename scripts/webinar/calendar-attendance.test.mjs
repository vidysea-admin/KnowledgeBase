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
  await runPipelineTick(f.deps, true); assert.equal(f.calls.length, 1, 'restart must not rejoin the failed occurrence without its explicit recovery flow');
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
