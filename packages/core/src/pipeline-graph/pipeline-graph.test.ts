import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WEBINAR_PIPELINE } from "../domain/pipeline-workflow.js";
import { FileJobQueue } from "../job-queue/file-job-queue.js";
import { MemQueueFs } from "../job-queue/mem-queue-fs.testkit.js";
import { decodeQueue, QUEUE_FILE } from "../job-queue/queue-store.js";
import { createRunStateStore } from "../run-state-store/run-state-store.js";
import { FakeRunStateFs } from "../run-state-store/run-state-fake-fs.js";
import { createPipelineRunner } from "../pipeline-runner/pipeline-runner.js";
import type { PipelineRunner, RunnerLease, RunnerResult } from "../pipeline-runner/runner-types.js";
import { buildGraph, runGraph } from "./pipeline-graph.js";
import type { NodeContext, NodeHandler, NodeResult, PipelineGraph } from "./graph-types.js";

const DEF = { ...WEBINAR_PIPELINE, leaseMs: 1000 };
const STAGES = DEF.stages.map((s) => s.name);
const fp = (...p: string[]) => createHash("sha256").update(p.join("\0")).digest("hex").slice(0, 16);
class Crash extends Error {}

function rig(def: typeof DEF = DEF) {
  const qfs = new MemQueueFs(), sfs = new FakeRunStateFs(), clock = { t: 10_000 };
  const queue = new FileJobQueue({ dir: "/q", now: () => clock.t, leaseMs: 1000, fs: qfs });
  const store = createRunStateStore("/runs", sfs);
  const runner = createPipelineRunner({ def, queue, store, now: () => clock.t });
  return { qfs, clock, runner };
}
const val = <T>(r: RunnerResult<T>): T => { assert.ok(r.ok, JSON.stringify(r)); return (r as { ok: true; value: T }).value; };
const jobs = (qfs: MemQueueFs) => { const d = decodeQueue(qfs.files.get(`/q/${QUEUE_FILE}`) ?? ""); assert.ok(d.ok); return d.value.jobs; };
const SUB = { tenantId: "tA", runKey: "sess-1", sourceFingerprint: "fp1" };
function claim(runner: PipelineRunner, tenantId = "tA", worker = "w1"): RunnerLease { const c = val(runner.claim(worker, tenantId)); assert.ok(c); return c.lease; }

/** Fake stages: deterministic output fingerprint of (tenant, run, stage, input). Records every call. */
function fakes(overrides: Partial<Record<string, (c: NodeContext) => NodeResult>> = {}) {
  const calls: NodeContext[] = [];
  const handlers: Record<string, NodeHandler> = {};
  for (const s of STAGES) handlers[s] = (c) => { calls.push(c); return overrides[s]?.(c) ?? { kind: "ok", outputFingerprint: fp(c.tenantId, c.runKey, c.stage, c.inputFingerprint) }; };
  return { calls, handlers };
}
function graphOf(handlers: Record<string, NodeHandler>, skip?: string[]): PipelineGraph { const g = buildGraph(DEF, handlers, { skip }); assert.ok(g.ok, JSON.stringify(g)); return (g as { ok: true; graph: PipelineGraph }).graph; }

test("graph order: nodes run in the definition's dependency order and the job finishes", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const g = graphOf(f.handlers);
  assert.deepEqual(g.nodes.map((n) => n.name), STAGES);
  assert.deepEqual(g.nodes.find((n) => n.name === "index")!.deps, ["screen"]);
  const res = await runGraph({ runner: r.runner, graph: g, lease: claim(r.runner) });
  assert.deepEqual([res.outcome, res.ran, res.skipped], ["complete", STAGES, []]);
  assert.equal(jobs(r.qfs)[0]!.status, "done");
});

test("ISS-T050GRAPH-001 skip-screen: skipping screen while index runs is refused (record-commands.ts:90 --index requires --process-video)", () => {
  const f = fakes();
  const g = buildGraph(DEF, f.handlers, { skip: ["screen"] });
  assert.equal(g.ok, false);
  assert.match((g as { error: string }).error, /cannot skip stage screen: stage index requires it/);
  assert.match((g as { error: string }).error, /--index requires --process-video/);
  assert.deepEqual(f.calls, [], "no handler ran");
});

