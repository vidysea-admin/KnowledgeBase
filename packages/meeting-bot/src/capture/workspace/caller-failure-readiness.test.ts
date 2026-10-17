import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runRecord } from "../record-commands.js";
import { selectTabCaptureWorkspace } from "./tab-session-workspace.js";
import { captureSlotReadinessPath } from "./capture-slot-readiness.js";
import type { createTabBrowserDeps } from "../tab-browser.js";
test("successful recorder stop followed by finalizer failure invalidates caller readiness before releasing ownership",{timeout:10000},async()=>{
  const root=mkdtempSync(path.join(tmpdir(),"lkb-caller-readiness-"));assert.ok(root.startsWith(path.resolve(tmpdir())+path.sep));
  const defaults={tenantId:"fixture",profileDir:path.join(root,"profiles"),recordDir:path.join(root,"records")};
  const workspace=selectTabCaptureWorkspace(["--capture-slot","first"],defaults);
  const keys=["LKB_CAPTURE_CONTROL_TOKEN","LKB_CAPTURE_CONTROL_GENERATION","LKB_BROWSER_PROFILE_DIRECTORY","LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE"];
  const saved=new Map(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];process.env.LKB_CAPTURE_CONFIRMED_NO_ALTERNATIVE="false";
  let now=Date.now(),stopped=false,finalized=false;
  const clock=mock.method(Date,"now",()=>now),environment=mock.method(process,"loadEnvFile",()=>undefined);
  try{
    await assert.rejects(runRecord(["https://example.invalid/controlled-synthetic","--backend","tab","--capture-slot","first","--tenant","fixture","--until",new Date(now+1000).toISOString(),
      "--recorded-by","synthetic-operator","--capture-approved-by","synthetic-owner","--capture-approval-ref","synthetic-only","--organizer-consent","unknown","--consent-note","synthetic-only"],{
      profileDir:defaults.profileDir,recordDir:defaults.recordDir,normalize:v=>v,wait:async()=>{now+=2000;},
      telegram:{notifyJoined(){},notifySilence(){},notifyFinished(){},onBotEvent(){}} as never,
      tab:(onEvent,cfg)=>{
        mkdirSync(cfg.profileDir,{recursive:true});mkdirSync(cfg.recordDir,{recursive:true});const video=path.join(cfg.recordDir,"synthetic.webm");writeFileSync(video,"synthetic-media");
        return {deps:{launch:async()=>{onEvent("synthetic",{event:"admitted"});onEvent("synthetic",{event:"capture-started",mediaStartedAt:now});return {sessionHandle:"synthetic",mediaStream:{}};},
          stop:async()=>{stopped=true;onEvent("synthetic",{event:"capture-stopped",failed:false});}},browserExited:()=>undefined,subscribeLevel:()=>()=>{},triggerReload:async()=>{},disconnect:async()=>{},outputPath:()=>video,persistControlGap:()=>{}} as unknown as ReturnType<typeof createTabBrowserDeps>;
      },
      finalize:async()=>{finalized=true;assert.equal(stopped,true);assert.equal(existsSync(captureSlotReadinessPath(workspace,"unknown")),true);throw new Error("synthetic public finalizer failure");},
    }),/public finalizer failure/);
    assert.equal(finalized,true);assert.equal(existsSync(captureSlotReadinessPath(workspace,"unknown")),false);
    const marker=JSON.parse(readFileSync(path.join(workspace.profileDir,".lkb-readiness-failure-unknown.json"),"utf8"));assert.equal(Date.parse(marker.at),now);
    assert.equal(existsSync(path.join(workspace.recordDir,".record-state.json")),false);
  }finally{clock.mock.restore();environment.mock.restore();for(const [key,value] of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(root,{recursive:true,force:true});}
});
