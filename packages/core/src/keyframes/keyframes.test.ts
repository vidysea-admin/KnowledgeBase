import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { hexHammingDistance } from "../domain/keyframe-dedupe.js";
import { FFMPEG_ENV, framePassArgs, hashPassArgs, KeyframeExtractError, resolveFfmpeg } from "./ffmpeg-args.js";
import { extractFrameHashes, extractSlideTurnAlignment, type ExecFn, type ExecResult } from "./extract.js";
import { dHashGray9x8, dHashRawStream, HASH_FRAME_BYTES } from "./perceptual-hash.js";

// SYNTHETIC 9x8 gray frames only (no recording): a smooth 2-D wave.
const wave = (shift = 0, gain = 1, offset = 0): Uint8Array => {
  const f = new Uint8Array(72);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) {
    f[r * 9 + c] = Math.max(0, Math.min(255, Math.round(offset + gain * (128 + 100 * Math.sin((c + shift) * 0.9 + r * 0.5)))));
  }
  return f;
};
const other = (): Uint8Array => { const f = new Uint8Array(72); for (let i = 0; i < 72; i++) f[i] = (i * 37 + (i % 9) * 91) % 256; return f; };

test("dHash: 16 hex chars; identical frames identical; flat frame is all zeros", () => {
  const h = dHashGray9x8(wave());
  assert.match(h, /^[0-9a-f]{16}$/u);
  assert.equal(dHashGray9x8(wave()), h);
  assert.equal(dHashGray9x8(new Uint8Array(72).fill(200)), "0000000000000000");
});

test("dHash: bit layout is row-major, MSB first, 1 when left > right", () => {
  const f = new Uint8Array(72);
  f.fill(1); f[0] = 5; // row 0, col 0 > col 1 -> top bit of byte 0
  f[9 * 7 + 7] = 9; // row 7, col 7 > col 8 -> lowest bit of byte 7
  assert.equal(dHashGray9x8(f), "8000000000000001");
});

test("dHash: brightness shift keeps the hash, one-pixel shift stays near, different content is far", () => {
  const base = dHashGray9x8(wave());
  assert.equal(dHashGray9x8(wave(0, 1, -40)), base);
  const shifted = hexHammingDistance(base, dHashGray9x8(wave(1)));
  const far = hexHammingDistance(base, dHashGray9x8(other()));
  assert.ok(shifted <= 20, `shifted distance ${shifted}`);
  assert.ok(far > 5, `different distance ${far}`);
  assert.ok(far > 0);
});

test("dHash: wrong size and partial stream throw RangeError", () => {
  assert.throws(() => dHashGray9x8(new Uint8Array(71)), RangeError);
  assert.throws(() => dHashGray9x8([1, 2] as never), RangeError);
  assert.throws(() => dHashRawStream(new Uint8Array(HASH_FRAME_BYTES + 1)), RangeError);
  assert.deepEqual(dHashRawStream(new Uint8Array(0)), []);
  assert.equal(dHashRawStream(Buffer.concat([wave(), other()])).length, 2);
});

