import { test } from "node:test";
import assert from "node:assert/strict";
import { WEBINAR_PIPELINE as DEF, initialState, planNext, type RunState, type WorkflowDef } from "./pipeline-workflow.js";
import { applyEvent, type WorkflowEvent } from "./pipeline-workflow-reduce.js";

const NAMES = DEF.stages.map((s) => s.name);
const LEASE = DEF.leaseMs;
let seq = 0;
const aid = () => `a${++seq}`;

function step(def: WorkflowDef, s: RunState, ev: WorkflowEvent): RunState {
  const r = applyEvent(def, s, ev);
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; state: RunState }).state;
}
/** Start the planner's single ready stage and return state + attempt id. */
function startStage(s: RunState, stage: string, at: number, def = DEF): { s: RunState; id: string } {
  const ready = planNext(def, s, at).ready.find((r) => r.stage === stage);
  assert.ok(ready, `${stage} not ready`);
  const id = aid();
  return { s: step(def, s, { type: "stage-started", stage, attemptId: id, at, inputFingerprint: ready.inputFingerprint }), id };
}
function runStage(s: RunState, stage: string, at: number, out = `out-${stage}`): RunState {
  const a = startStage(s, stage, at);
  return step(DEF, a.s, { type: "stage-succeeded", stage, attemptId: a.id, at: at + 1, outputFingerprint: out });
}
function upTo(n: number, at = 1000): RunState {
  let s = initialState(DEF, "src1");
  for (let i = 0; i < n; i++) s = runStage(s, NAMES[i]!, at + i * 10);
  return s;
}
const readyNames = (s: RunState, now: number) => planNext(DEF, s, now).ready.map((r) => r.stage);

test("happy path: stage by stage, one ready at a time, then complete", () => {
  let s = initialState(DEF, "src1");
  for (let i = 0; i < NAMES.length; i++) {
    const p = planNext(DEF, s, 5000);
    assert.equal(p.outcome, "ready");
    assert.deepEqual(p.ready.map((r) => r.stage), [NAMES[i]]);
    assert.equal(p.ready[0]!.cause, "first-run");
    assert.equal(p.blocked.length, NAMES.length - i - 1);
    s = runStage(s, NAMES[i]!, 5000 + i * 10);
  }
  const done = planNext(DEF, s, 9000);
  assert.equal(done.outcome, "complete");
  assert.equal(done.resumable, false);
  assert.deepEqual(done.ready, []);
});

test("dependency: a stage whose dependency is not done is blocked and cannot be started", () => {
  const s = initialState(DEF, "src1");
  const p = planNext(DEF, s, 1);
  assert.deepEqual(p.blocked.find((b) => b.stage === "transcript"), { stage: "transcript", reason: "dependency-not-done:media" });
  const r = applyEvent(DEF, s, { type: "stage-started", stage: "transcript", attemptId: "x", at: 1, inputFingerprint: "media:out-media" });
  assert.deepEqual(r.ok === false && r.error.code, "dependency-not-done");
});

for (let i = 0; i < NAMES.length; i++) {
  const stage = NAMES[i]!;
  const def = DEF.stages[i]!;
  test(`resume after retryable failure at stage ${stage}: re-runs exactly that stage, nothing completed`, () => {
    const base = upTo(i);
    const a = startStage(base, stage, 2000);
    const code = def.retryable[0] ?? "boom";
    const failed = step(DEF, a.s, { type: "stage-failed", stage, attemptId: a.id, at: 2001, errorCode: code });
    const p = planNext(DEF, failed, 2002);
    if (def.maxAttempts === 1 || !def.retryable.includes(code)) {
      assert.equal(p.outcome, "failed-terminal");
      assert.equal(p.terminal?.stage, stage);
      assert.equal(p.terminal?.why, def.retryable.includes(code) ? "retry-exhausted" : "non-retryable");
    } else {
      assert.equal(p.outcome, "ready");
      assert.deepEqual(p.ready.map((r) => r.stage), [stage]);
      assert.equal(p.ready[0]!.cause, "retry-after-failure");
      assert.equal(p.ready[0]!.attempt, 2);
    }
    for (let j = 0; j < i; j++) assert.equal(failed.stages[NAMES[j]!]!.status, "done");
  });

  test(`resume after dead worker (stale running) at stage ${stage}: re-runs only that stage`, () => {
    const base = upTo(i);
    const a = startStage(base, stage, 3000);
    assert.deepEqual(planNext(DEF, a.s, 3000 + LEASE - 1).ready, []);
    assert.equal(planNext(DEF, a.s, 3000 + LEASE - 1).outcome, "waiting");
    const p = planNext(DEF, a.s, 3000 + LEASE);
    if (def.maxAttempts === 1) { assert.equal(p.outcome, "failed-terminal"); return; }
    assert.deepEqual(p.ready.map((r) => r.stage), [stage]);
    assert.equal(p.ready[0]!.cause, "lease-expired");
    assert.equal(p.ready[0]!.attempt, 2);
  });
}

