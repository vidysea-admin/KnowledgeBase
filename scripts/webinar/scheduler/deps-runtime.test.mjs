import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync} from 'node:fs';
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

const {enforceJoinRules} = await import('../../../packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts');
const remoteSelection = {toSchedule: [{sessionKey:'sample-a', source:'calendar', sourceId:'event-a', title:'Career webinar', sender:'host@example.test', meetingUrl:'https://meet.google.com/abc-defg-hij'}], skipped:[]};
const remoteDocument = {ruleSet:{version:1, ownDomains:[], rules:[{id:'deny',effect:'deny',match:{email:'host@example.test'}}]}, state:{approvedSenders:[],approvedDomains:[],optedOutEventIds:[]}};
test('remote policy is authoritative, owner-bound, restart cached only for transient failure within original expiry', () => fixture(async f => {
  let clock=1000000, calls=0, failure;
  const remote={url:'https://operator.example.test', apiKey:'test-key', fetch:async (_url,options) => {
    calls++; assert.equal(options.redirect,'error'); assert.equal(options.headers.authorization,'Bearer test-key');
    if(failure==='transport') throw new TypeError('offline',{cause:{code:'ECONNREFUSED'}});
    return new Response(JSON.stringify(remoteDocument), {status:failure==='unauthorized'?401:200, headers:{'X-LKB-Tenant':failure==='wrong-owner'?'foreign':'fixture','ETag':'"revision-1"'}});
  }};
  const config={mode:'last-valid',tenantId:'fixture',keyTenantId:'fixture',stateDir:join(f.root,'raw/webinars'),log:()=>{},now:()=>clock,remote};
  const first=await enforceJoinRules(remoteSelection,config);
  assert.equal(first.toSchedule.length,0); assert.equal(first.skipped[0].reason,'rule-denied'); assert.equal(calls,1);
  failure='transport'; clock+=1000;
  assert.equal((await enforceJoinRules(remoteSelection,{...config})).skipped[0].reason,'rule-denied');
  clock=1000000+3600000; assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
  clock=1000001; failure='wrong-owner'; assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
  failure='transport'; assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable','wrong owner invalidates cached authority');
}));
test('remote malformed body and authorization refusal never fall back or use permissive fail-open/off', () => fixture(async f => {
  for(const mode of ['off','fail-open','fail-closed','last-valid']) {
    let response=new Response(JSON.stringify(remoteDocument),{headers:{'X-LKB-Tenant':'fixture','ETag':'"good"'}});
    const config={mode,tenantId:'fixture',keyTenantId:'fixture',stateDir:join(f.root,'raw/webinars'),log:()=>{},remote:{url:'https://operator.example.test',apiKey:'test-key',fetch:async()=>response}};
    assert.equal((await enforceJoinRules(remoteSelection,config)).toSchedule.length,0);
    response=new Response('{"ruleSet":null}',{headers:{'X-LKB-Tenant':'fixture','ETag':'"bad"'}});
    assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
    response=new Response('{}',{status:403});
    assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
  }
}));

test('remote redirect/configuration errors and a foreign owner on 503 are hard refusals, not cached transport outages',()=>fixture(async f=>{
  let behavior='good';
  const config={mode:'last-valid',tenantId:'fixture',keyTenantId:'fixture',stateDir:join(f.root,'raw/webinars'),log:()=>{},remote:{url:'https://operator.example.test',apiKey:'test-key',fetch:async()=>{
    if(behavior==='redirect') throw new TypeError('fetch failed',{cause:new Error('unexpected redirect')});
    if(behavior==='network') throw new TypeError('offline',{cause:{code:'ECONNREFUSED'}});
    return new Response(JSON.stringify(remoteDocument),{status:behavior==='foreign503'?503:200,headers:{'X-LKB-Tenant':behavior==='foreign503'?'foreign':'fixture','ETag':'"revision-2"'}});
  }}};
  assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rule-denied');
  behavior='redirect'; assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
  behavior='network'; assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
  behavior='good'; await enforceJoinRules(remoteSelection,config); behavior='foreign503';
  assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');
}));

