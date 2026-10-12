/**
 * T-046 / D-145 (pending append): the raw-media purge executor. Temp directories and an injected
 * unlink only; no network, no browser, no real data.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DAY, NOW, iso, snapshot, tempRoot, writeSession, emptyOps, baseArgs } from "./retention-report.fixtures.js";
import { tenantSegment } from "./retention-report-state.js";
import { REAL_PURGE_IO, runRetentionPurge, type PurgeIo } from "./retention-purge.js";

const ASOF = ["--as-of", new Date(NOW).toISOString()];
interface Env { root: string; media: string; done: () => void }
function env(): Env {
  const root = tempRoot();
  const media = mkdtempSync(join(tmpdir(), "t046purge-media-"));
  return { root, media, done: () => { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); } };
}

/** A fully processed, verified session captured `ageDays` ago, with its media file written at capture time. */
function session(e: Env, name: string, ageDays: number, extra: Record<string, unknown> = {}, tenant = "toc"): string {
  const capturedMs = NOW - ageDays * DAY;
  const dir = writeSession(e.root, e.media, {
    tenant, name, title: "SECRET TITLE", processedAt: iso(ageDays * DAY - 3_600_000), mediaMtimeMs: capturedMs, mediaBytes: 10,
    turns: [{ _id: `${name}-t1`, tenantId: tenant, sessionId: name, speakerRef: "a", tStart: 100, tEnd: 110, text: "SECRET TRANSCRIPT TEXT" }],
    ...extra,
  });
  const srcFile = join(dir, "source.json");
  const src = JSON.parse(readFileSync(srcFile, "utf8")) as Record<string, unknown>;
  src.createdAt = new Date(capturedMs).toISOString();
  writeFileSync(srcFile, JSON.stringify(src));
  return dir;
}

interface Ran { code: number; out: string; err: string; unlinked: string[] }
function run(e: Env, flags: string[] = [], opts: { afterPlan?: () => void; purgeIo?: (log: string[]) => PurgeIo; extra?: string[] } = {}): Ran {
  const out: string[] = [];
  const err: string[] = [];
  const unlinked: string[] = [];
  const purgeIo: PurgeIo = opts.purgeIo ? opts.purgeIo(unlinked) : { unlink: (p) => { unlinked.push(p); REAL_PURGE_IO.unlink(p); } };
  const code = runRetentionPurge([...baseArgs(e.root, e.media, [...ASOF, ...(opts.extra ?? [])]), ...flags], {
    now: () => NOW, write: (l) => out.push(l), error: (l) => err.push(l), purgeIo, ...(opts.afterPlan ? { afterPlan: opts.afterPlan } : {}),
  });
  return { code, out: out.join("\n"), err: err.join("\n"), unlinked };
}
const mediaFile = (e: Env, name: string): string => join(e.media, "m", `${name}.webm`);

test("89 days is kept and 91 days is deleted; exactly 90 days is kept", () => {
  const e = env();
  try {
    session(e, "s89", 89); session(e, "s90", 90); session(e, "s91", 91);
    const r = run(e, ["--execute"]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.ok(existsSync(mediaFile(e, "s89")), "89 d must be kept");
    assert.ok(existsSync(mediaFile(e, "s90")), "exactly 90 d must be kept (older than, not at)");
    assert.ok(!existsSync(mediaFile(e, "s91")), "91 d must be deleted");
    assert.match(r.out, /PURGED path=m\/s91\.webm age_days=91\.0 size_bytes=10/);
    assert.match(r.out, /SUMMARY mode=execute candidates=1 deleted=1 bytes=10 vetoed=0 failed=0/);
  } finally { e.done(); }
});

test("transcripts, notes, claims and citations are never deleted, even when old; only media-extension files are", () => {
  const e = env();
  try {
    const dir = session(e, "old", 400);
    // sessions whose source.json points at a transcript / notes file: must be refused by the media-type rule
    session(e, "pointsAtNotes", 400, { mediaPath: "notes.md" });
    session(e, "pointsAtJson", 400, { mediaPath: "turns.json" });
    session(e, "pointsAtVtt", 400, { mediaPath: "talk.vtt" });
    for (const f of ["transcript.txt", "talk-notes.md"]) writeFileSync(join(e.media, f), "old notes");
    const r = run(e, ["--execute"]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.ok(!existsSync(mediaFile(e, "old")), "the old webm is the one thing deleted");
    for (const f of ["notes.md", "turns.json", "talk.vtt", "transcript.txt", "talk-notes.md"]) assert.ok(existsSync(join(e.media, f)), `${f} must survive`);
    for (const f of ["session.json", "source.json", "claims.json", "turns.json"]) assert.ok(existsSync(join(dir, f)), `${f} must survive`);
    assert.equal(r.unlinked.length, 1);
    assert.match(r.out, /not-a-media-file/);
  } finally { e.done(); }
});

test("a veto that appears AFTER planning blocks deletion (pipeline starts using it)", () => {
  const e = env();
  try {
    const dir = session(e, "busy", 120);
    session(e, "free", 120);
    const ops = join(mkdtempSync(join(tmpdir(), "t046purge-ops-")), "operations.json");
    writeFileSync(ops, JSON.stringify({ version: 1, operations: {} }));
    const r = run(e, ["--execute"], {
      extra: ["--operations-state", ops],
      afterPlan: () => writeFileSync(ops, JSON.stringify({ version: 1, operations: { busy: { status: "processing" } } })),
    });
    assert.equal(r.code, 0, r.err + r.out);
    assert.ok(existsSync(mediaFile(e, "busy")), "an in-flight recording must survive");
    assert.ok(!existsSync(mediaFile(e, "free")));
    assert.match(r.out, /VETOED path=m\/busy\.webm reason=operation-in-progress/);
    assert.match(r.out, /deleted=1 .*vetoed=1/);
    assert.ok(existsSync(dir));
  } finally { e.done(); }
});

test("a veto after planning: a citing claim stops being verified, so the media is kept", () => {
  const e = env();
  try {
    const dir = session(e, "cited", 200);
    const r = run(e, ["--execute"], {
      afterPlan: () => writeFileSync(join(dir, "claims.json"), JSON.stringify([{ _id: "c", tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: "cited-t1", sessionId: "cited" }] }])),
    });
    assert.ok(existsSync(mediaFile(e, "cited")));
    assert.match(r.out, /VETOED path=m\/cited\.webm/);
    assert.equal(r.unlinked.length, 0);
  } finally { e.done(); }
});

