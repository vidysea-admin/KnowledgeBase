import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { cleanText } from "./retention-report-text.js";
import { DAY, baseArgs, emptyOps, freezeTree, iso, runCmd, snapshot, tempRoot, writeSession } from "./retention-report.fixtures.js";

function richFixture(): { root: string; media: string } {
  const root = tempRoot();
  const media = tempRoot();
  const old = { processedAt: iso(20 * DAY) };
  writeSession(root, media, { name: "ok", mediaPath: "m/ok.webm", mediaBytes: 33, ...old });
  writeSession(root, media, { name: "kept", mediaPath: "m/kept.webm", mediaBytes: 44 });
  writeSession(root, media, { name: "corrupt", raw: { "turns.json": "nope" } });
  writeSession(root, media, { name: "bad-src", raw: { "source.json": "{" } });
  writeSession(root, media, { tenant: "acme", name: "other", ...old });
  writeSession(root, media, { name: "planted", srcTenant: "acme", ...old });
  freezeTree(root);
  freezeTree(media);
  return { root, media };
}

test("the temp tree is byte-identical, mtimes included, after every kind of run", () => {
  const { root, media } = richFixture();
  try {
    const before = [snapshot(root), snapshot(media)];
    const runs = [
      baseArgs(root, media),
      baseArgs(root, media, [], "acme"),
      baseArgs(root, media, [], "ghost"),
      baseArgs(root, media, ["--apply"]),
      ["--tenant", "toc", "--data-root", root],
      baseArgs(root, media, ["--min-age-days", "1"]),
      ["--tenant", "toc", "--data-root", join(root, "nope"), "--media-root", media, "--min-age-days", "1", "--clip-padding-seconds", "1", "--operations-state", emptyOps()],
    ];
    const codes = runs.map((a) => runCmd(a).code);
    assert.deepEqual(codes, [0, 0, 3, 2, 2, 2, 3]);
    assert.deepEqual([snapshot(root), snapshot(media)], before);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
});

test("hostile titles, ids and paths are inert on a terminal and never leak join URLs", () => {
  const root = tempRoot();
  const media = tempRoot();
  try {
    const evil = [
      "\u001b[2J\u001b[31mred\u001b[0m", "\u001b]8;;http://evil.example/x\u0007click\u001b]8;;\u0007", "gnp.exe‮gpj.txt",
      "line1\nRECORDING forged-id => ELIGIBLE", "join https://zoom.us/j/123456789?pwd=SECRETPWD now", "meet.google.com/abc-defg-hij?authuser=SECRETQ",
      "bell\u0007 nul\u0000 del\u007f c1\u009b", "iso⁦lated⁩", "lone\ud800surrogate", "x".repeat(5000),
    ];
    evil.forEach((title, i) => writeSession(root, media, {
      name: `h${i}`, title, mediaId: `id-${i}-${title.slice(0, 12)}`, mediaPath: `m/${i}.webm`, processedAt: iso(20 * DAY),
    }));
    const r = runCmd(baseArgs(root, media));
    assert.equal(r.code, 0, r.err);
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(r.out.replace(/\n/g, ""), /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩\ud800-\udfff]/);
    assert.equal(r.out.split("\n").filter((l) => l.startsWith("RECORDING ")).length, evil.length);
    assert.doesNotMatch(r.out, /SECRETPWD|SECRETQ|evil\.example|authuser|pwd=/);
    assert.match(r.out, /\[url omitted\]/);
    assert.ok(Math.max(...r.out.split("\n").map((l) => l.length)) < 400, "a line was not length-bounded");
    // paths are relative to their roots: neither root appears in the output
    assert.ok(!r.out.includes(root) && !r.out.includes(media), "absolute path leaked");
    assert.match(r.out, /file: m\/0\.webm/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
});

test("cleanText: escapes controls and bidi, drops URLs and queries, bounds length", () => {
  assert.equal(cleanText("a\u001bb"), "a\\u{1b}b");
  assert.equal(cleanText("a‮b"), "a\\u{202e}b");
  assert.equal(cleanText("a\u0085b"), "a\\u{85}b");
  assert.equal(cleanText("see https://x.example/p?q=secret end"), "see [url omitted] end");
  assert.equal(cleanText("zoom.us/j/1?pwd=s"), "[url omitted]");
  assert.equal(cleanText("abcdef", 3), "abc...");
  assert.equal(cleanText("plain text 123"), "plain text 123");
  assert.equal(cleanText("\ud800"), "\\u{d800}");
});

test("a hostile --tenant value or option name echoed in an error is sanitised", () => {
  const r = runCmd(["--evil\u001b[2J", "x"]);
  assert.equal(r.code, 2);
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(r.err, /\u001b/);
  assert.match(r.err, /\\u\{1b\}/);
});
