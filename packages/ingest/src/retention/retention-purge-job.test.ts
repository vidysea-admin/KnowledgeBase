/**
 * T-046 / D-145: the schedulable purge job wrapper. Temp dirs, injected unlink and report writer, no network.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DAY, NOW, iso, tempRoot, writeSession, purgeBaseArgs as baseArgs } from "./retention-report.fixtures.js";
import { REAL_JOB_IO, MAX_REPORT_LINES, parseSummary, runPurgeJob, splitJobArgs, type JobReport } from "./retention-purge-job.js";
import { tenantRetentionSummaryPath } from "./production/private-summary.js";
import { runRetentionPurgeJobCli } from "./retention-purge-job-cli.js";

const ASOF = ["--as-of", new Date(NOW).toISOString()];
function fixture() {
  const root = tempRoot();
  const media = mkdtempSync(join(tmpdir(), "w046-media-"));
  const out = mkdtempSync(join(tmpdir(), "w046-out-"));
  const dir = writeSession(root, media, {
    tenant: "toc", name: "old", title: "SECRET TITLE", processedAt: iso(100 * DAY - 3_600_000), mediaMtimeMs: NOW - 100 * DAY, mediaBytes: 10,
    turns: [{ _id: "old-t1", tenantId: "toc", sessionId: "old", speakerRef: "a", tStart: 1, tEnd: 2, text: "SECRET TRANSCRIPT TEXT" }],
  });
  const srcFile = join(dir, "source.json");
  const src = JSON.parse(readFileSync(srcFile, "utf8")) as Record<string, unknown>;
  src.createdAt = new Date(NOW - 100 * DAY).toISOString();
  writeFileSync(srcFile, JSON.stringify(src));
  return { root, media, out, report: join(out, "sub", "last-run.json"), srcFile, done: () => { for (const d of [root, media, out]) rmSync(d, { recursive: true, force: true }); } };
}

/** Test helper: pair --execute with --confirm-deletion unless the test passes --no-auto-confirm (to prove the refusal). */
const withConfirm = (flags: string[]): string[] => flags.includes("--no-auto-confirm") ? flags.filter((f) => f !== "--no-auto-confirm")
  : flags.includes("--execute") && !flags.includes("--confirm-deletion") ? [...flags, "--confirm-deletion"] : flags;
function job(f: ReturnType<typeof fixture>, flags: string[], extra: Partial<Parameters<typeof runPurgeJob>[1]> = {}) {
  const out: string[] = []; const err: string[] = [];
  const clips: NonNullable<Parameters<typeof runPurgeJob>[1]["clips"]> = extra.clips ?? { extract: (_media, windows) => ({ ok: true,
    outcomes: windows.map(window => ({ turnId: window.turnId, file: "injected-valid-clip", status: "exists" })) }) };
  const code = runPurgeJob([...baseArgs(f.root, f.media, ASOF), "--report-file", f.report, ...withConfirm(flags)], {
    now: () => NOW, write: (l) => out.push(l), error: (l) => err.push(l), ...extra,
    clips,
  });
  return { code, out, err };
}
const mediaFiles = (f: ReturnType<typeof fixture>): string[] => { const d = join(f.media, "m"); return existsSync(d) ? readdirSync(d) : []; };
const readReport = (f: ReturnType<typeof fixture>): JobReport => JSON.parse(readFileSync(f.report, "utf8")) as JobReport;

test("default is a dry run: nothing is deleted, report says dry-run and WOULD-PURGE", () => {
  const f = fixture();
  try {
    assert.equal(mediaFiles(f).length, 1);
    const r = job(f, []);
    assert.equal(r.code, 0, r.err.join("\n"));
    assert.equal(mediaFiles(f).length, 1, "dry run must not delete");
    const rep = readReport(f);
    assert.equal(rep.mode, "dry-run");
    assert.equal(rep.exitCode, 0);
    assert.deepEqual(rep.summary, { candidates: 1, deleted: 0, bytes: 0, vetoed: 0, failed: 0 });
    assert.ok(rep.lines.some((l) => l.startsWith("WOULD-PURGE ")));
    assert.ok(!JSON.stringify(rep).includes("SECRET"), "report must carry no transcript or title text");
    assert.equal(rep.startedAt, new Date(NOW).toISOString());
  } finally { f.done(); }
});

