import { createHash } from "node:crypto";
import { createReadStream,lstatSync,realpathSync } from "node:fs";
import path from "node:path";
import { normalizeLeanCapture,type LeanCaptureOptions } from "../../lean-video-ffmpeg.js";
import { readRecordConsent } from "./receipt-store.js";
import { publicRecordCaptureIntervals,recordPrivacyMaskIntervals,recordGuardedPrivacyMaskIntervals } from "./coverage.js";
import type { RecordConsentReceipt } from "./context.js";
export interface RecordFinalizerInputOptions {
  video:string;recordDir:string;owner:{tenantId:string;sessionId:string;meetingHash?:string};duration:number;lean?:boolean;
}
export interface PreparedRecordFinalizerInput {
  receipt:RecordConsentReceipt;originalVideo:string;publicVideo:string;
  audioPrivacyWindows:Array<{start:number;end:number}>;videoPrivacyWindows:Array<{start:number;end:number}>;
  receiptSha256:string;publicVideoSha256:string;requiresPrivacyMask:boolean;
}
type Normalizer=(video:string,options:LeanCaptureOptions)=>string;
async function prepare(input:RecordFinalizerInputOptions,normalize:Normalizer):Promise<PreparedRecordFinalizerInput> {
  const receipt=readRecordConsent(input.recordDir,input.owner);
  if(receipt.privateWindows.length&&!receipt.generation)throw new Error("Private capture lacks actual attempt generation; finalization refused");
  const windows=recordPrivacyMaskIntervals(receipt,input.owner,input.duration);
  if(!publicRecordCaptureIntervals(receipt,input.owner,{tStart:0,tEnd:input.duration},"audio").length)throw new Error("Private capture has no verified public media; finalization refused");
  const slot=path.resolve(input.recordDir),canonical=(value:string)=>process.platform==="win32"?value.toLowerCase():value;
  const requireArtifact=(file:string)=>{
    if(!path.isAbsolute(file)||/^[/\\]{2}/.test(file))throw new Error("Local finalizer media required");
    const resolved=path.resolve(file),relative=path.relative(slot,resolved);
    if(path.isAbsolute(relative)||relative===".."||relative.startsWith(`..${path.sep}`))throw new Error("Finalizer artifact outside actual capture slot");
    for(let current=path.dirname(resolved);;current=path.dirname(current)){
      const directory=lstatSync(current,{bigint:true});
      if(!directory.isDirectory()||directory.isSymbolicLink()||canonical(realpathSync(current))!==canonical(current))throw new Error("Redirected finalizer media ancestor");
      if(canonical(current)===canonical(slot))break;
      if(path.dirname(current)===current)throw new Error("Finalizer capture slot not reached");
    }
    const stat=lstatSync(resolved,{bigint:true}),physical=realpathSync(resolved);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size<=0n||canonical(physical)!==canonical(resolved))throw new Error("Invalid finalizer media artifact");
    return {stat,physical};
  };
  const original=requireArtifact(input.video),requiresPrivacyMask=windows.length>0;
  // The encoder receives original receipt intervals and adds its own guards exactly once.
  const publicVideo=normalize(input.video,{enabled:input.lean===true,...(requiresPrivacyMask?{privateWindows:windows,requirePrivacyMask:true}:{})});
  const output=requireArtifact(publicVideo);
  if(requiresPrivacyMask&&output.physical===original.physical)throw new Error("Privacy normalization returned original; publication refused");
  const hash=createHash("sha256");for await(const bytes of createReadStream(publicVideo))hash.update(bytes);
  const current=requireArtifact(publicVideo);
  if(current.stat.ino!==output.stat.ino||current.stat.dev!==output.stat.dev||current.stat.size!==output.stat.size||current.stat.mtimeNs!==output.stat.mtimeNs||current.physical!==output.physical)throw new Error("Masked artifact changed during source binding");
  return {receipt,originalVideo:input.video,publicVideo,requiresPrivacyMask,
    audioPrivacyWindows:recordGuardedPrivacyMaskIntervals(receipt,input.owner,input.duration,"audio"),
    videoPrivacyWindows:recordGuardedPrivacyMaskIntervals(receipt,input.owner,input.duration,"video"),
    receiptSha256:createHash("sha256").update(JSON.stringify(receipt)).digest("hex"),publicVideoSha256:hash.digest("hex")};
}
/** Production always invokes the actual mandatory privacy-proof encoder. */
export function prepareRecordFinalizerInput(input:RecordFinalizerInputOptions):Promise<PreparedRecordFinalizerInput> {return prepare(input,normalizeLeanCapture);}
/** Explicit unit seam; production callers use prepareRecordFinalizerInput without injection. */
export function prepareRecordFinalizerInputForTest(input:RecordFinalizerInputOptions,normalize:Normalizer):Promise<PreparedRecordFinalizerInput> {return prepare(input,normalize);}
