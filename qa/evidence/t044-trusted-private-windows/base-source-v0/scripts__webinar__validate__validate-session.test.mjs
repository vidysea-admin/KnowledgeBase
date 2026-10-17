import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSession, parseCliArgs } from "./validate-session.mjs";
import { writeTranscriptGeneration } from "../../lib/transcript-provenance.mjs";
import { loadWebinarSession } from "../session-rows.mjs";
import { buildTranscriptQaGeneration } from "../../lib/transcription/transcript-qa-generation.mjs";
import { clampAndValidateTurns } from "../../../packages/ai/src/stt/transcript-qa.ts";

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
const qaReport = (dir, over = {}) => {
  const turnsBytes = readFileSync(join(dir, "turns.json")), turns = JSON.parse(turnsBytes.toString("utf8"));
  const clean = clampAndValidateTurns(turns, DURATION).report;
  return buildTranscriptQaGeneration({ turnsBytes, durationSec: DURATION, merged: { ...clean, ...over },
    spans: [{ id: "retained-c0-a1", accepted: true, offsetSeconds: 0, report: clean }] });
};

test("failed -> re-transcribed -> validate -> passed -> sync gate accepts (and the pipeline's failed file is kept as history)", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  assert.throws(() => gate(), /validation has not passed/); // the live defect: failed file + good transcript
  transcribe(raw(73));
  put("transcript-qa.json", qaReport(dir));
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
  assert.match(written.qaSha256, /^[0-9a-f]{64}$/);
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

test("QA: flag on but report missing, stale report, hallucination signals all fail; clean report passes", () => fixture(async ({ dir, put, transcribe, validate }) => {
  transcribe(raw(73));
  assert.match((await validate({ env: { LKB_TRANSCRIPT_QA: "1" } })).report.error, /transcript-qa\.json is missing/);
  assert.equal((await validate({ env: {} })).passed, true); // flag off, no report: nothing to check
  const staleCount = qaReport(dir); staleCount.merged.inputCount = 70; staleCount.merged.outputCount = 70;
  put("transcript-qa.json", staleCount);
  assert.match((await validate()).report.error, /accepted span count does not reconcile/);
  const suspicious = qaReport(dir);
  suspicious.spans[0].report = { ...suspicious.spans[0].report, inputCount: 74,
    dropped: [{ index: 73, reason: "start-at-or-beyond-duration", suspectedHallucination: true }],
    hallucination: { pastEndIndices: [73], repeatThreshold: 3, repeatedRuns: [{ text: "repeated phrase", startIndex: 1, length: 4 }] } };
  put("transcript-qa.json", suspicious);
  const bad = await validate();
  assert.match(bad.report.error, /past the audio end/);
  assert.match(bad.report.error, /repeated-turn run/);
  put("transcript-qa.json", qaReport(dir, { clampedCount: 2, clampedIndices: [0, 1] })); // clamped turns were already corrected: evidence only
  const clean = await validate();
  assert.equal(clean.passed, true);
  assert.equal(clean.report.qa.clampedCount, 2);
}));

test("ISS-REVALIDATE-001: stale same-count and contradictory audit metadata refuse downstream admission", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  transcribe(raw(73));
  const proof = qaReport(dir);
  put("transcript-qa.json", proof);
  const replacement = raw(73); replacement[0].text = "replacement generation with the same turn count";
  transcribe(replacement);
  assert.match((await validate()).report.error, /generation hash mismatch/);
  assert.throws(() => gate(), /validation has not passed/);
  const current = qaReport(dir);
  current.merged.clampedCount = 20;
  current.merged.dropped = Array.from({ length: 5 }, (_, index) => ({ index, reason: "invalid-timing", suspectedHallucination: false }));
  current.merged.overshootSec = 400;
  put("transcript-qa.json", current);
  assert.equal((await validate()).passed, false);
  assert.throws(() => gate(), /validation has not passed/);
}));

test("retained span hallucination refuses; rejected retry metadata permits a clean bound generation", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  transcribe(raw(73));
  const proof = qaReport(dir);
  const original = [...raw(73), { speakerRef: "spk:0", tStart: DURATION, tEnd: DURATION + 10, text: "hallucinated tail" }];
  proof.spans[0].report = clampAndValidateTurns(original, DURATION).report;
  put("transcript-qa.json", proof);
  assert.match((await validate()).report.error, /accepted span.*past the audio end/);
  assert.throws(() => gate(), /validation has not passed/);
  proof.spans[0].accepted = false;
  proof.spans.push(qaReport(dir).spans[0]); proof.spans[1].id = "clean-chunked-fallback";
  put("transcript-qa.json", proof);
  assert.equal((await validate()).passed, true);
  assert.doesNotThrow(() => gate());
}));

test("same output with a newly suspicious accepted QA artifact invalidates previous downstream acceptance", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  transcribe(raw(73));
  const proof = qaReport(dir);
  put("transcript-qa.json", proof);
  assert.equal((await validate()).passed, true);
  assert.doesNotThrow(() => gate());
  const unchangedTurns = readFileSync(join(dir, "turns.json"));
  proof.spans[0].report = clampAndValidateTurns([...raw(73), { speakerRef: "spk:0", tStart: DURATION, tEnd: DURATION + 10, text: "new hallucinated tail" }], DURATION).report;
  put("transcript-qa.json", proof);
  assert.ok(readFileSync(join(dir, "turns.json")).equals(unchangedTurns));
  assert.throws(() => gate(), /QA|validation/i);
  assert.equal((await validate()).passed, false);
  assert.throws(() => gate(), /validation has not passed/);
}));

