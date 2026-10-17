/**
 * packages/ai/src/stt/transcription-plan.test.ts — T-048 slice 1. Pure; no I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chooseTranscriptionPath,
  TODAY_THRESHOLDS,
  T048_THRESHOLDS,
  type TranscriptionThresholds,
  type TranscriptionPlan,
} from "./transcription-plan.js";
import { computeChunkBoundaries } from "./chunk-audio.js";

const MIN = 60;
const T48 = "gemini-3.8-flash";
const plan = (min: number, t: TranscriptionThresholds = T048_THRESHOLDS, model = T48, bytes?: number | null) =>
  chooseTranscriptionPath({ durationSeconds: min * MIN, fileBytes: bytes, modelId: model, thresholds: t });
const custom = (o: Partial<TranscriptionThresholds>): TranscriptionThresholds => ({ ...T048_THRESHOLDS, ...o });

test("acceptance: 89 min -> single with a chunked fallback present", () => {
  const p = plan(89);
  assert.equal(p.kind, "single");
  if (p.kind !== "single") return;
  assert.equal(p.fallback.kind, "chunked");
  assert.ok(p.fallback.chunks.length >= 1);
  assert.equal(p.fallback.chunks[p.fallback.chunks.length - 1]!.end, 89 * MIN);
});

test("acceptance: 91 min -> chunked under the T-048 constant", () => {
  const p = plan(91);
  assert.equal(p.kind, "chunked");
  assert.equal(p.reason, "duration-over-limit");
});

test("boundary: exactly 90 min is single (inclusive); just over is chunked", () => {
  assert.equal(plan(90).kind, "single");
  assert.equal(chooseTranscriptionPath({ durationSeconds: 5400.001, modelId: T48, thresholds: T048_THRESHOLDS }).kind, "chunked");
});

test("boundary: singleInclusive=false makes the limit itself chunked", () => {
  const t = custom({ singleInclusive: false });
  assert.equal(plan(90, t).kind, "chunked");
  assert.equal(chooseTranscriptionPath({ durationSeconds: 5399.9, modelId: T48, thresholds: t }).kind, "single");
});

test("invalid durations are chunked with a typed reason, never single", () => {
  for (const d of [0, -5, NaN, Infinity, -Infinity, null, undefined, "90" as unknown as number]) {
    const p = chooseTranscriptionPath({ durationSeconds: d, modelId: T48, thresholds: T048_THRESHOLDS });
    assert.equal(p.kind, "chunked", String(d));
    assert.equal(p.reason, "invalid-duration", String(d));
  }
});

test("size limit overrides duration; at the limit is single; unknown size passes; bad size is chunked", () => {
  const t = custom({ maxSingleBytes: 1000 });
  assert.equal(plan(10, t, T48, 1001).reason, "size-over-limit");
  assert.equal(plan(10, t, T48, 1000).kind, "single");
  assert.equal(plan(10, t, T48, null).kind, "single");
  assert.equal(plan(10, t, T48, NaN).reason, "invalid-size");
  assert.equal(plan(10, t, T48, -1).reason, "invalid-size");
});

test("unsupported model -> chunked; null model list means any model", () => {
  assert.equal(plan(10, T048_THRESHOLDS, "gemini-3.5-flash").reason, "model-not-single-call");
  assert.equal(chooseTranscriptionPath({ durationSeconds: 600, modelId: undefined as unknown as string, thresholds: T048_THRESHOLDS }).reason, "model-not-single-call");
  assert.equal(plan(10, TODAY_THRESHOLDS, "anything").kind, "single");
});

// Replicates scripts/watch/lib/ingest-chain.mjs:26 (LONG_SESSION_THRESHOLD_SECONDS = 40 * 60) and
// :219 (`durationSeconds !== null && durationSeconds > THRESHOLD` -> transcribe-long-session.mjs,
// else transcribe-toc-session.mjs). Not imported: that module has fs/child_process side effects.
// Divergence by design: today a NULL duration takes the short path; here it is chunked.
const legacyIsLong = (seconds: number): boolean => seconds > 40 * 60;

test("parity: TODAY_THRESHOLDS decides like ingest-chain.mjs:219 for the duration table", () => {
  for (const m of [30, 39.9, 40, 40.1, 60, 89, 90, 91, 120, 240]) {
    const p = plan(m, TODAY_THRESHOLDS, "gemini-3.5-flash");
    assert.equal(p.kind === "chunked", legacyIsLong(m * MIN), `${m} min`);
  }
});

test("parity: today's chunked plan equals chunk-audio.ts computeChunkBoundaries (2400 s, no overlap)", () => {
  for (const m of [41, 80, 100, 120]) {
    const p = plan(m, { ...TODAY_THRESHOLDS, minTailSeconds: 0 }, "x");
    assert.deepEqual(p.kind === "chunked" ? p.chunks : null, computeChunkBoundaries(m * MIN, 2400), `${m} min`);
  }
});

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("properties (seeded, 500 durations): coverage, overlap, length, count, tail", () => {
  const r = rng(48);
  const t = custom({ chunkSeconds: 600, overlapSeconds: 30, minTailSeconds: 45, maxChunks: 10_000 });
  for (let i = 0; i < 500; i++) {
    const d = 1 + Math.floor(r() * 40_000) + (i % 2 ? r() : 0);
    const p = chooseTranscriptionPath({ durationSeconds: d, modelId: "other", thresholds: t });
    assert.equal(p.kind, "chunked");
    if (p.kind !== "chunked") return;
    const c = p.chunks;
    assert.equal(c[0]!.start, 0, `start d=${d}`);
    assert.equal(c[c.length - 1]!.end, d, `end d=${d}`);
    assert.equal(p.count, c.length);
    for (let k = 0; k < c.length; k++) {
      assert.ok(c[k]!.end > c[k]!.start);
      const limit = k === c.length - 1 && c.length > 1 ? 600 + 45 : 600;
      assert.ok(c[k]!.end - c[k]!.start <= limit + 1e-9, `len d=${d} k=${k}`);
      if (k > 0) assert.ok(Math.abs(c[k - 1]!.end - c[k]!.start - 30) < 1e-9, `overlap d=${d} k=${k}`);
    }
    if (c.length > 1) assert.ok(d - c[c.length - 2]!.end >= 45 - 1e-9, `tail d=${d}`);
    const raw = d <= 600 ? 1 : 1 + Math.ceil((d - 600) / 570);
    const merged = raw > 1 && d - ((raw - 2) * 570 + 600) < 45;
    assert.equal(c.length, merged ? raw - 1 : raw, `count d=${d}`);
  }
});

test("tiny tail is merged into the previous chunk; a tail of exactly minTail is kept", () => {
  const t = custom({ chunkSeconds: 100, overlapSeconds: 0, minTailSeconds: 10 });
  const merged = chooseTranscriptionPath({ durationSeconds: 205, modelId: "x", thresholds: t });
  assert.deepEqual(merged.kind === "chunked" ? merged.chunks : null, [{ start: 0, end: 100 }, { start: 100, end: 205 }]);
  const kept = chooseTranscriptionPath({ durationSeconds: 210, modelId: "x", thresholds: t });
  assert.deepEqual(kept.kind === "chunked" ? kept.chunks : null, [
    { start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 210 },
  ]);
});

test("chunk count is bounded: over maxChunks -> chunked, empty chunk list, typed reason", () => {
  const t = custom({ chunkSeconds: 10, minTailSeconds: 0, maxChunks: 5 });
  const p = chooseTranscriptionPath({ durationSeconds: 1e12, modelId: T48, thresholds: t });
  assert.equal(p.kind, "chunked");
  assert.equal(p.reason, "exceeds-max-chunks");
  assert.equal(p.kind === "chunked" ? p.chunks.length : -1, 0);
});

test("totality: hostile input never throws and is deterministic", () => {
  const th = (o: object) => ({ durationSeconds: 100, modelId: "a", thresholds: { ...T048_THRESHOLDS, ...o } });
  const hostile: unknown[] = [undefined, null, 5, "x", [], {}, { thresholds: null }, { durationSeconds: 1, modelId: "a", thresholds: {} },
    th({ chunkSeconds: 0 }), th({ overlapSeconds: 9999 }), th({ singleCallModels: "x" }), th({ maxChunks: NaN })];
  for (const h of hostile) {
    let a: TranscriptionPlan | undefined;
    assert.doesNotThrow(() => (a = chooseTranscriptionPath(h as never)));
    assert.equal(a!.kind, "chunked");
    assert.deepEqual(chooseTranscriptionPath(h as never), a);
  }
  assert.equal(chooseTranscriptionPath(th({ chunkSeconds: 0 }) as never).reason, "invalid-thresholds");
});

test("constants: today's values and T-048 values are as grounded", () => {
  assert.equal(TODAY_THRESHOLDS.maxSingleSeconds, 40 * 60);
  assert.equal(TODAY_THRESHOLDS.chunkSeconds, 2400);
  assert.equal(TODAY_THRESHOLDS.overlapSeconds, 0);
  assert.equal(T048_THRESHOLDS.maxSingleSeconds, 90 * 60);
  assert.deepEqual(T048_THRESHOLDS.singleCallModels, ["gemini-3.8-flash"]);
});

test("single's fallback is the chunked plan for the same duration, reason single-call-failed", () => {
  const p = plan(60);
  const c = plan(120, custom({ singleCallModels: ["nope"] }));
  assert.equal(p.kind, "single");
  if (p.kind !== "single" || c.kind !== "chunked") return;
  assert.equal(p.fallback.reason, "single-call-failed");
  assert.deepEqual(p.fallback.chunks, [{ start: 0, end: 2400 }, { start: 2400, end: 3600 }]);
});
