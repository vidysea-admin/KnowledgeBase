import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeClockLedger, sameNativeIdentity } from './native-clock-ledger.js';
import type { NativeCaptureIdentity } from './native-media-types.js';
const identity: NativeCaptureIdentity = { schema:'native-tab-clock/1',tenantId:'tenant',sessionId:'session',captureGeneration:'generation',captureInstanceId:'capture',samplerInstanceId:'sampler',platform:'meet',browserBuild:'synthetic-test',extensionAssetSha256:'a'.repeat(64),clockInstanceId:'clock' };
const input = (id='f',timestampUs=1000) => ({frameId:id,timestampUs,sourceTimestampUs:null,copyBeforeUs:timestampUs-1,copyAfterUs:timestampUs+1});
const encoded = (id='f',timestampUs=1000) => ({...input(id,timestampUs),encodedType:'key' as const,encodedByteLength:10,chunkSha256:'b'.repeat(64)});
const audio = (startFrame=77) => ({blockId:String(startFrame),startFrame,frameCount:4,sampleRate:48000,channels:1 as const,format:'s16le' as const,byteLength:8,sha256:'c'.repeat(64)});
test('ledger requires exact input-output lineage and contiguous sample indices', () => {
  const l = new NativeClockLedger(identity,48000); l.observeVideo(input()); l.acceptVideo(encoded()); l.acceptAudio(audio()); l.acceptAudio(audio(81)); l.finish();
  assert.equal(l.audio[0]!.startFrame,77); assert.throws(() => l.acceptAudio(audio(86)), /PCM/);
  assert.throws(() => l.acceptVideo(encoded()), /unmatched/); assert.throws(() => l.observeVideo(input()), /duplicate/);
});
test('ledger refuses reordered/missing chunks, clock substitution and wall steps', () => {
  const l = new NativeClockLedger(identity,48000); l.observeVideo(input()); l.observeVideo(input('g',2000));
  assert.throws(() => l.acceptVideo(encoded('g',2000)), /unmatched/); assert.throws(() => l.finish(), /incomplete/);
  assert.equal(sameNativeIdentity(identity,{...identity,samplerInstanceId:'foreign'}),false);
  assert.throws(() => l.acceptAudioClock({clockInstanceId:'foreign',beforePerformanceUs:1,afterPerformanceUs:3,contextTime:1,performanceTime:2,state:'running',sampleRate:48000}), /clock/);
  const bracket=(clockInstanceId:string,n:number,epoch:number) => ({clockInstanceId,beforeMonotonicUs:n,afterMonotonicUs:n+2,epochUs:epoch});
  l.acceptHostClock({browser:bracket('clock',10,1010),serverRequest:bracket('server',10,1010),serverResponse:bracket('server',20,1020)});
  assert.throws(() => l.acceptHostClock({browser:bracket('clock',30,2030),serverRequest:bracket('server',30,1030),serverResponse:bracket('server',40,1040)}), /step/);
});