test("a real delete needs --execute, and the report records execute mode", () => {
  const f = fixture();
  try {
    const r = job(f, ["--execute"]);
    assert.equal(r.code, 0, r.err.join("\n"));
    assert.equal(mediaFiles(f).length, 0);
    const rep = readReport(f);
    assert.equal(rep.mode, "execute");
    assert.equal(rep.summary?.deleted, 1);
    assert.ok(existsSync(f.srcFile), "data root untouched");
  } finally { f.done(); }
});

test("no flag spelling other than exactly --execute deletes", () => {
  for (const flag of ["--apply", "--force", "--yes", "-x", "--execute=true", "--Execute", "--report-file-execute"]) {
    const f = fixture();
    try {
      const r = job(f, [flag]);
      assert.notEqual(r.code, 0, flag);
      assert.equal(mediaFiles(f).length, 1, `${flag} must not delete`);
    } finally { f.done(); }
  }
});

test("--report-file is required, single, and needs a value; usage errors write no report", () => {
  const f = fixture();
  try {
    const noReport = runPurgeJob(baseArgs(f.root, f.media, ASOF), { now: () => NOW, write: () => {}, error: () => {} });
    assert.equal(noReport, 2);
    assert.equal(splitJobArgs(["--report-file"]).ok, false);
    assert.equal(splitJobArgs(["--report-file", "--execute"]).ok, false);
    assert.equal(splitJobArgs(["--report-file", "a", "--report-file", "b"]).ok, false);
    assert.equal(splitJobArgs(["--report-file=x.json", "--execute"]).ok, true);
    const bad = job(f, ["--bogus"]);
    assert.equal(bad.code, 2);
    assert.equal(mediaFiles(f).length, 1);
    assert.ok(!existsSync(f.report), "invalid tenant-bound arguments must not write an unscoped report");
  } finally { f.done(); }
});

test("an unwritable report file turns an otherwise clean run into exit 5 but never changes what was deleted", () => {
  const f = fixture();
  try {
    const r = job(f, [], { jobIo: { writeReport: () => { throw Object.assign(new Error("x"), { code: "EACCES" }); } } });
    assert.equal(r.code, 5);
    assert.match(r.err.join("\n"), /could not write the report file \(EACCES\)/);
    assert.equal(mediaFiles(f).length, 1);
  } finally { f.done(); }
});

