/**
 * packages/meeting-bot/src/strategy.test.ts — T-024 C6. `selectJoinStrategy` maps each platform
 * correctly. See strategy.ts's header for the verified Vexa-support finding this mapping follows
 * (meet/teams/zoom -> vexa, webex -> browser, unknown -> system-audio).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectJoinStrategy } from "./strategy.js";
import { detectPlatform } from "./platform.js";
import { recordingBackend } from "./capture/record-commands.js";

test("routes meet, teams, and zoom to vexa (verified native support)", () => {
  assert.equal(selectJoinStrategy("meet"), "vexa");
  assert.equal(selectJoinStrategy("teams"), "vexa");
  assert.equal(selectJoinStrategy("zoom"), "vexa");
});

test("routes webex to browser (not in Vexa's supported-platform list)", () => {
  assert.equal(selectJoinStrategy("webex"), "browser");
});

test("routes zoho and cloudonair to the local browser joiner", () => {
  assert.equal(selectJoinStrategy("zoho"), "browser");
  assert.equal(selectJoinStrategy("cloudonair"), "browser");
});

test("routes unknown to system-audio (universal fallback)", () => {
  assert.equal(selectJoinStrategy("unknown"), "system-audio");
});

// D-207 item 4. The join strategy label is NOT the capture backend: the backend comes from recordingBackend (capture/record-commands.ts),
// which the Linux scheduler pins with `--backend tab` (scripts/webinar/scheduler/dispatch.mjs). These tests pin that for an OnAir URL
// with an injected host platform, so a regression to OBS on Linux (the image has no OBS) fails here.
const ONAIR = "https://cloudonair.withgoogle.com/events/some-event";
test("cloudonair on linux records with tab capture and can never select OBS", () => {
  assert.equal(detectPlatform(ONAIR), "cloudonair");
  assert.equal(recordingBackend(["record", ONAIR, "--backend", "tab"], {}, "linux"), "tab");
  assert.equal(recordingBackend(["record", ONAIR], { LKB_CAPTURE_BACKEND: "tab" }, "linux"), "tab");
  assert.equal(recordingBackend(["record", ONAIR], {}, "linux"), "tab", "no flag and no env: tab");
  assert.throws(() => recordingBackend(["record", ONAIR, "--backend", "obs"], {}, "linux"), /Windows-only/);
  assert.throws(() => recordingBackend(["record", ONAIR], { LKB_CAPTURE_BACKEND: "obs" }, "linux"), /Windows-only/);
});

test("cloudonair on win32 is unchanged: tab by default, OBS only when asked for explicitly", () => {
  assert.equal(recordingBackend(["record", ONAIR], {}, "win32"), "tab");
  assert.equal(recordingBackend(["record", ONAIR, "--backend", "obs"], {}, "win32"), "obs");
  assert.equal(recordingBackend(["record", ONAIR], { LKB_CAPTURE_BACKEND: "obs" }, "win32"), "obs");
  assert.equal(selectJoinStrategy("cloudonair"), "browser", "label unchanged on every host");
});
