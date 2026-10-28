import { createHash } from "node:crypto";
import { createReadStream,lstatSync,realpathSync } from "node:fs";
import path from "node:path";
import { normalizeLeanCapture,type LeanCaptureOptions } from "../../lean-video-ffmpeg.js";
import { readRecordConsent } from "./receipt-store.js";
import { publicRecordCaptureIntervals,recordPrivacyMaskIntervals,recordGuardedPrivacyMaskIntervals } from "./coverage.js";
import type { RecordConsentReceipt } from "./context.js";
import { requireNativeFinalizedMedia,type NativeFinalizedMedia } from "../native/native-media-finalize.js";
import { requireNativeCanonicalMeasurement,type QualifiedCaptureClock } from "../tiles/native-measurement.js";
import { requireNativeProviderAudio,type NativeProviderAudio } from "./native-provider-audio.js";
export interface RecordFinalizerInputOptions {
  video:string;recordDir:string;owner:{tenantId:string;sessionId:string;meetingHash?:string};duration:number;lean?:boolean;
  nativeMedia?:NativeFinalizedMedia;
  canonicalClock?:QualifiedCaptureClock;nativeAudio?:NativeProviderAudio;
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
  let windows=recordPrivacyMaskIntervals(receipt,input.owner,input.duration);
  let nativeAudioWindows:Array<{start:number;end:number}>|undefined;
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
  const original=requireArtifact(input.video),requiresPrivacyMask=windows.length>0||!!(input.nativeMedia&&receipt.privateWindows.length);
  if(input.nativeMedia){
    const native=await requireNativeFinalizedMedia(input.nativeMedia);
    if(native.spool.identity.tenantId!==receipt.tenantId||native.spool.identity.sessionId!==receipt.sessionId||native.spool.identity.captureGeneration!==receipt.generation)throw new Error("Native finalizer consent identity mismatch");
    if(receipt.privateWindows.length){
      if(!input.canonicalClock||!input.nativeAudio||receipt.mediaStartedAt===undefined)throw new Error("Native private video requires qualified held-frame privacy mapping");
      const clock=await requireNativeCanonicalMeasurement(input.canonicalClock,native);
      const audio=await requireNativeProviderAudio(input.nativeAudio,{receipt,owner:input.owner,duration:input.nativeAudio.durationSec,audioPath:input.nativeAudio.audioPath,originalAudioPath:input.nativeAudio.originalAudioPath});
      if(audio.media!==native||audio.canonicalClock!==input.canonicalClock)throw new Error("Native finalizer audio clock mismatch");
      nativeAudioWindows=input.nativeAudio.maskIntervals.map(w=>({start:w.startSample/input.nativeAudio!.sampleRate,end:w.endSample/input.nativeAudio!.sampleRate}));
      const source=native.sourceVideo.media.streams.find(s=>s.kind==="video"),output=native.video.media.streams.find(s=>s.kind==="video");
      if(!source||!output)throw new Error("Native video interval identity missing");
      const maps=native.videoTransform.intervalMap;if(!maps.length)throw new Error("Native held-frame map missing");
      const audioFrames=native.video.frames.filter(f=>f.streamIndex===1);
      const physicalAudioEOF=audioFrames.reduce((end,f)=>Math.max(end,(f.pts+f.duration)*f.timebase.numerator/f.timebase.denominator),0);
      if(!Number.isFinite(physicalAudioEOF)||physicalAudioEOF<=0||input.duration<physicalAudioEOF)throw new Error("Native physical audio EOF outside finalizer duration");
      const privateHost=receipt.privateWindows.map(w=>({start:receipt.mediaStartedAt!*1000+w.tStart*1e6-200001-clock.totalUncertaintyUs,end:receipt.mediaStartedAt!*1000+w.tEnd*1e6+200001+clock.totalUncertaintyUs}));
      windows=[];
      for(const [index,map]of maps.entries()){
        const start=clock.videoZeroEpochUs.earliest+map.sourceStartPts*source.timebase.numerator/source.timebase.denominator*1e6-clock.driftBoundUs;
        // No independently measured capture-stop exists: the final displayed image
        // may be held through the entire physical audio tail. Never stop at its nominal packet duration.
        const last=index===maps.length-1;
        const end=last?Infinity:clock.videoZeroEpochUs.latest+map.sourceEndPts*source.timebase.numerator/source.timebase.denominator*1e6+clock.driftBoundUs;
        if(privateHost.some(w=>w.start<end&&w.end>start)){
          const from=Math.max(0,map.destinationStartPts*output.timebase.numerator/output.timebase.denominator),to=last?input.duration:Math.min(input.duration,map.destinationEndPts*output.timebase.numerator/output.timebase.denominator);
          if(to<=from)throw new Error("Native private held-frame outside measured output");
          windows.push({start:from,end:to});
        }
      }
      // Raw helper guards are conservative and can mask additional safe frames.
      if(!windows.length)throw new Error("Native private video domain has no verified mask");
      windows=windows.reduce<Array<{start:number;end:number}>>((all,w)=>{const prior=all.at(-1);if(prior&&w.start<=prior.end)prior.end=Math.max(prior.end,w.end);else all.push({...w});return all;},[]);
    }
  }
  // The encoder receives original receipt intervals and adds its own guards exactly once.
  const publicVideo=input.nativeMedia&&!receipt.privateWindows.length?input.video:normalize(input.video,{enabled:input.lean===true,...(requiresPrivacyMask?{privateWindows:windows,requirePrivacyMask:true}:{})});
  const output=requireArtifact(publicVideo);
  if(requiresPrivacyMask&&output.physical===original.physical)throw new Error("Privacy normalization returned original; publication refused");
  const hash=createHash("sha256");for await(const bytes of createReadStream(publicVideo))hash.update(bytes);
  const current=requireArtifact(publicVideo);
  if(input.nativeMedia){const sourceHash=createHash("sha256");for await(const bytes of createReadStream(input.video))sourceHash.update(bytes);if(sourceHash.digest("hex")!==input.nativeMedia.video.media.file.sha256)throw new Error("Native finalizer playback physical identity mismatch");}
  if(current.stat.ino!==output.stat.ino||current.stat.dev!==output.stat.dev||current.stat.size!==output.stat.size||current.stat.mtimeNs!==output.stat.mtimeNs||current.physical!==output.physical)throw new Error("Masked artifact changed during source binding");
  return {receipt,originalVideo:input.video,publicVideo,requiresPrivacyMask,
    audioPrivacyWindows:nativeAudioWindows??recordGuardedPrivacyMaskIntervals(receipt,input.owner,input.duration,"audio"),
    videoPrivacyWindows:input.nativeMedia&&receipt.privateWindows.length?windows:recordGuardedPrivacyMaskIntervals(receipt,input.owner,input.duration,"video"),
    receiptSha256:createHash("sha256").update(JSON.stringify(receipt)).digest("hex"),publicVideoSha256:hash.digest("hex")};
}
/** Production always invokes the actual mandatory privacy-proof encoder. */
export function prepareRecordFinalizerInput(input:RecordFinalizerInputOptions):Promise<PreparedRecordFinalizerInput> {return prepare(input,normalizeLeanCapture);}
/** Explicit unit seam; production callers use prepareRecordFinalizerInput without injection. */
export function prepareRecordFinalizerInputForTest(input:RecordFinalizerInputOptions,normalize:Normalizer):Promise<PreparedRecordFinalizerInput> {return prepare(input,normalize);}
