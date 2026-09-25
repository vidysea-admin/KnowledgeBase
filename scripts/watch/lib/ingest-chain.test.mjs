// scripts/watch/lib/ingest-chain.test.mjs — u2-fix1-ingest-guards. Pure-function tests for the
// three guards this fix cycle adds/repairs: `assertCoverage` (ISS-304), `assertIndexed`
// (ISS-305), `computeStem` (ISS-306 part 1). `ingestOneDriveFile` itself is not unit-tested here
// (it shells out to ffmpeg/ffprobe/node child processes and a live Mongo — no existing test in
// this lib does that either; digest.mjs/lock.mjs/session-skeleton.mjs are all tested at the pure-
// function layer only, and these three follow the same house style).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCoverage, assertIndexed, computeStem } from "./ingest-chain.mjs";

test("assertCoverage: this unit's own ISS-304 reproduction (2485s of 2939.6s = 84.5%) throws", () => {
  assert.throws(
    () => assertCoverage("2026-09-25-infocu", 2485, 2939.6),
    /covers 84\.5%/,
  );
});

test("assertCoverage: exactly at the 97% floor passes (boundary, inclusive)", () => {
  const duration = 1000;
  assert.doesNotThrow(() => assertCoverage("s", 970, duration)); // 970/1000 = 97.0% exactly
});

test("assertCoverage: just under the 97% floor throws (boundary)", () => {
  const duration = 1000;
  assert.throws(() => assertCoverage("s", 969.9, duration));
});

test("assertCoverage: full/over coverage passes", () => {
  assert.doesNotThrow(() => assertCoverage("s", 2939.6, 2939.6));
  assert.doesNotThrow(() => assertCoverage("s", 3000, 2939.6)); // last turn can slightly exceed ffprobe's own rounding
});

test("assertCoverage: ffprobe-unavailable (null duration) never blocks — nothing to judge against", () => {
  assert.doesNotThrow(() => assertCoverage("s", 5, null));
  assert.doesNotThrow(() => assertCoverage("s", 5, 0));
});

test("assertIndexed: this unit's own ISS-305 reproduction (27 turns, 0 chunks, no-chunkable-turns) throws", () => {
  assert.throws(
    () => assertIndexed("2026-09-25-infocu", 27, { written: 0, skipped: "no-chunkable-turns" }),
    /27 turns but 0 chunks/,
  );
});

test("assertIndexed: embedding-failed on a real session also throws (not just no-chunkable-turns)", () => {
  assert.throws(() => assertIndexed("s", 10, { written: 0, skipped: "embedding-failed" }));
});

test("assertIndexed: a session with real chunks passes", () => {
  assert.doesNotThrow(() => assertIndexed("s", 27, { written: 22, skipped: null }));
});

test("assertIndexed: zero turns never blocks (nothing to index in the first place)", () => {
  assert.doesNotThrow(() => assertIndexed("s", 0, { written: 0, skipped: "no-chunkable-turns" }));
});

test("assertIndexed: no-embedder is the one legitimate zero-chunk outcome and never blocks", () => {
  assert.doesNotThrow(() => assertIndexed("s", 27, { written: 0, skipped: "no-embedder" }));
});

test("computeStem: this unit's own ISS-306 reproduction — a dot-less Drive title keeps its last character", () => {
  // Before the fix: safeName.slice(0, safeName.lastIndexOf(".")) === safeName.slice(0, -1) for a
  // dot-less name, dropping the trailing "s" — the live log's own ffmpeg output path was
  // literally "...InFocu.m4a".
  assert.equal(computeStem("24th Sep - InFocus"), "24th Sep - InFocus");
});

test("computeStem: a real extension is still stripped normally", () => {
  assert.equal(computeStem("2nd Sep - India Test Series.mp4"), "2nd Sep - India Test Series");
});

test("computeStem: a leading-dot name (dotIdx === 0) is left whole, not stripped to empty", () => {
  assert.equal(computeStem(".hidden"), ".hidden");
});
