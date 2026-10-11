import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { REAL_IO, type MediaIo } from "../retention-report-media.js";
import { DAY, NOW, baseArgs, iso, runCmd, snapshot, tempRoot, writeSession } from "../retention-report.fixtures.js";
import { block, guardOf, line, runIo, verdict } from "./helpers.js";

function withRoots(fn: (root: string, media: string, scratch: string) => void): void {
  const root = tempRoot(), media = tempRoot(), scratch = mkdtempSync(join(tmpdir(), "t046dry-sig-"));
  try { fn(root, media, scratch); } finally { for (const d of [root, media, scratch]) rmSync(d, { recursive: true, force: true }); }
}
const old = { processedAt: iso(30 * DAY) };
const opsFile = (dir: string, operations: unknown): string => { const f = join(dir, "operations.json"); writeFileSync(f, JSON.stringify({ version: 1, operations })); return f; };
const args = (root: string, media: string, ops: string | null, extra: string[] = []): string[] => {
  const a = baseArgs(root, media, [...(ops ? ["--operations-state", ops] : []), ...extra]);
  if (ops) return a;
  const i = a.indexOf("--operations-state"); // null = no --operations-state option at all
  return [...a.slice(0, i), ...a.slice(i + 2)];
};
const HOUR = 3_600_000;

// ISS-T046DRY-005 recorded fixtures: (1) ACL deny on the media FILE (everything else valid) was ELIGIBLE; (2) the same deny on the parent directory was already KEEP.
test("ISS-T046DRY-005 recorded fixtures: 2/2 - an ACL-denied file and an ACL-denied directory are KEEP media-unreadable (icacls restored before cleanup)", { skip: process.platform !== "win32" }, () => withRoots((root, media) => {
  writeSession(root, media, { name: "acl", ...old, mediaPath: "m/acl.webm", mediaBytes: 100 });
  writeSession(root, media, { name: "dacl", ...old, mediaPath: "d/inner.webm", mediaBytes: 100 });
  const user = `${process.env.USERDOMAIN ?? ""}\\${userInfo().username}`.replace(/^\\/, "");
  const file = join(media, "m", "acl.webm"), dir = join(media, "d");
  const icacls = (...a: string[]): void => { execFileSync("icacls", a, { stdio: "pipe" }); };
  try {
    icacls(file, "/inheritance:r"); icacls(file, "/deny", `${user}:(F)`);
    icacls(dir, "/inheritance:r"); icacls(dir, "/deny", `${user}:(F)`);
    const r = runCmd(baseArgs(root, media));
    assert.equal(r.code, 0, r.err);
    assert.deepEqual([verdict(r.out, "acl"), guardOf(r.out, "acl")], ["KEEP", "media-unreadable"]);
    assert.deepEqual([verdict(r.out, "dacl"), guardOf(r.out, "dacl")], ["KEEP", "media-unreadable"]);
    assert.match(block(r.out, "acl"), /\(not assessable\)/);
  } finally {
    for (const p of [file, dir]) { try { icacls(p, "/remove:d", user); icacls(p, "/reset"); } catch { /* best effort; the next line proves it */ } }
  }
}));

test("readability probe through the injected fs seam: a busy/denied open keeps; the probe only ever opens read-only and closes", () => withRoots((root, media) => {
  writeSession(root, media, { name: "free", ...old, mediaPath: "m/free.webm", mediaBytes: 9000 });
  for (const e of ["EBUSY", "EPERM", "EACCES"]) writeSession(root, media, { name: `lock-${e}`, ...old, mediaPath: `m/${e}.webm` });
  const opened: Array<[string, unknown]> = [];
  let open = 0;
  const io: MediaIo = {
    ...REAL_IO,
    openSync: (p, flag) => {
      const hit = /(EBUSY|EPERM|EACCES)\.webm$/.exec(p);
      if (hit) throw Object.assign(new Error("simulated sharing violation"), { code: hit[1] });
      opened.push([p, flag]); open++;
      return REAL_IO.openSync(p, flag);
    },
    closeSync: (fd) => { open--; REAL_IO.closeSync(fd); },
  };
  const r = runIo(baseArgs(root, media), io);
  assert.deepEqual([verdict(r.out, "free"), ...["EBUSY", "EPERM", "EACCES"].map((e) => `${verdict(r.out, `lock-${e}`)}/${guardOf(r.out, `lock-${e}`)}`)],
    ["ELIGIBLE", "KEEP/media-unreadable", "KEEP/media-unreadable", "KEEP/media-unreadable"]);
  assert.ok(opened.length > 0 && opened.every(([, f]) => f === "r"), "every open is the literal read-only flag");
  assert.equal(open, 0, "every opened handle is closed");
  // (the real Windows sharing-violation path - a writer holding the file exclusively - is NOT exercised: Node cannot take a deny-sharing handle)
}));

