/** packages/core/src/domain/lean-video.test.ts — T-035 slice 1. Pure; no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeanVideoSettings as build, estimateSizeMbPerHour as est, toObsRequests, LEAN_TARGET_MB_PER_HOUR } from "./lean-video.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("defaults: 720p slides 1280x720 5fps 500k+64k aac mono 48k, no adjustments", () => {
  assert.deepEqual({ ...build() }, { width: 1280, height: 720, fps: 5, videoBitrateKbps: 500, videoCodec: "h264", keyframeIntervalSec: 2, audioCodec: "aac", audioBitrateKbps: 64, audioChannels: 1, audioSampleRate: 48000, contentHint: "slides", adjustments: [] });
});
test("default estimate is 258.876 MB/h and under target with 25%+ margin", () => {
  near(est(build()), 258.876); // (500+64)*1000*1.02*3600/8/1e6
  assert.ok(est(build()) <= LEAN_TARGET_MB_PER_HOUR * 0.75);
});
test("talking-head default 15fps 700k: 350.676 MB/h, still under 400", () => {
  const s = build({ contentHint: "talking-head" });
  assert.equal(s.fps, 15); assert.equal(s.videoBitrateKbps, 700);
  near(est(s), 350.676); // (700+64)*1000*1.02*450/1e6
  assert.ok(est(s) < LEAN_TARGET_MB_PER_HOUR);
});
test("aspect ratios: 16:9, 4:3, 1:1, odd height", () => {
  assert.deepEqual([build().width, build().height], [1280, 720]);
  const a = build({ aspectWidth: 4, aspectHeight: 3 }); assert.deepEqual([a.width, a.height], [960, 720]);
  const b = build({ aspectWidth: 1, aspectHeight: 1 }); assert.deepEqual([b.width, b.height], [720, 720]);
  const c = build({ targetHeight: 721 }); assert.equal(c.height, 720); assert.equal(c.width % 2, 0);
});
test("width and height always even across a sweep", () => {
  for (let h = 200; h <= 1100; h += 7) for (const [w, hh] of [[16, 9], [4, 3], [3, 2], [21, 9], [5, 4], [7, 5]]) {
    const s = build({ targetHeight: h, aspectWidth: w, aspectHeight: hh });
    assert.equal(s.width % 2, 0); assert.equal(s.height % 2, 0);
  }
});
test("hostile input never throws; clamps/defaults are reported", () => {
  const s = build({ targetHeight: NaN, fps: 0, videoBitrateKbps: -5, audioBitrateKbps: 1, audioChannels: 7 as never, contentHint: "x" as never, aspectWidth: -1, aspectHeight: 0 });
  assert.equal(s.height, 720); assert.equal(s.fps, 1); assert.equal(s.videoBitrateKbps, 100); assert.equal(s.audioBitrateKbps, 32);
  assert.equal(s.audioChannels, 1); assert.equal(s.contentHint, "slides"); assert.equal(s.width, 1280);
  assert.ok(s.adjustments.length >= 7);
  for (const bad of [null, undefined, 5, "x", [], { fps: Infinity, targetHeight: "720" as never }]) assert.doesNotThrow(() => build(bad as never));
});
test("upper clamps: absurd resolution, fps, bitrates, aspect", () => {
  const s = build({ targetHeight: 100000, fps: 240, videoBitrateKbps: 5000, audioBitrateKbps: 5000 });
  assert.equal(s.height, 1080); assert.equal(s.fps, 30); assert.equal(s.videoBitrateKbps, 4000); assert.equal(s.audioBitrateKbps, 192);
  assert.equal(build({ targetHeight: 10 }).height, 240);
  assert.equal(build({ aspectWidth: 100, aspectHeight: 1 }).width, 1280);
});
test("overrides honoured within range", () => {
  const s = build({ fps: 10, videoBitrateKbps: 300, audioBitrateKbps: 48, audioChannels: 2 });
  assert.deepEqual([s.fps, s.videoBitrateKbps, s.audioBitrateKbps, s.audioChannels], [10, 300, 48, 2]);
  assert.deepEqual(s.adjustments, []);
});
test("estimator hand-computed cases", () => {
  near(est({ videoBitrateKbps: 1000, audioBitrateKbps: 0 }), 459); // 1e6*1.02*450/1e6
  near(est({ videoBitrateKbps: 0, audioBitrateKbps: 128 }), 58.752);
  near(est({ videoBitrateKbps: 100, audioBitrateKbps: 32 }), 60.588);
});
test("estimator monotonic in each bitrate, audio counted", () => {
  let prev = -1; for (let v = 100; v <= 4000; v += 100) { const e = est({ videoBitrateKbps: v, audioBitrateKbps: 64 }); assert.ok(e > prev); prev = e; }
  prev = -1; for (let a = 32; a <= 192; a += 16) { const e = est({ videoBitrateKbps: 500, audioBitrateKbps: a }); assert.ok(e > prev); prev = e; }
});
test("the video clamp ceiling is what bounds a x10 typo", () => {
  assert.ok(est({ videoBitrateKbps: 5000, audioBitrateKbps: 64 }) > LEAN_TARGET_MB_PER_HOUR);
  assert.equal(build({ videoBitrateKbps: 5000 }).videoBitrateKbps, 4000);
});
test("OBS mapping: base==output, fps num/den, bitrates as strings; uses the baseWidth/baseHeight keys the recorder reads", () => {
  const r = toObsRequests(build());
  assert.deepEqual(r.videoSettings, { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720, fpsNumerator: 5, fpsDenominator: 1 });
  assert.deepEqual(r.profileParameters, [
    { parameterCategory: "SimpleOutput", parameterName: "VBitrate", parameterValue: "500" },
    { parameterCategory: "SimpleOutput", parameterName: "ABitrate", parameterValue: "64" },
  ]);
  // existing obs-windows.ts reads exactly these two fields from GetVideoSettings
  assert.ok("baseWidth" in r.videoSettings && "baseHeight" in r.videoSettings);
});
