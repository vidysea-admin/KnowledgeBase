/**
 * packages/ingest/src/retention/retention-processed-cli.ts - T-046. `node --import tsx retention-processed-cli.ts <sessionDir>`
 * stamps processedAt (see retention-processed.ts). Exit 0 stamped or already stamped, 1 refused, 2 usage.
 */
import { markSessionProcessed } from "./retention-processed.js";

const dir = process.argv[2];
if (process.argv.length !== 3 || dir === undefined || dir.startsWith("--")) {
  process.stderr.write("usage: retention-processed-cli <sessionDir>\n");
  process.exitCode = 2;
} else {
  const r = markSessionProcessed(dir, Date.now());
  process.stdout.write(r.ok ? `processedAt ${r.changed ? "recorded" : "already set"}: ${r.processedAt}\n` : `refused: ${r.reason}\n`);
  process.exitCode = r.ok ? 0 : 1;
}
