import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { assertCaptureWorkspaceVideo, claimCaptureSession, loginInCaptureWorkspace, selectTabCaptureWorkspace, slotCaptureSessionId } from "./tab-session-workspace.js";
import { createTabBrowserDeps } from "../tab-browser.js";
import { captureSlotReadinessPath, validateCaptureSlotReadiness } from "./capture-slot-readiness.js";
import { readRecordConsent } from "../record-consent/receipt-store.js";

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-capture-slot-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  return {root, defaults: {profileDir:path.join(root,"profiles"),recordDir:path.join(root,"records"),tenantId:"tenant-a"},
    clean: () => rmSync(root,{recursive:true,force:true})};
}

test("explicit slots separate tenant/profile/control/output paths without copying or creating files", () => {
  const fixture=temporary();
  try {
    const a=selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults);
    const b=selectTabCaptureWorkspace(["--capture-slot","second"],fixture.defaults);
    const other=selectTabCaptureWorkspace(["--capture-slot","first"],{...fixture.defaults,tenantId:"tenant-b"});
    assert.notEqual(a.profileDir,b.profileDir); assert.notEqual(a.recordDir,b.recordDir);
    assert.notEqual(a.profileDir,other.profileDir); assert.notEqual(a.recordDir,other.recordDir);
    const base="2026-10-14-unknown-webinar";
    assert.notEqual(slotCaptureSessionId(base,a),slotCaptureSessionId(base,b));
    assert.notEqual(slotCaptureSessionId(base,a),slotCaptureSessionId(base,other));
    assert.notEqual(slotCaptureSessionId(base,a),slotCaptureSessionId(base,a),"subsequent captures in the same slot need unique immutable receipt identities");
    assert.equal(slotCaptureSessionId(base,fixture.defaults),base);
    assert.deepEqual(selectTabCaptureWorkspace([],fixture.defaults),fixture.defaults);
    assert.deepEqual(selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"finalize"),a);
    assert.deepEqual(readdirSync(fixture.root),[]);
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"record","obs"),/tab capture only/);
    const outside=path.join(fixture.root,"foreign.webm");writeFileSync(outside,"foreign");
    assert.throws(()=>assertCaptureWorkspaceVideo(a,outside),/outside/);
    mkdirSync(a.recordDir,{recursive:true});const owned=path.join(a.recordDir,"own.webm");writeFileSync(owned,"owned");
    assert.doesNotThrow(()=>assertCaptureWorkspaceVideo(a,owned));
    const linked=path.join(a.recordDir,"linked.webm");linkSync(outside,linked);
    assert.throws(()=>assertCaptureWorkspaceVideo(a,linked),/owned physical/);assert.equal(readFileSync(outside,"utf8"),"foreign");
  } finally {fixture.clean();}
});

test("global downstream session ownership refuses cross-slot and cross-tenant duplicate writers and releases exactly once",()=>{
  const fixture=temporary();
  try {
    const release=claimCaptureSession(fixture.defaults.recordDir,"tenant-a","shared-session");
    for(const id of ["con","nul.json","com1","session."])assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-a",id),/Unsafe/);
    if(process.platform==="win32")assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-b","SHARED-SESSION"),/already reserved/);
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-a","shared-session"),/already reserved/);
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-b","shared-session"),/already reserved/);
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-a","shared-session",true),/live, unknown or foreign/);
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-b","shared-session",true,()=>"dead"),/live, unknown or foreign/);
    const other=claimCaptureSession(fixture.defaults.recordDir,"tenant-b","different-session");other();
    release();release();
    const reused=claimCaptureSession(fixture.defaults.recordDir,"tenant-b","shared-session");reused();
    assert.deepEqual(readdirSync(path.join(fixture.defaults.recordDir,".capture-session-locks")),[]);
    const crashed=claimCaptureSession(fixture.defaults.recordDir,"tenant-a","crashed-session");
    const directory=path.join(fixture.defaults.recordDir,".capture-session-locks"),file=path.join(directory,readdirSync(directory)[0]!);
    const row=JSON.parse(readFileSync(file,"utf8"));row.pid=99999999;writeFileSync(file,JSON.stringify(row));
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-a","crashed-session",true,()=>"unknown"),/live, unknown or foreign/);
    const recovered=claimCaptureSession(fixture.defaults.recordDir,"tenant-a","crashed-session",true,()=>"dead");
    assert.throws(()=>claimCaptureSession(fixture.defaults.recordDir,"tenant-a","crashed-session"),/recovery is active/);
    recovered();crashed();assert.deepEqual(readdirSync(directory),[]);
  } finally {fixture.clean();}
});

