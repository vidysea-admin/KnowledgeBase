/** Opt-in watch evidence through actual Calendar mapping and HTTP; no provider requests. */
import {test} from "node:test";
import assert from "node:assert/strict";
import {listUpcomingGwsMeetings} from "./gws-calendar.js";
import {startTestServer} from "../testUtils.js";
import {buildTestDeps, fakeKeyStore} from "../fixtures.js";
import type {UpcomingMeeting} from "../routes/calendar.js";

const videoId = "abcDEF12345", url = `https://www.youtube.com/watch?v=${videoId}`;
const event = (overrides = {}) => ({id: "watch-1", summary: "Career webinar", start: {dateTime: "2030-01-01T10:00:00Z"},
  end: {dateTime: "2030-01-01T11:00:00Z"}, description: `Watch https://youtu.be/${videoId}?si=tracking`, ...overrides});
const provider = (items: unknown[]) => async (args: string[]) => {
  const params = JSON.parse(args[args.indexOf("--params") + 1]!);
  return JSON.stringify({items, ...(params.singleEvents === false ? {nextSyncToken: "terminal"} : {})});
};

test("actual Calendar mapper keeps watch discovery strictly opt-in and separate from join URLs", async () => {
  for (const enabled of [false, undefined, 1 as unknown as boolean]) {
    const [row] = await listUpcomingGwsMeetings(14, provider([event()]), undefined, undefined, {enabled});
    assert.equal(row?.youtubeWatch, undefined); assert.equal(row?.meetingUrl, undefined);
  }
  const [row] = await listUpcomingGwsMeetings(14, provider([event()]), undefined, undefined, {enabled: true});
  assert.deepEqual(row?.youtubeWatch, {url, videoId, source: "description"});
  assert.equal(row?.meetingUrl, undefined); assert.equal(row?.meetingUrlSource, undefined);
});

test("mapping retains location precedence, ambiguity and cancelled watch evidence", async () => {
  const rows = await listUpcomingGwsMeetings(14, provider([
    event({id: "location", location: `https://youtube.com/live/${videoId}`, description: "https://youtu.be/ZZZZZZZZZZZ"}),
    event({id: "ambiguous", description: `https://youtu.be/${videoId} https://youtu.be/ZZZZZZZZZZZ`}),
    event({id: "cancelled", status: "cancelled"}),
  ]), undefined, undefined, {enabled: true});
  assert.equal(rows[0]?.youtubeWatch?.source, "location");
  assert.equal(rows[1]?.youtubeWatch, undefined); assert.equal(rows[1]?.youtubeWatchIssue, "ambiguous");
  assert.equal(rows[2]?.cancelled, true); assert.equal(rows[2]?.youtubeWatch?.videoId, videoId);
  for (const row of rows) assert.equal(row.meetingUrl, undefined);
});

test("native acquisition preserves separate evidence without altering coverage identity", async () => {
  const result = await listUpcomingGwsMeetings(14, provider([event()]), undefined, {}, {enabled: true});
  assert.equal(result.complete, true); assert.equal(result.syncToken, "terminal");
  assert.equal(result.sourceEvents[0]?.youtubeWatch?.url, url);
  assert.equal(result.meetings[0]?.youtubeWatch?.url, url);
  assert.equal(result.sourceEvents[0]?.meetingUrl, undefined);
});

test("HTTP discovery exposes watch evidence while default joinable projection hides watch-only rows", async () => {
  const result = await listUpcomingGwsMeetings(14, provider([event()]), undefined, {}, {enabled: true});
  const server = await startTestServer(buildTestDeps({calendar: {
    listUpcoming: async () => result.meetings, acquire: async tenantId => ({...result, tenantId}),
  }, keyStore: fakeKeyStore({"watch-key": {tenantId: "tenant-1", scopes: ["calendar"]}})}));
  const headers = {authorization: "Bearer watch-key"};
  try {
    const get = async (query: string) => {const response = await fetch(`${server.baseUrl}/calendar/upcoming${query}`, {headers});
      assert.equal(response.status, 200); return response.json() as Promise<{meetings: UpcomingMeeting[]; sourceEvents?: UpcomingMeeting[]; tenantId?: string}>;};
    assert.deepEqual((await get("")).meetings, []);
    assert.equal((await get("?discovery=1")).meetings[0]?.youtubeWatch?.url, url);
    const native = await get("?discovery=1&sync=1");
    assert.equal(native.tenantId, "tenant-1"); assert.equal(native.sourceEvents?.[0]?.youtubeWatch?.url, url);
    assert.equal(native.meetings[0]?.meetingUrl, undefined);
  } finally {await server.close();}
});
