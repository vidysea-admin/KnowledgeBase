import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,writeFileSync,rmSync,symlinkSync,unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRecordConsent } from "./context.js";
import { writeRecordConsent } from "./receipt-store.js";
import { prepareRecordFinalizerInputForTest } from "./finalizer-input.js";
function fixture(){
  const recordDir=mkdtempSync(path.join(tmpdir(),"t011-finalizer-")),owner={tenantId:"fixture",sessionId:"capture",meetingUrl:"https://example.invalid/meeting"};
  const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:"fixture",LKB_CAPTURE_APPROVED_BY:"fixture",LKB_CAPTURE_APPROVAL_REF:"fixture"},new Date(1000));
  receipt.mediaStartedAt=1000;receipt.privateWindows=[{tStart:2,tEnd:4}];writeRecordConsent(recordDir,receipt);
  const video=path.join(recordDir,"original.webm"),masked=path.join(recordDir,"fixture.private.lean.mp4");writeFileSync(video,"raw-secret");writeFileSync(masked,"fixture masked artifact");
  return {recordDir,owner,receipt,video,masked,input:{recordDir,owner,video,duration:8,lean:false},cleanup:()=>rmSync(recordDir,{recursive:true,force:true})};
}
test("finalizer reads durable exact owner facts, forces original-window mask and binds masked artifact+receipt hashes",async()=>{
  const f=fixture();try{
    const calls:unknown[]=[];const result=await prepareRecordFinalizerInputForTest(f.input,(video,options)=>{calls.push({video,options});return f.masked;});
    assert.deepEqual(calls,[{video:f.video,options:{enabled:false,privateWindows:[{start:2,end:4}],requirePrivacyMask:true}}]);
    assert.equal(result.originalVideo,f.video);assert.equal(result.publicVideo,f.masked);assert.equal(result.requiresPrivacyMask,true);
    assert.equal(result.receiptSha256,createHash("sha256").update(JSON.stringify(f.receipt)).digest("hex"));
    assert.equal(result.publicVideoSha256,createHash("sha256").update("fixture masked artifact").digest("hex"));
    assert.deepEqual(result.audioPrivacyWindows,[{start:2-0.100001,end:4+0.100001}]);
    assert.deepEqual(result.videoPrivacyWindows,[{start:2-0.200001,end:4+0.200001}]);
    assert.deepEqual(result.receipt.privateWindows,[{tStart:2,tEnd:4}]);
  }finally{f.cleanup();}
});
test("normalizer failure/raw fallback/missing receipt/origin/allprivate refuse before any downstream consumer",async()=>{
  const f=fixture();try{
    await assert.rejects(prepareRecordFinalizerInputForTest(f.input,()=>f.video),/returned original/);
    await assert.rejects(prepareRecordFinalizerInputForTest(f.input,()=>{throw new Error("mask proof failed");}),/mask proof failed/);
    let encoderCalls=0;const normalizer=()=>{encoderCalls++;return f.masked;};
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,owner:{...f.owner,tenantId:"foreign"}},normalizer));
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,duration:4,owner:{...f.owner,meetingHash:"a".repeat(64)}},normalizer));
    // Unknown media origin from a distinct new receipt cannot justify guessed private offsets.
    const unknown={...f.receipt,sessionId:"unknown",mediaStartedAt:undefined};writeRecordConsent(f.recordDir,unknown);
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,owner:{...f.owner,sessionId:"unknown"}},normalizer),/no verified public/);
    const allprivate={...f.receipt,sessionId:"all-private",privateWindows:[{tStart:0,tEnd:8}]};writeRecordConsent(f.recordDir,allprivate);
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,owner:{...f.owner,sessionId:"all-private"}},normalizer),/no verified public/);
    const historical={...f.receipt,sessionId:"historical",generation:undefined};writeRecordConsent(f.recordDir,historical);
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,owner:{...f.owner,sessionId:"historical"}},normalizer),/actual attempt generation/);
    assert.equal(encoderCalls,0);
  }finally{f.cleanup();}
});
test("direct finalizer refuses foreign slot inputs/outputs and redirected descendant before publication",async()=>{
  const f=fixture(),foreign=mkdtempSync(path.join(tmpdir(),"t011-foreign-")),outside=path.join(foreign,"private.webm"),alias=path.join(f.recordDir,"redirected");
  writeFileSync(outside,"foreign-private-media");let linked=false;
  try{
    let calls=0;
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,video:outside},()=>{calls++;return f.masked;}),/outside actual capture slot/);
    assert.equal(calls,0);
    await assert.rejects(prepareRecordFinalizerInputForTest(f.input,()=>outside),/outside actual capture slot/);
    symlinkSync(foreign,alias,process.platform==="win32"?"junction":"dir");linked=true;
    await assert.rejects(prepareRecordFinalizerInputForTest({...f.input,video:path.join(alias,"private.webm")},()=>{calls++;return f.masked;}),/Redirected/);
    assert.equal(calls,0);
    await assert.rejects(prepareRecordFinalizerInputForTest(f.input,()=>path.join(alias,"private.webm")),/Redirected/);
  }finally{if(linked)unlinkSync(alias);f.cleanup();rmSync(foreign,{recursive:true,force:true});}
});
