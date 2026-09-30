import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAutoRecordItems } from "./auto-join.js";
import { classifyWebinarInvite, webinarIdentity } from "./auto-record-policy.js";
import { createHttpCalendarLoader, createHttpCandidateLoader } from "./schedule-tick.js";

const times = { startTime: "2026-09-30T10:00:00Z", endTime: "2026-09-30T11:00:00Z" };

test("watch retries only typed discovery failure after 60s and preserves fatal/preview gates", async () => {
  const {runPipelineWatch} = await import(new URL('../../../../scripts/webinar/run-pipeline.mjs', import.meta.url).href);
  let ticks = 0; const waits: number[] = [], logs: string[] = [];
  const stopped = new Error("fixture cancellation");
  await assert.rejects(runPipelineWatch({run: true, watch: true}, {
    tick: async () => {if (++ticks === 1) throw Object.assign(new Error("private provider details"), {code: "WEBINAR_DISCOVERY_UNAVAILABLE"}); return {status: "running"};},
    wait: async (ms: number) => {waits.push(ms); if (waits.length === 2) throw stopped;}, log: (text: string) => logs.push(text),
  }), error => error === stopped);
  assert.equal(ticks, 2); assert.deepEqual(waits, [60000, 60000]); assert.ok(!logs.join(" ").includes("private"));
  for (const failure of [new Error("Webinar discovery unavailable"), new Error("owner mismatch"), new Error("lock invalid"), new Error("proof missing")]) {
    let waited = false;
    await assert.rejects(runPipelineWatch({run: true, watch: true}, {tick: async () => {throw failure;}, wait: async () => {waited = true;}}), error => error === failure);
    assert.equal(waited, false);
  }
  let previewTicks = 0;
  await runPipelineWatch({}, {tick: async () => {previewTicks++; return {};}, wait: async () => {assert.fail("preview cannot wait");}, log: () => {}});
  assert.equal(previewTicks, 1);
  await assert.rejects(runPipelineWatch({watch: true}, {tick: async () => {assert.fail("unapproved watch cannot tick");}}), /requires --run/);
});
const candidate = { id: "invite", title: "Student visa webinar", senderEmail: "new@university.edu",
  senderDomain: "university.edu", status: "pending" as const, meetingUrl: "https://zoom.us/w/123?tk=first", ...times };
const selection = (candidates = [candidate], calendarEvents: any[] = []) => selectAutoRecordItems({
  calendarEvents, candidates, now: "2026-09-30T09:59:00Z", leadMinutes: 5,
  trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [], everyWebinar: true,
});

test("automatic webinars do not require a trusted sender; ordinary meetings stay excluded", () => {
  assert.equal(selection().toSchedule.length, 1);
  assert.equal(selection([{ ...candidate, title: "Team meeting" }]).skipped[0]?.reason, "not-webinar");
  assert.equal(selection([{ ...candidate, title: "Monthly update" }]).skipped[0]?.reason, "needs-review");
  assert.equal(classifyWebinarInvite("personal webinar catch-up"), "meeting");
});
test("explicit rejection and registration never get overridden", () => {
  assert.equal(selection([{ ...candidate, status: "rejected" as any }]).toSchedule.length, 0);
  assert.equal(selection([{ ...candidate, registrationOnly: true } as any]).skipped[0]?.reason, "needs-registration");
});
test("rejected Gmail occurrence also blocks its Calendar alias", () => {
  const calendar = [{id:'event',title:candidate.title,meetingUrl:'https://zoom.us/w/123?tk=other',...times}];
  assert.equal(selection([{...candidate,status:'rejected' as any}],calendar).toSchedule.length,0);
  assert.equal(selection([{...candidate,registrationOnly:true} as any],calendar).toSchedule.length,0);
});
test("canonical occurrence key prevents duplicate across polls and rotating tokens", () => {
  const key = selection().toSchedule[0]!.sessionKey;
  const next = selectAutoRecordItems({calendarEvents:[{id:'event',title:candidate.title,meetingUrl:'https://zoom.us/w/123?tk=other',...times}],candidates:[],now:'2026-09-30T09:59:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[key],everyWebinar:true});
  assert.equal(next.toSchedule.length,0);
  assert.equal(next.skipped[0]?.reason,'duplicate-session');
});
test("Gmail and Calendar aliases dedup rotating tokens; recurring dates remain distinct", () => {
  const result = selection([candidate], [{ id: "event", title: candidate.title,
    meetingUrl: "https://zoom.us/w/123?tk=second", ...times }]);
  assert.equal(result.toSchedule.length, 1);
  assert.equal(result.skipped[0]?.reason, "duplicate-session");
  assert.notEqual(webinarIdentity(candidate.meetingUrl, times.startTime), webinarIdentity(candidate.meetingUrl, "2026-10-01T10:00:00Z"));
});
test("invalid intervals and non-HTTPS joins are refused", () => {
  assert.equal(selection([{ ...candidate, endTime: times.startTime }]).skipped[0]?.reason, "invalid-time");
  assert.equal(selection([{ ...candidate, meetingUrl: "file:///private" }]).skipped[0]?.reason, "unsafe-join-link");
});
test("calendar uses real authenticated route and reports failures instead of healthy zero", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "http://local/calendar/upcoming");
      assert.equal((init?.headers as any).authorization, "Bearer test");
      return new Response(JSON.stringify({ meetings: [{ id: "event", title: "Webinar", ...times }] }));
    };
    assert.equal((await createHttpCalendarLoader("http://local", "test")()).length, 1);
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(createHttpCalendarLoader("http://local", "test")(), /503/);
    await assert.rejects(createHttpCalendarLoader("http://local", undefined)(), /API_KEY/);
  } finally { globalThis.fetch = original; }
});
test("new webinar mode loads pending Gmail rows, legacy mode still filters", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [
      { ...candidate, _id: candidate.id, subject: candidate.title },
    ] }));
    assert.equal((await createHttpCandidateLoader("http://local", "test", () => {}, true)()).length, 1);
    assert.equal((await createHttpCandidateLoader("http://local", "test", () => {})()).length, 0);
  } finally { globalThis.fetch = original; }
});
