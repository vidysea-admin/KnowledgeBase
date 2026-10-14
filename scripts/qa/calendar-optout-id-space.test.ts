/**
 * scripts/qa/calendar-optout-id-space.test.ts - checker of t037-calendar-page-opt-out-with-hint (SOURCE SCOPE).
 * Chain: fake `gws` output -> REAL gws-calendar mapper -> REAL GET /calendar/upcoming (real server) -> the page's
 * request body (the REAL `optOutBody` source text from apps/web joinRulesClient.ts, transpiled: client.ts needs Vite's
 * import.meta.env and cannot be imported under node) -> REAL POST /calendar/join-rules/opt-outs through the
 * production deps adapter (scripts/webinar/join-rules-host.ts) and the real store -> REAL selectAutoRecordItems +
 * applyJoinRules/evaluateJoinRules. Asserts the SAME meeting is vetoed.
 * Run from the repo root: node --test --import tsx scripts/qa/calendar-optout-id-space.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import { createGwsCalendarReadDeps, listUpcomingGwsMeetings } from "../../apps/api/src/gws/gws-calendar.js";
import { createJoinRulesDeps } from "../webinar/join-rules-host.js";
import { selectAutoRecordItems } from "../../packages/meeting-bot/src/calendar/auto-join.js";
import { applyJoinRules } from "../../packages/meeting-bot/src/calendar/join-rules/join-rules-select.js";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

// The page's body builder, verbatim from source.
const clientSrc = readFileSync(path.resolve(import.meta.dirname, "../../apps/web/src/pages/join-rules/joinRulesClient.ts"), "utf8");
const start = clientSrc.indexOf("export function optOutBody");
const end = start + /\r?\n\}\r?\n/.exec(clientSrc.slice(start))![0].length + clientSrc.slice(start).search(/\r?\n\}\r?\n/);
const js = ts.transpileModule(clientSrc.slice(start, end).replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const optOutBody = new Function(`${js}; return optOutBody;`)() as (id: string, h?: { meetingUrl?: string }) => Record<string, string>;

const T0 = "2026-10-12T10:00:00Z", T1 = "2026-10-12T11:00:00Z", NOW = "2026-10-12T09:50:00Z";
const ev = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({ id, status: "confirmed", summary, start: { dateTime: T0 }, end: { dateTime: T1 }, organizer: { email: "o@x.com" }, ...extra });
const zoomEntry = (uri: string) => ({ conferenceData: { entryPoints: [{ entryPointType: "video", uri }] } });
const ITEMS = [
  ev("calMeet", "Webinar: Meet one", { hangoutLink: "https://meet.google.com/abc-defg-hij" }),
  ev("series1_20261012T100000Z", "Webinar: Weekly", { recurringEventId: "series1", originalStartTime: { dateTime: T0 }, hangoutLink: "https://meet.google.com/xyz-wxyz-abc" }),
  ev("calZoom", "Webinar: Zoom pwd", zoomEntry("https://us02web.zoom.us/j/123456789?pwd=AbC123")),
  ev("calTeams", "Webinar: Teams", zoomEntry("https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%40thread.v2/0?context=%7b%22Tid%22%3a%22t%22%7d")),
  ev("calReg", "Webinar: Registration", zoomEntry("https://zoom.us/webinar/register/WN_abcdef")),
  ev("calWs", "Webinar: Whitespace", zoomEntry("  https://zoom.us/j/555555555?pwd=q  ")),
];
const fakeRun = async () => JSON.stringify({ kind: "calendar#events", items: ITEMS });

async function withServer(fn: (call: (m: string, p: string, b?: unknown) => Promise<{ status: number; json: any }>, dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "calopt-idspace-"));
  const calendar = createGwsCalendarReadDeps("tenant-a", (days, _run, changedSince) => listUpcomingGwsMeetings(days, fakeRun, changedSince) as never);
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ k: { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] } }), calendar, joinRules: createJoinRulesDeps({ stateDir: dir }) }));
  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`${server.baseUrl}${p}`, { method, headers: { authorization: "Bearer k", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: await res.json().catch(() => undefined) };
  };
  try { await fn(call, dir); } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
}

type Meeting = { id: string; title: string; startTime: string; endTime: string; meetingUrl?: string; organizer?: string; recurringEventId?: string };
const selectFrom = (meetings: Meeting[], candidates: any[] = [], everyWebinar = true) => selectAutoRecordItems({
  calendarEvents: meetings as never, candidates, now: NOW, leadMinutes: 15, everyWebinar,
  trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [] });
const EMPTY_RULES = { version: 1 as const, ownDomains: [], rules: [] };
const vetoed = (sel: ReturnType<typeof selectFrom>, state: any) => applyJoinRules(sel, EMPTY_RULES as never, { state });

/** The page's step: list, pick the meeting, build the body, POST. Returns what the engine sees afterwards. */
async function pageOptOut(call: any, id: string) {
  const list = await call("GET", "/calendar/upcoming");
  assert.equal(list.status, 200);
  const m: Meeting = list.json.meetings.find((x: Meeting) => x.id === id);
  assert.ok(m, `API lists ${id}`);
  const body = optOutBody(m.id, m.meetingUrl ? { meetingUrl: m.meetingUrl } : undefined);
  const post = await call("POST", "/calendar/join-rules/opt-outs", body);
  return { meetings: list.json.meetings as Meeting[], m, body, post };
}

