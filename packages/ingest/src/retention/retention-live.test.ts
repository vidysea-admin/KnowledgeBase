/**
 * T-046 retention on real data: processedAt writer, D-008 evidence-clip extraction before purge, last-run summary.
 * Temp dirs, injected ffmpeg / unlink / report writers. No real ffmpeg, no real raw/ media, no network.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { EvidenceClipWindow } from "@lkb/core";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DAY, NOW, iso, tempRoot, writeSession, baseArgs } from "./retention-report.fixtures.js";
import { tenantSegment } from "./retention-report-state.js";
import { runRetentionPurge, REAL_PURGE_IO, type PurgeIo } from "./retention-purge.js";
import { runPurgeJob, type JobReport } from "./retention-purge-job.js";
import { makeMarkIo, markSessionProcessed, type MarkIo } from "./retention-processed.js";
import { clipArgs, clipFileName, extractEvidenceClips, resolveFfmpegCommand, type ClipIo } from "./retention-clips.js";
import { buildLastRun, type LastRun } from "./retention-last-run.js";

const ASOF = ["--as-of", new Date(NOW).toISOString()];
const WIN = { sessionId: "s", turnId: "t1", tStart: 85, tEnd: 125 };

interface Env { root: string; media: string; done: () => void }
function env(): Env {
  const root = tempRoot();
  const media = mkdtempSync(join(tmpdir(), "t046live-media-"));
  return { root, media, done: () => { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); } };
}
function session(e: Env, name: string, ageDays: number, extra: Record<string, unknown> = {}): string {
  const capturedMs = NOW - ageDays * DAY;
  const dir = writeSession(e.root, e.media, {
    tenant: "toc", name, processedAt: iso(ageDays * DAY - 3_600_000), mediaMtimeMs: capturedMs, mediaBytes: 10,
    turns: [{ _id: `${name}-t1`, tenantId: "toc", sessionId: name, speakerRef: "a", tStart: 100, tEnd: 110, text: "SECRET TRANSCRIPT TEXT" }],
    ...extra,
  });
  const f = join(dir, "source.json");
  const src = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  src.createdAt = new Date(capturedMs).toISOString();
  writeFileSync(f, JSON.stringify(src));
  return dir;
}
const mediaFile = (e: Env, name: string): string => join(e.media, "m", `${name}.webm`);

/** fake ffmpeg/ffprobe: records argv; the "file system" is a map path -> {size, dur}; the source file is any path not in it */
interface Fake { io: ClipIo; files: Map<string, { size: number; dur: number }>; renames: string[][] }
function fakeClip(log: string[][], opts: { exit?: number; bytes?: number; spawnError?: string; srcDur?: number; shortBy?: number } = {}): Fake {
  const files = new Map<string, { size: number; dur: number }>();
  const renames: string[][] = [];
  const io: ClipIo = {
    run: (_c, args) => {
      log.push([...args]);
      if (opts.spawnError) return { code: null, error: opts.spawnError };
      if (opts.exit) return { code: opts.exit };
      files.set(args[args.length - 1] as string, { size: opts.bytes ?? 5, dur: Number(args[args.indexOf("-t") + 1]) - (opts.shortBy ?? 0) });
      return { code: 0 };
    },
    probe: (_c, p) => { const f = files.get(p); return f ? (f.dur >= 0 ? { duration: f.dur, streams: ["video"] } : null) : { duration: opts.srcDur ?? 3600, streams: ["video"] }; },
    mkdirp: () => undefined,
    isLinkOrNotDir: () => false,
    sizeOf: (p) => files.get(p)?.size ?? null,
    rename: (a, b) => { renames.push([a, b]); const f = files.get(a); if (f) { files.set(b, f); files.delete(a); } },
    remove: (p) => { files.delete(p); },
  };
  return { io, files, renames };
}
const fakeClipIo = (log: string[][], opts: Parameters<typeof fakeClip>[1] = {}): ClipIo => fakeClip(log, opts).io;

