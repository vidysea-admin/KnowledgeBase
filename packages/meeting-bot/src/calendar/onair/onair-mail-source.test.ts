import test from "node:test";
import assert from "node:assert/strict";
import { buildOnairCandidates, classifyOnairMail, extractOnairLinks, senderIsGoogle, onairTitle } from "./onair-mail-source.js";
import { parseMailWindow } from "./onair-mail-window.js";
import type { CalendarEvent } from "../calendar-client.js";
import type { OnairMail } from "./onair-mail-source.js";
import * as f from "./onair-mail.fixtures.js";

const build = (mails: OnairMail[], calendarEvents?: CalendarEvent[]) => buildOnairCandidates(mails, { resolve: f.fakeResolver(), calendarEvents });

test("dedup: registered + two reminders + starting-soon for one event become exactly one candidate", async () => {
  const r = await build([f.startingSoon, f.reminder, f.registered, f.reminder2]);
  assert.equal(r.candidates.length, 1);
  const c = r.candidates[0]!;
  assert.equal(c.id, `onair:${f.SLUG_A}`);
  assert.equal(c.mailCount, 4);
  assert.equal(c.mailKind, "starting-soon"); // latest mail wins, whatever the input order
  assert.equal(c.messageId, "m-soon");
});

test("candidate shape: platform cloudonair, source gmail, canonical url, authenticated google sender", async () => {
  const c = (await build([f.registered])).candidates[0]!;
  assert.equal(c.platform, "cloudonair");
  assert.equal(c.source, "gmail");
  assert.equal(c.meetingUrl, f.URL_A);
  assert.equal(c.kind, "upcoming");
  assert.equal(c.senderAuthenticated, true);
  assert.equal(c.senderDomain, "google.com");
  assert.equal(c.title, "Building agents with Gemini");
  assert.ok(!JSON.stringify(c).includes("mkt_tok") && !JSON.stringify(c).includes("FAKE-"));
});

test("window comes from the mail text (PDT applied) and from a matching calendar event in preference", async () => {
  const c = (await build([f.registered])).candidates[0]!;
  assert.deepEqual([c.startTime, c.endTime, c.windowSource], ["2026-10-20T16:00:00.000Z", "2026-10-20T17:00:00.000Z", "mail"]);
  const cal = { id: "e1", title: "Gemini agents (calendar)", startTime: "2026-10-20T16:05:00Z", endTime: "2026-10-20T17:15:00Z", meetingUrl: `${f.URL_A}?mkt_tok=FAKE` };
  const withCal = (await build([f.registered], [cal])).candidates[0]!;
  assert.deepEqual([withCal.startTime, withCal.endTime, withCal.windowSource, withCal.title], ["2026-10-20T16:05:00.000Z", "2026-10-20T17:15:00.000Z", "calendar", cal.title]);
  const other = (await build([f.registered], [{ ...cal, meetingUrl: f.URL_B }])).candidates[0]!;
  assert.equal(other.windowSource, "mail");
  const cancelled = (await build([f.registered], [{ ...cal, cancelled: true }])).candidates[0]!;
  assert.equal(cancelled.windowSource, "mail");
});

test("on-demand mail yields a past-recording candidate; a live mail with no window is dropped", async () => {
  const r = await build([f.onDemand, f.noWindow]);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0]!.kind, "past-recording");
  assert.equal(r.candidates[0]!.mailKind, "on-demand");
  const lone = await build([f.noWindow]);
  assert.equal(lone.candidates.length, 0);
  assert.deepEqual(lone.rejected, [{ messageId: "m-nowin", reason: "no-window" }]);
});

test("two events produce two candidates", async () => {
  const r = await build([f.registered, f.onDemand]);
  assert.deepEqual(r.candidates.map(c => c.slug).sort(), [f.SLUG_B, f.SLUG_A].sort());
});

