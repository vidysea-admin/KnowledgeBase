import assert from "node:assert/strict";
import { linkSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { MediaIo } from "../retention-report-media.js";
import { DAY, NOW, baseArgs, iso, runCmd, snapshot, tempRoot, writeSession, type Ran } from "../retention-report.fixtures.js";

function withRoots(fn: (root: string, media: string) => void): void {
  const root = tempRoot();
  const media = tempRoot();
  try { fn(root, media); } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
}
const old = { processedAt: iso(30 * DAY) };
import { block, guardOf, line, noInode, runIo, unverified, verdict } from "./helpers.js";
const run = (root: string, media: string, io?: MediaIo): Ran => (io ? runIo(baseArgs(root, media), io) : runCmd(baseArgs(root, media)));

// ISS-T046DRY-003 recorded fixtures (qa/issues.t046dry.jsonl), verbatim: (1) dupA + dupB share m/shared.webm (100 B, mtime now-30d,
// processedAt now-30d), dupB has one needs-review claim; (2) A,B,C with m/shared.webm, m/./shared.webm, M/SHARED.WEBM (one file on Windows).
test("ISS-T046DRY-003 recorded fixtures: 2/2 - fixture 1 both KEEP and nothing counted eligible; fixture 2 one file, 100 B once", () => {
  let n = 0;
  withRoots((root, media) => {
    writeSession(root, media, { name: "dupA", ...old, mediaPath: "m/shared.webm", mediaBytes: 100 });
    writeSession(root, media, { name: "dupB", ...old, mediaPath: "m/shared.webm", mediaBytes: 100, claims: unverified("dupB") });
    const r = run(root, media);
    assert.deepEqual([verdict(r.out, "dupA"), guardOf(r.out, "dupA")], ["KEEP", "shared-media-not-all-eligible"]);
    assert.deepEqual([verdict(r.out, "dupB"), guardOf(r.out, "dupB")], ["KEEP", "none"]);
    assert.match(line(r.out, "eligible"), /0 recording\(s\) = 0 file\(s\), 0 B/);
    assert.match(block(r.out, "dupA"), /2 session record\(s\) reference this one physical file/);
    n++;
  });
  withRoots((root, media) => {
    writeSession(root, media, { name: "A", ...old, mediaPath: "m/shared.webm", mediaBytes: 100 });
    writeSession(root, media, { name: "B", ...old, mediaPath: "m/./shared.webm", mediaBytes: 100 });
    writeSession(root, media, { name: "C", ...old, mediaPath: "M/SHARED.WEBM", mediaBytes: 100 });
    for (const io of [undefined, noInode]) {
      const r = run(root, media, io);
      assert.equal(["A", "B", "C"].filter((x) => verdict(r.out, x) === "ELIGIBLE").length, 3);
      assert.match(line(r.out, "eligible"), /3 recording\(s\) = 1 file\(s\), 100 B/, "three spellings are ONE file counted once");
      assert.match(r.out, /files referenced by more than one session record: 1/);
    }
    n++;
  });
  assert.equal(n, 2);
});

test("shared file: A eligible + B keep -> both KEEP; the bytes sit in one bucket once", () => withRoots((root, media) => {
  writeSession(root, media, { name: "a", ...old, mediaPath: "s/x.webm", mediaBytes: 80 });
  writeSession(root, media, { name: "b", ...old, mediaPath: "s/x.webm", mediaBytes: 80, status: { transcribe: "done", index: "pending" } });
  writeSession(root, media, { name: "c", ...old, mediaPath: "s/y.webm", mediaBytes: 30 });
  const r = run(root, media);
  assert.deepEqual([verdict(r.out, "a"), guardOf(r.out, "a"), verdict(r.out, "b"), verdict(r.out, "c")], ["KEEP", "shared-media-not-all-eligible", "KEEP", "ELIGIBLE"]);
  assert.match(line(r.out, "eligible"), /1 recording\(s\) = 1 file\(s\), 30 B/);
  assert.match(line(r.out, "kept by guard"), /1 recording\(s\) = 1 file\(s\), 80 B/);
  assert.match(line(r.out, "kept by policy"), /1 recording\(s\) = 0 file\(s\), 0 B/, "the shared file's bytes are attributed once, to the guard bucket");
}));

test("hardlinks and a case-differing spelling are one file (device + file index; case-folded path when the index is hidden)", () => withRoots((root, media) => {
  writeSession(root, media, { name: "h1", ...old, mediaPath: "d/one.webm", mediaBytes: 64 });
  writeSession(root, media, { name: "h2", ...old, mediaPath: "d/link.webm", createMedia: false });
  linkSync(join(media, "d", "one.webm"), join(media, "d", "link.webm"));
  const r = run(root, media);
  assert.match(line(r.out, "eligible"), /2 recording\(s\) = 1 file\(s\), 64 B/);
  writeSession(root, media, { name: "h3", ...old, mediaPath: "d/link.webm", createMedia: false, claims: unverified("h3") });
  const r2 = run(root, media);
  assert.deepEqual(["h1", "h2", "h3"].map((x) => verdict(r2.out, x)), ["KEEP", "KEEP", "KEEP"]);
  assert.equal(guardOf(r2.out, "h1"), "shared-media-not-all-eligible");
  writeSession(root, media, { name: "k1", ...old, mediaPath: "k/Case.webm", mediaBytes: 20 });
  writeSession(root, media, { name: "k2", ...old, mediaPath: "K/CASE.WEBM", mediaBytes: 20, claims: unverified("k2") });
  for (const io of [undefined, noInode]) {
    const r3 = run(root, media, io);
    assert.deepEqual([verdict(r3.out, "k1"), guardOf(r3.out, "k1"), verdict(r3.out, "k2")], ["KEEP", "shared-media-not-all-eligible", "KEEP"], io ? "no file index" : "file index");
  }
}));

test("other-tenant and duplicate-id session records that reference the same file still veto it", () => withRoots((root, media) => {
  writeSession(root, media, { name: "mine", ...old, mediaPath: "t/x.webm", mediaBytes: 11 });
  writeSession(root, media, { name: "planted", ...old, mediaPath: "t/x.webm", mediaBytes: 11, srcTenant: "acme", mediaId: "PLANTED" });
  writeSession(root, media, { name: "dupid1", ...old, mediaPath: "t/y.webm", mediaBytes: 12, mediaId: "same" });
  writeSession(root, media, { name: "dupid2", ...old, mediaPath: "t/y.webm", mediaBytes: 12, mediaId: "same" });
  const r = run(root, media);
  assert.equal(verdict(r.out, "mine"), "KEEP");
  assert.equal(guardOf(r.out, "mine"), "shared-media-not-all-eligible");
  assert.doesNotMatch(r.out, /RECORDING same => ELIGIBLE/, "a file referenced by two records with one id is never eligible");
  assert.doesNotMatch(r.out, /PLANTED/);
}));

test("totals hand-computed for a 15-recording fixture with two shared groups", () => withRoots((root, media) => {
  const S = (name: string, spec: Record<string, unknown>) => writeSession(root, media, { name, ...old, ...spec });
  S("r1", { mediaPath: "f/1.webm", mediaBytes: 100 }); S("r2", { mediaPath: "f/1.webm", mediaBytes: 100 });                       // shared, all eligible: 1 file 100 B
  S("r3", { mediaPath: "f/2.webm", mediaBytes: 50 }); S("r4", { mediaPath: "f/2.webm", mediaBytes: 50, claims: unverified("r4") }); // shared, r4 policy keep: r3 guard
  S("r5", { mediaPath: "f/3.webm", mediaBytes: 200 });                                                                            // eligible
  S("r6", { mediaPath: "f/4.webm", mediaBytes: 40, claims: unverified("r6") });                                                  // policy 40
  S("r7", { mediaPath: "f/5.webm", mediaBytes: 30, mediaMtimeMs: NOW - 1000 });                                                  // guard recently-modified 30
  S("r8", { mediaPath: "f/6.webm", mediaBytes: 20, recordedBytes: 500 });                                                        // not assessable 20
  S("r9", { mediaPath: "f/9.webm", createMedia: false });                                                                         // not assessable, unlocated
  S("r10", { mediaPath: "../out.webm" });                                                                                         // not assessable, unlocated
  S("r11", { mediaPath: "f/7.webm", mediaBytes: 60 });                                                                            // eligible
  S("r12", { mediaPath: "f/8.webm", mediaBytes: 70, status: { transcribe: "pending", index: "done" } });                          // policy 70
  S("r13", { mediaPath: "f/10.webm", mediaBytes: 10 });                                                                           // eligible
  S("r14", { mediaPath: "f/11.webm", mediaBytes: 12, processedAt: iso(DAY) });                                                   // policy 12 (too young)
  S("r15", { mediaPath: "f/12.webm", mediaBytes: 15 });                                                                           // eligible
  const out = run(root, media).out;
  assert.equal(out.match(/^RECORDING /gm)?.length, 15);
  assert.match(line(out, "eligible"), /6 recording\(s\) = 5 file\(s\), 385 B/);          // r1,r2 (100) + r5 (200) + r11 (60) + r13 (10) + r15 (15)
  assert.match(line(out, "kept by policy"), /4 recording\(s\) = 3 file\(s\), 122 B/);    // r4 (its file is counted under guard), r6 40, r12 70, r14 12
  assert.match(line(out, "kept by guard"), /2 recording\(s\) = 2 file\(s\), 80 B/);      // r3 + r4's file 50, r7 30
  assert.match(line(out, "not assessable"), /3 recording\(s\) = 1 file\(s\), 20 B/);     // r8; r9 and r10 have no located file
  assert.match(out, /files referenced by more than one session record: 2; recordings with no located file .*: 2/);
}));

test("the temp trees are byte-identical (sizes, hashes, mtimes) after shared-file runs; atime is not compared", () => withRoots((root, media) => {
  writeSession(root, media, { name: "p", ...old, mediaPath: "z/p.webm" });
  writeSession(root, media, { name: "q", ...old, mediaPath: "z/p.webm", claims: unverified("q") });
  const before = [snapshot(root), snapshot(media)];
  for (let i = 0; i < 3; i++) assert.equal(run(root, media).code, 0);
  assert.deepEqual([snapshot(root), snapshot(media)], before);
}));
