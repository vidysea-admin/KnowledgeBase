/**
 * packages/ai/src/stt/transcript-qa-report.test.ts -- T-044 QA report. Temp-dir fixtures only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, linkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep, relative } from "node:path";
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

// ---- ISS-T044W-001: the output must be refused when it IS the input by identity, not only by spelling ----
const runner = () => join(process.cwd(), "..", "..", "scripts", "qa", "transcript-qa-report.ts");
const runCli = (...a: string[]) => spawnSync(process.execPath, ["--import", "tsx", runner(), ...a], { encoding: "utf8", timeout: 60000 });
const EXACT = JSON.stringify([t(0, 10), t(10, 20)]);

test("ISS-T044W-001 recorded reproduction verbatim: --out <S>/./alias.json --overwrite is refused, exit 2, input unchanged", () => {
  const dir = tmp();
  try {
    const alias = join(dir, "alias.json");
    writeFileSync(alias, EXACT);
    const before = readFileSync(alias);
    const r = runCli(alias, "20", "--out", `${dir}${sep}.${sep}alias.json`, "--overwrite");
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /over the input/);
    assert.ok(before.equals(readFileSync(alias)), "input byte-identical");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T044W-001 alias variants through the library: all refused before any write, input byte-identical", (tc) => {
  const dir = tmp();
  try {
    const name = "longaliasname.json";
    const input = join(dir, name);
    writeFileSync(input, EXACT);
    const before = readFileSync(input);
    const variants: Array<[string, string | null]> = [
      ["dot segment", `${dir}${sep}.${sep}${name}`],
      ["dotdot segment", join(dir, "sub", "..", name)],
      ["upper case", join(dir, name.toUpperCase())],
      ["forward slashes", input.split("\\").join("/")],
      ["trailing dot", input + "."],
      ["trailing space", input + " "],
      ["relative", relative(process.cwd(), input)],
    ];
    // 8.3 short name (needs short-name generation enabled on the volume)
    let short: string | null = null;
    if (process.platform === "win32") {
      const s = spawnSync("cmd", ["/c", `for %I in ("${input}") do @echo %~sI`], { encoding: "utf8" }).stdout.trim();
      if (s && s.includes("~")) short = s;
    }
    variants.push(["8.3 short name", short]);
    // hard link
    const hard = join(dir, "hard.json");
    try { linkSync(input, hard); variants.push(["hard link", hard]); } catch { variants.push(["hard link", null]); }
    // symlink (may need privilege)
    const sym = join(dir, "sym.json");
    try { symlinkSync(input, sym, "file"); variants.push(["symlink", sym]); } catch { variants.push(["symlink", null]); }
    // junction to the directory, then the same name through it
    const real = join(dir, "real"); const junc = join(dir, "junc");
    try { mkdirSync(real); writeFileSync(join(real, name), EXACT); symlinkSync(real, junc, "junction"); } catch { /* skip below */ }
    const viaJunction = existsSync(junc) ? join(junc, name) : null;

    for (const [label, out] of variants) {
      if (out === null) { tc.diagnostic(`SKIPPED ${label}: not creatable here`); continue; }
      assert.throws(() => writeTranscriptQaReport({ inputPath: input, durationSec: 20, outPath: out, overwrite: true }), /over the input/, label);
      assert.ok(before.equals(readFileSync(input)), `${label}: input unchanged`);
    }
    if (viaJunction) {
      const jb = readFileSync(join(real, name));
      assert.throws(() => writeTranscriptQaReport({ inputPath: join(real, name), durationSec: 20, outPath: viaJunction, overwrite: true }), /over the input/, "junction");
      assert.ok(jb.equals(readFileSync(join(real, name))));
    } else tc.diagnostic("SKIPPED junction: not creatable here");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T044W-001: output that is a directory is refused; unrelated existing file needs --overwrite and is then replaced", () => {
  const dir = tmp();
  try {
    const input = join(dir, "turns.json");
    writeFileSync(input, EXACT);
    const before = readFileSync(input);
    const d = join(dir, "outdir"); mkdirSync(d);
    assert.throws(() => writeTranscriptQaReport({ inputPath: input, durationSec: 20, outPath: d, overwrite: true }), /directory/);
    const other = join(dir, "other.json");
    writeFileSync(other, "OLD");
    assert.throws(() => writeTranscriptQaReport({ inputPath: input, durationSec: 20, outPath: other }), /not overwriting/);
    assert.equal(readFileSync(other, "utf8"), "OLD");
    writeTranscriptQaReport({ inputPath: input, durationSec: 20, outPath: other, overwrite: true });
    assert.equal(JSON.parse(readFileSync(other, "utf8")).verdict, "PASS");
    assert.ok(before.equals(readFileSync(input)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T044W-001: legitimate runs still work (distinct --out, --overwrite of an old report, same-file different dir)", () => {
  const dir = tmp();
  try {
    const input = join(dir, "turns.json");
    writeFileSync(input, EXACT);
    const out = join(dir, "custom-report.json");
    assert.equal(runCli(input, "20", "--out", out).status, 0);
    assert.equal(runCli(input, "20", "--out", out).status, 2, "existing without --overwrite");
    assert.equal(runCli(input, "20", "--out", out, "--overwrite").status, 0);
    mkdirSync(join(dir, "b")); writeFileSync(join(dir, "b", "turns.json"), "x");
    assert.equal(writeTranscriptQaReport({ inputPath: input, durationSec: 20, outPath: join(dir, "b", "turns.json"), overwrite: true }).report.verdict, "PASS");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
