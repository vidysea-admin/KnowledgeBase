import test from "node:test";
import assert from "node:assert/strict";
import { makeRecorderWorld, flush, deferred, okResponse } from "./tab-capture-harness.mjs";

test("media origin is producer start time after acquisition, before delayed upload acknowledgement", {timeout:20000}, async () => {
  let clock=1900000000000, atStart;
  const acquisition=deferred(), acknowledgement=deferred();
  const world=makeRecorderWorld({extra:{Date:{now:()=>clock},navigator:{mediaDevices:{getUserMedia:()=>acquisition.promise}}},
    handler:call=>{
      if(call.url.endsWith("/event") && JSON.parse(call.body).event==="capture-started")return acknowledgement.promise;
      return okResponse({stop:false});
    }});
  const start=world.ctx.MediaRecorder.prototype.start;
  world.ctx.MediaRecorder.prototype.start=function(ms){atStart=clock;return start.call(this,ms);};
  const pending=world.send(world.startMsg);
  await flush();assert.equal(world.events().length,0);
  clock+=45000;acquisition.resolve(world.stream);await flush();
  const announced=world.events().find(event=>event.event==="capture-started");
  assert.equal(announced.mediaStartedAt,atStart);
  assert.equal(announced.mediaStartedAt,1900000045000);
  assert.equal(world.recorder().state,"recording");
  clock+=60000;acknowledgement.resolve(okResponse());assert.equal((await pending.reply).ok,true);
  assert.notEqual(announced.mediaStartedAt,clock,"upload receipt time cannot replace the producer origin");
  assert.equal(world.events().filter(event=>event.event==="capture-started").length,1);
  world.recorder().stop();await flush();
});

test("failed MediaRecorder.start never announces a valid recording origin", {timeout:20000}, async () => {
  const world=makeRecorderWorld({extra:{Date:{now:()=>1900000000000}}});
  world.ctx.MediaRecorder.prototype.start=()=>{throw new Error("fixture recorder start refused");};
  const reply=await world.begin();assert.equal(reply.ok,false);assert.match(reply.error,/start refused/);
  assert.equal(world.events().some(event=>event.event==="capture-started"),false);
  assert.ok(world.tracks.every(track=>track.stopped));assert.ok(world.contexts.every(context=>context.closed));
});
