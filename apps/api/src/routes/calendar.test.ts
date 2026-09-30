/**
 * apps/api/src/routes/calendar.test.ts — same DI/HTTP pattern as graph.test.ts/brain.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeCalendarReadDeps } from "../fixtures.js";
import { listUpcomingGwsMeetings } from "../gws-calendar.js";
import { createGwsCalendarReadDeps } from "../store.js";
import { selectAutoRecordItems } from "../../../../packages/meeting-bot/src/calendar/auto-join.js";
import { reconcileWebinarSources } from "../../../../packages/meeting-bot/src/calendar/calendar-client.js";
import { createHttpCalendarLoader, loadWebinarSourcesWithHealth } from "../../../../packages/meeting-bot/src/calendar/schedule-tick.js";

test("GET /calendar/upcoming with the calendar scope returns real meetings", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/calendar/upcoming`, { headers: { authorization: "Bearer cal-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { meetings: { id: string; meetingUrl?: string }[] };
    assert.equal(body.meetings.length, 1);
    assert.equal(body.meetings[0]!.id, "evt-1");
  } finally {
    await server.close();
  }
});

test("production Calendar factory binds the machine credential before any provider read", async () => {
  let reads = 0;
  const load = async () => {reads++; return [];};
  for (const owner of ["", "foreign", "invalid owner"]) await assert.rejects(createGwsCalendarReadDeps(owner, load).listUpcoming("tenant-1"), /owner/);
  assert.equal(reads, 0);
  const calendar = createGwsCalendarReadDeps("tenant-1", load);
  const server = await startTestServer(buildTestDeps({calendar, keyStore: fakeKeyStore({
    "owner-key": {tenantId: "tenant-1", scopes: ["calendar"]}, "foreign-key": {tenantId: "tenant-2", scopes: ["calendar"]},
  })}));
  try {
    assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming`, {headers: {authorization: "Bearer foreign-key"}})).status, 503);
    assert.equal(reads, 0);
    assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming`, {headers: {authorization: "Bearer owner-key"}})).status, 200);
    assert.equal(reads, 1);
  } finally { await server.close(); }
});

test("actual Calendar adapter failures cross HTTP as failed discovery, while empty success stays healthy", async () => {
  let reply: unknown = { items: [] }, failed = false;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] } }),
    calendar: { listUpcoming: () => listUpcomingGwsMeetings(14, async () => {
      if (failed) throw new Error("secret provider details https://private.invalid/?token=secret");
      return JSON.stringify(reply);
    }) },
  }));
  const deps = { loadCalendarEvents: createHttpCalendarLoader(server.baseUrl, "cal-key"), loadCandidates: async () => [] };
  const previous = {calendar: {status: "healthy" as const, checkedAt: "2026-09-29T12:00:00Z", lastSuccessAt: "2026-09-29T12:00:00Z"}};
  try {
    for (const invalid of [null, [], {}, {error: {code: 401}}, {items: {}}, {items: [{id: 5}]}, {items: [{id: "e", start: {dateTime: "bad"}}]}]) {
      reply = invalid;
      const response = await fetch(`${server.baseUrl}/calendar/upcoming`, {headers: {authorization: "Bearer cal-key"}});
      assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("secret"));
      const result = await loadWebinarSourcesWithHealth(deps, "2026-09-30T12:00:00Z", previous);
      assert.equal(result.failed, true); assert.equal(result.health.calendar.status, "failed");
      assert.equal(result.health.calendar.lastSuccessAt, previous.calendar.lastSuccessAt);
    }
    failed = true; await assert.rejects(deps.loadCalendarEvents()); failed = false;
    for (const valid of [{items: []}, {kind: "calendar#events"}]) {
      reply = valid;
      const result = await loadWebinarSourcesWithHealth(deps, "2026-09-30T12:00:00Z", previous);
      assert.equal(result.failed, false); assert.deepEqual(result.calendarEvents, []);
      assert.equal(result.health.calendar.lastSuccessAt, "2026-09-30T12:00:00Z");
    }
  } finally { await server.close(); }
});

test("Calendar follows bounded pagination and refuses repeated/invalid tokens without partial coverage", async () => {
  const event = {id: "e", summary: "Webinar", start: {dateTime: "2026-10-01T12:00:00Z"}, end: {dateTime: "2026-10-01T13:00:00Z"}, hangoutLink: "https://meet.google.com/abc-defg-hij"};
  const calls: any[] = [];
  const rows = await listUpcomingGwsMeetings(14, async args => {
    const params = JSON.parse(args[args.indexOf("--params") + 1]!); calls.push(params);
    return JSON.stringify(params.pageToken ? {items: [event]} : {items: [{id: "cancelled", status: "cancelled"}], nextPageToken: "next"});
  });
  assert.equal(rows.length, 2); assert.equal(rows[0]!.id, "cancelled"); assert.equal(rows[0]!.cancelled, true);
  assert.equal(rows[1]!.id, "e"); assert.equal(calls.length, 2); assert.equal(calls[1].pageToken, "next");
  assert.equal(calls[0].showDeleted, true);
  for (const token of ["repeat", "", 1, null]) await assert.rejects(listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [], nextPageToken: token})), /unavailable/);
  let pages = 0;
  await assert.rejects(listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [], nextPageToken: String(++pages)})), /unavailable/);
  assert.equal(pages, 20);
  for (const token of ['&echo secret', '%PATH%', '!secret!', 'quote"', "space here", "a\nb", "a|b", "a^b", "<bad>", "$(bad)", "`bad`", "(bad)"]) {
    let calls = 0;
    await assert.rejects(listUpcomingGwsMeetings(14, async () => {calls++; return JSON.stringify({items: [], nextPageToken: token});}), /unavailable/);
    assert.equal(calls, 1, "untrusted page token never reaches the next CLI invocation");
  }
});

test("ISS-WEBINARRELEASE-013: cancelled Calendar occurrence suppresses its stale Gmail alias", async () => {
  const cancelled = {id: "cancelled-webinar", status: "cancelled", summary: "AI webinar",
    start: {dateTime: "2026-09-30T10:00:00Z"}, end: {dateTime: "2026-09-30T11:00:00Z"},
    hangoutLink: "https://meet.google.com/abc-defg-hij"};
  let providerFixtureCalls = 0;
  const calendarEvents = await listUpcomingGwsMeetings(14, async () => {
    providerFixtureCalls++; return JSON.stringify({items: [cancelled]});
  });
  const result = selectAutoRecordItems({calendarEvents, candidates: [{id: "old-gmail-invite",
    title: cancelled.summary, senderEmail: "host@example.org", senderDomain: "example.org", status: "pending",
    meetingUrl: cancelled.hangoutLink, startTime: cancelled.start.dateTime, endTime: cancelled.end.dateTime, kind: "upcoming"}],
    now: "2026-09-30T10:00:00Z", leadMinutes: 5, trustedSenders: {emails: [], domains: []},
    alreadyScheduled: new Set(), everyWebinar: true});
  assert.equal(providerFixtureCalls, 1);
  assert.equal(result.toSchedule.length, 0, "a cancelled occurrence must not record via stale Gmail");
});

test("Calendar discovery preserves id-only tombstones, recurrence metadata and incomplete positive invites", async () => {
  const recurring = {id: "instance", status: "cancelled", recurringEventId: "series",
    originalStartTime: {dateTime: "2026-10-01T12:00:00+05:30"}, updated: "2026-09-30T10:00:00Z"};
  const rows = await listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [
    {id: "deleted", status: "cancelled"}, recurring,
    {id: "registration", summary: "AI webinar", start: {dateTime: "2026-10-01T12:00:00Z"}},
    {id: "all-day", start: {date: "2026-10-01"}, end: {date: "2026-10-02"}},
  ]}));
  assert.equal(rows.length, 4);
  assert.equal(rows[0]!.cancelled, true); assert.equal(rows[0]!.startTime, "");
  assert.equal(rows[1]!.recurringEventId, "series"); assert.deepEqual(rows[1]!.originalStartTime, recurring.originalStartTime);
  assert.equal(rows[1]!.providerUpdated, recurring.updated);
  assert.equal(rows[2]!.meetingUrl, undefined); assert.equal(rows[2]!.title, "AI webinar");
  assert.equal(rows[3]!.startTime, "2026-10-01");
  for (const invalid of [
    {id: "", status: "cancelled"}, {id: "x", status: true}, {id: "x", status: "deleted"},
    {id: "x", updated: "yesterday"}, {id: "x", updated: "2026-10-01"},
    {id: "x", recurringEventId: "series"}, {id: "x", originalStartTime: {date: "2026-10-01"}},
    {id: "x", recurringEventId: "series", originalStartTime: {date: "2026-10-01", dateTime: "2026-10-01T12:00:00Z"}},
    {id: "x", end: {dateTime: "bad"}}, {id: "x", start: {date: "2026-02-30"}},
    ...["2026-02-30T10:00:00Z", "2026-10-01T24:00:00Z", "2026-10-01T12:60:00Z", "2026-10-01T12:00:60Z", "2026-10-01T12:00:00+24:00"].flatMap(value => [
      {id: "x", start: {dateTime: value}}, {id: "x", updated: value},
      {id: "x", recurringEventId: "series", originalStartTime: {dateTime: value}},
    ]),
    {id: "x", organizer: {email: 1}}, {id: "x", hangoutLink: 7},
  ]) await assert.rejects(listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [invalid]})), /unavailable/);
});

test("authenticated Calendar discovery retains tombstones while default UI excludes them", async () => {
  let reads = 0;
  const rows = [{id: "deleted", title: "AI webinar", startTime: "", endTime: "", cancelled: true},
    {id: "registration", title: "AI webinar", startTime: "2026-10-01T12:00:00Z", endTime: ""},
    {id: "live", title: "AI webinar", startTime: "2026-10-01T12:00:00Z", endTime: "2026-10-01T13:00:00Z", meetingUrl: "https://meet.google.com/abc-defg-hij"}];
  const server = await startTestServer(buildTestDeps({calendar: {listUpcoming: async () => { reads++; return rows; }},
    keyStore: fakeKeyStore({"cal-key": {tenantId: "tenant-1", scopes: ["calendar"]}})}));
  const headers = {authorization: "Bearer cal-key"};
  try {
    const normal = await fetch(`${server.baseUrl}/calendar/upcoming`, {headers});
    const normalBody = await normal.json() as {meetings: {id: string}[]};
    assert.deepEqual(normalBody.meetings.map(r => r.id), ["live"]);
    const events = await createHttpCalendarLoader(server.baseUrl, "cal-key")();
    assert.deepEqual(events.map(r => r.id), ["deleted", "registration", "live"]); assert.equal(events[0]!.cancelled, true);
    for (const query of ["discovery=0", "discovery=true", "discovery=1&discovery=1", "discovery[x]=1"]) {
      const before = reads;
      assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, {headers})).status, 400);
      assert.equal(reads, before);
    }
    const before = reads;
    assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?discovery=1`)).status, 401); assert.equal(reads, before);
  } finally { await server.close(); }
});

test("GET /calendar/upcoming without the calendar scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/calendar/upcoming`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("Calendar delta retrieves deleted masters without time bounds and preserves conflicting revisions", async () => {
  const since = "2026-09-01T00:00:00.000Z", calls: Record<string, unknown>[] = [];
  const live = {id: "same", summary: "AI webinar", start: {dateTime: "2026-10-01T12:00:00Z"}, updated: "2026-09-30T10:00:00Z"};
  const rows = await listUpcomingGwsMeetings(14, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!); calls.push(p);
    return JSON.stringify(p.pageToken ? {items: [p.singleEvents ? live : {...live, summary: "Changed webinar"}]} :
      {items: [p.singleEvents ? live : {id: "deleted-series", status: "cancelled"}], nextPageToken: "same-token"});
  }, since);
  assert.equal(calls.length, 4); assert.equal(rows.length, 4);
  for (const p of calls) {
    assert.equal(p.calendarId, "primary"); assert.equal(p.showDeleted, true);
    if (p.singleEvents) { assert.equal(p.orderBy, "startTime"); assert.ok(p.timeMin); assert.ok(p.timeMax); assert.equal(p.updatedMin, undefined); }
    else { assert.equal(p.updatedMin, since); assert.equal(p.orderBy, "updated"); assert.equal(p.timeMin, undefined); assert.equal(p.timeMax, undefined); }
  }
  assert.equal(rows[2]!.id, "deleted-series"); assert.equal(rows[2]!.cancelled, true);
  assert.equal(rows.filter(r => r.id === "same").length, 3, "transport must not silently resolve equal conflicting revisions");
  for (const failure of ["provider", "invalid", "repeat", "limit", "unsafe"]) {
    let deltaCalls = 0;
    await assert.rejects(listUpcomingGwsMeetings(14, async args => {
      const p = JSON.parse(args[args.indexOf("--params") + 1]!);
      if (p.singleEvents) return JSON.stringify({items: [live]});
      deltaCalls++;
      if (failure === "provider") throw new Error("secret");
      if (failure === "invalid") return JSON.stringify({items: [{id: 4, status: "cancelled"}]});
      return JSON.stringify({items: [], nextPageToken: failure === "repeat" ? "repeat" : failure === "unsafe" ? "&echo bad" : String(deltaCalls)});
    }, since), /unavailable/);
    assert.equal(deltaCalls, failure === "limit" ? 20 : failure === "repeat" ? 2 : 1);
  }
  for (const invalid of ["2026-02-30T10:00:00.000Z", "2026-09-01T24:00:00.000Z", "2026-09-01T00:00:00Z", "bad&echo", ""]) {
    let calls = 0;
    await assert.rejects(listUpcomingGwsMeetings(14, async () => {calls++; return "{}";}, invalid), /checkpoint/); assert.equal(calls, 0);
  }
});

test("delta HTTP checkpoint is encoded once and owner/query guards run before provider", async () => {
  const since = "2026-09-01T00:00:00.000Z", seen: (string | undefined)[] = [];
  const calendar = createGwsCalendarReadDeps("tenant-1", async (_days, _run, changedSince) => { seen.push(changedSince); return []; });
  const server = await startTestServer(buildTestDeps({calendar, keyStore: fakeKeyStore({
    "cal-key": {tenantId: "tenant-1", scopes: ["calendar"]}, "foreign": {tenantId: "tenant-2", scopes: ["calendar"]},
  })}));
  try {
    let callbacks = 0;
    assert.deepEqual(await createHttpCalendarLoader(server.baseUrl, "cal-key", () => {callbacks++; return since;})(), []);
    assert.equal(callbacks, 1); assert.deepEqual(seen, [since]);
    const query = new URLSearchParams({discovery: "1", changedSince: since});
    assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, {headers: {authorization: "Bearer foreign"}})).status, 503);
    for (const query of ["changedSince=" + encodeURIComponent(since), "discovery=1&changedSince=bad", "discovery=1&changedSince=" + encodeURIComponent(since) + "&changedSince=" + encodeURIComponent(since), "discovery=1&changedSince[x]=1"]) {
      assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, {headers: {authorization: "Bearer cal-key"}})).status, 400);
    }
    for (const invalid of ["bad", "2026-02-30T00:00:00.000Z", "2026-09-01T00:00:00Z"]) await assert.rejects(createHttpCalendarLoader(server.baseUrl, "cal-key", () => invalid)(), /checkpoint/);
    assert.deepEqual(seen, [since], "invalid queries, callbacks and foreign owner must never reach provider");
  } finally { await server.close(); }
});

test("delta omits validated live recurring masters but preserves instances and deleted masters", async () => {
  const master = {id: "series", summary: "AI webinar", status: "confirmed", recurrence: ["RRULE:FREQ=WEEKLY"],
    start: {dateTime: "2026-10-01T12:00:00Z"}, end: {dateTime: "2026-10-01T13:00:00Z"}, hangoutLink: "https://meet.google.com/abc-defg-hij"};
  const instance = {...master, id: "instance", recurrence: undefined, recurringEventId: "series", originalStartTime: master.start};
  const run = async (replacement: unknown) => listUpcomingGwsMeetings(14, async args => {
    const p = JSON.parse(args[args.indexOf("--params") + 1]!);
    return JSON.stringify({items: p.singleEvents ? [instance] : [replacement, {id: "deleted-series", status: "cancelled", recurrence: master.recurrence}]});
  }, "2026-09-01T00:00:00.000Z");
  const rows = await run(master);
  assert.deepEqual(rows.map(r => r.id), ["instance", "deleted-series"]);
  assert.equal(rows[0]!.recurringEventId, "series"); assert.equal(rows[1]!.cancelled, true);
  for (const invalid of [null, {}, [], [1], [""], ["RRULE:FREQ=WEEKLY\n"], Array(33).fill("RRULE:FREQ=WEEKLY")]) {
    await assert.rejects(run({...master, recurrence: invalid}), /unavailable/, "excluded masters must still be validated");
  }
});

test("Google timezone metadata crosses actual adapter/reconciler/selector without losing cancellation", async () => {
  const live = {id: "instance-tz", summary: "AI webinar", recurringEventId: "series-tz", updated: "2026-10-01T08:00:00Z",
    originalStartTime: {dateTime: "2026-10-01T10:00:00Z", timeZone: "Etc/UTC"},
    start: {dateTime: "2026-10-01T10:00:00Z", timeZone: "Etc/UTC"}, end: {dateTime: "2026-10-01T11:00:00Z"}, hangoutLink: "https://meet.google.com/abc-defg-hij"};
  const checkedAt = "2026-10-01T09:56:00.000Z", acquisition = {complete: true, historyComplete: true};
  const calendarEvents = await listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [live]}));
  assert.deepEqual(calendarEvents[0]!.originalStartTime, {dateTime: live.originalStartTime.dateTime});
  const first = reconcileWebinarSources({tenantId: "fixture", checkedAt, acquisition, calendarEvents, candidates: []});
  const select = (r: typeof first) => selectAutoRecordItems({calendarEvents: r.calendarEvents, candidates: r.candidates,
    now: checkedAt, leadMinutes: 5, trustedSenders: {emails: [], domains: []}, alreadyScheduled: new Set(), everyWebinar: true});
  assert.equal(select(first).toSchedule.length, 1);
  const tombstones = await listUpcomingGwsMeetings(14, async () => JSON.stringify({items: [
    {id: live.id, status: "cancelled", recurringEventId: live.recurringEventId, originalStartTime: live.originalStartTime},
  ]}));
  const cancelled = reconcileWebinarSources({tenantId: "fixture", checkedAt, acquisition, previous: first.state, calendarEvents: tombstones, candidates: []});
  assert.equal(cancelled.transitions.filter(t => t.reason === "cancelled").length, 1);
  assert.equal(cancelled.calendarEvents[0]!.cancelled, true); assert.equal(select(cancelled).toSchedule.length, 0);
});

test("GET /calendar/upcoming when the source returns nothing yields a real, honest empty list", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] } }),
      calendar: fakeCalendarReadDeps({ listUpcoming: async () => [] }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/calendar/upcoming`, { headers: { authorization: "Bearer cal-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { meetings: unknown[] };
    assert.deepEqual(body.meetings, []);
  } finally {
    await server.close();
  }
});
