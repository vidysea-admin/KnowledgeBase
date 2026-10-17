import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeVideoProducer} from './native-video.js';
function fixture() {
  const order = [], encoded = [], observed = []; let tick = 12;
  class Frame { constructor(canvas, options) { this.timestamp = options.timestamp; order.push('frame'); } close() { this.closed = true; } }
  const producer = new NativeVideoProducer({encoder: {encodeQueueSize: 0, encode(frame, options) { encoded.push({frame, options}); }},
    canvas: {width: 1280,height: 720,getContext: () => ({drawImage() { order.push('copy'); }})},
    now: () => tick++, VideoFrame: Frame, observe: observation => observed.push(observation), fail: error => {throw error;}});
  return {producer, encoded, observed, order};
}
const chunk = (timestamp, type = 'key') => ({timestamp,type,byteLength: 2,copyTo(bytes) {bytes.set([7,9]);}});
test('owned canvas bracket constructs and encodes the same frame and joins output timestamp', () => {
  const f = fixture(); f.producer.sample({});
  assert.deepEqual(f.order, ['copy','frame']); assert.equal(f.encoded[0].frame.timestamp,12000);
  assert.equal(f.encoded[0].frame.closed,true); assert.equal(f.encoded[0].options.keyFrame,true);
  assert.deepEqual(f.observed[0], {frameId:'0',timestampUs:12000,sourceTimestampUs:null,copyBeforeUs:12000,copyAfterUs:13000});
  assert.deepEqual([...f.producer.output(chunk(12000)).bytes],[7,9]); f.producer.finish();
  assert.throws(() => f.producer.output(chunk(12000)), /Unmatched/);
});
test('missing/reordered outputs, non-key initial chunk and encoder backlog refuse', () => {
  const f = fixture(); f.producer.sample({}); f.producer.sample({});
  assert.throws(() => f.producer.finish(), /missing/);
  assert.throws(() => f.producer.output(chunk(14000)), /reordered/);
  assert.throws(() => f.producer.output(chunk(12000,'delta')), /key/);
  f.producer.encoder.encodeQueueSize = 16; assert.throws(() => f.producer.sample({}), /backpressure/);
});