test("slot identifiers, duplicate flags, file ancestors and redirected directories refuse before writes", () => {
  const fixture=temporary();
  try {
    for(const slot of ["","..","../x","x/y","x\\y","x..y","a.","A","a ","--tenant","con","nul","com1","lpt9","a".repeat(65)])
      assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot",slot],fixture.defaults),/safe lowercase/);
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot"],fixture.defaults));
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","a","--capture-slot","b"],fixture.defaults),/duplicate/);
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","a"],{...fixture.defaults,tenantId:"../foreign"}),/Unsafe/);
    writeFileSync(fixture.defaults.profileDir,"not a directory");
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","a"],fixture.defaults));
    rmSync(fixture.defaults.profileDir); mkdirSync(fixture.defaults.profileDir);
    const alias=path.join(fixture.root,"alias"); symlinkSync(fixture.defaults.profileDir,alias,"junction");
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","a"],{...fixture.defaults,profileDir:alias}),/physical directories/);
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","a"],{...fixture.defaults,recordDir:fixture.defaults.profileDir}),/separate/);
    assert.equal(existsSync(path.join(fixture.defaults.profileDir,".capture-slots")),false);
    assert.equal(existsSync(fixture.defaults.recordDir),false);
  } finally {fixture.clean();}
});

test("occupied capture/recovery/control slots refuse record and login while owned finalization can inspect", () => {
  const fixture=temporary();
  try {
    const slot=selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults);
    mkdirSync(slot.profileDir,{recursive:true}); mkdirSync(slot.recordDir,{recursive:true});
    for(const file of [path.join(slot.profileDir,".lkb-tab-capture.lock"),path.join(slot.profileDir,".lkb-recovery.lock"),path.join(slot.recordDir,".record-state.json")]) {
      writeFileSync(file,"owned state");
      for(const mode of ["record","login"] as const)
        assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults,mode),/occupied/);
      assert.deepEqual(selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"finalize"),slot);
      assert.equal(readFileSync(file,"utf8"),"owned state"); rmSync(file);
    }
  } finally {fixture.clean();}
});

test("login uses selected workspace and atomically owns the capture lock, releases on child error/exit", async () => {
  const fixture=temporary(), childProcess=createRequire(import.meta.url)("node:child_process");
  let mode="success", spawned=0;
  const slot=selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults),lock=path.join(slot.profileDir,".lkb-tab-capture.lock");
  const spawn=mock.method(childProcess,"spawn",(_exe:string,args:string[],options:{windowsHide?:boolean})=>{
    spawned++; assert.equal(args[args.indexOf("--profile")+1],slot.profileDir);
    assert.equal(args[args.indexOf("--stop-file")+1],path.join(slot.recordDir,".stop-login"));
    assert.equal(options.windowsHide,true); assert.equal(readFileSync(lock,"utf8"),String(process.pid));
    assert.throws(()=>selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults),/occupied/);
    if(mode==="throw") throw new Error("fixture spawn failure");
    const child=new EventEmitter(); queueMicrotask(()=>mode==="error" ? child.emit("error",new Error("fixture child error")) : child.emit("exit",mode==="success"?0:1));
    return child;
  }); syncBuiltinESMExports();
  try {
    for(mode of ["success","exit","error","throw"]) {
      const run=loginInCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"never-browser",{LKB_PYTHON:"fixture"});
      if(mode==="success") await run; else await assert.rejects(run);
      assert.equal(existsSync(lock),false);
    }
    writeFileSync(lock,"foreign owner");
    await assert.rejects(loginInCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"never-browser",{}),/occupied/);
    assert.equal(spawned,4); assert.equal(readFileSync(lock,"utf8"),"foreign owner");
  } finally {spawn.mock.restore();syncBuiltinESMExports();fixture.clean();}
});

