/**
 * packages/meeting-bot/src/send-now.test.ts — T-039 planner. Pure; no network, no browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { planSendNow, meetingIdentity, MAX_SEND_NOW_URL_LENGTH, type SendNowJob } from "./send-now.js";
import { detectPlatform } from "./platform.js";

const NOW = "2026-10-10T12:00:00.000Z";
const ok = (url: string, jobs: SendNowJob[] = []) => {
  const p = planSendNow(url, NOW, jobs);
  assert.equal(p.ok, true, `expected ok for ${url}, got ${JSON.stringify(p)}`);
  return p.ok ? p.request : (undefined as never);
};
const refused = (url: string, reason: string, jobs: SendNowJob[] = []) => {
  const p = planSendNow(url, NOW, jobs);
  assert.equal(p.ok, false, `expected refusal for ${url}`);
  assert.equal(p.ok ? "" : p.reason, reason, `reason for ${url}`);
};

const SHAPES: Array<[string, string]> = [
  ["https://meet.google.com/abc-defg-hij", "meet"],
  ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0", "teams"],
  ["https://teams.live.com/meet/9876543210", "teams"],
  ["https://us02web.zoom.us/j/1234567890?pwd=abc", "zoom"],
  ["https://zoom.us/wc/join/1234567890", "zoom"],
  ["https://acme.webex.com/meet/jdoe", "webex"],
  ["https://webinar.zoho.in/meeting/register?sessionId=12345", "zoho"],
  ["https://meeting.zoho.com/join?key=999", "zoho"],
  ["https://cloudonair.withgoogle.com/events/weeklies", "cloudonair"],
];

for (const [url, platform] of SHAPES) {
  test(`accepts ${platform} shape ${url}`, () => {
    assert.equal(detectPlatform(url), platform);
    const r = ok(url);
    assert.equal(r.platform, platform);
    assert.equal(r.source, "manual");
    assert.equal(r.meetingUrl, url);
    assert.equal(r.startTime, NOW);
    assert.ok(["vexa", "browser", "system-audio"].includes(r.strategy));
  });
}

test("accepts a Date clock and surrounding whitespace", () => {
  const p = planSendNow("  https://meet.google.com/abc-defg-hij \n", new Date(NOW));
  assert.equal(p.ok && p.request.startTime, NOW);
  assert.equal(p.ok && p.request.meetingUrl, "https://meet.google.com/abc-defg-hij");
});

test("hostile URLs are refused with typed reasons, never thrown", () => {
  refused("javascript:alert(1)", "not-https");
  refused("data:text/html,<script>1</script>", "not-https");
  refused("file:///C:/Windows/win.ini", "not-https");
  refused("http://meet.google.com/abc-defg-hij", "not-https");
  refused("ftp://zoom.us/j/1234567890", "not-https");
  refused("https://zoom.us.evil.tld/j/1234567890", "unsupported-host");
  refused("https://evilzoom.us/j/1234567890", "unsupported-host");
  refused("https://meet.google.com.evil.tld/abc-defg-hij", "unsupported-host");
  refused("https://zoom.us./j/1234567890", "unsupported-host");
  refused("https://example.com/", "unsupported-host");
  refused("https://user:pw@zoom.us/j/1234567890", "credentials-in-url");
  refused("https://zoom.us@evil.tld/j/1234567890", "credentials-in-url");
  refused("https://evil.tld@zoom.us/j/1234567890", "credentials-in-url");
  refused("https://zoom.us:8443/j/1234567890", "unexpected-port");
  refused("https://meet.google.com:80/abc-defg-hij", "unexpected-port");
  refused("https://zoom.us/j/1234567890?redirect=https://evil.tld", "embedded-redirect");
  refused("https://zoom.us/j/1234567890?x=https%3A%2F%2Fevil.tld", "embedded-redirect");
  refused("https://zoom.us/j/1234567890?x=%2F%2Fevil.tld", "embedded-redirect");
  refused("https://zoom.us/j/1234567890?x=javascript:alert(1)", "embedded-redirect");
  refused("https://zoom.us/j/1234567890?next=/other", "embedded-redirect");
  refused("https://zoom.us/j/12345\\evil", "malformed-url");
  refused("https://zoom.us/j/1234 567890", "malformed-url");
  refused("https://zoom.us/j/1234567890\r\nHost: evil", "malformed-url");
  refused("not a url", "malformed-url");
  refused("https://", "malformed-url");
  refused("", "empty-url");
  refused("   ", "empty-url");
  refused("https://zoom.us/j/1" + "0".repeat(MAX_SEND_NOW_URL_LENGTH), "url-too-long");
  refused(undefined as unknown as string, "invalid-input");
  refused(42 as unknown as string, "invalid-input");
  assert.deepEqual(planSendNow("https://meet.google.com/abc-defg-hij", "garbage"), { ok: false, reason: "invalid-clock" });
});

test("standard https default port (:443) is not a surprising port", () => {
  ok("https://zoom.us:443/j/1234567890");
});

const live = (meetingUrl: string, status = "recording"): SendNowJob => ({ meetingUrl, status });

test("duplicate of a live job is refused across normalisation variants", () => {
  const base = live("https://meet.google.com/abc-defg-hij");
  for (const v of [
    "https://meet.google.com/abc-defg-hij",
    "https://MEET.Google.COM/abc-defg-hij/",
    "https://meet.google.com/ABC-DEFG-HIJ",
    "https://meet.google.com/abc-defg-hij?authuser=1&utm_source=mail",
    "https://meet.google.com/abc-defg-hij#x",
  ]) refused(v, "duplicate-live-job", [base]);

  const zoomJob = live("https://us02web.zoom.us/j/1234567890?pwd=SECRET", "queued");
  for (const v of [
    "https://zoom.us/j/1234567890",
    "https://US05WEB.zoom.us/j/1234567890/?utm_campaign=x",
    "https://zoom.us/wc/join/1234567890?pwd=other",
    "https://zoom.us/wc/1234567890/join",
  ]) refused(v, "duplicate-live-job", [zoomJob]);

  const teams = live("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d", "joining");
  refused("https://Teams.Microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0/?context=%7b%7d&utm_x=1", "duplicate-live-job", [teams]);
});

test("a different meeting is not a duplicate, nor are look-alike ids", () => {
  const jobs = [live("https://meet.google.com/abc-defg-hij"), live("https://zoom.us/j/1234567890")];
  ok("https://meet.google.com/abc-defg-hik", jobs);
  ok("https://zoom.us/j/1234567891", jobs);
  ok("https://acme.webex.com/meet/jdoe", jobs);
  // different Teams thread, same host
  ok("https://teams.microsoft.com/l/meetup-join/19%3ameeting_other%40thread.v2/0", [
    live("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0"),
  ]);
});

test("a meeting that ended (not live) is joinable again", () => {
  for (const status of ["processing", "ready", "failed", "ended", "action_required", "cancelled", ""]) {
    ok("https://meet.google.com/abc-defg-hij", [live("https://meet.google.com/abc-defg-hij", status)]);
  }
});

test("empty and malformed liveJobs do not throw or block", () => {
  ok("https://meet.google.com/abc-defg-hij", []);
  ok("https://meet.google.com/abc-defg-hij");
  ok("https://meet.google.com/abc-defg-hij", [{ meetingUrl: "garbage", status: "recording" }, null as unknown as SendNowJob, { meetingUrl: 5 as unknown as string, status: "recording" }]);
});

test("meetingIdentity is stable and undefined for non-meeting URLs", () => {
  assert.equal(meetingIdentity("https://MEET.google.com/Abc-Defg-Hij/"), "meet:abc-defg-hij");
  assert.equal(meetingIdentity("https://eu01web.zoom.us/j/1234567890?pwd=x"), "zoom:1234567890");
  assert.equal(meetingIdentity("https://example.com/"), undefined);
  assert.equal(meetingIdentity("nope"), undefined);
});

test("planner is pure: inputs are not mutated and repeat calls agree", () => {
  const jobs = Object.freeze([Object.freeze(live("https://meet.google.com/abc-defg-hij", "processing"))]);
  const a = planSendNow("https://meet.google.com/abc-defg-hij", NOW, jobs);
  const b = planSendNow("https://meet.google.com/abc-defg-hij", NOW, jobs);
  assert.deepEqual(a, b);
});
