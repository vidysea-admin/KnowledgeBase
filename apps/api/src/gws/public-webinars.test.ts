import test from "node:test";
import assert from "node:assert/strict";
import { createPublicWebinarDiscovery, discoverPublicWebinars, parsePublicWebinars, supportedMeetingUrl } from "./public-webinars.js";

const source = {id: "college", url: "https://college.example/events"};
const now = new Date("2026-10-14T12:00:00Z");
const event = {"@type": "EducationEvent", name: "Career guidance webinar", startDate: "2026-10-15T10:00:00+05:30", endDate: "2026-10-15T11:00:00+05:30", url: "/register/session"};
const html = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

test("public publisher events retain literal time/registration evidence and never personal join approval", () => {
  const result = parsePublicWebinars(html({"@graph": [event, event]}), source, now);
  assert.equal(result.incomplete, false);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.startTime, "2026-10-15T04:30:00.000Z");
  assert.equal(candidate.registrationUrl, "https://college.example/register/session");
  assert.equal(candidate.registrationOnly, true);
  assert.equal(candidate.personalJoinVerified, false);
  assert.equal(candidate.reviewRequired, true);
  assert.equal(candidate.sourceUrl, source.url);
});

test("an organizer event detail page remains review evidence rather than an invented registration form", () => {
  const candidate = parsePublicWebinars(html({...event, url: "/events/session"}), source, now).candidates[0]!;
  assert.equal(candidate.eventUrl, "https://college.example/events/session");
  assert.equal(candidate.registrationUrl, undefined);
  assert.equal(candidate.registrationOnly, undefined);
  assert.equal(candidate.reviewRequired, true);
  assert.equal(candidate.personalJoinVerified, false);
});

test("public discovery rejects guessed times, impossible dates, offsite/userinfo URLs and invalid end times", () => {
  for (const patch of [{startDate: "tomorrow at 10"}, {startDate: "2027-02-30T10:00:00Z"},
    {url: "https://evil.example/register"}, {url: "https://zoom.us@evil.example/register"},
    {endDate: "2026-10-15T09:00:00+05:30"}, {name: "Career\nsecret"}]) {
    const result = parsePublicWebinars(html({...event, ...patch}), source, now);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.incomplete, true);
  }
});

test("cancelled, old, unrelated and unstructured public prose never schedules a candidate", () => {
  for (const patch of [{eventStatus: "https://schema.org/EventCancelled"}, {startDate: "2026-10-01T10:00:00Z"},
    {name: "Online crypto trading webinar"}, {"@type": "Article"}]) {
    assert.equal(parsePublicWebinars(html({...event, ...patch}), source, now).candidates.length, 0);
  }
  assert.equal(parsePublicWebinars("Career guidance tomorrow https://zoom.us/j/123", source, now).foundEvents, false);
});

test("platform URL recognition requires actual hostname boundary and HTTPS without authority tricks", () => {
  for (const url of ["https://zoom.us/j/1", "https://tenant.webex.com/meet/user", "https://meet.google.com/abc-defg-hij"]) assert.equal(supportedMeetingUrl(url), true);
  for (const url of ["https://zoom.us.evil.example/j/1", "https://evil.example/zoom.us/j/1", "https://zoom.us@evil.example/j/1", "http://zoom.us/j/1", "https://zoom.us:8443/j/1", "https://zoom.us/j/1\n"]) assert.equal(supportedMeetingUrl(url), false);
});

test("public acquisition pins vetted DNS, isolates incomplete scopes and retains explicit sanitized gaps", async () => {
  const calls: {url: string; address: string; maxBytes: number; timeoutMs: number}[] = [];
  const result = await discoverPublicWebinars([source, {id: "broken", url: "https://broken.example/events"}], {
    lookup: async () => ["93.184.216.34"],
    request: async (url, options) => {
      calls.push({url, ...options});
      if (url.includes("broken")) throw new Error("private credential text must never escape");
      return {status: 200, location: null, body: html(event)};
    },
  }, now);
  assert.equal(result.complete, false);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.gaps, [{sourceId: "broken", reason: "unavailable"}]);
  assert.equal(calls[0]?.address, "93.184.216.34");
  assert.equal(calls[0]?.maxBytes, 512000);
  assert.ok(calls[0]!.timeoutMs <= 3000);
});

test("private/mixed DNS and cross-host redirect are refused before transport to destination", async () => {
  let calls = 0;
  const privateResult = await discoverPublicWebinars([source], {lookup: async () => ["93.184.216.34", "127.0.0.1"], request: async () => {calls++; throw new Error("unexpected");}}, now);
  assert.equal(calls, 0);
  assert.equal(privateResult.complete, false);
  const lookedUp: string[] = [];
  const redirectResult = await discoverPublicWebinars([source], {lookup: async host => {lookedUp.push(host); return ["93.184.216.34"];}, request: async () => {
    calls++; return {status: 302, location: "https://evil.example/register", body: ""};
  }}, now);
  assert.equal(calls, 1);
  assert.deepEqual(lookedUp, ["college.example"], "an unapproved redirect does not even reach the resolver");
  assert.equal(redirectResult.complete, false);
});

test("provider errors and missing/invalid Event coverage never become successful empty scans", async () => {
  for (const body of ["plain unrelated prose", '<script type="application/ld+json">{broken}</script>', html({...event, startDate: "tomorrow"})]) {
    const result = await discoverPublicWebinars([source], {lookup: async () => ["93.184.216.34"], request: async () => ({status: 200, location: null, body})}, now);
    assert.equal(result.complete, false);
    assert.equal(result.gaps.length, 1);
  }
  const errorResult = await discoverPublicWebinars([source], {lookup: async () => ["93.184.216.34"], request: async () => ({status: 500, location: null, body: html(event)})}, now);
  assert.equal(errorResult.complete, false);
  assert.equal(errorResult.candidates.length, 0);
  await assert.rejects(discoverPublicWebinars([], undefined, now), /configuration/);
});

test("connected public feed refuses foreign/missing tenant before lookup and retains server configuration", async () => {
  let lookups = 0;
  const sources = [source];
  const scan = createPublicWebinarDiscovery("tenant-1", sources, {lookup: async () => {lookups++; return ["93.184.216.34"];},
    request: async () => ({status: 200, location: null, body: html({...event, startDate: "2099-10-15T10:00:00Z", endDate: undefined})})});
  sources[0] = {...source, url: "https://evil.example/events"};
  await assert.rejects(scan("tenant-2"), /owner mismatch/);
  await assert.rejects(createPublicWebinarDiscovery(undefined, [source])("tenant-1"), /owner mismatch/);
  assert.equal(lookups, 0);
  const result = await scan("tenant-1");
  assert.equal(result.tenantId, "tenant-1");
  assert.equal(result.candidates[0]?.sourceUrl, source.url);
});
