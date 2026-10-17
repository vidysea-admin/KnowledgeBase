import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { nativeCaptureSettings, nativePlaybackOffsetUs } from "./native-capture-runtime.js";
import type { AudioClockPair, ClosedNativeSpool } from "./native-media-types.js";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createNativeCaptureRuntime } from "./native-capture-runtime.js";
import { createNativeSpoolReceiver } from "./native-spool.js";
import { writeRecordConsent } from "../record-consent/receipt-store.js";
import { finalizeRecordingWith } from "../record-finalize.js";
import { runRecord } from "../record-commands.js";
import type { createTabBrowserDeps } from "../tab-browser.js";
import { createTelegramNotifier } from "../notify/telegram-alerts.js";

const env={LKB_NATIVE_MAX_TOTAL_BYTES:"10000000",LKB_NATIVE_MAX_SPOOL_BYTES:"1000000",LKB_NATIVE_MAX_MUX_BYTES:"2000000",LKB_NATIVE_FINALIZE_TIMEOUT_MS:"120000",
  LKB_NATIVE_FFMPEG:path.resolve("fixture-ffmpeg"),LKB_NATIVE_FFPROBE:path.resolve("fixture-ffprobe"),LKB_BROWSER_EXECUTABLE:path.resolve("fixture-browser")};
test("legacy invocation ignores native configuration, including malformed native environment",()=>{
  assert.equal(nativeCaptureSettings([],{},"tab"),undefined);
  assert.equal(nativeCaptureSettings([],{...env,LKB_NATIVE_MAX_TOTAL_BYTES:"Infinity",LKB_NATIVE_CAPTURE:"1"},"tab"),undefined);
});
test("native selection requires exactly one explicit tab flag",()=>{
  assert.throws(()=>nativeCaptureSettings(["--native-tab-clock"],env,"obs"),/tab opt-in/);
  assert.throws(()=>nativeCaptureSettings(["--native-tab-clock","--native-tab-clock"],env,"tab"),/tab opt-in/);
  const actual=nativeCaptureSettings(["--native-tab-clock"],env,"tab")!;
  assert.equal(actual.maxTotalBytes,10000000);assert.equal(actual.browserExecutable,env.LKB_BROWSER_EXECUTABLE);assert.ok(Object.isFrozen(actual));
});
test("native quotas reserve both retained and published playback and reject unsafe executable selection",()=>{
  for(const bytes of [undefined,"0","-1","Infinity","1e9","9007199254740992"])
    assert.throws(()=>nativeCaptureSettings(["--native-tab-clock"],{...env,LKB_NATIVE_MAX_TOTAL_BYTES:bytes},"tab"),/reservation/);
  assert.throws(()=>nativeCaptureSettings(["--native-tab-clock"],{...env,LKB_NATIVE_MAX_TOTAL_BYTES:"5000000"},"tab"),/headroom/);
  assert.throws(()=>nativeCaptureSettings(["--native-tab-clock"],{...env,LKB_BROWSER_EXECUTABLE:"chrome"},"tab"),/local native executable/);
  assert.throws(()=>nativeCaptureSettings(["--native-tab-clock"],{...env,LKB_NATIVE_FFMPEG:"\\\\remote\\ffmpeg.exe"},"tab"),/local native executable/);
});
const pair:AudioClockPair={clockInstanceId:"fixture-clock",beforePerformanceUs:7072000,contextTime:0.074,performanceTime:7073,afterPerformanceUs:7074000,state:"running",sampleRate:48000};
test("playback joins nonzero source PCM index to actual output-clock pair instead of message arrival",()=>{
  assert.equal(nativePlaybackOffsetUs({firstAudioSampleIndex:3552,sampleRate:48000,firstVideoTimestampUs:7000000},[pair]),73000);
  assert.equal(nativePlaybackOffsetUs({firstAudioSampleIndex:3552,sampleRate:48000,firstVideoTimestampUs:7200000},[pair]),-127000);
});
test("missing, suspended, rate-mismatched and malformed output clocks never get a guessed offset",()=>{
  const spool={firstAudioSampleIndex:3552,sampleRate:48000,firstVideoTimestampUs:7000000};
  for(const pairs of [[],[{...pair,state:"suspended" as const}],[{...pair,sampleRate:44100}],[{...pair,performanceTime:0}],[{...pair,afterPerformanceUs:0}],[{...pair,contextTime:NaN}]])
    assert.throws(()=>nativePlaybackOffsetUs(spool,pairs),/clock pair/);
});

