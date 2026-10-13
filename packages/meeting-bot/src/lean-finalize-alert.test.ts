/**
 * T-035 finalize over-target alert tests (split out of lean-video-obs.test.ts to stay under the 400-line budget).
 * Fake telegram send, fake size/probe seams; never launches OBS, ffmpeg or Chrome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { finalizeRecordingWith, measuredMbPerHour } from "./capture/record-finalize.js";
import { createTelegramNotifier, type TelegramNotifier } from "./capture/notify/telegram-alerts.js";

// --- over-target report ------------------------------------------------------------------------

function root(): string {
  const r = mkdtempSync(join(tmpdir(), "lkb-lean-fin-"));
  writeFileSync(join(r, "v.mkv"), "x"); mkdirSync(join(r, "raw", "webinars"), { recursive: true });
  return r;
}
const extract = (_v: string, out: string) => writeFileSync(out, "a");
async function finalize(sizeBytes: number | (() => number), durationSec: number, sent: string[], plain = false) {
  const r = root();
  const telegram = createTelegramNotifier({ token: "t", chatId: "c", send: async (_t, _c, text) => { sent.push(text); }, log: () => {} });
  try {
    await finalizeRecordingWith({ repoRoot: r, probeMedia: () => durationSec, extractAudio: extract, measureVolume: () => ({ maxDb: -20, meanDb: -30 }),
      videoSizeBytes: typeof sizeBytes === "function" ? sizeBytes : () => sizeBytes },
      join(r, "v.mkv"), "sess-lean", "Lean Session", "zoho", false, [], plain ? undefined : telegram, durationSec);
    await new Promise((x) => setTimeout(x, 20));
  } finally { rmSync(r, { recursive: true, force: true }); }
}
const overTarget = (sent: string[]) => sent.filter((s) => s.includes("over size target"));

test("measuredMbPerHour: 1 hour of 400,000,000 bytes is exactly 400; unusable inputs give undefined", () => {
  assert.equal(measuredMbPerHour(400_000_000, 3600), 400);
  assert.equal(measuredMbPerHour(100_000_000, 900), 400);
  for (const [s, d] of [[0, 60], [-1, 60], [10, 0], [10, NaN], [NaN, 10], [Infinity, 10]] as const) assert.equal(measuredMbPerHour(s, d), undefined);
});

test("finalize: a 2.7 GB/h recording (the live run) sends one over-target alert with the numbers", async () => {
  const sent: string[] = [];
  await finalize(2_700_000_000, 3600, sent);
  const o = overTarget(sent);
  assert.equal(o.length, 1);
  assert.match(o[0]!, /Lean Session/); assert.match(o[0]!, /2700\.0 MB\/h/); assert.match(o[0]!, /under 400 MB\/h/); assert.match(o[0]!, /2700\.0 MB over 60m/);
});

test("finalize: exactly 400 MB/h is NOT under the target and alerts; 399,999,000 bytes/h does not", async () => {
  const at: string[] = [], below: string[] = [];
  await finalize(400_000_000, 3600, at);
  await finalize(399_999_000, 3600, below);
  assert.equal(overTarget(at).length, 1);
  assert.equal(overTarget(below).length, 0);
});

test("finalize: a lean-sized recording (258.9 MB/h) sends no over-target alert but still sends 'Finished'", async () => {
  const sent: string[] = [];
  await finalize(258_876_000, 3600, sent);
  assert.equal(overTarget(sent).length, 0);
  assert.equal(sent.filter((s) => s.startsWith("🏁 Finished")).length, 1);
});

test("finalize: an unreadable size never fails the finalize and sends no alert", async () => {
  const sent: string[] = [];
  await finalize(() => { throw new Error("stat failed"); }, 3600, sent);
  assert.equal(overTarget(sent).length, 0);
});

test("finalize: a notifier without notifyOverTarget (older fake) does not break an over-target finalize", async () => {
  const r = root();
  let finished = false;
  try {
    await finalizeRecordingWith({ repoRoot: r, probeMedia: () => 60, extractAudio: extract, measureVolume: () => ({ maxDb: -20, meanDb: -30 }), videoSizeBytes: () => 9e9 },
      join(r, "v.mkv"), "sess-old", "Old", "zoho", false, [], { enabled: false, notifyFinished: () => { finished = true; } } as unknown as TelegramNotifier, 60);
    assert.equal(finished, true);
  } finally { rmSync(r, { recursive: true, force: true }); }
});

