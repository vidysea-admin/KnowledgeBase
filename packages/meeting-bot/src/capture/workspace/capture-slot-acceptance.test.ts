import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { createHash } from "node:crypto";
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

// ---- B3 (recorder-host-id): LKB_CAPTURE_HOST_ID through the real acceptor and the real registry files. Ids are computed here with node:crypto. ----
const SETTING="LKB_CAPTURE_HOST_ID";
const sha=(parts:unknown[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const idUnder=(value:string)=>sha(["lkb-capture-host-id",value,process.platform]);
function onHost<T>(host:string,setting:string|undefined,run:()=>T):T {
  const realHostname=os.hostname,had=Object.hasOwn(process.env,SETTING),prev=process.env[SETTING];
  os.hostname=()=>host;syncBuiltinESMExports();
  if(setting===undefined)delete process.env[SETTING];else process.env[SETTING]=setting;
  try {return run();}
  finally {os.hostname=realHostname;syncBuiltinESMExports();if(had)process.env[SETTING]=prev;else delete process.env[SETTING];}
}
test("B3-C2 c a signed acceptance published under one hostname is honoured under another only with the same setting",()=>{
  const f=fixture();try{
    const receipt=onHost("host-A","prod-1",()=>{const r=f.observe().receipt;f.review(r);return r;});
    assert.equal(receipt.hostId,idUnder("prod-1"));
    assert.equal(onHost("host-A","prod-1",()=>f.accept(receipt)),true);
    assert.equal(onHost("host-B","prod-1",()=>f.accept(receipt)),true,"new hostname, same setting: the signed acceptance survives the restart");
    assert.equal(onHost("host-B",undefined,()=>f.accept(receipt)),false,"new hostname, no setting: refused");
    const next=onHost("host-B","prod-1",()=>f.observe());
    assert.equal(onHost("host-C","prod-1",()=>f.accept(next.receipt)),true,"a later observation on another new hostname is still counted");
  }finally{f.clean();}
});
test("B3-C3 without the setting the acceptor and the publisher use today's hostname id",()=>{
  const f=fixture();try{
    const receipt=onHost("legacy-host",undefined,()=>{const r=f.observe().receipt;f.review(r);return r;});
    assert.equal(receipt.hostId,sha(["legacy-host",process.platform]));
    assert.equal(onHost("legacy-host",undefined,()=>f.accept(receipt)),true);
    assert.equal(onHost("other-host",undefined,()=>f.accept(receipt)),false);
    assert.equal(onHost("legacy-host",undefined,()=>f.review(receipt)).evidenceHash,receipt.evidenceHash);
  }finally{f.clean();}
});
test("B3-C4 the acceptor compares to exactly one id: V1, V2, no setting and the hostname id never stand in for each other",()=>{
  const f=fixture();try{
    const underV1=onHost("host-A","prod-1",()=>{const r=f.observe().receipt;f.review(r);return r;});
    assert.equal(onHost("host-A","prod-2",()=>f.accept(underV1)),false,"acceptance under V1 refused under V2");
    assert.equal(onHost("host-A",undefined,()=>f.accept(underV1)),false,"acceptance under V1 refused with no setting, even on the host that wrote it");
    assert.throws(()=>onHost("host-A","prod-2",()=>f.review(underV1)),/stale, foreign or synthetic/,"a person cannot accept a receipt written under another id");
    assert.equal(onHost("host-A","prod-1",()=>f.accept(underV1)),true);
    const underHost=onHost("host-A",undefined,()=>{const r=f.observe().receipt;f.review(r);return r;});
    assert.equal(underHost.hostId,sha(["host-A",process.platform]));
    assert.equal(onHost("host-A","prod-1",()=>f.accept(underHost)),false,"acceptance under the hostname id refused once the setting is on");
    assert.equal(onHost("host-A",undefined,()=>f.accept(underHost)),true);
  }finally{f.clean();}
});
test("B3-C7 the setting does not widen acceptance: issuer key, registry and every other binding still refuse",()=>{
  const f=fixture(),g=fixture();try{
    const receipt=onHost("host-A","prod-1",()=>{const r=f.observe().receipt;f.review(r);return r;});
    const accept=(r:typeof receipt)=>onHost("host-B","prod-1",()=>f.accept(r));
    assert.equal(accept(receipt),true,"positive control");
    // (b) same V, a registry that never saw the signing, or a different issuer key
    assert.equal(onHost("host-B","prod-1",()=>g.accept(receipt)),false,"another deployment's acceptor, same V");
    const keyFile=path.join(captureAcceptanceRegistryPath(f.root),".issuer-key"),genuine=readFileSync(keyFile);
    writeFileSync(keyFile,Buffer.alloc(32,7));assert.equal(accept(receipt),false,"same V, different issuer key");
    writeFileSync(keyFile,genuine);assert.equal(accept(receipt),true,"key restored");
    // (c) every other binding, with V set
    const R=receipt as any;
    for(const [name,variant] of Object.entries({tenantId:{...R,tenantId:"tenant-b"},slot:{...R,slot:"second"},profileDir:{...R,profileDir:R.profileDir+"-other"},
      recordDir:{...R,recordDir:R.recordDir+"-other"},platform:{...R,platform:"zoom"},fixtureKind:{...R,evidenceKind:"fixture"},rawHostId:{...R,hostId:"prod-1"},otherHostId:{...R,hostId:idUnder("prod-2")}}))
      assert.equal(accept(variant as typeof receipt),false,name+" must still refuse");
    f.setTenant("tenant-b");assert.equal(accept(receipt),false,"verified tenant");f.setTenant("tenant-a");
    f.env.LKB_TENANT_ID="tenant-b";assert.equal(accept(receipt),false,"configured tenant");f.env.LKB_TENANT_ID="tenant-a";
    const consentPath=path.join(f.workspace.recordDir,"record-consent",receipt.tenantId,`${receipt.sessionId}.json`),consent=JSON.parse(readFileSync(consentPath,"utf8"));
    delete consent.mediaStartedAt;writeFileSync(consentPath,JSON.stringify(consent));assert.equal(accept(receipt),false,"missing durable media origin");
    const second=onHost("host-B","prod-1",()=>f.observe());onHost("host-B","prod-1",()=>f.review(second.receipt));
    assert.equal(accept(second.receipt),true);
    second.observer.onCaptureEvent({event:"capture-error"});assert.equal(accept(second.receipt),false,"a newer failure marker");
  }finally{f.clean();g.clean();}
});
