import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WEBINAR_PIPELINE, type RunState } from "../domain/pipeline-workflow.js";
import { FileJobQueue } from "../job-queue/file-job-queue.js";
import { MemQueueFs } from "../job-queue/mem-queue-fs.testkit.js";
import { decodeQueue, QUEUE_FILE } from "../job-queue/queue-store.js";
import { createRunStateStore, type RunStateStore } from "../run-state-store/run-state-store.js";
import { FakeRunStateFs } from "../run-state-store/run-state-fake-fs.js";
import { createPipelineRunner } from "./pipeline-runner.js";
import type { PipelineRunner, RunnerLease, RunnerResult } from "./runner-types.js";

const DEF = { ...WEBINAR_PIPELINE, leaseMs: 1000 };
function rig(opts: { mint?: () => string; wrap?: (s: RunStateStore) => RunStateStore } = {}) {
  const qfs = new MemQueueFs(), sfs = new FakeRunStateFs(), clock = { t: 10_000 };
  const queue = new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 1000, fs: qfs });
  const raw = createRunStateStore("/runs", sfs);
  const store = opts.wrap ? opts.wrap(raw) : raw;
  const make = (store2: RunStateStore = store): PipelineRunner => createPipelineRunner({ def: DEF, queue, store: store2, now: () => clock.t, mintAttemptId: opts.mint });
  return { qfs, sfs, clock, queue, raw, store, runner: make(), make };
}
const val = <T>(r: RunnerResult<T>): T => { assert.ok(r.ok, JSON.stringify(r)); return (r as { ok: true; value: T }).value; };
const code = <T>(r: RunnerResult<T>): string => { assert.equal(r.ok, false, "expected a refusal"); const e = (r as { ok: false; error: { source: string; code: string } }).error; return `${e.source}:${e.code}`; };
const SUB = { tenantId: "tA", runKey: "sess-1", sourceFingerprint: "fp1" };
function lease(r: ReturnType<typeof rig>, tenantId = "tA", worker = "w1"): RunnerLease { const c = val(r.runner.claim(worker, tenantId)); assert.ok(c); return c.lease; }
const jobs = (qfs: MemQueueFs) => { const d = decodeQueue(qfs.files.get(`/q/${QUEUE_FILE}`) ?? ""); assert.ok(d.ok); return d.value.jobs; };
const run = (r: ReturnType<typeof rig>, id: string): RunState => { const l = r.raw.load(id); assert.ok(l.ok && l.state); return l.state; };

/** Drive one stage to success; returns the attempt. */
function doStage(r: ReturnType<typeof rig>, l: RunnerLease, stage: string, out: string) {
  const s = val(r.runner.step(l)); assert.equal(s.kind, "started"); assert.equal((s as { attempt: { stage: string } }).attempt.stage, stage);
  const at = (s as { attempt: { stage: string; attemptId: string } }).attempt;
  val(r.runner.succeed(l, at, out)); return at;
}

test("happy path: submit, claim, every stage in order (optional screen skipped), complete finishes the job", () => {
  const r = rig();
  const sub = val(r.runner.submit(SUB)); assert.deepEqual([sub.queue, sub.state], ["enqueued", "created"]);
  const l = lease(r);
  doStage(r, l, "capture", "o1"); doStage(r, l, "media", "o2"); doStage(r, l, "transcript", "o3");
  assert.equal(val(r.runner.skip(l, "screen")), null);
  doStage(r, l, "index", "o5");
  assert.deepEqual(val(r.runner.step(l)), { kind: "complete" });
  assert.equal(jobs(r.qfs)[0]!.status, "done");
  assert.equal(code(r.runner.step(l)), "queue:terminal");
});

test("the run state starts at the planner's initial state and the job payload carries only runKey and fingerprint", () => {
  const r = rig(); const sub = val(r.runner.submit(SUB));
  assert.equal(run(r, sub.runId).sourceFingerprint, "fp1");
  assert.deepEqual(jobs(r.qfs)[0]!.payload, { runKey: "sess-1", sourceFingerprint: "fp1" });
  assert.match(sub.runId, /^r-[0-9a-f]{32}$/); assert.equal(jobs(r.qfs)[0]!.id, sub.runId);
});

test("submit is idempotent; a different fingerprint for the same run key is refused and changes nothing", () => {
  const r = rig(); val(r.runner.submit(SUB));
  const q = r.qfs.files.get(`/q/${QUEUE_FILE}`);
  const again = val(r.runner.submit(SUB)); assert.deepEqual([again.queue, again.state], ["exists", "exists"]);
  assert.equal(r.qfs.files.get(`/q/${QUEUE_FILE}`), q);
  assert.equal(code(r.runner.submit({ ...SUB, sourceFingerprint: "fp2" })), "queue:payload-mismatch");
  assert.equal(run(r, again.runId).sourceFingerprint, "fp1");
});