test("a skipped optional LEAF stage (nothing depends on it) is still skipped cleanly and the job finishes", async () => {
  const def = { ...DEF, stages: [...DEF.stages, { name: "notify", deps: ["index"], optional: true, maxAttempts: 1, retryable: [] as string[] }] };
  const r = rig(def), f = fakes(); f.handlers.notify = f.handlers.capture!; val(r.runner.submit(SUB));
  const b = buildGraph(def, f.handlers, { skip: ["notify"] }); assert.ok(b.ok);
  const res = await runGraph({ runner: r.runner, graph: (b as { ok: true; graph: PipelineGraph }).graph, lease: claim(r.runner) });
  assert.deepEqual([res.outcome, res.ran, res.skipped], ["complete", STAGES, ["notify"]]);
});

test("ISS-T050GRAPH-001 screen-failed: a failed screen is failed-terminal and index never runs", async () => {
  const r = rig(), f = fakes({ screen: () => ({ kind: "fail", code: "bad-frames" }) }); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner) });
  assert.equal(res.outcome, "failed-terminal");
  assert.equal(res.failedTerminal!.stage, "screen");
  assert.deepEqual(f.calls.map((c) => c.stage), ["capture", "media", "transcript", "screen"]);
});

test("graph order: with the optional node enabled all five run in order, each fed its upstream's output fingerprint", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner) });
  assert.deepEqual([res.outcome, res.ran], ["complete", STAGES]);
  assert.equal(f.calls[0]!.inputFingerprint, "source:fp1");
  assert.notEqual(f.calls[1]!.inputFingerprint, f.calls[0]!.inputFingerprint);
  assert.ok(f.calls.every((c) => c.tenantId === "tA" && c.runKey === "sess-1" && c.attemptNumber === 1 && c.cause === "first-run"));
});

test("resume after a crash mid-graph: finished stages are not re-run, the interrupted one resumes with lease-expired, downstream inputs match an uncrashed run", async () => {
  const clean = rig(), cf = fakes(); val(clean.runner.submit(SUB));
  await runGraph({ runner: clean.runner, graph: graphOf(cf.handlers), lease: claim(clean.runner) });

  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  let succeeds = 0;
  const crashing: PipelineRunner = { ...r.runner, succeed: (l, a, o) => { if (++succeeds === 3) throw new Crash("power cut after transcript ran, before it was recorded"); return r.runner.succeed(l, a, o); } };
  await assert.rejects(runGraph({ runner: crashing, graph: graphOf(f.handlers), lease: claim(r.runner, "tA", "w1") }), Crash);
  assert.deepEqual(f.calls.map((c) => c.stage), ["capture", "media", "transcript"]);
  r.clock.t += 5000; // the dead worker's queue lease and stage attempt both lapse
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner, "tA", "w2") });
  assert.deepEqual([res.outcome, res.ran], ["complete", ["transcript", "screen", "index"]]);
  const again = f.calls.slice(3);
  assert.deepEqual(again.map((c) => c.stage), ["transcript", "screen", "index"]);
  assert.equal(again[0]!.cause, "lease-expired"); assert.equal(again[0]!.attemptNumber, 2);
  assert.equal(f.calls.filter((c) => c.stage === "capture" || c.stage === "media").length, 2, "capture and media ran exactly once");
  assert.deepEqual(again.slice(1).map((c) => c.inputFingerprint), cf.calls.slice(3).map((c) => c.inputFingerprint), "idempotent: downstream inputs equal the uncrashed run's");
  assert.equal(jobs(r.qfs)[0]!.status, "done");
});

test("resume after a crash inside a node (handler never returns): the next worker re-runs only that node", async () => {
  const r = rig(); val(r.runner.submit(SUB));
  let steps = 0;
  const dying: PipelineRunner = { ...r.runner, step: (l) => { const s = r.runner.step(l); if (++steps === 2) throw new Crash("died right after media was started"); return s; } };
  await assert.rejects(runGraph({ runner: dying, graph: graphOf(fakes().handlers), lease: claim(r.runner, "tA", "w1") }), Crash);
  r.clock.t += 5000;
  const g = fakes();
  const res = await runGraph({ runner: r.runner, graph: graphOf(g.handlers), lease: claim(r.runner, "tA", "w2") });
  assert.deepEqual([res.outcome, res.ran], ["complete", ["media", "transcript", "screen", "index"]]);
  assert.equal(g.calls[0]!.cause, "lease-expired");
});

