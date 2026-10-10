/**
 * packages/meeting-bot/src/send-now.test.ts — T-039 planner. Pure; no network, no browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { planSendNow, meetingIdentity, PLATFORM_EXTRACTORS, MAX_SEND_NOW_URL_LENGTH, TERMINAL_JOB_STATUSES, type SendNowJob } from "./send-now.js";
import { detectPlatform, type Platform } from "./platform.js";
import { PLATFORMS } from "./calendar/join-rules.js";

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

test("a job in a known terminal status is joinable again", () => {
  for (const status of TERMINAL_JOB_STATUSES) ok("https://meet.google.com/abc-defg-hij", [live("https://meet.google.com/abc-defg-hij", status)]);
});

test("unknown, missing or non-canonical statuses count as LIVE (fail closed)", () => {
  for (const status of ["Recording", " recording", "RECORDING", "Ready", "ended", "cancelled", "waiting-room", "starting", "retrying", "joining", ""]) {
    refused("https://meet.google.com/abc-defg-hij", "duplicate-live-job", [live("https://meet.google.com/abc-defg-hij", status)]);
  }
  for (const status of [undefined, null, 5, {}]) {
    refused("https://meet.google.com/abc-defg-hij", "duplicate-live-job", [{ meetingUrl: "https://meet.google.com/abc-defg-hij", status } as unknown as SendNowJob]);
  }
  // a different meeting is still not blocked by an unknown-status job
  ok("https://meet.google.com/abc-defg-hik", [live("https://meet.google.com/abc-defg-hij", "mystery")]);
});

test("the status vocabulary matches calendar/schedule-state.ts (drift guard)", () => {
  const src = readFileSync(new URL("./calendar/schedule-state.ts", import.meta.url), "utf8");
  const m = /\[("queued"[^\]]*)\]\.includes\(row\.status\)/.exec(src);
  assert.ok(m, "status literal not found in schedule-state.ts");
  const states = m[1]!.split(",").map((s) => s.trim().replace(/"/g, "")).sort();
  const known = [...TERMINAL_JOB_STATUSES, "queued", "recording"].sort();
  assert.deepEqual(known, states);
});

test("regression ISS-T039-001: every recorded reproduction, verbatim", () => {
  const NOWD = new Date("2026-10-10T10:00:00Z");
  const a = planSendNow("https://meet.google.com/lookup/abcdeg", NOWD, [{ meetingUrl: "https://meet.google.com/lookup/abcdef", status: "recording" }]);
  assert.equal(a.ok, true); // different lookup id is a different meeting
  assert.notEqual(meetingIdentity("https://meet.google.com/lookup/abcdef"), meetingIdentity("https://meet.google.com/lookup/abcdeg"));
  for (const u of ["https://meet.google.com/new", "https://meet.google.com/", "https://meet.google.com/landing", "https://zoom.us/", "https://zoom.us/foo"]) {
    const p = planSendNow(u, NOWD);
    assert.deepEqual([p.ok, p.ok ? "" : p.reason], [false, "not-a-meeting-url"], u);
  }
  refused("https://meet.google.com/lookup/abcdef", "duplicate-live-job", [live("https://meet.google.com/lookup/abcdef?authuser=2")]);
});

const CTX_A = encodeURIComponent('{"Tid":"t-1","Oid":"o-1"}');
const CTX_B = encodeURIComponent('{"Oid":"o-1","Tid":"t-1"}');
const THREAD = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_AbC%40thread.v2/0";

test("regression ISS-T039-002: every recorded reproduction, verbatim", () => {
  refused("https://teams.live.com/meet/9876543210", "duplicate-live-job", [live("https://teams.live.com/meet/9876543210?p=abc")]);
  refused("https://teams.live.com/meet/9876543210?p=abc", "duplicate-live-job", [live("https://teams.live.com/meet/9876543210")]);
  const withA = `${THREAD}?context=${CTX_A}`, withB = `${THREAD}?context=${CTX_B}`;
  refused(withB, "duplicate-live-job", [live(withA)]);
  refused(withA, "duplicate-live-job", [live(withB)]);
  refused(THREAD, "duplicate-live-job", [live(withA)]);
  refused(withA, "duplicate-live-job", [live(THREAD)]);
  refused("https://teams.live.com/l/meetup-join/19%3ameeting_AbC%40thread.v2/0", "duplicate-live-job", [live(THREAD)]); // other host
});

// Per platform: spellings that must share one key, and pairs that must differ.
const SAME: Record<string, string[]> = {
  "meet:abc-defg-hij": ["https://meet.google.com/abc-defg-hij", "https://MEET.google.com/ABC-defg-HIJ/", "https://meet.google.com/abc-defg-hij?authuser=1&hl=en#x"],
  "meet:lookup:abcdef": ["https://meet.google.com/lookup/abcdef", "https://meet.google.com/lookup/ABCDEF/?authuser=0"],
  "zoom:1234567890": ["https://zoom.us/j/1234567890?pwd=A", "https://us02web.zoom.us/w/1234567890", "https://zoom.us/s/1234567890/", "https://zoom.us/wc/join/1234567890", "https://zoom.us/wc/1234567890/join", "https://example.zoom.com/j/1234567890?utm_x=1"],
  "zoom:my:jane.doe": ["https://zoom.us/my/jane.doe", "https://acme.zoom.us/my/Jane.Doe?pwd=z"],
  "teams:meet:9876543210": ["https://teams.live.com/meet/9876543210", "https://teams.live.com/meet/9876543210?p=abc", "https://teams.microsoft.com/meet/9876543210?p=zz"],
  "teams:thread:19:meeting_abc@thread.v2": [THREAD, `${THREAD}?context=${CTX_A}`, `${THREAD}?context=${CTX_B}`, "https://teams.microsoft.com/l/meetup-join/19:meeting_abc@thread.v2/1/?x=1#f"],
  "webex:room:acme.webex.com:jdoe": ["https://acme.webex.com/meet/jdoe", "https://ACME.webex.com/join/JDoe/?utm_a=1"],
  "webex:mtid:m1a2b3": ["https://acme.webex.com/acme/j.php?MTID=m1a2b3&pwd=x", "https://acme.webex.com/acme/j.php?mtid=M1A2B3"],
  "webex:id:abc123": ["https://acme.webex.com/webappng/sites/acme/meeting/info/abc123?p=1"],
  "zoho:key:999": ["https://meeting.zoho.com/join?key=999", "https://meeting.zoho.com/join?KEY=999&utm_a=1"],
  "zoho:session:12345": ["https://webinar.zoho.in/meeting/register?sessionId=12345", "https://webinar.zoho.in/meeting/register?sessionid=12345#a"],
  "cloudonair:/events/weeklies": ["https://cloudonair.withgoogle.com/events/weeklies", "https://cloudonair.withgoogle.com/events/Weeklies/?utm_a=1"],
};
test("per platform: every spelling of one meeting shares one key", () => {
  for (const [key, urls] of Object.entries(SAME)) for (const u of urls) assert.equal(meetingIdentity(u), key, u);
});

test("per platform: different meetings have different keys", () => {
  const DIFF: Array<[string, string]> = [
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hik"],
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/lookup/abc-defg-hij"],
    ["https://zoom.us/j/1234567890", "https://zoom.us/j/1234567891"],
    ["https://zoom.us/my/jane", "https://zoom.us/my/john"],
    ["https://teams.live.com/meet/9876543210", "https://teams.live.com/meet/9876543211"],
    [THREAD, "https://teams.microsoft.com/l/meetup-join/19%3ameeting_other%40thread.v2/0"],
    ["https://acme.webex.com/meet/jdoe", "https://acme.webex.com/meet/jroe"],
    ["https://acme.webex.com/meet/jdoe", "https://other.webex.com/meet/jdoe"],
    ["https://acme.webex.com/acme/j.php?MTID=a1", "https://acme.webex.com/acme/j.php?MTID=a2"],
    ["https://meeting.zoho.com/join?key=999", "https://meeting.zoho.com/join?key=998"],
    ["https://webinar.zoho.in/meeting/register?sessionId=1", "https://webinar.zoho.in/meeting/register?sessionId=2"],
    ["https://cloudonair.withgoogle.com/events/a", "https://cloudonair.withgoogle.com/events/b"],
  ];
  for (const [x, y] of DIFF) {
    assert.ok(meetingIdentity(x) && meetingIdentity(y), `${x} / ${y} keyed`);
    assert.notEqual(meetingIdentity(x), meetingIdentity(y), `${x} vs ${y}`);
  }
});

test("recognised host without an extractable meeting id is refused, never planned", () => {
  for (const u of [
    "https://meet.google.com/", "https://meet.google.com/new", "https://meet.google.com/landing", "https://meet.google.com/lookup/", "https://meet.google.com/abc-defg-hi",
    "https://zoom.us/", "https://zoom.us/foo", "https://zoom.us/j/abc", "https://zoom.us/my/", "https://zoom.us/pricing?pwd=1",
    "https://teams.microsoft.com/", "https://teams.microsoft.com/l/meetup-join/notathread/0", "https://teams.live.com/meet/", "https://teams.live.com/download",
    "https://acme.webex.com/", "https://acme.webex.com/products/pricing", "https://acme.webex.com/acme/j.php",
    "https://meeting.zoho.com/", "https://meeting.zoho.com/join", "https://webinar.zoho.in/meeting/register",
    "https://cloudonair.withgoogle.com/", "https://cloudonair.withgoogle.com/landing", "https://cloudonair.withgoogle.com/events", "https://cloudonair.withgoogle.com/events/",
    "https://cloudonair.withgoogle.com/events/foo/bar", "https://cloudonair.withgoogle.com/events//", "https://cloudonair.withgoogle.com/?x=1",
  ]) {
    const p = planSendNow(u, NOW, []);
    assert.deepEqual([u, p.ok, p.ok ? "" : p.reason], [u, false, "not-a-meeting-url"]);
  }
});

test("the request carries the normalised URL (u.href), not the raw string", () => {
  assert.equal(ok("HTTPS://Zoom.US:443/j/12345678?pwd=A").meetingUrl, "https://zoom.us/j/12345678?pwd=A");
  assert.equal(ok("https://zoom%2eus/j/12345678").meetingUrl, "https://zoom.us/j/12345678");
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

test("regression ISS-T039-003: every recorded reproduction, verbatim", () => {
  const NOWD = new Date("2026-10-10T10:00:00Z");
  for (const u of ["https://cloudonair.withgoogle.com/landing", "https://cloudonair.withgoogle.com/events"]) {
    const p = planSendNow(u, NOWD);
    assert.deepEqual([p.ok, p.ok ? "" : p.reason], [false, "not-a-meeting-url"], u);
  }
  const p = planSendNow("https://cloudonair.withgoogle.com/events/foo/bar", NOWD);
  assert.equal(p.ok, false); // recorded as accepted at cycle 1
  // fix_direction regression: one key across spellings of /events/foo
  const keys = new Set(["https://cloudonair.withgoogle.com/events/foo", "https://cloudonair.withgoogle.com/events/Foo/?utm_x=1", "https://CLOUDONAIR.withgoogle.com/events/foo/#a"].map((u) => meetingIdentity(u)));
  assert.deepEqual([...keys], ["cloudonair:/events/foo"]);
  refused("https://cloudonair.withgoogle.com/events/foo?tk=2", "duplicate-live-job", [live("https://cloudonair.withgoogle.com/events/FOO/")]);
});

// One representative host per platform. Typed over every non-unknown Platform (compile error if one is missing).
const HOSTS: Record<Exclude<Platform, "unknown">, string> = {
  meet: "meet.google.com", teams: "teams.microsoft.com", zoom: "zoom.us", webex: "acme.webex.com",
  zoho: "meeting.zoho.com", cloudonair: "cloudonair.withgoogle.com",
};
test("EVERY platform: host root, /landing, /new, /foo and an empty path are refused as not-a-meeting-url", () => {
  const platforms = PLATFORMS.filter((p) => p !== "unknown");
  assert.deepEqual([...platforms].sort(), Object.keys(HOSTS).sort(), "HOSTS covers every platform");
  assert.deepEqual([...platforms].sort(), Object.keys(PLATFORM_EXTRACTORS).sort(), "an extractor exists for every platform");
  for (const p of platforms) {
    const host = HOSTS[p as Exclude<Platform, "unknown">];
    assert.equal(detectPlatform(`https://${host}/`), p);
    for (const path of ["/", "/landing", "/new", "/foo", ""]) {
      for (const suffix of ["", "/", "?utm_source=x"]) {
        const u = `https://${host}${path}${suffix}`;
        const r = planSendNow(u, NOW, []);
        assert.deepEqual([u, r.ok, r.ok ? "" : r.reason], [u, false, "not-a-meeting-url"]);
        assert.equal(meetingIdentity(u), undefined, u);
      }
    }
  }
});
