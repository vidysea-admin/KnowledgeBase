import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const stage = process.argv[2];
if (!["red", "regression"].includes(stage)) throw new Error("Use explicit red or regression stage");
const files = ["apps/api/src/session-decisions/reader.ts", "apps/api/src/session-decisions/provenance.ts",
  "apps/api/src/session-decisions/fixture.testsupport.ts", "apps/api/src/indexing/decisions-persist.ts",
  "packages/index/src/pipeline/notes/decisions.ts", "packages/db/src/lib/tenantScope.ts",
  "apps/api/src/visibility/knowledge.ts", "apps/api/src/composition/integrations/trusted-readers.ts",
  "apps/api/src/transcript-review/effective-reader.ts", "apps/api/src/transcript-review/service.ts",
  "apps/api/src/transcript-review/store.ts", "apps/api/src/visibility/read-snapshot.ts", "qa/evidence/goal-u25-consumer/third-await.test.ts",
  "qa/evidence/goal-u25-consumer/reader-before-third-await-fix.ts.txt"];
const hashes = () => Object.fromEntries(files.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const before = hashes();
if (stage === "red" && before[files[0]] !== before[files.at(-1)]) throw new Error("RED no longer points to preserved reader bytes");
const args = ["--test", "--test-reporter=tap", "--test-concurrency=1", "--import", "tsx", "qa/evidence/goal-u25-consumer/third-await.test.ts"];
const startedAt = new Date().toISOString(), start = performance.now();
const run = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
const elapsedMs = performance.now() - start, completedAt = new Date().toISOString(), after = hashes();
const outputPath = `qa/evidence/goal-u25-consumer/third-await-${stage}-output.txt`;
writeFileSync(outputPath, (run.stdout ?? "") + (run.stderr ?? ""));
const counts = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map((key) => [key, Number((run.stdout ?? "").match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1] ?? NaN)]));
const receipt = { stage, command: [process.execPath, ...args], cwd: process.cwd(), timeoutMs: 60000,
  startedAt, completedAt, elapsedMs, exitCode: run.status, signal: run.signal, error: run.error?.message ?? null,
  before, after, hashChanges: files.filter((file) => before[file] !== after[file]), counts, outputPath };
writeFileSync(`qa/evidence/goal-u25-consumer/third-await-${stage}-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ stage, exitCode: run.status, counts, elapsedMs, hashChanges: receipt.hashChanges }));
process.exitCode = run.status ?? 1;
