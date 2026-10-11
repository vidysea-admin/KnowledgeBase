import assert from "node:assert/strict";
import test from "node:test";
import { alignSlidesToTurns, type SlideObservation } from "./slide-turn-alignment.js";
import { DEFAULT_KEYFRAME_HAMMING_THRESHOLD, dedupeKeyframes, hexHammingDistance, type Keyframe } from "./keyframe-dedupe.js";
import type { KeyframeFrame } from "./keyframe-dedupe-validate.js";

// SYNTHETIC 64-bit hashes only. Flip the low `n` bits of a base hash to get an exact Hamming distance n.
const BASE = 0x0123456789abcdefn;
const hx = (v: bigint): string => v.toString(16).padStart(16, "0");
const flip = (n: number, base = BASE): string => hx(base ^ ((1n << BigInt(n)) - 1n));
const fr = (i: number, t: number, hash: string, diff?: number): KeyframeFrame => ({ id: `f${i}`, tSec: t, hash, ...(diff === undefined ? {} : { diff }) });

test("hexHammingDistance counts differing bits, case-insensitive", () => {
  assert.equal(hexHammingDistance("ff", "00"), 8);
  assert.equal(hexHammingDistance("ABCDEF", "abcdef"), 0);
  assert.equal(hexHammingDistance(hx(BASE), flip(7)), 7);
});

test("empty input returns empty with no errors; undefined likewise", () => {
  assert.deepEqual(dedupeKeyframes([]), { keyframes: [], errors: [] });
  assert.deepEqual(dedupeKeyframes(undefined as never), { keyframes: [], errors: [] });
});

test("run of near-identical frames collapses to the first frame; spans abut", () => {
  const r = dedupeKeyframes([fr(0, 0, hx(BASE)), fr(1, 1, flip(2)), fr(2, 2, flip(5)), fr(3, 3, flip(40)), fr(4, 4, flip(40)), fr(5, 6, hx(0n))]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.keyframes.map((k) => [k.id, k.from, k.to, k.frameIds.length]), [["f0", 0, 3, 3], ["f3", 3, 6, 2], ["f5", 6, 6, 1]]);
});

test("threshold boundary: distance == threshold merges, threshold+1 splits", () => {
  const t = DEFAULT_KEYFRAME_HAMMING_THRESHOLD;
  assert.equal(t, 5);
  assert.equal(dedupeKeyframes([fr(0, 0, hx(BASE)), fr(1, 1, flip(t))]).keyframes.length, 1);
  assert.equal(dedupeKeyframes([fr(0, 0, hx(BASE)), fr(1, 1, flip(t + 1))]).keyframes.length, 2);
  assert.equal(dedupeKeyframes([fr(0, 0, hx(BASE)), fr(1, 1, flip(2))], { hammingThreshold: 1 }).keyframes.length, 2);
  assert.equal(dedupeKeyframes([fr(0, 0, hx(BASE)), fr(1, 1, flip(2))], { hammingThreshold: 2 }).keyframes.length, 1);
  assert.equal(dedupeKeyframes([fr(0, 0, "00"), fr(1, 1, "ff")], { hammingThreshold: 0 }).keyframes.length, 2);
});

test("DRIFT: each step is 2 bits from the previous frame but the run does not chain (compares to last KEPT)", () => {
  // frame k differs from frame k-1 by 2 bits (within threshold 5), yet distance to frame 0 grows 2,4,6,...
  const frames: KeyframeFrame[] = [];
  for (let k = 0; k < 20; k++) frames.push(fr(k, k, hx(BASE ^ ((1n << BigInt(2 * k)) - 1n))));
  for (let k = 1; k < frames.length; k++) assert.ok(hexHammingDistance(frames[k - 1]!.hash, frames[k]!.hash) <= 2);
  const r = dedupeKeyframes(frames);
  assert.ok(r.keyframes.length >= 7, `expected drift to split into many keyframes, got ${r.keyframes.length}`);
  for (const k of r.keyframes) for (const id of k.frameIds) {
    const f = frames.find((x) => x.id === id)!;
    assert.ok(hexHammingDistance(k.hash, f.hash) <= 5, "every frame in a run is within threshold of its keyframe");
  }
  // a chained (previous-frame) comparison would give exactly one run
  assert.notEqual(r.keyframes.length, 1);
});

