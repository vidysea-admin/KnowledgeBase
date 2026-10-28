import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeClockLedger, sameNativeIdentity } from './native-clock-ledger.js';
import type { NativeCaptureIdentity, WindowsPacketClock } from './native-media-types.js';
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

/** Synthetic packet descriptions exercise validation only; no device or clock is qualified. */
function windowsPacket(sequence = 0): WindowsPacketClock {
  const qpc = 1000000 + sequence * 1000;
  return { method: 'wasapi-packet-qpc/1', sequence, firstSampleIndex: sequence * 4, frameCount: 4,
    devicePosition: String(100 + sequence * 4), qpc100ns: String(qpc + 5), qpcFrequency: '10000000',
    before: { qpcBefore: String(qpc), utcFiletime: '133000000000000000', qpcAfter: String(qpc + 2) },
    after: { qpcBefore: String(qpc + 8), utcFiletime: '133000000000000010', qpcAfter: String(qpc + 10) },
    flags: 0, rawSha256: 'd'.repeat(64), pcmSha256: 'c'.repeat(64) };
}
test('tagged WASAPI packets retain a separate domain, source sample zero and copied nested facts', () => {
  const l = new NativeClockLedger(identity, 48000), first = windowsPacket();
  l.observeVideo(input()); l.acceptVideo(encoded());
  l.acceptAudio({ ...audio(0), windowsPacket: first });
  first.before.qpcAfter = '999999999';
  assert.equal(l.audio[0]!.windowsPacket!.before.qpcAfter, '1000002');
  l.acceptAudio({ ...audio(4), windowsPacket: windowsPacket(1) }); l.finish();
  assert.equal(l.audio[0]!.startFrame, 0);
  assert.equal(l.audio[1]!.windowsPacket!.sequence, 1);
  assert.equal(l.audioClockPairs.length, 0); // No fake AudioContext timestamp is constructed.
});
test('tagged packet binding rejects reordered sequences, sample/hash mismatch and invalid QPC brackets', () => {
  const cases: [string, (p: WindowsPacketClock) => void][] = [
    ['sequence', p => { p.sequence = 1; }], ['sample-zero', p => { p.firstSampleIndex = 4; }],
    ['frames', p => { p.frameCount = 5; }], ['PCM-hash', p => { p.pcmSha256 = 'e'.repeat(64); }],
    ['raw-hash', p => { p.rawSha256 = 'not-a-hash'; }], ['flags', p => { p.flags = 8; }],
    ['frequency-zero', p => { p.qpcFrequency = '0'; }], ['frequency-decimal', p => { p.qpcFrequency = '1.5'; }],
    ['device-overflow', p => { p.devicePosition = '18446744073709551616'; }],
    ['QPC-negative', p => { p.qpc100ns = '-1'; }],
    ['bracket', p => { p.before.qpcAfter = '999999'; }],
    ['UTC-before-epoch', p => { p.before.utcFiletime = '1'; }],
    ['bracket-order', p => { p.after.qpcBefore = '1000001'; }],
    ['method', p => { Reflect.set(p, 'method', 'browser-audio-context'); }],
  ];
  for (const [label, change] of cases) {
    const l = new NativeClockLedger(identity, 48000), packet = windowsPacket(); change(packet);
    assert.throws(() => l.acceptAudio({ ...audio(0), windowsPacket: packet }), label);
  }
  for (const change of [(p: WindowsPacketClock) => { p.sequence = 0; },
    (p: WindowsPacketClock) => { p.devicePosition = '103'; },
    (p: WindowsPacketClock) => { p.qpc100ns = '1000004'; },
    (p: WindowsPacketClock) => { p.qpcFrequency = '1000'; }]) {
    const l = new NativeClockLedger(identity, 48000), next = windowsPacket(1); change(next);
    l.acceptAudio({ ...audio(0), windowsPacket: windowsPacket() });
    assert.throws(() => l.acceptAudio({ ...audio(4), windowsPacket: next }));
  }
});
test('tagged and untagged PCM cannot mix, and packet descriptions cannot change platform or owner identity', () => {
  const tagged = new NativeClockLedger(identity, 48000);
  tagged.acceptAudio({ ...audio(0), windowsPacket: windowsPacket() });
  assert.throws(() => tagged.acceptAudio(audio(4)), /mixed/);
  const browser = new NativeClockLedger(identity, 48000); browser.acceptAudio(audio(0));
  assert.throws(() => browser.acceptAudio({ ...audio(4), windowsPacket: windowsPacket(1) }), /mixed/);
  const unsupported = new NativeClockLedger({ ...identity, platform: 'win32' }, 48000);
  assert.throws(() => unsupported.acceptAudio({ ...audio(0), windowsPacket: windowsPacket() }));
  for (const key of ['tenantId', 'sessionId', 'captureGeneration', 'captureInstanceId', 'samplerInstanceId', 'clockInstanceId'] as const) {
    assert.equal(sameNativeIdentity(identity, { ...identity, [key]: 'foreign' }), false, key);
  }
});
