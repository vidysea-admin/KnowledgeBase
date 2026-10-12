/**
 * packages/ingest/src/retention/retention-report-cli.ts - T-046. Entry point for the report-only retention
 * dry run: `node --import tsx packages/ingest/src/retention/retention-report-cli.ts --tenant ... --data-root ...
 * --min-age-days N --clip-padding-seconds N`. Wiring it into the `lkb` dispatcher is a separate
 * step (meeting-bot would import it through @lkb/ingest once it is exported).
 */
import { runRetentionReport } from "./retention-report.js";

process.exitCode = runRetentionReport(process.argv.slice(2), {
  now: () => Date.now(),
  write: (line) => { process.stdout.write(`${line}\n`); },
  error: (line) => { process.stderr.write(`${line}\n`); },
});