test("login cleans owned empty/partial locks and post-acquire setup errors",async()=>{
  const fixture=temporary(),fs=createRequire(import.meta.url)("node:fs");
  const selected=selectTabCaptureWorkspace(["--capture-slot","first"],fixture.defaults),lock=path.join(selected.profileDir,".lkb-tab-capture.lock");
  const original=fs.writeSync;let calls=0;
  const write=mock.method(fs,"writeSync",(fd:number,bytes:Buffer,offset:number,length:number)=>{
    if(calls++===0)return original(fd,bytes,offset,1);throw new Error("fixture partial write error");
  });syncBuiltinESMExports();
  try {await assert.rejects(loginInCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"never-browser",{}),/partial write/);assert.equal(existsSync(lock),false);}
  finally {write.mock.restore();syncBuiltinESMExports();}
  const log=mock.method(console,"log",()=>{throw new Error("fixture log failure after acquiring lock");});
  try {await assert.rejects(loginInCaptureWorkspace(["--capture-slot","first"],fixture.defaults,"never-browser",{}),/log failure/);assert.equal(existsSync(lock),false);}
  finally {log.mock.restore();fixture.clean();}
});

test("real record caller isolates two receiver sessions and passes each fixture output to its immediate consumer", {timeout:60000}, async () => {
  const fixture=temporary(), savedProfile=process.env.LKB_BOT_PROFILE_DIR, savedDirectory=process.env.LKB_BROWSER_PROFILE_DIRECTORY;
  const controlledKeys=["LKB_CAPTURE_CONTROL_TOKEN","LKB_CAPTURE_CONTROL_GENERATION","LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE"];
  const savedControl=new Map(controlledKeys.map(key=>[key,process.env[key]]));for(const key of controlledKeys)delete process.env[key];process.env.LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE="false";
  const loadEnv=mock.method(process,"loadEnvFile",()=>undefined);
  process.env.LKB_BOT_PROFILE_DIR=fixture.defaults.profileDir;
  delete process.env.LKB_BROWSER_PROFILE_DIRECTORY;
  const {runRecord,runFinalize,finalizeRecordingWith}=await import("../record-commands.js");
  const script=path.join(fixture.root,"fixture-extension.mjs");
  writeFileSync(script, [
    'import {readFileSync,existsSync} from "node:fs";',
    'const a=process.argv; const ext=a[a.indexOf("--capture-extension")+1], stop=a[a.indexOf("--stop-file")+1];',
    'const cfg=JSON.parse(readFileSync(ext+"/config.json","utf8"));',
    'const post=(route,body)=>fetch(cfg.endpoint+route,{method:"POST",body,headers:{Origin:"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",Authorization:"Bearer "+cfg.token}});',
    'console.log(JSON.stringify({event:"admitted"})); await post("/event",JSON.stringify({event:"capture-started",mediaStartedAt:1900000000000}));',
    'await post("/chunk?seq=0",a[2]);',
    'const deadline=Date.now()+30000; while(Date.now()<deadline && !(await (await post("/control","{}")).json()).stop) await new Promise(r=>setTimeout(r,20));',
    'await post("/event",JSON.stringify({event:"capture-stopped",failed:false}));',
    'while(!existsSync(stop) && Date.now()<deadline) await new Promise(r=>setTimeout(r,20));',
  ].join("\n"));
  let current=1899999999000, waited=0, release!:()=>void;
  const until=current+120000, barrier=new Promise<void>(resolve=>{release=resolve;});
  const clock=mock.method(Date,"now",()=>current);
  const monotonicClock=mock.method(performance,"now",()=>current-1899999999000);
  const seen: {slot:string;video:string;session:string;tenant:string;recordDir:string}[]=[];
  const origins:{mediaStartedAt:unknown;t:unknown}[]=[];
  const endpoints:{endpoint:string;token:string}[]=[];
  const sessionIds:string[]=[];
  const operations:Promise<void>[]=[];
  const notifier:any={notifyJoined:()=>{},notifySilence:()=>{},notifyFinished:()=>{},onBotEvent:()=>{}};
  try {
    operations.push(...["first","second"].map(async slot=>{
      const selected=selectTabCaptureWorkspace(["--capture-slot",slot],fixture.defaults);
      await runRecord([`https://example.invalid/${slot}`,"--capture-slot",slot,"--backend","tab","--tenant","tenant-a","--until",new Date(until).toISOString(),
        "--recorded-by","fixture-operator","--capture-approved-by","fixture-owner","--capture-approval-ref","fixture-only","--organizer-consent","unknown","--consent-note","fixture-only"],{
        recordDir:fixture.defaults.recordDir,profileDir:fixture.defaults.profileDir,telegram:notifier,
        tab:(onEvent,cfg)=>{assert.equal(cfg.profileDir,selected.profileDir);assert.equal(cfg.recordDir,selected.recordDir);sessionIds.push(cfg.sessionId!);if(sessionIds.length===2)current=1900000001000;
          return createTabBrowserDeps({...cfg,python:process.execPath,joinScript:script,extensionDir:path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../py/tab-capture"),startupTimeoutMs:15000,log:()=>{},
            onEvent:(handle,event)=>{if(event.event==="capture-started"){origins.push({mediaStartedAt:(event as any).mediaStartedAt,t:event.t});
              endpoints.push(JSON.parse(readFileSync(path.join(cfg.recordDir,".extension-"+handle,"config.json"),"utf8")));}onEvent(handle,event);}});},
        wait:async()=>{if(++waited===2){assert.equal(endpoints.length,2);assert.notEqual(endpoints[0]!.endpoint,endpoints[1]!.endpoint);assert.notEqual(endpoints[0]!.token,endpoints[1]!.token);
          let duplicateLaunched=false;
          await assert.rejects(runRecord(["https://example.invalid/duplicate","--capture-slot","third","--backend","tab","--session-id",sessionIds[0]!,"--tenant","tenant-b","--until",new Date(until).toISOString(),
            "--recorded-by","fixture-operator","--capture-approved-by","fixture-owner","--capture-approval-ref","fixture-only","--organizer-consent","unknown","--consent-note","fixture-only"],{
            recordDir:fixture.defaults.recordDir,profileDir:fixture.defaults.profileDir,tab:()=>{duplicateLaunched=true;throw new Error("duplicate reached capture");}}),/already reserved/);
          assert.equal(duplicateLaunched,false);
          const denied=await fetch(endpoints[1]!.endpoint+"/chunk?seq=1",{method:"POST",body:"foreign",headers:{Origin:"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",Authorization:"Bearer "+endpoints[0]!.token}});
          assert.equal(denied.status,403);current=until+1;release();}await barrier;},
        normalize:(video)=>video,
        finalize:async(video,session,_title,_platform,_transcribe,_gaps,_notifier,_duration,tenant,actualRecordDir)=>{
          assert.equal(readFileSync(video,"utf8"),`https://example.invalid/${slot}`);
          assert.equal(actualRecordDir,selected.recordDir);
          const publicVideo=await finalizeRecordingWith({repoRoot:fixture.root,recordDir:actualRecordDir,tenantId:tenant,probeMedia:()=>1,
            extractAudio:(_video,audio)=>{mkdirSync(path.dirname(audio),{recursive:true});writeFileSync(audio,`audio-${slot}`);},
            measureVolume:()=>({maxDb:-10,meanDb:-20})},video,session,_title,_platform,false,_gaps,notifier);
          seen.push({slot,video,session,tenant:tenant!,recordDir:selected.recordDir});return publicVideo;},
      });
      assert.equal(existsSync(path.join(selected.profileDir,".lkb-tab-capture.lock")),false);
      assert.equal(existsSync(path.join(selected.recordDir,".record-state.json")),false);
    }));await Promise.all(operations);
    assert.equal(waited,2); assert.equal(seen.length,2); assert.notEqual(seen[0]!.video,seen[1]!.video);
    assert.equal(origins.length,2);for(const origin of origins){assert.equal(origin.mediaStartedAt,1900000000000);assert.notEqual(origin.t,1900000000);}
    assert.notEqual(seen[0]!.session,seen[1]!.session,"same platform/default title must generate distinct downstream session identities");
    const foreign=path.join(fixture.root,"foreign.webm");writeFileSync(foreign,"foreign");
    await assert.rejects(runFinalize(["--capture-slot","first","--session-id","first","--tenant","tenant-a","--title","fixture","--video",foreign],{
      repoRoot:fixture.root,profileDir:fixture.defaults.profileDir,recordDir:fixture.defaults.recordDir,normalize:v=>v,finalize:async()=>{throw new Error("foreign consumer reached");}}),/outside the selected slot/);
    for(const consumed of seen){
      assert.equal(consumed.tenant,"tenant-a");
      const source=JSON.parse(readFileSync(path.join(fixture.root,"data","toc-migrated",consumed.session,"source.json"),"utf8"));
      assert.equal(source.tenantId,"tenant-a");assert.equal(source._id,consumed.session+"-src");
      assert.equal(readFileSync(path.join(fixture.root,source.audioPath),"utf8"),`audio-${consumed.slot}`);
      const status=JSON.parse(readFileSync(consumed.video+".status.json","utf8"));
      assert.equal(status.state,"stopped");assert.equal(status.tenantId,"tenant-a");assert.equal(status.sessionId,consumed.session);
      assert.equal(readdirSync(consumed.recordDir).some(name=>name.startsWith(".extension-")),false);
      const selected=selectTabCaptureWorkspace(["--capture-slot",consumed.slot],fixture.defaults,"finalize");
      const observation=JSON.parse(readFileSync(captureSlotReadinessPath(selected),"utf8"));assert.equal(observation.evidenceKind,"fixture");
      const consent=readRecordConsent(selected.recordDir,{tenantId:consumed.tenant,sessionId:consumed.session});assert.equal(observation.generation,consent.generation);assert.equal(observation.mediaStartedAt,consent.mediaStartedAt);
      assert.throws(()=>validateCaptureSlotReadiness(selected,{platform:"unknown",now:()=>current,acceptEvidence:()=>true}),/accepted browser/);
      let recovery=0;
      await runFinalize(["--capture-slot",consumed.slot,"--session-id",consumed.session,"--tenant","tenant-a","--title","fixture","--video",consumed.video],{
        repoRoot:fixture.root,profileDir:fixture.defaults.profileDir,recordDir:fixture.defaults.recordDir,normalize:v=>v,finalize:async()=>{recovery++;}});
      assert.equal(recovery,1);
    }
  } finally {
    current=until+1;release();await Promise.allSettled(operations);
    monotonicClock.mock.restore();clock.mock.restore();loadEnv.mock.restore();
    if(savedProfile===undefined)delete process.env.LKB_BOT_PROFILE_DIR;else process.env.LKB_BOT_PROFILE_DIR=savedProfile;
    if(savedDirectory===undefined)delete process.env.LKB_BROWSER_PROFILE_DIRECTORY;else process.env.LKB_BROWSER_PROFILE_DIRECTORY=savedDirectory;
    for(const [key,value] of savedControl){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    fixture.clean();
  }
});
