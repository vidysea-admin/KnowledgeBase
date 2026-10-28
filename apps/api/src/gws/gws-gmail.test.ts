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
test("actual Gmail mapper requires literal platform host and discovers Webex", async () => {
  const links = ["https://tenant.webex.com/meet/host", "https://zoom.us.evil.example/j/123", "https://evil.example/zoom.us/j/123",
    "https://zoom.us@evil.example/j/123", "https://evil.example/youtube.com/watch?v=1"];
  for (const link of links) {
    let query = "";
    const [row] = await scanGmailForMeetingCandidates(100, async args => {
      if (args.includes("list")) {
        query = JSON.parse(args[args.indexOf("--params") + 1]!).q;
        return JSON.stringify({messages: [{id: "mail1"}]});
      }
      return JSON.stringify({id: "mail1", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], body: {data: Buffer.from(link).toString("base64url")}}});
    }, {});
    assert.match(query, /webex\.com/);
    assert.equal(row?.meetingUrl, link.includes("tenant.webex.com") ? link : undefined);
    assert.equal(row?.recordingUrl, undefined);
  }
});
test("Gmail receivedAt comes solely from valid provider internalDate, never Date header or scan time", async () => {
  for (const internalDate of ["1791979200000", undefined, "bad", 1791979200000, "-1", "8640000000000001", "99999999999999999"]) {
    const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
      JSON.stringify({id: "mail1", internalDate, payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}, {name: "Date", value: "today"}],
        body: {data: Buffer.from("https://meet.google.com/abc-defg-hij").toString("base64url")}}}), {});
    assert.equal(row?.receivedAt, internalDate === "1791979200000" ? new Date(1791979200000).toISOString() : undefined);
  }
});
test("registration acquisition separates literal registration and join URLs and validates thread identity", async () => {
  const register = "https://zoom.us/webinar/register/abc";
  for (const join of [undefined, "https://zoom.us/j/1234567890", "https://meeting.zoho.com/session?sessionId=123"]) {
    const rows = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ?
      JSON.stringify({messages: [{id: "mail1"}]}) : JSON.stringify({id: "mail1", threadId: "thread_1", payload: {
        headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], body: {data: Buffer.from(`${register} ${join ?? ""}`).toString("base64url")}}}), {});
    assert.equal(rows[0]?.registrationUrl, register); assert.equal(rows[0]?.threadId, "thread_1");
    assert.equal(rows[0]?.meetingUrl, join); assert.equal(rows[0]?.startTime, undefined);
    if (!join) assert.equal(rows[0]?.registrationOnly, true);
  }
  for (const threadId of [undefined, "valid-1", "invalid\nthread", "", 123, "a".repeat(257)]) {
    const run = async (args: string[]) => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
      JSON.stringify({id: "mail1", threadId, payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
        body: {data: Buffer.from("https://meet.google.com/abc-defg-hij").toString("base64url")}}});
    if (threadId !== undefined && (typeof threadId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(threadId))) await assert.rejects(scanGmailForMeetingCandidates(100, run, {}), /Gmail discovery unavailable/);
    else {const [row] = await scanGmailForMeetingCandidates(100, run, {}); assert.equal(row?.threadId, threadId); assert.equal(row?.registrationUrl, undefined);}
  }
});
test("direct snippet join wins over generic body link without losing registration evidence", async () => {
  const registrationUrl = "https://zoom.us/webinar/register/abc", meetingUrl = "https://zoom.us/j/1234567890";
  const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ?
    JSON.stringify({messages: [{id: "mail1"}]}) : JSON.stringify({id: "mail1", snippet: meetingUrl, payload: {
      headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
      body: {data: Buffer.from(`${registrationUrl} https://meeting.zoho.com/session/123`).toString("base64url")}}}), {});
  assert.equal(row?.meetingUrl, meetingUrl); assert.equal(row?.registrationUrl, registrationUrl);
  assert.equal(row?.registrationOnly, undefined);
});
test("alias and label intake unions neutral mail with broad discovery and fetches duplicates once", async () => {
  const fetched: string[] = [], listed: Record<string, unknown>[] = [];
  const rows = await scanGmailForMeetingCandidates(100, async args => {
    const params = JSON.parse(args[args.indexOf("--params") + 1]!);
    if (args.includes("list")) {
      listed.push(params);
      if (params.labelIds) {
        assert.deepEqual(params.labelIds, ["Label_123"]);
        assert.equal(params.q, "newer_than:30d");
        return JSON.stringify({ messages: [{id: "alias"}, {id: "label"}] });
      }
      assert.match(params.q, /webinar.* OR deliveredto:seminars@example.org/);
      return JSON.stringify({ messages: [{id: "broad"}, {id: "alias"}] });
    }
    fetched.push(params.id);
    return JSON.stringify({ id: params.id, payload: { headers: [{name: "From", value: "host@example.org"},
      {name: "Subject", value: "Webinar details enclosed"}], body: {data: Buffer.from("Register https://example.org/register").toString("base64url")} } });
  }, {aliases: "seminars@example.org, seminars@example.org", labelIds: "Label_123,Label_123"});
  assert.equal(listed.length, 2);
  assert.deepEqual(fetched.sort(), ["alias", "broad", "label"]);
  assert.deepEqual(rows.map(r => r.messageId).sort(), fetched);
  for (const row of rows) {assert.equal(row.registrationOnly, true); assert.equal(row.startTime, undefined);}
});
test("invalid intake calls no provider; incomplete label acquisition fails whole discovery", async () => {
  for (const intake of [{aliases: 'bad@example.org OR in:anywhere'}, {aliases: 'a@example.org\n'},
    {labelIds: 'Label_1, '}, {labelIds: 'Label_1&whoami'}]) {
    let called = false;
    await assert.rejects(scanGmailForMeetingCandidates(100, async () => {called = true; return '{}';}, intake), /^Error: Gmail discovery unavailable$/);
    assert.equal(called, false);
  }
  let labels = 0;
  await assert.rejects(scanGmailForMeetingCandidates(100, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!);
    if (!p.labelIds) return '{}';
    labels++; return JSON.stringify({nextPageToken: 'repeat'});
  }, {labelIds: "Label_1"}), /unavailable/);
  assert.equal(labels, 2);
});
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
test("decodeGmailBody: retains plain and html alternative evidence", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("plain body text") } },
      { mimeType: "text/html", body: { data: b64url("<p>html body</p>") } },
    ],
  };
  assert.equal(decodeGmailBody(payload), "plain body text\nhtml body\n");
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
test("extractSessionDateTime: Ashoka format — 'Day & Date: Sunday, September 27, 2026 Time: 11:00 AM - 12:00 PM IST'", () => {
  const text = "*Day & Date:* Sunday, September 27, 2026 *Time:* 11:00 AM - 12:00 PM IST";
  const { startTime, endTime } = extractSessionDateTime(text);
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
test("extractSessionDateTime: missing timezone stays unknown", () => {
  assert.deepEqual(extractSessionDateTime("Date: October 6, 2026 Time: 6:00 PM"), {});
});
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
test("spoofed direct-link host cannot clear the registration-only boundary", () => {
  assert.equal(isRegistrationOnly("https://zoom.us/webinar/register/abc https://zoom.us.evil.example/j/123"), true);
});
test("canonical join trust refuses host-start and embedded redirects without clearing registration", async () => {
  for (const link of ["https://zoom.us/s/1234567890?zak=SECRET", "https://zoom.us/j/1234567890?next=https://evil.example",
    "https://zoom.us/j/1234567890?context=https%253A%252F%252Fevil.example", "https://zoom.us/j/123"]) {
    const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
      JSON.stringify({id: "mail1", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
        body: {data: Buffer.from(`https://zoom.us/webinar/register/abc ${link}`).toString("base64url")}}}), {});
    assert.equal(row?.meetingUrl, undefined);
    assert.equal(row?.registrationOnly, true);
  }
});
test("future YouTube evidence is a canonical watch target, never a personal join or past recording", async () => {
  const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
    JSON.stringify({id: "mail1", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
      body: {data: Buffer.from("Career guidance Date: October 15, 2099 Time: 10:00 AM UTC https://youtube.com/live/AbCdEfG123_").toString("base64url")}}}), {});
  assert.equal(row?.meetingUrl, undefined);
  assert.equal(row?.recordingUrl, undefined);
  assert.equal(row?.kind, "upcoming");
  assert.deepEqual(row?.youtubeWatch, {url: "https://www.youtube.com/watch?v=AbCdEfG123_", videoId: "AbCdEfG123_", source: "body"});
});
test("conflicting YouTube ids remain an explicit ambiguity rather than selecting the first video", async () => {
  const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
    JSON.stringify({id: "mail1", snippet: "https://youtube.com/live/XyZaBcD456_", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
      body: {data: Buffer.from("Date: October 15, 2099 Time: 10:00 AM UTC https://youtube.com/live/AbCdEfG123_").toString("base64url")}}}), {});
  assert.equal(row?.youtubeWatch, undefined);
  assert.equal(row?.youtubeWatchIssue, "ambiguous");
  assert.equal(row?.recordingUrl, undefined);
});
test("actual multipart HTML href retains a join link missing from plain body and anchor text", async () => {
  const join = "https://zoom.us/j/1234567890?pwd=literal";
  const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
    JSON.stringify({id: "mail1", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], mimeType: "multipart/alternative", parts: [
      {mimeType: "text/plain", body: {data: Buffer.from("Career guidance details").toString("base64url")}},
      {mimeType: "text/html", body: {data: Buffer.from(`<p>Career guidance</p><a href="${join}">Join webinar</a>`).toString("base64url")}},
    ]}}), {});
  assert.equal(row?.meetingUrl, join);
});
test("a Gmail snippet cannot override full-body meeting or passcode conflicts", async () => {
  for (const other of ["https://zoom.us/j/2222222222?pwd=one", "https://zoom.us/j/1111111111?pwd=two"]) {
    const [row] = await scanGmailForMeetingCandidates(100, async args => args.includes("list") ? JSON.stringify({messages: [{id: "mail1"}]}) :
      JSON.stringify({id: "mail1", snippet: "https://zoom.us/j/1111111111?pwd=one", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}],
        body: {data: Buffer.from(`https://zoom.us/webinar/register/abc https://zoom.us/j/1111111111?pwd=one ${other}`).toString("base64url")}}}), {});
    assert.equal(row?.meetingUrl, undefined);
    assert.equal(row?.meetingLinkIssue, "ambiguous");
    assert.equal(row?.registrationOnly, true);
  }
});
// Event dates are far-future on purpose: classifyMeetingKind treats a past startTime as past-recording, so 2026 dates expired this test on 2026-10-28.
test("actual Gmail acquisition requires source year for scheduling identity and refuses receipt-inferred time", async () => {
  const rows = await scanGmailForMeetingCandidates(100, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!);
    if (args.includes("list")) return JSON.stringify({messages: [{id: "invite"}, {id: "reminder"}, {id: "next"}, {id: "unknown"}, {id: "different"}, {id: "yearless"}]});
    return JSON.stringify({id: p.id, internalDate: String(Date.parse("2026-10-20T16:00:00Z")), payload: {headers: [
      {name: "From", value: "host@example.org"}, {name: "Subject", value: p.id === "reminder" ? "Reminder: ClickUp webinar invitation" : "ClickUp webinar invitation"}],
      body: {data: b64url((p.id === "unknown" ? "" : p.id === "next" ? "October 28, 2099 at 12 PM PT " : p.id === "yearless" ? "October 27 at 12 PM PT " : "October 27, 2099 at 12 PM PT ") +
        (p.id === "different" ? "https://zoom.us/j/9999999999?pwd=" : "https://zoom.us/j/1234567890?pwd=") + (p.id === "reminder" ? "changed" : "literal"))}}});
  }, {});
  assert.equal(rows.length, 6, "preserve source rows and their sender/opt-out provenance");
  assert.equal(rows[0]?.startTime, "2099-10-27T19:00:00.000Z");
  assert.equal(rows[0]?.timeProvenance?.yearSource, "explicit"); assert.equal(rows[5]?.startTime, undefined); assert.equal(rows[5]?.evidenceIssue, "unresolved-body");
  assert.ok(rows[0]?.canonicalEventIdentity);
  assert.equal(rows[0]?.canonicalEventIdentity, rows[1]?.canonicalEventIdentity);
  assert.notEqual(rows[0]?.canonicalEventIdentity, rows[2]?.canonicalEventIdentity);
  assert.equal(rows[3]?.canonicalEventIdentity, undefined);
  assert.ok(!rows[0]!.canonicalEventIdentity!.includes("pwd"));
  assert.notEqual(rows[0]?.canonicalEventIdentity, rows[4]?.canonicalEventIdentity);
});
test("recent Gmail pages loop completely with bounded body batches", async () => {
  let active = 0, peak = 0, fetched = 0;
  await scanGmailForMeetingCandidates(5, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!);
    if (args.includes("list")) { assert.match(p.q, /newer_than:7d$/); return JSON.stringify({messages: Array.from({length: 5}, (_, i) => ({id: `m${p.pageToken ? i + 5 : i}`})), ...(p.pageToken ? {} : {nextPageToken: "next"})}); }
    active++; peak = Math.max(peak, active); fetched++;
    await new Promise(resolve => setImmediate(resolve)); active--;
    return JSON.stringify({id: p.id, payload: {headers: [], body: {data: ""}}});
  }, {lookbackDays: 7, batchSize: 2});
  assert.equal(fetched, 10); assert.equal(peak, 2);
  for (const intake of [{batchSize: 0}, {lookbackDays: 0}, {lookbackDays: 91}]) await assert.rejects(scanGmailForMeetingCandidates(5, async () => {throw Error("must not call");}, intake));
});
test("large Gmail messages scan every bounded chunk and retain tail conflicts", async () => {
  const first = "https://meet.google.com/abc-defg-hij", second = "https://meet.google.com/xyz-abcd-efg";
  const scanBody = (body: string) => scanGmailForMeetingCandidates(10, async args => args.includes("list") ?
    JSON.stringify({messages: [{id: "large"}]}) : JSON.stringify({id: "large", payload: {mimeType: "text/plain",
      headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], body: {data: Buffer.from(body).toString("base64url")}}}));
  const [safe] = await scanBody("filler ".repeat(20000) + first);
  assert.equal(safe?.meetingUrl, first);
  const [conflict] = await scanBody(first + " filler ".repeat(20000) + second);
  assert.equal(conflict?.meetingUrl, undefined); assert.equal(conflict?.meetingLinkIssue, "ambiguous");
  await assert.rejects(scanBody("filler ".repeat(150000) + first), /unavailable/);
});
test("all inline MIME parts retain conflicting join identities and times", async () => {
  for (const mimeType of ["text/plain", "text/html"]) for (const sameLink of [false, true]) {
    const [row] = await scanGmailForMeetingCandidates(10, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "parts"}]} : {id: "parts", payload: {
      headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], mimeType: "multipart/mixed", parts: [
        {mimeType, body: {data: b64url("Date: October 15, 2099 Time: 10 AM UTC https://meet.google.com/abc-defg-hij")}},
        {mimeType, body: {data: b64url("Date: October 16, 2099 Time: 10 AM UTC " + (sameLink ? "https://meet.google.com/abc-defg-hij" : "https://meet.google.com/xyz-abcd-efg"))}},
      ]}}), {});
    assert.equal(row?.meetingUrl, sameLink ? "https://meet.google.com/abc-defg-hij" : undefined); assert.equal(row?.meetingLinkIssue, sameLink ? undefined : "ambiguous"); assert.equal(row?.startTime, undefined); assert.equal(row?.evidenceIssue, "unresolved-body");
  }
});
test("referenced inline text is fetched with exact message and attachment ids before resolution", async () => {
  let attachments = 0;
  const [row] = await scanGmailForMeetingCandidates(10, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!);
    if (args.includes("list")) return JSON.stringify({messages: [{id: "parts"}]});
    if (args.includes("attachments")) { attachments++; assert.deepEqual(p, {userId: "me", messageId: "parts", id: "body_1"}); return JSON.stringify({data: b64url("https://meet.google.com/xyz-abcd-efg")}); }
    return JSON.stringify({id: "parts", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], mimeType: "multipart/mixed", parts: [
      {mimeType: "text/plain", body: {data: b64url("https://meet.google.com/abc-defg-hij")}}, {mimeType: "text/html", body: {attachmentId: "body_1"}},
    ]}});
  }, {});
  assert.equal(attachments, 1); assert.equal(row?.meetingUrl, undefined); assert.equal(row?.meetingLinkIssue, "ambiguous");
});
test("unresolved, malformed, excessive and unsupported MIME evidence cannot authorize discovery", async () => {
  const join = {mimeType: "text/plain", body: {data: b64url("https://meet.google.com/abc-defg-hij")}};
  const nested: any = {mimeType: "multipart/mixed", parts: []}; let tail = nested;
  for (let i = 0; i < 14; i++) {const next = {mimeType: "multipart/mixed", parts: []}; tail.parts.push(next); tail = next;}
  for (const part of [{mimeType: "text/plain", body: {attachmentId: "unsafe&bad"}}, {mimeType: "text/html", body: {attachmentId: "missing"}},
    {mimeType: "text/plain", body: {data: "%%%"}}, nested, {mimeType: "multipart/mixed", parts: Array(65).fill(join)}]) {
    await assert.rejects(scanGmailForMeetingCandidates(10, async args => JSON.stringify(args.includes("list") ? {messages: [{id: "parts"}]} : args.includes("attachments") ? {error: {}} :
      {id: "parts", payload: {headers: [{name: "From", value: "host@example.org"}, {name: "Subject", value: "Webinar invitation"}], mimeType: "multipart/mixed", parts: [join, part]}}), {}), /Gmail discovery unavailable/);
  }
});

