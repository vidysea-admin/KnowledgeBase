/** New ordinary-media composition floor; execute only through the central executor.
 * This calls the actual shared normalizer and receipt-to-mask finalizer input.
 * It does not join, transcribe, notify, upload, activate a host or regenerate media. */
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {normalizeCapture} from "../../../packages/meeting-bot/src/capture/record-finalize.ts";
import {prepareRecordFinalizerInput} from "../../../packages/meeting-bot/src/capture/record-consent/finalizer-input.ts";
import {createRecordConsent} from "../../../packages/meeting-bot/src/capture/record-consent/context.ts";
import {writeRecordConsent} from "../../../packages/meeting-bot/src/capture/record-consent/receipt-store.ts";
import {probeLeanMedia} from "../../../packages/meeting-bot/src/lean-video-ffmpeg.ts";

const root=process.cwd(), evidence=path.join(root,"qa/evidence/t035-lean-video-measured-encode");
const corpus=path.join(evidence,"eof-baseline-zeYvkn/stale-duration-source.mkv");
const expectedCorpus="d07c93e97ca281bf1c53c3aabf6a34d5ba56fd417256b9efdb75b9d432f42de7";
const hash=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
const sourcePaths=["packages/meeting-bot/src/capture/record-commands.ts","packages/meeting-bot/src/capture/record-finalize.ts",
  "packages/meeting-bot/src/capture/record-consent/finalizer-input.ts","packages/meeting-bot/src/capture/record-consent/context.ts",
  "packages/meeting-bot/src/capture/record-consent/receipt-store.ts","packages/meeting-bot/src/capture/record-consent/coverage.ts",
  "packages/meeting-bot/src/lean-video-ffmpeg.ts","qa/evidence/t035-lean-video-measured-encode/checker-duration-composition.mjs"];
const pins=Object.fromEntries(sourcePaths.map(file=>[file,hash(path.join(root,file))]));
for(let current=evidence;;current=path.dirname(current)){
  assert.equal(lstatSync(current).isSymbolicLink(),false,"Evidence aliases refused");
  if(path.dirname(current)===current)break;
}
assert.equal(hash(corpus),expectedCorpus,"Requires exact retained original runtime floor");
const dir=mkdtempSync(path.join(evidence,"composition-baseline-")), startedAt=new Date().toISOString();
const commands=[],cases=[];
const artifact=file=>({path:path.relative(root,file).replaceAll(path.sep,"/"),sizeBytes:statSync(file).size,sha256:hash(file)});
const peak=file=>{
  const args=["-nostdin","-hide_banner","-loglevel","info","-filter_threads","1","-threads","1","-i",file,
    "-map","0:a:0","-vn","-af","atrim=start=12,volumedetect","-f","null","-"];
  const started=Date.now(), result=spawnSync("ffmpeg",args,{encoding:"utf8",timeout:15000,killSignal:"SIGKILL",maxBuffer:2*1024*1024,windowsHide:true});
  commands.push({command:"ffmpeg",args,elapsedMs:Date.now()-started,status:result.status,error:result.error?.message,stdout:result.stdout,stderr:result.stderr});
  assert.equal(result.status,0,"Actual decoded-tail probe must complete");
  const raw=/max_volume:\s*(-?(?:[\d.]+|inf)) dB/.exec(result.stderr)?.[1];
  const value=raw==="-inf"?-Infinity:Number(raw); assert.ok(value===-Infinity||Number.isFinite(value),"Actual audio proof required");
  return value;
};
let report;
try{
  for(const scenario of ["raw-direct-private-eof","normalized-private-eof","normalized-closed-public-tail"]){
    const recordDir=path.join(dir,scenario);mkdirSync(recordDir);
    const raw=path.join(recordDir,"capture.mkv");copyFileSync(corpus,raw);
    const owner={tenantId:"synthetic-t035",sessionId:scenario,meetingUrl:"https://example.invalid/synthetic-duration-floor"};
    const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:"synthetic-only",LKB_CAPTURE_APPROVED_BY:"synthetic-only",LKB_CAPTURE_APPROVAL_REF:"synthetic-only"},new Date(1000));
    receipt.generation=randomUUID();receipt.mediaStartedAt=1000;
    receipt.privateWindows=[{tStart:9,tEnd:scenario==="normalized-closed-public-tail"?10:12}];
    writeRecordConsent(recordDir,receipt);
    const originalMedia=probeLeanMedia(raw), original=artifact(raw);
    assert.equal(originalMedia.duration,12);
    // This is the actual record-commands normal/recovery order: normalize, then re-probe/finalize.
    const input=scenario==="raw-direct-private-eof"?raw:normalizeCapture(raw,true);
    const inputMedia=probeLeanMedia(input);
    const prepared=await prepareRecordFinalizerInput({video:input,recordDir,owner,duration:inputMedia.duration});
    assert.notEqual(prepared.publicVideo,input,"Actual mandatory private derivative must be published");
    const outputMedia=probeLeanMedia(prepared.publicVideo),tailPeakDb=peak(prepared.publicVideo);
    assert.equal(hash(raw),original.sha256,"Original capture remains unchanged");
    assert.equal(hash(corpus),expectedCorpus,"Original recorded corpus remains unchanged");
    assert.ok(outputMedia.duration>12&&outputMedia.duration<=12.25,"Complete longer audio must be retained");
    cases.push({scenario,original,originalMedia,input:artifact(input),inputMedia,output:artifact(prepared.publicVideo),outputMedia,
      receiptWindows:receipt.privateWindows,preparedAudioWindows:prepared.audioPrivacyWindows,tailPeakDb});
  }
  assert.ok(cases[0].tailPeakDb<=-80,"Healthy direct-original EOF control must stay private");
  assert.ok(cases[2].tailPeakDb>-60,"Healthy closed-window public-tail control must remain audible");
  const exposed=cases[1].tailPeakDb>-80;
  for(const[file,digest]of Object.entries(pins))assert.equal(hash(path.join(root,file)),digest,"Source changed during proof");
  report={status:exposed?"reproduced-normalization-duration-loss":"no-reproduction",startedAt,completedAt:new Date().toISOString(),pins,
    originalCorpus:artifact(corpus),cases,commands,
    scope:"Actual shared normalizeCapture-to-prepareRecordFinalizerInput order over retained ordinary synthetic media; no real caller, provider, live-hour, host or production acceptance"};
  if(exposed)process.exitCode=1;
}catch(error){report={status:"incomplete",startedAt,completedAt:new Date().toISOString(),pins,error:String(error),cases,commands};process.exitCode=1;}
writeFileSync(path.join(dir,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,evidence:path.relative(root,dir)}));