test("A, B, A is three keyframes (only consecutive near-identical frames merge)", () => {
  const r = dedupeKeyframes([fr(0, 0, hx(0n)), fr(1, 1, hx(0xffffffffn)), fr(2, 2, hx(0n))]);
  assert.deepEqual(r.keyframes.map((k) => k.id), ["f0", "f1", "f2"]);
});

test("minDurationMs: flicker frame merges into the surrounding run and the two A runs join", () => {
  const frames = [fr(0, 0, hx(0n)), fr(1, 10, hx(0xffffffffn)), fr(2, 10.2, hx(0n)), fr(3, 20, hx(0n))];
  assert.equal(dedupeKeyframes(frames).keyframes.length, 3);
  const r = dedupeKeyframes(frames, { minDurationMs: 500 });
  assert.deepEqual(r.keyframes.map((k) => [k.id, k.from, k.to, k.frameIds]), [["f0", 0, 20, ["f0", "f1", "f2", "f3"]]]);
});

test("minDurationMs boundary: a run exactly N ms long is kept, N-1 is dropped", () => {
  const frames = [fr(0, 0, hx(0n)), fr(1, 5, hx(0xffffffffn)), fr(2, 5.5, hx(0xffffffffffffn)), fr(3, 9, hx(0n))];
  assert.equal(dedupeKeyframes(frames, { minDurationMs: 500 }).keyframes.length, 3);
  assert.equal(dedupeKeyframes(frames, { minDurationMs: 501 }).keyframes.length, 2);
});

test("leading flicker merges forward; keyframe keeps its own id/tSec, span starts at first input time", () => {
  const r = dedupeKeyframes([fr(0, 0, hx(0xffffffffn)), fr(1, 0.1, hx(0n)), fr(2, 9, hx(0n))], { minDurationMs: 500 });
  assert.deepEqual(r.keyframes.map((k) => [k.id, k.tSec, k.from, k.to]), [["f1", 0.1, 0, 9]]);
  assert.deepEqual(r.keyframes[0]!.frameIds, ["f0", "f1", "f2"], "leading flicker frame is not lost");
});

test("trailing 1-frame run is flicker without endSec, kept with endSec", () => {
  const frames = [fr(0, 0, hx(0n)), fr(1, 10, hx(0xffffffffn))];
  assert.equal(dedupeKeyframes(frames, { minDurationMs: 100 }).keyframes.length, 1);
  const r = dedupeKeyframes(frames, { minDurationMs: 100, endSec: 12 });
  assert.deepEqual(r.keyframes.map((k) => [k.id, k.from, k.to]), [["f0", 0, 10], ["f1", 10, 12]]);
});

test("all-flicker input keeps the first run covering everything", () => {
  const r = dedupeKeyframes([fr(0, 0, hx(0n)), fr(1, 0.1, hx(0xffffffffn))], { minDurationMs: 5000 });
  assert.deepEqual(r.keyframes.map((k) => [k.id, k.from, k.to, k.frameIds]), [["f0", 0, 0.1, ["f0", "f1"]]]);
});

test("sceneCutDiff forces a keyframe despite identical hashes; ignored when option absent", () => {
  const frames = [fr(0, 0, hx(0n), 0), fr(1, 1, hx(0n), 0.9), fr(2, 2, hx(0n), 0.1)];
  assert.equal(dedupeKeyframes(frames).keyframes.length, 1);
  const r = dedupeKeyframes(frames, { sceneCutDiff: 0.5 });
  assert.deepEqual(r.keyframes.map((k) => k.id), ["f0", "f1"]);
  assert.equal(dedupeKeyframes(frames, { sceneCutDiff: 0.9 }).keyframes.length, 2, "diff == cut value cuts");
  // a forced cut survives the post-flicker re-join
  const cut = dedupeKeyframes([fr(0, 0, hx(0n)), fr(1, 5, hx(0n), 0.9)], { sceneCutDiff: 0.5, minDurationMs: 100, endSec: 9 });
  assert.equal(cut.keyframes.length, 2);
});