const {applyJoinRules} = await import('../../../packages/meeting-bot/src/calendar/join-rules/join-rules-select.ts');
test('runtime veto keeps legacy unmatched behaviour, refuses needs-approval in explicit modes, and carries title/description',()=>{
  const selection={toSchedule:[{...remoteSelection.toSchedule[0],description:'Career purpose text'}],skipped:[]};
  let received; const evaluate=event=>{received=event; return {action:'needs-approval',reason:'no-matching-rule',ruleId:'default-deny'};};
  const legacy={version:1,ownDomains:[],rules:[]};
  assert.equal(applyJoinRules(selection,legacy,{},evaluate).toSchedule.length,1);
  for(const attendanceMode of ['rules','all']) {
    const result=applyJoinRules(selection,{...legacy,attendanceMode},{},evaluate);
    assert.equal(result.toSchedule.length,0); assert.equal(result.skipped[0].reason,'rule-denied');
  }
  assert.equal(received.title,'Career webinar'); assert.equal(received.description,'Career purpose text');
});
test('hosted rules reselection uses the exact authenticated document that the veto subsequently evaluates',()=>fixture(async f=>{
  let selections=0; const selected={...remoteSelection,toSchedule:remoteSelection.toSchedule.map(row=>({...row,description:'Private description'}))};
  const result=await enforceJoinRules({toSchedule:[],skipped:[]},{mode:'off',tenantId:'fixture',keyTenantId:'fixture',stateDir:join(f.root,'raw/webinars'),log:()=>{},readOnly:true,
    selectWithRules:authority=>{selections++; assert.deepEqual(authority.document.stored,remoteDocument); assert.equal(authority.keyTenantId,'fixture'); return selected;},
    remote:{url:'https://operator.example.test',apiKey:'test-key',fetch:async()=>new Response(JSON.stringify(remoteDocument),{headers:{'X-LKB-Tenant':'fixture','ETag':'"revision-3"'}})}});
  assert.equal(selections,1); assert.equal(result.toSchedule.length,0); assert.equal(result.skipped[0].reason,'rule-denied');
}));


