/**
 * packages/ingest/src/retention/retention-purge-cli.ts - T-046 / D-145. Entry point for the raw-media purge
 * executor. DRY RUN unless `--execute` is passed. Not scheduled, not wired into `lkb`.
 */
import { runRetentionPurge } from "./retention-purge.js";

process.exitCode = runRetentionPurge(process.argv.slice(2), {
  now: () => Date.now(),
  write: (line) => { process.stdout.write(`${line}\n`); },
  error: (line) => { process.stderr.write(`${line}\n`); },
});
