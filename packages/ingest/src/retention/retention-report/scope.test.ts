import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { tenantSegment } from "../retention-report-state.js";
import { DAY, NOW, baseArgs, emptyOps, iso, runCmd, snapshot, tempRoot, writeSession } from "../retention-report.fixtures.js";
import { block, guardOf, line, unverified, verdict } from "./helpers.js";

function withRoots(fn: (root: string, media: string, scratch: string) => void): void {
  const root = tempRoot(), media = tempRoot(), scratch = mkdtempSync(join(tmpdir(), "t046dry-scope-"));
  try { fn(root, media, scratch); } finally { for (const d of [root, media, scratch]) rmSync(d, { recursive: true, force: true }); }
}
const old = { processedAt: iso(30 * DAY) };
const noEligible = (out: string): void => assert.doesNotMatch(out, /=> ELIGIBLE/);
const opsWith = (dir: string, operations: unknown): string => { const f = join(dir, "operations.json"); writeFileSync(f, JSON.stringify({ operations })); return f; };

// ISS-T046DRY-006 recorded fixtures (qa/issues.t046dry.jsonl), verbatim: (1) good + trunc, trunc's source.json truncated, both pointing at m/s.webm (100 B,
// mtime now-30d, processedAt now-30d); (2) the sibling session directory is named "bad name" (space).
test("ISS-T046DRY-006 recorded fixtures: 2/2 - nothing is ELIGIBLE and the header lists what was not understood", () => {
  let n = 0;
  withRoots((root, media) => {
    writeSession(root, media, { name: "good", ...old, mediaPath: "m/s.webm", mediaBytes: 100 });
    writeSession(root, media, { name: "trunc", ...old, mediaPath: "m/s.webm", mediaBytes: 100, raw: { "source.json": '{"_id":"trunc-src","tenantId":"toc","kind":"rec' } });
    const r = runCmd(baseArgs(root, media));
    noEligible(r.out);
    assert.deepEqual([verdict(r.out, "good"), guardOf(r.out, "good")], ["KEEP", "scope-incomplete"]);
    assert.match(r.out, /^!! SCOPE INCOMPLETE: 1 entry /m);
    assert.match(r.out, new RegExp(`^  not understood: ${tenantSegment("toc")}/trunc - unreadable record \\(source\\.json: not valid JSON`, "m"));
    assert.match(line(r.out, "eligible"), /0 recording\(s\) = 0 file\(s\), 0 B/);
    n++;
  });
  withRoots((root, media) => {
    writeSession(root, media, { name: "good", ...old, mediaPath: "m/s.webm", mediaBytes: 100 });
    writeSession(root, media, { name: "bad name", ...old, mediaPath: "m/s.webm", mediaBytes: 100 });
    const r = runCmd(baseArgs(root, media));
    noEligible(r.out);
    assert.equal(guardOf(r.out, "good"), "scope-incomplete");
    assert.match(r.out, new RegExp(`^  not understood: ${tenantSegment("toc")}/bad name - directory name not accepted`, "m"));
    assert.match(r.out, /entries not understood: 1/);
    n++;
  });
  assert.equal(n, 2);
});

test("every kind of entry the scan cannot turn into a record is counted and listed (name, stray file, hostile name), and the list is sanitised", () => withRoots((root, media) => {
  writeSession(root, media, { name: "fine", ...old });
  const dir = join(root, tenantSegment("toc"));
  mkdirSync(join(dir, ".hidden"));
  mkdirSync(join(dir, "x‮y"));
  writeFileSync(join(dir, "stray.txt"), "x");
  const r = runCmd(baseArgs(root, media));
  noEligible(r.out);
  assert.match(r.out, /entries not understood: 3/);
  assert.match(r.out, /not understood: \S+\/\.hidden - directory name not accepted/);
  assert.match(r.out, /stray\.txt - not a plain session directory/);
  assert.doesNotMatch(r.out, /‮/);
}));

