/** Canonical selected WAV admission. Unknown host clocks never authorize private speech. */
import { createHash,randomUUID } from "node:crypto";
import { closeSync, openSync, readSync,writeSync,fsyncSync,unlinkSync } from "node:fs";
import path from "node:path";
import { nativeWavHeader, requireNativeFinalizedMedia, validateNativeSelectedAudio, type NativeFinalizedMedia } from "../native/native-media-finalize.js";
import { fingerprintNativeFile,probeNativeMedia,requireNativeDecodedProbe,type NativeDecodedProbe } from "../native/native-media-probe.js";
import { requireNativeCanonicalMeasurement,type QualifiedCaptureClock } from "../tiles/native-measurement.js";
import { validateRecordConsent, type RecordConsentReceipt } from "./context.js";
import { readRecordConsent } from "./receipt-store.js";
import { readFileSync } from "node:fs";
import { requireNativeArchiveAdmission, type NativeArchiveAdmission } from "../native/native-archive-authority.js";

type Owner = {tenantId:string;sessionId:string;meetingHash?:string};
export interface NativeProviderAudio {
  readonly audioPath:string; readonly originalAudioPath:string;
  readonly sha256:string; readonly receiptSha256:string; readonly durationSec:number;
  readonly canonicalStartSeconds:0; readonly pcmSha256:string;
  readonly sampleRate:number; readonly sampleCount:number; readonly firstSourceSampleIndex:number;
  readonly maskIntervals:readonly {startSample:number;endSample:number}[];
  readonly maskReceiptPath?:string;readonly maskReceiptSha256?:string;
}
export interface NativeProviderAudioOptions {
  media:NativeFinalizedMedia;recordDir:string;owner:Owner;receipt?:RecordConsentReceipt;
  maxTotalBytes:number;
  /** Additional retained copies owned/count-verified by the trusted finalizer caller. */
  additionalRetainedBytes?:number;
  canonicalClock?:QualifiedCaptureClock;
}
const issued=new WeakMap<object,{options:NativeProviderAudioOptions;source:NativeProviderAudio;decoded?:NativeDecodedProbe;uncertaintyUs:number;mappingSha256?:string;admission?:NativeArchiveAdmission;readReceipt?:()=>RecordConsentReceipt}>();
const digest=(value:RecordConsentReceipt)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_PROVIDER_BYTES=1024**3;
function bounded(value:number,label:string,minimum=0):number {
  if(!Number.isSafeInteger(value)||value<minimum||value>8*1024**3)throw new Error(`Invalid native provider ${label}`);
  return value;
}
function confined(file:string,directory:string):void {
  if(!path.isAbsolute(directory)||/^[/\\]{2}/.test(directory))throw new Error("Local native capture slot required");
  const relative=path.relative(path.resolve(directory),file);
  if(!relative||path.isAbsolute(relative)||relative===".."||relative.startsWith(`..${path.sep}`))throw new Error("Native provider artifact outside capture slot");
}
/** Full streaming PCM readback with exact header/physical EOF; no decoder invocation or padding. */
export function verifyCanonicalNativeWav(file:string,expected:{sha256:string;pcmSha256:string;sampleRate:number;sampleCount:number}):void {
  const header=nativeWavHeader(expected.sampleCount,expected.sampleRate);
  const before=fingerprintNativeFile(file,MAX_PROVIDER_BYTES);
  if(before.sha256!==expected.sha256||before.byteLength!==44+expected.sampleCount*2)throw new Error("Native selected WAV physical identity mismatch");
  const fd=openSync(file,"r"),actual=Buffer.alloc(44),buffer=Buffer.alloc(64*1024),pcm=createHash("sha256");
  try {
    let offset=0;while(offset<44){const n=readSync(fd,actual,offset,44-offset,null);if(!n)throw new Error("Native selected WAV header truncated");offset+=n;}
    if(!actual.equals(header))throw new Error("Native selected WAV format mismatch");
    let remaining=expected.sampleCount*2;
    while(remaining){const n=readSync(fd,buffer,0,Math.min(buffer.length,remaining),null);if(!n)throw new Error("Native selected WAV PCM truncated");pcm.update(buffer.subarray(0,n));remaining-=n;}
    if(readSync(fd,buffer,0,1,null)||pcm.digest("hex")!==expected.pcmSha256)throw new Error("Native selected WAV PCM/EOF mismatch");
  } finally {closeSync(fd);}
  const after=fingerprintNativeFile(file,MAX_PROVIDER_BYTES);
  if(after.sha256!==before.sha256||after.byteLength!==before.byteLength)throw new Error("Native selected WAV changed during readback");
}
async function inspect(input:NativeProviderAudioOptions,readReceipt?:()=>RecordConsentReceipt):Promise<Omit<NativeProviderAudio,"canonicalStartSeconds">&{canonicalStartSeconds:0}> {
  const media=await requireNativeFinalizedMedia(input.media),identity=media.spool.identity;
  const receipt=readReceipt?readReceipt():readRecordConsent(input.recordDir,input.owner);
  if(input.receipt&&digest(validateRecordConsent(input.receipt,input.owner))!==digest(receipt))throw new Error("Native provider consent changed");
  if(identity.tenantId!==receipt.tenantId||identity.sessionId!==receipt.sessionId||!receipt.generation||identity.captureGeneration!==receipt.generation)throw new Error("Native provider owner/generation mismatch");
  // A receipt time is a wall origin, not a measured sample clock. Even windows beyond
  // the nominal duration cannot be ignored without a qualified host->sample map.
  if(receipt.privateWindows.length&&!input.canonicalClock)throw new Error("Native private audio requires qualified host-to-canonical sample mapping; provider refused");
  const max=bounded(input.maxTotalBytes,"quota",1),extra=bounded(input.additionalRetainedBytes??0,"retained bytes");
  const files=[media.spool.video,media.spool.audio,media.spool.ledger,media.video.media.file,media.selectedAudio.media.file];
  let total=extra;const seen=new Set<string>();
  for(const file of files){confined(file.path,input.recordDir);if(seen.has(file.path))continue;seen.add(file.path);const physical=fingerprintNativeFile(file.path,max);if(physical.sha256!==file.sha256||physical.byteLength!==file.byteLength)throw new Error("Native provider source changed");total+=physical.byteLength;if(!Number.isSafeInteger(total)||total>max)throw new Error("Native provider retained quota exceeded");}
  validateNativeSelectedAudio(media.spool,media.selectedAudio);
  const audio=media.canonicalAudio;
  if(audio.path!==media.selectedAudio.media.file.path||audio.sha256!==media.selectedAudio.media.file.sha256||audio.pcmSha256!==media.spool.audio.sha256||audio.sampleRate!==media.spool.sampleRate||audio.sampleCount!==media.spool.audioSampleCount||audio.firstSourceSampleIndex!==media.spool.firstAudioSampleIndex||audio.firstDecodedPts!==0||audio.canonicalStartSeconds!==0)throw new Error("Native canonical audio binding mismatch");
  verifyCanonicalNativeWav(audio.path,audio);
  return {audioPath:audio.path,originalAudioPath:audio.path,sha256:audio.sha256,receiptSha256:digest(receipt),durationSec:audio.sampleCount/audio.sampleRate,canonicalStartSeconds:0,pcmSha256:audio.pcmSha256,sampleRate:audio.sampleRate,sampleCount:audio.sampleCount,firstSourceSampleIndex:audio.firstSourceSampleIndex,maskIntervals:[]};
}
/** Arithmetic only: this never issues clock or privacy authority. Guard includes audio edge protection. */
export function canonicalPrivateSampleIntervals(windows:readonly {tStart:number;tEnd:number}[],mediaStartedAt:number,zero:{earliest:number;latest:number},uncertaintyUs:number,sampleRate:number,sampleCount:number):{startSample:number;endSample:number}[] {
  if(!Number.isSafeInteger(mediaStartedAt)||![zero.earliest,zero.latest].every(v=>Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER)||zero.latest<zero.earliest||!Number.isFinite(uncertaintyUs)||uncertaintyUs<0||!Number.isSafeInteger(sampleRate)||sampleRate<1||sampleRate>192000||!Number.isSafeInteger(sampleCount)||sampleCount<1||windows.length>256)throw new Error("Invalid native privacy clock domain");
  const result:{startSample:number;endSample:number}[]=[];
  for(const w of [...windows].sort((a,b)=>a.tStart-b.tStart)){
    if(!Number.isFinite(w.tStart)||!Number.isFinite(w.tEnd)||w.tStart<0||w.tEnd<=w.tStart)throw new Error("Invalid native private interval");
    const from=mediaStartedAt*1000+w.tStart*1e6-zero.latest-uncertaintyUs-100001,to=mediaStartedAt*1000+w.tEnd*1e6-zero.earliest+uncertaintyUs+100001;
    if(!Number.isFinite(from)||!Number.isFinite(to)||Math.abs(from)>Number.MAX_SAFE_INTEGER||Math.abs(to)>Number.MAX_SAFE_INTEGER)throw new Error("Native privacy interval overflow");
    const startSample=Math.max(0,Math.min(sampleCount,Math.floor(from*sampleRate/1e6))),endSample=Math.max(0,Math.min(sampleCount,Math.ceil(to*sampleRate/1e6)));
    if(endSample<=startSample)continue;
    const prior=result.at(-1);if(prior&&startSample<=prior.endSample)prior.endSample=Math.max(prior.endSample,endSample);else result.push({startSample,endSample});
  }return result;
}
function writeAll(fd:number,bytes:Buffer):void{let offset=0;while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(!n)throw new Error("Native masked WAV write failed");offset+=n;}}
export async function prepareNativeProviderAudio(input:NativeProviderAudioOptions):Promise<NativeProviderAudio> {
  const source=Object.freeze(await inspect(input)),receipt=readRecordConsent(input.recordDir,input.owner);
  const qualification=input.canonicalClock?await requireNativeCanonicalMeasurement(input.canonicalClock,input.media):undefined;
  if(qualification&&(qualification.audioPath!==source.audioPath||qualification.audioSha256!==source.sha256||qualification.sampleRate!==source.sampleRate||qualification.sampleCount!==source.sampleCount))throw new Error("Native qualified canonical source mismatch");
  if(!receipt.privateWindows.length){issued.set(source,{options:{...input,owner:{...input.owner}},source,uncertaintyUs:qualification?.totalUncertaintyUs??0,mappingSha256:qualification?.mappingSha256});return source;}
  if(!qualification||receipt.mediaStartedAt===undefined)throw new Error("Qualified native privacy origin required");
  const intervals=canonicalPrivateSampleIntervals(receipt.privateWindows,receipt.mediaStartedAt,qualification.mediaZeroEpochUs,qualification.totalUncertaintyUs,source.sampleRate,source.sampleCount);
  if(intervals.length===1&&intervals[0]!.startSample===0&&intervals[0]!.endSample===source.sampleCount)throw new Error("Entire native capture private; provider refused");
  const wavBytes=44+source.sampleCount*2;
  // Recheck retained sources with room reserved before creating any candidate bytes.
  await inspect({...input,additionalRetainedBytes:(input.additionalRetainedBytes??0)+wavBytes+65536});
  const audioPath=path.join(path.dirname(source.audioPath),`masked-provider-${randomUUID()}.wav`),maskReceiptPath=`${audioPath}.receipt.json`;
  let success=false;
  try{
    const read=openSync(source.audioPath,"r"),write=openSync(audioPath,"wx",0o600),buffer=Buffer.alloc(64*1024),pcm=createHash("sha256");
    try{writeAll(write,nativeWavHeader(source.sampleCount,source.sampleRate));let sample=0;
      while(sample<source.sampleCount){const requested=Math.min(buffer.length,(source.sampleCount-sample)*2);let n=0;while(n<requested){const got=readSync(read,buffer,n,requested-n,44+sample*2+n);if(!got)throw new Error("Native PCM source truncated during masking");n+=got;}
        for(const interval of intervals){const start=Math.max(sample,interval.startSample),end=Math.min(sample+n/2,interval.endSample);if(end>start)buffer.fill(0,(start-sample)*2,(end-sample)*2);}
        pcm.update(buffer.subarray(0,n));writeAll(write,buffer.subarray(0,n));sample+=n/2;
      }fsyncSync(write);
    }finally{closeSync(read);closeSync(write);}
    const physical=fingerprintNativeFile(audioPath,MAX_PROVIDER_BYTES),pcmSha256=pcm.digest("hex");
    verifyCanonicalNativeWav(audioPath,{...source,sha256:physical.sha256,pcmSha256});
    const decoded=probeNativeMedia(audioPath,{ffmpegPath:input.media.selectedAudio.decoder.path,ffprobePath:input.media.selectedAudio.inspector.path});
    validateNativeSelectedAudio({audioSampleCount:source.sampleCount,sampleRate:source.sampleRate,audio:{...physical,sha256:pcmSha256}},decoded);
    const maskReceipt=Buffer.from(JSON.stringify({version:1,identity:input.media.spool.identity,receiptSha256:source.receiptSha256,sourceSha256:source.sha256,sourcePcmSha256:source.pcmSha256,audioSha256:physical.sha256,pcmSha256,sampleRate:source.sampleRate,sampleCount:source.sampleCount,canonicalStartSeconds:0,firstSourceSampleIndex:source.firstSourceSampleIndex,intervals,mappingSha256:qualification.mappingSha256,uncertaintyUs:qualification.totalUncertaintyUs}));
    if(maskReceipt.length>65536)throw new Error("Native mask receipt quota exceeded");
    const fd=openSync(maskReceiptPath,"wx",0o600);try{writeAll(fd,maskReceipt);fsyncSync(fd);}finally{closeSync(fd);}
    const maskReceiptSha256=fingerprintNativeFile(maskReceiptPath,65536).sha256;
    await inspect(input);
    const result=Object.freeze({...source,audioPath,sha256:physical.sha256,pcmSha256,maskIntervals:Object.freeze(intervals.map(w=>Object.freeze(w))),maskReceiptPath,maskReceiptSha256});
    issued.set(result,{options:{...input,owner:{...input.owner}},source,decoded,uncertaintyUs:qualification.totalUncertaintyUs,mappingSha256:qualification.mappingSha256});success=true;return result;
  }finally{if(!success){for(const file of [audioPath,maskReceiptPath])try{unlinkSync(file);}catch{/* Preserve original failure; only exclusive owned candidate names. */}}}
}
/** Actual provider boundary requires the process-private issuer and current physical bytes. */
export async function requireNativeProviderAudio(value:NativeProviderAudio,input?:{receipt:RecordConsentReceipt;owner:Owner;duration:number;audioPath:string;originalAudioPath:string}) {
  const state=value&&issued.get(value);if(!state)throw new Error("Native provider audio capability required");
  if(state.admission)await requireNativeArchiveAdmission(state.admission);
  if(input){const receipt=validateRecordConsent(input.receipt,input.owner);
    if(input.owner.tenantId!==state.options.owner.tenantId||input.owner.sessionId!==state.options.owner.sessionId||digest(receipt)!==value.receiptSha256||input.audioPath!==value.audioPath||input.originalAudioPath!==value.originalAudioPath||input.duration!==value.durationSec)throw new Error("Native provider dispatch binding mismatch");}
  const current=await inspect(state.options,state.readReceipt);
  if(JSON.stringify(current)!==JSON.stringify(state.source)||current.receiptSha256!==value.receiptSha256)throw new Error("Native provider proof changed");
  if(state.options.canonicalClock)await requireNativeCanonicalMeasurement(state.options.canonicalClock,state.options.media);
  verifyCanonicalNativeWav(value.audioPath,value);
  if(state.decoded){requireNativeDecodedProbe(state.decoded);if(fingerprintNativeFile(value.maskReceiptPath!,65536).sha256!==value.maskReceiptSha256)throw new Error("Native mask receipt changed");}
  if(state.decoded)await inspect({...state.options,additionalRetainedBytes:(state.options.additionalRetainedBytes??0)+44+value.sampleCount*2+65536});
  if(state.admission)await requireNativeArchiveAdmission(state.admission);
  return {canonicalClock:state.options.canonicalClock,media:state.options.media,audioPath:value.audioPath,audioSha256:value.sha256,sampleRate:value.sampleRate,sampleCount:value.sampleCount,intervalMap:[{sourceStartSample:0,sourceEndSample:value.sampleCount,destinationStartSample:0,destinationEndSample:value.sampleCount}],uncertaintyUs:state.uncertaintyUs,mappingSha256:state.mappingSha256};
}
/** Only private journal admission + fresh decoder proof can reissue retained public WAVs.
 * Private masks require a separately supported video/clock reproof; never regenerate WAVs. */
export async function reproveArchivedNativeProviderAudio(admission:NativeArchiveAdmission,media:NativeFinalizedMedia):Promise<NativeProviderAudio> {
  const {directory,manifest}=await requireNativeArchiveAdmission(admission);
  const owner={tenantId:manifest.binding.tenantId,sessionId:manifest.binding.sessionId};
  const readReceipt=()=>validateRecordConsent(JSON.parse(readFileSync(path.join(directory,"consent.json"),"utf8")),owner);
  const receipt=readReceipt();
  if(digest(receipt)!==manifest.binding.receiptSha256||receipt.generation!==manifest.binding.captureGeneration)throw new Error("Archived native consent mismatch");
  if(receipt.privateWindows.length)throw new Error("Archived native private transform unsupported");
  const options:NativeProviderAudioOptions={media,recordDir:directory,owner,receipt,maxTotalBytes:8*1024**3};
  const source=Object.freeze(await inspect(options,readReceipt));
  const audioPath=path.join(directory,"provider.wav");
  verifyCanonicalNativeWav(audioPath,source);
  const result=Object.freeze({...source,audioPath});
  await requireNativeArchiveAdmission(admission);
  issued.set(result,{options,source,uncertaintyUs:0,admission,readReceipt});
  return result;
}
