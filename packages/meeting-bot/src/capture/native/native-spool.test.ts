import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createNativeSpoolReceiver, readClosedNativeSpool, readNativeSpoolLedger, verifyClosedNativeSpool } from './native-spool.js';
import type { NativeCaptureIdentity, ClosedNativeSpool, WindowsPacketClock } from './native-media-types.js';
const identity: NativeCaptureIdentity = { schema:'native-tab-clock/1',tenantId:'t',sessionId:'s',captureGeneration:'g',captureInstanceId:'c',samplerInstanceId:'sampler',platform:'meet',browserBuild:'synthetic',extensionAssetSha256:'a'.repeat(64),clockInstanceId:'clock' };
const observation = {frameId:'v',timestampUs:900000,sourceTimestampUs:null,copyBeforeUs:899999,copyAfterUs:900001};
const key=Buffer.from([0,0,0,0x9d,1,0x2a,16,0,16,0]);
const video = (sequence=0) => ({sequence,identity,observation:{...observation,encodedType:'key' as const,encodedByteLength:key.length},bytes:key});
const audio = (sequence=1,startFrame=123) => ({sequence,identity,observation:{blockId:String(startFrame),startFrame,frameCount:4,sampleRate:48000,channels:1 as const,format:'s16le' as const,byteLength:8},bytes:Buffer.from([0,0,255,127,0,128,0,0])});
function packet(pcmSha256: string): WindowsPacketClock {
  return { method: 'wasapi-packet-qpc/1', sequence: 0, firstSampleIndex: 0, frameCount: 4,
    devicePosition: '100', qpc100ns: '1000005', qpcFrequency: '10000000',
    before: { qpcBefore: '1000000', utcFiletime: '133000000000000000', qpcAfter: '1000002' },
    after: { qpcBefore: '1000008', utcFiletime: '133000000000000010', qpcAfter: '1000010' },
    flags: 0, rawSha256: 'd'.repeat(64), pcmSha256 };
}
async function setup(extra={}) {
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'native-spool-'));
  const options={directory:path.join(parent,'private'),identity,width:16,height:16,sampleRate:48000,maxBytes:100000,maxChunkBytes:8192,maxPendingBytes:20000,...extra};
  return {parent,options,receiver:await createNativeSpoolReceiver(options)};
}
test('receiver computes raw SHA, joins actual bytes, closes opaquely and rejects replacement', async () => {
  const {receiver:r}=await setup(); await r.observeVideo(observation); const ack=await r.appendVideo(video());
  assert.deepEqual(await r.appendVideo(video()),ack); await r.appendAudio(audio()); const cap=await r.close();
  assert.equal(cap.firstAudioSampleIndex,123); assert.equal(cap.firstVideoTimestampUs,900000); assert.equal(cap.videoFrameCount,1);
  assert.equal((await readNativeSpoolLedger(cap)).video[0]!.chunkSha256,ack.sha256);
  await verifyClosedNativeSpool(cap); assert.throws(() => readClosedNativeSpool({...cap} as ClosedNativeSpool), /unissued/);
  await fs.chmod(cap.audio.path,0o600); await fs.writeFile(cap.audio.path,Buffer.alloc(8));
  await assert.rejects(verifyClosedNativeSpool(cap), /modified/);
});
test('receiver binds tagged WASAPI PCM to actual bytes and preserves its distinct ledger facts', async () => {
  const { receiver: r } = await setup();
  await r.observeVideo(observation); await r.appendVideo(video());
  const block = audio(1, 0), expected = createHash('sha256').update(block.bytes).digest('hex');
  const windowsPacket = packet(expected);
  const ack = await r.appendAudio({ ...block, observation: { ...block.observation, windowsPacket } });
  const cap = await r.close(), ledger = await readNativeSpoolLedger(cap);
  assert.equal(ack.sha256, expected); assert.equal(cap.audio.sha256, expected);
  assert.equal(cap.firstAudioSampleIndex, 0); assert.equal(cap.audioSampleCount, 4);
  assert.deepEqual(ledger.audio[0]!.windowsPacket, windowsPacket);
  assert.equal(ledger.audio[0]!.sha256, expected); assert.equal(ledger.audioClockPairs.length, 0);
  await verifyClosedNativeSpool(cap);
});
test('receiver refuses a descriptive packet PCM hash that differs from its transported bytes', async () => {
  const { receiver: r } = await setup();
  try {
    await r.observeVideo(observation); await r.appendVideo(video());
    const block = audio(1, 0);
    await assert.rejects(r.appendAudio({ ...block, observation: { ...block.observation, windowsPacket: packet('0'.repeat(64)) } }), /WASAPI/);
    assert.equal(r.status().poisoned, true); await assert.rejects(r.close());
  } finally { await r.abort(); }
});
test('receiver poisons different retry and foreign generation without native recovery', async () => {
  const {receiver:r}=await setup(); await r.observeVideo(observation); await r.appendVideo(video());
  await assert.rejects(r.appendVideo({...video(),identity:{...identity,captureGeneration:'foreign'}}), /foreign/);
  assert.equal(r.status().poisoned,true); await assert.rejects(r.close()); await r.abort();
  const {receiver:s}=await setup(); await s.observeVideo(observation); await s.appendVideo(video());
  await assert.rejects(s.appendVideo({...video(),bytes:Buffer.from([...key.slice(0,-1),1])}), /different/); await s.abort();
});
test('receiver refuses dropped input, sample gaps, quota and bounded pending queue', async () => {
  const {receiver:r}=await setup(); await r.observeVideo(observation); await r.appendAudio(audio(0)); await assert.rejects(r.close(), /incomplete/);
  const {receiver:s}=await setup(); await s.appendAudio(audio(0)); await assert.rejects(s.appendAudio(audio(1,128)), /PCM/); await s.abort();
  const {receiver:q}=await setup({maxBytes:2500,maxChunkBytes:1000,maxPendingBytes:2000});
  await assert.rejects(q.appendAudio({...audio(0),bytes:Buffer.alloc(2001)}), /bound/); assert.equal(q.status().poisoned,true); await q.abort();
  const {receiver:b}=await setup({maxBytes:100000,maxChunkBytes:8192,maxPendingBytes:8192});
  await assert.rejects(b.appendAudio({...audio(0),bytes:Buffer.alloc(8192)}), /backpressure/); await b.abort();
});
test('receiver resume replays exact persisted sequence/hash and rejects unacknowledged bytes', async () => {
  const {options,receiver:r}=await setup(); await r.observeVideo(observation); const ack=await r.appendVideo(video()); const resumeCheckpoint=await r.suspendForResume();
  const resumed=await createNativeSpoolReceiver({...options,resume:true,resumeCheckpoint}); assert.deepEqual(await resumed.appendVideo(video()),ack);
  await resumed.appendAudio(audio()); await resumed.close();
  const next=await setup(); await next.receiver.observeVideo(observation); await next.receiver.appendVideo(video()); const nextCheckpoint=await next.receiver.suspendForResume();
  await fs.appendFile(path.join(next.options.directory,'source.s16le'),Buffer.from([1,2]));
  await assert.rejects(createNativeSpoolReceiver({...next.options,resume:true,resumeCheckpoint:nextCheckpoint}), /checkpoint hash/);
});
test('receiver refuses concurrent writers and altered resume identity', async () => {
  const {options,receiver:r}=await setup(); await assert.rejects(createNativeSpoolReceiver({...options,resume:true}), /EEXIST/);
  const resumeCheckpoint=await r.suspendForResume(); await assert.rejects(createNativeSpoolReceiver({...options,resume:true,resumeCheckpoint,identity:{...identity,tenantId:'foreign'}}), /identity/);
});
test('receiver quota includes ledger and completion and cannot close partial writes', async () => {
  const first=await setup(); await first.receiver.observeVideo(observation); await first.receiver.appendVideo(video()); await first.receiver.appendAudio(audio());
  const needed=first.receiver.status().byteLength; await first.receiver.abort();
  const {receiver:r}=await setup({maxBytes:needed,maxChunkBytes:1000,maxPendingBytes:Math.min(needed,3000)});
  await r.observeVideo(observation); await r.appendVideo(video()); await r.appendAudio(audio());
  await assert.rejects(r.close(), /quota/); assert.equal(r.status().poisoned,true);
});
test('receiver refuses linked or substituted private source after close', async () => {
  const {parent,receiver:r}=await setup(); await r.observeVideo(observation); await r.appendVideo(video()); await r.appendAudio(audio()); const cap=await r.close();
  await fs.link(cap.video.path,path.join(parent,'second-link.ivf'));
  await assert.rejects(verifyClosedNativeSpool(cap), /unsafe/);
});