test("pipeline operation rows: every non-terminal or unknown status keeps; only ready and cancelled do not; match by session id, source id and artifact path", () => withRoots((root, media, scratch) => {
  const statuses: Array<[string, unknown]> = [
    ["s-recording", "recording"], ["s-processing", "processing"], ["s-queued", "queued"], ["s-failed", "failed"], ["s-action", "action_required"],
    ["s-unknown", "weird-new-status"], ["s-upper", "READY"], ["s-empty", ""], ["s-number", 42], ["s-missing", undefined],
    ["s-ready", "ready"], ["s-cancelled", "cancelled"],
  ];
  const rows: Record<string, unknown> = {};
  for (const [name, status] of statuses) {
    writeSession(root, media, { name, ...old, mediaPath: `m/${name}.webm` });
    rows[name] = status === undefined ? { tenantId: "toc" } : { status, tenantId: "toc" };
  }
  const r = runCmd(args(root, media, opsFile(scratch, rows)));
  assert.equal(r.code, 0, r.err);
  for (const [name, status] of statuses) {
    const done = status === "ready" || status === "cancelled";
    assert.deepEqual([verdict(r.out, name), guardOf(r.out, name)], done ? ["ELIGIBLE", "none"] : ["KEEP", "operation-in-progress"], `${name}=${String(status)}`);
  }
  // matched by source id (not session name) and by artifact path (a different spelling of the file's path)
  writeSession(root, media, { name: "by-src", ...old, mediaPath: "m/by-src.webm" });
  writeSession(root, media, { name: "by-art", ...old, mediaPath: "m/by-art.webm" });
  writeSession(root, media, { name: "free", ...old, mediaPath: "m/free.webm" });
  const file = opsFile(scratch, { "BY-SRC-SRC": { status: "recording" }, other: { status: "processing", artifact: join(media, "M", ".", "BY-ART.WEBM") }, bad: "not-an-object" });
  const r2 = runCmd(args(root, media, file));
  assert.deepEqual(["by-src", "by-art", "free"].map((x) => verdict(r2.out, x)), ["KEEP", "KEEP", "ELIGIBLE"]);
  assert.equal(guardOf(r2.out, "by-src"), "operation-in-progress");
  assert.equal(guardOf(r2.out, "by-art"), "operation-in-progress");
}));

test("operations state is REQUIRED; missing, unreadable or malformed means nothing is ELIGIBLE at any age (ISS-T046DRY-008)", () => withRoots((root, media, scratch) => {
  const day = (d: number) => NOW - d * DAY;
  writeSession(root, media, { name: "m29", processedAt: iso(29 * DAY), mediaMtimeMs: day(29) });
  writeSession(root, media, { name: "m30", ...old, mediaMtimeMs: day(30) });
  writeSession(root, media, { name: "m31", processedAt: iso(31 * DAY), mediaMtimeMs: day(31) });
  mkdirSync(join(scratch, "adir"));
  writeFileSync(join(scratch, "bad.json"), "{nope"); writeFileSync(join(scratch, "noops.json"), "{\"version\":1}");
  const omitted = runCmd(args(root, media, null));
  assert.equal(omitted.code, 2);
  assert.equal(omitted.out, "");
  assert.match(omitted.err, /--operations-state is required/);
  for (const ops of [join(scratch, "does-not-exist.json"), join(scratch, "adir"), join(scratch, "bad.json"), join(scratch, "noops.json")]) {
    const r = runCmd(args(root, media, ops));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^!! PIPELINE STATE UNAVAILABLE \(/m, String(ops));
    assert.deepEqual([verdict(r.out, "m29"), guardOf(r.out, "m29")], ["KEEP", "operation-state-unavailable"]);
    assert.deepEqual([verdict(r.out, "m30"), guardOf(r.out, "m30")], ["KEEP", "operation-state-unavailable"]);
    assert.deepEqual([verdict(r.out, "m31"), guardOf(r.out, "m31")], ["KEEP", "operation-state-unavailable"]);
    assert.doesNotMatch(r.out, /=> ELIGIBLE/);
    assert.match(block(r.out, "m29"), /operation-state-unavailable \(not assessable\)/);
  }
  const ok = runCmd(args(root, media, opsFile(scratch, {})));
  assert.doesNotMatch(ok.out, /PIPELINE STATE UNAVAILABLE/);
  assert.equal(verdict(ok.out, "m29"), "ELIGIBLE");
}));

