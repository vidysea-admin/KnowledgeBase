import assert from "node:assert/strict";
import test from "node:test";
import { dedupeKeyframes, hexHammingDistance } from "./keyframe-dedupe.js";
import type { KeyframeFrame } from "./keyframe-dedupe-validate.js";

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

const hexOf = (r: () => number, len: number): string => {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(r() * 16).toString(16);
  return s;
};

/** Synthetic stream: hashes random-walk by a few bit flips with occasional jumps and flicker. */
function gen(seed: number): { frames: KeyframeFrame[]; thr: number; minMs: number; endSec?: number; cutDiff?: number } {
  const r = rng(seed);
  const len = [4, 8, 16, 32][Math.floor(r() * 4)]!;
  const n = Math.floor(r() * 60);
  let t = Math.floor(r() * 5) + r();
  const frames: KeyframeFrame[] = [];
  let hash = hexOf(r, len);
  for (let i = 0; i < n; i++) {
    t += 0.05 + r() * 3;
    const m = r();
    if (m < 0.15) hash = hexOf(r, len);
    else if (m < 0.6) {
      const c = Math.floor(r() * len);
      const nibble = (parseInt(hash[c]!, 16) ^ (1 << Math.floor(r() * 4))).toString(16);
      hash = hash.slice(0, c) + (r() < 0.5 ? nibble.toUpperCase() : nibble) + hash.slice(c + 1);
    }
    frames.push({ id: `f${i}`, tSec: t, hash, ...(r() < 0.3 ? { diff: r() } : {}) });
  }
  const last = frames.length > 0 ? frames[frames.length - 1]!.tSec : 0;
  return {
    frames, thr: Math.floor(r() * 9), minMs: r() < 0.5 ? 0 : Math.floor(r() * 3000),
    ...(r() < 0.4 ? { endSec: last + r() * 5 } : {}), ...(r() < 0.3 ? { cutDiff: 0.8 } : {}),
  };
}

test("property: 2,500 seeded cases - spans tile the input range, only input values appear, all frames accounted for", () => {
  for (let seed = 1; seed <= 2500; seed++) {
    const { frames, thr, minMs, endSec, cutDiff } = gen(seed);
    const o = { hammingThreshold: thr, minDurationMs: minMs, ...(endSec === undefined ? {} : { endSec }), ...(cutDiff === undefined ? {} : { sceneCutDiff: cutDiff }) };
    const res = dedupeKeyframes(frames, o);
    const ctx = `seed ${seed}`;
    assert.deepEqual(res.errors, [], ctx);
    if (frames.length === 0) { assert.deepEqual(res.keyframes, [], ctx); continue; }
    const ks = res.keyframes;
    assert.ok(ks.length >= 1 && ks.length <= frames.length, ctx);
    const times = new Set(frames.map((f) => f.tSec));
    const byId = new Map(frames.map((f) => [f.id, f]));
    const end = endSec ?? frames[frames.length - 1]!.tSec;
    assert.equal(ks[0]!.from, frames[0]!.tSec, ctx);
    assert.equal(ks[ks.length - 1]!.to, end, ctx);
    const seen: string[] = [];
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i]!;
      assert.ok(k.from <= k.to, `${ctx} inverted span`);
      if (i > 0) assert.equal(k.from, ks[i - 1]!.to, `${ctx} gap/overlap between spans ${i - 1},${i}`);
      assert.ok(times.has(k.from) && times.has(k.tSec), `${ctx} invented timestamp`);
      assert.ok(times.has(k.to) || k.to === endSec, `${ctx} invented end`);
      const src = byId.get(k.id);
      assert.ok(src !== undefined && src.hash === k.hash && src.tSec === k.tSec, `${ctx} keyframe is a real input frame`);
      assert.ok(k.from <= k.tSec && k.tSec <= k.to, `${ctx} tSec inside span`);
      seen.push(...k.frameIds);
    }
    assert.deepEqual(seen, frames.map((f) => f.id), `${ctx} every frame in exactly one keyframe, in order`);
    if (minMs === 0 && cutDiff === undefined) {
      // no flicker merging: every member is within threshold of its keyframe (last-KEPT comparison)
      for (const k of ks) for (const id of k.frameIds) assert.ok(hexHammingDistance(k.hash, byId.get(id)!.hash) <= thr, `${ctx} member within threshold`);
      for (let i = 1; i < ks.length; i++) assert.ok(hexHammingDistance(ks[i - 1]!.hash, ks[i]!.hash) > thr, `${ctx} adjacent keyframes differ`);
    }
    assert.deepEqual(dedupeKeyframes(frames, o), res, `${ctx} deterministic`);
  }
});
