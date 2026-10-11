import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, planNext, type RunState, type StageDef, type WorkflowDef } from "./pipeline-workflow.js";
import { applyEvent } from "./pipeline-workflow-reduce.js";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

function randomDef(r: () => number): WorkflowDef {
  const n = int(r, 2, 7);
  const stages: StageDef[] = [];
  for (let i = 0; i < n; i++) {
    const deps = stages.filter(() => r() < 0.4).map((s) => s.name);
    if (i > 0 && deps.length === 0 && r() < 0.6) deps.push(stages[int(r, 0, i - 1)]!.name);
    stages.push({ name: `s${i}`, deps, maxAttempts: int(r, 1, 4), retryable: r() < 0.8 ? ["r"] : [] });
  }
  return { stages, leaseMs: int(r, 5, 50) };
}
const descendants = (def: WorkflowDef, root: string): Set<string> => {
  const out = new Set<string>();
  for (const s of def.stages) if (s.deps.some((d) => d === root || out.has(d))) out.add(s.name);
  return out;
};
const isValidDone = (s: RunState, name: string) => s.stages[name]!.status === "done" || s.stages[name]!.status === "skipped";

let GLOBAL_ID = 0;
interface Drive { state: RunState; starts: string[]; ended: string; steps: number; now: number }

/** One worker following the planner; every started attempt succeeds, fails retryably, fails fatally or dies. */
function drive(def: WorkflowDef, state: RunState, r: () => number, now0: number, fpOf: (s: string) => string, pFail = 0.5): Drive {
  const bound = def.stages.reduce((a, s) => a + s.maxAttempts, 0);
  let now = now0, steps = 0;
  const starts: string[] = [];
  for (let guard = 0; ; guard++) {
    assert.ok(guard < 5000, "driver did not reach a terminal state (livelock)");
    const p = planNext(def, state, now);
    assert.notEqual(p.outcome, "invalid", JSON.stringify(p.errors));
    // invariants of every plan
    for (const rd of p.ready) {
      const d = def.stages.find((s) => s.name === rd.stage)!;
      for (const dep of d.deps) assert.ok(isValidDone(state, dep), `ready ${rd.stage} with dependency ${dep} not done`);
      const st = state.stages[rd.stage]!;
      assert.ok(st.status !== "done" || st.inputFingerprint !== rd.inputFingerprint, `re-run of done ${rd.stage} with unchanged input`);
    }
    if (p.outcome === "complete" || p.outcome === "failed-terminal") return { state, starts, ended: p.outcome, steps, now };
    if (p.outcome === "waiting") { now += def.leaseMs; continue; }
    const pick = p.ready[int(r, 0, p.ready.length - 1)]!;
    const attemptId = `w${++GLOBAL_ID}`;
    const started = applyEvent(def, state, { type: "stage-started", stage: pick.stage, attemptId, at: now, inputFingerprint: pick.inputFingerprint });
    assert.equal(started.ok, true, JSON.stringify(started));
    state = (started as { state: RunState }).state;
    starts.push(pick.stage);
    steps++;
    assert.ok(steps <= bound, `exceeded ${bound} attempts without a terminal state`);
    assert.ok(Object.values(state.stages).every((s) => s.attempt >= 0));
    const roll = r();
    let ev;
    if (roll >= pFail) ev = { type: "stage-succeeded", stage: pick.stage, attemptId, at: now + 1, outputFingerprint: fpOf(pick.stage) } as const;
    else if (roll < pFail * 0.4) ev = { type: "stage-failed", stage: pick.stage, attemptId, at: now + 1, errorCode: "r" } as const;
    else if (roll < pFail * 0.6) ev = { type: "stage-failed", stage: pick.stage, attemptId, at: now + 1, errorCode: "fatal" } as const;
    else { now += def.leaseMs + 1; continue; } // worker died: no event at all
    const done = applyEvent(def, state, ev);
    assert.equal(done.ok, true, JSON.stringify(done));
    state = (done as { state: RunState }).state;
    // late replay from the same attempt is harmless
    const replay = applyEvent(def, state, ev);
    assert.equal(replay.ok, false);
    now += 2;
  }
}

test("property: random DAGs and crash/failure orders always terminate within sum(maxAttempts) attempts, never violating dependencies", () => {
  const ends: Record<string, number> = { complete: 0, "failed-terminal": 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const def = randomDef(r);
    const out = drive(def, initialState(def, `src${seed}`), r, 1000, (s) => `out-${s}`, r() * 0.9);
    ends[out.ended]!++;
    if (out.ended === "complete") for (const s of def.stages) assert.equal(out.state.stages[s.name]!.status, "done");
    for (const s of def.stages) assert.ok(out.starts.filter((x) => x === s.name).length <= s.maxAttempts);
  }
  assert.ok(ends.complete! > 20 && ends["failed-terminal"]! > 20, JSON.stringify(ends));
});

test("property: a changed output invalidates exactly the descendants; re-run set equals that closure", () => {
  let checked = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 7919);
    const def = randomDef(r);
    const first = drive(def, initialState(def, "src"), r, 1000, (s) => `out-${s}`, 0);
    assert.equal(first.ended, "complete");
    assert.equal(planNext(def, first.state, first.now).outcome, "complete");
    const target = def.stages[int(r, 0, def.stages.length - 1)]!.name;
    const changed: RunState = { ...first.state, stages: { ...first.state.stages, [target]: { ...first.state.stages[target]!, outputFingerprint: "CHANGED" } } };
    const want = descendants(def, target);
    const p = planNext(def, changed, first.now);
    if (want.size === 0) { assert.equal(p.outcome, "complete"); continue; }
    const invalidated = new Set([...p.ready.map((x) => x.stage), ...p.blocked.map((b) => b.stage)]);
    assert.deepEqual([...invalidated].sort(), [...want].sort(), `seed ${seed} target ${target}`);
    assert.ok(!invalidated.has(target));
    const again = drive(def, changed, r, first.now, (s) => `out-${s}-v2`, 0);
    assert.equal(again.ended, "complete");
    assert.deepEqual([...again.starts].sort(), [...want].sort(), "each descendant re-runs exactly once");
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} non-trivial cases`);
});

test("property: random hostile mutations of valid state never throw and never plan on invalid input", () => {
  const junk: unknown[] = [NaN, -1, 1.5, "x", null, undefined, {}, [], Infinity, true, ""];
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 31);
    const def = randomDef(r);
    const base = drive(def, initialState(def, "src"), r, 1000, (s) => `out-${s}`, 0.5).state;
    const st = JSON.parse(JSON.stringify(base)) as RunState;
    const names = Object.keys(st.stages);
    const target = names[int(r, 0, names.length - 1)]!;
    const fields = ["status", "attempt", "attemptId", "errorCode", "inputFingerprint", "outputFingerprint", "heartbeatAt"];
    (st.stages[target] as unknown as Record<string, unknown>)[fields[int(r, 0, fields.length - 1)]!] = junk[int(r, 0, junk.length - 1)];
    const now = r() < 0.2 ? NaN : 2000;
    assert.doesNotThrow(() => {
      const p = planNext(def, st, now);
      assert.ok(["invalid", "complete", "failed-terminal", "ready", "waiting"].includes(p.outcome));
      if (p.outcome === "invalid") assert.ok(p.errors.length > 0 && p.ready.length === 0);
      const e = applyEvent(def, st, { type: "heartbeat", stage: target, attemptId: "w1", at: now });
      assert.equal(typeof e.ok, "boolean");
    });
  }
});