test("heartbeat extends the lease: not stale until leaseMs after the last heartbeat", () => {
  const a = startStage(upTo(2), "transcript", 4000);
  const hb = step(DEF, a.s, { type: "heartbeat", stage: "transcript", attemptId: a.id, at: 4000 + LEASE - 5 });
  assert.equal(planNext(DEF, hb, 4000 + LEASE + 10).outcome, "waiting");
  assert.equal(planNext(DEF, hb, 4000 + LEASE - 5 + LEASE).ready[0]?.cause, "lease-expired");
});

test("retry budget is bounded: attempt cap is exactly maxAttempts (transcript = 3)", () => {
  let s = upTo(2);
  for (let n = 1; n <= 3; n++) {
    const p = planNext(DEF, s, 6000 + n * 10);
    assert.equal(p.outcome, "ready", `attempt ${n} must still be allowed`);
    assert.equal(p.ready[0]!.attempt, n);
    const a = startStage(s, "transcript", 6000 + n * 10);
    s = step(DEF, a.s, { type: "stage-failed", stage: "transcript", attemptId: a.id, at: 6001 + n * 10, errorCode: "rate-limited" });
  }
  const p = planNext(DEF, s, 7000);
  assert.equal(p.outcome, "failed-terminal");
  assert.deepEqual(p.terminal, { stage: "transcript", code: "rate-limited", why: "retry-exhausted" });
  assert.equal(p.resumable, false);
  assert.deepEqual(p.ready, []);
  const r = applyEvent(DEF, s, { type: "stage-started", stage: "transcript", attemptId: "late", at: 7000, inputFingerprint: "media:out-media" });
  assert.equal(r.ok === false && r.error.code, "run-terminal");
});

test("dead workers also burn the attempt budget: lease-expired on the last attempt is terminal", () => {
  let s = upTo(2);
  let t = 8000;
  for (let n = 1; n <= 3; n++) { s = startStage(s, "transcript", t).s; t += LEASE; }
  const p = planNext(DEF, s, t);
  assert.equal(p.outcome, "failed-terminal");
  assert.deepEqual(p.terminal, { stage: "transcript", code: "lease-expired", why: "retry-exhausted" });
});

test("non-retryable error code is terminal even with attempts left (retryable set is honoured)", () => {
  const a = startStage(upTo(2), "transcript", 9000);
  const s = step(DEF, a.s, { type: "stage-failed", stage: "transcript", attemptId: a.id, at: 9001, errorCode: "unsupported-codec" });
  const p = planNext(DEF, s, 9002);
  assert.deepEqual(p.terminal, { stage: "transcript", code: "unsupported-codec", why: "non-retryable" });
  assert.equal(p.outcome, "failed-terminal");
});

test("late event from a superseded attempt is rejected and changes nothing", () => {
  const a1 = startStage(upTo(2), "transcript", 10000);
  const a2 = startStage(a1.s, "transcript", 10000 + LEASE); // supersedes the dead worker
  assert.equal(a2.s.stages.transcript!.attempt, 2);
  const frozen = JSON.stringify(a2.s);
  for (const ev of [
    { type: "stage-succeeded", stage: "transcript", attemptId: a1.id, at: 10000 + LEASE + 5, outputFingerprint: "evil" },
    { type: "stage-failed", stage: "transcript", attemptId: a1.id, at: 10000 + LEASE + 5, errorCode: "rate-limited" },
    { type: "heartbeat", stage: "transcript", attemptId: a1.id, at: 10000 + LEASE + 5 },
  ] as WorkflowEvent[]) {
    const r = applyEvent(DEF, a2.s, ev);
    assert.equal(r.ok === false && r.error.code, "stale-attempt");
  }
  assert.equal(JSON.stringify(a2.s), frozen);
  const fin = step(DEF, a2.s, { type: "stage-succeeded", stage: "transcript", attemptId: a2.id, at: 10000 + LEASE + 9, outputFingerprint: "t-ok" });
  assert.equal(fin.stages.transcript!.outputFingerprint, "t-ok");
});

test("a live lease cannot be superseded (never two running attempts of one stage)", () => {
  const a1 = startStage(upTo(2), "transcript", 11000);
  const r = applyEvent(DEF, a1.s, { type: "stage-started", stage: "transcript", attemptId: "second", at: 11000 + LEASE - 1, inputFingerprint: "media:out-media" });
  assert.equal(r.ok === false && r.error.code, "already-running");
});