test("canonical bound turns with an uncounted sub-microsecond overshoot cannot pass the real gate", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  const turns = raw(75); turns[74].tEnd = DURATION + 1e-7;
  transcribe(turns);
  const proof = qaReport(dir);
  assert.equal(proof.merged.clampedCount, 0);
  put("transcript-qa.json", proof);
  const result = await validate();
  assert.equal(result.passed, false);
  assert.match(result.report.error, /committed timing outside exact audio bounds/);
  assert.throws(() => gate(), /validation has not passed/);
}));

test("validation binds QA presence; removed, truncated or newly created reports cannot reuse a verdict", () => fixture(async ({ dir, put, transcribe, validate, gate }) => {
  transcribe(raw(73));
  const baseline = await validate();
  assert.equal(baseline.report.qaSha256, null);
  assert.doesNotThrow(() => gate());
  put("transcript-qa.json", qaReport(dir));
  assert.throws(() => gate(), /QA|validation/i);
  assert.equal((await validate()).passed, true);
  writeFileSync(join(dir, "transcript-qa.json"), "{");
  assert.throws(() => gate(), /QA|validation|JSON/i);
  put("transcript-qa.json", qaReport(dir));
  assert.equal((await validate()).passed, true);
  rmSync(join(dir, "transcript-qa.json"));
  assert.throws(() => gate(), /QA|validation|ENOENT/i);
}));

test("bound QA recomputes current repeated and swapped turns rather than trusting clean claims", () => fixture(async ({ dir, put, transcribe, validate }) => {
  for (const input of [raw(73).map(t => ({ ...t, text: "identical repeated text" })), [...raw(73).slice(1), raw(73)[0]]]) {
    transcribe(input);
    const proof = qaReport(dir);
    for (const report of [proof.merged, proof.spans[0].report]) {
      report.nonMonotonicIndices = [];
      report.hallucination.repeatedRuns = [];
    }
    put("transcript-qa.json", proof);
    assert.match((await validate()).report.error, /QA current transcript: (non-monotonic|repeated-turn)/);
  }
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

// CLI argument parsing (webinarfix): a bare session id used to be dropped when --root was absent, so the tool always printed usage.
const DEF = resolve("default-root");
test("parseCliArgs: bare id, id with --root (either order), --dry-run, --accept-partial", () => {
  assert.deepEqual(parseCliArgs(["s1"], DEF), { sessionId: "s1", root: DEF, rootMissing: false, error: undefined, acceptPartial: false, dryRun: false });
  const after = parseCliArgs(["s1", "--root", "R"], DEF);
  assert.equal(after.sessionId, "s1"); assert.equal(after.root, resolve("R"));
  const before = parseCliArgs(["--root", "R", "s1"], DEF);
  assert.equal(before.sessionId, "s1"); assert.equal(before.root, resolve("R"));
  assert.equal(parseCliArgs(["--dry-run", "s1"], DEF).dryRun, true);
  assert.equal(parseCliArgs(["s1", "--dry-run"], DEF).sessionId, "s1");
  const ap = parseCliArgs(["--accept-partial", "s1", "--dry-run"], DEF);
  assert.equal(ap.acceptPartial, true); assert.equal(ap.dryRun, true); assert.equal(ap.sessionId, "s1");
});
test("parseCliArgs: no id or a dangling --root is a usage error", () => {
  assert.equal(parseCliArgs([], DEF).sessionId, undefined);
  assert.equal(parseCliArgs(["--dry-run"], DEF).sessionId, undefined);
  assert.equal(parseCliArgs(["--root", "R"], DEF).sessionId, undefined);
  assert.equal(parseCliArgs(["s1", "--root"], DEF).rootMissing, true);
  assert.equal(parseCliArgs(["s1", "--root", "--dry-run"], DEF).rootMissing, true);
});
test("parseCliArgs: a second positional id or a repeated --root is an error, not silently ignored", () => {
  assert.match(parseCliArgs(["s1", "s2"], DEF).error, /more than one session id.*s1, s2/);
  assert.match(parseCliArgs(["s1", "--root", "A", "s2"], DEF).error, /more than one session id/);
  assert.match(parseCliArgs(["s1", "--root", "A", "--root", "B"], DEF).error, /--root given more than once/);
  assert.equal(parseCliArgs(["s1", "--root", "A"], DEF).error, undefined);
});
test("CLI: a bare session id reaches validation instead of printing usage (end to end)", () => {
  const script = fileURLToPath(new URL("./validate-session.mjs", import.meta.url));
  const empty = mkdtempSync(join(tmpdir(), "vs-cli-"));
  try {
    for (const argv of [["no-such-session"], ["no-such-session", "--root", empty], ["--root", empty, "no-such-session", "--dry-run", "--accept-partial"]]) {
      const r = spawnSync(process.execPath, ["--import", "tsx", script, ...argv], { encoding: "utf8", timeout: 60000 });
      assert.doesNotMatch(r.stderr, /usage:/, argv.join(" "));
      assert.match(r.stderr, /validation could not run/, argv.join(" "));
    }
    assert.match(spawnSync(process.execPath, ["--import", "tsx", script], { encoding: "utf8", timeout: 60000 }).stderr, /usage:/);
    for (const [argv, msg] of [[["a", "b"], /more than one session id/], [["a", "--root", empty, "--root", empty], /--root given more than once/]]) {
      const r = spawnSync(process.execPath, ["--import", "tsx", script, ...argv], { encoding: "utf8", timeout: 60000 });
      assert.notEqual(r.status, 0); assert.match(r.stderr, msg); assert.doesNotMatch(r.stderr, /validation could not run/);
    }
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
