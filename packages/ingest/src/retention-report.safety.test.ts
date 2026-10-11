import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import test from "node:test";
import { cleanText } from "./retention-report-text.js";
import { DAY, baseArgs, freezeTree, iso, runCmd, snapshot, tempRoot, writeSession } from "./retention-report.fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = ["retention-report.ts", "retention-report-args.ts", "retention-report-state.ts", "retention-report-text.ts", "retention-report-cli.ts"];
// The @lkb/core barrel also re-exports an https alert sink; the report only uses these two pure functions, so the scan pins
// the names imported from the barrel and follows the one file that defines them.
const CORE_PURGE_POLICY = resolve(HERE, "..", "..", "core", "src", "domain", "purge-policy.ts");
const CORE_NAMES = new Set(["deriveEvidenceClipWindows", "isPurgeEligible", "Claims", "EvidenceClipWindow", "Media", "Turns"]);
const ALLOWED_BARE = new Set(["node:fs", "node:path", "node:crypto", "node:util", "@lkb/core"]);
const READ_ONLY_FS = new Set(["lstatSync", "readdirSync", "readFileSync"]);
const FORBIDDEN = /\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|rename|renameSync|writeFile|writeFileSync|appendFile|appendFileSync|truncate|truncateSync|ftruncate|ftruncateSync|copyFile|copyFileSync|mkdir|mkdirSync|symlink|symlinkSync|chmod|chown|utimes|utimesSync|createWriteStream|openSync|open|child_process|spawn|spawnSync|execSync|execFile|execFileSync|fork|eval)\b/;

const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');

interface Graph { files: string[]; bare: Map<string, Set<string>>; sources: Map<string, string> }

/** Follows relative imports (and @lkb/core into its src) from the entry files. */
function importGraph(entries: string[]): Graph {
  const files: string[] = [];
  const bare = new Map<string, Set<string>>();
  const sources = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.includes(file)) continue;
    files.push(file);
    const src = readFileSync(file, "utf8");
    sources.set(file, src);
    for (const m of src.matchAll(/(?:import|export)\s+(?:type\s+)?(?:([^'"]*?)\s+from\s+)?["']([^"']+)["']/g)) {
      const names = m[1] ?? "";
      const spec = m[2] as string;
      if (spec.startsWith(".")) queue.push(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      else {
        const set = bare.get(spec) ?? new Set<string>();
        for (const n of names.replace(/[{}]/g, "").split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean)) set.add(n);
        bare.set(spec, set);
        if (spec === "@lkb/core") queue.push(CORE_PURGE_POLICY);
      }
    }
    assert.doesNotMatch(src, /\brequire\s*\(|\bimport\s*\(/, `${file} must not use require() or dynamic import()`);
  }
  return { files, bare, sources };
}

test("the report modules and everything they import contain no delete, write, rename or spawn API", () => {
  const g = importGraph(ENTRY.map((f) => join(HERE, f)).concat([join(HERE, "retention-sweep.ts")]));
  assert.ok(g.files.length >= 8, `graph too small: ${g.files.length}`);
  for (const [file, src] of g.sources) {
    const code = strip(src);
    assert.doesNotMatch(code, FORBIDDEN, `${file} uses a forbidden API`);
    assert.doesNotMatch(code, /\.write\w*\(\s*[^)]*\bflag\b|flag\s*:\s*["'][wa]/, `${file} opens a file for writing`);
  }
  for (const [spec, names] of g.bare) {
    assert.ok(ALLOWED_BARE.has(spec), `unexpected import ${spec}`);
    if (spec === "node:fs") for (const n of names) assert.ok(READ_ONLY_FS.has(n), `node:fs import ${n} is not read-only`);
    if (spec === "@lkb/core") for (const n of names) assert.ok(CORE_NAMES.has(n), `@lkb/core import ${n} is not a pure purge-policy name`);
  }
  assert.ok(g.bare.get("node:fs")?.size, "state module must import node:fs read APIs");
  assert.ok(g.files.includes(CORE_PURGE_POLICY), "purge-policy.ts must be in the scanned graph");
  for (const f of g.files.filter((x) => x.includes(`${join("core", "src")}`))) {
    assert.doesNotMatch(g.sources.get(f) as string, /from\s+["']node:/, `${f} imports a node builtin`);
  }
});

test("no apply-like option exists in the argument parser source", () => {
  const src = readFileSync(join(HERE, "retention-report-args.ts"), "utf8");
  const valued = /const VALUED = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
  assert.equal(valued.replace(/\s/g, ""), '"--tenant","--data-root","--media-root","--min-age-days","--clip-padding-seconds"');
  assert.doesNotMatch(strip(src), /apply|force|\byes\b|execute|delete|purge-now/i);
});

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
      ["--tenant", "toc", "--data-root", join(root, "nope"), "--min-age-days", "1", "--clip-padding-seconds", "1"],
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
