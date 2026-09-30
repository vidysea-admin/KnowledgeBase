/**
 * apps/api/src/gws-gmail.test.ts — U2 source-watcher. Tests the pure helpers gws-gmail.ts
 * exports (decodeGmailBody, extractSessionDateTime, classifyMeetingKind, isRegistrationOnly)
 * against the REAL body formats named in the task brief. No `gws` call — `scanGmailForMeetingCandidates`
 * uses injected CLI responses below; no provider request or credential access runs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decodeGmailBody,
  extractSessionDateTime,
  classifyMeetingKind,
  isRegistrationOnly,
  scanGmailForMeetingCandidates,
} from "./gws-gmail.js";

test("Gmail pagination preserves all unique messages and refuses incomplete or malformed coverage", async () => {
  const requests: any[] = [];
  const run = async (args: string[]) => {
    const params = JSON.parse(args[args.indexOf("--params") + 1]!); requests.push(params);
    if (args.includes("list")) return JSON.stringify(params.pageToken ? {messages: [{id: "b"}, {id: "a"}]} : {messages: [{id: "a"}], nextPageToken: "next"});
    return JSON.stringify({id: params.id, payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar"}], body: {data: Buffer.from("Join https://meet.google.com/abc-defg-hij").toString("base64url")}}});
  };
  assert.deepEqual((await scanGmailForMeetingCandidates(100, run)).map(row => row.messageId), ["a", "b"]);
  assert.equal(requests.filter(row => row.pageToken === "next").length, 1);
  for (const empty of [{}, {resultSizeEstimate: 0}, {messages: []}]) assert.deepEqual(await scanGmailForMeetingCandidates(100, async () => JSON.stringify(empty)), []);
  for (const invalid of [null, [], {error: {code: 401}}, {messages: {}}, {messages: [{id: 1}]}, {resultSizeEstimate: -1}, {resultSizeEstimate: 15}, {unexpected: true}, {nextPageToken: "repeat"}]) {
    await assert.rejects(scanGmailForMeetingCandidates(100, async () => JSON.stringify(invalid)), /Gmail discovery unavailable/);
  }
  let pages = 0;
  await assert.rejects(scanGmailForMeetingCandidates(100, async () => JSON.stringify({nextPageToken: String(++pages)})), /unavailable/);
  assert.equal(pages, 20);
  for (const token of ['&echo secret', '%PATH%', '!secret!', 'quote"', "space here", "a\nb", "a|b", "a^b", "<bad>", "$(bad)", "`bad`", "(bad)"]) {
    for (const reply of [{nextPageToken: token}, {messages: [{id: token}]}]) {
      let calls = 0;
      await assert.rejects(scanGmailForMeetingCandidates(100, async () => {calls++; return JSON.stringify(reply);}), /unavailable/);
      assert.equal(calls, 1, "untrusted token or id never reaches a second CLI invocation");
    }
  }
  for (const message of [null, {error: {}}, {id: "wrong"}, {id: "a", payload: {headers: {}}}]) {
    await assert.rejects(scanGmailForMeetingCandidates(100, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "a"}]} : message)), /unavailable/);
  }
  await assert.rejects(scanGmailForMeetingCandidates(100, async () => {throw new Error("private credentials");}), /^Error: Gmail discovery unavailable$/);
});

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
