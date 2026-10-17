import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const files = [
  "apps/api/src/indexing/decisions-persist.ts", "apps/api/src/indexing/decisions-persist.test.ts",
  "apps/api/src/indexing/session-decisions.test.ts", "packages/index/src/pipeline/notes/decisions.ts",
  "packages/index/src/pipeline/notes/decisions.test.ts", "qa/contracts/goal-u25.md",
  "qa/evidence/goal-u25/independent.test.ts", "apps/api/src/indexing/session.ts",
  "packages/db/src/lib/tenantScope.ts", "packages/index/src/eval/extraction.ts",
  "data/toc-migrated/2026-08-27-in-focus-4/turns.json", "contracts/contracts.json",
  "contracts/verify_contracts.py", "qa/evidence/goal-t051checker-validator.json",
];
const hashes = () => Object.fromEntries(files.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const args = ["--test", "--test-reporter=tap", "--test-concurrency=1", "--test-name-pattern=ISS-U25DECISIONS-001|independent atomic", "--import", "tsx",
  "apps/api/src/indexing/decisions-persist.test.ts", "qa/evidence/goal-u25/independent.test.ts"];
const before = hashes(), startedAt = new Date().toISOString(), start = performance.now();
const run = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
const elapsedMs = performance.now() - start, completedAt = new Date().toISOString(), after = hashes();
const stdout = run.stdout ?? "", stderr = run.stderr ?? "";
writeFileSync("qa/evidence/goal-u25/independent-output.txt", stdout + stderr);
const receipt = { command: [process.execPath, ...args], timeoutMs: 60000, startedAt, completedAt, elapsedMs,
  exitCode: run.status, signal: run.signal, error: run.error?.message ?? null, before, after,
  hashChanges: files.filter((file) => before[file] !== after[file]),
  counts: Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((field) => [field, Number(stdout.match(new RegExp(`^# ${field} (\\d+)$`, "m"))?.[1] ?? NaN)])),
  outputPath: "qa/evidence/goal-u25/independent-output.txt" };
writeFileSync("qa/evidence/goal-u25/independent-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ startedAt, completedAt, elapsedMs, exitCode: run.status, error: receipt.error, counts: receipt.counts, hashChanges: receipt.hashChanges }));
process.exitCode = run.status === 0 && !receipt.hashChanges.length ? 0 : 1;
