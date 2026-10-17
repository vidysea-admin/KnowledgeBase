import test from 'node:test';
import assert from 'node:assert/strict';
import { createIvfHeader, encodeIvfFrame, parseIvf } from './native-ivf.js';
const key = Buffer.from([0,0,0,0x9d,1,0x2a,16,0,16,0]);
test('IVF preserves irregular microsecond PTS and strict dimensions/count', () => {
  const bytes = Buffer.concat([createIvfHeader(16,16,2), encodeIvfFrame(key,0), encodeIvfFrame(Buffer.from([1,2]),237123)]);
  const read = parseIvf(bytes); assert.deepEqual(read.frames.map(f => f.timestampUs), [0,237123]); assert.equal(read.rate,1000000);
  assert.throws(() => parseIvf(bytes.subarray(0,-1)), /length/);
  const wrong = Buffer.from(bytes); wrong.writeUInt32LE(3,24); assert.throws(() => parseIvf(wrong), /count/);
});
test('IVF refuses non-key first, dimensions, overflow, mixed timebase and repeated PTS', () => {
  const frame = (data: Buffer, timestamp=0) => Buffer.concat([createIvfHeader(16,16,1), encodeIvfFrame(data,timestamp)]);
  assert.throws(() => parseIvf(frame(Buffer.from([1]))), /key-first/);
  assert.throws(() => parseIvf(Buffer.concat([createIvfHeader(32,16,1),encodeIvfFrame(key,0)])), /dimensions/);
  assert.throws(() => encodeIvfFrame(key,Number.MAX_SAFE_INTEGER+1), /timestamp/);
  const overflow = frame(key); overflow.writeBigUInt64LE(2n**63n,36); assert.throws(() => parseIvf(overflow), /overflow/);
  const mixed = frame(key); mixed.writeUInt32LE(30,16); assert.throws(() => parseIvf(mixed), /header/);
  assert.throws(() => parseIvf(Buffer.concat([createIvfHeader(16,16,2),encodeIvfFrame(key,0),encodeIvfFrame(Buffer.from([1]),0)])), /order/);
});