test("mtime quiet period: exactly at the boundary is KEEP; 1 ms past is eligible (fresh processedAt keeps the other guards out of the way)", () => withRoots((root, media, scratch) => {
  const fresh = { processedAt: iso(2 * HOUR) };
  writeSession(root, media, { name: "exact", ...fresh, mediaMtimeMs: NOW - 24 * HOUR });
  writeSession(root, media, { name: "past", ...fresh, mediaMtimeMs: NOW - 24 * HOUR - 1 });
  const a = args(root, media, opsFile(scratch, {}), []);
  a[a.indexOf("--min-age-days") + 1] = "0.01";
  const r = runCmd(a);
  assert.deepEqual([verdict(r.out, "exact"), guardOf(r.out, "exact"), verdict(r.out, "past")], ["KEEP", "recently-modified", "ELIGIBLE"]);
}));

// ISS-T046DRY-004 recorded fixture: processedAt now-(1d+30m), media mtime now-1d, no recorded size, --min-age-days 7 not met at real time;
// run with the injected clock = real + 5 years. The ledger found no ISO instant in the output and an ELIGIBLE verdict.
test("ISS-T046DRY-004 recorded fixture: 2/2 - the report prints the as-of instant, and a clock 5 years ahead yields no ELIGIBLE", () => withRoots((root, media, scratch) => {
  writeSession(root, media, { name: "q", processedAt: iso(DAY + 30 * 60_000), mediaMtimeMs: NOW - DAY - 1000 });
  const ahead = NOW + 5 * 365 * DAY;
  const a = args(root, media, opsFile(scratch, {}));
  const r = runCmd(a, ahead);
  let n = 0;
  assert.match(r.out, /^as of: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \(UTC, the system clock\)/m); n++;
  assert.doesNotMatch(r.out, /=> ELIGIBLE/);
  assert.match(r.out, /^!! CLOCK UNCONFIRMED/m);
  assert.deepEqual([verdict(r.out, "q"), guardOf(r.out, "q")], ["KEEP", "clock-unconfirmed"]); n++;
  assert.equal(n, 2);
}));

test("clock rule: horizon 90 days, --as-of must match within 24 h, a mismatch refuses even inside the horizon, a behind clock is caught per record", () => withRoots((root, media, scratch) => {
  writeSession(root, media, { name: "c", ...old, mediaMtimeMs: NOW - 30 * DAY });
  const base = args(root, media, opsFile(scratch, {}));
  const at = (days: number, extra: string[] = []) => runCmd([...base, ...extra], NOW + days * DAY);
  assert.equal(verdict(at(60).out, "c"), "ELIGIBLE");                 // newest activity 30 d old, clock 90 d after: at the horizon
  assert.equal(verdict(at(60 + 1 / 24).out, "c"), "KEEP");           // 1 h past the horizon, no confirmation
  const far = NOW + 400 * DAY;
  assert.equal(verdict(at(400, ["--as-of", new Date(far).toISOString()]).out, "c"), "ELIGIBLE"); // operator confirms the date
  assert.match(at(400, ["--as-of", new Date(far).toISOString()]).out, /operator confirmed/);
  const wrong = at(400, ["--as-of", new Date(NOW).toISOString()]);
  assert.match(wrong.out, /^!! CLOCK MISMATCH/m);
  assert.equal(verdict(wrong.out, "c"), "KEEP");
  assert.match(at(0, ["--as-of", new Date(NOW + 25 * HOUR).toISOString()]).out, /^!! CLOCK MISMATCH/m);
  assert.equal(verdict(at(0, ["--as-of", new Date(NOW + 23 * HOUR).toISOString()]).out, "c"), "ELIGIBLE");
  assert.equal(runCmd([...base, "--as-of", "yesterday"]).code, 2);
  assert.equal(runCmd([...base, "--as-of", "2026-10-11"]).code, 2);
  // a clock BEHIND the data stays caught by the per-record skew guard
  writeSession(root, media, { name: "fut", ...old, mediaMtimeMs: NOW + 9 * DAY });
  assert.equal(guardOf(runCmd(base).out, "fut"), "clock-skew");
}));

test("header and totals wording: ELIGIBLE is defined and its limits are stated; no-write holds", () => withRoots((root, media, scratch) => {
  writeSession(root, media, { name: "w", ...old });
  const before = [snapshot(root), snapshot(media)];
  const r = runCmd(args(root, media, opsFile(scratch, {})));
  assert.match(r.out, /ELIGIBLE means only: the existing planner said purge-eligible/);
  assert.match(r.out, /ELIGIBLE does not mean: safe to delete\./);
  assert.match(r.out, /no executor exists/);
  for (const label of ["eligible", "kept by policy", "kept by guard", "not assessable"]) assert.ok(line(r.out, label), label);
  assert.ok(Math.max(...r.out.split("\n").map((l) => l.length)) < 400);
  assert.deepEqual([snapshot(root), snapshot(media)], before);
}));
