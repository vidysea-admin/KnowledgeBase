/**
 * scripts/lint.test.mjs — negative tests for the structure linters (T-017, C8).
 * Each linter is run as a child process against a temp fixture that violates its budget
 * (must exit non-zero) and against a clean fixture (must exit 0) — proving none is vacuous.
 * Run: pnpm test:lint   (= node --test scripts/lint.test.mjs)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runAll } from "./lint-loc.mjs";
import { indexFile } from "./gen-types.mjs";

test("generated core barrel retains alert exports and excludes test modules", () => {
  const text = indexFile(["claims", "sessions"]);
  assert.equal(text.split('export * from "./alerts/alert-sink.js";').length - 1, 1);
  assert.ok(!text.includes("alert-sink.test"));
  assert.ok(text.includes('./generated/claims.js')); assert.ok(text.includes('./domain/purge-policy.js'));
  assert.equal(text, indexFile(["claims", "sessions"]));
});

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(SCRIPTS, "..", "structure.config.json"), "utf8"));

test("aggregate gate executes all ten stages despite first, middle and final failures", () => {
  const calls = [], output = [];
  const root = join(tmpdir(), "fixture with spaces & punctuation");
  const exit = runAll(root, (exe, args, options) => {
    calls.push(args);
    assert.equal(exe, process.execPath);
    assert.equal(options.cwd, root);
    assert.equal(options.shell, false);
    return { status: [1, 5, 10].includes(calls.length) ? 1 : 0 };
  }, line => output.push(line));
  assert.equal(exit, 1);
  assert.equal(calls.length, 10);
  assert.deepEqual(calls.slice(0, 7).map(a => a[0]), ["scripts/lint-loc.mjs", "scripts/lint-dirsize.mjs", "scripts/lint-root.mjs", "scripts/lint-dupes.mjs", "scripts/lint-migrations.mjs", "scripts/lib/lint-codex-hooks.mjs", "scripts/snapshot.mjs"]);
  assert.deepEqual(calls[7], ["--test", "scripts/lint.test.mjs"]);
  assert.deepEqual(calls[8], ["scripts/tracker-audit.mjs", "--gate", "g1,g4"]);
  assert.deepEqual(calls[9].slice(1), ["--config", ".dependency-cruiser.cjs", "packages", "apps", "workers"]);
  assert.match(output.at(-1), /10 stages, 3 failed/);
});

test("aggregate gate clean success and execution error/signal cannot skip later stages", () => {
  for (const mode of ["clean", "throw", "signal", "error"]) {
    let count = 0;
    const exit = runAll(tmpdir(), () => {
      count++;
      if (count === 1 && mode === "throw") throw new Error("launch failed");
      if (count === 1 && mode === "signal") return { status: null, signal: "SIGTERM" };
      if (count === 1 && mode === "error") return { status: 0, error: new Error("timeout") };
      return { status: 0 };
    }, () => {});
    assert.equal(count, 10);
    assert.equal(exit, mode === "clean" ? 0 : 1);
  }
});

test("mjs tests use testMax while source mjs remains at source budget", () => {
  const root = fixture();
  try {
    put(root, "scripts/sample.test.mjs", lines(CONFIG.loc.testMax));
    assert.equal(run("loc", root).status, 0);
    put(root, "scripts/sample.test.mjs", lines(CONFIG.loc.testMax + 1));
    assert.equal(run("loc", root).status, 1);
    put(root, "scripts/sample.test.mjs", "");
    put(root, "scripts/sample.mjs", lines(CONFIG.loc.max + 1));
    assert.equal(run("loc", root).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lkb-lint-"));
  writeFileSync(join(root, "structure.config.json"), JSON.stringify(CONFIG));
  return root;
}

function put(root, rel, content = "") {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function run(linter, root) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, `lint-${linter}.mjs`), "--root", root], { encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

const lines = (n, text = "x = 1") => Array.from({ length: n }, () => text).join("\n") + "\n";

/** Runs `linter` on a clean fixture (expect 0) then on `violate(root)` (expect 1, output contains `needle`). */
function pair(linter, build, violate, needle) {
  test(`lint-${linter}: passes on a clean fixture`, () => {
    const root = fixture();
    try {
      build(root);
      const r = run(linter, root);
      assert.equal(r.status, 0, r.out);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test(`lint-${linter}: fails on a violating fixture`, () => {
    const root = fixture();
    try {
      build(root);
      violate(root);
      const r = run(linter, root);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, needle);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// C1 — LOC
const locMax = CONFIG.loc.max;
pair(
  "loc",
  (root) => {
    put(root, "packages/a/src/ok.ts", lines(locMax));
    put(root, "packages/a/src/ok.test.ts", lines(CONFIG.loc.testMax));
    put(root, "packages/a/node_modules/big.ts", lines(locMax + 50));
    put(root, "packages/a/src/generated/big.ts", lines(locMax + 50));
  },
  (root) => put(root, "packages/a/src/big.ts", lines(locMax + 1)),
  /packages\/a\/src\/big\.ts:301/,
);

// C2 — directory size
const dirMax = CONFIG.dirsize.maxFiles;
pair(
  "dirsize",
  (root) => {
    for (let i = 0; i < dirMax; i++) put(root, `packages/a/src/f${i}.ts`);
    for (let i = 0; i <= dirMax; i++) put(root, `packages/a/node_modules/f${i}.ts`);
  },
  (root) => put(root, `packages/a/src/f${dirMax}.ts`),
  /packages\/a\/src: 31 files/,
);

// C2b — the dirsize override (D-017) is SCOPED: a named directory gets extra room, and every
// other directory keeps the global cap. Without the second half of this, an override could quietly
// become a global raise -- which is the exact mistake D-016 would have made.
test("dirsize override raises the cap only for the directory it names", () => {
  const root = fixture();
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.dirsize.overrides = { "packages/a/src": dirMax + 1 };
  writeFileSync(join(root, "structure.config.json"), JSON.stringify(cfg));
  // the OVERRIDDEN directory may hold one more than the global cap
  for (let i = 0; i <= dirMax; i++) put(root, `packages/a/src/f${i}.ts`);
  const ok = run("dirsize", root);
  assert.equal(ok.status, 0, `override should permit ${dirMax + 1} files: ${ok.out}`);

  // an UNLISTED sibling is still held to the global cap
  for (let i = 0; i <= dirMax; i++) put(root, `packages/b/src/f${i}.ts`);
  const bad = run("dirsize", root);
  assert.notEqual(bad.status, 0, "an unlisted directory must still fail at the global cap");
  assert.match(bad.out, /packages\/b\/src: 31 files \(budget 30\)/);
});

// C3 — root
const r = CONFIG.root;
pair(
  "root",
  (root) => {
    // structure.config.json + 3 .md files + N .txt files = exactly maxLooseFiles
    for (let i = 0; i < r.maxLooseFiles - 4; i++) put(root, `file${i}.txt`);
    put(root, r.architectureFile, lines(r.architectureMaxLines, "# a"));
    put(root, "NOTES.md", lines(r.mdMaxLines, "note"));
    put(root, r.readmeFile, lines(r.readmeMaxLines, "readme"));
    mkdirSync(join(root, "a-directory-not-counted"));
  },
  (root) => {
    put(root, "extra-loose-file.txt");
    put(root, r.architectureFile, lines(r.architectureMaxLines + 1, "# a"));
    put(root, "NOTES.md", lines(r.mdMaxLines + 1, "note"));
    put(root, r.readmeFile, lines(r.readmeMaxLines + 1, "readme"));
  },
  /root has 16 loose files[\s\S]*ARCHITECTURE\.md: 151 lines[\s\S]*NOTES\.md: 201 lines[\s\S]*README\.md: 81 lines/,
);

// C4 — duplicate exports + duplicate schema $id
pair(
  "dupes",
  (root) => {
    put(root, "packages/a/src/one.ts", "export function alpha() {}\nexport const beta = 1;\n");
    put(root, "packages/b/src/two.ts", "export interface Gamma {}\nexport type Delta = 1;\n");
    put(root, "packages/b/src/index.ts", "export { alpha } from './one.js';\nexport const beta = 2;\n");
    put(root, "packages/a/src/generated/g.ts", "export function alpha() {}\n");
    put(root, "schema/x.schema.json", JSON.stringify({ $id: "kb://x" }));
    put(root, "schema/y.schema.json", JSON.stringify({ $id: "kb://y" }));
  },
  (root) => {
    put(root, "packages/b/src/three.ts", "export class Gamma {}\nexport async function alpha() {}\n");
    put(root, "schema/z.schema.json", JSON.stringify({ $id: "kb://x" }));
  },
  /export 'alpha'[\s\S]*export 'Gamma'[\s\S]*schema \$id 'kb:\/\/x'/,
);

// C5 — migrations outside migrations/
pair(
  "migrations",
  (root) => {
    put(root, "migrations/migrate-001-add-index.mjs");
    put(root, "scripts/gen-types.mjs");
    put(root, "packages/a/node_modules/migrate-x.js");
  },
  (root) => {
    put(root, "scripts/migrate-2026-09-03-patch.mjs");
    put(root, "packages/a/src/migrate-fix.py");
  },
  /packages\/a\/src\/migrate-fix\.py[\s\S]*scripts\/migrate-2026-09-03-patch\.mjs/,
);

/* ── ISS-128: scripts/ is neither typechecked nor in `pnpm -r test` ───────────────────────────
 * A stale `apps/api/src/indexing.ts` import left the chunks backfill DEAD from the U1.0c file move
 * until a maker happened to run it — a whole script broken, in a repo with 500+ green tests and a
 * clean typecheck, because `scripts/` sits outside both. `pnpm -r` only walks workspace packages,
 * and these are loose .mjs files.
 *
 * This is the cheapest guard that would have caught it: import each script's module graph and
 * assert it RESOLVES. It deliberately does not execute them — several connect to Mongo or spend
 * API budget — so it catches broken imports and syntax, not behaviour. That is exactly the class
 * that bit, and a narrow guard that runs beats a thorough one that cannot.
 *
 * Added to this existing file rather than as `scripts/smoke.test.mjs` because `scripts/` is at its
 * D-018 directory cap of 32, and that entry records that a third raise must CONSOLIDATE, not widen.
 */
test("every scripts/*.mjs resolves its imports — scripts are outside typecheck and pnpm -r test", async () => {
  const { readdirSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const { join, dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { spawnSync } = await import("node:child_process");

  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(scriptsDir, "..");
  const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
  assert.ok(files.length > 20, `expected the real scripts dir, found ${files.length} file(s)`);

  const broken = [];
  for (const f of files) {
    // A child process per file: these register tsx hooks and import workspace TS, which must not
    // leak into this test runner. `--check` parses without executing; the tsx-registered dynamic
    // imports inside main() are covered by the resolve pass below.
    const parse = spawnSync(process.execPath, ["--check", join(scriptsDir, f)], { encoding: "utf8" });
    if (parse.status !== 0) broken.push(`${f}: syntax — ${(parse.stderr || "").split("\n")[0]}`);
  }
  assert.deepEqual(broken, [], `scripts failed to parse:\n${broken.join("\n")}`);

  // Static-import resolution: catches exactly the U1.0c breakage class (a moved module still
  // named in an import specifier) for every top-level import in every script.
  const { readFileSync, existsSync } = await import("node:fs");
  const unresolved = [];
  for (const f of files) {
    const src = readFileSync(join(scriptsDir, f), "utf8");
    for (const m of src.matchAll(/(?:^|\s)(?:import|await import\()\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue; // bare specifiers are resolved by node_modules
      const abs = resolve(scriptsDir, spec);
      // A `.js` specifier pointing at TypeScript source is the tsx/ESM convention used throughout
      // this repo (`packages/db/src/client.js` -> `client.ts`), so accept either extension. The
      // check that matters is whether SOMETHING is there — the U1.0c breakage was a path with no
      // file behind it under any extension.
      const candidates = [abs];
      if (abs.endsWith(".js")) candidates.push(abs.slice(0, -3) + ".ts");
      if (!abs.match(/\.[a-z]+$/)) candidates.push(abs + ".ts", abs + ".mjs", abs + ".js", join(abs, "index.ts"));
      if (!candidates.some((c) => existsSync(c))) unresolved.push(`${f} -> ${spec}`);
    }
  }
  assert.deepEqual(unresolved, [],
    `a script imports a path that does not exist (the U1.0c breakage class):\n${unresolved.join("\n")}`);
  assert.ok(pathToFileURL(root));
});

/**
 * ISS-245: demo:live's browser opener must be accountable — a failed OS opener fails the run
 * with the exact URL and error, and the success checklist NEVER prints when a page failed.
 * Both directions pinned, so the guard cannot become unconditional (the success path must still
 * emit the checklist).
 */
test("ISS-245: opener success, failures and timeout preserve exact URLs and continuation", async () => {
  const { openPages } = await import("./demo/demo-live.mjs");
  const pages = [["/first", "one"], ["/second", "two"]];
  for (const mode of ["success", "first-error", "second-error", "timeout", "throw"]) {
    const attempted = [];
    const failures = await openPages(pages, "http://127.0.0.1:1", {
      staggerMs: 0, timeoutMs: 1234,
      execFileFn(_command, args, options, callback) {
        const url = args.at(-1); attempted.push(url);
        assert.equal(options.timeout, 1234);
        if (mode === "throw" && attempted.length === 1) throw new Error("sync failure");
        const failed = (mode === "first-error" || mode === "timeout") && attempted.length === 1 || mode === "second-error" && attempted.length === 2;
        callback(failed ? new Error(mode === "timeout" ? "timed out" : "open failed") : null);
      },
    });
    assert.deepEqual(attempted, ["http://127.0.0.1:1/first", "http://127.0.0.1:1/second"]);
    if (mode === "success") assert.deepEqual(failures, []);
    else {
      const path = mode === "second-error" ? "/second" : "/first";
      assert.deepEqual(failures, [{ path, url: `http://127.0.0.1:1${path}`, error: mode === "throw" ? "sync failure" : mode === "timeout" ? "timed out" : "open failed" }]);
    }
  }
});
test("ISS-245: the checklist prints only after every opener succeeded (wiring is fail-gated)", async () => {
  // Static wiring assertion: the CLI branch's printChecklist call must be reachable only after
  // the failures check exited. This guards against regressing to the old fire-and-forget shape.
  const src = readFileSync(join(SCRIPTS, "demo", "demo-live.mjs"), "utf8");
  const guardIdx = src.indexOf("if (RUNNING_AS_CLI) {");
  const cliBody = src.slice(guardIdx);
  const failCheckIdx = cliBody.indexOf("if (failures.length > 0) {");
  const printIdx = cliBody.indexOf("printChecklist(PAGES);");
  const exitIdx = cliBody.indexOf("process.exit(1);");
  assert.ok(failCheckIdx > -1, "the failure check must exist in the CLI path");
  assert.ok(exitIdx > -1 && exitIdx < printIdx, "a failure exits BEFORE the checklist can print");
  assert.ok(!/execFile\([^)]*\)\s*;?\s*\)\s*\{\};/.test(cliBody), "no fire-and-forget opener (the ISS-245 shape)");
});
