import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createRecordConsent } from "./context.js";
import { installPrivateCaptureControl, privateCaptureTurns } from "./privacy.js";

const tenantId = "tenant-one", sessionId = "session-one", generation = "11111111-2222-4333-8444-555555555555", token = "a".repeat(64);
function fixture() {
  const receipt = createRecordConsent([], {tenantId, sessionId, meetingUrl: "https://meet.google.com/abc-defg-hij"},
    {LKB_CAPTURE_APPROVED_BY: "Umesh", LKB_CAPTURE_APPROVAL_REF: "D-165", LKB_CAPTURE_RECORDED_BY: "operator-id",LKB_CAPTURE_CONTROL_GENERATION:generation}, new Date(1000));
  const p = Object.assign(new EventEmitter(), {env: {LKB_CAPTURE_CONTROL_TOKEN: token, LKB_CAPTURE_CONTROL_GENERATION: generation},
    connected: true, send: (value: unknown) => {acks.push(value);}});
  const acks: unknown[] = [], persisted: typeof receipt[] = []; let at = 1000;
  const control = installPrivateCaptureControl(receipt, 1000, current => persisted.push(structuredClone(current)), p as never, () => at);
  control.onCaptureEvent({event: "capture-started", mediaStartedAt: 1000});
  const emit = (changes = {}) => p.emit("message", {version: 1, type: "privacy", tenantId, sessionId, generation, token, requestId: randomUUID(), action: "private-start", ...changes});
  return {receipt, p, acks, persisted, control, emit, time: (value: number) => {at = value;}};
}

test("only inherited capability for exact owner marks a live private interval", () => {
  const f = fixture();
  for (const changes of [{tenantId: "other"}, {sessionId: "other"}, {token: "b".repeat(64)}, {generation: "bad"}, {extra: true}, {type: "stop"}]) f.emit(changes);
  assert.equal(f.persisted.length, 1); assert.equal(f.acks.length, 0); // actual producer origin checkpoint
  f.time(6000); f.emit();
  assert.deepEqual(f.persisted[1]!.privateWindows, [{tStart: 5, tEnd: Number.MAX_SAFE_INTEGER}]);
  assert.equal(f.persisted[1]!.mediaStartedAt, 1000);
  // Recovery with the persisted open window cannot leak anything captured after private-start.
  assert.deepEqual(privateCaptureTurns([{tStart: 6, tEnd: 7, text: "secret"}] as never, f.persisted[1]!), []);
  f.emit(); assert.equal(f.persisted.length, 2); // duplicate starts do not reset exclusion
  f.time(11000); f.emit({action: "private-end"});
  assert.deepEqual(f.receipt.privateWindows, [{tStart: 5, tEnd: 10}]);
  assert.equal(f.acks.length, 3);
  f.control.dispose(); assert.equal(f.p.listenerCount("message"), 0);
});

test("finalization closes an active private interval; late controls cannot change it", () => {
  const f = fixture(); f.time(4000); f.emit(); f.time(9000); f.control.dispose();
  assert.deepEqual(f.receipt.privateWindows, [{tStart: 3, tEnd: 8}]);
  const count = f.persisted.length; f.emit(); assert.equal(f.persisted.length, count);
  f.control.dispose(); assert.equal(f.persisted.length, count);
});

test("malformed inherited capability fails before installing any listener", () => {
  const f = fixture(); f.control.dispose();
  const p = Object.assign(new EventEmitter(), {env: {LKB_CAPTURE_CONTROL_TOKEN: "bad"}, connected: true, send: () => {}});
  assert.throws(() => installPrivateCaptureControl(f.receipt, 1000, () => {}, p as never), /Invalid private/);
  assert.equal(p.listenerCount("message"), 0);
  for(const generation of [randomUUID(),undefined]){
    assert.throws(()=>installPrivateCaptureControl({...f.receipt,generation},1000,()=>{},f.p as never),/Invalid private/);
    assert.equal(f.p.listenerCount("message"),0);
  }
});

test("missing media origin excludes entire capture instead of guessing from controller launch", () => {
  const f = fixture(); f.control.dispose(); delete f.receipt.mediaStartedAt;
  const snapshots: typeof f.receipt[] = []; let at = 1000;
  const control = installPrivateCaptureControl(f.receipt, 1000, row => snapshots.push(structuredClone(row)), f.p as never, () => at);
  at = 50000; f.emit(); at = 60000; f.emit({action: "private-end"});
  assert.deepEqual(snapshots.at(-1)?.privateWindows, [{tStart: 0, tEnd: Number.MAX_SAFE_INTEGER}]);
  assert.equal((f.acks.at(-1) as {timing: string}).timing, "conservative");
  control.dispose();
});

test("persistence failure exposes a stop condition and never acknowledges unsafe private state", () => {
  const f = fixture(); f.control.dispose();
  const control = installPrivateCaptureControl(f.receipt, 1000, () => {throw new Error("disk unavailable");}, f.p as never, () => 5000);
  assert.doesNotThrow(() => f.emit());
  assert.match(control.failure()!, /stop capture/); assert.equal(f.acks.length, 0);
  f.emit(); f.emit({action: "private-end"}); assert.equal(f.acks.length, 0);
  control.dispose(); assert.equal(f.p.listenerCount("message"), 0);
});

