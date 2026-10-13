import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { climbsOut, probeMedia, REAL_IO, type MediaIo } from "./retention-report-media.js";
import { tempRoot } from "./retention-report.fixtures.js";

// Outside-root must be decided lexically BEFORE the existence check, on every platform: on Linux "\" is an ordinary filename
// character, so "..\..\x" used to resolve inside the root and report "media-not-found" instead of "media-path-outside-root".
test("climbsOut: both separators, any platform", () => {
  const out = ["..\\..\\outside.webm", "../outside.webm", "a/../../x.webm", "a\\..\\..\\x.webm", "a/..\\..", "..", ".", "", "a/..", "./", "x/../../y"];
  const inside = ["a.webm", "a/b.webm", "a\\b.webm", "./a/../b.webm", "a/./b/../c.webm", "dir/..name.webm", "a/b/../c"];
  for (const p of out) assert.equal(climbsOut(p), true, `outside: ${JSON.stringify(p)}`);
  for (const p of inside) assert.equal(climbsOut(p), false, `inside: ${JSON.stringify(p)}`);
});

test("probeMedia: a backslash-escaping stored path is outside-root even if the file would exist, and without touching the filesystem", () => {
  const media = tempRoot();
  const outside = tempRoot();
  try {
    writeFileSync(join(outside, "outside.webm"), "x");
    mkdirSync(join(media, "sub"));
    // An io that fails the test if the probe reaches the filesystem for a lexically outside path.
    const trap: MediaIo = { ...REAL_IO, realpathSync: () => { throw new Error("existence check reached"); }, lstatSync: () => { throw new Error("existence check reached"); } };
    for (const rel of ["..\\..\\outside.webm", "sub\\..\\..\\outside.webm", "../outside.webm", "..\\outside.webm"]) {
      assert.equal(probeMedia(media, rel, trap).state, "outside-root", rel);
      assert.equal(probeMedia(media, rel, trap, "linux").state, "outside-root", `${rel} (linux)`);
    }
    // An absent but lexically inside path is still plain not-found.
    assert.equal(probeMedia(media, "sub/nope.webm").state, "not-found");
  } finally { rmSync(media, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
