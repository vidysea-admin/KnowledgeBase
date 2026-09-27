#!/usr/bin/env node
/**
 * scripts/webinar/argv-dump-fixture.mjs — ISS-323 test fixture only, never used in production.
 * start-record-detached.ps1's `-CliEntry` seam points at this instead of the real meeting-bot CLI,
 * so the regression test can check ARGV FIDELITY (a Zoom URL containing `&`, a title containing
 * spaces) without starting a recording — the exact thing the pnpm/.cmd shim used to destroy.
 *
 * LKB_ARGV_DUMP  — file to write the received argv to, as JSON.
 * LKB_FIXTURE_EXIT — if set, exit with this code immediately (models a recorder that dies at once).
 */
import { writeFileSync } from "node:fs";

const dump = process.env.LKB_ARGV_DUMP;
if (dump) writeFileSync(dump, JSON.stringify(process.argv.slice(2)), "utf8");

const code = process.env.LKB_FIXTURE_EXIT;
if (code !== undefined && code !== "") process.exit(Number(code));

// Outlive the launcher's liveness window, then go away. Kept short because the launcher's
// Start-Process redirects leak the caller's stdio handles, so the test blocks until this exits.
setTimeout(() => process.exit(0), 8_000);