test("the real writer is atomic: creates parent dirs, leaves no tmp file, replaces the previous report", () => {
  const dir = mkdtempSync(join(tmpdir(), "w046-io-"));
  try {
    const p = join(dir, "a", "b", "last-run.json");
    REAL_JOB_IO.writeReport(p, "{\"n\":1}\n");
    REAL_JOB_IO.writeReport(p, "{\"n\":2}\n");
    assert.equal(readFileSync(p, "utf8"), "{\"n\":2}\n");
    assert.deepEqual(readdirSync(join(dir, "a", "b")), ["last-run.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parseSummary reads the last SUMMARY line only; junk gives null", () => {
  assert.equal(parseSummary(["x", "SUMMARY mode=dry-run candidates=a"]), null);
  assert.deepEqual(parseSummary(["SUMMARY mode=dry-run candidates=1 deleted=0 bytes=0 vetoed=0 failed=0", "SUMMARY mode=execute candidates=2 deleted=1 bytes=5 vetoed=1 failed=0"]),
    { candidates: 2, deleted: 1, bytes: 5, vetoed: 1, failed: 0 });
});

test("a long log is truncated to the cap but keeps the SUMMARY line", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++) {
      writeSession(f.root, f.media, { tenant: "toc", name: `n${i}`, title: "t", processedAt: iso(1000), mediaMtimeMs: NOW - 1000, mediaBytes: 1, turns: [] });
    }
    job(f, [], { maxLines: 4 });
    const rep = readReport(f);
    assert.equal(rep.truncated, true);
    assert.equal(rep.lines.length, 4);
    assert.ok(rep.lines[3]?.startsWith("SUMMARY "));
    assert.ok(rep.summary !== null);
    assert.ok(MAX_REPORT_LINES >= 1000);
  } finally { f.done(); }
});
test("actual job publishes a fixed tenant summary that a second sweep can consume", () => {
  const f = fixture();
  try {
    assert.equal(job(f, []).code, 0);
    const path = tenantRetentionSummaryPath(f.root, "toc"), raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.tenantId, "toc"); assert.equal(raw.mode, "dry-run"); assert.equal(raw.clipsRetained, null); assert.equal(raw.candidates, 1);
    assert.equal(job(f, []).code, 0); assert.equal(readReport(f).summary?.candidates, 1);
    assert.equal(job(f, [], { stateRoot: f.media }).code, 2);
    assert.equal(job(f, [], { lastRunFile: join(f.out, "global.json") }).code, 2);
    assert.ok(!existsSync(join(f.out, "global.json"))); assert.equal(mediaFiles(f).length, 1);
  } finally { f.done(); }
});
test("real CLI binding refuses legacy/global override and mismatched configured root; dry-run writes private state", () => {
  const f = fixture(), errors: string[] = [];
  try {
    const args = [...baseArgs(f.root, f.media, ["--as-of", new Date().toISOString()]), "--report-file", f.report];
    assert.equal(runRetentionPurgeJobCli(args, { LKB_RETENTION_LAST_RUN: join(f.out, "legacy.json") }, () => {}, line => errors.push(line)), 2);
    assert.equal(runRetentionPurgeJobCli(args, { LKB_RETENTION_DATA_ROOT: f.media }, () => {}, line => errors.push(line)), 2);
    assert.equal(runRetentionPurgeJobCli(args, { LKB_RETENTION_DATA_ROOT: f.root }, () => {}, line => errors.push(line)), 0, errors.join("\n"));
    const raw = JSON.parse(readFileSync(tenantRetentionSummaryPath(f.root, "toc"), "utf8"));
    assert.equal(raw.tenantId, "toc"); assert.equal(raw.deleted, 0); assert.equal(raw.clipsRetained, null);
    assert.equal(mediaFiles(f).length, 1); assert.ok(!existsSync(join(f.out, "legacy.json")));
  } finally { f.done(); }
});

test("job: --execute without --confirm-deletion refuses (exit 2), deletes nothing, writes no execute report", () => {
  const f = fixture();
  try {
    const r = job(f, ["--execute", "--no-auto-confirm"]);
    assert.equal(r.code, 2);
    assert.match(r.err.join("\n"), /--execute requires --confirm-deletion/);
    assert.equal(mediaFiles(f).length, 1);
    assert.equal(existsSync(f.report), false);
  } finally { f.done(); }
});

test("job: thresholds default to 90 / 15 and below-floor values are refused", () => {
  const f = fixture();
  try {
    const noThresholds = baseArgs(f.root, f.media, ASOF).filter((a, i, arr) => !["--min-age-days", "--clip-padding-seconds"].includes(a) && !["--min-age-days", "--clip-padding-seconds"].includes(arr[i - 1] ?? ""));
    const run = (extra: string[]) => { const err: string[] = []; const code = runPurgeJob([...noThresholds, ...extra, "--report-file", f.report], { now: () => NOW, write: () => {}, error: (l) => err.push(l) }); return { code, err: err.join("\n") }; };
    assert.equal(run([]).code, 0);
    assert.equal(run(["--min-age-days", "30"]).code, 2);
    assert.equal(run(["--clip-padding-seconds", "5"]).code, 2);
    assert.equal(mediaFiles(f).length, 1);
  } finally { f.done(); }
});
