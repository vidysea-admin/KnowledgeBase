/** Receiver capability -> private mux + exact lossless selected-provider WAV.
 * Playback Opus is never used to invent a canonical PCM origin. */
import { spawnSync } from "node:child_process";
import { closeSync, lstatSync, mkdirSync, openSync, readSync, rmSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readClosedNativeSpool, readNativeSpoolLedger, verifyClosedNativeSpool, rehydrateNativeSpool } from "./native-spool.js";
import { requireNativeArchiveAdmission, type NativeArchiveAdmission } from "./native-archive-authority.js";
import { fingerprintNativeFile, probeNativeMedia, requireNativeDecodedProbe, type NativeDecodedProbe, type NativeDecoderOptions } from "./native-media-probe.js";
import type { ClosedNativeSpool, DecodedIntervalMap, DecodedTransformReceipt, NativeClockUncertainty, ProducerVideoObservation } from "./native-media-types.js";

export interface NativeFinalizeOptions extends NativeDecoderOptions {
  /** Configured capture reservation covering raw spool + both candidates, never final-output MB/h. */
  maxTotalBytes: number;
  maxMuxBytes: number;
  /** Measured local audio vs video producer origin; playback only, not a host-clock proof. */
  playbackAudioOffsetUs: number;
}
export interface NativeFinalizedMedia {
  readonly spool: ClosedNativeSpool;
  readonly video: NativeDecodedProbe;
  readonly selectedAudio: NativeDecodedProbe;
  readonly sourceVideo: NativeDecodedProbe;
  readonly videoTransform: DecodedTransformReceipt;
  readonly mux: { readonly path: string; readonly sha256: string; readonly argv: readonly string[] };
  readonly canonicalAudio: { readonly path: string; readonly sha256: string; readonly pcmSha256: string; readonly sampleRate: number; readonly sampleCount: number; readonly firstSourceSampleIndex: number; readonly firstDecodedPts: number; readonly canonicalStartSeconds: 0 };
}
const finalized = new WeakSet<object>();
const unknownUncertainty: NativeClockUncertainty = Object.freeze({bracketWidthUs:null,clockFitResidualUs:null,quantizationUs:null,audioOutputEstimationBoundUs:null,samplerObservationLagBoundUs:null,sourceObservationLagBoundUs:null});
function positive(value: number, label: string): number { if (!Number.isSafeInteger(value)||value<=0) throw new Error(`Invalid native ${label}`); return value; }
function writeAll(fd: number, buffer: Buffer): void { let offset=0; while(offset<buffer.length) { const written=writeSync(fd,buffer,offset,buffer.length-offset); if (!written) throw new Error("Native candidate write failed"); offset+=written; } }
export function nativeWavHeader(sampleCount: number, sampleRate: number): Buffer {
  positive(sampleCount,"sample count"); positive(sampleRate,"sample rate");
  const size=sampleCount*2;
  if (!Number.isSafeInteger(size)||size>0xffffffff-36||sampleRate>192000) throw new Error("Native WAV outside RIFF bounds");
  const h=Buffer.alloc(44);h.write("RIFF",0);h.writeUInt32LE(size+36,4);h.write("WAVEfmt ",8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(sampleRate,24);h.writeUInt32LE(sampleRate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write("data",36);h.writeUInt32LE(size,40);return h;
}
/** Pure checker seam; production invokes only after the private decoder capability is obtained. */
export function validateNativeSelectedAudio(spool: Pick<ClosedNativeSpool,"audioSampleCount"|"sampleRate"|"audio">, selectedAudio: NativeDecodedProbe): void {
  const audio=selectedAudio.media.streams.find(s=>s.kind==="audio");
  if(selectedAudio.media.streams.length!==1||!audio||audio.codec!=="pcm_s16le"||audio.firstPts!==0||audio.decodedSampleCount!==spool.audioSampleCount||audio.sampleRate!==spool.sampleRate||selectedAudio.audioPcmSha256!==spool.audio.sha256||audio.codecPrimingSamples!==0||audio.skipSamples!==0||audio.discardPaddingSamples!==0)throw new Error("Selected provider first-sample identity unavailable");
}
/** Exhaustively join decoded VP8 image identities, preserving each held-frame interval. */
export function nativeVideoIntervalMap(source: NativeDecodedProbe, output: NativeDecodedProbe, observations: readonly ProducerVideoObservation[]): DecodedIntervalMap[] {
  const a=source.media.streams.find(s=>s.kind==="video"), b=output.media.streams.find(s=>s.kind==="video");
  if(!a||!b||a.codec!=="vp8"||b.codec!=="vp8"||a.decodedFrameCount!==observations.length||b.decodedFrameCount!==observations.length) throw new Error("Native video decoded frame count mismatch");
  const input=source.frames.filter(f=>f.streamIndex===0), dest=output.frames.filter(f=>f.streamIndex===0);
  if(input.length!==observations.length||dest.length!==input.length)throw new Error("Native decoded video identity missing");
  const first=observations[0]?.timestampUs;
  if(first===undefined)throw new Error("Native video ledger empty");
  return input.map((frame,i)=>{
    const next=dest[i]!, observation=observations[i]!;
    if(frame.sha256!==next.sha256||frame.size!==next.size)throw new Error("Native decoded video identity mismatch");
    const expected=BigInt(observation.timestampUs-first)*BigInt(frame.timebase.denominator);
    if(BigInt(frame.pts)*BigInt(frame.timebase.numerator)*1000000n!==expected)throw new Error("Native IVF timestamp/ledger mismatch");
    // WebM rounds PTS to its measured output tick. Preserve that measured map, with a tick bound.
    const inputEnd=input[i+1]?.pts ?? frame.pts+frame.duration;
    const outputEnd=dest[i+1]?.pts ?? next.pts+next.duration;
    if(inputEnd<=frame.pts||outputEnd<=next.pts)throw new Error("Native held-frame interval invalid");
    return {sourceStreamId:a.streamId,destinationStreamId:b.streamId,sourceStartPts:frame.pts,sourceEndPts:inputEnd,destinationStartPts:next.pts,destinationEndPts:outputEnd,uncertaintyUs:Math.ceil(1e6*next.timebase.numerator/next.timebase.denominator)};
  });
}
/** Pure map composition does not confer authority. Exact boundaries, no extrapolation/gap filling. */
export function composeNativeIntervalMaps(first: readonly DecodedIntervalMap[], second: readonly DecodedIntervalMap[]): DecodedIntervalMap[] {
  if(!first.length||!second.length||first.length>1_000_000||second.length>1_000_000)throw new Error("Bounded native interval maps required");
  const grouped=new Map<string,DecodedIntervalMap[]>();
  for(const b of second){
    if(!Number.isFinite(b.uncertaintyUs)||b.uncertaintyUs<0||!(b.sourceEndPts>b.sourceStartPts)||!(b.destinationEndPts>b.destinationStartPts))throw new Error("Invalid native destination interval");
    const values=grouped.get(b.sourceStreamId)??[];values.push(b);grouped.set(b.sourceStreamId,values);
  }
  for(const values of grouped.values()){values.sort((a,b)=>a.sourceStartPts-b.sourceStartPts);for(let i=1;i<values.length;i++)if(values[i]!.sourceStartPts<values[i-1]!.sourceEndPts)throw new Error("Native composition has overlap");}
  const result: DecodedIntervalMap[]=[];
  for(const a of first){
    if(!Number.isFinite(a.uncertaintyUs)||a.uncertaintyUs<0||!(a.sourceEndPts>a.sourceStartPts)||!(a.destinationEndPts>a.destinationStartPts))throw new Error("Invalid native source interval");
    let cursor=a.destinationStartPts;
    const values=grouped.get(a.destinationStreamId)??[];
    let low=0,high=values.length;while(low<high){const mid=(low+high)>>>1;if(values[mid]!.sourceEndPts<=cursor)low=mid+1;else high=mid;}
    for(let i=low;i<values.length&&values[i]!.sourceStartPts<a.destinationEndPts;i++){
      const b=values[i]!;
      const start=Math.max(a.destinationStartPts,b.sourceStartPts),end=Math.min(a.destinationEndPts,b.sourceEndPts);if(end<=start)continue;
      if(start!==cursor)throw new Error("Native composition has gap or overlap");
      const ratio=(a.sourceEndPts-a.sourceStartPts)/(a.destinationEndPts-a.destinationStartPts), outRatio=(b.destinationEndPts-b.destinationStartPts)/(b.sourceEndPts-b.sourceStartPts);
      result.push({sourceStreamId:a.sourceStreamId,destinationStreamId:b.destinationStreamId,sourceStartPts:a.sourceStartPts+(start-a.destinationStartPts)*ratio,sourceEndPts:a.sourceStartPts+(end-a.destinationStartPts)*ratio,destinationStartPts:b.destinationStartPts+(start-b.sourceStartPts)*outRatio,destinationEndPts:b.destinationStartPts+(end-b.sourceStartPts)*outRatio,uncertaintyUs:a.uncertaintyUs+b.uncertaintyUs});
      cursor=end;
    }
    if(cursor!==a.destinationEndPts)throw new Error("Native composition has gap or overlap");
  }
  return result;
}
/** Lossless extraction/remux only: changed PCM/priming/resampling requires its own measured mapping. */
export function proveNativeAudioTransform(source: NativeDecodedProbe, output: NativeDecodedProbe): DecodedIntervalMap {
  requireNativeDecodedProbe(source);requireNativeDecodedProbe(output);
  const a=source.media.streams.find(s=>s.kind==="audio"),b=output.media.streams.find(s=>s.kind==="audio");
  if(!a||!b||!source.audioPcmSha256||source.audioPcmSha256!==output.audioPcmSha256||a.sampleRate!==b.sampleRate||a.decodedSampleCount!==b.decodedSampleCount)throw new Error("Native audio decoded identity mismatch");
  if([a,b].some(s=>s.codecPrimingSamples!==0||s.skipSamples!==0||s.discardPaddingSamples!==0))throw new Error("Native audio priming/skip/discard mapping unavailable");
  return {sourceStreamId:a.streamId,destinationStreamId:b.streamId,sourceStartPts:a.firstPts,sourceEndPts:a.firstPts+a.decodedSampleCount!*a.timebase.denominator/(a.sampleRate!*a.timebase.numerator),destinationStartPts:b.firstPts,destinationEndPts:b.firstPts+b.decodedSampleCount!*b.timebase.denominator/(b.sampleRate!*b.timebase.numerator),uncertaintyUs:0};
}
export async function requireNativeFinalizedMedia(value: NativeFinalizedMedia): Promise<NativeFinalizedMedia> {
  if(!value||!finalized.has(value))throw new Error("Native finalizer capability required");
  await verifyClosedNativeSpool(value.spool);requireNativeDecodedProbe(value.sourceVideo);requireNativeDecodedProbe(value.video);requireNativeDecodedProbe(value.selectedAudio);return value;
}
/** Re-probe retained bytes using server-selected binaries. Persisted decoder JSON/argv is ignored.
 * This issues decoded identity only; actual host-clock qualification is a separate verifier. */
export async function reproveArchivedNativeMedia(admission: NativeArchiveAdmission, options: NativeDecoderOptions): Promise<NativeFinalizedMedia> {
  const { directory, manifest } = await requireNativeArchiveAdmission(admission);
  const spool = await rehydrateNativeSpool(admission);
  const sourceVideo = probeNativeMedia(spool.video.path, options);
  const selectedAudio = probeNativeMedia(path.join(directory, "selected-provider.wav"), options);
  const video = probeNativeMedia(path.join(directory, "playback.webm"), options);
  for (const probe of [sourceVideo, selectedAudio, video]) {
    if (probe.decoder.sha256 !== manifest.decoderSha256 || probe.inspector.sha256 !== manifest.inspectorSha256) throw new Error("Archived native decoder identity changed");
  }
  validateNativeSelectedAudio(spool, selectedAudio);
  if (video.media.streams.length !== 2) throw new Error("Archived native playback stream mismatch");
  const ledger = await readNativeSpoolLedger(spool);
  const intervalMap = Object.freeze(nativeVideoIntervalMap(sourceVideo, video, ledger.video).map(map => Object.freeze(map)));
  await requireNativeArchiveAdmission(admission); await verifyClosedNativeSpool(spool);
  const result: NativeFinalizedMedia = Object.freeze({ spool, sourceVideo, selectedAudio, video,
    videoTransform: Object.freeze({ schema: "native-tab-clock/1", identity: spool.identity, transformId: randomUUID(),
      inputs: Object.freeze([sourceVideo.media]), output: video.media, decoder: video.decoder, intervalMap, uncertainty: unknownUncertainty, completeDecode: true }),
    mux: Object.freeze({ path: sourceVideo.decoder.path, sha256: sourceVideo.decoder.sha256, argv: Object.freeze([]) }),
    canonicalAudio: Object.freeze({ path: selectedAudio.media.file.path, sha256: selectedAudio.media.file.sha256,
      pcmSha256: spool.audio.sha256, sampleRate: spool.sampleRate, sampleCount: spool.audioSampleCount,
      firstSourceSampleIndex: spool.firstAudioSampleIndex, firstDecodedPts: 0, canonicalStartSeconds: 0 }) });
  finalized.add(result);
  return requireNativeFinalizedMedia(result);
}
export async function finalizeNativeMedia(capability: ClosedNativeSpool, options: NativeFinalizeOptions): Promise<NativeFinalizedMedia> {
  const spool=readClosedNativeSpool(capability);await verifyClosedNativeSpool(spool);
  positive(options.maxTotalBytes,"total reservation");positive(options.maxMuxBytes,"mux reservation");
  if(!Number.isSafeInteger(options.playbackAudioOffsetUs)||Math.abs(options.playbackAudioOffsetUs)>4*3600*1e6)throw new Error("Invalid playback offset");
  const rawBytes=spool.video.byteLength+spool.audio.byteLength+spool.ledger.byteLength;
  if(rawBytes+spool.audio.byteLength+44+options.maxMuxBytes>options.maxTotalBytes)throw new Error("Native finalization exceeds total spool reservation");
  const header=nativeWavHeader(spool.audioSampleCount,spool.sampleRate);
  if(spool.audio.byteLength!==spool.audioSampleCount*2)throw new Error("Native PCM sample/byte mismatch");
  const directory=path.join(path.dirname(spool.video.path),`.native-finalize-${randomUUID()}`);
  mkdirSync(directory,{mode:0o700});const owned=lstatSync(directory,{bigint:true});
  const requireOwned=()=>{const s=lstatSync(directory,{bigint:true});if(s.isSymbolicLink()||!s.isDirectory()||s.ino!==owned.ino||s.dev!==owned.dev)throw new Error("Native finalizer directory changed");};
  let succeeded=false;
  try{
    const selected=path.join(directory,"selected-provider.wav"),video=path.join(directory,"playback.webm");
    const input=openSync(spool.audio.path,"r"),output=openSync(selected,"wx",0o600),buffer=Buffer.alloc(64*1024);
    try{writeAll(output,header);let copied=0;for(;;){const n=readSync(input,buffer,0,buffer.length,null);if(!n)break;copied+=n;if(copied>spool.audio.byteLength)throw new Error("Native PCM grew");writeAll(output,buffer.subarray(0,n));}if(copied!==spool.audio.byteLength)throw new Error("Native PCM truncated");}finally{closeSync(input);closeSync(output);}
    const selectedAudio=probeNativeMedia(selected,options),audio=selectedAudio.media.streams.find(s=>s.kind==="audio");
    validateNativeSelectedAudio(spool,selectedAudio);
    const sourceVideo=probeNativeMedia(spool.video.path,options),ledger=await readNativeSpoolLedger(spool);
    requireOwned();
    const argv=["-n","-nostdin","-hide_banner","-loglevel","error","-xerror","-err_detect","explode","-threads","1","-protocol_whitelist","file,pipe","-format_whitelist","ivf","-copyts","-i",spool.video.path,"-itsoffset",(options.playbackAudioOffsetUs/1e6).toFixed(6),"-protocol_whitelist","file,pipe","-format_whitelist","wav","-i",selected,"-map","0:v:0","-map","1:a:0","-map_metadata","-1","-c:v","copy","-c:a","libopus","-b:a","64000","-threads","1","-fs",String(options.maxMuxBytes),"-f","webm",video];
    const mux=spawnSync(options.ffmpegPath,argv,{encoding:"utf8",timeout:600_000,killSignal:"SIGKILL",windowsHide:true,maxBuffer:2*1024**2});
    if(mux.error||mux.status!==0||mux.stderr.trim())throw new Error("Native file mux failed");
    const decoded=probeNativeMedia(video,options);
    if(decoded.media.file.byteLength>options.maxMuxBytes||decoded.media.streams.length!==2)throw new Error("Native mux outside reservation/stream bounds");
    const intervalMap=Object.freeze(nativeVideoIntervalMap(sourceVideo,decoded,ledger.video).map(m=>Object.freeze(m)));
    await verifyClosedNativeSpool(spool);requireNativeDecodedProbe(sourceVideo);requireNativeDecodedProbe(selectedAudio);requireNativeDecodedProbe(decoded);requireOwned();
    const videoTransform:DecodedTransformReceipt=Object.freeze({schema:"native-tab-clock/1",identity:spool.identity,transformId:randomUUID(),inputs:Object.freeze([sourceVideo.media]),output:decoded.media,decoder:decoded.decoder,intervalMap,uncertainty:unknownUncertainty,completeDecode:true});
    const result:NativeFinalizedMedia=Object.freeze({spool,video:decoded,selectedAudio,sourceVideo,videoTransform,mux:Object.freeze({path:sourceVideo.decoder.path,sha256:sourceVideo.decoder.sha256,argv:Object.freeze(argv)}),canonicalAudio:Object.freeze({path:selected,sha256:selectedAudio.media.file.sha256,pcmSha256:spool.audio.sha256,sampleRate:spool.sampleRate,sampleCount:spool.audioSampleCount,firstSourceSampleIndex:spool.firstAudioSampleIndex,firstDecodedPts:audio!.firstPts,canonicalStartSeconds:0})});
    finalized.add(result);succeeded=true;return result;
  }finally{if(!succeeded){requireOwned();rmSync(directory,{recursive:true,force:true});}}
}
