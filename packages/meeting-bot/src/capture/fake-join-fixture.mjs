#!/usr/bin/env node
/**
 * packages/meeting-bot/src/capture/fake-join-fixture.mjs — T-033/ISS-300 test fixture only, never
 * imported by production code. Stands in for py/sb_join.py in obs-windows.test.ts via the
 * already-injectable ObsBrowserConfig fields `python: process.execPath` / `joinScript: <this
 * file>` — no new production seam needed for the child-process half of `launch()`.
 *
 * Mirrors sb_join.py's real contract just enough for the obs-windows tests: prints one JSON
 * "opened" event (carrying its own pid so a test can prove termination), then exits as soon as the
 * `--stop-file` path it was given appears on disk — the same signal the real script honours.
 * Usage: node fake-join-fixture.mjs <url> --profile <dir> --title <t> --stop-file <path> [--no-click]
 */
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const stopFile = args[args.indexOf("--stop-file") + 1];

process.stdout.write(`${JSON.stringify({ event: "opened", t: Date.now(), pid: process.pid })}\n`);

const poll = setInterval(() => {
  if (stopFile && existsSync(stopFile)) {
    clearInterval(poll);
    process.exit(0);
  }
}, 25);

// Safety net only — real callers always write the stop file; this just stops an orphan if a test
// forgets to signal.
setTimeout(() => process.exit(0), 10_000).unref();
