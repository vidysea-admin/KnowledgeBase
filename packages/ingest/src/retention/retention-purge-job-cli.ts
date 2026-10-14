/**
 * packages/ingest/src/retention/retention-purge-job-cli.ts - T-046 / D-145. Entry point for the scheduled purge job
 * (launched by scripts/webinar/schedule-retention-purge.ps1). DRY RUN unless `--execute` is passed.
 */
import { resolve } from "node:path";
import { runPurgeJob } from "./retention-purge-job.js";
import { realClipExtractor } from "./retention-clips-wire.js";

process.exitCode = runPurgeJob(process.argv.slice(2), {
  now: () => Date.now(),
  clips: realClipExtractor(),
  lastRunFile: resolve(process.env.LKB_RETENTION_LAST_RUN || "data/retention/last-run.json"),
  write: (line) => { process.stdout.write(`${line}\n`); },
  error: (line) => { process.stderr.write(`${line}\n`); },
});
