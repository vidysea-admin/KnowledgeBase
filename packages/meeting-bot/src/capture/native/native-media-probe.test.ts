import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintNativeFile, nativeDecoderVideoTimebaseArgs, parseNativeFrameHashes, parseNativeProbe, requireNativeDecodedProbe, type NativeDecodedProbe, type NativeDecodedPtsComparison } from "./native-media-probe.js";
const file={path:"/synthetic/private.wav",sha256:"a".repeat(64),byteLength:2044};
const framehash=(hash="b".repeat(64))=>`#format: frame checksums\n#tb 0: 1/48000\n0, 0, 0, 1000, 2000, ${hash}\n`;
const raw=()=>({streams:[{index:0,codec_type:"audio",codec_name:"pcm_s16le",time_base:"1/48000",sample_rate:"48000",channels:1}],frames:[{stream_index:0,pts:0,nb_samples:1000}],packets:[{stream_index:0}]});
test("FFmpeg framehash encoder uses independently inspected positive video rational, never -1 alias",()=>{
  assert.deepEqual(nativeDecoderVideoTimebaseArgs({streams:[{codec_type:"video",time_base:"1/1000000"}]}),["-enc_time_base:v","1:1000000"]);
  assert.deepEqual(nativeDecoderVideoTimebaseArgs({streams:[{codec_type:"video",time_base:"1/1000"}]}),["-enc_time_base:v","1:1000"]);
  assert.deepEqual(nativeDecoderVideoTimebaseArgs(raw()),[]);
  assert.throws(()=>nativeDecoderVideoTimebaseArgs({streams:[{codec_type:"video",time_base:"-1"}]}),/timebase/);
  assert.throws(()=>nativeDecoderVideoTimebaseArgs({streams:[{codec_type:"video",time_base:"1/2147483648"}]}),/rational bounds/);
});
test("decoded PCM facts use actual first PTS, sample count, rational timebase and content hash",()=>{
  const hashes=parseNativeFrameHashes(framehash()),media=parseNativeProbe(file,raw(),hashes),s=media.streams[0]!;
  assert.equal(hashes[0]!.sha256,"b".repeat(64));assert.equal(s.firstPts,0);assert.equal(s.decodedSampleCount,1000);assert.deepEqual(s.timebase,{numerator:1,denominator:48000});assert.equal(s.codecPrimingSamples,0);assert.equal(s.skipSamples,0);assert.equal(s.discardPaddingSamples,0);
});
test("combined ffprobe packet/frame readback is decoded, rather than relying on format duration",()=>{
  const v=raw(),combined={streams:v.streams,packets_and_frames:[{type:"packet",...v.packets[0]},{type:"frame",...v.frames[0]}],format:{duration:"999"}};
  assert.equal(parseNativeProbe(file,combined,parseNativeFrameHashes(framehash())).streams[0]!.decodedSampleCount,1000);
});
test("compressed audio missing priming/skip metadata stays unknown",()=>{
  const v=raw();v.streams[0]!.codec_name="opus";
  const stream=parseNativeProbe(file,v,parseNativeFrameHashes(framehash())).streams[0]!;
  assert.equal(stream.codecPrimingSamples,null);assert.equal(stream.skipSamples,null);assert.equal(stream.discardPaddingSamples,null);
});
test("real Opus edge trims preserve per-packet zero/nonzero topology, reject interior/duplicate/malformed trims",()=>{
  const v=raw();v.streams[0]!.codec_name="opus";
  const packet=(pts:number,s:number,d:number)=>({stream_index:0,pts,duration:20,side_data_list:[{side_data_type:"Skip Samples",skip_samples:s,discard_padding:d,skip_reason:0,discard_reason:0}]});
  const doc={...v,packets:[packet(67,312,0),{stream_index:0,pts:87,duration:20},packet(467,0,648)]};
  const trims:import("./native-media-probe.js").NativeCodecPacketTrim[]=[];
  const result=parseNativeProbe(file,doc,parseNativeFrameHashes(framehash()),[],trims);
  assert.equal(result.streams[0]!.skipSamples,312);assert.equal(result.streams[0]!.discardPaddingSamples,648);assert.equal(result.streams[0]!.codecPrimingSamples,null);assert.deepEqual(trims.map(t=>[t.packetOrdinal,t.skipSamples,t.discardPaddingSamples]),[[0,312,0],[2,0,648]]);
  assert.throws(()=>parseNativeProbe(file,{...doc,packets:[packet(67,0,648),packet(467,0,0)]},parseNativeFrameHashes(framehash())),/Conflicting codec discard/);
  assert.throws(()=>parseNativeProbe(file,{...doc,packets:[packet(67,0,0),packet(467,312,0)]},parseNativeFrameHashes(framehash())),/Conflicting codec skip/);
  const duplicate=packet(67,312,0);duplicate.side_data_list.push({...duplicate.side_data_list[0]!});assert.throws(()=>parseNativeProbe(file,{...doc,packets:[duplicate]},parseNativeFrameHashes(framehash())),/duplicate codec trim/);
  assert.throws(()=>parseNativeProbe(file,{...doc,packets:[packet(67,-1,0)]},parseNativeFrameHashes(framehash())),/skip samples/);
});
test("actual WebM Opus 87ms vs decoded 87.5ms retains both observations within derived half-tick bounds",()=>{
  const v={...raw(),format:{format_name:"matroska,webm"}};v.streams[0]!.codec_name="opus";v.streams[0]!.time_base="1/1000";v.frames[0]!.pts=87;v.frames[0]!.nb_samples=960;
  const hashes=parseNativeFrameHashes(framehash()).map(h=>({...h,pts:4200,duration:960,size:1920}));
  const timing:NativeDecodedPtsComparison[]=[];
  const result=parseNativeProbe(file,v,hashes,timing);assert.equal(result.streams[0]!.firstPts,87);assert.equal(timing[0]!.decodedPts,4200);assert.equal(timing[0]!.basis,"matroska-opus-ticks");assert.equal(timing[0]!.quantizationBoundUs,24500/48);assert.deepEqual(timing[0]!.quantizationBoundSeconds,{numerator:"49000",denominator:"96000000"});assert.deepEqual(timing[0]!.residualSeconds,{numerator:"-24000",denominator:"48000000"});
  assert.throws(()=>parseNativeProbe(file,v,[{...hashes[0]!,pts:4248}]),/PTS mismatch/);
  assert.throws(()=>parseNativeProbe(file,{...v,format:{format_name:"wav"}},hashes),/PTS mismatch/);
  const widened={...v,streams:[{...v.streams[0]!,time_base:"1/100"}]};assert.throws(()=>parseNativeProbe(file,widened,hashes),/PTS mismatch/);
  const sameTb={...v,streams:[{...v.streams[0]!,time_base:"1/48000"}],frames:[{...v.frames[0]!,pts:4201}]};assert.throws(()=>parseNativeProbe(file,sameTb,hashes),/PTS mismatch/);
  assert.throws(()=>parseNativeProbe(file,v,[{...hashes[0]!,timebase:{numerator:1,denominator:0}}]),/timebase/);
});
test("independent decoder identity/PTS/cardinality mismatch is refused",()=>{
  const hashes=parseNativeFrameHashes(framehash());
  assert.throws(()=>parseNativeProbe(file,raw(),[{...hashes[0]!,pts:1}]),/PTS mismatch/);
  assert.throws(()=>parseNativeProbe(file,raw(),[]),/frame count mismatch/);
  assert.throws(()=>parseNativeFrameHashes(framehash("bad")),/Malformed/);
  assert.throws(()=>parseNativeFrameHashes("#tb 0: 1/0\n"),/timebase/);
});
test("malformed PTS/sample count and duplicate streams fail closed",()=>{
  const v=raw();v.frames[0]!.nb_samples=0;assert.throws(()=>parseNativeProbe(file,v,parseNativeFrameHashes(framehash())),/audio samples/);
  const duplicate=raw();duplicate.streams.push({...duplicate.streams[0]!});assert.throws(()=>parseNativeProbe(file,duplicate,parseNativeFrameHashes(framehash())),/Ambiguous/);
});
test("parsed decoder JSON cannot mint the process-private decoder capability",()=>{
  assert.throws(()=>requireNativeDecodedProbe({media:parseNativeProbe(file,raw(),parseNativeFrameHashes(framehash()))} as NativeDecodedProbe),/capability required/);
});
test("physical byte hash detects same-name replacement and bounds reads",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"native-probe-synthetic-"));try{
    const name=path.join(dir,"audio.wav");writeFileSync(name,"one");const before=fingerprintNativeFile(name);writeFileSync(name,"two");assert.notEqual(fingerprintNativeFile(name).sha256,before.sha256);assert.throws(()=>fingerprintNativeFile(name,2),/outside bounds/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
