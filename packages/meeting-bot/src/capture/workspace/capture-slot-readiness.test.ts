import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { mock } from "node:test";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { spawnSync } from "node:child_process";
import { selectTabCaptureWorkspace } from "./tab-session-workspace.js";
import { captureSlotHostId, captureSlotReadinessPath, createCaptureSlotReadinessObserver, listCaptureSlotReadiness, validateCaptureSlotReadiness } from "./capture-slot-readiness.js";
import { assertCaptureHostIdSetting, readCaptureSlotObservation, type CaptureSlotReadiness } from "./capture-slot-readiness.js";

function fixture() {
  const root=mkdtempSync(path.join(tmpdir(),"lkb-slot-readiness-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));
  const workspace=selectTabCaptureWorkspace(["--capture-slot","first"],{tenantId:"tenant-a",profileDir:path.join(root,"profiles"),recordDir:path.join(root,"records")});
  mkdirSync(workspace.profileDir,{recursive:true});mkdirSync(workspace.recordDir,{recursive:true});
  return {root,workspace,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test("profile existence and server receipt timestamps cannot establish readiness",()=>{
  const f=fixture();let now=1900000000000;
  try {
    writeFileSync(path.join(f.workspace.profileDir,"Preferences"),"{}");
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",acceptEvidence:()=>true}));
    assert.throws(()=>createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session",platform:"meet",startedAt:now,evidenceKind:"browser"},()=>now),/receipt attempt generation/);
    const observer=createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session",platform:"meet",startedAt:now,evidenceKind:"browser",generation:randomUUID()},()=>now);
    observer.onCaptureEvent({event:"admitted",assumed:false});now+=30000;
    observer.onCaptureEvent({event:"capture-started",t:now/1000} as any);
    assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false);
    observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now+1});
    assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false);
  } finally {f.clean();}
});
test("synthetic production-shape observation binds host/tenant/slot/platform/generation and requires accepted evidence",()=>{
  const f=fixture();let now=1900000000000;
  try {
    const observer=createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session",platform:"meet",startedAt:now,evidenceKind:"browser",generation:randomUUID()},()=>now);
    now+=1000;observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now});
    assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false);
    observer.onCaptureEvent({event:"admitted",assumed:true});assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false,"assumed admission cannot become actual readiness");
    observer.onCaptureEvent({event:"admitted"});assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false,"unknown admission provenance cannot become actual readiness");
    now+=1000;observer.onCaptureEvent({event:"admitted",assumed:false});assert.equal(observer.failure(),undefined);
    const row=JSON.parse(readFileSync(captureSlotReadinessPath(f.workspace),"utf8"));
    assert.equal(row.generation,observer.generation);assert.equal(row.hostId,captureSlotHostId());assert.equal(row.tenantId,"tenant-a");
    assert.equal(row.mediaStartedAt,1900000001000);assert.equal(row.admittedAt,1900000002000);
    assert.equal(row.observation,"admission-and-recorder-start");assert.equal("authenticated" in row,false);
    assert.equal("meetingUrl" in row,false);assert.equal("token" in row,false);
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",acceptEvidence:()=>false}),/accepted browser/);
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"zoom",acceptEvidence:()=>true}),/accepted browser/);
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",hostId:"foreign",acceptEvidence:()=>true}),/accepted browser/);
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",now:()=>now-1,acceptEvidence:()=>true}),/accepted browser/);
    assert.equal(validateCaptureSlotReadiness(f.workspace,{platform:"meet",now:()=>now,acceptEvidence:r=>r.evidenceHash===row.evidenceHash}).generation,observer.generation);
    assert.deepEqual(listCaptureSlotReadiness(f.workspace,{now:()=>now,acceptEvidence:r=>r.evidenceHash===row.evidenceHash}).map(r=>r.platform),["meet"]);
    row.mediaStartedAt++;writeFileSync(captureSlotReadinessPath(f.workspace,"meet"),JSON.stringify(row));
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",acceptEvidence:()=>true}),/Invalid/);
  } finally {f.clean();}
});
test("mixed-platform pool enumerates only independently observed capabilities",()=>{
  const f=fixture(),now=1900000000000;
  try {
    for(const platform of ["meet","zoho"]){
      const observer=createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session-"+platform,platform,startedAt:now,evidenceKind:"browser",generation:randomUUID()},()=>now);
      observer.onCaptureEvent({event:"admitted",assumed:false});observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now});
    }
    assert.deepEqual(listCaptureSlotReadiness(f.workspace,{now:()=>now,acceptEvidence:()=>true}).map(row=>row.platform).sort(),["meet","zoho"]);
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"zoom",acceptEvidence:()=>true}));
    assert.deepEqual(listCaptureSlotReadiness(f.workspace,{now:()=>now,acceptEvidence:row=>row.platform==="zoho"}).map(row=>row.platform),["zoho"]);
  } finally {f.clean();}
});
test("fixture flow never qualifies as browser readiness and failure revokes only this observation",()=>{
  const f=fixture(),now=1900000000000;
  try {
    const observer=createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session",platform:"meet",startedAt:now,evidenceKind:"fixture",generation:randomUUID()},()=>now);
    observer.onCaptureEvent({event:"admitted"});observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now});
    assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",acceptEvidence:()=>true}),/accepted browser/);
    observer.onCaptureEvent({event:"capture-error"});assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false);
    observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now});observer.onCaptureEvent({event:"admitted"});
    assert.equal(existsSync(captureSlotReadinessPath(f.workspace)),false,"failed run cannot republish readiness");
  } finally {f.clean();}
});

