// Synthetic numeric/protocol checks. Never launch a helper or claim Windows qualification.
import assert from 'node:assert/strict';
import test from 'node:test';
import { WindowsPacketFramer, windowsPacketPcm, windowsUtcInterval, requireClosedWindowsPacketCapture, assertWindowsPacketSpool, type ClosedWindowsPacketCapture } from './windows-capture-clock.js';
import type { ClosedNativeSpool } from './native-media-types.js';

test('Windows packet mono s16 preserves exact PCM and frame count',()=>{
  const raw=Buffer.from([0,128,255,127,0,0]);
  assert.deepEqual(windowsPacketPcm(raw,{channels:1,format:'s16le'},3),raw);
  const stereo=Buffer.alloc(8);stereo.writeInt16LE(100,0);stereo.writeInt16LE(300,2);stereo.writeInt16LE(-300,4);stereo.writeInt16LE(-100,6);
  const pcm=windowsPacketPcm(stereo,{channels:2,format:'s16le'},2);
  assert.equal(pcm.length,4);assert.equal(pcm.readInt16LE(0),200);assert.equal(pcm.readInt16LE(2),-200);
});
test('Windows packet float conversion refuses invalid formats and lengths',()=>{
  const raw=Buffer.alloc(8);raw.writeFloatLE(-1,0);raw.writeFloatLE(1,4);
  const pcm=windowsPacketPcm(raw,{channels:1,format:'f32le'},2);
  assert.equal(pcm.readInt16LE(0),-32768);assert.equal(pcm.readInt16LE(2),32767);
  raw.writeFloatLE(NaN,0);assert.throws(()=>windowsPacketPcm(raw,{channels:1,format:'f32le'},2),/unavailable/);
  assert.throws(()=>windowsPacketPcm(Buffer.alloc(2),{channels:2,format:'s16le'},1),/unavailable/);
});
test('Windows packet framing accepts fragmentation and refuses truncation and oversized metadata',()=>{
  const json=Buffer.from('{"kind":"synthetic"}'),raw=Buffer.from([1,2]),header=Buffer.alloc(8);
  header.writeUInt32LE(json.length);header.writeUInt32LE(raw.length,4);
  const bytes=Buffer.concat([header,json,raw]),framer=new WindowsPacketFramer();
  assert.deepEqual(framer.push(bytes.subarray(0,9)),[]);
  assert.deepEqual(framer.push(bytes.subarray(9)),[{metadata:{kind:'synthetic'},raw}]);framer.finish();
  const bad=new WindowsPacketFramer();bad.push(bytes.subarray(0,7));assert.throws(()=>bad.finish(),/unavailable/);
  const large=Buffer.alloc(8);large.writeUInt32LE(4097);assert.throws(()=>new WindowsPacketFramer().push(large),/unavailable/);
});
test('Windows UTC conversion uses FILETIME epoch and QPC ticks with outward rounding',()=>{
  assert.deepEqual(windowsUtcInterval({qpcBefore:'1000',utcFiletime:'116444736020000000',qpcAfter:'1002'},'1000'),{earliestUs:997999n,latestUs:1000001n});
  assert.throws(()=>windowsUtcInterval({qpcBefore:'2',utcFiletime:'116444736000000000',qpcAfter:'1'},'1000'),/unavailable/);
  assert.throws(()=>windowsUtcInterval({qpcBefore:'0',utcFiletime:'116444736000000000',qpcAfter:'1'},'0'),/unavailable/);
});
test('Windows parsed JSON cannot mint closed packet capture capability',()=>{
  assert.throws(()=>requireClosedWindowsPacketCapture(JSON.parse('{"sampleCount":42,"qualification":true}') as ClosedWindowsPacketCapture),/unavailable/);
});
test('Windows spool join refuses forged packet capability before reading asserted spool',async()=>{
  await assert.rejects(assertWindowsPacketSpool({} as ClosedWindowsPacketCapture,{} as ClosedNativeSpool),/unavailable/);
});
