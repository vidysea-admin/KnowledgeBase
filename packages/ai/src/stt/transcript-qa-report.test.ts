/**
 * packages/ai/src/stt/transcript-qa-report.test.ts -- T-044 QA report. Temp-dir fixtures only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildTranscriptQaReport, writeTranscriptQaReport } from "./transcript-qa-report.js";

const t = (tStart: number, tEnd: number, text = `t${tStart}`) => ({ speakerRef: "spk:0", tStart, tEnd, text });
function tmp(): string { return mkdtempSync(join(tmpdir(), "tqa-")); }

test("ends past the duration are clamped, reported with before/after, verdict PASS", () => {
  const r = buildTranscriptQaReport([t(0, 50), t(50, 120), t(120, 190)], 186);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.turnsIn, 3);
  assert.equal(r.turnsOut, 3);
  assert.deepEqual(r.turnsClamped.map((c) => [c.index, c.tEndBefore, c.tEndAfter]), [[2, 190, 186]]);
  assert.deepEqual(r.remainingViolations, []);
  assert.ok(r.hallucination);
});

test("turn exactly at the duration is untouched; start past duration is dropped as hallucination", () => {
  const r = buildTranscriptQaReport([t(0, 100), t(100, 186), t(186, 190), t(200, 210)], 186);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.turnsClamped.length, 0);
  assert.equal(r.turnsOut, 2);
  assert.deepEqual(r.turnsDropped.map((d) => [d.index, d.reason, d.suspectedHallucination]),
    [[2, "start-at-or-beyond-duration", true], [3, "start-at-or-beyond-duration", true]]);
});

test("negative and zero-length turns: zero-length kept, reversed turn clamped, no violations", () => {
  const r = buildTranscriptQaReport([t(5, 5), t(10, 4), t(-3, 8)], 100);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.turnsOut, 3);
  assert.deepEqual(r.turnsClamped.map((c) => c.index), [1, 2]);
  assert.equal(r.turnsClamped[1]!.tStartAfter, 0);
});

test("clamped index maps correctly when earlier turns were dropped", () => {
  const r = buildTranscriptQaReport([t(0, 10), t(500, 510), t(20, 400)], 100);
  assert.deepEqual(r.turnsClamped.map((c) => [c.index, c.tEndBefore, c.tEndAfter]), [[2, 400, 100]]);
});

test("overlapping turns are accepted without failure", () => {
  const r = buildTranscriptQaReport([t(0, 60), t(30, 90)], 100);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.turnsOut, 2);
});

test("fail closed: missing, zero, negative, NaN duration", () => {
  for (const d of [undefined, 0, -5, NaN, Infinity, "186"]) {
    const r = buildTranscriptQaReport([t(0, 10)], d);
    assert.equal(r.verdict, "FAIL", String(d));
    assert.equal(r.turnsOut, 0);
  }
});

test("fail closed: malformed turns (non-object, bad timing, wrong top-level shape)", () => {
  assert.equal(buildTranscriptQaReport([t(0, 1), "x"], 10).verdict, "FAIL");
  assert.equal(buildTranscriptQaReport([t(0, 1), { text: "no timing" }], 10).verdict, "FAIL");
  assert.equal(buildTranscriptQaReport({ nope: 1 }, 10).verdict, "FAIL");
  assert.equal(buildTranscriptQaReport(null, 10).verdict, "FAIL");
});

test("{ turns: [...] } wrapper accepted; empty list passes with zero counts", () => {
  assert.equal(buildTranscriptQaReport({ turns: [t(0, 5)] }, 10).turnsOut, 1);
  const r = buildTranscriptQaReport([], 10);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.turnsIn, 0);
});

test("writer: input byte-identical, report written, second run refuses without overwrite, flag allows it", () => {
  const dir = tmp();
  try {
    const input = join(dir, "turns.json");
    writeFileSync(input, JSON.stringify([t(0, 50), t(50, 200)]));
    const before = readFileSync(input);
    const { outPath, report } = writeTranscriptQaReport({ inputPath: input, durationSec: 186 });
    assert.equal(outPath, join(dir, "turns.qa-report.json"));
    assert.equal(report.verdict, "PASS");
    assert.equal(JSON.parse(readFileSync(outPath, "utf8")).verdict, "PASS");
    assert.ok(before.equals(readFileSync(input)), "input unchanged");

    writeFileSync(outPath, "SENTINEL");
    assert.throws(() => writeTranscriptQaReport({ inputPath: input, durationSec: 186 }), /not overwriting/);
    assert.equal(readFileSync(outPath, "utf8"), "SENTINEL");
    writeTranscriptQaReport({ inputPath: input, durationSec: 186, overwrite: true });
    assert.equal(JSON.parse(readFileSync(outPath, "utf8")).verdict, "PASS");
    assert.ok(before.equals(readFileSync(input)), "input unchanged after overwrite run");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("writer: empty file, malformed JSON, missing file, missing duration => FAIL report; input untouched", () => {
  const dir = tmp();
  try {
    const empty = join(dir, "empty.json");
    const bad = join(dir, "bad.json");
    const good = join(dir, "good.json");
    writeFileSync(empty, "");
    writeFileSync(bad, "{ not json");
    writeFileSync(good, JSON.stringify([t(0, 1)]));
    for (const p of [empty, bad]) {
      const b = readFileSync(p);
      assert.equal(writeTranscriptQaReport({ inputPath: p, durationSec: 10 }).report.verdict, "FAIL");
      assert.ok(b.equals(readFileSync(p)));
    }
    assert.equal(writeTranscriptQaReport({ inputPath: join(dir, "missing.json"), durationSec: 10 }).report.verdict, "FAIL");
    assert.equal(writeTranscriptQaReport({ inputPath: good, durationSec: undefined }).report.verdict, "FAIL");
    assert.throws(() => writeTranscriptQaReport({ inputPath: good, durationSec: 5, outPath: good, overwrite: true }), /over the input/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runner CLI: exit codes 0 / 1 / 2 and no overwrite without --overwrite", () => {
  const dir = tmp();
  try {
    const input = join(dir, "turns.json");
    writeFileSync(input, JSON.stringify([t(0, 50)]));
    const run = (...a: string[]) => spawnSync(process.execPath, ["--import", "tsx", join(process.cwd(), "..", "..", "scripts", "qa", "transcript-qa-report.ts"), ...a], { encoding: "utf8", timeout: 60000 });
    assert.equal(run(input, "100").status, 0);
    assert.equal(run(input, "100").status, 2, "second run refuses");
    assert.equal(run(input, "100", "--overwrite").status, 0);
    assert.equal(run(input, "abc", "--overwrite").status, 1, "NaN duration => FAIL verdict");
    assert.equal(run(input).status, 2, "usage");
    assert.ok(existsSync(join(dir, "turns.qa-report.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
