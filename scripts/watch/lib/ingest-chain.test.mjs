// scripts/watch/lib/ingest-chain.test.mjs — u2-fix1-ingest-guards (+ u2-fix2-reingest-same-id).
// Pure-function tests for the guards this repo's fix cycles add/repair: `assertCoverage`
// (ISS-304), `assertIndexed` (ISS-305), `computeStem` (ISS-306 part 1), `decideReingestAction` +
// `resolveSessionIdForIngest` (ISS-314), plus offline watcher validation/publication ordering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCoverage, assertIndexed, computeStem, decideReingestAction, resolveSessionIdForIngest, ingestOneDriveFile, chooseIngestTranscriber } from "./ingest-chain.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { validateSession } from "../../webinar/validate/validate-session.mjs";
import { loadWebinarSession } from "../../webinar/session-rows.mjs";
import { writeTranscriptGeneration, assertDerivedArtifactsCurrent } from "../../lib/transcript-provenance.mjs";
import { buildTranscriptQaGeneration } from "../../lib/transcription/transcript-qa-generation.mjs";
import { clampAndValidateTurns } from "../../../packages/ai/src/stt/transcript-qa.ts";

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

const watcherSha = bytes => createHash("sha256").update(bytes).digest("hex");

// Fake only command/provider/index transports. Both validation passes and final admission use
// the real implementations, with a known fixture duration instead of invoking a media codec.
function watcherFixture(t, mode = "clean") {
  const root = mkdtempSync(join(tmpdir(), "watcher-final-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessionId = "2026-10-15-fixture", tenantId = "watcher-tenant";
  const dir = join(root, "data", "toc-migrated", sessionId);
  const events = [], reports = [];
  const env = { LKB_TRANSCRIPT_QA: "1" };
  const raw = Array.from({ length: 3 }, (_, i) => ({ speakerRef: "spk:0", tStart: i * 20, tEnd: (i + 1) * 20, text: `fixture statement ${i}` }));
  const deps = {
    ROOT: root, RECORDINGS_DIR: join(root, "recordings"),
    AUDIO_DIR: join(root, "raw", "TOC", "TOC-Materials", "Audio"),
    TENANT: tenantId, env, programYearFirstYear: 2026,
    async runCommand(command, args) {
      if (command === "ffmpeg") { writeFileSync(args.at(-1), "fixture audio bytes"); return; }
      if (command === "ffprobe") return "60\n";
      const script = basename(args[0]);
      if (script === "transcribe-long-session.mjs") {
        events.push("transcribe");
        const turns = writeTranscriptGeneration(dir, tenantId, sessionId, raw);
        const report = clampAndValidateTurns(turns, 60).report;
        const proof = buildTranscriptQaGeneration({ turnsBytes: readFileSync(join(dir, "turns.json")), durationSec: 60,
          spans: [{ id: "fixture-attempt", accepted: true, offsetSeconds: 0, report }], merged: report });
        writeFileSync(join(dir, "transcript-qa.json"), mode === "initial-fail" ? "{}" : JSON.stringify(proof));
        return;
      }
      if (script === "validate-session.mjs") {
        const final = events.includes("validate-initial");
        events.push(final ? "validate-final" : "validate-initial");
        assert.equal(existsSync(join(dir, "session_page.json")), final, "initial validation precedes derivation");
        if (final) {
          assert.throws(() => loadWebinarSession(dir, sessionId), /source snapshot is stale/);
          if (mode === "stale") return; // A success exit alone must not authorize stale bytes.
          if (mode === "fail") writeFileSync(join(dir, "transcript-qa.json"), "{}");
        }
        const result = await validateSession({ root, sessionId, durationSec: 60, env, findTimeGaps: () => [] });
        reports.push(result.report);
        if (!result.passed) throw new Error(`fixture validation refused: ${result.report.error}`);
        return;
      }
      if (script === "seed-toc.mjs") {
        events.push("seed");
        assert.equal(reports.length, 2);
        assert.equal(loadWebinarSession(dir, sessionId).rawTurns.length, 3);
        assert.equal(assertDerivedArtifactsCurrent(dir).documents.turns.length, 3);
        return;
      }
      assert.fail(`unexpected command: ${command} ${args.join(" ")}`);
    },
    buildIndexer: () => async (tenant, id) => {
      assert.equal(tenant, tenantId); assert.equal(id, sessionId);
      events.push("index"); return { chunks: { written: 3 } };
    },
  };
  // The duration probe is synchronous, just like execFileSync in production.
  const run = deps.runCommand;
  deps.runCommand = (command, args, options) => command === "ffprobe" ? "60\n" : run(command, args, options);
  const gdrive = { downloadDriveFile: async (_id, path) => { mkdirSync(join(root, "recordings", "October"), { recursive: true }); writeFileSync(path, "fixture video bytes"); } };
  return { dir, events, reports, invoke: () => ingestOneDriveFile(gdrive, () => assert.fail("no live Drive command"),
    { id: "fixture-file", name: "15th Oct: Fixture", createdTime: "2026-10-15T10:00:00.000Z" }, "October", deps) };
}

test("watcher validates finalized source before seed and real consumer accepts it", async t => {
  const f = watcherFixture(t);
  assert.equal(await f.invoke(), "2026-10-15-fixture");
  assert.deepEqual(f.events, ["transcribe", "validate-initial", "validate-final", "seed", "index"]);
  const sourceBytes = readFileSync(join(f.dir, "source.json"));
  const source = JSON.parse(sourceBytes);
  assert.equal(source.title, "Fixture");
  assert.equal(source.audioPath, "raw/TOC/TOC-Materials/Audio/15th Oct- Fixture.m4a");
  assert.notEqual(f.reports[0].sourceSha256, f.reports[1].sourceSha256);
  assert.equal(f.reports[1].sourceSha256, watcherSha(sourceBytes));
});

test("watcher stale final validation prevents seed and index", async t => {
  const f = watcherFixture(t, "stale");
  await assert.rejects(f.invoke(), /source snapshot is stale/);
  assert.deepEqual(f.events, ["transcribe", "validate-initial", "validate-final"]);
  assert.equal(existsSync(join(f.dir, "derivation-provenance.json")), true);
  assert.equal(JSON.parse(readFileSync(join(f.dir, "derivation-provenance.json"))).status, "stale");
});

test("watcher final validation failure prevents seed and index", async t => {
  const f = watcherFixture(t, "fail");
  await assert.rejects(f.invoke(), /fixture validation refused/);
  assert.deepEqual(f.events, ["transcribe", "validate-initial", "validate-final"]);
  assert.equal(JSON.parse(readFileSync(join(f.dir, "validation.json"))).status, "failed");
});

test("watcher initial validation failure stops before skeleton, derivation, seed and index", async t => {
  const f = watcherFixture(t, "initial-fail");
  await assert.rejects(f.invoke(), /fixture validation refused/);
  assert.deepEqual(f.events, ["transcribe", "validate-initial"]);
  for (const name of ["session.json", "session_page.json", "claims.json"]) assert.equal(existsSync(join(f.dir, name)), false, name);
  assert.equal(JSON.parse(readFileSync(join(f.dir, "validation.json"))).status, "failed");
});

const LONG = 40 * 60;
test("chooseIngestTranscriber: QA flag on routes a short recording through the QA-capable long driver", () => {
  for (const durationSeconds of [1, 60, 186, LONG, LONG + 1]) {
    assert.equal(chooseIngestTranscriber({ env: { LKB_TRANSCRIPT_QA: "1" }, durationSeconds, longThresholdSeconds: LONG, plan: null }), "transcribe-long-session.mjs");
  }
});
test("chooseIngestTranscriber: QA on with unknown/invalid duration refuses before any provider call", () => {
  for (const durationSeconds of [null, undefined, NaN, 0, -5, Infinity]) {
    assert.throws(() => chooseIngestTranscriber({ env: { LKB_TRANSCRIPT_QA: "1" }, durationSeconds, longThresholdSeconds: LONG, plan: null }), /duration is unknown/);
  }
});
test("chooseIngestTranscriber: flag off or not exactly '1' keeps the previous rule, including null duration", () => {
  for (const env of [{}, undefined, { LKB_TRANSCRIPT_QA: "0" }, { LKB_TRANSCRIPT_QA: "true" }, { LKB_TRANSCRIPT_QA: "" }]) {
    assert.equal(chooseIngestTranscriber({ env, durationSeconds: 60, longThresholdSeconds: LONG, plan: null }), "transcribe-toc-session.mjs");
    assert.equal(chooseIngestTranscriber({ env, durationSeconds: null, longThresholdSeconds: LONG, plan: null }), "transcribe-toc-session.mjs");
    assert.equal(chooseIngestTranscriber({ env, durationSeconds: LONG + 1, longThresholdSeconds: LONG, plan: null }), "transcribe-long-session.mjs");
    assert.equal(chooseIngestTranscriber({ env, durationSeconds: 60, longThresholdSeconds: LONG, plan: { kind: "single" } }), "transcribe-long-session.mjs");
  }
});
