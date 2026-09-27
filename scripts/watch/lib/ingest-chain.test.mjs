// scripts/watch/lib/ingest-chain.test.mjs — u2-fix1-ingest-guards (+ u2-fix2-reingest-same-id).
// Pure-function tests for the guards this repo's fix cycles add/repair: `assertCoverage`
// (ISS-304), `assertIndexed` (ISS-305), `computeStem` (ISS-306 part 1), `decideReingestAction` +
// `resolveSessionIdForIngest` (ISS-314). `ingestOneDriveFile` itself is not unit-tested here (it
// shells out to ffmpeg/ffprobe/node child processes and a live Mongo — no existing test in this
// lib does that either; digest.mjs/lock.mjs/session-skeleton.mjs are all tested at the pure-
// function layer only, and these follow the same house style).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCoverage, assertIndexed, computeStem, decideReingestAction, resolveSessionIdForIngest } from "./ingest-chain.mjs";

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

// ISS-314: --reingest of a session already seeded under the correct id with 0 chunks used to
// fall through to the full ingest chain, which then forked the id and re-transcribed, and
// seed-toc's insert hit E11000 on the unchanged sources._id. `qa/watch/reingest-2026-09-27-
// postmerge.log` is the recorded live reproduction (41 turns, 0 chunks, dir already on disk).

test("decideReingestAction: ISS-314's own reproduction (same id, 41 turns, 0 chunks) -> reindex-only, NOT reingest", () => {
  const decision = decideReingestAction({
    turnsExist: true,
    turnCount: 41,
    chunkCount: 0,
    oldSessionId: "2026-09-24-in-focus",
    correctSessionId: "2026-09-24-in-focus",
  });
  assert.equal(decision.action, "reindex-only");
});

test("decideReingestAction: same id, chunks already > 0 -> already-repaired (no-op) — unchanged prior behavior", () => {
  const decision = decideReingestAction({
    turnsExist: true,
    turnCount: 41,
    chunkCount: 12,
    oldSessionId: "2026-09-24-in-focus",
    correctSessionId: "2026-09-24-in-focus",
  });
  assert.equal(decision.action, "already-repaired");
});

test("decideReingestAction: different old/correct id, 0 chunks under a NEW correct id -> reingest (delete-and-reingest path, unchanged)", () => {
  const decision = decideReingestAction({
    turnsExist: false, // the correct id has no turns.json yet — this is the ordinary rename-repair case
    turnCount: 0,
    chunkCount: 0,
    oldSessionId: "2026-09-24-in-focu", // stale mis-derived id from before ISS-306's fix
    correctSessionId: "2026-09-24-in-focus",
  });
  assert.equal(decision.action, "reingest");
});

test("decideReingestAction: different old/correct id, but the CORRECT id's dir already has 0-chunk turns too -> reingest (falls through, does not misfire reindex-only for the wrong session)", () => {
  const decision = decideReingestAction({
    turnsExist: true,
    turnCount: 5,
    chunkCount: 0,
    oldSessionId: "2026-09-24-in-focu",
    correctSessionId: "2026-09-24-in-focus",
  });
  assert.equal(decision.action, "reingest");
});

test("decideReingestAction: no prior row at all (oldSessionId null), correct id has no turns.json -> reingest (unchanged first-time-ingest path)", () => {
  const decision = decideReingestAction({
    turnsExist: false,
    turnCount: 0,
    chunkCount: 0,
    oldSessionId: null,
    correctSessionId: "2026-09-24-in-focus",
  });
  assert.equal(decision.action, "reingest");
});

test("resolveSessionIdForIngest: dir doesn't exist -> id unchanged (the common case)", () => {
  assert.equal(resolveSessionIdForIngest("2026-09-24-in-focus", false, null, "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri"), "2026-09-24-in-focus");
});

test("resolveSessionIdForIngest: dir exists for a GENUINELY DIFFERENT Drive file sharing date+title -> forks the id (unchanged prior behavior)", () => {
  const forked = resolveSessionIdForIngest("2026-09-24-in-focus", true, "someOtherDriveFileId123", "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri");
  assert.equal(forked, "2026-09-24-in-focus-1mji5w");
});

test("resolveSessionIdForIngest: dir exists for THIS SAME Drive file (ISS-314 collision) -> refuses, does not fork", () => {
  assert.throws(
    () => resolveSessionIdForIngest("2026-09-24-in-focus", true, "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri", "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri"),
    /already exists on disk for this exact Drive file/,
  );
});

test("resolveSessionIdForIngest: dir exists but existing source.json is unreadable/unknown (existingDriveFileId null) -> falls through to fork, never silently succeeds", () => {
  const forked = resolveSessionIdForIngest("2026-09-24-in-focus", true, null, "1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri");
  assert.equal(forked, "2026-09-24-in-focus-1mji5w");
});
