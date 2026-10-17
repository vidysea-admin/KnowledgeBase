import { test } from "node:test";
import assert from "node:assert/strict";
import { WEBINAR_PIPELINE } from "../domain/pipeline-workflow.js";
import { FileJobQueue } from "../job-queue/file-job-queue.js";
import { MemQueueFs } from "../job-queue/mem-queue-fs.testkit.js";
import { decodeQueue, QUEUE_FILE } from "../job-queue/queue-store.js";
import { createRunStateStore } from "../run-state-store/run-state-store.js";
import { FakeRunStateFs } from "../run-state-store/run-state-fake-fs.js";
import type { NodeHandler } from "./graph-types.js";
import { runSessionThroughGraph, type SessionRunInput } from "./session-run.js";

const DEF = { ...WEBINAR_PIPELINE, leaseMs: 1000 };
const ORDER = ["capture", "media", "transcript", "screen", "index"];
function rig() {
  const qfs = new MemQueueFs(), sfs = new FakeRunStateFs(), clock = { t: 10_000 };
  const queue = new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 1000, fs: qfs });
  const store = createRunStateStore("/runs", sfs);
  const jobs = () => { if (!qfs.files.has(`/q/${QUEUE_FILE}`)) return []; const d = decodeQueue(qfs.files.get(`/q/${QUEUE_FILE}`) ?? ""); assert.ok(d.ok); return d.value.jobs; };
  return { qfs, clock, queue, store, jobs };
}
const okAll = (log: string[], over: Record<string, NodeHandler> = {}): Record<string, NodeHandler> =>
  Object.fromEntries(ORDER.map((n) => [n, over[n] ?? ((ctx) => { log.push(ctx.stage); return { kind: "ok" as const, outputFingerprint: `fp-${n}` }; })]));
const input = (r: ReturnType<typeof rig>, handlers: Record<string, NodeHandler>, extra: Partial<SessionRunInput> = {}): SessionRunInput =>
  ({ tenantId: "tA", runKey: "sess-1", sourceFingerprint: "src1", handlers, queue: r.queue, store: r.store, now: () => r.clock.t, def: DEF, heartbeatMs: 0, ...extra });

test("a session runs capture -> media -> transcript -> screen -> index and finishes the job as done", async () => {
  const r = rig(), log: string[] = [];
  const res = await runSessionThroughGraph(input(r, okAll(log)));
  assert.ok(res.ok); assert.equal(res.run.outcome, "complete"); assert.deepEqual(log, ORDER); assert.equal(res.generation, 0);
  assert.deepEqual(r.jobs().map((j) => j.status), ["done"]);
});

test("D-139: a terminal stage failure is outcome failed-terminal and the queue job is dead; a resubmit is a NEW generation that re-runs", async () => {
  const r = rig(), log: string[] = []; let boom = true;
  const flaky: NodeHandler = () => (boom ? { kind: "fail", code: "stage-failed" } : { kind: "ok", outputFingerprint: "fp-index" });
  const first = await runSessionThroughGraph(input(r, okAll(log, { index: flaky })));
  assert.ok(first.ok); assert.equal(first.run.outcome, "failed-terminal"); assert.equal(first.run.failedTerminal?.stage, "index");
  assert.deepEqual(r.jobs().map((j) => j.status), ["dead"]);
  boom = false; log.length = 0;
  const second = await runSessionThroughGraph(input(r, okAll(log, { index: flaky })));
  assert.ok(second.ok); assert.equal(second.run.outcome, "complete"); assert.equal(second.generation, 1); assert.deepEqual(log, ORDER.slice(0, 4));
  assert.deepEqual(r.jobs().map((j) => j.status).sort(), ["dead", "done"]);
});

test("a finished run is idempotent: a second call claims nothing and runs no handler", async () => {
  const r = rig(), log: string[] = [];
  await runSessionThroughGraph(input(r, okAll(log))); log.length = 0;
  const again = await runSessionThroughGraph(input(r, okAll(log)));
  assert.equal(again.ok, false); assert.equal(!again.ok && again.error.code, "nothing-to-claim"); assert.deepEqual(log, []);
});

test("tenants are isolated: tenant B's session never claims tenant A's job", async () => {
  const r = rig(), logA: string[] = [], logB: string[] = [];
  await runSessionThroughGraph(input(r, okAll(logA)));
  const b = await runSessionThroughGraph(input(r, okAll(logB), { tenantId: "tB" }));
  assert.ok(b.ok); assert.equal(b.run.outcome, "complete"); assert.deepEqual(logB, ORDER);
  assert.deepEqual(r.jobs().map((j) => j.tenantId).sort(), ["tA", "tB"]);
});

test("a handler set that does not match the workflow is refused before anything is queued", async () => {
  const r = rig();
  const res = await runSessionThroughGraph(input(r, { capture: () => ({ kind: "ok", outputFingerprint: "x" }) }));
  assert.equal(res.ok, false); assert.equal(!res.ok && res.error.code, "bad-graph"); assert.equal(r.jobs().length, 0);
});

test("the heartbeat decorator beats while a handler runs and stops when the stage settles", async () => {
  const r = rig(), log: string[] = []; let beats = 0;
  const spyQueue = { enqueue: (i: never) => r.queue.enqueue(i), claim: (w: string, o: { tenantId: string }) => r.queue.claim(w, o),
    heartbeat: (x: never) => { beats++; return r.queue.heartbeat(x); }, complete: (x: never) => r.queue.complete(x), fail: (x: never, c: string, f?: { terminal?: boolean }) => r.queue.fail(x, c, f) };
  const slow: NodeHandler = async () => { await new Promise((d) => setTimeout(d, 120)); return { kind: "ok", outputFingerprint: "fp" }; };
  const res = await runSessionThroughGraph(input(r, okAll(log, { transcript: slow }), { queue: spyQueue as never, heartbeatMs: 20 }));
  assert.ok(res.ok && res.run.outcome === "complete");
  const during = beats; await new Promise((d) => setTimeout(d, 100)); assert.equal(beats, during, "no heartbeats after the run ends");
  assert.ok(during >= 5, `expected several heartbeats during the slow stage, got ${during}`);
});

test("ISS-W050-002: the interval timer (not the per-step runner beat) heartbeats during ONE slow handler and stops after it settles", async () => {
  const r = rig(), log: string[] = []; let beats = 0;
  const spyQueue = { enqueue: (i: never) => r.queue.enqueue(i), claim: (w: string, o: { tenantId: string }) => r.queue.claim(w, o),
    heartbeat: (x: never) => { beats++; return r.queue.heartbeat(x); }, complete: (x: never) => r.queue.complete(x), fail: (x: never, c: string, f?: { terminal?: boolean }) => r.queue.fail(x, c, f) };
  // Beats counted strictly inside the slow handler's own await window can only come from the interval timer: the runner heartbeats between steps, never inside a handler.
  let inHandler = -1;
  const slow: NodeHandler = async () => {
    const before = beats;
    await new Promise((d) => setTimeout(d, 400));
    inHandler = beats - before;
    return { kind: "ok", outputFingerprint: "fp" };
  };
  const res = await runSessionThroughGraph(input(r, okAll(log, { transcript: slow }), { queue: spyQueue as never, heartbeatMs: 20 }));
  assert.ok(res.ok && res.run.outcome === "complete");
  assert.ok(inHandler >= 2, `expected at least 2 timer beats while the slow stage ran, got ${inHandler}`);
  const after = beats; await new Promise((d) => setTimeout(d, 150));
  assert.equal(beats, after, "no heartbeats after the run ends");
});
