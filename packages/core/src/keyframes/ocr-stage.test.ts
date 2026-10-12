import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { FFMPEG_ENV } from "./ffmpeg-args.js";
import { extractSlideTurnAlignment, type ExecFn, type ExecResult } from "./extract.js";
import { ocrKeyframes, type OcrFn } from "./ocr-stage.js";

// FAKES ONLY: no OCR service, no model, no real ffmpeg, no video.
const kf = (id: string, tSec: number) => ({ id, tSec, framePath: `/x/${id}.png`, hash: "0".repeat(16), from: tSec, to: tSec + 2, frameIds: [id] });
const wave = (shift: number): Uint8Array => {
  const f = new Uint8Array(72);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) f[r * 9 + c] = Math.round(128 + 100 * Math.sin((c + shift) * 0.9 + r * 0.5));
  return f;
};
const other = (): Uint8Array => { const f = new Uint8Array(72); for (let i = 0; i < 72; i++) f[i] = (i * 37 + (i % 9) * 91) % 256; return f; };
const okRaw = (frames: Uint8Array[]): ExecResult => ({ code: 0, stdout: Buffer.concat(frames), stderr: "", timedOut: false, truncated: false });

test("ocrKeyframes: maps frames to observations, passes frame data, keeps confidence", async () => {
  const seen: string[] = [];
  const ocr: OcrFn = async (f) => { seen.push(`${f.id}@${f.tSec}:${f.framePath}`); return { text: `slide ${f.id}`, confidence: 0.9 }; };
  const r = await ocrKeyframes([kf("f0", 0), kf("f2", 4)], ocr);
  assert.deepEqual(seen, ["f0@0:/x/f0.png", "f2@4:/x/f2.png"]);
  assert.deepEqual(r.observations, [{ id: "f0", tSec: 0, text: "slide f0", confidence: 0.9 }, { id: "f2", tSec: 4, text: "slide f2", confidence: 0.9 }]);
  assert.deepEqual(r.errors, []);
});

test("ocrKeyframes: throw / rejection / bad result omit the frame and are reported without text", async () => {
  const ocr: OcrFn = async (f) => {
    if (f.id === "a") throw new Error("secret passcode 1234");
    if (f.id === "b") return { text: 5 } as unknown as { text: string };
    if (f.id === "c") return { text: "ok", confidence: 7 };
    if (f.id === "d") return null as unknown as { text: string };
    return { text: "fine" };
  };
  const r = await ocrKeyframes([kf("a", 0), kf("b", 2), kf("c", 4), kf("d", 6), kf("e", 8)], ocr);
  assert.deepEqual(r.observations, [{ id: "e", tSec: 8, text: "fine" }]);
  assert.deepEqual(r.errors.map((e) => [e.frameId, e.code]), [["a", "ocr-failed"], ["b", "ocr-bad-result"], ["c", "ocr-bad-result"], ["d", "ocr-bad-result"]]);
  assert.ok(!JSON.stringify(r.errors).includes("passcode"));
  assert.deepEqual((await ocrKeyframes([], ocr)), { observations: [], errors: [] });
});

test("ocrKeyframes: frames are processed sequentially", async () => {
  let live = 0, peak = 0;
  const ocr: OcrFn = async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setImmediate(r)); live--; return { text: "t" }; };
  await ocrKeyframes([kf("a", 0), kf("b", 2), kf("c", 4)], ocr);
  assert.equal(peak, 1);
});

test("pipeline with fake ffmpeg + fake OCR: OCR text drives sameness; output carries no slide text", async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-ocr-"));
  try {
    const input = join(d, "rec.mp4");
    writeFileSync(input, "not a video");
    const A = wave(0), B = other();
    const exec: ExecFn = async (_c, args) => (args.includes("rawvideo") ? okRaw([A, A, B, B, B]) : okRaw([]));
    // Two distinct keyframes (f0, f2) whose OCR text is identical -> one slide; frame f2 is the "same slide".
    const ocr: OcrFn = async () => ({ text: "  Quarterly   SECRET-ROADMAP \n" });
    const run = await extractSlideTurnAlignment(input, {
      outDir: join(d, "out"), intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d, ocr,
      turns: [{ id: "t1", tStart: 0, tEnd: 5 }, { id: "t2", tStart: 5, tEnd: 10 }],
    });
    assert.deepEqual(run.ocrErrors, []);
    assert.deepEqual(run.alignment.errors, []);
    assert.equal(run.alignment.slides.length, 1);
    assert.deepEqual(run.alignment.slides[0]!.observationIds, ["f0", "f2"]);
    assert.deepEqual(run.alignment.turns.map((t) => [t.turnId, t.primarySlideId]), [["t1", "f0"], ["t2", "f0"]]);
    assert.ok(!JSON.stringify(run).includes("SECRET"), "OCR text must not appear in the run result");

    // Different OCR text per keyframe -> two slides, same as the stand-in behaviour; failed frame is omitted.
    const ocr2: OcrFn = async (f) => { if (f.id === "f2") throw new Error("boom"); return { text: `T ${f.id}` }; };
    const run2 = await extractSlideTurnAlignment(input, {
      outDir: join(d, "out2"), intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d, ocr: ocr2,
      turns: [{ id: "t1", tStart: 0, tEnd: 5 }, { id: "t2", tStart: 5, tEnd: 10 }],
    });
    assert.deepEqual(run2.ocrErrors, [{ frameId: "f2", code: "ocr-failed" }]);
    assert.deepEqual(run2.alignment.turns.map((t) => [t.turnId, t.primarySlideId]), [["t1", "f0"], ["t2", "f0"]]);

    // No ocr option: unchanged behaviour (stand-in), ocrErrors [].
    const run3 = await extractSlideTurnAlignment(input, {
      outDir: join(d, "out3"), intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d,
      turns: [{ id: "t1", tStart: 0, tEnd: 5 }],
    });
    assert.deepEqual(run3.ocrErrors, []);
    assert.deepEqual(run3.alignment.turns[0]!.attachments.map((a) => a.slideId), ["f0", "f2"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
