import {extractSessionDateTime} from "./public-webinars.js";
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

test("ClickUp invitation corpus resolves event-date DST and whole-hour PT/ET pairs", () => {
  for (const [copy, expected] of [
    ["Tuesday, October 27, 2026 at 12 PM PT / 3 PM ET", "2026-10-27T19:00:00.000Z"],
    ["27 Oct 2026 at 12 PM Pacific / 3 PM Eastern", "2026-10-27T19:00:00.000Z"],
    ["Date: January 27, 2026 Time: 12 PM PT / 3 PM ET", "2026-01-27T20:00:00.000Z"],
    ["Date: October 27, 2026 Time: 12 PM PDT / 3 PM EDT", "2026-10-27T19:00:00.000Z"],
    ["Date: January 27, 2026 Time: 12 PM PST / 3 PM EST", "2026-01-27T20:00:00.000Z"],
    ["Date: October 27, 2026 Time: 12 PM UTC", "2026-10-27T12:00:00.000Z"],
    ["Date: 2026-10-27 Time: 12 AM IST", "2026-10-26T18:30:00.000Z"],
    ["Date: October 27, 2026 Time: 12 PM Pacific Time | 3 PM Eastern Time", "2026-10-27T19:00:00.000Z"],
  ]) assert.equal(extractSessionDateTime(copy!).startTime, expected, copy);
  const instant = extractSessionDateTime("Date: October 27, 2026 Time: 12 PM PT").startTime!;
  assert.equal(new Date(Date.parse(instant) + 330 * 60_000).toISOString(), "2026-10-28T00:30:00.000Z");
  const range = extractSessionDateTime("Date: October 27, 2026 Time: 12 PM - 1 PM PT");
  assert.equal(range.startTime, "2026-10-27T19:00:00.000Z");
  assert.equal(range.endTime, "2026-10-27T20:00:00.000Z");
});

test("invalid, ambiguous and unassociated invitation times never become confident schedules", () => {
  for (const copy of [
    "Date: October 27, 2026 Time: 12 PM PT / 4 PM ET",
    "Date: February 30, 2026 Time: 12 PM PT",
    "Date: 2026-13-01 Time: 12 PM UTC", "Date: 2026-02-29 Time: 12 PM UTC",
    "Date: October 27, 2026 Time: 00 PM PT", "Date: October 27, 2026 Time: 13 PM PT",
    "Date: October 27, 2026 Time: 12:60 PM PT", "Date: October 27, 2026 Time: 112 PM PT",
    "Date: March 8, 2026 Time: 2:30 AM PT", "Date: November 1, 2026 Time: 1:30 AM PT",
    "Date: January 27, 2026 Time: 12 PM PDT", "Date: July 27, 2026 Time: 12 PM EST",
    "Date: October 27, 2026 Time: 12 PM CET", "Date: October 27, 2026 Time: 12 PM",
    "Date: October 27, 2026 Time: 2 PM - 1 PM PT",
    "Date: October 27 Time: 12 PM PT\nSent: October 26, 2026 3 PM ET",
    "Date: February 30, 2026\nSent: October 26, 2026 3 PM ET",
    "Date: October 27, 2026\nDate: October 28, 2026 Time: 12 PM PT",
    "Date: October 27, 20260 Time: 12 PM PT",
    "Date: October 27, 2026 Time: 12 PM PT / 12:600 PM ET",
    "Date: October 27, 2026 Time: 12 - 1 PM PT",
  ]) assert.deepEqual(extractSessionDateTime(copy), {}, copy);
  assert.equal(extractSessionDateTime("Date: November 1, 2026 Time: 1:30 AM PDT").startTime, "2026-11-01T08:30:00.000Z");
  assert.equal(extractSessionDateTime("Date: November 1, 2026 Time: 1:30 AM PST").startTime, "2026-11-01T09:30:00.000Z");
});

test("year inference requires trusted bounded context and records its source", () => {
  const copy = "Join ClickUp on October 27 at 12 PM PT / 3 PM ET";
  assert.deepEqual(extractSessionDateTime(copy), {});
  const parsed = extractSessionDateTime(copy, {receivedAt: "2026-10-20T16:00:00.000Z"});
  assert.equal(parsed.startTime, "2026-10-27T19:00:00.000Z");
  assert.equal(parsed.timeProvenance?.yearSource, "provider-receivedAt");
  assert.deepEqual(parsed.timeProvenance?.timeZones, ["America/Los_Angeles", "America/New_York"]);
  assert.equal(extractSessionDateTime("January 2 at 12 PM PT", {reference: new Date("2026-12-28T00:00:00Z")}).startTime,
    "2027-01-02T20:00:00.000Z");
  assert.equal(extractSessionDateTime("Date: October 27, 2026 Time: 12 PM PT").timeProvenance?.yearSource, "explicit");
  for (const receivedAt of ["bad", "2026-07-01T00:00:00Z", "2026-02-30T00:00:00Z"]) {
    assert.deepEqual(extractSessionDateTime(copy, {receivedAt}), {});
  }
});