test("summary is trusted callback data and accounts for sender and unresolved refusals", async () => {
  for (const broken of [false, true]) {
    let summary: any; const options = {onSummary: (value: any) => {summary = value;}};
    const work = scanGmailForMeetingCandidates(10, async args => {
      const p = JSON.parse(args[args.indexOf("--params") + 1]!);
      if (args.includes("list")) return JSON.stringify({messages: [{id: "a"}, {id: "b"}]});
      return JSON.stringify({id: p.id, payload: {headers: p.id === "b" ? [] : [{name: "From", value: "host@example.org"}],
        mimeType: "text/plain", body: broken && p.id === "a" ? {attachmentId: "unsafe&bad"} : {data: b64url("Join webinar https://meet.google.com/abc-defg-hij")}}});
    }, options);
    if (broken) await assert.rejects(work, /^Error: Gmail discovery unavailable$/); else {const rows = await work; assert.equal(rows.length, 1); assert.deepEqual(Object.keys(rows), ["0"]);}
    assert.deepEqual(summary, {listed: 2, fetched: 2, candidates: broken ? 0 : 1, excludedNonMeeting: 0, excludedInternal: 0, refusedSender: 1, incompleteMessages: 1, complete: !broken});
  }
});

test("unsupported attachment invitations are explicit non-joinable refusals and later batches still run", async () => {
  let summary: any; let fetched = 0; const rows = await scanGmailForMeetingCandidates(10, async args => { const p = JSON.parse(args[args.indexOf("--params") + 1]!); if (args.includes("list")) return JSON.stringify({messages: [{id:"image"},{id:"calendar"},{id:"general"},{id:"valid"}]}); fetched++; return JSON.stringify({id:p.id,payload:{headers:[{name:"From",value:"host@example.org"},{name:"Subject",value:p.id === "general" ? "Product update" : "Webinar invitation"}],mimeType:"multipart/mixed",parts:[ {mimeType:"text/plain",body:{data:b64url("Join webinar https://meet.google.com/abc-defg-hij")}}, ...(p.id === "valid" ? [] : [{mimeType:p.id === "calendar" ? "text/calendar" : "image/png",body:{attachmentId:"opaque"}}]) ]}}); }, {batchSize:1,onSummary:s=>{summary=s;}}); assert.equal(fetched,4);assert.equal(rows.length,3);assert.equal(summary.excludedNonMeeting,1);assert.equal(summary.incompleteMessages,3);assert.equal(summary.complete,true); for(const row of rows.slice(0,2)){assert.equal(row.evidenceIssue,"unsupported-attachment");assert.equal(row.meetingUrl,undefined);assert.equal(row.startTime,undefined);} assert.equal(rows[2]?.meetingUrl,"https://meet.google.com/abc-defg-hij");assert.equal(rows[2]?.evidenceIssue,"unresolved-body");assert.equal(rows[2]?.startTime,undefined); });

test("yearless registration stays reviewable as unresolved evidence without guessed time or join URL",async()=>{
  const rows=await scanGmailForMeetingCandidates(10,async args=>JSON.stringify(args.includes("list")?{messages:[{id:"clickup"}]}:{id:"clickup",internalDate:String(Date.parse("2026-10-26T21:05:19Z")),payload:{headers:[{name:"From",value:"host@clickup.com"},{name:"Subject",value:"Less project setup. More getting things done."}],mimeType:"text/plain",body:{data:b64url("Join us. Tuesday, October 27, 12:00 PM PT / 3:00 PM ET. Save my spot https://links.example.org/click/opaque . Can't join us live? Register anyway, and we'll send you the recording after the event.")}}}),{}); assert.equal(rows.length,1);assert.equal(rows[0]?.startTime,undefined);assert.equal(rows[0]?.endTime,undefined);assert.equal(rows[0]?.evidenceIssue,"unresolved-body");assert.equal(rows[0]?.kind,undefined);assert.equal(rows[0]?.registrationOnly,true);assert.equal(rows[0]?.meetingLinkIssue,"registration-only");assert.equal(rows[0]?.meetingUrl,undefined);assert.equal(rows[0]?.registrationUrl,undefined);
});
