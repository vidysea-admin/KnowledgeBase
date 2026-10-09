#!/usr/bin/env node
/**
 * scripts/lint-loc.mjs — C1: no source file over the LOC budget (non-blank lines).
 * Budgets: structure.config.json → loc.max (tests: loc.testMax). Usage: node scripts/lint-loc.mjs [--root <dir>]
 */
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { countLoc, loadConfig, report, rootFromArgv, walk } from "./lib/walk.mjs";

export function check(root, cfg = loadConfig(root)) {
  const { extensions, max, testMax, testPatterns } = cfg.loc;
  const testRes = testPatterns.map((p) => new RegExp(p));
  const violations = [];
  let scanned = 0;
  for (const r of cfg.roots) {
    for (const { abs, rel } of walk(root, join(root, r), cfg.ignoreDirs)) {
      if (!extensions.some((ext) => rel.endsWith(ext))) continue;
      scanned++;
      const isTest = testRes.some((re) => re.test(basename(rel)));
      const budget = isTest ? testMax : max;
      const loc = countLoc(abs);
      if (loc > budget) violations.push(`${rel}:${loc} (budget ${budget})`);
    }
  }
  return { violations, scanned };
}

export function runAll(root, execute = spawnSync, log = console.log) {
  const stages = [
    ["loc", ["scripts/lint-loc.mjs"]],
    ["dirsize", ["scripts/lint-dirsize.mjs"]],
    ["root", ["scripts/lint-root.mjs"]],
    ["dupes", ["scripts/lint-dupes.mjs"]],
    ["migrations", ["scripts/lint-migrations.mjs"]],
    ["codex-hooks", ["scripts/lib/lint-codex-hooks.mjs"]],
    ["snapshot", ["scripts/snapshot.mjs", "--check"]],
    ["lint-tests", ["--test", "scripts/lint.test.mjs"]],
    ["tracker", ["scripts/tracker-audit.mjs", "--gate", "g1,g4"]],
    ["dependencies", ["node_modules/dependency-cruiser/bin/dependency-cruise.mjs", "--config", ".dependency-cruiser.cjs", "packages", "apps", "workers"]],
  ];
  const results = [];
  for (const [name, args] of stages) {
    let result;
    try { result = execute(process.execPath, args, { cwd: root, stdio: "inherit", shell: false, timeout: 120000 }); }
    catch (error) { result = { status: null, error }; }
    const failed = Boolean(result.error || result.signal || result.status !== 0);
    results.push({ name, failed, status: result.status, signal: result.signal ?? null });
    log(`lint:structure stage=${name} exit=${result.status ?? "unavailable"}${result.signal ? ` signal=${result.signal}` : ""}${result.error ? " error=execution-failed" : ""}`);
  }
  log(`lint:structure: ${results.some(r => r.failed) ? "FAIL" : "OK"} (${results.length} stages, ${results.filter(r => r.failed).length} failed)`);
  return results.some(r => r.failed) ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const root = rootFromArgv();
  if (process.argv.includes("--all")) process.exitCode = runAll(root);
  else {
    const { violations, scanned } = check(root);
    report("lint-loc", violations, `${scanned} file(s) within budget`);
  }
}
