/**
 * packages/core/src/domain/speaker-tile-alignment.property.test.ts — T-042 slice 1. Seeded property
 * tests against a slot-by-slot oracle (an independent second way to compute overlap seconds),
 * invariants, permutation invariance, an operation-count bound (injected counter, not wall-clock)
 * at 50,000 observations x 20,000 turns, and hostile inputs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignTileNamesToTurns, TILE_DEFAULTS, type TileAlignResult } from "./speaker-tile-alignment.js";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface Ob { tSec: number; displayName: string | null }
interface Tn { id: string; tStart: number; tEnd: number; speakerRef: string }
const NAMES = ["Priya", "Rahul", "Anita", "iPhone", "priya", "Dev Patel"];

/** Everything on a 0.5 s grid so the oracle can walk half-second slots exactly. */
function gen(seed: number, horizon: number): { log: Ob[]; turns: Tn[] } {
  const r = rng(seed), g = (n: number) => Math.floor(r() * n) / 2;
  const log: Ob[] = [];
  for (let i = 0, n = 1 + Math.floor(r() * 25); i < n; i++) log.push({ tSec: g(horizon * 2), displayName: r() < 0.15 ? null : NAMES[Math.floor(r() * NAMES.length)]! });
  const turns: Tn[] = [];
  for (let i = 0, n = Math.floor(r() * 9); i < n; i++) {
    const a = g(horizon * 2);
    turns.push({ id: `t${i}`, tStart: a, tEnd: a + g(30), speakerRef: `spk:${Math.floor(r() * 3)}` });
  }
  return { log, turns };
}

/** Oracle: per half-second slot, the holder is the latest observation (time, then name order) at or before it. */
function oracle(log: Ob[], turns: Tn[], maxHold: number, horizon: number): Map<string, Map<string, number>> {
  const sorted = log.slice().sort((a, b) => a.tSec - b.tSec || ((a.displayName ?? "") < (b.displayName ?? "") ? -1 : (a.displayName ?? "") > (b.displayName ?? "") ? 1 : 0));
  const out = new Map<string, Map<string, number>>();
  // coincident observations with different values are an ambiguous instant: one release (cycle 1)
  const merged: Ob[] = [];
  for (const o of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.tSec === o.tSec) { if (last.displayName !== o.displayName) last.displayName = null; } else merged.push({ ...o });
  }
  for (let x = 0; x < horizon + 40; x += 0.5) {
    const labels = new Set(turns.filter((t) => t.tStart <= x && x < t.tEnd).map((t) => t.speakerRef));
    let holder: Ob | null = null;
    for (const o of merged) if (o.tSec <= x) holder = o;
    const shown = holder && holder.displayName !== null && x < holder.tSec + maxHold ? holder.displayName : null;
    for (const l of labels) {
      const m = out.get(l) ?? new Map<string, number>();
      out.set(l, m);
      if (shown !== null) m.set(shown, (m.get(shown) ?? 0) + 0.5);
    }
  }
  return out;
}
const key = (r: TileAlignResult): string => JSON.stringify(r.labels);

test("oracle: per-(label,name) overlap seconds agree on 400 seeded small meetings", () => {
  for (let seed = 1; seed <= 400; seed++) {
    const horizon = 40, maxHold = [1, 2.5, 5, 10][seed % 4]!;
    const { log, turns } = gen(seed, horizon);
    const res = alignTileNamesToTurns(log, turns, { maxHoldSec: maxHold });
    const want = oracle(log, turns, maxHold, horizon);
    for (const l of res.labels) {
      const exp = want.get(l.speakerRef) ?? new Map<string, number>();
      const got = new Map(l.candidates.map((c) => [c.name, c.sec]));
      assert.deepEqual([...got.entries()].sort(), [...exp.entries()].filter(([, v]) => v > 0).sort(), `seed ${seed} ${l.speakerRef}`);
    }
  }
});

test("invariants on 600 seeded meetings: one name per label, one label per name, thresholds hold, order-free", () => {
  for (let seed = 1000; seed < 1600; seed++) {
    const { log, turns } = gen(seed, 40);
    const res = alignTileNamesToTurns(log, turns);
    const used = new Map<string, string>();
    for (const l of res.labels) {
      if (l.decision.status !== "named") continue;
      const { claim, evidence: e } = l.decision;
      assert.equal(claim.verified, false);
      assert.equal(claim.source, "platform-display-name");
      assert.ok(!used.has(claim.displayName), `seed ${seed}: ${claim.displayName} on two labels`);
      used.set(claim.displayName, l.speakerRef);
      assert.ok(e.agreeSec >= TILE_DEFAULTS.minNameSeconds - 1e-9);
      assert.ok(e.agreeSec >= TILE_DEFAULTS.minNameFraction * e.observedSec - 1e-9);
      assert.ok(e.observedSec >= TILE_DEFAULTS.minCoverageFraction * e.totalSec - 1e-9);
      assert.ok(!e.runnerUp || e.runnerUp.sec <= TILE_DEFAULTS.maxRunnerUpFraction * e.observedSec + 1e-9);
      assert.ok(Math.abs(e.agreeSec + e.disagreeSec - e.observedSec) < 1e-9);
      assert.equal(l.candidates[0]!.name, claim.displayName);
      assert.ok(e.turnIds.every((id) => turns.some((t) => t.id === id && t.speakerRef === l.speakerRef)));
    }
    const r = rng(seed);
    const shuf = <T,>(a: T[]): T[] => a.map((v) => [r(), v] as const).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
    assert.equal(key(alignTileNamesToTurns(shuf(log), shuf(turns))), key(res), `seed ${seed} permutation`);
  }
});

