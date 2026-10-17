import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { selectTabCaptureWorkspace } from "./tab-session-workspace.js";
import { captureSlotHostId, captureSlotReadinessPath, createCaptureSlotReadinessObserver, listCaptureSlotReadiness, validateCaptureSlotReadiness } from "./capture-slot-readiness.js";

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
