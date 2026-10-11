/**
 * packages/core/src/domain/slide-turn-alignment.property.test.ts — T-041 slice 1. Seeded property
 * tests against a brute-force O(n*m) oracle, permutation invariance, and an operation-count bound
 * (injected counter, not wall-clock) at 100,000 turns x 5,000 slides.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignSlidesToTurns } from "./slide-turn-alignment.js";

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

interface Obs { id: string; tSec: number; text: string }
interface Trn { id: string; tStart: number; tEnd: number }

function gen(seed: number, nSlides: number, nTurns: number, horizon: number): { slides: Obs[]; turns: Trn[] } {
  const r = rng(seed);
  const slides: Obs[] = [];
  for (let i = 0; i < nSlides; i++) {
    slides.push({ id: `s${i}`, tSec: Math.floor(r() * horizon), text: r() < 0.1 ? "  " : `deck ${Math.floor(r() * 4)}` });
  }
  const turns: Trn[] = [];
  for (let i = 0; i < nTurns; i++) {
    const a = Math.floor(r() * horizon);
    turns.push({ id: `t${i}`, tStart: a, tEnd: a + (r() < 0.15 ? 0 : Math.floor(r() * 12)) });
  }
  return { slides, turns };
}

/** Independent oracle: per-observation interval by O(m^2) scan, runs merged by hand, then O(n*m) overlaps. */
function oracle(slides: Obs[], turns: Trn[]): Map<string, [string, number, number][]> {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const o = [...slides].sort((x, y) => x.tSec - y.tSec || (x.id < y.id ? -1 : 1));
  const iv: { id: string; from: number; to: number; blank: boolean }[] = [];
  for (let i = 0; i < o.length; i++) {
    if (i > 0 && norm(o[i - 1]!.text) === norm(o[i]!.text)) continue;
    let to = Infinity;
    for (let j = i + 1; j < o.length; j++) if (norm(o[j]!.text) !== norm(o[i]!.text)) { to = o[j]!.tSec; break; }
    iv.push({ id: o[i]!.id, from: o[i]!.tSec, to, blank: norm(o[i]!.text) === "" });
  }
  const out = new Map<string, [string, number, number][]>();
  for (const t of turns) {
    const hits: [string, number, number][] = [];
    for (const s of iv) {
      if (s.blank || s.to <= s.from) continue;
      const hit = t.tStart === t.tEnd ? s.from <= t.tStart && t.tStart < s.to : Math.max(t.tStart, s.from) < Math.min(t.tEnd, s.to);
      if (hit) hits.push([s.id, Math.max(t.tStart, s.from), Math.min(t.tEnd, s.to)]);
    }
    out.set(t.id, hits);
  }
  return out;
}

test("200 seeded cases agree with the brute-force oracle; durations, primary and ordering hold", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { slides, turns } = gen(seed, 1 + (seed % 12), 1 + (seed % 30), 60);
    const res = alignSlidesToTurns(slides, turns);
    assert.deepEqual(res.errors, []);
    const want = oracle(slides, turns);
    assert.equal(res.turns.length, turns.length);
    for (const t of res.turns) {
      const got = t.attachments.map((a) => [a.slideId, a.from, a.to]);
      assert.deepEqual(got, want.get(t.turnId), `seed ${seed} turn ${t.turnId}`);
      const turn = turns.find((x) => x.id === t.turnId)!;
      const sum = t.attachments.reduce((n, a) => n + a.overlapSec, 0);
      assert.ok(sum <= turn.tEnd - turn.tStart + 1e-9, "overlaps sum to at most the turn duration");
      for (let i = 1; i < t.attachments.length; i++) assert.ok(t.attachments[i]!.from >= t.attachments[i - 1]!.to, "time ordered");
      if (t.attachments.length === 0) assert.equal(t.primarySlideId, null);
      else {
        const max = Math.max(...t.attachments.map((a) => a.overlapSec));
        const first = t.attachments.find((a) => a.overlapSec === max)!;
        assert.equal(t.primarySlideId, first.slideId, "primary = longest, earliest on ties");
      }
    }
    // per-slide view is the transpose of the per-turn view
    const pairs = res.turns.flatMap((t) => t.attachments.map((a) => `${a.turnId}|${a.slideId}`)).sort();
    const pairs2 = res.slides.flatMap((s) => s.attachments.map((a) => `${a.turnId}|${a.slideId}`)).sort();
    assert.deepEqual(pairs2, pairs);
  }
});

test("output is identical under permutation of both inputs", () => {
  for (let seed = 500; seed < 540; seed++) {
    const { slides, turns } = gen(seed, 8, 20, 40);
    const base = alignSlidesToTurns(slides, turns);
    const r = rng(seed);
    const shuffle = <T>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
    assert.deepEqual(alignSlidesToTurns(shuffle(slides), shuffle(turns)), base, `seed ${seed}`);
  }
});

test("100,000 turns x 5,000 slides: linear operation count, not n*m", () => {
  const nT = 100_000, nS = 5_000;
  const slides: Obs[] = [];
  for (let i = 0; i < nS; i++) slides.push({ id: `s${i}`, tSec: i * 20, text: `slide ${i}` });
  const turns: Trn[] = [];
  for (let i = 0; i < nT; i++) turns.push({ id: `t${i}`, tStart: i, tEnd: i + 3 });
  const counter = { ops: 0 };
  const res = alignSlidesToTurns(slides, turns, { counter });
  const k = res.turns.reduce((n, t) => n + t.attachments.length, 0);
  assert.equal(res.turns.length, nT);
  assert.ok(k >= nT && k <= 2 * nT, `pairs ${k}`);
  const bound = 3 * (nT + nS + k);
  assert.ok(counter.ops <= bound, `ops ${counter.ops} > ${bound}`);
  assert.ok(counter.ops < (nT * nS) / 1000, "orders of magnitude below the nested scan");
  assert.equal(res.turns[40_000]!.primarySlideId, "s2000");
});
