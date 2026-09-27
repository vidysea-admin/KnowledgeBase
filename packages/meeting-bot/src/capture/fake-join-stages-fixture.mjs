#!/usr/bin/env node
/**
 * packages/meeting-bot/src/capture/fake-join-stages-fixture.mjs — ISS-324 test fixture only, never
 * imported by production code. Sibling of fake-join-fixture.mjs, but models the STARTUP STAGES that
 * the Ashoka 2026-09-27 failure turned on: sb_join.py emits "starting", then SB() brings the browser
 * up (opaque, slow, now ticking "bootstrapping" every 10s), and only then "opened".
 *
 * Mode comes from LKB_FIXTURE_MODE because launch() fixes the child's argv:
 *   progress-then-open  — starting, LKB_FIXTURE_TICKS × bootstrapping every LKB_FIXTURE_TICK_MS,
 *                         then opened. Reproduces a cold start that outlasts the stall window while
 *                         never actually being stuck.
 *   silent              — starting, then nothing at all (a genuinely wedged bring-up).
 *   stderr-then-silent  — starting, a diagnostic on stderr, then nothing.
 */
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const stopFile = args[args.indexOf("--stop-file") + 1];
const mode = process.env.LKB_FIXTURE_MODE ?? "progress-then-open";
const tickMs = Number(process.env.LKB_FIXTURE_TICK_MS ?? "100");
const ticks = Number(process.env.LKB_FIXTURE_TICKS ?? "12");

const emit = (event, extra = {}) =>
  process.stdout.write(`${JSON.stringify({ event, t: Date.now(), ...extra })}\n`);

emit("starting");

function holdUntilStopFile() {
  const poll = setInterval(() => {
    if (stopFile && existsSync(stopFile)) {
      clearInterval(poll);
      process.exit(0);
    }
  }, 25);
  setTimeout(() => process.exit(0), 30_000).unref(); // orphan safety net only
}

if (mode === "silent") {
  holdUntilStopFile();
} else if (mode === "stderr-then-silent") {
  process.stderr.write("selenium: could not reach the chromedriver mirror, retrying\n");
  holdUntilStopFile();
} else {
  let n = 0;
  const boot = setInterval(() => {
    n += 1;
    if (n <= ticks) {
      emit("bootstrapping", { stage: "driver-bringup", seconds: n });
      return;
    }
    clearInterval(boot);
    emit("driver-ready");
    emit("navigating", { url: args[0] });
    emit("opened", { url: args[0], pid: process.pid });
    holdUntilStopFile();
  }, tickMs);
}
