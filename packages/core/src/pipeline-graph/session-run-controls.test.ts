import {test} from "node:test";
import assert from "node:assert/strict";
import {FileJobQueue} from "../job-queue/file-job-queue.js";
import {MemQueueFs} from "../job-queue/mem-queue-fs.testkit.js";
import {decodeQueue, QUEUE_FILE} from "../job-queue/queue-store.js";
import {createRunStateStore} from "../run-state-store/run-state-store.js";
import {FakeRunStateFs} from "../run-state-store/run-state-fake-fs.js";
import {runSessionThroughGraph} from "./session-run.js";
import {createSessionControl} from "./session-control.js";
import type {NodeHandler} from "./graph-types.js";

const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
function rig(now = Date.now, leaseMs = 500) {
  const fs = new MemQueueFs(), queue = new FileJobQueue({dir:"/queue", fs, now, leaseMs});
  const store = createRunStateStore("/runs", new FakeRunStateFs());
  const control = createSessionControl(createRunStateStore("/controls", new FakeRunStateFs()));
  const jobs = () => {const decoded=decodeQueue(fs.files.get(`/queue/${QUEUE_FILE}`)!); assert.ok(decoded.ok); return decoded.value.jobs;};
  const run = (handlers:Record<string,NodeHandler>, heartbeatMs = 20) => runSessionThroughGraph({
    tenantId:"tenant-a", runKey:"session", sourceFingerprint:"input", workerId:"worker", queue, store, control, now, heartbeatMs,
    def:{leaseMs, stages:[{name:"first", deps:[], maxAttempts:2, retryable:["provider-timeout"]}, {name:"last", deps:["first"], maxAttempts:1, retryable:[]}]}, handlers});
  return {queue, store, control, jobs, run};
}

test("a handler outlasting the real lease is actively heartbeated and no worker can reclaim it", async () => {
  const r=rig(); let during=0, active=false;
  const heartbeat=r.queue.heartbeat.bind(r.queue);
  r.queue.heartbeat=ref => {if(active) during++; return heartbeat(ref);};
  const result=await r.run({first:async () => {
    active=true; await wait(600);
    const other=r.queue.claim("other", {tenantId:"tenant-a"}); assert.ok(other.ok); assert.equal(other.value,null);
    active=false; return {kind:"ok", outputFingerprint:"first"};
  }, last:() => ({kind:"ok", outputFingerprint:"last"})});
  assert.ok(result.ok && result.run.outcome==="complete");
  assert.ok(during>=2, `only ${during} timer heartbeats while the stage ran`);
  const completed=during; await wait(60); assert.equal(during,completed);
  assert.equal(r.jobs()[0]!.status,"done");
});

test("durable cancellation aborts the running handler, fails the job, and never starts downstream", async () => {
  const r=rig(); let downstream=0, aborted=false;
  const result=await r.run({first:async ctx => {
    setTimeout(() => r.control.cancel("tenant-a","session"),30);
    await new Promise<void>(resolve => ctx.signal!.addEventListener("abort", () => {aborted=true; resolve();}, {once:true}));
    return {kind:"ok", outputFingerprint:"must-not-commit"};
  },last:() => {downstream++; return {kind:"ok",outputFingerprint:"last"};}});
  assert.ok(result.ok && result.run.outcome==="failed-terminal");
  assert.equal(result.run.failedTerminal?.code,"cancelled"); assert.equal(aborted,true); assert.equal(downstream,0);
  assert.equal(r.jobs()[0]!.status,"dead");
  const repeated=await r.run({first:() => assert.fail("cancel must persist"),last:() => assert.fail("cancel must persist")});
  assert.ok(repeated.ok && repeated.run.outcome==="failed-terminal");
  r.control.resume("tenant-a","session");
  const resumed=await r.run({first:() => ({kind:"ok",outputFingerprint:"first"}),last:() => ({kind:"ok",outputFingerprint:"last"})});
  assert.ok(resumed.ok && resumed.run.outcome==="complete"); assert.equal(resumed.generation,2);
});

test("superseded holder cannot acknowledge a stage result after another worker claims the expired lease", async () => {
  let clock=1000; const r=rig(() => clock,100);
  const result=await r.run({first:() => {
    clock+=101; const other=r.queue.claim("replacement",{tenantId:"tenant-a"}); assert.ok(other.ok && other.value);
    return {kind:"ok",outputFingerprint:"stale-output"};
  },last:() => assert.fail("stale holder must not run downstream")},0);
  assert.ok(result.ok && result.run.outcome==="error");
  assert.equal(result.run.error?.code,"stale-lease"); assert.equal(r.jobs()[0]!.workerId,"replacement");
});

test("a queue id forgotten by retention cannot certify new input using an old complete checkpoint", async () => {
  const r=rig();
  const handlers={first:()=>({kind:"ok" as const,outputFingerprint:"first"}),last:()=>({kind:"ok" as const,outputFingerprint:"last"})};
  const original=await r.run(handlers);assert.ok(original.ok && original.run.outcome==="complete");
  const first=r.jobs()[0]!, queue=new FileJobQueue({dir:"/fresh-queue",fs:new MemQueueFs(),now:Date.now});
  const old=r.store.load(first.id);assert.ok(old.ok && old.state);
  const changed=await runSessionThroughGraph({tenantId:"tenant-a",runKey:"session",sourceFingerprint:"changed-input",workerId:"new-worker",
    queue,store:r.store,now:Date.now,heartbeatMs:0,def:{leaseMs:500,stages:[{name:"first",deps:[],maxAttempts:2,retryable:["provider-timeout"]},{name:"last",deps:["first"],maxAttempts:1,retryable:[]}]},
    handlers:{first:()=>assert.fail("old checkpoint must be refused"),last:()=>assert.fail("old checkpoint must be refused")}});
  assert.equal(changed.ok,false);assert.equal(!changed.ok && changed.error.code,"source-fingerprint-mismatch");
  assert.deepEqual(r.store.load(first.id),old);
});