test("a completed run is idempotent: running the graph again on the same lease runs no node", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const l = claim(r.runner); const g = graphOf(f.handlers);
  await runGraph({ runner: r.runner, graph: g, lease: l });
  const n = f.calls.length;
  const again = await runGraph({ runner: r.runner, graph: g, lease: l });
  assert.equal(f.calls.length, n); assert.deepEqual(again.ran, []);
  assert.equal(again.outcome, "error"); assert.equal(again.error!.code, "terminal", "the job is finished, so the queue refuses the old lease");
});

test("a node failure stops downstream nodes: a non-retryable code ends the run and nothing after it runs", async () => {
  const r = rig(), f = fakes({ transcript: () => ({ kind: "fail", code: "bad-audio" }) }); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner) });
  assert.equal(res.outcome, "failed-terminal");
  assert.deepEqual(res.failedTerminal, { stage: "transcript", code: "bad-audio", why: "non-retryable" });
  assert.deepEqual(f.calls.map((c) => c.stage), ["capture", "media", "transcript"]);
});

test("a retryable failure retries the SAME node with a rising attempt number, then stops downstream when attempts run out; a transient failure recovers", async () => {
  const r = rig(), f = fakes({ media: () => ({ kind: "fail", code: "io-error" }) }); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner) });
  assert.deepEqual(res.failedTerminal, { stage: "media", code: "io-error", why: "retry-exhausted" });
  assert.deepEqual(f.calls.map((c) => `${c.stage}#${c.attemptNumber}`), ["capture#1", "media#1", "media#2"]);
  let n = 0; const g = fakes({ media: (c) => (++n === 1 ? { kind: "fail", code: "io-error" } : { kind: "ok", outputFingerprint: fp(c.inputFingerprint) }) });
  const r2 = rig(); val(r2.runner.submit(SUB));
  assert.equal((await runGraph({ runner: r2.runner, graph: graphOf(g.handlers), lease: claim(r2.runner) })).outcome, "complete");
});

test("a throwing handler is a failed attempt (node-threw, non-retryable), not an executor crash, and its message is not recorded", async () => {
  const r = rig(), f = fakes({ capture: () => { throw new Error("secret-token-123"); } }); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner) });
  assert.deepEqual(res.failedTerminal, { stage: "capture", code: "node-threw", why: "non-retryable" });
  assert.equal(JSON.stringify(res).includes("secret-token-123"), false);
  const bad = fakes({ capture: () => ({ kind: "ok", outputFingerprint: "" }) }); const r2 = rig(); val(r2.runner.submit(SUB));
  assert.equal((await runGraph({ runner: r2.runner, graph: graphOf(bad.handlers), lease: claim(r2.runner) })).failedTerminal!.code, "bad-node-result");
});

test("tenant isolation: the same run key in two tenants runs separately; a failure in one never touches the other; handlers only see their own tenant", async () => {
  const r = rig();
  const fa = fakes({ transcript: (c) => (c.tenantId === "tA" ? { kind: "fail", code: "bad-audio" } : { kind: "ok", outputFingerprint: fp(c.stage, c.inputFingerprint) }) });
  const a = val(r.runner.submit(SUB)), b = val(r.runner.submit({ ...SUB, tenantId: "tB" }));
  assert.notEqual(a.runId, b.runId);
  const la = claim(r.runner, "tA", "w1"), lb = claim(r.runner, "tB", "w2");
  const g = graphOf(fa.handlers);
  const ra = await runGraph({ runner: r.runner, graph: g, lease: la }), rb = await runGraph({ runner: r.runner, graph: g, lease: lb });
  assert.equal(ra.outcome, "failed-terminal"); assert.equal(rb.outcome, "complete");
  assert.deepEqual(fa.calls.filter((c) => c.tenantId === "tA").map((c) => c.stage), ["capture", "media", "transcript"]);
  assert.deepEqual(fa.calls.filter((c) => c.tenantId === "tB").map((c) => c.stage), STAGES);
  assert.equal(fa.calls.length, 8);
  // a lease re-labelled to the other tenant drives nothing: no handler runs
  const r2 = rig(), f2 = fakes(); val(r2.runner.submit(SUB)); val(r2.runner.submit({ ...SUB, tenantId: "tB" }));
  const l2 = claim(r2.runner, "tA");
  const forged = await runGraph({ runner: r2.runner, graph: graphOf(f2.handlers), lease: { ...l2, tenantId: "tB" } });
  assert.equal(forged.outcome, "error"); assert.equal(f2.calls.length, 0);
  assert.equal(val(r2.runner.claim("w9", "tC")), null);
});

