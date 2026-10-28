import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { composeNativeIntervalMaps, finalizeNativeMedia, nativeVideoIntervalMap, nativeWavHeader, requireNativeFinalizedMedia, validateNativeSelectedAudio, type NativeFinalizedMedia } from "./native-media-finalize.js";
import { createNativeSpoolReceiver } from "./native-spool.js";
import type { NativeDecodedProbe } from "./native-media-probe.js";
import type { ClosedNativeSpool, DecodedIntervalMap, NativeCaptureIdentity, ProducerVideoObservation } from "./native-media-types.js";
const identity:NativeCaptureIdentity={schema:"native-tab-clock/1",tenantId:"synthetic",sessionId:"synthetic",captureGeneration:"fixture-generation",captureInstanceId:"fixture-capture",samplerInstanceId:"fixture-sampler",platform:"synthetic",browserBuild:"synthetic",extensionAssetSha256:"a".repeat(64),clockInstanceId:"fixture-clock"};
const spoolFacts={audioSampleCount:1000,sampleRate:48000,audio:{path:"/synthetic/source.pcm",sha256:"c".repeat(64),byteLength:2000}};
function audioProbe():{-readonly [K in keyof NativeDecodedProbe]:NativeDecodedProbe[K]}{return {media:{file:{path:"/synthetic/selected.wav",sha256:"d".repeat(64),byteLength:2044},streams:[{streamId:"wav:0",streamIndex:0,kind:"audio",codec:"pcm_s16le",timebase:{numerator:1,denominator:48000},firstPts:0,lastPts:0,decodedFrameCount:1,decodedSampleCount:1000,sampleRate:48000,codecPrimingSamples:0,skipSamples:0,discardPaddingSamples:0}]},audioPcmSha256:"c".repeat(64),frames:[],decoder:{path:"/synthetic/ffmpeg",sha256:"e".repeat(64),version:"synthetic",argv:[]},inspector:{path:"/synthetic/ffprobe",sha256:"f".repeat(64),version:"synthetic",argv:[]}};}
const map=(a:string,b:string,x:number,y:number,u:number,v:number):DecodedIntervalMap=>({sourceStreamId:a,destinationStreamId:b,sourceStartPts:x,sourceEndPts:y,destinationStartPts:u,destinationEndPts:v,uncertaintyUs:1});
test("bounded RIFF header declares exact mono s16le sample count without priming",()=>{
  const h=nativeWavHeader(1000,48000);assert.equal(h.toString("ascii",0,4),"RIFF");assert.equal(h.readUInt32LE(40),2000);assert.equal(h.readUInt32LE(24),48000);assert.equal(h.readUInt16LE(22),1);assert.throws(()=>nativeWavHeader(2**32,48000),/RIFF bounds/);
});
test("selected provider audio canonical zero requires exact decoded PCM identity and known zero priming",()=>{
  validateNativeSelectedAudio(spoolFacts,audioProbe());
  for(const field of ["codecPrimingSamples","skipSamples","discardPaddingSamples"] as const){const v=audioProbe();(v.media.streams[0] as unknown as Record<string,unknown>)[field]=null;assert.throws(()=>validateNativeSelectedAudio(spoolFacts,v),/first-sample identity/);}
  const wrong=audioProbe();wrong.audioPcmSha256="f".repeat(64);assert.throws(()=>validateNativeSelectedAudio(spoolFacts,wrong),/first-sample identity/);
  const shifted=audioProbe();(shifted.media.streams[0] as unknown as Record<string,unknown>).firstPts=137;assert.throws(()=>validateNativeSelectedAudio(spoolFacts,shifted),/first-sample identity/);
});
test("137ms extraction shift and nonzero origins compose before canonical transcript origin",()=>{
  const composed=composeNativeIntervalMaps([map("producer","mux",7000000,8000000,0,1000000)],[map("mux","provider",0,1000000,-137000,863000)]);
  assert.deepEqual(composed,[{...map("producer","provider",7000000,8000000,-137000,863000),uncertaintyUs:2}]);
  assert.throws(()=>composeNativeIntervalMaps([map("a","b",0,100,0,100)],[map("b","c",0,40,0,40),map("b","c",50,100,50,100)]),/gap/);
  assert.throws(()=>composeNativeIntervalMaps([map("a","b",0,100,0,100)],[map("b","c",0,60,0,60),map("b","c",40,80,40,80)]),/overlap/);
});
test("synthetic decoded video hashes map irregular microsecond IVF PTS to actual WebM ticks",()=>{
  const source=audioProbe(),output=audioProbe();
  const videoStream={...source.media.streams[0]!,kind:"video" as const,codec:"vp8",streamId:"ivf:0",decodedFrameCount:2,decodedSampleCount:null,sampleRate:null,timebase:{numerator:1,denominator:1000000}};
  source.media={...source.media,streams:[videoStream]};output.media={...output.media,streams:[{...videoStream,streamId:"webm:0",timebase:{numerator:1,denominator:1000}}]};
  source.frames=[{streamIndex:0,pts:0,duration:200500,size:100,sha256:"a".repeat(64),timebase:videoStream.timebase},{streamIndex:0,pts:200500,duration:1,size:100,sha256:"b".repeat(64),timebase:videoStream.timebase}];output.frames=source.frames.map((f,i)=>({...f,pts:i?201:0,duration:i?1:201,timebase:{numerator:1,denominator:1000}}));
  const observations=[7000000,7200500].map((timestampUs,i):ProducerVideoObservation=>({frameId:`f${i}`,sourceTimestampUs:null,timestampUs,copyBeforeUs:timestampUs,copyAfterUs:timestampUs,encodedType:i?"delta":"key",encodedByteLength:100,chunkSha256:"c".repeat(64)}));
  const intervals=nativeVideoIntervalMap(source,output,observations);assert.equal(intervals[1]!.sourceStartPts,200500);assert.equal(intervals[1]!.destinationStartPts,201);assert.equal(intervals[0]!.uncertaintyUs,1000);
  output.frames=[{...output.frames[0]!,sha256:"f".repeat(64)},output.frames[1]!];assert.throws(()=>nativeVideoIntervalMap(source,output,observations),/identity mismatch/);
});
test("forged closed spool/finalization JSON refuses before any command, path read or allocation",async()=>{
  await assert.rejects(finalizeNativeMedia({complete:true,poisoned:false} as ClosedNativeSpool,{ffmpegPath:"/nonexistent",ffprobePath:"/nonexistent",maxTotalBytes:100,maxMuxBytes:10,playbackAudioOffsetUs:0}),/unissued/);
  await assert.rejects(requireNativeFinalizedMedia({} as NativeFinalizedMedia),/capability required/);
});
const ffmpeg=process.env.LKB_NATIVE_TEST_FFMPEG,ffprobe=process.env.LKB_NATIVE_TEST_FFPROBE;
test("broker-only real synthetic VP8+PCM spool -> WebM decoded identities + exact WAV canonical zero",{skip:!ffmpeg||!ffprobe,timeout:120000},async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"native-finalize-synthetic-"));try{
    const ivf=path.join(directory,"fixture.ivf");
    const encoded=spawnSync(ffmpeg!,["-n","-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=32x32:rate=5:duration=0.4","-frames:v","2","-c:v","libvpx","-threads","1","-f","ivf",ivf],{encoding:"utf8",timeout:30000,windowsHide:true});assert.equal(encoded.status,0,encoded.stderr);
    const bytes=readFileSync(ivf),chunks:Buffer[]=[];for(let offset=32;offset<bytes.length;){const n=bytes.readUInt32LE(offset);chunks.push(bytes.subarray(offset+12,offset+12+n));offset+=12+n;}assert.equal(chunks.length,2);
    const receiver=await createNativeSpoolReceiver({directory:path.join(directory,"spool"),identity,width:32,height:32,sampleRate:48000,maxBytes:1000000,maxChunkBytes:100000,maxPendingBytes:200000});
    for(let i=0;i<chunks.length;i++){const timestampUs=7000000+i*200000,observation={frameId:`frame-${i}`,sourceTimestampUs:null,timestampUs,copyBeforeUs:timestampUs-1,copyAfterUs:timestampUs+1};await receiver.observeVideo(observation);await receiver.appendVideo({sequence:i,identity,observation:{...observation,encodedType:(chunks[i]![0]!&1)?"delta":"key",encodedByteLength:chunks[i]!.length},bytes:chunks[i]!});}
    const pcm=Buffer.alloc(19200*2);pcm.writeInt16LE(20000,731*2);pcm.writeInt16LE(-18000,10000*2);
    await receiver.appendAudio({sequence:2,identity,observation:{blockId:"a0",startFrame:3552,frameCount:19200,sampleRate:48000,channels:1,format:"s16le",byteLength:pcm.length},bytes:pcm});
    const spool=await receiver.close(),result=await finalizeNativeMedia(spool,{ffmpegPath:ffmpeg!,ffprobePath:ffprobe!,maxTotalBytes:2000000,maxMuxBytes:1000000,playbackAudioOffsetUs:73000});
    assert.equal(result.canonicalAudio.firstSourceSampleIndex,3552);assert.equal(result.canonicalAudio.canonicalStartSeconds,0);assert.equal(result.canonicalAudio.sampleCount,19200);assert.equal(result.selectedAudio.audioPcmSha256,spool.audio.sha256);assert.equal(result.videoTransform.intervalMap.length,2);assert.equal(result.video.media.streams.find(s=>s.kind==="video")!.decodedFrameCount,2);assert.equal((await requireNativeFinalizedMedia(result)),result);
    // Fixture receipt remains unqualified for platform latency/host-clock issuance.
    assert.equal(result.videoTransform.uncertainty.audioOutputEstimationBoundUs,null);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
