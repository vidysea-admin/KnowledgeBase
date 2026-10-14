import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSession } from "./validate-session.mjs";
import { writeTranscriptGeneration } from "../../lib/transcript-provenance.mjs";
import { loadWebinarSession } from "../session-rows.mjs";

const SID = "fixture-webinar-p2", TENANT = "tenant-a", DURATION = 900;
const NOW = () => new Date("2026-10-14T07:00:00.000Z");
const FAILED = { stage: "transcript", status: "failed", durationSec: DURATION, error: "Error: Command failed: transcribe-long-session.mjs" };
const raw = (n, step = 12) => Array.from({ length: n }, (_, i) => ({ speakerRef: "spk:0", tStart: i * step, tEnd: i * step + step - 1, text: `turn ${i} about visas` }));

/** A session dir the way the pipeline leaves it after a FAILED first transcription. */
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "revalidate-"));
  const dir = join(root, "data", "toc-migrated", SID);
  mkdirSync(dir, { recursive: true });
  const put = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
  put("source.json", { _id: `${SID}-src`, tenantId: TENANT, title: "Webinar p2", createdAt: "2026-10-13T15:27:53Z", captureMode: "silent", audioLevel: { silent: false } });
  put("validation.json", FAILED);
  const transcribe = (turns) => writeTranscriptGeneration(dir, TENANT, SID, turns); // what transcribe-long-session.mjs does
  const validate = (opts = {}) => validateSession({ root, sessionId: SID, durationSec: DURATION, now: NOW, env: {}, ...opts });
  const gate = () => loadWebinarSession(dir, SID); // session-rows.mjs:45, the line sync-session.mjs hits first
  return Promise.resolve(run({ root, dir, put, transcribe, validate, gate })).finally(() => rmSync(root, { recursive: true, force: true }));
}
const qaReport = (over = {}) => ({ spans: [], merged: { durationSec: DURATION, durationValid: true, inputCount: 73, outputCount: 73, clampedCount: 0, clampedIndices: [], dropped: [],
  totalTurnSec: 800, overshootSec: 0, maxInputEndSec: 899, nonMonotonicIndices: [], hallucination: { pastEndIndices: [], repeatThreshold: 3, repeatedRuns: [] }, ...over } });

test("failed -> re-transcribed -> validate -> passed -> sync gate accepts (and the pipeline's failed file is kept as history)", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  assert.throws(() => gate(), /validation has not passed/); // the live defect: failed file + good transcript
  transcribe(raw(73));
  put("transcript-qa.json", qaReport());
  assert.throws(() => gate(), /validation has not passed/); // a transcript alone changes nothing
  const r = await validate({ env: { LKB_TRANSCRIPT_QA: "1" } });
  assert.equal(r.passed, true, JSON.stringify(r.report));
  const written = JSON.parse(readFileSync(join(dir, "validation.json"), "utf8"));
  assert.equal(written.status, "passed");
  assert.equal(written.transcriptValidated, true);
  assert.equal(written.turnCount, 73);
  assert.equal(written.durationSec, DURATION);
  assert.equal(written.partial, false);
  assert.ok(written.coverage > 0.97, `coverage ${written.coverage}`);
  assert.equal(written.qa.outputCount, 73);
  assert.equal(written.validatedAt, "2026-10-14T07:00:00.000Z");
  assert.match(written.turnsSha256, /^[0-9a-f]{64}$/);
  assert.equal(gate().rawTurns.length, 73); // sync-session's loader now accepts
  assert.equal(r.gate, "accepts");
  const history = readdirSync(join(dir, ".validation-history"));
  assert.equal(history.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".validation-history", history[0]), "utf8")), FAILED);
}));

test("bad transcript -> validate fails with reasons -> sync gate still refuses", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  const turns = raw(73); turns[72] = { ...turns[72], tEnd: DURATION + 60 }; // ends past the audio
  transcribe(turns);
  const r = await validate();
  assert.equal(r.passed, false);
  const written = JSON.parse(readFileSync(join(dir, "validation.json"), "utf8"));
  assert.equal(written.status, "failed");
  assert.equal(written.transcriptValidated, false);
  assert.equal(written.stage, "transcript");
  assert.match(written.error, /outside recording/);
  assert.ok(written.reasons.length >= 1);
  assert.throws(() => gate(), /validation has not passed/);
  assert.match(r.gate, /^refuses/);
}));