test("impossible transitions: succeeded/failed/heartbeat without started, started on a done stage", () => {
  const s = upTo(1);
  for (const ev of [
    { type: "stage-succeeded", stage: "media", attemptId: "z", at: 5, outputFingerprint: "o" },
    { type: "stage-failed", stage: "media", attemptId: "z", at: 5, errorCode: "io-error" },
    { type: "heartbeat", stage: "media", attemptId: "z", at: 5 },
  ] as WorkflowEvent[]) {
    const r = applyEvent(DEF, s, ev);
    assert.equal(r.ok === false && r.error.code, "invalid-transition");
  }
  const dup = applyEvent(DEF, s, { type: "stage-started", stage: "capture", attemptId: "q", at: 2000, inputFingerprint: "source:src1" });
  assert.equal(dup.ok === false && dup.error.code, "already-done");
  const wrong = applyEvent(DEF, s, { type: "stage-started", stage: "media", attemptId: "q", at: 2000, inputFingerprint: "capture:WRONG" });
  assert.equal(wrong.ok === false && wrong.error.code, "input-mismatch");
});

test("duplicate delivery is a typed rejection and a no-op (decision: reject, never re-apply)", () => {
  const a = startStage(upTo(2), "transcript", 12000);
  const ev: WorkflowEvent = { type: "stage-succeeded", stage: "transcript", attemptId: a.id, at: 12005, outputFingerprint: "t1" };
  const once = step(DEF, a.s, ev);
  const twice = applyEvent(DEF, once, ev);
  assert.equal(twice.ok === false && twice.error.code, "duplicate-event");
  const failEv: WorkflowEvent = { type: "stage-failed", stage: "transcript", attemptId: a.id, at: 12006, errorCode: "rate-limited" };
  assert.equal((applyEvent(DEF, once, failEv) as { error: { code: string } }).error.code, "invalid-transition");
  const startAgain = applyEvent(DEF, a.s, { type: "stage-started", stage: "transcript", attemptId: a.id, at: 12001, inputFingerprint: "media:out-media" });
  assert.equal(startAgain.ok === false && startAgain.error.code, "duplicate-event");
});

test("determinism and immutability: same inputs give the same plan; frozen state is accepted", () => {
  const s = upTo(4);
  const deepFreeze = (o: unknown): void => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } };
  deepFreeze(s);
  assert.deepEqual(planNext(DEF, s, 777), planNext(DEF, s, 777));
  const r = applyEvent(DEF, s, { type: "stage-started", stage: "index", attemptId: "i1", at: 800, inputFingerprint: "screen:out-screen" });
  assert.equal(r.ok, true);
});

test("upstream output change invalidates exactly the downstream closure, nothing upstream", () => {
  const complete = upTo(5);
  assert.equal(planNext(DEF, complete, 2e4).outcome, "complete");
  // media is re-run and now produces a different output fingerprint
  const changed: RunState = { ...complete, stages: { ...complete.stages, media: { ...complete.stages.media!, outputFingerprint: "out-media-v2" } } };
  const p = planNext(DEF, changed, 2e4);
  assert.equal(p.outcome, "ready");
  assert.deepEqual(p.ready.map((r) => r.stage), ["transcript"]);
  assert.equal(p.ready[0]!.cause, "input-changed");
  assert.deepEqual(p.blocked.map((b) => b.stage), ["screen", "index"], "two levels below the change must also be invalid");
  assert.equal(p.blocked.find((b) => b.stage === "index")!.reason, "dependency-not-done:screen");
  // drive it: transcript, screen, index re-run, capture and media never
  const reran: string[] = [];
  let s = changed;
  for (let t = 0; t < 10; t++) {
    const pl = planNext(DEF, s, 2e4 + t);
    if (pl.outcome === "complete") break;
    const st = pl.ready[0]!.stage;
    reran.push(st);
    s = runStage(s, st, 2e4 + t * 10, `out-${st}-v2`);
  }
  assert.deepEqual(reran, ["transcript", "screen", "index"]);
  assert.equal(planNext(DEF, s, 3e4).outcome, "complete");
});

test("re-run that reproduces the same output fingerprint leaves downstream valid", () => {
  const complete = upTo(5);
  const changed: RunState = { ...complete, stages: { ...complete.stages, media: { ...complete.stages.media!, outputFingerprint: "out-media-v2" } } };
  const s = runStage(changed, "transcript", 2e4, "out-transcript");
  assert.equal(planNext(DEF, s, 2e4 + 50).outcome, "complete");
});