test("failed private-end keeps durable conservative exclusion and duplicates never ACK", () => {
  const f = fixture(); f.control.dispose();
  const saved: typeof f.receipt[] = []; let at = 1000, fail = false;
  const control = installPrivateCaptureControl(f.receipt, 1000, row => {
    if (fail) throw new Error("disk unavailable"); saved.push(structuredClone(row));
  }, f.p as never, () => at);
  control.onCaptureEvent({event: "capture-started", mediaStartedAt: 1000});
  at = 5000; f.emit(); assert.equal(f.acks.length, 1);
  fail = true; at = 10000; f.emit({action: "private-end"});
  assert.match(control.failure()!, /stop capture/);
  f.emit({action: "private-end"}); f.emit(); assert.equal(f.acks.length, 1);
  assert.deepEqual(saved.at(-1)?.privateWindows, [{tStart: 4, tEnd: Number.MAX_SAFE_INTEGER}]);
  assert.deepEqual(f.receipt.privateWindows, []); // unpublished close never mutates the authoritative in-memory receipt
  assert.throws(() => control.dispose(), /disk unavailable/); assert.equal(f.p.listenerCount("message"), 0);
});

test("private ACK echoes the exact operation ID and conflicting ID reuse cannot alter windows", () => {
  const f = fixture(), requestId = randomUUID();
  f.time(5000); f.emit({requestId});
  assert.equal((f.acks[0] as {requestId: string}).requestId, requestId);
  assert.equal((f.acks[0] as {timing: string}).timing, "media-clock");
  f.time(9000); f.emit({requestId, action: "private-end"});
  assert.equal(f.acks.length, 1); assert.equal(f.persisted.length, 2);
  f.emit({requestId: "invalid", action: "private-end"}); assert.equal(f.acks.length, 1);
  f.emit({requestId: randomUUID(), action: "private-end"});
  assert.equal(f.acks.length, 2); assert.deepEqual(f.receipt.privateWindows, [{tStart: 4, tEnd: 8}]);
  f.time(12000); f.emit({requestId}); // replay of the persisted start ACK cannot reopen a now-closed interval
  assert.equal(f.acks.length, 3); assert.equal(f.persisted.length, 3);
  assert.deepEqual(f.receipt.privateWindows, [{tStart: 4, tEnd: 8}]);
  f.control.dispose();
});

test("late actual clock checkpoint preserves an already accepted conservative open interval", () => {
  const f = fixture(); f.control.dispose(); delete f.receipt.mediaStartedAt;
  const saved: typeof f.receipt[] = []; let at = 1000;
  const control = installPrivateCaptureControl(f.receipt, 1000, row => saved.push(structuredClone(row)), f.p as never, () => at);
  at = 5000; f.emit();
  at = 6000; control.onCaptureEvent({event: "capture-started", mediaStartedAt: 2000});
  assert.deepEqual(saved.at(-1)?.privateWindows, [{tStart: 0, tEnd: Number.MAX_SAFE_INTEGER}]);
  assert.equal(saved.at(-1)?.mediaStartedAt, 2000);
  at = 7000; f.emit({action: "private-end"});
  assert.deepEqual(saved.at(-1)?.privateWindows, [{tStart: 0, tEnd: 5}]);
  control.dispose();
});

test("wall-clock corrections cannot shift private intervals off the actual media timeline", () => {
  const f = fixture(); f.control.dispose(); delete f.receipt.mediaStartedAt;
  let epoch = 1000, monotonic = 1000;
  const saved: typeof f.receipt[] = [];
  const control = installPrivateCaptureControl(f.receipt, 1000, row => saved.push(structuredClone(row)), f.p as never,
    () => epoch, () => monotonic);
  control.onCaptureEvent({event: "capture-started", mediaStartedAt: 1000});
  epoch = 105000; monotonic = 5000; f.emit();
  epoch = 500; monotonic = 9000; f.emit({action: "private-end"});
  assert.deepEqual(saved.at(-1)?.privateWindows, [{tStart: 4, tEnd: 8}]);
  control.dispose();
});

test("clock jump before producer origin arrives cannot move private window beyond real media/provider range",()=>{
  const f=fixture();f.control.dispose();delete f.receipt.mediaStartedAt;
  let epoch=1000,monotonic=1000;const saved:typeof f.receipt[]=[];
  const control=installPrivateCaptureControl(f.receipt,1000,row=>saved.push(structuredClone(row)),f.p as never,()=>epoch,()=>monotonic);
  epoch=105000;monotonic=5000;control.onCaptureEvent({event:"capture-started",mediaStartedAt:2000});
  f.emit();assert.equal(saved.at(-1)?.mediaStartedAt,undefined);
  assert.deepEqual(saved.at(-1)?.privateWindows,[{tStart:0,tEnd:Number.MAX_SAFE_INTEGER}]);
  assert.equal((f.acks.at(-1) as {timing:string;privacy:string}).timing,"conservative");
  assert.equal((f.acks.at(-1) as {privacy:string}).privacy,"conservative");
  control.dispose();
});