const ffmpeg=process.env.LKB_NATIVE_TEST_FFMPEG,ffprobe=process.env.LKB_NATIVE_TEST_FFPROBE,browser=process.env.LKB_NATIVE_TEST_BROWSER;
test("broker synthetic actual runRecord reaches server native config, opaque close, awaited playback and canonical WAV",{skip:!ffmpeg||!ffprobe||!browser,timeout:150000},async()=>{
  const root=mkdtempSync(path.join(process.env.LKB_NATIVE_TEST_PRIVATE_DIR??tmpdir(),"native-runrecord-"));
  const configured={...env,LKB_NATIVE_FFMPEG:ffmpeg!,LKB_NATIVE_FFPROBE:ffprobe!,LKB_BROWSER_EXECUTABLE:browser!,LKB_CAPTURE_APPROVED_BY:"Umesh",LKB_CAPTURE_APPROVAL_REF:"synthetic-fixture",LKB_CAPTURE_RECORDED_BY:"synthetic-fixture"};
  const saved=new Map(Object.keys(configured).concat(["LKB_CAPTURE_CONTROL_TOKEN","LKB_CAPTURE_CONTROL_GENERATION"]).map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,configured);delete process.env.LKB_CAPTURE_CONTROL_TOKEN;delete process.env.LKB_CAPTURE_CONTROL_GENERATION;
    const recordDir=path.join(root,"raw","webinars");mkdirSync(recordDir,{recursive:true,mode:0o700});
    const ivf=path.join(recordDir,"fixture.ivf"),encoded=spawnSync(ffmpeg!,["-n","-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=32x32:rate=5:duration=0.4","-frames:v","2","-c:v","libvpx","-threads","1","-f","ivf",ivf],{encoding:"utf8",timeout:30000,windowsHide:true});assert.equal(encoded.status,0,encoded.stderr);
    const bytes=readFileSync(ivf),chunks:Buffer[]=[];for(let offset=32;offset<bytes.length;){const n=bytes.readUInt32LE(offset);chunks.push(bytes.subarray(offset+12,offset+12+n));offset+=12+n;}
    let finishBrowser!:()=>void,finalized="",generation="";const browserExited=new Promise<void>(resolve=>{finishBrowser=resolve;});
    await runRecord(["https://meet.google.com/abc-defg-hij","--until",new Date(Date.now()+60000).toISOString(),"--session-id","synthetic-entry","--tenant","synthetic-owner","--native-tab-clock"],{
      recordDir,profileDir:path.join(root,"profile"),telegram:createTelegramNotifier({token:"",chatId:""}),wait:async()=>{finishBrowser();await Promise.resolve();},
      finalize:async(video)=>{finalized=video;return video;},normalize:()=>{throw new Error("Native entry must not take legacy remux");},
      tab:(onEvent,config)=>{
        assert.ok(config.native);const native=config.native!,identity=native.identity,output=path.join(recordDir,"owned.webm");generation=identity.captureGeneration;
        let spool:ClosedNativeSpool;
        return {deps:{launch:async()=>{
          const receiver=await createNativeSpoolReceiver({directory:`${output}.native`,identity,width:32,height:32,sampleRate:48000,maxBytes:1000000,maxChunkBytes:100000,maxPendingBytes:200000});
          for(let i=0;i<chunks.length;i++){const timestampUs=7000000+i*200000,observation={frameId:`frame-${i}`,sourceTimestampUs:null,timestampUs,copyBeforeUs:timestampUs-1,copyAfterUs:timestampUs+1};await receiver.observeVideo(observation);await receiver.appendVideo({sequence:i,identity,observation:{...observation,encodedType:(chunks[i]![0]!&1)?"delta":"key",encodedByteLength:chunks[i]!.length},bytes:chunks[i]!});}
          await receiver.appendAudio({sequence:2,identity,observation:{blockId:"a0",startFrame:3552,frameCount:19200,sampleRate:48000,channels:1,format:"s16le",byteLength:38400},bytes:Buffer.alloc(38400)});
          await receiver.appendClockPair({sequence:3,identity,kind:"audio",pair:{...pair,clockInstanceId:identity.clockInstanceId}});spool=await receiver.close();
          onEvent("fixture",{event:"capture-started",t:Date.now()/1000});onEvent("fixture",{event:"admitted",t:Date.now()/1000});return {sessionHandle:"fixture",mediaStream:null};
        },stop:async()=>{await native.onClosed(spool,output);}},browserExited:()=>browserExited,outputPath:()=>output,subscribeLevel:()=>()=>{},triggerReload:()=>{},disconnect:async()=>{},persistControlGap:()=>{}} as unknown as ReturnType<typeof createTabBrowserDeps>;
      }});
    assert.equal(finalized,path.join(recordDir,"owned.webm"));
    const receipt=JSON.parse(readFileSync(`${finalized}.native/selected-provider.receipt.json`,"utf8"));
    assert.equal(receipt.identity.captureGeneration,generation);assert.equal(receipt.canonicalAudio.canonicalStartSeconds,0);assert.ok(readFileSync(receipt.canonicalAudio.path).subarray(0,4).equals(Buffer.from("RIFF")));
  }finally{for(const [key,value]of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(root,{recursive:true,force:true});}
});
test("broker synthetic server runtime closes real spool and dispatches exact canonical WAV through actual finalizer guard",{skip:!ffmpeg||!ffprobe||!browser,timeout:150000},async()=>{
  const root=mkdtempSync(path.join(process.env.LKB_NATIVE_TEST_PRIVATE_DIR??tmpdir(),"native-runtime-"));
  try{
    const recordDir=path.join(root,"raw","webinars");mkdirSync(recordDir,{recursive:true,mode:0o700});
    const tenantId="synthetic-owner",sessionId="synthetic-native",generation=randomUUID();
    writeRecordConsent(recordDir,{version:1,tenantId,sessionId,generation,meetingHash:"a".repeat(64),captureMode:"silent",organizerConsent:"unknown",
      consent:{given:false,recordedBy:"synthetic-fixture"},privateWindows:[],operationalApproval:{approvedBy:"Umesh",reference:"synthetic-fixture",appliedAt:"2026-10-15T00:00:00.000Z"}});
    let verified=0;
    const runtime=createNativeCaptureRuntime({settings:{maxTotalBytes:10000000,maxSpoolBytes:1000000,maxMuxBytes:2000000,finalizationTimeoutMs:120000,ffmpegPath:ffmpeg!,ffprobePath:ffprobe!,browserExecutable:browser!},
      recordDir,tenantId,sessionId,platform:"synthetic",extensionDir:fileURLToPath(new URL("../../../py/tab-capture",import.meta.url)),
      verifyPlatformQualification:async(media,ledger)=>{verified++;assert.equal(media.spool.identity.captureGeneration,generation);assert.equal(ledger.audioClockPairs.length,1);return null;}});
    const ivf=path.join(recordDir,"fixture.ivf"),encoded=spawnSync(ffmpeg!,["-n","-nostdin","-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=32x32:rate=5:duration=0.4","-frames:v","2","-c:v","libvpx","-threads","1","-f","ivf",ivf],{encoding:"utf8",timeout:30000,windowsHide:true});
    assert.equal(encoded.status,0,encoded.stderr);
    const identity=runtime.config.identity,output=path.join(recordDir,"owned.webm"),bytes=readFileSync(ivf),chunks:Buffer[]=[];
    for(let offset=32;offset<bytes.length;){const n=bytes.readUInt32LE(offset);chunks.push(bytes.subarray(offset+12,offset+12+n));offset+=12+n;}
    assert.equal(chunks.length,2);
    const receiver=await createNativeSpoolReceiver({directory:`${output}.native`,identity,width:32,height:32,sampleRate:48000,maxBytes:1000000,maxChunkBytes:100000,maxPendingBytes:200000});
    for(let i=0;i<chunks.length;i++){
      const timestampUs=7000000+i*200000,observation={frameId:`frame-${i}`,sourceTimestampUs:null,timestampUs,copyBeforeUs:timestampUs-1,copyAfterUs:timestampUs+1};
      await receiver.observeVideo(observation);await receiver.appendVideo({sequence:i,identity,observation:{...observation,encodedType:(chunks[i]![0]!&1)?"delta":"key",encodedByteLength:chunks[i]!.length},bytes:chunks[i]!});
    }
    const pcm=Buffer.alloc(38400);pcm.writeInt16LE(20000,1462);
    await receiver.appendAudio({sequence:2,identity,observation:{blockId:"a0",startFrame:3552,frameCount:19200,sampleRate:48000,channels:1,format:"s16le",byteLength:pcm.length},bytes:pcm});
    await receiver.appendClockPair({sequence:3,identity,kind:"audio",pair:{...pair,clockInstanceId:identity.clockInstanceId}});
    const spool=await receiver.close();await runtime.config.onClosed(spool,output);
    const result=await runtime.take(output);assert.equal(verified,1);assert.equal(result.canonicalClock,undefined);
    let extracted=0,uploaded="";
    const publicVideo=await finalizeRecordingWith({repoRoot:root,recordDir,tenantId,nativeMedia:result.media,nativeMaxTotalBytes:result.maxTotalBytes,originalVideo:output,
      extractAudio:()=>{extracted++;throw new Error("lossy playback extraction forbidden");},measureVolume:()=>({maxDb:-10,meanDb:-20}),
      runTranscription:(_id,input)=>{uploaded=input.audioPath;writeFileSync(path.join(root,"data","toc-migrated",sessionId,"turns.json"),JSON.stringify([{speakerRef:"fixture",tStart:0,tEnd:0.2,text:"synthetic"}]));},validateTranscription:()=>{}},output,sessionId,"synthetic","synthetic",true,[],createTelegramNotifier({token:"",chatId:""}));
    assert.equal(publicVideo,output);assert.equal(extracted,0);assert.equal(uploaded,result.media.canonicalAudio.path);
    const source=JSON.parse(readFileSync(path.join(root,"data","toc-migrated",sessionId,"source.json"),"utf8"));
    assert.equal(source.captureConsent.generation,generation);assert.ok(source.audioPath.endsWith("selected-provider.wav"));
    await assert.rejects(runtime.config.onClosed(spool,output),/already closed/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
