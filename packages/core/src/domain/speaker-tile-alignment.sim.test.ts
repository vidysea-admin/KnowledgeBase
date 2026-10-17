/**
 * packages/core/src/domain/speaker-tile-alignment.sim.test.ts — T-042 slice 1, fix cycle 1. An
 * ORACLE-KNOWN simulation: ground-truth speakers and turns are generated first, the highlight log is
 * DERIVED from them (random true lag, jitter, flicker, dropouts, sampling 1-5 s), the function is run,
 * and every proposed name is compared with the ground-truth name of that label. Zero wrong proposals is
 * the assertion; the proposal RATE is the recall cost and is printed per meeting type.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignTileNamesToTurns, TILE_DEFAULTS, type TileAlignResult } from "./speaker-tile-alignment.js";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const POOL = ["Priya Nair", "Rahul Bhosale", "Anita Desai", "Dev Patel", "Meera Iyer", "Kabir Shah", "Sana Qureshi", "Vikram Rao"];
export type Style = "short" | "mixed" | "long";
export interface Sim { log: { tSec: number; displayName: string | null }[]; turns: { id: string; tStart: number; tEnd: number; speakerRef: string }[]; nSpk: number }
export interface SimOpts { lagMin?: number; lagMax?: number; offset?: number }

/** Turn length by style: short 1-10 s; long 20-120 s; mixed log-uniform 1-120 s. */
function turnLen(r: () => number, style: Style): number {
  if (style === "short") return 1 + r() * 9;
  if (style === "long") return 20 + r() * 100;
  return Math.exp(Math.log(1) + r() * (Math.log(120) - Math.log(1)));
}

export function simulate(seed: number, style: Style, o: SimOpts = {}): Sim {
  const r = rng(seed);
  const nSpk = 2 + Math.floor(r() * 7);
  const target = style === "short" ? 400 : style === "mixed" ? 900 : 1500;
  const truth: { a: number; b: number; k: number }[] = [];
  let t = r() * 3, prev = -1;
  while (t < target) {
    let k = Math.floor(r() * nSpk);
    if (k === prev) k = (k + 1 + Math.floor(r() * (nSpk - 1))) % nSpk;
    const len = turnLen(r, style);
    truth.push({ a: t, b: t + len, k });
    prev = k;
    t += len + (r() < 0.3 ? r() * 3 : 0);
  }
  const lag = (o.lagMin ?? 0) + r() * ((o.lagMax ?? TILE_DEFAULTS.maxLagSec) - (o.lagMin ?? 0));
  const jitter = r() * 0.5, flicker = r() * 0.1, drop = r() * 0.3, dt = 1 + r() * 4;
  const who = (x: number): number => { for (const s of truth) if (s.a <= x && x < s.b) return s.k; return -1; };
  const log: Sim["log"] = [];
  for (let s = r() * dt; s < t + 20; s += dt) {
    if (r() < drop) continue;
    const k = who(s - lag + (r() * 2 - 1) * jitter);
    let name: string | null = k < 0 ? null : POOL[k]!;
    if (name !== null && r() < flicker) name = POOL[Math.floor(r() * nSpk)]!;
    log.push({ tSec: Math.max(0, s + (o.offset ?? 0)), displayName: name });
  }
  const turns = truth.map((s, i) => ({ id: `t${i}`, tStart: Math.max(0, s.a + (r() * 2 - 1) * 0.3), tEnd: s.b + (r() * 2 - 1) * 0.3, speakerRef: `spk:${s.k}` }));
  return { log, turns, nSpk };
}

export interface Tally { meetings: number; labels: number; named: number; wrong: number; misaligned: number; firstWrong: string[] }
export function tally(seeds: number[], style: Style, o: SimOpts = {}): Tally {
  const out: Tally = { meetings: 0, labels: 0, named: 0, wrong: 0, misaligned: 0, firstWrong: [] };
  for (const seed of seeds) {
    const sim = simulate(seed, style, o);
    const res: TileAlignResult = alignTileNamesToTurns(sim.log, sim.turns);
    out.meetings++;
    if (res.meeting.status === "timeline-misaligned") out.misaligned++;
    for (const l of res.labels) {
      out.labels++;
      if (l.decision.status !== "named") continue;
      out.named++;
      if (l.decision.claim.displayName !== POOL[Number(l.speakerRef.slice(4))]) { out.wrong++; if (out.firstWrong.length < 3) out.firstWrong.push(`seed ${seed} ${style} ${l.speakerRef} -> ${l.decision.claim.displayName}`); }
    }
  }
  return out;
}
const seeds = (from: number, n: number): number[] => Array.from({ length: n }, (_, i) => from + i);
const rate = (t: Tally): string => `${t.named}/${t.labels} labels named (${(100 * t.named / t.labels).toFixed(1)}%), ${t.wrong} wrong, ${t.misaligned}/${t.meetings} meetings timeline-misaligned`;

test("SIMULATION: 3,600 oracle-known meetings, true lag in [0, maxLagSec] + jitter, flicker, dropouts: ZERO wrong proposals", () => {
  const short = tally(seeds(1, 1200), "short"), mixed = tally(seeds(5000, 1200), "mixed"), long = tally(seeds(9000, 1200), "long");
  console.log(`SIM short-turn (1-10 s): ${rate(short)}\nSIM mixed (1-120 s): ${rate(mixed)}\nSIM long-turn (20-120 s): ${rate(long)}`);
  for (const t of [short, mixed, long]) assert.deepEqual([t.wrong, t.firstWrong], [0, []]);
  assert.equal(short.meetings + mixed.meetings + long.meetings, 3600);
  assert.ok(long.named / long.labels > 0.5, "the feature is not dead: long-turn meetings still resolve most labels");
  assert.ok(short.named / short.labels < long.named / long.labels, "short-turn meetings pay the recall cost");
});

test("limit: true lag BEYOND maxLagSec (6-10 s): wrong names are measured, not hidden", () => {
  const a = tally(seeds(20000, 600), "short", { lagMin: 6.5, lagMax: 10 }), b = tally(seeds(21000, 600), "mixed", { lagMin: 6.5, lagMax: 10 });
  const c = tally(seeds(22000, 600), "long", { lagMin: 6.5, lagMax: 10 });
  const edge = tally(seeds(23000, 1200), "mixed", { lagMin: 6, lagMax: 7.5 });
  console.log(`JUST BEYOND maxLag (6-7.5 s) mixed: ${rate(edge)} ${edge.firstWrong.join("; ")}`);
  console.log(`BEYOND maxLag short: ${rate(a)} ${a.firstWrong.join("; ")}\nBEYOND maxLag mixed: ${rate(b)} ${b.firstWrong.join("; ")}\nBEYOND maxLag long: ${rate(c)} ${c.firstWrong.join("; ")}`);
  assert.ok(a.wrong + b.wrong + c.wrong + edge.wrong <= 5, "measured on these seeds; NOT a guarantee beyond maxLagSec (see the manifest)");
});

test("constant clock offsets: refused by the misalignment rule or measured", () => {
  for (const offset of [-10, -3, 10, 30]) {
    const t = tally(seeds(30000 + offset * 7, 400), "mixed", { offset });
    console.log(`OFFSET ${offset} s mixed: ${rate(t)} ${t.firstWrong.join("; ")}`);
    assert.ok(t.wrong <= 3, `offset ${offset}: ${t.wrong} wrong (measured on these seeds; not a guarantee)`);
  }
});
