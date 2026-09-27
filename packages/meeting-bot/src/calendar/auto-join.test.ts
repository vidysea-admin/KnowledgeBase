/**
 * packages/meeting-bot/src/calendar/auto-join.test.ts — T-025 C5 + U5 (u5-auto-record-scheduler).
 * `selectEventsToAutoJoin` against fixture events, and `selectAutoRecordItems` / trusted-sender /
 * redaction helpers — no I/O, fake clock throughout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { CalendarEvent } from "./calendar-client.js";
import {
  selectEventsToAutoJoin, selectAutoRecordItems, isTrustedSender, loadTrustedSenderConfig,
  redactJoinLink, type AutoRecordCandidateInput, type TrustedSenderConfig,
} from "./auto-join.js";

const NOW = "2026-09-03T10:00:00Z";
const LEAD_MINUTES = 2;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1", title: "Test meeting", startTime: "2026-09-03T10:01:00Z",
    endTime: "2026-09-03T11:00:00Z", meetingUrl: "https://meet.google.com/abc-defg-hij",
    ...overrides,
  };
}

test("an event with no meetingUrl is excluded", () => {
  const e = event({ meetingUrl: undefined });
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), []);
});

test("an event starting more than leadMinutes in the future is excluded", () => {
  const e = event({ startTime: "2026-09-03T10:05:00Z" }); // 5 min out, lead is 2
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), []);
});

test("an event that already ended is excluded", () => {
  const e = event({ startTime: "2026-09-03T08:00:00Z", endTime: "2026-09-03T09:00:00Z" });
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), []);
});

test("an event within the join window is included", () => {
  const e = event({ startTime: "2026-09-03T10:01:00Z" }); // 1 min out, within lead=2
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), [e]);
});

test("an in-progress event (already started, not yet ended) is included", () => {
  const e = event({ startTime: "2026-09-03T09:55:00Z", endTime: "2026-09-03T10:30:00Z" });
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), [e]);
});

test("boundary: exactly leadMinutes before start is included", () => {
  const e = event({ startTime: "2026-09-03T10:02:00Z" }); // exactly 2 min out
  assert.deepEqual(selectEventsToAutoJoin([e], NOW, LEAD_MINUTES), [e]);
});

test("multiple qualifying events come back sorted by startTime ascending", () => {
  const later = event({ id: "later", startTime: "2026-09-03T10:02:00Z" });
  const sooner = event({ id: "sooner", startTime: "2026-09-03T10:00:30Z" });
  const result = selectEventsToAutoJoin([later, sooner], NOW, LEAD_MINUTES);
  assert.deepEqual(result.map((e) => e.id), ["sooner", "later"]);
});

// -------------------------------------------------------------------------------------------
// U5 — selectAutoRecordItems, isTrustedSender, loadTrustedSenderConfig, redactJoinLink
// -------------------------------------------------------------------------------------------

const TRUSTED: TrustedSenderConfig = {
  emails: ["karunn@vidysea.com"],
  domains: ["theoutreachcollective.in", "ashoka.edu.in", "zoho.com", "zoom.us"],
};

function candidate(overrides: Partial<AutoRecordCandidateInput> = {}): AutoRecordCandidateInput {
  return {
    id: "c1", title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in",
    senderDomain: "theoutreachcollective.in", status: "auto_approved",
    meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123",
    startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z",
    kind: "upcoming",
    ...overrides,
  };
}

const TICK_NOW = "2026-09-28T12:26:00Z"; // 4 min before candidate() start, lead=5
const LEAD5 = 5;

test("isTrustedSender: exact email match", () => {
  assert.equal(isTrustedSender("karunn@vidysea.com", undefined, TRUSTED), true);
  assert.equal(isTrustedSender("KARUNN@VIDYSEA.COM", undefined, TRUSTED), true); // case-insensitive
});

test("isTrustedSender: domain match, derived from email when no separate domain given", () => {
  assert.equal(isTrustedSender("someone@zoho.com", undefined, TRUSTED), true);
  assert.equal(isTrustedSender("someone@unknown.example", undefined, TRUSTED), false);
});

test("isTrustedSender: explicit domain wins even if email itself isn't in the list", () => {
  assert.equal(isTrustedSender("random@random.example", "ashoka.edu.in", TRUSTED), true);
});

test("isTrustedSender: neither email nor domain given -> false", () => {
  assert.equal(isTrustedSender(undefined, undefined, TRUSTED), false);
});

test("loadTrustedSenderConfig: falls back to the fix-cycle-2 defaults with no env set (ISS-318)", () => {
  const cfg = loadTrustedSenderConfig({});
  assert.deepEqual(cfg.emails, ["karunn@vidysea.com", "umeshsugara@vidysea.com"]);
  assert.deepEqual(cfg.domains, ["theoutreachcollective.in", "ashoka.edu.in"]);
});

// ISS-318 (fix cycle 2): the checker's own reproduction — zoho.com/zoom.us must no longer be
// default-trusted, since they are the platform VENDORS' own public, multi-tenant email domains,
// not vetted partner organizations (Umesh's approval named "trusted senders", not those).
test("loadTrustedSenderConfig: defaults no longer trust the platform vendor domains zoho.com/zoom.us (ISS-318)", () => {
  const cfg = loadTrustedSenderConfig({});
  assert.ok(!cfg.domains.includes("zoho.com"), "zoho.com must not be a default-trusted domain");
  assert.ok(!cfg.domains.includes("zoom.us"), "zoom.us must not be a default-trusted domain");
});

test("isTrustedSender: with the real DEFAULT config, a stranger on zoho.com/zoom.us is untrusted (ISS-318)", () => {
  const defaults = loadTrustedSenderConfig({});
  assert.equal(isTrustedSender("random.stranger@zoho.com", undefined, defaults), false);
  assert.equal(isTrustedSender("marketing@zoom.us", undefined, defaults), false);
  // The two genuine partner domains + the two named accounts still are.
  assert.equal(isTrustedSender("someone@theoutreachcollective.in", undefined, defaults), true);
  assert.equal(isTrustedSender("someone@ashoka.edu.in", undefined, defaults), true);
  assert.equal(isTrustedSender("karunn@vidysea.com", undefined, defaults), true);
  assert.equal(isTrustedSender("umeshsugara@vidysea.com", undefined, defaults), true);
});

test("loadTrustedSenderConfig: env overrides, comma-separated + lower-cased", () => {
  const cfg = loadTrustedSenderConfig({
    AUTO_RECORD_TRUSTED_EMAILS: "A@Example.com, b@example.com",
    AUTO_RECORD_TRUSTED_DOMAINS: "Foo.com,bar.com",
  });
  assert.deepEqual(cfg.emails, ["a@example.com", "b@example.com"]);
  assert.deepEqual(cfg.domains, ["foo.com", "bar.com"]);
});

test("redactJoinLink: strips a tk= token, keeps the rest of the URL", () => {
  const redacted = redactJoinLink("https://zoho.com/meeting/abc?tk=SECRET123&foo=bar");
  assert.ok(!redacted.includes("SECRET123"), `redacted URL still contains the secret: ${redacted}`);
  assert.ok(redacted.includes("foo=bar"));
  assert.ok(redacted.startsWith("https://zoho.com/meeting/abc?"));
});

test("redactJoinLink: a URL with no token param is returned unchanged", () => {
  assert.equal(redactJoinLink("https://zoho.com/meeting/abc"), "https://zoho.com/meeting/abc");
});

test("redactJoinLink: an unparseable URL never throws", () => {
  assert.equal(redactJoinLink("not a url"), "<unparseable-join-link-redacted>");
});

test("selectAutoRecordItems: a trusted, approved candidate with a join link is scheduled", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate()], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.toSchedule[0]!.sessionKey, "gmail:c1");
  assert.equal(result.skipped.length, 0);
});

test("selectAutoRecordItems: registrationOnly -> needs-registration, never scheduled", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ registrationOnly: true })], now: TICK_NOW,
    leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.deepEqual(result.skipped, [
    { sessionKey: "gmail:c1", source: "gmail", sourceId: "c1", title: "TOC webinar", reason: "needs-registration" },
  ]);
});

test("selectAutoRecordItems: no meetingUrl -> no-join-link", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ meetingUrl: undefined })], now: TICK_NOW,
    leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "no-join-link");
});

test("selectAutoRecordItems: an already-ended candidate -> past", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ startTime: "2026-09-28T09:00:00Z", endTime: "2026-09-28T10:00:00Z" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "past");
});

test("selectAutoRecordItems: more than leadMinutes before start -> silently excluded (not reported)", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ startTime: "2026-09-28T14:00:00Z", endTime: "2026-09-28T15:00:00Z" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped.length, 0);
});

test("selectAutoRecordItems: pending candidate from an untrusted sender -> untrusted-sender", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [],
    candidates: [candidate({ status: "pending", senderEmail: "stranger@unknown.example", senderDomain: "unknown.example" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "untrusted-sender");
});

test("selectAutoRecordItems: pending candidate whose sender IS on the config allowlist is scheduled " +
  "(config trust doesn't need to wait for 3 manual approvals)", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [],
    candidates: [candidate({ status: "pending", senderEmail: "karunn@vidysea.com", senderDomain: "vidysea.com" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 1);
});

test("selectAutoRecordItems: a rejected candidate is never auto-scheduled even from a trusted domain", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ status: "rejected" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "untrusted-sender");
});

test("selectAutoRecordItems: a sessionKey already in alreadyScheduled -> duplicate-session", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate()], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: new Set(["gmail:c1"]),
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "duplicate-session");
});

test("selectAutoRecordItems: overlap-lost — OBS records one at a time; earlier start wins", () => {
  // Both starts must fall within the 5-min lead window of TICK_NOW (12:26) to be "due" at all —
  // 12:28 and 12:29 both qualify (window allows up to 12:31); their end times still overlap.
  const earlier = candidate({ id: "c-earlier", startTime: "2026-09-28T12:28:00Z", endTime: "2026-09-28T13:00:00Z" });
  const later = candidate({ id: "c-later", startTime: "2026-09-28T12:29:00Z", endTime: "2026-09-28T13:45:00Z" });
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [later, earlier], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.toSchedule[0]!.sessionKey, "gmail:c-earlier");
  const loser = result.skipped.find((s) => s.sessionKey === "gmail:c-later");
  assert.ok(loser, "later item should be reported as overlap-lost");
  assert.equal(loser!.reason, "overlap-lost");
  assert.ok(loser!.detail?.includes("gmail:c-earlier"));
});

test("selectAutoRecordItems: overlap tie-break — same start, longer duration wins", () => {
  const shorter = candidate({ id: "c-short", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:00:00Z" });
  const longer = candidate({ id: "c-long", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T14:00:00Z" });
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [shorter, longer], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.toSchedule[0]!.sessionKey, "gmail:c-long");
});

test("selectAutoRecordItems: two non-overlapping candidates both schedule, sorted by start", () => {
  // Both starts must fall within the 5-min lead window of TICK_NOW (12:26) to be "due" at all —
  // back-to-back (second starts exactly when first ends) keeps them non-overlapping.
  const first = candidate({ id: "c-a", startTime: "2026-09-28T12:27:00Z", endTime: "2026-09-28T12:30:00Z" });
  const second = candidate({ id: "c-b", startTime: "2026-09-28T12:31:00Z", endTime: "2026-09-28T13:00:00Z" });
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [second, first], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 2);
  assert.deepEqual(result.toSchedule.map((i) => i.sessionKey), ["gmail:c-a", "gmail:c-b"]);
});

test("selectAutoRecordItems: a calendar event from a trusted organizer is scheduled (source: calendar)", () => {
  const calEvent: CalendarEvent = {
    id: "cal-1", title: "Ashoka Educator Dialogue", startTime: "2026-09-28T12:30:00Z",
    endTime: "2026-09-28T13:30:00Z", meetingUrl: "https://zoom.us/j/123?tk=SECRET",
    organizer: "dean@ashoka.edu.in",
  };
  const result = selectAutoRecordItems({
    calendarEvents: [calEvent], candidates: [], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.toSchedule[0]!.sessionKey, "cal:cal-1");
});

test("selectAutoRecordItems: a calendar event from an untrusted organizer -> untrusted-sender", () => {
  const calEvent: CalendarEvent = {
    id: "cal-2", title: "Random meeting", startTime: "2026-09-28T12:30:00Z",
    endTime: "2026-09-28T13:30:00Z", meetingUrl: "https://meet.google.com/xyz",
    organizer: "stranger@unknown.example",
  };
  const result = selectAutoRecordItems({
    calendarEvents: [calEvent], candidates: [], now: TICK_NOW, leadMinutes: LEAD5,
    trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]!.reason, "untrusted-sender");
});

test("selectAutoRecordItems: a candidate with no parseable startTime is silently excluded " +
  "(e.g. a past-recording candidate with nothing live to join)", () => {
  const result = selectAutoRecordItems({
    calendarEvents: [], candidates: [candidate({ startTime: undefined, endTime: undefined, kind: "past-recording" })],
    now: TICK_NOW, leadMinutes: LEAD5, trustedSenders: TRUSTED, alreadyScheduled: [],
  });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped.length, 0);
});