// ---- B3 (recorder-host-id): LKB_CAPTURE_HOST_ID. Hostname and platform are stubbed on node:os / process, ids are computed here with node:crypto. ----
const SETTING="LKB_CAPTURE_HOST_ID";
const sha=(parts:unknown[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const idUnder=(value:string,platform:string=process.platform)=>sha(["lkb-capture-host-id",value,platform]);
const oldId=(host:string,platform:string=process.platform)=>sha([host,platform]);
/** Runs `run` with os.hostname() = host, optionally process.platform = platform, and process.env[SETTING] = setting (absent when undefined). */
function onHost<T>(host:string,setting:string|undefined,run:()=>T,platform?:string):T {
  const realHostname=os.hostname,realPlatform=Object.getOwnPropertyDescriptor(process,"platform")!,had=Object.hasOwn(process.env,SETTING),prev=process.env[SETTING];
  os.hostname=()=>host;syncBuiltinESMExports();
  if(platform!==undefined)Object.defineProperty(process,"platform",{value:platform,configurable:true});
  if(setting===undefined)delete process.env[SETTING];else process.env[SETTING]=setting;
  try {return run();}
  finally {
    os.hostname=realHostname;syncBuiltinESMExports();Object.defineProperty(process,"platform",realPlatform);
    if(had)process.env[SETTING]=prev;else delete process.env[SETTING];
  }
}
const publishReceipt=(f:ReturnType<typeof fixture>,host:string,setting:string|undefined,platform="meet",now=1900000000000)=>onHost(host,setting,()=>{
  const observer=createCaptureSlotReadinessObserver(f.workspace,{sessionId:"session-"+platform,platform,startedAt:now,evidenceKind:"browser",generation:randomUUID()},()=>now);
  observer.onCaptureEvent({event:"admitted",assumed:false});observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now});
  assert.equal(observer.failure(),undefined);
  return JSON.parse(readFileSync(captureSlotReadinessPath(f.workspace,platform),"utf8")) as CaptureSlotReadiness;
});
const NOW=1900000000000;
const acceptAll=()=>true;
const accepted=(f:ReturnType<typeof fixture>,host:string,setting:string|undefined)=>onHost(host,setting,()=>{
  let validated=true;
  try {validateCaptureSlotReadiness(f.workspace,{platform:"meet",now:()=>NOW,acceptEvidence:acceptAll});} catch {validated=false;}
  const listed=listCaptureSlotReadiness(f.workspace,{now:()=>NOW,acceptEvidence:acceptAll}).map(r=>r.platform);
  assert.equal(validated,listed.includes("meet"),"validate and list must agree");
  return validated;
});

