import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { FFMPEG_ENV } from "./ffmpeg-args.js";
import { extractSlideTurnAlignment, type ExecFn, type ExecResult } from "./extract.js";
import { ocrKeyframes, type OcrFn } from "./ocr-stage.js";

const noSleep = async (): Promise<void> => {};
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
  const r = await ocrKeyframes([kf("a", 0), kf("b", 2), kf("c", 4), kf("d", 6), kf("e", 8)], ocr, { sleep: noSleep });
  assert.deepEqual(r.observations, [{ id: "e", tSec: 8, text: "fine" }]);
  assert.deepEqual(r.errors.map((e) => [e.frameId, e.code]), [["a", "ocr-failed"], ["b", "ocr-bad-result"], ["c", "ocr-bad-result"], ["d", "ocr-bad-result"]]);
  assert.ok(r.errors.every((e) => e.attempts === 3));
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
      outDir: join(d, "out2"), intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d, ocr: ocr2, ocrRetry: { sleep: noSleep },
      turns: [{ id: "t1", tStart: 0, tEnd: 5 }, { id: "t2", tStart: 5, tEnd: 10 }],
    });
    assert.deepEqual(run2.ocrErrors, [{ frameId: "f2", code: "ocr-failed", attempts: 3 }]);
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

test("retry: success on a later attempt, with exponential backoff via injected sleep (no real sleeping)", async () => {
  const calls: string[] = []; const sleeps: number[] = [];
  const ocr: OcrFn = async (f) => { calls.push(f.id); if (calls.length < 3) throw new Error("transient"); return { text: "ok" }; };
  const r = await ocrKeyframes([kf("a", 0)], ocr, { sleep: async (ms) => { sleeps.push(ms); }, backoffMs: 100 });
  assert.deepEqual(r.observations, [{ id: "a", tSec: 0, text: "ok" }]);
  assert.deepEqual(r.errors, []);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

test("retry: a definitive blank result is NOT retried and is not an error", async () => {
  let n = 0; const sleeps: number[] = [];
  const r = await ocrKeyframes([kf("a", 0)], async () => { n++; return { text: "" }; }, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(n, 1);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(r.observations, [{ id: "a", tSec: 0, text: "" }]);
  assert.deepEqual(r.errors, []);
});

test("retry: retries=0 means exactly one primary attempt", async () => {
  let n = 0;
  const r = await ocrKeyframes([kf("a", 0)], async () => { n++; throw new Error("x"); }, { retries: 0, sleep: noSleep });
  assert.equal(n, 1);
  assert.deepEqual(r.errors, [{ frameId: "a", code: "ocr-failed", attempts: 1 }]);
});

test("fallback: used after the primary is exhausted; not used when the primary succeeds", async () => {
  let primary = 0, fb = 0;
  const ocr: OcrFn = async (f) => { primary++; if (f.id === "a") throw new Error("down"); return { text: "P" }; };
  const fallback: OcrFn = async () => { fb++; return { text: "from-fallback" }; };
  const r = await ocrKeyframes([kf("a", 0), kf("b", 2)], ocr, { sleep: noSleep, fallback });
  assert.deepEqual(r.observations, [{ id: "a", tSec: 0, text: "from-fallback" }, { id: "b", tSec: 2, text: "P" }]);
  assert.deepEqual(r.errors, []);
  assert.equal(primary, 4); // 3 for a, 1 for b
  assert.equal(fb, 1);
});

test("all attempts fail: frame omitted, attempt count reported, never blank text, no text logged", async () => {
  const logged: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a: unknown[]) => { logged.push(a.join(" ")); };
  let r;
  try {
    const ocr: OcrFn = async () => { throw new Error("SECRET-SLIDE-TEXT"); };
    const fallback: OcrFn = async () => ({ text: 5 } as unknown as { text: string });
    r = await ocrKeyframes([kf("a", 0), kf("b", 2)], ocr, { sleep: noSleep, fallback, retries: 1 });
  } finally { Object.assign(console, orig); }
  assert.deepEqual(r.observations, []);
  assert.deepEqual(r.errors, [{ frameId: "a", code: "ocr-bad-result", attempts: 3 }, { frameId: "b", code: "ocr-bad-result", attempts: 3 }]);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.deepEqual(logged, []);
});

test("timeout counts as a retryable failure", async () => {
  let n = 0;
  const ocr: OcrFn = (): Promise<{ text: string }> => { n++; return n === 1 ? new Promise(() => undefined) : Promise.resolve({ text: "late-ok" }); };
  const r = await ocrKeyframes([kf("a", 0)], ocr, { sleep: noSleep, timeoutMs: 5 });
  assert.equal(n, 2);
  assert.deepEqual(r.observations, [{ id: "a", tSec: 0, text: "late-ok" }]);
});

test("pipeline: ocrRetry + fallback flow through extractSlideTurnAlignment; failed frame reported with attempts", async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-ocr-retry-"));
  try {
    const input = join(d, "rec.mp4");
    writeFileSync(input, "not a video");
    const exec: ExecFn = async (_c, args) => (args.includes("rawvideo") ? okRaw([wave(0), wave(0), other(), other(), other()]) : okRaw([]));
    const base = { intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d, turns: [{ id: "t1", tStart: 0, tEnd: 5 }] };
    const dead: OcrFn = async () => { throw new Error("x"); };
    const run = await extractSlideTurnAlignment(input, { ...base, outDir: join(d, "o1"), ocr: dead, ocrRetry: { sleep: noSleep, retries: 1 } });
    assert.deepEqual(run.ocrErrors.map((e) => [e.frameId, e.attempts]), [["f0", 2], ["f2", 2]]);
    const run2 = await extractSlideTurnAlignment(input, { ...base, outDir: join(d, "o2"), ocr: dead, ocrRetry: { sleep: noSleep, fallback: async (f) => ({ text: `T ${f.id}` }) } });
    assert.deepEqual(run2.ocrErrors, []);
    assert.equal(run2.alignment.slides.length, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
