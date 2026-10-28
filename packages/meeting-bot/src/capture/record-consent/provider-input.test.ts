import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRecordConsent } from "./context.js";
import { runPrivateCaptureProvider } from "./provider-input.js";
test("provider receives exactly proved sanitized artifact/hash; original, mask failure and owner mismatch make zero calls",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"privacy-provider-"));
  try {
    const owner={tenantId:"owned",sessionId:"capture",meetingUrl:"https://example.invalid/meeting"};
    const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:"fixture",LKB_CAPTURE_APPROVED_BY:"fixture",LKB_CAPTURE_APPROVAL_REF:"fixture"},new Date(1000));
    receipt.mediaStartedAt=1000;receipt.privateWindows=[{tStart:2,tEnd:4}];
    const originalAudioPath=path.join(directory,"original.m4a"),audioPath=path.join(directory,"proved.private.m4a");
    writeFileSync(originalAudioPath,"original-secret");writeFileSync(audioPath,"public-muted-public");
    const sanitizedSha256=createHash("sha256").update("public-muted-public").digest("hex"),input={receipt,owner,duration:8,originalAudioPath,audioPath,sanitizedSha256};
    const calls:unknown[]=[];const provider=async(file:string,proof:unknown)=>{calls.push({file,proof});return "received";};
    for(const mutation of [{audioPath:originalAudioPath},{sanitizedSha256:undefined},{sanitizedSha256:"a".repeat(64)},{owner:{...owner,tenantId:"foreign"}},
      {receipt:{...receipt,privateWindows:[{tStart:0,tEnd:8}]}},{receipt:{...receipt,generation:undefined}}])await assert.rejects(runPrivateCaptureProvider({...input,...mutation},provider));
    assert.equal(calls.length,0);
    assert.equal(await runPrivateCaptureProvider(input,provider),"received");
    assert.deepEqual(calls,[{file:audioPath,proof:{sha256:sanitizedSha256,receiptSha256:createHash("sha256").update(JSON.stringify(receipt)).digest("hex")}}]);
    writeFileSync(audioPath,"replaced-by-secret");await assert.rejects(runPrivateCaptureProvider(input,provider),/changed/);assert.equal(calls.length,1);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