test("B3-C1 the setting gives one stable id for every hostname, domain-separated, platform-bound, never the raw value",()=>{
  const V="kb-recorder-prod";
  const ids=["host-a","cloudrun-7f3","cloudrun-9aa","DESKTOP-X"].map(host=>onHost(host,undefined,()=>captureSlotHostId({[SETTING]:V})));
  assert.equal(new Set(ids).size,1);assert.equal(ids[0],idUnder(V));assert.match(ids[0],/^[a-f0-9]{64}$/);assert.ok(!ids[0].includes(V));
  assert.equal(onHost("host-a",undefined,()=>captureSlotHostId({[SETTING]:V})),ids[0],"repeatable");
  assert.equal(onHost("host-z",V,()=>captureSlotHostId()),idUnder(V),"the default env is process.env");
  assert.notEqual(ids[0],sha([V]));assert.notEqual(ids[0],sha([V,process.platform]));
  const linux=onHost("h",undefined,()=>captureSlotHostId({[SETTING]:V}),"linux"),win=onHost("h",undefined,()=>captureSlotHostId({[SETTING]:V}),"win32");
  assert.equal(linux,idUnder(V,"linux"));assert.equal(win,idUnder(V,"win32"));assert.notEqual(linux,win);
  assert.equal(captureSlotHostId({[SETTING]:"Prod-1"})===captureSlotHostId({[SETTING]:"prod-1"}),false,"no lower-casing");
});
test("B3-C2 a/b a receipt written under one hostname is accepted under another only with the same setting",()=>{
  const f=fixture();
  try {
    const row=publishReceipt(f,"host-A","prod-1");
    assert.equal(Object.keys(row).length,15);assert.equal(row.hostId,idUnder("prod-1"));assert.equal(row.version,1);
    assert.ok(!readFileSync(captureSlotReadinessPath(f.workspace,"meet"),"utf8").includes("prod-1"),"the raw setting never reaches the receipt");
    assert.equal(accepted(f,"host-A","prod-1"),true);
    assert.equal(accepted(f,"host-B","prod-1"),true,"new hostname, same setting: the receipt survives the restart");
    assert.equal(accepted(f,"host-B",undefined),false,"new hostname, no setting: refused");
    assert.equal(accepted(f,"host-A",undefined),false,"same hostname, no setting: the receipt was written under the setting, so refused");
  } finally {f.clean();}
});
test("B3-C3 without the setting the id is exactly today's formula, and a receipt written before the change is still accepted",()=>{
  for(const [host,platform] of [["host-a","linux"],["cloudrun-7f3","linux"],["DESKTOP-X","win32"],["host-a","darwin"]] as Array<[string,string]>) {
    assert.equal(onHost(host,undefined,()=>captureSlotHostId({}),platform),oldId(host,platform));
    assert.equal(onHost(host,undefined,()=>captureSlotHostId({PATH:"x",LKB_TENANT_ID:"t"}),platform),oldId(host,platform));
    assert.equal(onHost(host,undefined,()=>captureSlotHostId(),platform),oldId(host,platform));
  }
  // golden values taken from the unmodified code before this unit (see manifest)
  assert.equal(onHost("host-a",undefined,()=>captureSlotHostId({}),"linux"),"23c9d73eaf13650f7975ee1853b67150ce83e86be2f47934ad5ce86d2f721bef");
  assert.equal(onHost("cloudrun-7f3",undefined,()=>captureSlotHostId({}),"linux"),"412f1091d1585c039dfe4e7214b319f6578a19d24bdcc3d113f524c0fb3ba7d7");
  assert.equal(onHost("DESKTOP-X",undefined,()=>captureSlotHostId({}),"win32"),"823c17b3a957d5a7e1b713f7735b0c3767876fc154868109fc7a4dabaf7d8e06");
  const f=fixture();
  try {
    const body={version:1,tenantId:f.workspace.tenantId,slot:f.workspace.slot,sessionId:"legacy",generation:randomUUID(),platform:"meet",hostId:oldId("legacy-host"),
      profileDir:path.resolve(f.workspace.profileDir),recordDir:path.resolve(f.workspace.recordDir),observedAt:new Date(NOW).toISOString(),mediaStartedAt:NOW,admittedAt:NOW,
      observation:"admission-and-recorder-start",evidenceKind:"browser"};
    const receipt=JSON.stringify({...body,evidenceHash:createHash("sha256").update(JSON.stringify(body)).digest("hex")})+"\n";
    for(const name of [".lkb-capture-readiness-meet.json",".lkb-capture-readiness.json"])writeFileSync(path.join(f.workspace.profileDir,name),receipt);
    assert.equal(accepted(f,"legacy-host",undefined),true,"validate and list accept a pre-change receipt under the same hostname");
    assert.equal(accepted(f,"another-host",undefined),false);
  } finally {f.clean();}
});
test("B3-C4 exactly one id per process: no fallback, no second id, no either-or",()=>{
  assert.notEqual(idUnder("prod-1"),idUnder("prod-2"));assert.notEqual(idUnder("prod-1"),oldId("host-a"));
  assert.notEqual(onHost("host-a",undefined,()=>captureSlotHostId({[SETTING]:"prod-1"})),onHost("host-a",undefined,()=>captureSlotHostId({})));
  const f=fixture();
  try {
    publishReceipt(f,"host-A","prod-1");
    assert.equal(accepted(f,"host-A","prod-2"),false,"written under V1, refused under V2");
    assert.equal(accepted(f,"host-A",undefined),false,"written under V1, refused with no setting (the hostname id is not a fallback)");
    assert.equal(accepted(f,"host-A","prod-1"),true);
    publishReceipt(f,"host-A",undefined);
    assert.equal(accepted(f,"host-A","prod-1"),false,"written with no setting, refused under V (the override id is not a fallback either)");
    assert.equal(accepted(f,"host-A",undefined),true);
  } finally {f.clean();}
});

