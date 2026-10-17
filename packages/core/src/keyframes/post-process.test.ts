import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiVisionOcr, type VisionRequest } from "./vision-ocr.js";
import { KEYFRAME_OCR_FLAG, keyframeOcrEnabled, runKeyframeOcrPostProcess } from "./post-process.js";
import type { SlideAlignmentRun } from "./extract.js";
import type { OcrFn } from "./ocr-stage.js";

// FAKES ONLY: no network, no model, no ffmpeg.
const okBody = (text: string) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text }) }] } }] });
const withText = (raw: string) => ({ candidates: [{ content: { parts: [{ text: raw }] } }] });
const frame = { id: "f0", tSec: 0, framePath: "/x/f0.png" };
const readFrame = async () => new Uint8Array([1, 2, 3]);
const fakeRun = (): SlideAlignmentRun => ({ keyframes: [{ id: "f0", tSec: 0, hash: "0".repeat(16), from: 0, to: 2, frameIds: ["f0"], framePath: "/x/f0.png" }],
  slides: [], alignment: { turns: [], slides: [], errors: [] }, sampledFrames: 3, intervalSec: 2, ocrErrors: [{ frameId: "f1", code: "ocr-failed", attempts: 4 }] });
const on = { [KEYFRAME_OCR_FLAG]: "1" };

test("flag is OFF unless exactly 1", () => {
  assert.equal(keyframeOcrEnabled({}), false);
  for (const v of ["0", "true", "", "yes", " 1"]) assert.equal(keyframeOcrEnabled({ [KEYFRAME_OCR_FLAG]: v }), false);
  assert.equal(keyframeOcrEnabled(on), true);
});

test("flag off: nothing is called (extract, ocr)", async () => {
  let calls = 0;
  const r = await runKeyframeOcrPostProcess({ env: {}, video: "v", outDir: "o", turns: [], ocr: async () => { calls++; return { text: "" }; },
    extract: async () => { calls++; return fakeRun(); } });
  assert.deepEqual(r, { status: "disabled" });
  assert.equal(calls, 0);
});

test("flag on without a provider is skipped, not failed", async () => {
  let calls = 0;
  const r = await runKeyframeOcrPostProcess({ env: on, video: "v", outDir: "o", turns: [], extract: async () => { calls++; return fakeRun(); } });
  assert.deepEqual(r, { status: "skipped", reason: "no-ocr-provider" });
  assert.equal(calls, 0);
});

test("flag on: runs the stage with the injected OCR, retry options and turns; returns ids/ranges only", async () => {
  let seen: { video: string; opts: Record<string, unknown> } | undefined;
  const ocr: OcrFn = async () => ({ text: "SECRET SLIDE TEXT" });
  const retry = { retries: 1 };
  const r = await runKeyframeOcrPostProcess({ env: on, video: "rec.webm", outDir: "/tmp/o", turns: [{ id: "t1", tStart: 0, tEnd: 1 }], ocr, ocrRetry: retry,
    extract: async (video, opts) => { seen = { video, opts: opts as unknown as Record<string, unknown> }; return fakeRun(); } });
  assert.equal(seen?.video, "rec.webm");
  assert.equal(seen?.opts.ocr, ocr);
  assert.equal(seen?.opts.ocrRetry, retry);
  assert.equal(seen?.opts.outDir, "/tmp/o");
  assert.deepEqual(seen?.opts.turns, [{ id: "t1", tStart: 0, tEnd: 1 }]);
  assert.equal(r.status, "done");
  if (r.status === "done") { assert.equal(r.keyframeCount, 1); assert.deepEqual(r.ocrErrors, [{ frameId: "f1", code: "ocr-failed", attempts: 4 }]); }
  assert.ok(!JSON.stringify(r).includes("SECRET"));
});

test("a throwing stage is returned as failed with a code only (never throws)", async () => {
  const e = Object.assign(new Error("ffmpeg stderr with /secret/path"), { code: "ffmpeg-missing" });
  const r = await runKeyframeOcrPostProcess({ env: on, video: "v", outDir: "o", turns: [], ocr: async () => ({ text: "" }), extract: async () => { throw e; } });
  assert.deepEqual(r, { status: "failed", code: "ffmpeg-missing" });
  const r2 = await runKeyframeOcrPostProcess({ env: on, video: "v", outDir: "o", turns: [], ocr: async () => ({ text: "" }), extract: async () => { throw new Error("x"); } });
  assert.deepEqual(r2, { status: "failed", code: "stage-failed" });
});

test("gemini vision adapter: builds the request, returns text, sends png inlineData", async () => {
  let req: VisionRequest | undefined;
  const ocr = createGeminiVisionOcr({ apiKey: "KEY", model: "gemini-x", readFrame, transport: async (r) => { req = r; return { status: 200, body: okBody("Hello slide") }; } });
  assert.deepEqual(await ocr(frame), { text: "Hello slide" });
  assert.equal(req?.method, "POST");
  assert.match(req?.url ?? "", /models\/gemini-x:generateContent$/);
  assert.equal(req?.headers?.["x-goog-api-key"], "KEY");
  const parts = (req?.body as { contents: { parts: Record<string, unknown>[] }[] }).contents[0]!.parts;
  assert.deepEqual(parts[1], { inlineData: { mimeType: "image/png", data: Buffer.from([1, 2, 3]).toString("base64") } });
});

test("gemini vision adapter: blank text is valid; bad status / non-JSON / missing text throw without leaking the key", async () => {
  const mk = (res: { status: number; body: unknown }) => createGeminiVisionOcr({ apiKey: "KEY123", model: "m", readFrame, transport: async () => res });
  assert.deepEqual(await mk({ status: 200, body: okBody("") })(frame), { text: "" });
  await assert.rejects(mk({ status: 500, body: okBody("valid text but a failing status") })(frame), /status 500/);
  for (const res of [{ status: 500, body: {} }, { status: 200, body: withText("not json") }, { status: 200, body: withText('{"a":1}') }, { status: 200, body: null }]) {
    await assert.rejects(mk(res)(frame), (e: Error) => !e.message.includes("KEY123"));
  }
});

test("gemini vision adapter plugs into ocrKeyframes retry: a transient 503 is retried, then succeeds", async () => {
  const { ocrKeyframes } = await import("./ocr-stage.js");
  let n = 0;
  const ocr = createGeminiVisionOcr({ apiKey: "k", model: "m", readFrame, transport: async () => (++n < 3 ? { status: 503, body: {} } : { status: 200, body: okBody("ok") }) });
  const r = await ocrKeyframes([{ ...frame, hash: "0".repeat(16), from: 0, to: 2, frameIds: ["f0"] }], ocr, { sleep: async () => {} });
  assert.equal(n, 3);
  assert.deepEqual(r.observations.map((o) => o.text), ["ok"]);
  assert.deepEqual(r.errors, []);
});

test("gemini vision adapter: rejects bad config", () => {
  const t = async () => ({ status: 200, body: {} });
  assert.throws(() => createGeminiVisionOcr({ apiKey: "", model: "m", transport: t }));
  assert.throws(() => createGeminiVisionOcr({ apiKey: "k", model: "a/b?x", transport: t }));
});