test("a recording touched after planning (quiet-period veto) is kept", () => {
  const e = env();
  try {
    session(e, "touched", 150);
    const r = run(e, ["--execute"], { afterPlan: () => { const f = mediaFile(e, "touched"); writeFileSync(f, Buffer.alloc(10, 1)); const t = new Date(NOW - 3_600_000); utimesSync(f, t, t); } });
    assert.ok(existsSync(mediaFile(e, "touched")));
    assert.match(r.out, /VETOED path=m\/touched\.webm reason=recently-modified/);
  } finally { e.done(); }
});

test("dry run is the default and deletes nothing, writes nothing, calls no unlink", () => {
  const e = env();
  try {
    session(e, "a", 100); session(e, "b", 365);
    const before = { root: snapshot(e.root), media: snapshot(e.media) };
    const r = run(e);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(r.unlinked.length, 0);
    assert.deepEqual({ root: snapshot(e.root), media: snapshot(e.media) }, before);
    assert.match(r.out, /DRY RUN/);
    assert.match(r.out, /WOULD-PURGE path=m\/a\.webm age_days=100\.0 size_bytes=10/);
    assert.match(r.out, /SUMMARY mode=dry-run candidates=2 deleted=0/);
  } finally { e.done(); }
});

test("a failure on one item is reported, the others are still deleted, exit code 4", () => {
  const e = env();
  try {
    session(e, "ok1", 100); session(e, "bad", 100); session(e, "ok2", 100);
    const r = run(e, ["--execute"], {
      purgeIo: (log) => ({ unlink: (p) => { log.push(p); if (p.endsWith("bad.webm")) throw Object.assign(new Error("locked"), { code: "EBUSY" }); REAL_PURGE_IO.unlink(p); } }),
    });
    assert.equal(r.code, 4);
    assert.ok(existsSync(mediaFile(e, "bad")), "the failed item is intact");
    assert.ok(!existsSync(mediaFile(e, "ok1")) && !existsSync(mediaFile(e, "ok2")));
    assert.match(r.out, /FAILED path=m\/bad\.webm error=EBUSY/);
    assert.match(r.out, /deleted=2 bytes=20 vetoed=0 failed=1/);
  } finally { e.done(); }
});

test("log lines carry path, age and size only; never transcript or title text", () => {
  const e = env();
  try {
    session(e, "logged", 100);
    const r = run(e, ["--execute"]);
    assert.doesNotMatch(r.out + r.err, /SECRET/);
    const lines = r.out.split("\n").filter((l) => l.startsWith("PURGED"));
    assert.equal(lines.length, 1);
  } finally { e.done(); }
});

test("tenant scoping: another tenant's old media is never deleted", () => {
  const e = env();
  try {
    session(e, "mine", 120);
    session(e, "theirs", 500, {}, "other");
    const r = run(e, ["--execute"]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.ok(!existsSync(mediaFile(e, "mine")));
    assert.ok(existsSync(mediaFile(e, "theirs")), "other tenant's file must survive a run for toc");
    assert.ok(existsSync(join(e.root, tenantSegment("other"))));
  } finally { e.done(); }
});

test("a file shared with another tenant is kept", () => {
  const e = env();
  try {
    session(e, "mine", 120, { mediaPath: "m/shared.webm" });
    session(e, "theirs", 120, { mediaPath: "m/shared.webm" }, "other");
    const r = run(e, ["--execute"]);
    assert.ok(existsSync(join(e.media, "m", "shared.webm")));
    assert.equal(r.unlinked.length, 0);
  } finally { e.done(); }
});

test("missing or malformed capture time is kept; unknown flags and a repeated --execute are usage errors", () => {
  const e = env();
  try {
    const dir = session(e, "nocap", 300);
    const f = join(dir, "source.json");
    const src = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
    delete src.createdAt;
    writeFileSync(f, JSON.stringify(src));
    const r = run(e, ["--execute"]);
    assert.ok(existsSync(mediaFile(e, "nocap")));
    assert.match(r.out, /capture-time-unknown/);
    assert.equal(run(e, ["--execute", "--execute"]).code, 2);
    assert.equal(run(e, ["--force"]).code, 2);
    assert.equal(run(e, ["--execute", "--delete-all"]).code, 2);
    assert.ok(existsSync(emptyOps()));
    mkdirSync(join(e.media, "x"), { recursive: true });
  } finally { e.done(); }
});
