import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { requireAuth } from "../auth.js";
import { createBotPrivacyRouter } from "./router.js";
import type { BotPrivacyDeps } from "./types.js";

const generation = "11111111-2222-4333-8444-555555555555";
async function fixture(deps?: BotPrivacyDeps, scopes = ["jobs", "send-now"]) {
  const app = express(); app.use(express.json());
  app.use(requireAuth({verify: async key => key === "fixture-key" ? {tenantId: "tenant-one", scopes} : null}));
  app.use(createBotPrivacyRouter(deps));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture server");
  return {url: `http://127.0.0.1:${address.port}`, close: async () => {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }};
}
const auth = {authorization: "Bearer fixture-key", "content-type": "application/json"};

test("actual authenticated HTTP control derives tenant and projects no private handle credentials", async () => {
  const calls: unknown[][] = [];
  const f = await fixture({list: tenant => {calls.push([tenant]); return [{tenantId: "tenant-one", sessionId: "session-one", generation,
    status: "recording", privacy: "private", token: "secret", meetingUrl: "https://private.invalid?token=secret"} as never];},
    set: async (...args) => {calls.push(args); return "accepted";}});
  try {
    const status = await fetch(`${f.url}/meeting-bot/privacy`, {headers: auth}); assert.equal(status.status, 200);
    const text = await status.text(); assert.equal(text.includes("secret"), false);
    assert.deepEqual(JSON.parse(text), {captures: [{sessionId: "session-one", generation, status: "recording", privacy: "private"}]});
    const response = await fetch(`${f.url}/meeting-bot/privacy/session-one`, {method: "POST", headers: auth, body: JSON.stringify({generation, action: "private-start"})});
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {status: "accepted", action: "private-start"});
    assert.deepEqual(calls, [["tenant-one"], ["tenant-one", "session-one", generation, "private-start"]]);
  } finally {await f.close();}
});

test("tenant injection and missing scopes/auth fail before touching a recorder", async () => {
  let calls = 0;
  const deps = {list: () => {calls++; return [];}, set: async () => {calls++; return "accepted" as const;}};
  const f = await fixture(deps);
  try {
    const injected = await fetch(`${f.url}/meeting-bot/privacy/session-one`, {method: "POST", headers: auth,
      body: JSON.stringify({generation, action: "private-start", tenantId: "other"})}); assert.equal(injected.status, 400);
    const unauth = await fetch(`${f.url}/meeting-bot/privacy`); assert.equal(unauth.status, 401);
    const query = await fetch(`${f.url}/meeting-bot/privacy?tenantId=other`, {headers: auth}); assert.equal(query.status, 400);
    assert.equal(calls, 0);
  } finally {await f.close();}
  const readOnly = await fixture(deps, ["jobs"]);
  try {
    const forbidden = await fetch(`${readOnly.url}/meeting-bot/privacy/session-one`, {method: "POST", headers: auth,
      body: JSON.stringify({generation, action: "private-start"})}); assert.equal(forbidden.status, 403); assert.equal(calls, 0);
  } finally {await readOnly.close();}
});

test("no active handle, stale generation, durability error or unknown result never reports accepted", async () => {
  for (const result of ["unavailable", "stale", "invented", "throw"]) {
    const f = await fixture({list: () => [], set: async () => {
      if (result === "throw") throw new Error("secret cookie and token"); return result as "unavailable";
    }});
    try {
      const response = await fetch(`${f.url}/meeting-bot/privacy/session-one`, {method: "POST", headers: auth,
        body: JSON.stringify({generation, action: "private-start"})});
      assert.equal(response.status, result === "stale" ? 409 : 503);
      const text = await response.text(); assert.equal(text.includes('"status":"accepted"'), false); assert.equal(text.includes("cookie"), false);
    } finally {await f.close();}
  }
  const absent = await fixture();
  try {assert.equal((await fetch(`${absent.url}/meeting-bot/privacy`, {headers: auth})).status, 503);}
  finally {await absent.close();}
});

test("foreign registry rows fail closed without disclosing capture status", async () => {
  const f = await fixture({list: () => [{tenantId: "other", sessionId: "foreign-session", generation, status: "recording", privacy: "private"}],
    set: async () => "unavailable"});
  try {
    const response = await fetch(`${f.url}/meeting-bot/privacy`, {headers: auth});
    assert.equal(response.status, 503); assert.equal((await response.text()).includes("foreign-session"), false);
  } finally {await f.close();}
});
