import assert from "node:assert/strict";
import test from "node:test";
import { createSilenceHealth, silenceHealthEnabled, type AudioHealth } from "./tab-silence-health.js";

function rig() {
  let t = 0; const out: AudioHealth[] = [];
  const h = createSilenceHealth({ now: () => t, onChange: (x) => out.push(x) });
  return { out, feed(db: number, secs: number) { for (let i = 0; i < secs; i++) { h.onLevel(db); t += 1000; } } };
}
test("flag is off unless LKB_TAB_SILENCE_HEALTH=1", () => {
  assert.equal(silenceHealthEnabled({}), false);
  assert.equal(silenceHealthEnabled({ LKB_TAB_SILENCE_HEALTH: "1" }), true);
});
test("speech then 400 s of -91 dB flags once after 60 s", () => {
  const r = rig(); r.feed(-22, 360); r.feed(-91, 400);
  assert.equal(r.out.length, 1); assert.equal(r.out[0]!.silent, true); assert.equal(r.out[0]!.silentSeconds, 60);
});
test("59 s of silence does not flag; audio resets the stretch", () => {
  const r = rig(); r.feed(-120, 59); r.feed(-30, 1); r.feed(-120, 59);
  assert.equal(r.out.length, 0);
});
test("audio returning clears the flag and a new stretch re-flags", () => {
  const r = rig(); r.feed(-120, 70); r.feed(-30, 2); r.feed(-120, 70);
  assert.deepEqual(r.out.map((x) => x.silent), [true, false, true]);
});
test("quiet-but-real room tone (-60 dB) is not digital silence", () => {
  const r = rig(); r.feed(-60, 600); assert.equal(r.out.length, 0);
});
