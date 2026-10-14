/**
 * packages/ingest/src/retention/retention-purge-job-cli.ts - T-046 / D-145. Entry point for the scheduled purge job
 * (launched by scripts/webinar/schedule-retention-purge.ps1). DRY RUN unless `--execute` is passed.
 */
import { runPurgeJob } from "./retention-purge-job.js";

process.exitCode = runPurgeJob(process.argv.slice(2), {
  now: () => Date.now(),
  write: (line) => { process.stdout.write(`${line}\n`); },
  error: (line) => { process.stderr.write(`${line}\n`); },
});
