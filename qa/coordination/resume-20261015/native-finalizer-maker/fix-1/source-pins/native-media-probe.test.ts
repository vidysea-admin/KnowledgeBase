import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintNativeFile, nativeDecoderVideoTimebaseArgs, parseNativeFrameHashes, parseNativeProbe, requireNativeDecodedProbe, type NativeDecodedProbe } from "./native-media-probe.js";
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