test("source fingerprint change invalidates the whole chain from the root", () => {
  const s: RunState = { ...upTo(5), sourceFingerprint: "src2" };
  const p = planNext(DEF, s, 2e4);
  assert.deepEqual(p.ready.map((r) => r.stage), ["capture"]);
  assert.equal(p.blocked.length, 4);
});

test("optional stage: clean skip satisfies dependents and completes; skip of a required stage is rejected", () => {
  let s = upTo(3);
  const bad = applyEvent(DEF, upTo(0), { type: "stage-skipped", stage: "capture", at: 1, inputFingerprint: "source:src1" });
  assert.equal(bad.ok === false && bad.error.code, "invalid-transition");
  s = step(DEF, s, { type: "stage-skipped", stage: "screen", at: 3000, inputFingerprint: "transcript:out-transcript" });
  assert.deepEqual(readyNames(s, 3001), ["index"]);
  s = runStage(s, "index", 3002);
  assert.equal(planNext(DEF, s, 3100).outcome, "complete");
});

test("a skipped stage carrying an error is never reported complete (failed-terminal)", () => {
  const s = upTo(5);
  const hostile: RunState = { ...s, stages: { ...s.stages, screen: { ...s.stages.screen!, status: "skipped", errorCode: "provider-5xx", outputFingerprint: "skipped" } } };
  const p = planNext(DEF, hostile, 2e4);
  assert.notEqual(p.outcome, "complete");
  assert.equal(p.outcome, "failed-terminal");
  assert.equal(p.terminal?.why, "skipped-with-error");
});

test("hostile definitions, states, times and events yield typed errors and never throw", () => {
  const s = initialState(DEF, "src1");
  const bad = (st: unknown, now: unknown = 1) => planNext(DEF, st as RunState, now as number);
  const withStage = (patch: Record<string, unknown>) => ({ ...s, stages: { ...s.stages, media: { ...s.stages.media!, ...patch } } });
  const cases: unknown[] = [
    null, undefined, 42, "x", [], {}, { sourceFingerprint: "s" }, { sourceFingerprint: "", stages: {} },
    { ...s, stages: { ...s.stages, ghost: s.stages.media } },
    withStage({ attempt: -1 }), withStage({ attempt: 1.5 }), withStage({ attempt: NaN }), withStage({ status: "exploded" }),
    withStage({ heartbeatAt: NaN }), withStage({ heartbeatAt: Infinity }), withStage({ status: "running" }),
    withStage({ attemptId: 7 }), withStage({ status: "done" }),
  ];
  for (const c of cases) { const p = bad(c); assert.equal(p.outcome, "invalid", JSON.stringify(c)); assert.ok(p.errors.length > 0); assert.equal(p.resumable, false); }
  for (const now of [NaN, Infinity, -Infinity, "1", null]) assert.equal(bad(s, now).errors[0]!.code, "bad-now");
  assert.equal(planNext(DEF, s, undefined as unknown as number).errors[0]!.code, "bad-now");
  const ev = (o: unknown) => applyEvent(DEF, s, o as WorkflowEvent);
  const events: unknown[] = [
    null, 5, "e", {}, { type: "nope", stage: "capture", at: 1 }, { type: "heartbeat", stage: "ghost", at: 1, attemptId: "a" },
    { type: "heartbeat", stage: "capture", at: NaN, attemptId: "a" }, { type: "stage-started", stage: "capture", at: 1, attemptId: "", inputFingerprint: "x" },
    { type: "stage-started", stage: "capture", at: 1, attemptId: 9, inputFingerprint: "x" }, { type: "stage-succeeded", stage: "capture", at: 1, attemptId: "a" },
    { type: "stage-started", stage: { toString() { throw new Error("hostile"); } }, at: 1 },
  ];
  for (const e of events) { const r = ev(e); assert.equal(r.ok, false, JSON.stringify(e)); assert.equal(typeof (r as { error: { code: string } }).error.code, "string"); }
  const throwing = new Proxy({}, { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom"); } });
  assert.equal(planNext(DEF, throwing as RunState, 1).outcome, "invalid");
  assert.equal(applyEvent(DEF, throwing as RunState, { type: "heartbeat", stage: "capture", attemptId: "a", at: 1 }).ok, false);
  for (const d of [null, {}, { stages: [], leaseMs: 1 }, { ...DEF, leaseMs: 0 }, { ...DEF, leaseMs: NaN },
    { ...DEF, stages: [{ name: "a", deps: ["b"], maxAttempts: 1, retryable: [] }, { name: "b", deps: [], maxAttempts: 1, retryable: [] }] },
    { ...DEF, stages: [{ name: "a", deps: [], maxAttempts: 0, retryable: [] }] }]) {
    assert.equal(planNext(d as WorkflowDef, s, 1).outcome, "invalid");
  }
});