test("real ACL deny on a session's source.json makes it unreadable: nothing is ELIGIBLE (icacls restored in a finally)", { skip: process.platform !== "win32" }, () => withRoots((root, media) => {
  writeSession(root, media, { name: "ok", ...old, mediaPath: "m/s.webm" });
  const dir = writeSession(root, media, { name: "locked", ...old, mediaPath: "m/s.webm" });
  const file = join(dir, "source.json");
  const user = `${process.env.USERDOMAIN ?? ""}\\${userInfo().username}`.replace(/^\\/, "");
  const icacls = (...a: string[]): void => { execFileSync("icacls", a, { stdio: "pipe" }); };
  try {
    icacls(file, "/inheritance:r"); icacls(file, "/deny", `${user}:(F)`);
    const r = runCmd(baseArgs(root, media));
    assert.equal(r.code, 0, r.err);
    noEligible(r.out);
    assert.match(r.out, /not understood: \S+\/locked - unreadable record \(source\.json: unreadable/);
  } finally { try { icacls(file, "/remove:d", user); icacls(file, "/reset"); } catch { /* best effort */ } }
}));

// ISS-T046DRY-008 recorded fixture: session stuck, processedAt now-60d, media mtime now-70d, 10 B, valid claims; run (a) without --operations-state,
// then with a missing file and with malformed JSON.
test("ISS-T046DRY-008 recorded fixtures: 3/3 - omitted option is a usage error; missing and malformed files leave nothing ELIGIBLE at 70 days", () => withRoots((root, media, scratch) => {
  writeSession(root, media, { name: "stuck", processedAt: iso(60 * DAY), mediaPath: "m/stuck.webm", mediaBytes: 10, mediaMtimeMs: NOW - 70 * DAY });
  let n = 0;
  const noOps = baseArgs(root, media);
  noOps.splice(noOps.indexOf("--operations-state"), 2);
  const omitted = runCmd(noOps);
  assert.equal(omitted.code, 2); assert.equal(omitted.out, ""); assert.match(omitted.err, /--operations-state is required/); n++;
  writeFileSync(join(scratch, "bad.json"), "{nope");
  for (const f of [join(scratch, "missing.json"), join(scratch, "bad.json")]) {
    const r = runCmd(baseArgs(root, media, ["--operations-state", f]));
    assert.equal(r.code, 0, r.err);
    noEligible(r.out);
    assert.deepEqual([verdict(r.out, "stuck"), guardOf(r.out, "stuck")], ["KEEP", "operation-state-unavailable"]);
    assert.match(r.out, /^!! PIPELINE STATE UNAVAILABLE .*No recording is reported ELIGIBLE/m);
    n++;
  }
  assert.equal(n, 3);
  // with the state present, the ledger's row keeps the same recording
  const withRow = runCmd(baseArgs(root, media, ["--operations-state", opsWith(scratch, { stuck: { status: "processing" } })]));
  assert.deepEqual([verdict(withRow.out, "stuck"), guardOf(withRow.out, "stuck")], ["KEEP", "operation-in-progress"]);
}));

// ISS-T046DRY-007 recorded fixture: tenants toc and other; toc/mine path m/s.webm all valid; other/theirs the same path with one needs-review claim.
test("ISS-T046DRY-007 recorded fixture: 1/1 - a file also referenced by another tenant is KEEP shared-across-tenants and discloses nothing of that tenant", () => withRoots((root, media) => {
  writeSession(root, media, { name: "mine", ...old, mediaPath: "m/s.webm", mediaBytes: 100 });
  writeSession(root, media, { tenant: "other", name: "theirs", title: "SECRET-TITLE-OF-OTHER", ...old, mediaPath: "m/s.webm", mediaBytes: 100, claims: unverified("theirs") });
  const r = runCmd(baseArgs(root, media));
  assert.deepEqual([verdict(r.out, "mine"), guardOf(r.out, "mine")], ["KEEP", "shared-across-tenants"]);
  assert.match(block(r.out, "mine"), /guard: shared-across-tenants - shared; the planner alone said purge-eligible/);
  assert.doesNotMatch(r.out, /theirs|SECRET|OTHER-TENANT-NAME/);
  assert.doesNotMatch(r.out, new RegExp(tenantSegment("other")));
  noEligible(r.out);
}));

test("cross-tenant pass: a different file of another tenant does not matter; a sibling that cannot be read refuses everything; hard links are caught", () => withRoots((root, media) => {
  writeSession(root, media, { name: "mine", ...old, mediaPath: "m/a.webm" });
  writeSession(root, media, { tenant: "other", name: "theirs", ...old, mediaPath: "m/b.webm" });
  assert.equal(verdict(runCmd(baseArgs(root, media)).out, "mine"), "ELIGIBLE");
  writeSession(root, media, { tenant: "third", name: "broken", ...old, raw: { "source.json": "{" } });
  const r = runCmd(baseArgs(root, media));
  noEligible(r.out);
  assert.match(r.out, /a sibling tenant directory could not be scanned/);
  assert.doesNotMatch(r.out, new RegExp(tenantSegment("third")));
}));

test("future-evidence filter: one record dated 2099 must not hide a clock 5 years ahead (the cycle-2 surviving mutant)", () => withRoots((root, media) => {
  writeSession(root, media, { name: "normal", processedAt: iso(DAY + 30 * 60_000), mediaMtimeMs: NOW - DAY - 1000 });
  writeSession(root, media, { name: "future", ...old, mediaMtimeMs: Date.parse("2099-01-01T00:00:00Z") });
  const r = runCmd(baseArgs(root, media), NOW + 5 * 365 * DAY);
  assert.match(r.out, /^!! CLOCK UNCONFIRMED/m);
  noEligible(r.out);
}));

test("positive control: a clean scope, state present, everything terminal still produces ELIGIBLE verdicts", () => withRoots((root, media, scratch) => {
  writeSession(root, media, { name: "a", ...old, mediaPath: "f/1.webm", mediaBytes: 100 });
  writeSession(root, media, { name: "b", ...old, mediaPath: "f/./1.webm", mediaBytes: 100 });
  writeSession(root, media, { name: "c", ...old, mediaPath: "f/3.webm", mediaBytes: 200 });
  writeSession(root, media, { tenant: "other", name: "o", ...old, mediaPath: "f/other.webm" });
  const ops = opsWith(scratch, { a: { status: "ready" }, c: { status: "ready" } });
  const before = [snapshot(root), snapshot(media)];
  const r = runCmd(baseArgs(root, media, ["--operations-state", ops]));
  assert.deepEqual(["a", "b", "c"].map((x) => verdict(r.out, x)), ["ELIGIBLE", "ELIGIBLE", "ELIGIBLE"]);
  assert.match(line(r.out, "eligible"), /3 recording\(s\) = 2 file\(s\), 300 B/);
  assert.doesNotMatch(r.out, /SCOPE INCOMPLETE|PIPELINE STATE UNAVAILABLE|CLOCK/);
  assert.match(r.out, /entries not understood: 0/);
  assert.deepEqual([snapshot(root), snapshot(media)], before, "byte-identical tree after the run");
  assert.ok(emptyOps().length > 0);
}));
