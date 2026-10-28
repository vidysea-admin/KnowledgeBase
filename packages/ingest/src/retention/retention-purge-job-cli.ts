/**
 * packages/ingest/src/retention/retention-purge-job-cli.ts - T-046 / D-145. Entry point for the scheduled purge job
 * (launched by scripts/webinar/schedule-retention-purge.ps1). DRY RUN unless `--execute` is passed.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runPurgeJob } from "./retention-purge-job.js";
import { realClipExtractor } from "./retention-clips-wire.js";

export function runRetentionPurgeJobCli(argv: string[], env: NodeJS.ProcessEnv = process.env,
  write = (line: string) => { process.stdout.write(`${line}\n`); },
  error = (line: string) => { process.stderr.write(`${line}\n`); }): number {
  if (env.LKB_RETENTION_LAST_RUN) {
    error("retention-purge-job: LKB_RETENTION_LAST_RUN is no longer supported; the summary is bound to --data-root and --tenant"); return 2;
  }
  return runPurgeJob(argv, { now: () => Date.now(), clips: realClipExtractor(), stateRoot: env.LKB_RETENTION_DATA_ROOT, write, error });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = runRetentionPurgeJobCli(process.argv.slice(2));