const NUL=String.fromCharCode(0),E_ACUTE=String.fromCharCode(233);
const REASON_BAD:Array<[string,string]>=[
  ["","empty"],[" ","blank"],["\t","blank"],[" prod","whitespace"],["prod ","whitespace"],["x".repeat(65),"too long"],
  ["a/b","bad character"],["a\\b","bad character"],[".","bad character"],["..","bad character"],["../x","bad character"],["a\u0000b","bad character"],
  ["a\nb","bad character"],["prod:1","bad character"],["prod 1","bad character"],["prod-"+E_ACUTE,"bad character"],["-prod","bad character"],["_prod","bad character"],
];
const message=(reason:string,raw:string)=>`${SETTING} refused: ${reason} (length ${raw.length})`;
const captureConsole=()=>{
  const lines:string[]=[],mocks=(["log","info","warn","error","debug"] as const).map(name=>mock.method(console,name,(...args:unknown[])=>{lines.push(args.map(String).join(" "));}));
  return {lines,restore:()=>mocks.forEach(m=>m.mock.restore())};
};
test("B3-C5 a bad value is refused loudly by the validator and lazily by captureSlotHostId; never trimmed, never echoed",()=>{
  const spy=captureConsole();
  try {
    for(const [raw,reason] of REASON_BAD) {
      const env={[SETTING]:raw};
      const calls=[()=>assertCaptureHostIdSetting(env),()=>captureSlotHostId(env)];
      if(!raw.includes(NUL))calls.push(()=>onHost("host-a",raw,()=>captureSlotHostId()),()=>onHost("host-a",raw,()=>assertCaptureHostIdSetting()));
      for(const call of calls) {
        let thrown:Error|undefined;try {call();} catch(error) {thrown=error as Error;}
        assert.ok(thrown instanceof Error,`value ${JSON.stringify(raw)} must throw`);
        assert.equal(thrown.message,message(reason,raw),`value ${JSON.stringify(raw)}`);
        assert.ok(thrown.message.includes(SETTING));
        if(raw.length>=3&&!message(reason,raw).includes(raw))assert.ok(!thrown.message.includes(raw));
      }
    }
    assert.deepEqual(spy.lines,[],"a refused value is never logged");
  } finally {spy.restore();}
  // accepted shapes: 64 characters, dots, dashes, underscores, digits first; case and surrounding characters are significant
  for(const ok of ["a".repeat(64),"7","a.b_c-d","Prod-1","prod-1","0xAB"]) {
    assert.equal(captureSlotHostId({[SETTING]:ok}),idUnder(ok));assert.doesNotThrow(()=>assertCaptureHostIdSetting({[SETTING]:ok}));
  }
  assert.doesNotThrow(()=>assertCaptureHostIdSetting({}));assert.equal(assertCaptureHostIdSetting({}),undefined);
});
test("B3-C5/C6 an unset setting passes the validator; the capture path, validate and list refuse a bad process setting before touching any file",()=>{
  const f=fixture();
  try {
    onHost("host-a","bad value",()=>{
      assert.throws(()=>assertCaptureHostIdSetting(),/LKB_CAPTURE_HOST_ID refused: bad character/);
      assert.throws(()=>createCaptureSlotReadinessObserver(f.workspace,{sessionId:"s",platform:"meet",startedAt:NOW,evidenceKind:"browser",generation:randomUUID()},()=>NOW),/LKB_CAPTURE_HOST_ID refused/);
      assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",acceptEvidence:acceptAll}),/LKB_CAPTURE_HOST_ID refused/,"even with no receipt on disk");
      assert.throws(()=>listCaptureSlotReadiness(f.workspace,{acceptEvidence:acceptAll}),/LKB_CAPTURE_HOST_ID refused/,"even with no receipt on disk");
    });
    assert.deepEqual(readdirSync(f.workspace.profileDir),[]);assert.deepEqual(readdirSync(f.workspace.recordDir),[]);
  } finally {f.clean();}
});
test("B3-C5/C6 a process started with a bad setting exits non-zero before touching any file, without echoing the value",()=>{
  const cwd=mkdtempSync(path.join(tmpdir(),"lkb-host-id-start-")),module=import.meta.resolve("./capture-slot-readiness.js").replace(/\.js$/,".ts");
  try {
    const script=`import {assertCaptureHostIdSetting} from ${JSON.stringify(module)};assertCaptureHostIdSetting();console.log("STARTED");`;
    const start=(value:string|undefined)=>{
      const env:NodeJS.ProcessEnv={...process.env};delete env[SETTING];if(value!==undefined)env[SETTING]=value;
      return spawnSync(process.execPath,["--import",import.meta.resolve("tsx"),"--input-type=module","-e",script],{cwd,env,encoding:"utf8",timeout:60000});
    };
    for(const [raw,reason] of REASON_BAD.filter(([raw])=>["", " ", " prod", "x".repeat(65), "a/b", "a\nb", "..", "prod-"+E_ACUTE].includes(raw))) {
      const run=start(raw);
      assert.notEqual(run.status,0,`value ${JSON.stringify(raw)} must exit non-zero`);
      assert.ok(!run.stdout.includes("STARTED"));
      assert.ok(run.stderr.includes(message(reason,raw)),run.stderr);
      if(raw.length>=3&&!message(reason,raw).includes(raw))assert.ok(!run.stderr.includes(raw),"the raw value is not echoed in the exit output");
      assert.deepEqual(readdirSync(cwd),[]);
    }
    const ok=start("kb-recorder-prod");
    assert.equal(ok.status,0,ok.stderr);assert.ok(ok.stdout.includes("STARTED"));
    assert.equal(ok.stderr.split("\n").filter(line=>line.includes(SETTING)).length,1,"one start-time line");
    const none=start(undefined);assert.equal(none.status,0,none.stderr);assert.ok(!none.stderr.includes(SETTING),"no setting, no line");
  } finally {rmSync(cwd,{recursive:true,force:true});}
});
test("B3-C7 d a receipt whose hostId is the raw setting, or any non-64-hex string, is rejected",()=>{
  const f=fixture();
  try {
    const row=publishReceipt(f,"host-A","prod-1");
    for(const hostId of ["prod-1","prod-1".padEnd(64,"0"),idUnder("prod-1").toUpperCase(),idUnder("prod-1").slice(1)]) {
      const {evidenceHash:_ignored,...rest}=row,body={...rest,hostId};
      const forged=JSON.stringify({...body,evidenceHash:createHash("sha256").update(JSON.stringify(body)).digest("hex")})+"\n";
      for(const name of [".lkb-capture-readiness-meet.json",".lkb-capture-readiness.json"])writeFileSync(path.join(f.workspace.profileDir,name),forged);
      onHost("host-B","prod-1",()=>{
        assert.throws(()=>readCaptureSlotObservation(f.workspace,"meet"),/Invalid capture readiness/);
        assert.throws(()=>validateCaptureSlotReadiness(f.workspace,{platform:"meet",now:()=>NOW,acceptEvidence:acceptAll}),/Invalid/);
        assert.throws(()=>listCaptureSlotReadiness(f.workspace,{now:()=>NOW,acceptEvidence:acceptAll}),/Invalid/);
      });
    }
  } finally {f.clean();}
});
test("B3-C8 the value and its id are logged once per process start; nothing else is added",()=>{
  const spy=captureConsole(),V="log-once-probe-7";
  try {
    const id=captureSlotHostId({[SETTING]:V});captureSlotHostId({[SETTING]:V});assertCaptureHostIdSetting({[SETTING]:V});
    assert.equal(spy.lines.length,1,spy.lines.join("|"));
    const line=spy.lines[0]??"";assert.ok(line.includes(SETTING)&&line.includes(V)&&line.includes(id));
    captureSlotHostId({});captureSlotHostId({});
    assert.equal(spy.lines.length,1,"no setting, no line");
  } finally {spy.restore();}
});
