import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightNative,openNativeRecorder} from './native-recorder.js';
test('native preflight refuses missing APIs and unsupported VP8 without qualifying a platform', async () => {
  await assert.rejects(preflightNative({}), /unavailable/);
  const scope = {isSecureContext:true,OffscreenCanvas:class {},VideoFrame:class {},AudioWorkletNode:class {},
    AudioContext: class {getOutputTimestamp() {}},VideoEncoder: {isConfigSupported: async () => ({supported:false})}};
  await assert.rejects(preflightNative(scope),/VP8/);
  scope.VideoEncoder.isConfigSupported = async () => ({supported:true});
  assert.equal(await preflightNative(scope),undefined);
});
test('synthetic API harness reaches actual producer, ordered identical retry and drained close', async t => {
  const saved = new Map(), set = (key,value) => {saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  t.after(() => {for(const [key,descriptor] of saved) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const timers = [], requests = [], failures = []; let worklet, retry = true;
  set('isSecureContext',true);set('setInterval',fn=>{timers.push(fn);return timers.length;});set('clearInterval',()=>{});
  set('OffscreenCanvas',class {constructor(width,height){Object.assign(this,{width,height});}getContext(){return {drawImage(){}};}});
  set('VideoFrame',class {constructor(canvas,{timestamp}){this.timestamp=timestamp;}close(){}});
  set('AudioContext',class {getOutputTimestamp(){}});
  set('VideoEncoder',class {
    static async isConfigSupported(){return {supported:true};}
    constructor(callbacks){this.callbacks=callbacks;this.encodeQueueSize=0;this.state='configured';}configure(){}
    encode(frame){this.callbacks.output({timestamp:frame.timestamp,type:'key',byteLength:2,copyTo(bytes){bytes.set([0,1]);}});}
    async flush(){}close(){this.state='closed';}
  });
  set('AudioWorkletNode',class {constructor(){worklet=this;this.port={postMessage:()=>this.port.onmessage({data:{stopped:true}}),close(){}};}connect(){}disconnect(){}});
  set('document',{createElement:()=>({play:async()=>{},pause(){}})});set('chrome',{runtime:{getURL:name=>name}});
  const context={state:'running',sampleRate:48000,audioWorklet:{addModule:async()=>{}},destination:{},
    getOutputTimestamp:()=>({contextTime:1,performanceTime:1}),createMediaStreamSource:()=>({connect(){},disconnect(){}}),addEventListener(){},removeEventListener(){}};
  const recorder=await openNativeRecorder({stream:{},context,config:{native:{identity:{clockInstanceId:'synthetic'}}},fail:error=>failures.push(error),
    request:async(route,body)=>{
      requests.push({route,body});
      if(route==='/native-clock')return {json:async()=>({serverRequest:{},serverResponse:{}})};
      if(JSON.parse(body).op==='video'&&retry){retry=false;throw new Error('synthetic lost acknowledgement');}
      return {};
    }});
  timers[0]();
  worklet.port.onmessage({data:{observation:{blockId:'0',startFrame:128,frameCount:1,sampleRate:48000,channels:1,format:'s16le',byteLength:2},bytes:new ArrayBuffer(2)}});
  await recorder.stop();
  assert.deepEqual(failures,[]);
  const operations=requests.filter(r=>r.route==='/native').map(r=>JSON.parse(r.body));
  assert.deepEqual(operations.map(o=>o.op),['clock','clock','observe-video','video','video','audio','close']);
  assert.deepEqual(operations[3],operations[4]); assert.equal(operations.at(-1).sequence,5);
});
