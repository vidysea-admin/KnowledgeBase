import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AFTER_PROCESSED_MS, CLOCK_SKEW_MS, QUIET_PERIOD_MS } from "./retention-report-guards.js";
import { DAY, NOW, baseArgs, iso, runCmd, snapshot, tempRoot, writeSession, type SessionSpec } from "./retention-report.fixtures.js";

function withRoots(fn: (root: string, media: string) => void): void {
  const root = tempRoot();
  const media = tempRoot();
  try { fn(root, media); } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
}
type Spec = Omit<SessionSpec, "name">;
const old = { processedAt: iso(30 * DAY) };
const block = (out: string, id: string): string => out.split("RECORDING ").find((b) => b.startsWith(`${id}-src`)) ?? "";
const verdict = (out: string, id: string): string => /=> (ELIGIBLE|KEEP)/.exec(block(out, id))?.[1] ?? "absent";
const guardOf = (out: string, id: string): string => /guard: ([a-z-]+)/.exec(block(out, id))?.[1] ?? "none";

/** One session per case, run once, returns [verdict, guard code] per case. */
function runCases(cases: Record<string, Spec>, minAge = "7"): Record<string, [string, string]> {
  const res: Record<string, [string, string]> = {};
  withRoots((root, media) => {
    for (const [name, spec] of Object.entries(cases)) writeSession(root, media, { name, ...old, ...spec });
    const args = baseArgs(root, media);
    args[args.indexOf("--min-age-days") + 1] = minAge;
    const r = runCmd(args);
    assert.equal(r.code, 0, r.err);
    for (const name of Object.keys(cases)) res[name] = [verdict(r.out, name), guardOf(r.out, name)];
  });
  return res;
}

// ISS-T046DRY-001 recorded fixtures, verbatim from qa/issues.t046dry.jsonl (1: media mtime now-5000ms, processedAt now-30d, 10 bytes;
// 2: media mtime now+9 days). The ledger's clock was the real clock; here `now` is injected.
test("ISS-T046DRY-001 recorded fixtures: 2/2 now KEEP with the right reason", () => {
  const r = runCases({
    justwritten: { mediaPath: "justwritten.webm", mediaBytes: 10, mediaMtimeMs: NOW - 5000 },
    "future-mtime": { mediaPath: "future-mtime.webm", mediaBytes: 10, mediaMtimeMs: NOW + 9 * DAY },
  });
  assert.deepEqual(r.justwritten, ["KEEP", "recently-modified"]);
  assert.deepEqual(r["future-mtime"], ["KEEP", "clock-skew"]);
});

// ISS-T046DRY-002 recorded fixtures: e-nomedia (file absent), source path ..\..\outside.webm, source path C:\Windows\win.ini, no --media-root.
test("ISS-T046DRY-002 recorded fixtures: 4/4 now KEEP (3 through the report, 1 refused as a usage error)", () => {
  let n = 0;
  const r = runCases({
    "e-nomedia": { mediaPath: "e-nomedia.webm", createMedia: false },
    "esc-bs": { mediaPath: "..\\..\\outside.webm" },
    "abs-win": { mediaPath: "C:\\Windows\\win.ini" },
  });
  assert.deepEqual(r["e-nomedia"], ["KEEP", "media-not-found"]); n++;
  assert.deepEqual(r["esc-bs"], ["KEEP", "media-path-outside-root"]); n++;
  assert.deepEqual(r["abs-win"], ["KEEP", "media-path-outside-root"]); n++;
  withRoots((root, media) => {
    writeSession(root, media, { name: "nomr", ...old });
    const noRoot = runCmd(["--tenant", "toc", "--data-root", root, "--min-age-days", "7", "--clip-padding-seconds", "15"]);
    assert.equal(noRoot.code, 2);
    assert.equal(noRoot.out, "", "no report, so no ELIGIBLE line, without --media-root");
    assert.match(noRoot.err, /--media-root is required/);
    n++;
  });
  assert.equal(n, 4);
});