// ---- processedAt writer ----------------------------------------------------------------------------------------
test("markSessionProcessed stamps processedAt only when transcribe and index are done, atomically, changing nothing else", () => {
  const e = env();
  try {
    const dir = session(e, "a", 100, { processedAt: undefined });
    const before = JSON.parse(readFileSync(join(dir, "session.json"), "utf8")) as Record<string, unknown>;
    assert.equal(before.processedAt, undefined);
    const r = markSessionProcessed(dir, NOW);
    assert.deepEqual(r, { ok: true, changed: true, processedAt: new Date(NOW).toISOString() });
    const after = JSON.parse(readFileSync(join(dir, "session.json"), "utf8")) as Record<string, unknown>;
    assert.deepEqual({ ...after, processedAt: undefined }, { ...before, processedAt: undefined });
    assert.equal(after.processedAt, new Date(NOW).toISOString());
    // idempotent: a second call with a later clock must not move it
    assert.deepEqual(markSessionProcessed(dir, NOW + DAY), { ok: true, changed: false, processedAt: new Date(NOW).toISOString() });
  } finally { e.done(); }
});

test("markSessionProcessed refuses an unfinished, unreadable or malformed session and never writes", () => {
  const e = env();
  try {
    const writes: string[] = [];
    const io = (text: string | Error): MarkIo => ({ read: () => { if (text instanceof Error) throw text; return text; }, writeAtomic: (p) => { writes.push(p); } });
    for (const status of [{ transcribe: "done", index: "pending" }, { transcribe: "pending", index: "done" }, {}, null]) {
      const r = markSessionProcessed("x", NOW, io(JSON.stringify({ status })));
      assert.equal(r.ok, false);
    }
    assert.equal(markSessionProcessed("x", NOW, io("not json")).ok, false);
    assert.equal(markSessionProcessed("x", NOW, io("[]")).ok, false);
    assert.equal(markSessionProcessed("x", NOW, io(new Error("EACCES"))).ok, false);
    assert.equal(markSessionProcessed("x", Number.NaN, io(JSON.stringify({ status: { transcribe: "done", index: "done" } }))).ok, false);
    assert.deepEqual(writes, []);
    const failing: MarkIo = { read: () => JSON.stringify({ status: { transcribe: "done", index: "done" } }), writeAtomic: () => { throw Object.assign(new Error("x"), { code: "EBUSY" }); } };
    assert.deepEqual(markSessionProcessed("x", NOW, failing), { ok: false, reason: "write failed (EBUSY)" });
  } finally { e.done(); }
});

test("end to end: with no processedAt nothing is eligible; after markSessionProcessed the 100-day-old recording is a purge candidate (dry run)", () => {
  const e = env();
  try {
    const dir = session(e, "real", 100, { processedAt: undefined });
    const dry = (): string => { const out: string[] = []; runRetentionPurge(baseArgs(e.root, e.media, ASOF), { now: () => NOW, write: (l) => out.push(l), error: (l) => out.push(l) }); return out.join("\n"); };
    assert.match(dry(), /eligible to purge: 0/);
    assert.equal(markSessionProcessed(dir, NOW - 99 * DAY).ok, true);
    const after = dry();
    assert.match(after, /eligible to purge: 1/);
    assert.match(after, /WOULD-PURGE path=m\/real\.webm/);
    assert.ok(existsSync(mediaFile(e, "real")), "dry run never deletes");
  } finally { e.done(); }
});

// ---- clip extraction -------------------------------------------------------------------------------------------
test("clipArgs is an exact argv with seek before input, stream copy, no shell metacharacter handling needed", () => {
  assert.deepEqual(clipArgs("/m/a b;rm.webm", 85, 40, "/o/c.webm"),
    ["-hide_banner", "-nostdin", "-loglevel", "error", "-ss", "85", "-i", "/m/a b;rm.webm", "-t", "40", "-c", "copy", "-y", "/o/c.webm"]);
  assert.equal(clipFileName({ ...WIN, sessionId: "../x", turnId: "t/1" }, ".webm"), ".._x__t_1.webm");
});

