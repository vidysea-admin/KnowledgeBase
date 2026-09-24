/**
 * packages/meeting-bot/src/platform.test.ts — T-024 C6. `detectPlatform` on real-shaped URLs
 * across all 4 platform buckets plus `unknown`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectPlatform } from "./platform.js";

test("detects meet.google.com URLs", () => {
  assert.equal(detectPlatform("https://meet.google.com/abc-defg-hij"), "meet");
});

test("detects teams.microsoft.com URLs", () => {
  assert.equal(
    detectPlatform("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0"),
    "teams",
  );
});

test("detects zoom.us URLs", () => {
  assert.equal(detectPlatform("https://us02web.zoom.us/j/1234567890?pwd=abc"), "zoom");
});

test("detects webex.com URLs", () => {
  assert.equal(detectPlatform("https://acme.webex.com/acme/j.php?MTID=abc123"), "webex");
});

test("detects Zoho webinar/meeting URLs", () => {
  assert.equal(
    detectPlatform("https://webinar.zoho.in/meeting/register/join?registerKey=abc&sessionId=1370765131"),
    "zoho",
  );
  assert.equal(detectPlatform("https://meeting.zoho.com/meeting/join?key=123"), "zoho");
  assert.equal(detectPlatform("https://zoho.in.evil.example/meeting"), "unknown");
});

test("detects Google Cloud OnAir (Weeklies) URLs", () => {
  assert.equal(detectPlatform("https://cloudonair.withgoogle.com/events/weeklies-x"), "cloudonair");
});

test("falls back to unknown for an unrecognized platform", () => {
  assert.equal(detectPlatform("https://example.com/some-other-video-call/123"), "unknown");
});

test("falls back to unknown for an unparseable URL", () => {
  assert.equal(detectPlatform("not-a-url"), "unknown");
});

test("matches bare zoom.com and subdomains too", () => {
  assert.equal(detectPlatform("https://zoom.com/j/999"), "zoom");
  assert.equal(detectPlatform("https://sub.meet.google.com/xyz"), "meet");
});