test("a hand-edited turns.json (non-canonical identity) fails; no turns fails", () => fixture(async ({ dir, put, validate, gate }) => {
  put("turns.json", raw(10).map((t, i) => ({ _id: `x${i}`, tenantId: TENANT, sessionId: SID, ...t })));
  const edited = await validate();
  assert.equal(edited.passed, false);
  assert.match(edited.report.error, /canonical transcript identity/);
  put("turns.json", []);
  assert.match((await validate()).report.error, /no turns/);
  assert.throws(() => gate(), /validation has not passed/);
}));

test("partial coverage (e.g. --range 0:360) is recorded explicitly; failed unless --accept-partial", () => fixture(async ({ dir, transcribe, validate, gate }) => {
  transcribe(raw(30)); // last tEnd = 359 of 900 -> 0.399
  const strict = await validate();
  assert.equal(strict.passed, false);
  assert.equal(strict.report.partial, true);
  assert.equal(strict.report.coverage, 0.3989);
  assert.match(strict.report.error, /partial coverage 39\.9%/);
  assert.throws(() => gate(), /validation has not passed/);
  const accepted = await validate({ acceptPartial: true });
  assert.equal(accepted.passed, true);
  const written = JSON.parse(readFileSync(join(dir, "validation.json"), "utf8"));
  assert.equal(written.partial, true);
  assert.equal(written.partialAccepted, true);
  assert.equal(written.coverage, 0.3989);
  assert.equal(written.lastTEnd, 359);
  assert.equal(written.status, "passed");
  // POLICY QUESTION surfaced by this test: session-rows.mjs reads only status/transcriptValidated, so an accepted partial syncs.
  assert.doesNotThrow(() => gate());
}));

test("an internal gap > 30s is partial even when the tail reaches the end", () => fixture(async ({ transcribe, validate }) => {
  const turns = [...raw(10), ...raw(10).map((t) => ({ ...t, tStart: t.tStart + 600, tEnd: t.tEnd + 600 }))]; // gap 119..600, tail ends 719 -> also short; add tail
  turns.push({ speakerRef: "spk:0", tStart: 720, tEnd: 899, text: "closing remarks" });
  transcribe(turns);
  const r = await validate();
  assert.equal(r.report.partial, true);
  assert.equal(r.report.gaps.length, 1);
  assert.equal(r.passed, false);
}));

test("QA: flag on but report missing, stale report, hallucination signals all fail; clean report passes", () => fixture(async ({ put, transcribe, validate }) => {
  transcribe(raw(73));
  assert.match((await validate({ env: { LKB_TRANSCRIPT_QA: "1" } })).report.error, /transcript-qa\.json is missing/);
  assert.equal((await validate({ env: {} })).passed, true); // flag off, no report: nothing to check
  put("transcript-qa.json", qaReport({ outputCount: 70 }));
  assert.match((await validate()).report.error, /stale: it covers 70 turns/);
  put("transcript-qa.json", qaReport({ hallucination: { pastEndIndices: [72], repeatThreshold: 3, repeatedRuns: [{ start: 1, count: 4 }] } }));
  const bad = await validate();
  assert.match(bad.report.error, /past the audio end/);
  assert.match(bad.report.error, /repeated-turn run/);
  put("transcript-qa.json", qaReport({ clampedCount: 2 })); // clamped turns were already corrected: evidence only
  const clean = await validate();
  assert.equal(clean.passed, true);
  assert.equal(clean.report.qa.clampedCount, 2);
}));

test("--dry-run reports but writes nothing", () => fixture(async ({ dir, transcribe, validate }) => {
  transcribe(raw(73));
  const before = readFileSync(join(dir, "validation.json"), "utf8");
  const r = await validate({ dryRun: true });
  assert.equal(r.passed, true);
  assert.equal(r.written, false);
  assert.equal(readFileSync(join(dir, "validation.json"), "utf8"), before);
  assert.equal(existsSync(join(dir, ".validation-history")), false);
}));

test("unsafe sessionId is refused", async () => {
  await assert.rejects(validateSession({ root: tmpdir(), sessionId: "../x", durationSec: 1 }), /invalid sessionId/);
});