test("resolveFfmpegCommand: env wins, must be absolute, else bare ffmpeg", () => {
  const d = mkdtempSync(join(tmpdir(), "t046live-ff-"));
  try {
    assert.equal(resolveFfmpegCommand({ LKB_FFMPEG_PATH: "/opt/ff/ffmpeg" }, d, "linux"), "/opt/ff/ffmpeg");
    assert.throws(() => resolveFfmpegCommand({ LKB_FFMPEG_PATH: "ffmpeg" }, d, "linux"));
    assert.equal(resolveFfmpegCommand({ LKB_FFMPEG_PATH: d }, d, "linux"), join(d, "ffmpeg"));
    assert.equal(resolveFfmpegCommand({}, d, "linux"), "ffmpeg");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("extractEvidenceClips: ok only when every window yields a non-empty clip; failures are reported with a reason", () => {
  const log: string[][] = [];
  const ok = extractEvidenceClips("/m/s.webm", [WIN, { ...WIN, turnId: "t2" }], "/o", "ffmpeg", fakeClipIo(log));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.outcomes.map((o) => o.status), ["extracted", "extracted"]);
  assert.equal(log.length, 2);
  for (const [opts, why] of [[{ exit: 1 }, "ffmpeg-exit-1"], [{ spawnError: "ENOENT" }, "ffmpeg-missing"], [{ bytes: 0 }, "empty-output"]] as const) {
    const r = extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", fakeClipIo([], opts));
    assert.equal(r.ok, false);
    assert.equal(r.outcomes[0]?.why, why);
  }
  assert.equal(extractEvidenceClips("/m/s.webm", [], "/o", "ffmpeg", fakeClipIo([])).ok, false, "no windows is never a success");
  assert.equal(extractEvidenceClips("/m/s.webm", [{ ...WIN, tEnd: 85 }], "/o", "ffmpeg", fakeClipIo([])).outcomes[0]?.why, "bad-window");
});

test("an already-extracted clip is reused (idempotent) and ffmpeg is not run again", () => {
  const log: string[][] = [];
  const io = fakeClipIo(log);
  extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", io);
  const again = extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", io);
  assert.equal(again.outcomes[0]?.status, "exists");
  assert.equal(log.length, 1);
});

// ---- clips before purge ----------------------------------------------------------------------------------------
function purge(e: Env, flags: string[], clipLog: string[][], clipOpts: Parameters<typeof fakeClipIo>[1] = {}, order: string[] = []) {
  const out: string[] = []; const unlinked: string[] = [];
  const cio = fakeClipIo(clipLog, clipOpts);
  const purgeIo: PurgeIo = { unlink: (p) => { order.push("unlink"); unlinked.push(p); REAL_PURGE_IO.unlink(p); } };
  const code = runRetentionPurge([...baseArgs(e.root, e.media, ASOF), ...flags], {
    now: () => NOW, write: (l) => out.push(l), error: (l) => out.push(l), purgeIo,
    clips: { extract: (m, w, o) => { order.push("clips"); return extractEvidenceClips(m, w, o, "ffmpeg", cio); } },
  });
  return { code, out: out.join("\n"), unlinked };
}

test("execute: clips are extracted BEFORE the unlink, into the session's evidence-clips dir, at +/-padding", () => {
  const e = env();
  try {
    session(e, "s", 120);
    const log: string[][] = []; const order: string[] = [];
    const r = purge(e, ["--execute"], log, {}, order);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(order, ["clips", "unlink"]);
    assert.equal(log.length, 1);
    const a = log[0] as string[];
    assert.equal(a[a.indexOf("-ss") + 1], String(100 - 15));
    assert.equal(a[a.indexOf("-t") + 1], String(10 + 30));
    assert.equal(dirname(a[a.length - 1] as string), join(e.root, tenantSegment("toc"), "s", "evidence-clips"));
    assert.match(r.out, /CLIPS retained=1/);
    assert.match(r.out, /SUMMARY mode=execute candidates=1 deleted=1/);
    assert.ok(!existsSync(mediaFile(e, "s")));
  } finally { e.done(); }
});

test("execute: if clip extraction fails the raw media is KEPT and the item is vetoed", () => {
  const e = env();
  try {
    session(e, "s", 120);
    for (const opts of [{ exit: 1 }, { spawnError: "ENOENT" }, { bytes: 0 }]) {
      const r = purge(e, ["--execute"], [], opts);
      assert.equal(r.code, 0, r.out);
      assert.ok(existsSync(mediaFile(e, "s")), `kept for ${JSON.stringify(opts)}`);
      assert.deepEqual(r.unlinked, []);
      assert.match(r.out, /VETOED path=m\/s\.webm reason=clip-extraction-failed/);
      assert.match(r.out, /deleted=0 .*vetoed=1/);
    }
  } finally { e.done(); }
});

test("dry run extracts nothing and deletes nothing", () => {
  const e = env();
  try {
    session(e, "s", 120);
    const log: string[][] = [];
    const r = purge(e, [], log);
    assert.equal(r.code, 0, r.out);
    assert.equal(log.length, 0);
    assert.ok(existsSync(mediaFile(e, "s")));
    assert.match(r.out, /WOULD-EXTRACT-CLIPS path=m\/s\.webm windows=1/);
    assert.match(r.out, /SUMMARY mode=dry-run candidates=1 deleted=0/);
    assert.ok(!existsSync(join(e.root, tenantSegment("toc"), "s", "evidence-clips")));
  } finally { e.done(); }
});

// ---- last-run summary ------------------------------------------------------------------------------------------
test("the job writes data/retention/last-run.json shape: dry run by default, counts, no transcript text", () => {
  const e = env();
  const out = mkdtempSync(join(tmpdir(), "t046live-out-"));
  try {
    session(e, "s", 120);
    const reportFile = join(out, "report.json"); const lastRun = join(out, "retention", "last-run.json");
    const code = runPurgeJob([...baseArgs(e.root, e.media, ASOF), "--report-file", reportFile], {
      now: () => NOW, write: () => undefined, error: () => undefined, lastRunFile: lastRun,
    });
    assert.equal(code, 0);
    const lr = JSON.parse(readFileSync(lastRun, "utf8")) as LastRun;
    assert.deepEqual(lr, {
      version: 1, mode: "dry-run", dryRun: true, startedAt: new Date(NOW).toISOString(), finishedAt: new Date(NOW).toISOString(),
      exitCode: 0, ok: true, candidates: 1, deleted: 0, bytes: 0, vetoed: 0, failed: 0, clipsRetained: null, reportFile,
    });
    assert.ok(!readFileSync(lastRun, "utf8").includes("SECRET"));
    assert.ok(existsSync(mediaFile(e, "s")));
  } finally { e.done(); rmSync(out, { recursive: true, force: true }); }
});

test("buildLastRun: a run that died before SUMMARY has null counts and ok=false; clips line is parsed", () => {
  const base: JobReport = { version: 1, mode: "execute", startedAt: "a", finishedAt: "b", exitCode: 3, summary: null, truncated: false, lines: ["ERROR x"] };
  const dead = buildLastRun(base, "/r.json");
  assert.deepEqual([dead.ok, dead.candidates, dead.deleted, dead.clipsRetained, dead.dryRun], [false, null, null, null, false]);
  const live = buildLastRun({ ...base, exitCode: 0, summary: { candidates: 2, deleted: 2, bytes: 9, vetoed: 0, failed: 0 }, lines: ["CLIPS retained=4"] }, "/r.json");
  assert.deepEqual([live.ok, live.clipsRetained, live.deleted], [true, 4, 2]);
});

test("a last-run write failure is reported (exit 5) without changing the purge outcome", () => {
  const e = env();
  try {
    session(e, "s", 120);
    const errs: string[] = [];
    const code = runPurgeJob([...baseArgs(e.root, e.media, ASOF), "--report-file", "/tmp/never-written.json"], {
      now: () => NOW, write: () => undefined, error: (l) => errs.push(l), lastRunFile: "/x/last-run.json",
      jobIo: { writeReport: (p) => { if (p.endsWith("last-run.json")) throw Object.assign(new Error("x"), { code: "EACCES" }); } },
    });
    assert.equal(code, 5);
    assert.match(errs.join("\n"), /last-run summary \(EACCES\)/);
    assert.ok(existsSync(mediaFile(e, "s")));
  } finally { e.done(); }
});

// ---- fix cycle 1: ffprobe validation, atomic clips, links (ISS-T046LIVE-001/002/004) ----------------------------
test("ISS-T046LIVE-001 (fake probe): a window beyond the source end FAILS; a clip shorter than the window FAILS; nothing is left behind", () => {
  const f = fakeClip([], { srcDur: 10 });
  const r = extractEvidenceClips("/m/s.mp4", [{ ...WIN, tStart: 50, tEnd: 60 }], "/o", "ffmpeg", f.io);
  assert.equal(r.ok, false);
  assert.equal(r.outcomes[0]?.why, "window-beyond-media");
  const short = fakeClip([], { shortBy: 30 });
  const r2 = extractEvidenceClips("/m/s.mp4", [WIN], "/o", "ffmpeg", short.io);
  assert.equal(r2.outcomes[0]?.why, "clip-failed-validation");
  assert.equal(short.files.size, 0, "failed partial removed, no final name");
  const unprobeable = fakeClip([]); unprobeable.io.probe = () => null;
  assert.equal(extractEvidenceClips("/m/s.mp4", [WIN], "/o", "ffmpeg", unprobeable.io).outcomes[0]?.why, "source-unprobeable");
});

test("ISS-T046LIVE-001: a window straddling the source end is clamped (valid), not rejected", () => {
  const f = fakeClip([], { srcDur: 100, shortBy: 25 }); // asked 85..125 (40 s), only 15 s exist
  assert.equal(extractEvidenceClips("/m/s.mp4", [WIN], "/o", "ffmpeg", f.io).ok, true);
});

test("ISS-T046LIVE-002 (fake): ffmpeg writes to a .partial name and the final name appears only by rename after validation", () => {
  const log: string[][] = []; const f = fakeClip(log);
  assert.equal(extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", f.io).ok, true);
  const outArg = (log[0] as string[]).at(-1) as string;
  assert.match(outArg, /\.partial\.webm$/);
  assert.deepEqual(f.renames, [[outArg, outArg.replace(".partial", "")]]);
  assert.ok(!f.files.has(outArg));
});

test("ISS-T046LIVE-002 (fake): an existing junk clip is re-validated, treated as missing and re-extracted", () => {
  const log: string[][] = []; const f = fakeClip(log);
  const final = join("/o", clipFileName(WIN, ".webm"));
  f.files.set(final, { size: 18, dur: -1 }); // probe -> null
  const r = extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", f.io);
  assert.equal(r.ok, true);
  assert.equal(r.outcomes[0]?.status, "extracted");
  assert.equal(log.length, 1);
});

test("ISS-T046LIVE-004: an evidence-clips directory that is a link / not a directory is refused and ffmpeg never runs", () => {
  const log: string[][] = []; const f = fakeClip(log);
  f.io.isLinkOrNotDir = () => true;
  const r = extractEvidenceClips("/m/s.webm", [WIN], "/o", "ffmpeg", f.io);
  assert.equal(r.ok, false);
  assert.equal(r.outcomes[0]?.why, "clips-dir-is-link-or-not-a-directory");
  assert.equal(log.length, 0);
});

test("ISS-T046LIVE-004: markSessionProcessed writes a temp file then renames it over session.json (non-atomic write is killed)", () => {
  const calls: string[][] = [];
  const io = makeMarkIo({ writeFileSync: (p) => { calls.push(["write", p]); }, renameSync: (a, b) => { calls.push(["rename", a, b]); } });
  io.writeAtomic("/d/session.json", "{}");
  assert.equal(calls[0]?.[0], "write");
  assert.notEqual(calls[0]?.[1], "/d/session.json");
  assert.deepEqual(calls[1], ["rename", calls[0]?.[1], "/d/session.json"]);
});

test("ISS-T046LIVE-003: the job refuses a --report-file equal to the last-run summary path", () => {
  const errs: string[] = [];
  const code = runPurgeJob(["--report-file", "/tmp/same.json"], { now: () => NOW, write: () => undefined, error: (l) => errs.push(l), lastRunFile: "/tmp/same.json" });
  assert.equal(code, 2);
  assert.match(errs.join(), /must differ/);
});

// ---- real ffmpeg / ffprobe (lavfi media in a temp dir); skipped cleanly when the binaries are absent ----------------
const FF_DIR = process.env.LKB_TEST_FFMPEG_DIR
  ?? "C:\\Users\\product\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin";
const FFMPEG = join(FF_DIR, "ffmpeg.exe");
const HAVE_FF = existsSync(FFMPEG) && existsSync(join(FF_DIR, "ffprobe.exe"));
const real = { skip: HAVE_FF ? false : "ffmpeg/ffprobe not found" };

function realSource(dir: string, secs: number): string {
  const out = join(dir, "src.mp4");
  const r = spawnSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", `testsrc=duration=${secs}:size=64x64:rate=10`, "-f", "lavfi", "-i", `sine=duration=${secs}`,
    "-c:v", "libx264", "-g", "10", "-c:a", "aac", "-shortest", "-y", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test("REAL ffmpeg ISS-T046LIVE-001: 10 s mp4 with a 50-60 s window fails; an in-range window yields a probe-valid clip", real, () => {
  const d = mkdtempSync(join(tmpdir(), "t046live-real-"));
  try {
    const src = realSource(d, 10);
    const out = join(d, "clips");
    const bad = extractEvidenceClips(src, [{ sessionId: "S1", turnId: "t9", tStart: 50, tEnd: 60 }], out, FFMPEG);
    assert.equal(bad.ok, false);
    assert.equal(bad.outcomes[0]?.why, "window-beyond-media");
    assert.ok(!existsSync(join(out, "S1__t9.mp4")));
    const good = extractEvidenceClips(src, [{ sessionId: "S1", turnId: "t1", tStart: 2, tEnd: 6 }], out, FFMPEG);
    assert.equal(good.ok, true, JSON.stringify(good));
    assert.deepEqual(readdirSync(out), ["S1__t1.mp4"], "no .partial left");
    const clamped = extractEvidenceClips(src, [{ sessionId: "S1", turnId: "t2", tStart: 7, tEnd: 20 }], out, FFMPEG);
    assert.equal(clamped.ok, true, JSON.stringify(clamped));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("REAL ffprobe ISS-T046LIVE-002: 18-byte junk at the clip name and a truncated clip are rejected and replaced by a valid one", real, () => {
  const d = mkdtempSync(join(tmpdir(), "t046live-real-"));
  try {
    const src = realSource(d, 10);
    const out = join(d, "clips"); mkdirSync(out);
    const w = { sessionId: "S1", turnId: "t4", tStart: 1, tEnd: 7 };
    const final = join(out, "S1__t4.mp4");
    writeFileSync(final, Buffer.alloc(18, 0x41));
    const r1 = extractEvidenceClips(src, [w], out, FFMPEG);
    assert.equal(r1.outcomes[0]?.status, "extracted", "junk is not accepted as 'exists'");
    const full = readFileSync(final);
    writeFileSync(final, full.subarray(0, Math.floor(full.length * 0.4))); // a killed ffmpeg's truncation
    const r2 = extractEvidenceClips(src, [w], out, FFMPEG);
    assert.equal(r2.outcomes[0]?.status, "extracted", "truncated clip is replaced");
    assert.equal(readFileSync(final).length, full.length);
    assert.equal(extractEvidenceClips(src, [w], out, FFMPEG).outcomes[0]?.status, "exists");
    writeFileSync(join(out, "S1__t5.partial.mp4"), Buffer.alloc(18, 0x41)); // stale partial from a killed run
    const r3 = extractEvidenceClips(src, [{ ...w, turnId: "t5" }], out, FFMPEG);
    assert.equal(r3.ok, true);
    assert.deepEqual(readdirSync(out).sort(), ["S1__t4.mp4", "S1__t5.mp4"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("REAL purge end to end: execute keeps the media when the window is beyond it, deletes it after valid clips otherwise", real, () => {
  const e = env();
  const srcDir = mkdtempSync(join(tmpdir(), "t046live-real-"));
  try {
    const dir = session(e, "r", 120, { mediaPath: "m/r.mp4" });
    const target = join(e.media, "m", "r.mp4");
    writeFileSync(target, readFileSync(realSource(srcDir, 10)));
    utimesSync(target, new Date(NOW - 120 * DAY), new Date(NOW - 120 * DAY));
    const clips = { extract: (m: string, w: readonly EvidenceClipWindow[], o: string) => extractEvidenceClips(m, w, o, FFMPEG) };
    const run = (): string => { const out: string[] = []; runRetentionPurge([...baseArgs(e.root, e.media, ASOF), "--execute"], { now: () => NOW, write: (l) => out.push(l), error: (l) => out.push(l), clips }); return out.join("\n"); };
    const o1 = run(); // cited turn 100-110 s in a 10 s file
    assert.ok(existsSync(target), o1);
    assert.match(o1, /clip-extraction-failed: window-beyond-media/);
    writeFileSync(join(dir, "turns.json"), JSON.stringify([{ _id: "r-t1", tenantId: "toc", sessionId: "r", speakerRef: "a", tStart: 3, tEnd: 5, text: "x" }]));
    const o2 = run();
    assert.ok(!existsSync(target), o2);
    assert.ok(existsSync(join(dir, "evidence-clips", "r__r-t1.mp4")));
  } finally { e.done(); rmSync(srcDir, { recursive: true, force: true }); }
});