import { scanGmailForMeetingCandidates } from "./gws-gmail.js";
test("Gmail review requires invitation shape and excludes verified own-domain office mail", async () => {
  const cases = [
    ["Webinar invitation", "Join webinar https://meet.google.com/abc-defg-hij", "host@external.org", true],
    ["Webinar registration", "Register https://external.org/register", "host@external.org", true],
    ["Details enclosed", "https://meet.google.com/abc-defg-hij", "host@external.org", false],
    ["Newsletter", "Our webinar digest https://meet.google.com/abc-defg-hij", "host@external.org", false],
    ["Details enclosed", "General account update", "host@external.org", false],
    ["Invitation to our community", "Register https://external.org/register", "host@external.org", false],
    ["Webinar invitation", "Seats now available. Join https://meet.google.com/abc-defg-hij", "host@external.org", true],
    ["Webinar provider update", "Provider homepage https://meet.google.com/abc-defg-hij", "host@external.org", false],
    ["Webinar invitation", "Watch live https://youtube.com/live/AbCdEfG123_", "host@external.org", true],
    ["Webinar recording", "Watch again https://youtube.com/watch?v=AbCdEfG123_", "host@external.org", false],
    ["Webinar invitation", "Join webinar https://meet.google.com/abc-defg-hij", "host@VIDYSEA.COM", false],
    ["Webinar invitation", "Join webinar https://meet.google.com/abc-defg-hij", "host@office.vidysea.com", false],
    ["Webinar invitation", "Join webinar https://meet.google.com/abc-defg-hij", "host@notvidysea.com", true],
    ["Details enclosed", "Date: October 15, 2099 Time: 10 AM UTC https://meet.google.com/abc-defg-hij", "host@external.org", true],
  ] as const;
  for (const [subject, body, sender, eligible] of cases) {
    let summary: any;
    const rows = await scanGmailForMeetingCandidates(10, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "policy"}]} : {id: "policy", payload: {
      headers: [{name: "From", value: sender}, {name: "Subject", value: subject}], mimeType: "text/plain", body: {data: Buffer.from(body).toString("base64url")}}}),
      {ownDomains: ["Vidysea.Com"], aliases: "events@external.org", labelIds: "Label_1", onSummary: value => {summary = value;}});
    assert.equal(rows.length, eligible ? 1 : 0, subject + ":" + sender);
    assert.equal(summary.candidates, rows.length); assert.equal(summary.listed, 1); assert.equal(summary.complete, true);
    assert.equal(summary.excludedInternal, sender.toLowerCase().endsWith("@vidysea.com") || sender.endsWith(".vidysea.com") ? 1 : 0);
    assert.equal(summary.excludedNonMeeting, eligible || summary.excludedInternal ? 0 : 1);
  }
  for (const ownDomains of [["bad domain"], [".com"], ["evil.com OR anything"], ["host@vidysea.com"], Array(21).fill("example.org")]) {
    let called = false; await assert.rejects(scanGmailForMeetingCandidates(10, async () => {called = true; return "{}";}, {ownDomains}), /unavailable/); assert.equal(called, false);
  }
});

test("Gmail refuses inconsistent decoded evidence sizes, invalid text and unresolved later time", async () => {
  const encode = (text: string) => Buffer.from(text).toString("base64url");
  const first = {mimeType: "text/plain", body: {data: encode("Webinar invitation Date: October 15, 2099 Time: 10 AM UTC https://meet.google.com/abc-defg-hij")}};
  for (const part of [{mimeType: "text/plain", body: {data: encode("tail"), size: 100}}, {mimeType: "text/plain", body: {data: Buffer.from([255]).toString("base64url")}},
    {mimeType: "text/plain", body: {data: encode("Date: October 16, 2099 Time: unknown")}}, {mimeType: "text/plain", body: {attachmentId: "body", size: 100}}]) {
    let summary: any;
    await assert.rejects(scanGmailForMeetingCandidates(10, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "bounded"}]} : args.includes("attachments") ? {data: encode("tail")} :
      {id: "bounded", payload: {headers: [{name: "From", value: "host@external.org"}], mimeType: "multipart/mixed", parts: [first, part]}}), {onSummary: value => {summary = value;}}), /^Error: Gmail discovery unavailable$/);
    assert.equal(summary.complete, false); assert.equal(summary.incompleteMessages, 1); assert.equal(summary.candidates, 0);
  }
  for (const parts of [[first, {...first, body: {data: encode("Webinar invitation Date: October 16, 2099 Time: 10 AM UTC https://meet.google.com/abc-defg-hij")}}], [first, first]]) {
    const [row] = await scanGmailForMeetingCandidates(10, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "bounded"}]} :
      {id: "bounded", payload: {headers: [{name: "From", value: "host@external.org"}], mimeType: "multipart/mixed", parts}}));
    assert.equal(row?.startTime, parts[0] === parts[1] ? "2099-10-15T10:00:00.000Z" : undefined);
  }
});
test("Gmail global deduplicated acquisition cap keeps canonical summary counters bounded", async () => {
  let summary: any, bodies = 0;
  await assert.rejects(scanGmailForMeetingCandidates(500, async args => {
    if (!args.includes("list")) {bodies++; throw Error("must not fetch incomplete inventory");}
    const params = JSON.parse(args[args.indexOf("--params") + 1]!); const page = Number(params.pageToken ?? 0);
    return JSON.stringify({messages: Array.from({length: 500}, (_, i) => ({id: (params.labelIds ? "label" : "broad") + String(page * 500 + i)})), ...(!params.labelIds && page < 19 ? {nextPageToken: String(page + 1)} : {})});
  }, {labelIds: "Label_1", onSummary: value => {summary = value;}}), /^Error: Gmail discovery unavailable$/);
  assert.equal(bodies, 0); assert.equal(summary.listed, 10000); assert.equal(summary.complete, false); assert.equal(summary.candidates, 0);
});

test("repeated same-date banner does not hide an invitation but conflicting dates remain unknown",()=>{const context={receivedAt:"2026-10-26T21:05:19.000Z"};assert.equal(extractSessionDateTime("oct\n27 Your Instant Project Management Expert 50 min Tuesday, October 27, 12:00 PM PT / 3:00 PM ET",context).startTime,"2026-10-27T19:00:00.000Z");assert.deepEqual(extractSessionDateTime("October 26 banner October 27, 12:00 PM PT / 3:00 PM ET",context),{});});
