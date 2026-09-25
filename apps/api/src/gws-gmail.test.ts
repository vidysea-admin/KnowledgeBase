/**
 * apps/api/src/gws-gmail.test.ts — U2 source-watcher. Tests the pure helpers gws-gmail.ts
 * exports (decodeGmailBody, extractSessionDateTime, classifyMeetingKind, isRegistrationOnly)
 * against the REAL body formats named in the task brief. No `gws` call — `scanGmailForMeetingCandidates`
 * itself still shells out directly (unchanged, matches its pre-existing failure contract: any
 * `gws` failure returns []), so it is exercised only for that fallback shape here, never for a
 * real scan.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decodeGmailBody,
  extractSessionDateTime,
  classifyMeetingKind,
  isRegistrationOnly,
} from "./gws-gmail.js";

// `scanGmailForMeetingCandidates` itself is NOT unit-tested here: it has never accepted an
// injectable `gws` runner (pre-existing T-028 shape, unchanged by this unit — see the module
// doc comment), so calling it for real would shell out to a real, possibly-unauthenticated `gws`
// on whatever machine runs `pnpm -r test`. Its failure contract ("any gws error -> []") is
// unchanged and untouched by this unit's edits; every new extraction/classification behavior it
// composes is covered above as pure functions instead.

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("decodeGmailBody: prefers text/plain when both plain and html parts exist", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("plain body text") } },
      { mimeType: "text/html", body: { data: b64url("<p>html body</p>") } },
    ],
  };
  assert.equal(decodeGmailBody(payload), "plain body text");
});

test("decodeGmailBody: falls back to text/html (stripped) when no text/plain part exists", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [{ mimeType: "text/html", body: { data: b64url("<p>Hello<br>World</p>") } }],
  };
  assert.equal(decodeGmailBody(payload).trim(), "Hello\nWorld");
});

test("decodeGmailBody: a simple (non-multipart) message reads the top-level body", () => {
  const payload = { mimeType: "text/plain", body: { data: b64url("simple message") } };
  assert.equal(decodeGmailBody(payload), "simple message");
});

test("decodeGmailBody: nested parts (multipart/mixed with an alternative sub-part) still find text/plain", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [{ mimeType: "text/plain", body: { data: b64url("nested plain text") } }],
      },
    ],
  };
  assert.equal(decodeGmailBody(payload), "nested plain text");
});

test("decodeGmailBody: undefined payload returns empty string, not a throw", () => {
  assert.equal(decodeGmailBody(undefined), "");
});

// --- extractSessionDateTime: the real formats from the task brief ---

test("extractSessionDateTime: Ashoka format — 'Day & Date: Sunday, September 27, 2026 Time: 11:00 AM - 12:00 PM IST'", () => {
  const text = "*Day & Date:* Sunday, September 27, 2026 *Time:* 11:00 AM - 12:00 PM IST";
  const { startTime, endTime } = extractSessionDateTime(text);
  // 11:00 AM IST == 05:30 UTC; 12:00 PM IST == 06:30 UTC
  assert.equal(startTime, "2026-09-27T05:30:00.000Z");
  assert.equal(endTime, "2026-09-27T06:30:00.000Z");
});

test("extractSessionDateTime: a single stated time with no range (Zoho-style 'Date & Time: September 28, 2026, 6:00 PM IST')", () => {
  const text = "Date & Time: September 28, 2026, 6:00 PM IST";
  const { startTime, endTime } = extractSessionDateTime(text);
  assert.equal(startTime, "2026-09-28T12:30:00.000Z");
  assert.equal(endTime, undefined);
});

test("extractSessionDateTime: a labeled date wins over an EARLIER incidental month-shaped date elsewhere in the mail (real bug repro, live dry-run 2026-09-25)", () => {
  // Real shape from a forwarded Ashoka mail: a quoted "Subject: ... | Sep 27, 2026" line
  // appears BEFORE the real "Day & Date:" field. A bare first-match regex picks up the
  // abbreviated "Sep 27, 2026" (whose month alias failed to resolve, discarding the whole
  // extraction); the labeled-date regex must prefer the real field instead.
  const text =
    "Subject: Reminder: Educator Dialogues | Learning Gaps | Reena Gupta | Sep 27, 2026\r\n\r\n" +
    "*Day & Date:* Sunday, September 27, 2026\r\n*Time:* 11:00 AM - 12:00 PM IST";
  const { startTime, endTime } = extractSessionDateTime(text);
  assert.equal(startTime, "2026-09-27T05:30:00.000Z");
  assert.equal(endTime, "2026-09-27T06:30:00.000Z");
});

test("extractSessionDateTime: abbreviated month names parse (real mail rarely spells them out)", () => {
  const { startTime } = extractSessionDateTime("Date: Sep 27, 2026 Time: 11:00 AM IST");
  assert.equal(startTime, "2026-09-27T05:30:00.000Z");
});

test("extractSessionDateTime: no date phrase anywhere — returns {} rather than guessing", () => {
  assert.deepEqual(extractSessionDateTime("Thanks for joining, see you soon!"), {});
});

test("extractSessionDateTime: defaults to IST when no timezone token is present", () => {
  const { startTime } = extractSessionDateTime("Date: October 6, 2026 Time: 6:00 PM");
  assert.equal(startTime, "2026-10-06T12:30:00.000Z");
});

// --- classifyMeetingKind ---

test("classifyMeetingKind: a recording URL always means past-recording", () => {
  const kind = classifyMeetingKind({
    subject: "Weekly sync",
    bodyText: "here's the link",
    recordingUrl: "https://drive.google.com/file/d/abc123/view",
    now: new Date("2026-09-25T00:00:00Z"),
  });
  assert.equal(kind, "past-recording");
});

test("classifyMeetingKind: 'shared a recording' in the subject means past-recording even with no explicit URL", () => {
  const kind = classifyMeetingKind({
    subject: "Vidysea Education shared a recording",
    bodyText: "",
    now: new Date("2026-09-25T00:00:00Z"),
  });
  assert.equal(kind, "past-recording");
});

test("classifyMeetingKind: a future startTime with no recording signal means upcoming", () => {
  const kind = classifyMeetingKind({
    subject: "Ashoka Educator Dialogues",
    bodyText: "join us",
    startTime: "2026-09-27T05:30:00.000Z",
    now: new Date("2026-09-25T00:00:00Z"),
  });
  assert.equal(kind, "upcoming");
});

test("classifyMeetingKind: a PAST startTime with no recording signal means past-recording", () => {
  const kind = classifyMeetingKind({
    subject: "CBSE Career Guidance webinar",
    bodyText: "",
    startTime: "2026-09-16T05:30:00.000Z",
    now: new Date("2026-09-25T00:00:00Z"),
  });
  assert.equal(kind, "past-recording");
});

test("classifyMeetingKind: no signal at all defaults to upcoming (a bare join link reads as an invite)", () => {
  const kind = classifyMeetingKind({ subject: "Zoom meeting", bodyText: "", now: new Date("2026-09-25T00:00:00Z") });
  assert.equal(kind, "upcoming");
});

// --- isRegistrationOnly ---

test("isRegistrationOnly: a registration link with no direct join link is registration-only", () => {
  assert.equal(isRegistrationOnly("Register here: https://zoom.us/webinar/register/WN_abc123"), true);
});

test("isRegistrationOnly: a direct zoom join link is NOT registration-only, even if a register link also appears", () => {
  const body = "Register: https://zoom.us/webinar/register/WN_abc123 Join now: https://zoom.us/j/1234567890";
  assert.equal(isRegistrationOnly(body), false);
});

test("isRegistrationOnly: a plain meet.google.com join link is not registration-only", () => {
  assert.equal(isRegistrationOnly("Join: https://meet.google.com/abc-defg-hij"), false);
});

test("isRegistrationOnly: no register link at all is not registration-only", () => {
  assert.equal(isRegistrationOnly("no links here"), false);
});
