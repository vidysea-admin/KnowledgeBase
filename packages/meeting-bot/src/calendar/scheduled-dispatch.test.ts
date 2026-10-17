import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import type {AutoRecordItem} from "@lkb/core";
import {runScheduledDispatch, scheduledDispatchIdentity, type ScheduledDispatchDeps} from "./scheduled-dispatch.js";
import {writeScheduledJob, scheduledJobFilePath} from "./state/schedule-dedup-state.js";
import {deriveJobKey} from "./task-scheduler.js";
import {emptyStoredJoinRules, saveJoinRules, recordTenantOptOut, joinRulesFilePath} from "./join-rules/join-rules-store.js";
import {saveLastValidJoinRules, lastValidJoinRulesPath} from "./join-rules/join-rules-last-valid.js";
import {runScheduleTickOnce} from "./schedule-tick.js";
import {evaluateJoinRules} from "./join-rules/join-rules.js";

const TENANT = "dispatch-tenant", NOW = "2026-10-15T12:00:00Z";
const item: AutoRecordItem = {source:"calendar", sourceId:"event-one", sessionKey:"session-one", sender:"organizer@example.com",
  meetingUrl:"https://meeting.zoho.com/join?key=123", title:"Career webinar", startTime:NOW, endTime:"2026-10-15T13:00:00Z"};