test("sender gate: unauthenticated, unknown-auth, look-alike and subdomain senders are rejected", async () => {
  for (const mail of [f.unauthenticated, f.unknownAuth, f.lookalike, f.subdomain]) {
    const r = await build([mail]);
    assert.equal(r.candidates.length, 0, mail.messageId);
    assert.equal(r.rejected[0]!.reason, "sender-not-authenticated-google", mail.messageId);
  }
});

test("a rejected sender never triggers link resolution", async () => {
  const calls: string[] = [];
  await buildOnairCandidates([f.unauthenticated, f.lookalike], { resolve: f.fakeResolver(calls) });
  assert.deepEqual(calls, []);
});

test("ambiguous, linkless and unrelated mails are rejected with a reason", async () => {
  const r = await build([f.twoEvents, f.noLink, f.unrelated]);
  assert.deepEqual(r.candidates, []);
  assert.deepEqual(r.rejected.map(x => x.reason), ["ambiguous-event", "no-event-link", "unclassified"]);
});

test("a resolver that throws or refuses drops the mail without throwing", async () => {
  const boom = await buildOnairCandidates([f.registered], { resolve: async () => { throw new Error("x"); } });
  assert.deepEqual(boom.rejected, [{ messageId: "m-reg", reason: "no-event-link" }]);
});

test("each distinct link is resolved once", async () => {
  const calls: string[] = [];
  await buildOnairCandidates([f.registered, f.registered], { resolve: f.fakeResolver(calls) });
  assert.equal(calls.length, 1);
});

test("classification of subjects", () => {
  const cases: [string, string | undefined][] = [
    ["You're registered: X", "registered"], ["Join us tomorrow: X", "reminder"], ["Reminder: X is today", "reminder"],
    ["Starting soon: X", "starting-soon"], ["X starts in 15 minutes", "starting-soon"], ["Ready to watch: X", "on-demand"],
    ["X is now available on-demand", "on-demand"], ["Your invoice", undefined]];
  for (const [subject, want] of cases) assert.equal(classifyOnairMail(subject), want, subject);
});

test("links: only the exact Marketo and OnAir hosts, html entities decoded, capped", () => {
  const links = extractOnairLinks({ html: `<a href="${f.dc("z")}?a=1&amp;b=2">x</a> https://cloudonair.withgoogle.com.evil.example/events/x https://evil.example/go.cloudplatformonline.com/dc/q`, text: "" });
  assert.deepEqual(links, [`${f.dc("z")}?a=1&b=2`]);
});

test("senderIsGoogle and onairTitle helpers", () => {
  assert.equal(senderIsGoogle("A <a@google.com>", true).ok, true);
  assert.equal(senderIsGoogle("a@google.com", true).ok, true);
  assert.equal(senderIsGoogle("A <a@google.com>", false).ok, false);
  assert.equal(onairTitle("Starting soon: Big Topic"), "Big Topic");
});

test("parseMailWindow: zones, DST, year rollover, missing zone, end defaults", () => {
  const ref = "2026-10-14T00:00:00Z";
  assert.deepEqual(parseMailWindow("October 20, 2026 at 9:00 AM - 10:30 AM PT", ref), { startTime: "2026-10-20T16:00:00.000Z", endTime: "2026-10-20T17:30:00.000Z" });
  assert.equal(parseMailWindow("December 3 at 9 AM PT", "2026-11-20T00:00:00Z")?.startTime, "2026-12-03T17:00:00.000Z"); // PST
  assert.equal(parseMailWindow("Oct 21 10:00 AM UTC", ref)?.endTime, "2026-10-21T11:00:00.000Z");
  assert.equal(parseMailWindow("January 5 at 9:00 AM ET", "2026-12-20T00:00:00Z")?.startTime, "2027-01-05T14:00:00.000Z");
  assert.equal(parseMailWindow("October 20 at 9:00 AM", ref), undefined);
  assert.equal(parseMailWindow("October 20 at 9:00 AM XYZ", ref), undefined);
  assert.equal(parseMailWindow("no date here", ref), undefined);
});
