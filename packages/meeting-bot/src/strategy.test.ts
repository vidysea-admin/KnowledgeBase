/**
 * packages/meeting-bot/src/strategy.test.ts — T-024 C6. `selectJoinStrategy` maps each platform
 * correctly. See strategy.ts's header for the verified Vexa-support finding this mapping follows
 * (meet/teams/zoom -> vexa, webex -> browser, unknown -> system-audio).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectJoinStrategy } from "./strategy.js";

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