test("submit repairs a queued job whose state was never created (crash between the two writes)", () => {
  const r = rig(); const real = r.store;
  let fail = true;
  const flaky: RunStateStore = { load: (id) => real.load(id), save: (id, e, n) => (fail ? { ok: false, code: "io-error", message: "boom" } : real.save(id, e, n)) };
  const run1 = r.make(flaky);
  assert.equal(code(run1.submit(SUB)), "store:io-error");
  fail = false;
  const again = val(r.runner.submit(SUB)); assert.deepEqual([again.queue, again.state], ["exists", "created"]);
});

test("input validation: ids, fingerprint, lease handle", () => {
  const r = rig();
  for (const bad of [{ ...SUB, tenantId: "../x" }, { ...SUB, runKey: "a/b" }, { ...SUB, runKey: "" }]) assert.equal(code(r.runner.submit(bad)), "queue:invalid-input");
  assert.equal(code(r.runner.submit({ ...SUB, sourceFingerprint: "" })), "runner:invalid-input");
  assert.equal(code(r.runner.claim("w1", "..")), "queue:invalid-input");
  assert.equal(code(r.runner.step({ tenantId: "tA", runKey: "k", workerId: "w", attempt: 1.5 })), "queue:invalid-input");
  assert.equal(code(r.runner.step(null as never)), "queue:invalid-input");
});

test("tenant isolation: ids differ per tenant, claims never cross, a forged lease for another tenant is not-found", () => {
  const r = rig();
  const a = val(r.runner.submit(SUB)), b = val(r.runner.submit({ ...SUB, tenantId: "tB" }));
  assert.notEqual(a.runId, b.runId);
  const la = lease(r, "tA", "w1");
  assert.equal(val(r.runner.claim("w2", "tA")), null, "A's only job is leased");
  const forged: RunnerLease = { ...la, tenantId: "tB" };
  assert.equal(code(r.runner.step(forged)), "queue:not-leased", "the handle resolves to B's OWN ready job, which A's worker does not hold");
  assert.equal(code(r.runner.step({ ...la, tenantId: "tZ" })), "queue:not-found");
  assert.equal(run(r, a.runId).stages.capture!.status, "pending"); assert.equal(run(r, b.runId).stages.capture!.status, "pending");
  const lb = lease(r, "tB", "w2"); assert.equal(lb.tenantId, "tB");
  assert.equal(val(r.runner.claim("w3", "tC")), null);
});

test("a tampered job payload (runKey that does not hash to the job id) is failed, not run", () => {
  const r = rig(); const a = val(r.runner.submit(SUB));
  const raw = JSON.parse(r.qfs.files.get(`/q/${QUEUE_FILE}`)!); raw.jobs[0].payload = { runKey: "other", sourceFingerprint: "fp1" };
  r.qfs.files.set(`/q/${QUEUE_FILE}`, JSON.stringify(raw));
  const c = r.runner.claim("w1", "tA"); assert.equal(code(c), "runner:bad-payload");
  assert.equal(jobs(r.qfs)[0]!.status, "ready"); assert.equal(run(r, a.runId).stages.capture!.status, "pending");
});

test("retryable failure: the same stage is planned again with a NEW attempt id; non-retryable ends the run and finishes the job", () => {
  const r = rig(); val(r.runner.submit(SUB)); const l = lease(r);
  doStage(r, l, "capture", "o1");
  const s1 = val(r.runner.step(l)) as { attempt: { attemptId: string } };
  val(r.runner.fail(l, { stage: "media", attemptId: s1.attempt.attemptId }, "io-error"));
  const s2 = val(r.runner.step(l)) as { kind: string; cause: string; attemptNumber: number; attempt: { attemptId: string } };
  assert.deepEqual([s2.kind, s2.cause, s2.attemptNumber], ["started", "retry-after-failure", 2]);
  assert.notEqual(s2.attempt.attemptId, s1.attempt.attemptId);
  val(r.runner.fail(l, { stage: "media", attemptId: s2.attempt.attemptId }, "io-error")); // attempts exhausted (max 2)
  const end = val(r.runner.step(l)); assert.deepEqual(end, { kind: "failed-terminal", stage: "media", code: "io-error", why: "retry-exhausted" });
  assert.equal(jobs(r.qfs)[0]!.status, "done");
  const r2 = rig(); val(r2.runner.submit(SUB)); const l2 = lease(r2);
  const c = val(r2.runner.step(l2)) as { attempt: { attemptId: string } };
  val(r2.runner.fail(l2, { stage: "capture", attemptId: c.attempt.attemptId }, "bad-media"));
  assert.deepEqual(val(r2.runner.step(l2)), { kind: "failed-terminal", stage: "capture", code: "bad-media", why: "non-retryable" });
});

