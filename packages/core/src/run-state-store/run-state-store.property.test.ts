import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunStateStore, runStateRevision } from "./run-state-store.js";
import { FakeRunStateFs } from "./run-state-fake-fs.js";
import { runStateWithAttempt, seededRandom } from "./run-state-test-kit.js";
import type { RunState } from "../domain/pipeline-workflow.js";

const CASES = 1200;
const STEPS = 14;

test(`property: ${CASES} seeded sequences of loads and fresh/stale/null-expected saves always end in a state an accepted save wrote`, () => {
  let acceptedTotal = 0, refusedTotal = 0;
  for (let seed = 1; seed <= CASES; seed++) {
    const rnd = seededRandom(seed);
    const pick = (n: number) => Math.floor(rnd() * n);
    const fs = new FakeRunStateFs();
    const store = createRunStateStore("/r", fs);
    const accepted: RunState[] = [];       // every state an accepted save wrote, in order
    const seenLoads: RunState[] = [];      // snapshots a caller could hold (fresh or stale)
    let nextN = 1;
    for (let i = 0; i < STEPS; i++) {
      const roll = pick(5);
      if (roll === 0) {
        const l = store.load("run");
        assert.equal(l.ok, true);
        const state = (l as { state: RunState | null }).state;
        if (state) seenLoads.push(state);
        // a load returns the last accepted write, or nothing when none was accepted
        assert.equal(state === null ? null : runStateRevision(state), accepted.length ? runStateRevision(accepted[accepted.length - 1]!) : null);
      } else {
        const next = runStateWithAttempt(nextN++, (["running", "done", "failed"] as const)[pick(3)]);
        const expected: RunState | null = roll === 1 ? null : roll === 2 ? (seenLoads[pick(Math.max(1, seenLoads.length))] ?? null) : (seenLoads[seenLoads.length - 1] ?? null);
        const cur = accepted[accepted.length - 1] ?? null;
        const shouldAccept = cur === null ? expected === null : expected !== null && runStateRevision(expected) === runStateRevision(cur);
        const r = store.save("run", expected, next);
        assert.equal(r.ok, shouldAccept, `seed ${seed} step ${i}: ${JSON.stringify(r)}`);
        if (r.ok) { accepted.push(next); acceptedTotal++; seenLoads.push(next); } else { assert.equal(r.code, "conflict"); refusedTotal++; }
      }
      assert.ok(!fs.names().some((n) => n.endsWith(".tmp") || n.endsWith(".lock")), `seed ${seed}: leftover`);
    }
    const final = store.load("run") as { ok: true; state: RunState | null };
    if (accepted.length === 0) assert.equal(final.state, null);
    else assert.ok(accepted.some((a) => runStateRevision(a) === runStateRevision(final.state!)), `seed ${seed}: final state was never written by an accepted save`);
  }
  assert.ok(acceptedTotal > CASES && refusedTotal > CASES / 2, `weak mix: accepted ${acceptedTotal}, refused ${refusedTotal}`);
});
