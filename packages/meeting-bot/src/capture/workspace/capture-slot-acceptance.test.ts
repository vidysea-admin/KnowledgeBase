import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { selectTabCaptureWorkspace } from "./tab-session-workspace.js";
import { createCaptureSlotReadinessObserver, readCaptureSlotObservation } from "./capture-slot-readiness.js";
import { captureAcceptanceRegistryPath, createCaptureSlotEvidenceAcceptor, publishCaptureSlotAcceptance, revokeCaptureSlotAcceptance } from "./capture-slot-acceptance.js";
import { createRecordConsent } from "../record-consent/context.js";
import { writeRecordConsent } from "../record-consent/receipt-store.js";
const require=createRequire(import.meta.url),children=require("node:child_process");
function fixture() {
  const root=mkdtempSync(path.join(tmpdir(),"lkb-acceptance-synthetic-"));assert.ok(root.startsWith(path.resolve(tmpdir())+path.sep));
  const workspace=selectTabCaptureWorkspace(["--capture-slot","first"],{tenantId:"tenant-a",profileDir:path.join(root,"profiles"),recordDir:path.join(root,"records")});
  mkdirSync(workspace.profileDir,{recursive:true});mkdirSync(workspace.recordDir,{recursive:true});
  let trusted="tenant-a",broadAcl=false;
  const acl=mock.method(children,"spawnSync",(_executable:unknown,args:string[])=>({status:0,stdout:JSON.stringify({path:args.at(-1),currentSid:"S-1-5-21-123",ownerSid:"S-1-5-21-123",rules:[{sid:"S-1-5-21-123",type:"Allow",rights:2032127},...(broadAcl?[{sid:"S-1-1-0",type:"Allow",rights:1}]:[])]})}));
  syncBuiltinESMExports();
  const env={LKB_TENANT_ID:"tenant-a"},accept=createCaptureSlotEvidenceAcceptor({root,env,verifiedTenant:()=>trusted});
  let clock=Date.now()-5000;
  const begin=(kind:"browser"|"fixture"="browser")=>{
    const now=clock+=100,sessionId="synthetic-"+randomUUID(),consent=createRecordConsent(["--recorded-by","synthetic-operator","--capture-approved-by","synthetic-owner","--capture-approval-ref","synthetic-only","--organizer-consent","unknown","--consent-note","synthetic-only"],{tenantId:workspace.tenantId,sessionId,meetingUrl:"https://example.invalid/synthetic"},{},new Date(now-1000));
    const observer=createCaptureSlotReadinessObserver(workspace,{sessionId,platform:"meet",startedAt:now-1000,evidenceKind:kind,generation:consent.generation},()=>now);return {observer,now,consent};
  };
  const observe=(kind:"browser"|"fixture"="browser")=>{
    const {observer,now,consent}=begin(kind);writeRecordConsent(workspace.recordDir,{...consent,mediaStartedAt:now-500});
    observer.onCaptureEvent({event:"admitted",assumed:false});observer.onCaptureEvent({event:"capture-started",mediaStartedAt:now-500});
    return {observer,receipt:readCaptureSlotObservation(workspace,"meet")};
  };
  const review=(receipt:ReturnType<typeof readCaptureSlotObservation>)=>publishCaptureSlotAcceptance(root,workspace,{tenantId:"tenant-a",keyId:"synthetic-reviewed-key",platform:"meet",generation:receipt.generation,evidenceHash:receipt.evidenceHash});
  return {root,workspace,env,accept,observe,begin,review,setTenant:(id:string)=>{trusted=id;},setBroadAcl:()=>{broadAcl=true;},clean:()=>{acl.mock.restore();syncBuiltinESMExports();rmSync(root,{recursive:true,force:true});}};
}
test("acceptor construction is lazy; fixtures and unreviewed browser-shaped samples never qualify",()=>{
  const f=fixture();try{
    assert.equal(existsSync(captureAcceptanceRegistryPath(f.root)),false);
    const fixtureReceipt=f.observe("fixture").receipt;assert.equal(f.accept(fixtureReceipt),false);assert.throws(()=>f.review(fixtureReceipt),/synthetic/);
    assert.equal(existsSync(captureAcceptanceRegistryPath(f.root)),false);assert.equal(f.accept(f.observe().receipt),false);
  }finally{f.clean();}
});
test("synthetic authority protocol retains reviewed sample, supports later observations, invalidates failure and explicit revoke",()=>{
  const f=fixture();try{
    const initial=f.observe().receipt,review=f.review(initial);assert.equal(review.operatorKeyId,"synthetic-reviewed-key");assert.equal(f.accept(initial),true);
    const next=f.observe();assert.notEqual(next.receipt.generation,initial.generation);assert.equal(f.accept(next.receipt),true);
    next.observer.onCaptureEvent({event:"capture-error"});assert.equal(f.accept(next.receipt),false);
    const afterFailure=f.observe().receipt;assert.equal(f.accept(afterFailure),false);f.review(afterFailure);assert.equal(f.accept(afterFailure),true);
    assert.throws(()=>revokeCaptureSlotAcceptance(f.root,f.workspace,"meet",{tenantId:"tenant-a",keyId:"synthetic-reviewed-key",generation:initial.generation,evidenceHash:initial.evidenceHash}),/changed before revocation/);
    revokeCaptureSlotAcceptance(f.root,f.workspace,"meet",{tenantId:"tenant-a",keyId:"synthetic-reviewed-key",generation:afterFailure.generation,evidenceHash:afterFailure.evidenceHash});assert.equal(f.accept(afterFailure),false);
    const registry=captureAcceptanceRegistryPath(f.root);assert.equal(readdirSync(registry).filter(v=>v.endsWith(".json")&&!v.endsWith(".revoked.json")).length,2);
    assert.equal(readdirSync(registry).filter(v=>v.endsWith(".revoked.json")).length,1);
  }finally{f.clean();}
});
test("fresh verified/configured tenant, exact review generation/digest and signed authority are mandatory",()=>{
  const f=fixture();try{
    const receipt=f.observe().receipt;
    assert.throws(()=>f.review({...receipt,evidenceHash:"0".repeat(64)}),/stale/);
    f.review(receipt);f.setTenant("tenant-b");assert.equal(f.accept(receipt),false);f.setTenant("tenant-a");
    f.env.LKB_TENANT_ID="tenant-b";assert.equal(f.accept(receipt),false);f.env.LKB_TENANT_ID="tenant-a";
    const registry=captureAcceptanceRegistryPath(f.root),file=path.join(registry,readdirSync(registry).find(v=>v.endsWith(".json"))!);
    const stored=JSON.parse(readFileSync(file,"utf8"));stored.operatorKeyId="forged-key";writeFileSync(file,JSON.stringify(stored));assert.equal(f.accept(receipt),false);
  }finally{f.clean();}
});
test("failure before admission cannot replay the old reviewed sample; a fresh browser observation is required",()=>{
  const f=fixture();try{
    const initial=f.observe().receipt;f.review(initial);assert.equal(f.accept(initial),true);
    const interrupted=f.begin();interrupted.observer.onCaptureEvent({event:"capture-error"});
    assert.equal(readCaptureSlotObservation(f.workspace,"meet").generation,initial.generation);
    assert.equal(f.accept(initial),false);assert.throws(()=>f.review(initial),/fresh browser observation/);
    const fresh=f.observe().receipt;f.review(fresh);assert.equal(f.accept(fresh),true);
  }finally{f.clean();}
});
test("current browser metadata cannot qualify without its exact durable receipt generation and media origin",()=>{
  const f=fixture();try{
    const receipt=f.observe().receipt,consentPath=path.join(f.workspace.recordDir,"record-consent",receipt.tenantId,`${receipt.sessionId}.json`),consent=JSON.parse(readFileSync(consentPath,"utf8"));
    writeFileSync(consentPath,JSON.stringify({...consent,generation:randomUUID()}));assert.throws(()=>f.review(receipt),/matching durable attempt/);
    writeFileSync(consentPath,JSON.stringify({...consent,mediaStartedAt:consent.mediaStartedAt+1}));assert.throws(()=>f.review(receipt),/matching durable attempt/);
    writeFileSync(consentPath,JSON.stringify(consent));f.review(receipt);assert.equal(f.accept(receipt),true);
    delete consent.mediaStartedAt;writeFileSync(consentPath,JSON.stringify(consent));assert.equal(f.accept(receipt),false);
  }finally{f.clean();}
});
test("private OS ACL is checked before issuing; unrelated identity cannot publish authority",()=>{
  const f=fixture();try{
    const receipt=f.observe().receipt;
    if(process.platform==="win32")f.setBroadAcl();else{mkdirSync(captureAcceptanceRegistryPath(f.root),{recursive:true,mode:0o700});chmodSync(captureAcceptanceRegistryPath(f.root),0o755);}
    assert.throws(()=>f.review(receipt),/unrelated|private/);assert.equal(f.accept(receipt),false);
  }finally{f.clean();}
});
test("hardlinked authority cannot be used as trusted acceptance",()=>{
  const f=fixture();try{
    const receipt=f.observe().receipt;f.review(receipt);const registry=captureAcceptanceRegistryPath(f.root),pointer=path.join(registry,readdirSync(registry).find(v=>v.endsWith(".current"))!);
    linkSync(pointer,path.join(f.root,"alias"));assert.equal(f.accept(receipt),false);
  }finally{f.clean();}
});