test('uncertain acquired time persists a refusal on old approved rows and never schedules',async()=>{
  const {scanGmailForMeetingCandidates}=await import('../../../apps/api/src/gws/gws-gmail.ts');
  const {createMeetingCandidatesDeps}=await import('../../../apps/api/src/store.ts');
  const {createIfNew}=await import('../../../packages/db/src/collections/meeting-candidates.ts');
  const {selectAutoRecordItems}=await import('../../../packages/meeting-bot/src/calendar/auto-join.ts');
  const url='https://meet.google.com/abc-defg-hij';
  const scan=async(conflict=false,yearless=false,variant="")=>scanGmailForMeetingCandidates(10,async args=>JSON.stringify(args.includes('list')?{messages:[{id:'time-evidence'}]}:{id:'time-evidence',...(variant==='no-receipt'?{}:{internalDate:String(Date.parse('2026-10-20T11:00:00Z'))}),payload:{headers:[{name:'From',value:'host@example.org'},{name:'Subject',value:'Webinar invitation'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.d=example.org'}],mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:Buffer.from(variant==='no-time'?url:yearless?'Date: '+(variant==='outside-window'?'July 15':'October 27')+' Time: 12 PM - 1 PM PT '+url:'Date: October 15, 2099 Time: 10 AM - 11 AM'+(variant==='missing-zone'?'':' UTC')+' '+url).toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from(variant==='no-time'?url:yearless?'Date: '+(variant==='outside-window'?'July 15':'October 27')+' Time: 12 PM - 1 PM PT '+url:'Date: October 15, 2099 Time: '+(conflict?'12 PM - 1 PM':'10 AM - 11 AM')+(variant==='missing-zone'?'':' UTC')+' '+url).toString('base64url')}}]}}),{});
  mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T12:00:00Z')});
  try {
    const [safe]=await scan(); assert.equal(safe.startTime,'2099-10-15T10:00:00.000Z');
    for(const [conflict,yearless,variant] of [[false,false,''],[true,false,''],[false,true,'no-receipt'],[false,true,'outside-window'],[false,false,'missing-zone'],[false,false,'no-time']]){
      const refused=conflict||Boolean(variant);
      const [found]=await scan(conflict,yearless,variant),stored={...safe,_id:'approved',tenantId:'owner',status:'approved',detectedAt:'2026-10-01T00:00:00Z'};let writes=0;
      const db={collection(name){assert.equal(name,'meeting_candidates');return{async findOne(filter){assert.equal(filter.tenantId,'owner');return structuredClone(stored)},async updateOne(filter,update){assert.equal(filter.tenantId,'owner');Object.assign(stored,update.$set);writes++;return{matchedCount:1}},async insertOne(){throw Error('unexpected insert')}}}};
      const deps=createMeetingCandidatesDeps('owner',async()=>[found],()=> 'synthetic_work',{getTrustedSender:async()=>undefined,createMeetingCandidateIfNew:(tenant,doc)=>createIfNew(tenant,doc,db),listAllMeetingCandidates:async()=>[structuredClone(stored)]});
      assert.equal((await deps.scanGmail('owner')).created,0);const listed=await deps.listCandidates('owner');assert.equal(listed.length,1);
      const selected=selectAutoRecordItems({calendarEvents:[],candidates:listed.map(r=>({...r,id:r._id,title:r.subject})),now:'2099-10-15T10:00:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[]});
      assert.equal(selected.toSchedule.length,refused?0:1,variant||String(conflict));assert.equal(writes,refused?1:0);assert.equal(stored.status,'approved');assert.equal(stored.startTime,safe.startTime);assert.equal(stored.evidenceIssue,refused?'unresolved-body':undefined);
    }
    const [yearless]=await scan(false,true);assert.equal(yearless.evidenceIssue,'unresolved-body');assert.equal(yearless.startTime,undefined);
    const selected=selectAutoRecordItems({calendarEvents:[],candidates:[{...yearless,id:'yearless',title:yearless.subject,status:'approved'}],now:'2026-10-27T19:00:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[]});assert.equal(selected.toSchedule.length,0);
  } finally {mock.timers.reset();}
});

test('remote snapshots bind rotated and revoked credentials, keep readOnly pure, and tolerate persistence failure',()=>fixture(async f=>{
  const {joinRulesFilePath}=await import('../../../packages/meeting-bot/src/calendar/join-rules/join-rules-store.ts');
  let behavior='good',alerts=0,recoveries=0;const logs=[];
  const config={mode:'last-valid',tenantId:'fixture',keyTenantId:'fixture',stateDir:join(f.root,'cache-test'),now:()=>1000000,log:m=>logs.push(m),onDegraded:()=>{alerts++;},onHealthy:()=>{recoveries++;},remote:{url:'https://policy.example.test',apiKey:'original-test-key',fetch:async()=>{
    if(behavior==='offline')throw new TypeError('offline',{cause:{code:'ECONNREFUSED'}});
    return new Response(JSON.stringify(remoteDocument),{status:behavior==='revoked'?401:200,headers:{'X-LKB-Tenant':'fixture','ETag':'"fixture"'}});
  }}};
  const cached=joinRulesFilePath(config.stateDir,'fixture').replace(/\.json$/,'.remote.json');
  assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rule-denied');assert.equal(recoveries,1);assert.equal(existsSync(cached),true);assert.doesNotMatch(readFileSync(cached,'utf8'),/original-test-key|rotated-test-key/);
  config.remote.apiKey='rotated-test-key';behavior='offline';assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable','a different credential cannot use the previous credential snapshot');
  config.remote.apiKey='original-test-key';behavior='revoked';assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable');assert.equal(existsSync(cached),false);
  behavior='offline';assert.equal((await enforceJoinRules(remoteSelection,config)).skipped[0].reason,'rules-unevaluable','known revocation cannot recover from stale cache');assert.ok(alerts>=3);
  let dryAlerts=0,dryHealthy=0;const dry={...config,stateDir:join(f.root,'dry-test'),readOnly:true,onDegraded:()=>{dryAlerts++;},onHealthy:()=>{dryHealthy++;}};
  behavior='good';assert.equal((await enforceJoinRules(remoteSelection,dry)).skipped[0].reason,'rule-denied');behavior='offline';assert.equal((await enforceJoinRules(remoteSelection,dry)).skipped[0].reason,'rules-unevaluable');assert.equal(existsSync(dry.stateDir),false);assert.equal(dryAlerts,0);assert.equal(dryHealthy,0);
  const full={...config,stateDir:join(f.root,'blocked-test')},blocked=joinRulesFilePath(full.stateDir,'fixture').replace(/\.json$/,'.remote.json');mkdirSync(blocked,{recursive:true});const healthyBefore=recoveries;behavior='good';
  assert.equal((await enforceJoinRules(remoteSelection,full)).skipped[0].reason,'rule-denied','current authenticated policy still enforced when snapshot persistence fails');assert.equal(recoveries,healthyBefore);assert.ok(logs.some(m=>m.includes('remote snapshot not persisted')));assert.deepEqual(readdirSync(join(blocked,'..')),['fixture.remote.json']);
}));