test("a live attempt of the same run reports waiting and starts nothing", () => {
  const r = rig(); val(r.runner.submit(SUB)); const l = lease(r);
  val(r.runner.step(l)); const before = r.sfs.names().map((n) => r.sfs.files.get(n));
  const s = val(r.runner.step(l)); assert.equal(s.kind, "waiting");
  assert.deepEqual(r.sfs.names().map((n) => r.sfs.files.get(n)), before);
});

test("dead worker: lease expires, a second worker claims, resumes with cause lease-expired; the first worker is fenced and cannot change state", () => {
  const r = rig(); const sub = val(r.runner.submit(SUB));
  const l1 = lease(r, "tA", "w1"); doStage(r, l1, "capture", "o1");
  const s1 = val(r.runner.step(l1)) as { attempt: { stage: string; attemptId: string } };
  r.clock.t += 5000; // both leases dead
  const l2 = lease(r, "tA", "w2");
  const s2 = val(r.runner.step(l2)) as { kind: string; cause: string; attempt: { attemptId: string } };
  assert.deepEqual([s2.kind, s2.cause], ["started", "lease-expired"]);
  const snap = JSON.stringify(run(r, sub.runId)), q = r.qfs.files.get(`/q/${QUEUE_FILE}`);
  assert.equal(code(r.runner.succeed(l1, s1.attempt, "late")), "queue:stale-lease");
  assert.equal(JSON.stringify(run(r, sub.runId)), snap); assert.equal(r.qfs.files.get(`/q/${QUEUE_FILE}`), q);
  assert.equal(code(r.runner.succeed(l2, s1.attempt, "late")), "workflow:stale-attempt", "old attempt id with a live lease is stale-attempt");
  val(r.runner.succeed(l2, s2.attempt as never, "o2"));
  assert.equal(run(r, sub.runId).stages.media!.outputFingerprint, "o2");
});

test("restart: a brand-new runner over the same files resumes from the persisted state", () => {
  const r = rig(); const sub = val(r.runner.submit(SUB)); const l = lease(r);
  doStage(r, l, "capture", "o1"); doStage(r, l, "media", "o2");
  const fresh = r.make(createRunStateStore("/runs", r.sfs));
  const s = val(fresh.step(l)) as { attempt: { stage: string } }; assert.equal(s.attempt.stage, "transcript");
  assert.equal(run(r, sub.runId).stages.media!.outputFingerprint, "o2");
});

test("heartbeat extends both the queue lease and the stage lease", () => {
  const r = rig(); const sub = val(r.runner.submit(SUB)); const l = lease(r);
  const s = val(r.runner.step(l)) as { attempt: { stage: string; attemptId: string } };
  r.clock.t += 900; val(r.runner.heartbeat(l, s.attempt));
  assert.equal(run(r, sub.runId).stages.capture!.heartbeatAt, r.clock.t);
  assert.equal(jobs(r.qfs)[0]!.leaseExpiresAt, r.clock.t + 1000);
  r.clock.t += 900; assert.equal(val(r.runner.step(l)).kind, "waiting", "still alive after 1800 ms because of the heartbeat");
});

test("attempt ids: the default minter never repeats; a repeating minter is refused by the reducer (duplicate-event), never accepted twice", () => {
  const seen = new Set<string>();
  for (const k of ["k1", "k2", "k3"]) {
    const r = rig(); val(r.runner.submit({ ...SUB, runKey: k })); const l = lease(r);
    const s = val(r.runner.step(l)) as { attempt: { attemptId: string } }; seen.add(s.attempt.attemptId);
    assert.match(s.attempt.attemptId, /^[0-9a-f-]{36}$/);
  }
  assert.equal(seen.size, 3);
  const r2 = rig({ mint: () => "same" }); val(r2.runner.submit({ ...SUB, runKey: "k2" })); const l2 = lease(r2, "tA", "w");
  doStage(r2, l2, "capture", "o1");
  const s = val(r2.runner.step(l2)) as { attempt: { attemptId: string } }; assert.equal(s.attempt.attemptId, "same");
  val(r2.runner.fail(l2, { stage: "media", attemptId: "same" }, "io-error"));
  assert.equal(code(r2.runner.step(l2)), "workflow:duplicate-event");
});