test("(i) Google Calendar event: id sent == sourceId the engine matches; the same meeting is vetoed", async () => {
  await withServer(async call => {
    const { meetings, m, body, post } = await pageOptOut(call, "calMeet");
    assert.deepEqual(body, { eventId: "calMeet", meetingUrl: "https://meet.google.com/abc-defg-hij" });
    assert.equal(post.status, 200);
    assert.deepEqual(post.json.state.optedOutEventIds, ["calMeet"]);
    assert.deepEqual(post.json.state.optedOutMeetings, ["url:meet:abc-defg-hij"]);
    const sel = selectFrom(meetings);
    assert.ok(sel.toSchedule.some(i => i.sourceId === "calMeet"), "precondition: scheduled before the veto");
    const out = vetoed(sel, post.json.state);
    assert.ok(!out.toSchedule.some(i => i.sourceId === "calMeet"), "vetoed");
    assert.equal(out.skipped.find(s => s.sourceId === "calMeet")?.reason, "opted-out");
    assert.equal(vetoed(selectFrom(meetings.filter(x => x.id === "calZoom")), post.json.state).toSchedule.length, 1, "an unrelated meeting is untouched");
  });
});

test("(ii) recurring INSTANCE: API returns the instance id (singleEvents) not the series id; opt-out matches the instance", async () => {
  await withServer(async call => {
    const { meetings, m, body, post } = await pageOptOut(call, "series1_20261012T100000Z");
    assert.equal(m.recurringEventId, "series1");
    assert.equal(body.eventId, "series1_20261012T100000Z");
    const out = vetoed(selectFrom(meetings), post.json.state);
    assert.ok(!out.toSchedule.some(i => i.sourceId === "series1_20261012T100000Z"));
    // Residual: a LATER instance of the same series shares the Meet room link; its id differs.
    const later = { ...m, id: "series1_20261019T100000Z", startTime: "2026-10-19T10:00:00Z", endTime: "2026-10-19T11:00:00Z" };
    const sel2 = selectAutoRecordItems({ calendarEvents: [later] as never, candidates: [], now: "2026-10-19T09:50:00Z", leadMinutes: 15, everyWebinar: true, trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [] });
    assert.equal(sel2.toSchedule.length, 1, "precondition");
    const out2 = vetoed(sel2, post.json.state);
    // Documents the over-block: whole recurring room is silently opted out, forever (no undo).
    assert.equal(out2.toSchedule.length, 0, "OBSERVED: a later instance with the same room link is ALSO vetoed");
  });
});

test("(iii) gmail copy of the same meeting arriving ALONE (ISS-T037W1-001 scenario) is vetoed with the page's body", async () => {
  await withServer(async call => {
    const { post } = await pageOptOut(call, "calZoom");
    const g1 = { id: "g1", title: "Webinar: Zoom pwd", senderEmail: "o@x.com", status: "approved", meetingUrl: "https://zoom.us/j/123456789", startTime: T0, endTime: T1 };
    const sel = selectFrom([], [g1]);
    assert.equal(sel.toSchedule.length, 1, "precondition: gmail copy alone is scheduled");
    assert.equal(vetoed(sel, post.json.state).toSchedule.length, 0, "vetoed through url:zoom:123456789");
    // contrast: the id-only body (what the page sent before this unit) does NOT veto it
    assert.equal(vetoed(sel, { approvedSenders: [], approvedDomains: [], optedOutEventIds: ["calZoom"] }).toSchedule.length, 1);
    // Gmail copy carrying a REGISTRATION link rather than the join link: identity differs -> NOT vetoed (residual)
    const g2 = { ...g1, id: "g2", meetingUrl: "https://zoom.us/webinar/register/WN_abcdef" };
    assert.equal(vetoed(selectFrom([], [g2]), post.json.state).toSchedule.length, 1, "OBSERVED: registration-link copy is not matched");
  });
});

test("(iv) every-webinar: calendar + gmail copies collapse to one sessionKey; both-present and calendar-absent are vetoed", async () => {
  await withServer(async call => {
    const { meetings, post } = await pageOptOut(call, "calZoom");
    const g1 = { id: "g1", title: "Webinar: Zoom pwd", senderEmail: "o@x.com", status: "approved", meetingUrl: "https://us02web.zoom.us/j/123456789?pwd=AbC123", startTime: T0, endTime: T1 };
    const both = selectFrom(meetings.filter(x => x.id === "calZoom"), [g1]);
    const survivor = both.toSchedule.find(i => i.meetingUrl?.includes("123456789"));
    assert.ok(survivor, "precondition: one collapsed item survives");
    assert.equal(vetoed(both, post.json.state).toSchedule.filter(i => i.meetingUrl?.includes("123456789")).length, 0);
    assert.equal(vetoed(selectFrom([], [g1]), post.json.state).toSchedule.length, 0);
  });
});

test("hint: stored identity for the URL forms the Calendar API really returns; underivable URL -> 200 id only", async () => {
  await withServer(async call => {
    const cases: [string, string | undefined][] = [
      ["calZoom", "url:zoom:123456789"], ["calMeet", "url:meet:abc-defg-hij"],
      ["calTeams", "url:teams:thread:19:meeting_abc@thread.v2"], ["calReg", undefined], ["calWs", "url:zoom:555555555"],
    ];
    for (const [id, want] of cases) {
      const { m, body, post } = await pageOptOut(call, id);
      assert.equal(post.status, 200, id);
      const stored: string[] = post.json.state.optedOutMeetings ?? [];
      if (want) assert.ok(stored.includes(want), `${id}: ${JSON.stringify(stored)} lacks ${want}; url=${JSON.stringify(m.meetingUrl)} body=${JSON.stringify(body)}`);
      else assert.ok(!stored.some(e => e.includes("register")), `${id} stores nothing for the URL`);
    }
  });
});