test("scale: 50,000 observations x 20,000 turns stays near-linear by operation count (K shifts, K constant)", () => {
  const log: { tSec: number; displayName: string }[] = [], turns: Tn[] = [];
  for (let i = 0; i < 20000; i++) turns.push({ id: `t${i}`, tStart: i * 5, tEnd: i * 5 + 5, speakerRef: `spk:${i % 20}` });
  for (let i = 0; i < 50000; i++) log.push({ tSec: i * 2, displayName: `Person ${Math.floor(i * 2 / 5) % 20}` });
  const counter = { ops: 0 };
  const res = alignTileNamesToTurns(log, turns, { counter });
  assert.equal(res.labels.length, 20);
  assert.equal(res.labels.filter((l) => l.decision.status === "named").length, 0, "5 s turns are lag-sensitive: nothing may be named");
  assert.ok(res.labels.every((l) => l.decision.status === "refused" && (l.decision.reason === "lag-unstable" || l.decision.reason === "timeline-misaligned")));
  const k = res.meeting.shiftsEvaluated;
  assert.ok(k === 53, `default shifts ${k}`);
  assert.ok(counter.ops < k * 700_000, `ops ${counter.ops} (per shift ${Math.round(counter.ops / k)}, bound 700,000 per shift)`);
  console.log(`scale ops=${counter.ops} over ${k} shifts (naive pairing would be ${50000 * 20000})`);
});

test("scale, long turns: 4,000 turns of 50 s x 50,000 observations: all 20 labels still resolve, same per-shift bound", () => {
  const log: { tSec: number; displayName: string }[] = [], turns: Tn[] = [];
  for (let i = 0; i < 4000; i++) turns.push({ id: `t${i}`, tStart: i * 50, tEnd: i * 50 + 50, speakerRef: `spk:${i % 20}` });
  for (let i = 0; i < 50000; i++) log.push({ tSec: i * 4, displayName: `Person ${Math.floor(i * 4 / 50) % 20}` });
  const counter = { ops: 0 };
  const res = alignTileNamesToTurns(log, turns, { counter });
  assert.equal(res.meeting.status, "ok");
  assert.equal(res.labels.filter((l) => l.decision.status === "named").length, 20);
  assert.ok(counter.ops < res.meeting.shiftsEvaluated * 700_000, `ops ${counter.ops}`);
  console.log(`scale-long ops=${counter.ops} over ${res.meeting.shiftsEvaluated} shifts`);
});

test("hostile input: bad shapes become typed errors, prototype keys and odd names stay inert data, never throws", () => {
  const bad: unknown[] = [null, 7, "x", [], {}, { tSec: NaN, displayName: "a" }, { tSec: -1, displayName: "a" }, { tSec: Infinity, displayName: "a" },
    { tSec: 1, displayName: 5 }, { tSec: 1, displayName: "a", confidence: 2 }, { tSec: 1, displayName: "a", source: 3 }, { tSec: "1", displayName: "a" }];
  const r1 = alignTileNamesToTurns(bad, [null, { id: "", tStart: 0, tEnd: 1, speakerRef: "s" }, { id: "a", tStart: NaN, tEnd: 1, speakerRef: "s" },
    { id: "b", tStart: 5, tEnd: 1, speakerRef: "s" }, { id: "c", tStart: 0, tEnd: 1, speakerRef: 4 }, { id: "d", tStart: 0, tEnd: 1, speakerRef: "s" }, { id: "d", tStart: 0, tEnd: 1, speakerRef: "s" }], { minNameSeconds: -1, botDisplayName: 3 as unknown as string });
  const codes = r1.errors.map((e) => e.code);
  for (const c of ["invalid-input", "invalid-time", "invalid-name", "invalid-confidence", "invalid-source", "invalid-id", "end-before-start", "invalid-label", "duplicate-id", "invalid-option"]) assert.ok(codes.includes(c as never), c);
  assert.equal(r1.errors.filter((e) => e.code === "duplicate-id").length, 2, "every duplicate refused");
  for (const x of [undefined, null, 5, "s", {}, NaN]) assert.doesNotThrow(() => alignTileNamesToTurns(x, x, x as never));

  const evil = ["__proto__", "constructor", "toString", "hasOwnProperty"];
  const log = evil.flatMap((n, k) => Array.from({ length: 60 }, (_, i) => ({ tSec: k * 60 + i, displayName: n })));
  const turns = evil.map((n, k) => ({ id: n, tStart: k * 60, tEnd: k * 60 + 60, speakerRef: n }));
  const r2 = alignTileNamesToTurns(log, turns);
  assert.deepEqual(r2.labels.map((l) => l.speakerRef).sort(), [...evil].sort());
  assert.deepEqual(r2.labels.map((l) => l.decision.status === "named" && l.decision.claim.displayName).sort(), [...evil].sort());
  assert.equal(({} as Record<string, unknown>).polluted, undefined);

  const long = "n".repeat(10_000), bidi = "Priya\u{202e}\u{2066} Nair", ctl = "Pri\u0007ya";
  for (const nm of [long, bidi, ctl]) {
    const r = alignTileNamesToTurns(Array.from({ length: 30 }, (_, i) => ({ tSec: i, displayName: nm })), [{ id: "a", tStart: 0, tEnd: 30, speakerRef: "spk:0" }]);
    assert.equal(r.labels[0]!.decision.status, "refused");
    assert.equal(r.labels[0]!.candidates[0]!.name.length, nm.normalize("NFC").length, "returned verbatim as inert data");
  }
});