test("conflict is retried with a reload and then succeeds; a permanent conflict is returned after the bound; locked and io-error are returned at once", () => {
  let injected = 0, mode: "conflict-once" | "conflict-always" | "locked" | "none" = "none";
  const r = rig({ wrap: (s) => ({ load: (id) => s.load(id), save: (id, e, n) => {
    if (e !== null && mode === "conflict-once" && injected++ === 0) return { ok: false, code: "conflict", message: "x" };
    if (e !== null && mode === "conflict-always") { injected++; return { ok: false, code: "conflict", message: "x" }; }
    if (e !== null && mode === "locked") { injected++; return { ok: false, code: "locked", message: "x" }; }
    return s.save(id, e, n);
  } }) });
  val(r.runner.submit(SUB)); const l = lease(r);
  mode = "conflict-once"; assert.equal(val(r.runner.step(l)).kind, "started"); assert.equal(injected, 2, "one conflict then one clean save");
  const a = val(r.runner.step(l)); assert.equal(a.kind, "waiting");
  mode = "none";
  const r3 = rig({ wrap: (s) => ({ load: (id) => s.load(id), save: (id, e, n) => (e !== null ? { ok: false, code: mode === "locked" ? "locked" : "conflict", message: "x" } : s.save(id, e, n)) }) });
  val(r3.runner.submit(SUB)); const lx = lease(r3);
  mode = "conflict-always"; assert.equal(code(r3.runner.step(lx)), "store:conflict");
  mode = "locked"; assert.equal(code(r3.runner.step(lx)), "store:locked");
});

test("a job whose run state is missing is failed in the queue and reported as run-missing", () => {
  const r = rig(); const sub = val(r.runner.submit(SUB)); const l = lease(r);
  for (const k of [...r.sfs.files.keys()]) if (k.includes(sub.runId)) r.sfs.files.delete(k);
  assert.equal(code(r.runner.step(l)), "runner:run-missing");
  assert.equal(jobs(r.qfs)[0]!.status, "ready", "failed back to ready (attempts remain)");
});

test("optional skip: only a ready optional stage can be skipped", () => {
  const r = rig(); val(r.runner.submit(SUB)); const l = lease(r);
  assert.equal(code(r.runner.skip(l, "screen")), "workflow:invalid-transition", "screen is not ready yet");
  assert.equal(code(r.runner.skip(l, "capture")), "workflow:invalid-transition");
  doStage(r, l, "capture", "o1"); doStage(r, l, "media", "o2"); doStage(r, l, "transcript", "o3");
  val(r.runner.skip(l, "screen"));
});

test("real filesystem round trip (single process): queue and store files on disk, no temp files left", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-runner-"));
  try {
    let now = 50_000;
    const queue = new FileJobQueue({ dir: path.join(dir, "q"), now: () => now, leaseMs: 1000 });
    const store = createRunStateStore(path.join(dir, "runs"));
    const runner = createPipelineRunner({ def: DEF, queue, store, now: () => now });
    val(runner.submit(SUB)); const c = val(runner.claim("w1", "tA"))!;
    for (const [i, name] of ["capture", "media", "transcript"].entries()) {
      const s = val(runner.step(c.lease)) as { attempt: { stage: string; attemptId: string } }; assert.equal(s.attempt.stage, name);
      val(runner.succeed(c.lease, s.attempt, `o${i}`)); now += 10;
    }
    val(runner.skip(c.lease, "screen"));
    const s = val(runner.step(c.lease)) as { attempt: { stage: string; attemptId: string } }; val(runner.succeed(c.lease, s.attempt, "oi"));
    assert.deepEqual(val(runner.step(c.lease)), { kind: "complete" });
    assert.deepEqual(readdirSync(path.join(dir, "runs")).filter((n) => n.endsWith(".tmp") || n.endsWith(".lock")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("every queue call carries the tenant: claim is restricted and every LeaseRef has tenantId (queue BEFORE-WIRING 3)", () => {
  const qfs = new MemQueueFs(); let t = 1000;
  const inner = new FileJobQueue({ dir: "/q", now: () => t, leaseMs: 1000, fs: qfs });
  const claims: unknown[] = [], refs: Array<{ tenantId?: string }> = [];
  const spy = { enqueue: (i: never) => inner.enqueue(i), claim: (w: string, o: { tenantId: string }) => { claims.push(o.tenantId); return inner.claim(w, o); },
    heartbeat: (x: { tenantId?: string }) => { refs.push(x); return inner.heartbeat(x as never); }, complete: (x: { tenantId?: string }) => { refs.push(x); return inner.complete(x as never); },
    fail: (x: { tenantId?: string }, c: string) => { refs.push(x); return inner.fail(x as never, c); } };
  const runner = createPipelineRunner({ def: DEF, queue: spy as never, store: createRunStateStore("/runs", new FakeRunStateFs()), now: () => t });
  val(runner.submit(SUB)); const c = val(runner.claim("w1", "tA"))!;
  const s = val(runner.step(c.lease)) as { attempt: { stage: string; attemptId: string } }; val(runner.fail(c.lease, s.attempt, "x"));
  assert.deepEqual(claims, ["tA"]); assert.ok(refs.length >= 2 && refs.every((x) => x.tenantId === "tA"), JSON.stringify(refs));
});
