/**
 * apps/api/src/routes/calendar.test.ts — same DI/HTTP pattern as graph.test.ts/brain.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeCalendarReadDeps } from "../fixtures.js";
import { listUpcomingGwsMeetings } from "../gws-calendar.js";
import { createGwsCalendarReadDeps } from "../store.js";
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
  assert.equal(rows.length, 1); assert.equal(calls.length, 2); assert.equal(calls[1].pageToken, "next");
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