test("ffmpeg argument arrays are exact", () => {
  assert.deepEqual(hashPassArgs("/v/in put.mp4", 2), [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-i", "/v/in put.mp4", "-an", "-sn",
    "-vf", "fps=1/2,scale=9:8:flags=area,format=gray", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"]);
  assert.deepEqual(framePassArgs("/v/in.mp4", 12.5, "/o/kf-0001.png"), [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-ss", "12.5", "-i", "/v/in.mp4", "-an", "-frames:v", "1", "-y", "/o/kf-0001.png"]);
});

test("resolveFfmpeg: env file, env directory, relative rejected, default, PATH fallback", () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-resolve-"));
  try {
    const bin = join(d, "ffmpeg.exe");
    writeFileSync(bin, "x");
    assert.equal(resolveFfmpeg({ [FFMPEG_ENV]: bin }, d, "win32"), bin);
    assert.equal(resolveFfmpeg({ [FFMPEG_ENV]: d }, d, "win32"), join(d, "ffmpeg.exe"));
    assert.equal(resolveFfmpeg({ [FFMPEG_ENV]: d }, d, "linux"), join(d, "ffmpeg"));
    assert.throws(() => resolveFfmpeg({ [FFMPEG_ENV]: "ffmpeg" }, d), (e: unknown) => e instanceof KeyframeExtractError && e.code === "bad-config");
    assert.equal(resolveFfmpeg({}, d, "win32"), "ffmpeg");
    const dflt = join(d, ".cache", "tools", "ffmpeg-9.0.2", "bin");
    mkdirSync(dflt, { recursive: true });
    writeFileSync(join(dflt, "ffmpeg.exe"), "x");
    assert.equal(resolveFfmpeg({}, d, "win32"), join(dflt, "ffmpeg.exe"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

const okRaw = (frames: Uint8Array[]): ExecResult => ({ code: 0, stdout: Buffer.concat(frames), stderr: "", timedOut: false, truncated: false });

test("pipeline with a fake ffmpeg: calls, keyframes, alignment", async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-fake-"));
  try {
    const input = join(d, "rec.mp4");
    writeFileSync(input, "not a video");
    const calls: string[][] = [];
    const A = wave(), B = other();
    const exec: ExecFn = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return args.includes("rawvideo") ? okRaw([A, A, B, B, B]) : okRaw([]);
    };
    const run = await extractSlideTurnAlignment(input, {
      outDir: join(d, "out"), intervalSec: 2, exec, env: { [FFMPEG_ENV]: resolve("/x/ffmpeg") }, repoRoot: d,
      turns: [{ id: "t1", tStart: 0, tEnd: 5 }, { id: "t2", tStart: 5, tEnd: 10 }],
    });
    assert.equal(run.sampledFrames, 5);
    assert.deepEqual(run.keyframes.map((k) => [k.id, k.tSec, k.from, k.to]), [["f0", 0, 0, 4], ["f2", 4, 4, 10]]);
    assert.equal(calls.length, 3); // 1 hash pass + 2 frame passes
    assert.deepEqual(calls[1]!.slice(5, 7), ["-ss", "0"]);
    assert.deepEqual(calls[2]!.slice(5, 7), ["-ss", "4"]);
    assert.ok(run.keyframes[1]!.framePath.endsWith("kf-0001.png"));
    assert.deepEqual(run.alignment.errors, []);
    const t1 = run.alignment.turns.find((t) => t.turnId === "t1")!;
    assert.deepEqual(t1.attachments.map((a) => a.slideId), ["f0", "f2"]);
    assert.equal(t1.primarySlideId, "f0");
    assert.equal(run.alignment.turns.find((t) => t.turnId === "t2")!.primarySlideId, "f2");
    assert.ok(!JSON.stringify(run.alignment).includes("keyframe:"), "stand-in slide text must not leak into the alignment output");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("typed errors: bad input, missing recording, bad output, nonzero exit, timeout, truncation", async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-err-"));
  try {
    const input = join(d, "rec.mp4");
    writeFileSync(input, "x");
    const env = { [FFMPEG_ENV]: resolve("/x/ffmpeg") };
    const code = async (p: Promise<unknown>): Promise<string> => p.then(() => "none", (e: unknown) => (e instanceof KeyframeExtractError ? e.code : "other"));
    const ex = (r: Partial<ExecResult>): ExecFn => async () => ({ code: 0, stdout: Buffer.alloc(0), stderr: "", timedOut: false, truncated: false, ...r });
    assert.equal(await code(extractFrameHashes("", { env })), "bad-input");
    assert.equal(await code(extractFrameHashes(input, { env, intervalSec: 0 })), "bad-input");
    assert.equal(await code(extractFrameHashes(input, { env, intervalSec: Number.NaN })), "bad-input");
    assert.equal(await code(extractFrameHashes(join(d, "nope.mp4"), { env })), "input-missing");
    assert.equal(await code(extractFrameHashes(input, { env, exec: ex({ stdout: Buffer.alloc(73) }) })), "bad-output");
    assert.equal(await code(extractFrameHashes(input, { env, exec: ex({ code: 1, stderr: "boom" }) })), "ffmpeg-failed");
    assert.equal(await code(extractFrameHashes(input, { env, exec: ex({ code: null, timedOut: true }) })), "ffmpeg-timeout");
    assert.equal(await code(extractFrameHashes(input, { env, exec: ex({ code: null, truncated: true }) })), "output-too-large");
    assert.equal(await code(extractFrameHashes(input, { env: { [FFMPEG_ENV]: "rel/ffmpeg" } })), "bad-config");
    assert.deepEqual(await extractFrameHashes(input, { env, exec: ex({}) }), []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("missing ffmpeg binary (real spawn) -> typed ffmpeg-missing", async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-miss-"));
  try {
    const input = join(d, "rec.mp4");
    writeFileSync(input, "x");
    await assert.rejects(
      extractFrameHashes(input, { env: { [FFMPEG_ENV]: join(d, "no-such-ffmpeg.exe") }, timeoutMs: 20_000 }),
      (e: unknown) => e instanceof KeyframeExtractError && e.code === "ffmpeg-missing");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// End-to-end only when a real ffmpeg is configured/present; never downloads anything.
const REAL = ((): string | null => {
  try {
    const bin = resolveFfmpeg(process.env, resolve(import.meta.dirname, "..", "..", "..", ".."));
    const r = spawnSync(bin, ["-hide_banner", "-version"], { timeout: 20_000, windowsHide: true });
    return r.status === 0 ? bin : null;
  } catch { return null; }
})();

test("end-to-end on a generated 8 s video (real ffmpeg)", { skip: REAL === null ? `no usable ffmpeg (set ${FFMPEG_ENV} or provide .cache/tools/ffmpeg-9.0.2/bin/ffmpeg.exe or PATH ffmpeg)` : false, timeout: 120_000 }, async () => {
  const d = mkdtempSync(join(tmpdir(), "keyframes-e2e-"));
  try {
    const video = join(d, "slides.mkv");
    const gen = spawnSync(REAL!, ["-hide_banner", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "smptebars=s=160x120:d=4:r=5",
      "-f", "lavfi", "-i", "smptebars=s=160x120:d=4:r=5", "-filter_complex", "[1:v]hflip[b];[0:v][b]concat=n=2:v=1:a=0",
      "-pix_fmt", "yuv420p", "-c:v", "mpeg4", "-y", video], { timeout: 60_000, windowsHide: true });
    assert.equal(gen.status, 0, String(gen.stderr));
    // REAL is a bare "ffmpeg" when it came from PATH (CI); LKB_FFMPEG_PATH must be absolute, so only set it when REAL is.
    const env: Record<string, string | undefined> = { ...process.env };
    if (isAbsolute(REAL!)) env[FFMPEG_ENV] = REAL!; else delete env[FFMPEG_ENV];
    const frames = await extractFrameHashes(video, { env, intervalSec: 2 });
    assert.equal(frames.length, 4);
    assert.deepEqual(frames.map((f) => f.tSec), [0, 2, 4, 6]);
    assert.ok(hexHammingDistance(frames[0]!.hash, frames[1]!.hash) <= 5, "same picture, same slide");
    assert.ok(hexHammingDistance(frames[1]!.hash, frames[2]!.hash) > 5, "flipped picture, new slide");
    const run = await extractSlideTurnAlignment(video, { env, intervalSec: 2, outDir: join(d, "frames"),
      turns: [{ id: "a", tStart: 0, tEnd: 3 }, { id: "b", tStart: 5, tEnd: 8 }] });
    assert.deepEqual(run.keyframes.map((k) => [k.tSec, k.from, k.to]), [[0, 0, 4], [4, 4, 8]]);
    for (const k of run.keyframes) {
      const png = readFileSync(k.framePath);
      assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
    }
    assert.equal(run.alignment.turns.find((t) => t.turnId === "a")!.primarySlideId, run.keyframes[0]!.id);
    assert.equal(run.alignment.turns.find((t) => t.turnId === "b")!.primarySlideId, run.keyframes[1]!.id);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