test("path evidence: ../ and absolute and UNC and drive-relative stored paths, a junction out of the root, a directory in place of the file", () => withRoots((root, media) => {
  const outside = tempRoot();
  try {
    writeFileSync(join(outside, "secret.webm"), "x");
    symlinkSync(outside, join(media, "link"), "junction");
    const cases: Record<string, Spec> = {
      dots: { mediaPath: "../outside.webm" }, "dots-fwd": { mediaPath: "a/../../outside.webm" }, abs: { mediaPath: "/etc/passwd" },
      unc: { mediaPath: "\\\\host\\share\\x.webm" }, drive: { mediaPath: "D:rel.webm" }, nul: { mediaPath: "a\0b.webm" },
      jct: { mediaPath: "link/secret.webm", createMedia: false },
    };
    for (const [name, spec] of Object.entries(cases)) writeSession(root, media, { name, ...old, ...spec });
    writeSession(root, media, { name: "dir", ...old, mediaPath: "adir", createMedia: false });
    mkdirSync(join(media, "adir"));
    writeSession(root, media, { name: "none", ...old, mediaPath: null });
    const r = runCmd(baseArgs(root, media));
    assert.equal(r.code, 0, r.err);
    for (const name of Object.keys(cases)) assert.deepEqual([verdict(r.out, name), guardOf(r.out, name)], ["KEEP", "media-path-outside-root"], name);
    assert.deepEqual([verdict(r.out, "dir"), guardOf(r.out, "dir")], ["KEEP", "media-unreadable"]);
    assert.deepEqual([verdict(r.out, "none"), guardOf(r.out, "none")], ["KEEP", "media-not-found"]);
    assert.doesNotMatch(r.out, /secret\.webm\s+size: 1 B/);
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));

test("--media-root is required and must be an existing directory", () => withRoots((root, media) => {
  writeSession(root, media, { name: "x", ...old });
  const r = runCmd(["--tenant", "toc", "--data-root", root, "--min-age-days", "7", "--clip-padding-seconds", "15"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /--media-root is required/);
  const gone = runCmd(baseArgs(root, join(media, "nope")));
  assert.equal(gone.code, 3);
  assert.equal(gone.out, "");
}));

// min-age 0.01 d (about 14 min) with processedAt 2 h ago keeps the after-processed guard out of the way, so only the quiet period and skew are measured.
test("quiet period boundary: exactly at it is eligible, 1 s inside is KEEP; clock skew boundary", () => {
  const fresh = { processedAt: iso(2 * 3_600_000) };
  const r = runCases({
    "q-5s": { ...fresh, mediaMtimeMs: NOW - 5000 },
    "q-just-inside": { ...fresh, mediaMtimeMs: NOW - QUIET_PERIOD_MS + 1000 },
    "q-exact": { ...fresh, mediaMtimeMs: NOW - QUIET_PERIOD_MS },
    "q-just-past": { ...fresh, mediaMtimeMs: NOW - QUIET_PERIOD_MS - 1000 },
    "f-1min": { ...fresh, mediaMtimeMs: NOW + 60_000 },
    "f-edge": { ...fresh, mediaMtimeMs: NOW + CLOCK_SKEW_MS },
    "f-over": { ...fresh, mediaMtimeMs: NOW + CLOCK_SKEW_MS + 1000 },
    "f-year": { ...fresh, mediaMtimeMs: NOW + 365 * DAY },
  }, "0.01");
  assert.deepEqual(r["q-5s"], ["KEEP", "recently-modified"]);
  assert.deepEqual(r["q-just-inside"], ["KEEP", "recently-modified"]);
  assert.deepEqual(r["q-exact"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["q-just-past"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["f-1min"], ["KEEP", "recently-modified"]);
  assert.deepEqual(r["f-edge"], ["KEEP", "recently-modified"]);
  assert.deepEqual(r["f-over"], ["KEEP", "clock-skew"]);
  assert.deepEqual(r["f-year"], ["KEEP", "clock-skew"]);
});

test("a file changed after the state says it was processed is KEEP (boundary at 1 h)", () => {
  const p = NOW - 10 * DAY;
  const r = runCases({
    "p-ok": { processedAt: iso(10 * DAY), mediaMtimeMs: p },
    "p-edge": { processedAt: iso(10 * DAY), mediaMtimeMs: p + AFTER_PROCESSED_MS },
    "p-over": { processedAt: iso(10 * DAY), mediaMtimeMs: p + AFTER_PROCESSED_MS + 1000 },
    "p-days": { processedAt: iso(10 * DAY), mediaMtimeMs: NOW - 5 * DAY },
  });
  assert.deepEqual(r["p-ok"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["p-edge"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["p-over"], ["KEEP", "media-modified-after-processed"]);
  assert.deepEqual(r["p-days"], ["KEEP", "media-modified-after-processed"]);
});

test("size recorded in source.json must match the stat'd size within 1%; the mismatch is printed, not hidden", () => {
  const r = runCases({
    "z-same": { mediaBytes: 100, recordedBytes: 100 },
    "z-edge": { mediaBytes: 1010, recordedBytes: 1000 },
    "z-over": { mediaBytes: 1011, recordedBytes: 1000 },
    "z-big": { mediaBytes: 10, recordedBytes: 5_000_000 },
    "z-none": { mediaBytes: 10 },
  });
  assert.deepEqual(r["z-same"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["z-edge"], ["ELIGIBLE", "none"]);
  assert.deepEqual(r["z-over"], ["KEEP", "size-mismatch"]);
  assert.deepEqual(r["z-big"], ["KEEP", "size-mismatch"]);
  assert.deepEqual(r["z-none"], ["ELIGIBLE", "none"]);
  withRoots((root, media) => {
    writeSession(root, media, { name: "z", ...old, mediaBytes: 10, recordedBytes: 5_000_000 });
    assert.match(runCmd(baseArgs(root, media)).out, /guard: size-mismatch \(not assessable\) - state records 5000000 B but the file is 10 B/);
  });
});

test("totals, hand-computed: eligible, kept by policy, and the separate not-assessable line", () => withRoots((root, media) => {
  writeSession(root, media, { name: "a", ...old, mediaBytes: 100 });                                            // eligible 100
  writeSession(root, media, { name: "b", ...old, mediaBytes: 50 });                                             // eligible 50
  writeSession(root, media, { name: "c", ...old, mediaBytes: 40,                                                // kept by policy 40
    claims: [{ _id: "c1", tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: "c-t1", sessionId: "c" }] }] });
  writeSession(root, media, { name: "d", ...old, createMedia: false });                                         // not assessable, size unknown
  writeSession(root, media, { name: "e", ...old, mediaBytes: 30, mediaMtimeMs: NOW - 1000 });                   // kept by guard (recently-modified) 30
  writeSession(root, media, { name: "f", ...old, mediaBytes: 20, recordedBytes: 500 });                         // not assessable 20 B known
  writeSession(root, media, { name: "g", ...old, mediaPath: "../g.webm" });                                     // not assessable, size unknown
  const out = runCmd(baseArgs(root, media)).out;
  assert.match(out, /TOTALS eligible: 2 recording\(s\), 150 B \| kept: 2 recording\(s\), 70 B \| size unknown for 2 \(not counted in bytes\)/);
  assert.match(out, /^not assessable: 3 recording\(s\), 20 B known/m);
  assert.equal(guardOf(out, "e"), "recently-modified");
  assert.doesNotMatch(block(out, "e"), /\(not assessable\)/);
  assert.match(block(out, "d"), /guard: media-not-found \(not assessable\)/);
}));

test("the temp trees are byte-identical, mtimes included, after guard runs", () => withRoots((root, media) => {
  for (const [name, spec] of Object.entries<Spec>({
    a: {}, b: { mediaMtimeMs: NOW - 5000 }, c: { mediaMtimeMs: NOW + 9 * DAY }, d: { createMedia: false }, e: { mediaPath: "..\\..\\o.webm" }, f: { recordedBytes: 9999 },
  })) writeSession(root, media, { name, ...old, ...spec });
  const before = [snapshot(root), snapshot(media)];
  for (let i = 0; i < 3; i++) assert.equal(runCmd(baseArgs(root, media)).code, 0);
  assert.deepEqual([snapshot(root), snapshot(media)], before);
}));