test("typed errors, fail-closed (no keyframes)", () => {
  const codes = (frames: unknown, o?: unknown): string[] => dedupeKeyframes(frames as never, o as never).errors.map((e) => e.code);
  const ok = fr(0, 0, hx(0n));
  assert.deepEqual(codes([ok, fr(1, 5, hx(0n)), fr(2, 3, hx(0n))]), ["unsorted-time"]);
  assert.deepEqual(codes([ok, fr(1, 0, hx(0n))]), ["duplicate-time"]);
  assert.deepEqual(codes([ok, { ...fr(1, 1, hx(0n)), id: "f0" }]), ["duplicate-id"]);
  assert.deepEqual(codes([ok, { ...fr(1, 1, hx(0n)), id: "" }]), ["invalid-id"]);
  assert.deepEqual(codes([ok, fr(1, 1, "zz")]), ["invalid-hash"]);
  assert.deepEqual(codes([ok, fr(1, 1, "")]), ["invalid-hash"]);
  assert.deepEqual(codes([ok, { ...ok, id: "x", tSec: 1, hash: 5 }]), ["invalid-hash"]);
  assert.deepEqual(codes([ok, fr(1, 1, "abcd")]), ["mixed-hash-length"]);
  for (const bad of [NaN, Infinity, -Infinity, "3", null]) assert.deepEqual(codes([ok, { ...fr(1, 1, hx(0n)), tSec: bad }]), ["invalid-time"], String(bad));
  assert.deepEqual(codes([fr(0, -1, hx(0n))]), ["negative-time"]);
  for (const bad of [NaN, -1, Infinity, "1"]) assert.deepEqual(codes([ok, { ...fr(1, 1, hx(0n)), diff: bad }]), ["invalid-diff"], String(bad));
  assert.deepEqual(codes("nope"), ["invalid-input"]);
  assert.deepEqual(codes([ok, null]), ["invalid-input"]);
  for (const o of [{ hammingThreshold: -1 }, { hammingThreshold: 1.5 }, { hammingThreshold: NaN }, { minDurationMs: -1 }, { minDurationMs: Infinity }, { sceneCutDiff: NaN }, { endSec: NaN }]) {
    assert.deepEqual(codes([ok], o), ["invalid-option"], JSON.stringify(o));
  }
  assert.deepEqual(codes([fr(0, 5, hx(0n))], { endSec: 4 }), ["invalid-option"], "endSec before last frame");
  assert.deepEqual(codes([ok], null as never), ["invalid-option"]);
  const r = dedupeKeyframes([ok, fr(1, 1, "zz")]);
  assert.deepEqual(r.keyframes, []);
  assert.equal(r.errors[0]!.index, 1);
});

test("deterministic, does not mutate input, output never shares the input's frameIds arrays", () => {
  const frames = [fr(0, 0, hx(0n)), fr(1, 1, hx(1n)), fr(2, 2, hx(0xffffffffffn))];
  const snap = JSON.stringify(frames);
  const a = dedupeKeyframes(frames, { minDurationMs: 10 });
  const b = dedupeKeyframes(frames, { minDurationMs: 10 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(frames), snap);
});

test("100,000 frames run in linear time (generous bound)", () => {
  const frames: KeyframeFrame[] = [];
  let h = 1n;
  for (let i = 0; i < 100_000; i++) {
    h = (h * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    frames.push(fr(i, i * 0.5, i % 7 === 0 ? hx(h) : hx(h & ~0xfn | (BigInt(i) & 0xfn))));
  }
  const t0 = performance.now();
  const r = dedupeKeyframes(frames, { minDurationMs: 100 });
  const ms = performance.now() - t0;
  assert.deepEqual(r.errors, []);
  assert.ok(r.keyframes.length > 1000);
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
});

test("feeds slide-turn-alignment: keyframes + OCR text are accepted as slide input", () => {
  const kfs: Keyframe[] = dedupeKeyframes([fr(0, 0, hx(0n)), fr(1, 10, hx(0xffffffffffn)), fr(2, 30, hx(0xffffffffffn))], { endSec: 40 }).keyframes;
  // type-level: id and tSec are SlideObservation's; only `text` is added by the OCR stage
  const slides: SlideObservation[] = kfs.map((k) => ({ id: k.id, tSec: k.tSec, text: `slide ${k.id}` }));
  const res = alignSlidesToTurns(slides, [{ id: "t1", tStart: 5, tEnd: 15 }], { sessionEndSec: 40 });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.turns[0]!.attachments.map((a) => [a.slideId, a.overlapSec]), [["f0", 5], ["f1", 5]]);
  const direct: SlideObservation[] = kfs.map((k) => ({ ...k, text: "x" })); // spread also type-checks
  assert.equal(direct.length, 2);
});