const key = deriveJobKey(item.sessionKey)!;
async function fixture(body: (d: ScheduledDispatchDeps, calls: string[][]) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-scheduled-dispatch-")), calls: string[][] = [];
  const d: ScheduledDispatchDeps = {stateDir:dir, tenantId:TENANT, mode:"last-valid", loadKeyTenant:async()=>TENANT,
    now:()=>NOW, log:()=>{}, record:async args=>{calls.push(args);}};
  try {
    writeScheduledJob(dir,key,{url:item.meetingUrl,until:item.endTime,title:item.title,sessionId:item.sessionKey,
      dispatchPolicyV1:scheduledDispatchIdentity(item)},TENANT);
    saveJoinRules(dir,TENANT,emptyStoredJoinRules());
    await body(d,calls);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
const invoke = (d: ScheduledDispatchDeps) => runScheduledDispatch([key],d);
const jobFile = (d: ScheduledDispatchDeps) => scheduledJobFilePath(d.stateDir,key);

test("saved automatic identity reaches claimed capture argv; retry rechecks newly saved rules and writes no state", async()=>fixture(async(d,calls)=>{
  const paths = [jobFile(d),joinRulesFilePath(d.stateDir,TENANT)];
  const before = paths.map(file=>({bytes:readFileSync(file),mtime:statSync(file).mtimeMs}));
  await invoke(d);
  assert.deepEqual(calls,[[item.meetingUrl,"--until",item.endTime,"--session-id",item.sessionKey,"--title",item.title,"--tenant",TENANT]]);
  paths.forEach((file,i)=>{assert.deepEqual(readFileSync(file),before[i]!.bytes);assert.equal(statSync(file).mtimeMs,before[i]!.mtime);});
  recordTenantOptOut(d.stateDir,TENANT,item.sourceId);
  await assert.rejects(invoke(d),/Scheduled dispatch refused/);
  assert.equal(calls.length,1);
}));

test("source-id, session-key, meeting optout and current organizer/domain deny added after save refuse capture", async()=>{
  for(const boundary of ["source","session","meeting","email","domain"]){await fixture(async(d,calls)=>{
    let evaluated=0;d.io={evaluate:(event,rules,state)=>{evaluated++;return evaluateJoinRules(event,rules,state);}};
    if(boundary==="email"||boundary==="domain"){
      const rules=emptyStoredJoinRules(); rules.ruleSet={version:1,ownDomains:[],rules:[{id:"deny-now",effect:"deny",
        match:boundary==="email"?{email:item.sender}:{domain:"example.com"}}]}; saveJoinRules(d.stateDir,TENANT,rules);
    }else recordTenantOptOut(d.stateDir,TENANT,boundary==="session"?item.sessionKey:item.sourceId,{},boundary==="meeting"?{meetingUrl:item.meetingUrl}:undefined);
    await assert.rejects(invoke(d),/Scheduled dispatch refused/); assert.equal(calls.length,0);
    assert.ok(evaluated>0,`${boundary}: valid source reached current policy evaluation`);
  });}
});

test("missing or foreign tenant/key and unsupported automatic rule modes refuse before capture",async()=>{
  for(const boundary of ["missing-tenant","foreign-key","missing-key","throw-key","off","fail-open", "unset-mode"]){await fixture(async(d,calls)=>{
    if(boundary==="missing-tenant")d.tenantId=undefined;
    if(boundary==="foreign-key")d.loadKeyTenant=async()=>"foreign-tenant";
    if(boundary==="missing-key")d.loadKeyTenant=async()=>null;
    if(boundary==="throw-key")d.loadKeyTenant=async()=>{throw new Error("private-key-details");};
    if(boundary==="off"||boundary==="fail-open")d.mode=boundary;
    if(boundary==="unset-mode")d.mode=undefined;
    await assert.rejects(invoke(d),boundary==="off"||boundary==="fail-open"||boundary==="unset-mode"?/automatic_dispatch_rule_mode_unsupported/:/Scheduled dispatch refused/);
    assert.equal(calls.length,0);
  });}
});

test("ISS-ALERTTENANT-001: untagged and other-tenant saved jobs refuse without rewriting or deleting",async()=>{
  for(const tenant of [undefined,"foreign-tenant"]){await fixture(async(d,calls)=>{
    const file=jobFile(d), job=JSON.parse(readFileSync(file,"utf8"));
    if(tenant===undefined)delete job.tenantId;else job.tenantId=tenant;
    writeFileSync(file,JSON.stringify(job));const before=readFileSync(file),mtime=statSync(file).mtimeMs;
    await assert.rejects(invoke(d),/Scheduled dispatch refused/);assert.equal(calls.length,0);
    assert.deepEqual(readFileSync(file),before);assert.equal(statSync(file).mtimeMs,mtime);
  });}
});

test("legacy, malformed, forged, mismatched and traversal scheduled identities never reach capture",async()=>{
  for(const boundary of ["legacy","source","sender","url","until","session","jobkey","extra","corrupt","expired","oversize"]){await fixture(async(d,calls)=>{
    const file=jobFile(d),job=JSON.parse(readFileSync(file,"utf8"));
    if(boundary==="legacy")delete job.dispatchPolicyV1;
    if(boundary==="source")job.dispatchPolicyV1.sourceId="untrusted source";
    if(boundary==="sender")job.dispatchPolicyV1.sender="";
    if(boundary==="url")job.url="https://meeting.zoho.com/meeting/456";
    if(boundary==="until")job.until="2026-10-15T14:00:00Z";
    if(boundary==="session")job.sessionId="other-session";
    if(boundary==="jobkey"){job.sessionId="other-session";job.dispatchPolicyV1.sessionKey="other-session";}
    if(boundary==="extra")job.dispatchPolicyV1.senderAliases=["bypass@example.com"];
    if(boundary==="expired")d.now=()=>"2026-10-15T14:00:00Z";
    writeFileSync(file,boundary==="corrupt"?"{":boundary==="oversize"?"x".repeat(17000):JSON.stringify(job));
    const before=readFileSync(file);await assert.rejects(invoke(d),/Scheduled dispatch refused/);
    assert.equal(calls.length,0);assert.deepEqual(readFileSync(file),before);
    await assert.rejects(runScheduledDispatch(["../escape"],d),/Scheduled dispatch refused/);
    await assert.rejects(runScheduledDispatch([key,"--url",item.meetingUrl],d),/Scheduled dispatch refused/);
  });}
});

test("dispatch snapshot fallback respects original exclusive one-hour bound and preserves bytes/mtime",async()=>{
  for(const age of [60_000,3_600_000,-1]){await fixture(async(d,calls)=>{
    saveLastValidJoinRules(d.stateDir,TENANT,emptyStoredJoinRules(),Date.parse(NOW)-age);
    unlinkSync(joinRulesFilePath(d.stateDir,TENANT));const file=lastValidJoinRulesPath(d.stateDir,TENANT);
    const before=readFileSync(file),mtime=statSync(file).mtimeMs;
    if(age===60_000)await invoke(d);else await assert.rejects(invoke(d),/Scheduled dispatch refused/);
    assert.equal(calls.length,age===60_000?1:0);assert.deepEqual(readFileSync(file),before);assert.equal(statSync(file).mtimeMs,mtime);
  });}
  for(const failure of ["corrupt","foreign"]){await fixture(async(d,calls)=>{
    saveLastValidJoinRules(d.stateDir,TENANT,emptyStoredJoinRules(),Date.parse(NOW)-60_000);
    unlinkSync(joinRulesFilePath(d.stateDir,TENANT));const file=lastValidJoinRulesPath(d.stateDir,TENANT);
    const value=JSON.parse(readFileSync(file,"utf8"));value.tenantId="foreign-tenant";
    writeFileSync(file,failure==="corrupt"?"{":JSON.stringify(value));const before=readFileSync(file);
    await assert.rejects(invoke(d),/Scheduled dispatch refused/);assert.equal(calls.length,0);assert.deepEqual(readFileSync(file),before);
  });}
});

test("actual schedule tick persists selected source identity consumed by later deny gate",async()=>fixture(async(d,calls)=>{
  const observed:string[]=[];
  await runScheduleTickOnce({stateDir:d.stateDir,stateTenantId:TENANT,joinRulesTenantId:TENANT,joinRulesKeyTenantId:TENANT,
    joinRulesEnforce:"last-valid",everyWebinar:true,loadCalendarEvents:async()=>[{id:"new-event",title:item.title,organizer:item.sender,
      meetingUrl:item.meetingUrl,startTime:item.startTime,endTime:item.endTime}],loadCandidates:async()=>[],now:()=>NOW,log:()=>{},
    scheduler:{scheduleOnce:async value=>{observed.push(value.jobKey);}}},false);
  assert.equal(observed.length,1);const saved=JSON.parse(readFileSync(scheduledJobFilePath(d.stateDir,observed[0]!),"utf8"));
  assert.equal(saved.tenantId,TENANT);assert.equal(saved.dispatchPolicyV1.sourceId,"new-event");assert.equal(saved.dispatchPolicyV1.sender,item.sender);
  recordTenantOptOut(d.stateDir,TENANT,"new-event");
  await assert.rejects(runScheduledDispatch([observed[0]!],d),/Scheduled dispatch refused/);assert.equal(calls.length,0);
}));
