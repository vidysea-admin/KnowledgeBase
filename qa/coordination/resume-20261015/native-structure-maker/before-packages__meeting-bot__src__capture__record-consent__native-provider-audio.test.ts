import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalPrivateSampleIntervals,prepareNativeProviderAudio,requireNativeProviderAudio,verifyCanonicalNativeWav,type NativeProviderAudio } from "./native-provider-audio.js";
import { nativeWavHeader,finalizeNativeMedia,type NativeFinalizedMedia } from "../native-media-finalize.js";
import { createNativeSpoolReceiver } from "../native-spool.js";
import { createNativeCaptureClockQualifier,type QualifiedCaptureClock } from "../tiles/native-measurement.js";
import { createRecordConsent } from "./context.js";
import { writeRecordConsent } from "./receipt-store.js";
import { runPrivateCaptureProvider } from "./provider-input.js";
import { prepareRecordFinalizerInputForTest } from "./finalizer-input.js";
import type { NativeCaptureIdentity } from "../native-media-types.js";
const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
test("native privacy floor/ceil conservatively preserve partial samples, overlap and EOF",()=>{
  const windows=canonicalPrivateSampleIntervals([{tStart:0.2,tEnd:0.3},{tStart:0.31,tEnd:4}],1000,{earliest:1000000.25,latest:1000000.75},0.25,10,20);
  assert.deepEqual(windows,[{startSample:0,endSample:20}]);
  assert.deepEqual(canonicalPrivateSampleIntervals([{tStart:1,tEnd:1.1}],1000,{earliest:1000000,latest:1000000},0,10,20),[{startSample:8,endSample:13}]);
  assert.throws(()=>canonicalPrivateSampleIntervals([{tStart:1,tEnd:2}],1000,{earliest:NaN,latest:1},0,10,20),/clock domain/);
});
test("native canonical mask does not pad short EOF or shift sample zero for a late wall origin",()=>{
  assert.deepEqual(canonicalPrivateSampleIntervals([{tStart:2,tEnd:3}],1000,{earliest:2000000,latest:2000000},0,48000,96000),[{startSample:43199,endSample:96000}]);
  assert.deepEqual(canonicalPrivateSampleIntervals([{tStart:4,tEnd:5}],1000,{earliest:2000000,latest:2000000},0,48000,96000),[]);
});
test("exact canonical WAV readback refuses trailing, truncated, wrong PCM and forged format",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"native-wav-readback-"));try{
    const file=path.join(directory,"selected.wav"),pcm=Buffer.from([1,0,2,0]),bytes=Buffer.concat([nativeWavHeader(2,48000),pcm]);
    const expected={sha256:sha(bytes),pcmSha256:sha(pcm),sampleRate:48000,sampleCount:2};writeFileSync(file,bytes);verifyCanonicalNativeWav(file,expected);
    for(const changed of [Buffer.concat([bytes,Buffer.from([0])]),bytes.subarray(0,-1),Buffer.from(bytes)]){if(changed.length===bytes.length)changed[22]=2;writeFileSync(file,changed);assert.throws(()=>verifyCanonicalNativeWav(file,{...expected,sha256:sha(changed)}));}
    writeFileSync(file,bytes);assert.throws(()=>verifyCanonicalNativeWav(file,{...expected,pcmSha256:"a".repeat(64)}),/PCM/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test("native JSON flags and copied mask receipts cannot manufacture provider capability",async()=>{
  await assert.rejects(prepareNativeProviderAudio({media:{} as NativeFinalizedMedia,recordDir:"/unused",owner:{tenantId:"tenant",sessionId:"session"},maxTotalBytes:1000}),/capability/);
  await assert.rejects(requireNativeProviderAudio({audioPath:"secret",maskReceiptSha256:"a".repeat(64)} as NativeProviderAudio),/capability/);
});
const ffmpeg=process.env.LKB_NATIVE_TEST_FFMPEG,ffprobe=process.env.LKB_NATIVE_TEST_FFPROBE;
test("broker native selected/public and qualified masked PCM reach provider with canonical zero; stale/forged/foreign refuse",{skip:!ffmpeg||!ffprobe,timeout:180000},async()=>{
  const stage=(name:string)=>console.log(`[native-privacy-phase] ${name} ${Date.now()}`);
  stage("start");
  const directory=mkdtempSync(path.join(tmpdir(),"native-private-provider-"));try{
    const owner={tenantId:"synthetic",sessionId:"capture",meetingUrl:"https://example.invalid/meeting"};
    const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:"fixture",LKB_CAPTURE_APPROVED_BY:"fixture",LKB_CAPTURE_APPROVAL_REF:"fixture"},new Date(1000));receipt.mediaStartedAt=11000;writeRecordConsent(directory,receipt);
    const identity:NativeCaptureIdentity={schema:"native-tab-clock/1",tenantId:owner.tenantId,sessionId:owner.sessionId,captureGeneration:receipt.generation!,captureInstanceId:"fixture-capture",samplerInstanceId:"fixture-sampler",platform:"meet",browserBuild:"synthetic",extensionAssetSha256:"a".repeat(64),clockInstanceId:"fixture-clock"};
    const ivf=path.join(directory,"fixture.ivf"),encoded=spawnSync(ffmpeg!,["-n","-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=32x32:rate=5:duration=0.4","-frames:v","2","-c:v","libvpx","-threads","1","-f","ivf",ivf],{encoding:"utf8",timeout:30000,windowsHide:true});assert.equal(encoded.status,0,encoded.stderr);
    const bytes=readFileSync(ivf),chunks:Buffer[]=[];for(let offset=32;offset<bytes.length;){const n=bytes.readUInt32LE(offset);chunks.push(bytes.subarray(offset+12,offset+12+n));offset+=12+n;}
    const receiver=await createNativeSpoolReceiver({directory:path.join(directory,"spool"),identity,width:32,height:32,sampleRate:48000,maxBytes:1000000,maxChunkBytes:200000,maxPendingBytes:200000});
    let sequence=0;for(const [i,chunk]of chunks.entries()){const timestampUs=1000000+i*200000,observation={frameId:`f${i}`,sourceTimestampUs:null,timestampUs,copyBeforeUs:timestampUs-1,copyAfterUs:timestampUs+1};await receiver.observeVideo(observation);await receiver.appendVideo({sequence:sequence++,identity,observation:{...observation,encodedType:(chunk[0]!&1)?"delta":"key",encodedByteLength:chunk.length},bytes:chunk});}
    const pcm=Buffer.alloc(96000*2);for(let i=0;i<96000;i++)pcm.writeInt16LE(10000,i*2);
    await receiver.appendAudio({sequence:sequence++,identity,observation:{blockId:"audio",startFrame:0,frameCount:96000,sampleRate:48000,channels:1,format:"s16le",byteLength:pcm.length},bytes:pcm});
    for(const i of [0,1])await receiver.appendClockPair({sequence:sequence++,identity,kind:"audio",pair:{clockInstanceId:identity.clockInstanceId,beforePerformanceUs:1000000+i*2000000,afterPerformanceUs:1000000+i*2000000,contextTime:i*2,performanceTime:1000+i*2000,state:"running",sampleRate:48000}});
    for(const i of [0,1])await receiver.appendClockPair({sequence:sequence++,identity,kind:"host",pair:{browser:{clockInstanceId:identity.clockInstanceId,beforeMonotonicUs:999000+i*2000000,afterMonotonicUs:1001000+i*2000000,epochUs:11000000+i*2000000},serverRequest:{clockInstanceId:"server",beforeMonotonicUs:i*2000000,afterMonotonicUs:i*2000000,epochUs:10999000+i*2000000},serverResponse:{clockInstanceId:"server",beforeMonotonicUs:2000+i*2000000,afterMonotonicUs:2000+i*2000000,epochUs:11001000+i*2000000}}});
    const media=await finalizeNativeMedia(await receiver.close(),{ffmpegPath:ffmpeg!,ffprobePath:ffprobe!,maxTotalBytes:3000000,maxMuxBytes:1000000,playbackAudioOffsetUs:0}),options={media,recordDir:directory,owner,maxTotalBytes:3000000};
    stage("finalized");
    const publicAudio=await prepareNativeProviderAudio(options);assert.equal(publicAudio.durationSec,2);assert.equal(publicAudio.canonicalStartSeconds,0);assert.equal(publicAudio.audioPath,media.canonicalAudio.path);
    await assert.rejects(prepareNativeProviderAudio({...options,owner:{...owner,tenantId:"foreign"}}));
    let calls=0;const dispatch=async(cap:NativeProviderAudio)=>runPrivateCaptureProvider({receipt,owner,duration:cap.durationSec,audioPath:cap.audioPath,originalAudioPath:cap.originalAudioPath,sanitizedSha256:cap.sha256,nativeAudio:cap},async()=>++calls);
    assert.equal(await dispatch(publicAudio),1);
    stage("public-dispatched");
    receipt.privateWindows=[{tStart:0.8,tEnd:1.0}];writeRecordConsent(directory,receipt);
    await assert.rejects(dispatch(publicAudio),/binding|changed/);await assert.rejects(prepareNativeProviderAudio(options),/qualified/);
    await assert.rejects(prepareNativeProviderAudio({...options,canonicalClock:{} as QualifiedCaptureClock}),/Qualified/);
    const qualifier=createNativeCaptureClockQualifier({verifyPlatformQualification:async()=>({schema:"native-platform-measurement/1",evidenceKind:"native",identity,measurementCorpusSha256:"f".repeat(64),hostId:"synthetic-host",serverClockInstanceId:"server",samplerZeroEpochSec:{earliest:11,latest:11},quantizationUs:10,audioOutputEstimationBoundUs:0,samplerObservationLagBoundUs:0,sourceObservationLagBoundUs:0,driftBoundPpm:0})});
    const canonicalClock=await qualifier(media);assert.ok(canonicalClock);
    stage("qualified");
    const masked=await prepareNativeProviderAudio({...options,canonicalClock});assert.notEqual(masked.audioPath,publicAudio.audioPath);assert.equal(masked.sampleCount,96000);assert.equal(masked.durationSec,2);
    stage("masked");
    const maskedPcm=readFileSync(masked.audioPath).subarray(44);assert.equal(maskedPcm.readInt16LE(0),10000);assert.equal(maskedPcm.readInt16LE(43200*2),0);assert.equal(maskedPcm.readInt16LE(95999*2),10000);
    const maskedInterval=masked.maskIntervals[0]!;assert.equal(maskedPcm.readInt16LE((maskedInterval.startSample-1)*2),10000);assert.equal(maskedPcm.readInt16LE(maskedInterval.startSample*2),0);assert.equal(maskedPcm.readInt16LE((maskedInterval.endSample-1)*2),0);assert.equal(maskedPcm.readInt16LE(maskedInterval.endSample*2),10000);
    assert.equal(await dispatch(masked),2);await assert.rejects(dispatch({...masked}),/capability/);
    stage("masked-dispatched");
    await assert.rejects(runPrivateCaptureProvider({receipt:{...receipt,generation:"11111111-1111-4111-8111-111111111111"},owner,duration:masked.durationSec,audioPath:masked.audioPath,originalAudioPath:masked.originalAudioPath,sanitizedSha256:masked.sha256,nativeAudio:masked},async()=>++calls),/binding/);
    let normalizerCalls=0;
    const prepared=await prepareRecordFinalizerInputForTest({video:media.video.media.file.path,recordDir:directory,owner,duration:3,nativeMedia:media,canonicalClock,nativeAudio:masked},(file,normalizerOptions)=>{
      normalizerCalls++;assert.equal(normalizerOptions.requirePrivacyMask,true);
      assert.ok(normalizerOptions.privateWindows!.some(w=>w.start<=0.2&&w.end===3),"last displayed frame must be black through physical audio tail");
      const output=path.join(path.dirname(file),"synthetic-masked-video.webm");writeFileSync(output,readFileSync(file));return output;
    });assert.equal(normalizerCalls,1);assert.equal(prepared.audioPrivacyWindows[0]!.start,masked.maskIntervals[0]!.startSample/48000);
    stage("held-frame-verified");
    await assert.rejects(prepareRecordFinalizerInputForTest({video:media.video.media.file.path,recordDir:directory,owner,duration:3,nativeMedia:media},()=>{throw new Error("must not normalize without clock");}),/qualified/);
    await assert.rejects(prepareNativeProviderAudio({...options,canonicalClock,maxTotalBytes:1}),/bounds|quota/);
    writeFileSync(masked.audioPath,readFileSync(publicAudio.audioPath));await assert.rejects(dispatch(masked),/identity|changed/);assert.equal(calls,2);
    stage("complete");
  }finally{rmSync(directory,{recursive:true,force:true});}
});
