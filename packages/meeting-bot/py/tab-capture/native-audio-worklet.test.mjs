import test from 'node:test';
import assert from 'node:assert/strict';
import {NativePcmProcessor} from './native-audio-worklet.js';
test('PCM uses contiguous render indices and explicit mono s16le clamping', () => {
  globalThis.currentFrame = 128; globalThis.sampleRate = 48000;
  const messages = [], processor = new NativePcmProcessor(); processor.port = {postMessage: message => messages.push(message)};
  processor.process([[Float32Array.of(-2,-1,0,1,2),Float32Array.of(-2,-1,0,1,2)]], [[]]);
  processor.flush();
  const {observation,bytes} = messages[0];
  assert.deepEqual(observation,{blockId:'0',startFrame:128,frameCount:5,sampleRate:48000,channels:1,format:'s16le',byteLength:10});
  const view = new DataView(bytes); assert.deepEqual([0,1,2,3,4].map(i => view.getInt16(i*2,true)),[-32768,-32768,0,32767,32767]);
  globalThis.currentFrame = 134;
  assert.equal(processor.process([[Float32Array.of(0)]],[[]]),false);
  assert.match(messages[1].error,/gap/);
});
