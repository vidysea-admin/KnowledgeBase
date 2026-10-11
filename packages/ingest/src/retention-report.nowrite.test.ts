import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importGraph, scanSource, strip } from "./retention-report.scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = ["retention-report.ts", "retention-report-args.ts", "retention-report-state.ts", "retention-report-text.ts", "retention-report-cli.ts", "retention-report-media.ts", "retention-report-guards.ts",
  "retention-report/assess.ts", "retention-report/ops.ts", "retention-report/clock.ts", "retention-report/crosstenant.ts"];
// The @lkb/core barrel also re-exports an https alert sink; the report only uses these pure names, so the scan pins
// the names imported from the barrel and follows the one file that defines them.
const CORE_PURGE_POLICY = resolve(HERE, "..", "..", "core", "src", "domain", "purge-policy.ts");
const CORE_NAMES = new Set(["deriveEvidenceClipWindows", "isPurgeEligible", "Claims", "EvidenceClipWindow", "Media", "Turns"]);
const ALLOWED_BARE = new Set(["node:fs", "node:path", "node:crypto", "node:util", "@lkb/core"]);
const READ_ONLY_FS = new Set(["lstatSync", "readdirSync", "readFileSync", "statSync", "realpathSync", "openSync", "readSync", "closeSync"]);

test("the report modules and everything they import contain no delete, write, rename or spawn API", () => {
  const g = importGraph(ENTRY.map((f) => join(HERE, f)).concat([join(HERE, "retention-sweep.ts")]), CORE_PURGE_POLICY);
  assert.ok(g.files.length >= 10, `graph too small: ${g.files.length}`);
  for (const [file, src] of g.sources) assert.deepEqual(scanSource(src), [], `${file} uses a forbidden API or a non-read-only open`);
  for (const [spec, names] of g.bare) {
    assert.ok(ALLOWED_BARE.has(spec), `unexpected import ${spec}`);
    if (spec === "node:fs") for (const n of names) assert.ok(READ_ONLY_FS.has(n), `node:fs import ${n} is not read-only`);
    if (spec === "@lkb/core") for (const n of names) assert.ok(CORE_NAMES.has(n), `@lkb/core import ${n} is not a pure purge-policy name`);
  }
  assert.ok(g.bare.get("node:fs")?.size, "state module must import node:fs read APIs");
  assert.ok(g.files.includes(CORE_PURGE_POLICY), "purge-policy.ts must be in the scanned graph");
  assert.ok(g.files.includes(join(HERE, "retention-report-media.ts")) && g.files.includes(join(HERE, "retention-report-guards.ts")));
  for (const f of g.files.filter((x) => x.includes(`${join("core", "src")}`))) {
    assert.doesNotMatch(g.sources.get(f) as string, /from\s+["']node:/, `${f} imports a node builtin`);
  }
});

test("scanner: only a literal read-only open flag passes; r+, w, a, x, numbers, variables and expressions are violations", () => {
  const ok = [`fs.openSync(p, "r")`, `openSync(p, 'r')`, "fs.promises.open(p, `r`)", `openSync(p, fs.constants.O_RDONLY)`, `openSync(p, O_RDONLY)`];
  for (const src of ok) assert.deepEqual(scanSource(src), [], src);
  const bad = [`fs.openSync(p, "r+")`, `fs.openSync(p, 'r+')`, `openSync(p, "w")`, `openSync(p, "a")`, `openSync(p, "wx")`, `openSync(p, "a+")`, `openSync(p, "x")`,
    `openSync(p, 2)`, `openSync(p, 0o102)`, `openSync(p, flagVar)`, `openSync(p, mode ? "r" : "w")`, `openSync(p, "r" + "+")`, `openSync(p, O_RDONLY | O_WRONLY)`,
    `fs.promises.open(p, "r+")`, `openSync(p)`, `fs.promises.open(path, flags)`, `createWriteStream(p)`, `readFileSync(p, { flag: "r+" })`, `readFileSync(p, { flag: f })`,
    `createReadStream(p, { flags: "w" })`];
  for (const src of bad) assert.notDeepEqual(scanSource(src), [], `must be a violation: ${src}`);
  assert.deepEqual(scanSource(`// openSync(p, "w")\n/* openSync(p, "a") */ lstatSync(p)`), [], "comments are ignored");
});

test("no apply-like option exists in the argument parser source", () => {
  const src = readFileSync(join(HERE, "retention-report-args.ts"), "utf8");
  const valued = /const VALUED = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
  assert.equal(valued.replace(/\s/g, ""), '"--tenant","--data-root","--media-root","--min-age-days","--clip-padding-seconds","--operations-state","--as-of"');
  assert.doesNotMatch(strip(src), /apply|force|\byes\b|execute|delete|purge-now/i);
});

test("the one file open in the report graph is the media probe's literal read-only open, and the scanner rejects every wider flag for it", () => {
  const g = importGraph(ENTRY.map((f) => join(HERE, f)), CORE_PURGE_POLICY);
  const opens = [...g.sources].flatMap(([file, src]) => [...strip(src).matchAll(/\b(?:openSync|open)\s*\(/g)].map(() => file));
  assert.deepEqual(opens, [join(HERE, "retention-report-media.ts")]);
  const probe = readFileSync(join(HERE, "retention-report-media.ts"), "utf8");
  assert.match(probe, /io\.openSync\(real, "r"\)/);
  for (const flag of ["r+", "w", "a", "wx", "w+", "a+", "rs+"]) {
    assert.notDeepEqual(scanSource(probe.replace('io.openSync(real, "r")', `io.openSync(real, "${flag}")`)), [], `flag ${flag} must be rejected`);
  }
});
