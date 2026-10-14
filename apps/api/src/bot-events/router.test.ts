import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { requireAuth } from "../auth.js";
import { fakeKeyStore } from "../fixtures.js";
import { createBotEventsRouter, projectBotEvent, unavailableBotEventsDeps, type BotEventsDeps } from "./router.js";

test("rules degradation survives the API projection with the same bounded safe fields", () => {
  const projected = projectBotEvent({ id: "rules", at: "2026-10-14T12:00:00Z", kind: "rules-degraded",
    sessionKey: "outage-1", title: "Join rules unavailable", detail: "No snapshot https://example.com/?token=SECRET", secret: "PRIVATE" });
  assert.equal(projected?.kind, "rules-degraded");
  assert.equal(projected?.detail?.includes("SECRET"), false);
  assert.equal(projected?.detail?.includes("[link removed]"), true);
  assert.equal(Object.hasOwn(projected ?? {}, "secret"), false);
});

const keyStore = fakeKeyStore({ owner: { tenantId: "owner", scopes: ["jobs"] }, other: { tenantId: "other", scopes: ["jobs"] }, limited: { tenantId: "owner", scopes: ["sessions"] } });
const good = { id: "e1", at: "2026-10-15T09:00:00.000Z", kind: "about-to-join", sessionKey: "webinar-1", title: "Career Counselling Masterclass", careerGuidance: true, matchedKeywords: ["career"] };

async function fixture(deps: BotEventsDeps, run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use(requireAuth(keyStore)); app.use(createBotEventsRouter(deps));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))); }
}
const get = (url: string, key = "owner") => fetch(url, { headers: { authorization: `Bearer ${key}` } });

test("returns the tenant's projected events; the tenant comes only from the key and the reader is called with it", async () => {
  const seen: [string, number][] = [];
  await fixture({ list: (t, l) => { seen.push([t, l]); return t === "owner" ? [good, { ...good, id: "e2" }] : []; } }, async (url) => {
    const r = await get(`${url}/bot-events?limit=5`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(((await r.json()) as { events: { id: string }[] }).events.map((e) => e.id), ["e1", "e2"]);
    assert.deepEqual(((await (await get(`${url}/bot-events`, "other")).json()) as { events: unknown[] }).events, []);
  });
  assert.deepEqual(seen, [["owner", 5], ["other", 50]]);
});

test("auth and scope are enforced before any read; bad queries are 400; no deps or a throwing reader is 503", async () => {
  let reads = 0;
  await fixture({ list: () => { reads++; return []; } }, async (url) => {
    assert.equal((await fetch(`${url}/bot-events`)).status, 401);
    assert.equal((await get(`${url}/bot-events`, "limited")).status, 403);
    for (const q of ["?limit=0", "?limit=101", "?limit=a", "?x=1", "?limit=1&limit=2"]) assert.equal((await get(`${url}/bot-events${q}`)).status, 400, q);
  });
  assert.equal(reads, 0);
  await fixture(unavailableBotEventsDeps, async (url) => assert.equal((await get(`${url}/bot-events`)).status, 503));
});

test("rows are re-projected: unknown fields dropped, URLs removed, bad kinds/dates discarded", () => {
  const p = projectBotEvent({ ...good, secret: "x", title: "Talk https://zoom.us/w/1?tk=SECRET now", detail: "see https://zoom.us/j/2?pwd=SECRET" });
  assert.ok(p && !("secret" in p));
  assert.ok(!/SECRET|zoom\.us/.test(JSON.stringify(p)));
  assert.equal(projectBotEvent({ ...good, kind: "weird" }), undefined);
  assert.equal(projectBotEvent({ ...good, at: "yesterday-ish" }), undefined);
  assert.equal(projectBotEvent(null), undefined);
});
