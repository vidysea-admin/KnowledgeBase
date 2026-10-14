/**
 * T-046 retention on real data: processedAt writer, D-008 evidence-clip extraction before purge, last-run summary.
 * Temp dirs, injected ffmpeg / unlink / report writers. No real ffmpeg, no real raw/ media, no network.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DAY, NOW, iso, tempRoot, writeSession, baseArgs } from "./retention-report.fixtures.js";
import { tenantSegment } from "./retention-report-state.js";
import { runRetentionPurge, REAL_PURGE_IO, type PurgeIo } from "./retention-purge.js";
import { runPurgeJob, type JobReport } from "./retention-purge-job.js";
import { markSessionProcessed, type MarkIo } from "./retention-processed.js";
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

/** fake ffmpeg: records argv, writes `bytes` bytes to the output (last arg) unless told to fail */
function fakeClipIo(log: string[][], opts: { exit?: number; bytes?: number; spawnError?: string } = {}): ClipIo {
  const files = new Map<string, number>();
  return {
    run: (_c, args) => {
      log.push([...args]);
      if (opts.spawnError) return { code: null, error: opts.spawnError };
      if (opts.exit) return { code: opts.exit };
      files.set(args[args.length - 1] as string, opts.bytes ?? 5);
      return { code: 0 };
    },
    mkdirp: () => undefined,
    sizeOf: (p) => files.get(p) ?? null,
    remove: (p) => { files.delete(p); },
  };
}

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
