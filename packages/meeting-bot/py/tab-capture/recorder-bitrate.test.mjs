import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeRecorderWorld } from "./tab-capture-harness.mjs";

const LIMIT_MB_PER_HOUR = 400; // T-035: decimal MB (10^6 bytes) per hour
const mbPerHour = (bps) => (bps * 3600) / 8 / 1e6;

test("T-035 recorder: configured video+audio bitrate is comfortably under 400 MB/hour, audio >= 64 kbps", async () => {
  const w = makeRecorderWorld();
  assert.equal((await w.begin()).ok, true);
  const { videoBitsPerSecond: v, audioBitsPerSecond: a } = w.recorder().opts;
  assert.ok(Number.isFinite(v) && Number.isFinite(a));
  assert.ok(a >= 64000, `audio ${a} bps below the 64 kbps transcription floor`);
  const total = mbPerHour(v + a);
  assert.ok(total <= LIMIT_MB_PER_HOUR * 0.75, `configured ${total.toFixed(1)} MB/h is not comfortably under ${LIMIT_MB_PER_HOUR}`);
  assert.equal(Math.round(total * 10) / 10, 253.8); // 564 kbps
});

test("T-035 recorder: capture constraints stay 720p and low fps", () => {
  const src = readFileSync(new URL("./recorder.js", import.meta.url), "utf8");
  assert.match(src, /maxWidth: 1280, maxHeight: 720, maxFrameRate: 5\b/);
});