test("a worker whose lease was superseded is refused before any node runs", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const l1 = claim(r.runner, "tA", "w1"); r.clock.t += 5000; claim(r.runner, "tA", "w2");
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: l1 });
  assert.equal(res.outcome, "error"); assert.equal(res.error!.code, "stale-lease"); assert.equal(f.calls.length, 0);
});

test("a live attempt elsewhere reports waiting and runs nothing", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const l = claim(r.runner); val(r.runner.step(l)); // capture started, never finished
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: l });
  assert.equal(res.outcome, "waiting"); assert.equal(f.calls.length, 0);
});

test("buildGraph validates against the definition: missing, unknown and non-optional skips are refused; inherited handlers do not count", () => {
  const f = fakes();
  const { capture: _c, ...missing } = f.handlers;
  assert.match((buildGraph(DEF, missing) as { error: string }).error, /missing handler for stage: capture/);
  assert.match((buildGraph(DEF, { ...f.handlers, bogus: f.handlers.capture! }) as { error: string }).error, /unknown stage: bogus/);
  assert.match((buildGraph(DEF, f.handlers, { skip: ["index"] }) as { error: string }).error, /not optional/);
  assert.match((buildGraph(DEF, f.handlers, { skip: ["nope"] }) as { error: string }).error, /not optional/);
  assert.equal(buildGraph(DEF, f.handlers, { skip: ["screen", "index"] }).ok, false, "index is not optional, so it can never be skipped to make a screen skip legal");
  assert.equal(buildGraph(DEF, Object.create(f.handlers) as Record<string, NodeHandler>).ok, false);
});

test("the iteration cap stops a graph that never settles", async () => {
  const r = rig(), f = fakes(); val(r.runner.submit(SUB));
  const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner), maxIterations: 2 });
  assert.equal(res.outcome, "error"); assert.equal(res.error!.code, "iteration-cap"); assert.equal(f.calls.length, 2);
});

test("cap boundaries preserve zero work and require a final planner step after the last stage", async () => {
  for (const cap of [0, -1, Number.NaN, STAGES.length, STAGES.length + 1]) {
    const r = rig(), f = fakes(); val(r.runner.submit(SUB));
    const res = await runGraph({ runner: r.runner, graph: graphOf(f.handlers), lease: claim(r.runner), maxIterations: cap });
    assert.equal(f.calls.length, cap >= STAGES.length ? STAGES.length : 0);
    assert.equal(res.outcome, cap > STAGES.length ? "complete" : "error");
    if (res.outcome === "error") assert.equal(res.error!.code, "iteration-cap");
  }
});

test("long retry workflows use the caller cap rather than LangGraph's default recursion ceiling", async () => {
  const def = { ...DEF, stages: DEF.stages.map(s => s.name === "media" ? { ...s, maxAttempts: 30 } : s) };
  const r = rig(def); let attempts = 0;
  const f = fakes({ media: c => ++attempts < 30 ? { kind: "fail", code: "io-error" } : { kind: "ok", outputFingerprint: fp(c.inputFingerprint) } });
  val(r.runner.submit(SUB));
  const built = buildGraph(def, f.handlers); assert.ok(built.ok);
  const res = await runGraph({ runner: r.runner, graph: built.graph, lease: claim(r.runner), maxIterations: 40 });
  assert.equal(res.outcome, "complete"); assert.equal(attempts, 30);
  assert.equal(res.ran.length, 34); assert.equal(f.calls.at(-1)!.stage, "index");
});

test("workflow stage names remain independent of library reserved names", async () => {
  const names = ["__start__", "__end__", "planner", "stage_0"];
  const def = { ...DEF, stages: names.map((name, i) => ({ name, deps: i ? [names[i - 1]!] : [], optional: false, maxAttempts: 1, retryable: [] as string[] })) };
  const r = rig(def), calls: string[] = [];
  const handlers = Object.fromEntries(names.map(name => [name, () => { calls.push(name); return { kind: "ok" as const, outputFingerprint: fp(name) }; }]));
  val(r.runner.submit(SUB)); const built = buildGraph(def, handlers); assert.ok(built.ok);
  const res = await runGraph({ runner: r.runner, graph: built.graph, lease: claim(r.runner) });
  assert.equal(res.outcome, "complete"); assert.deepEqual(calls, names);
});
