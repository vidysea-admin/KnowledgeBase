/**
 * apps/api/src/routes/whatsapp.test.ts — same DI/HTTP pattern as ingest.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoNetworkError, MongoParseError, MongoServerSelectionError } from "mongodb";
import { createMongoWhatsAppDeps } from "../whatsapp/store.js";
import { createConfiguredWhatsAppOwnerResolver } from "../whatsapp/owner-config.js";

import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeWhatsAppDeps } from "../fixtures.js";

test("GET /whatsapp/groups with the whatsapp scope returns a real (fixture) group list", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/groups`, { headers: { authorization: "Bearer wa-key" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { groups: { groupJid: string }[] };
    assert.equal(body.groups.length, 1);
    assert.equal(body.groups[0]!.groupJid, "g1@g.us");
  } finally {
    await server.close();
  }
});

test("GET /whatsapp/groups without the whatsapp scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/groups`, { headers: { authorization: "Bearer ask-only-key" } });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

test("POST /whatsapp/ingest with a valid body creates a real session/source/turns set", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/ingest`, {
      method: "POST",
      headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
      body: JSON.stringify({ groupJid: "g1@g.us" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { sessionId: string; sourceId: string; turnCount: number };
    assert.equal(body.sessionId, "fake-wa-session");
    assert.equal(body.turnCount, 3);
  } finally {
    await server.close();
  }
});

test("POST /whatsapp/ingest with a missing groupJid returns 400, never attempts an ingest", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/ingest`, {
      method: "POST",
      headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});

test("a client-supplied ownerUserId in the body is ignored, never trusted (regression, 2026-09-06 data-engineer review)", async () => {
  let receivedArgs: unknown[] = [];
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
      whatsapp: fakeWhatsAppDeps({
        ingestGroup: async (...args: unknown[]) => {
          receivedArgs = args;
          return { sessionId: "s1", sourceId: "src1", turnCount: 0 };
        },
      }),
    }),
  );
  try {
    await fetch(`${server.baseUrl}/whatsapp/ingest`, {
      method: "POST",
      headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
      body: JSON.stringify({ groupJid: "g1@g.us", ownerUserId: "attacker-supplied-owner-id" }),
    });
    // Real assertion: the route only ever forwards (tenantId, groupJid) -- a client-supplied
    // ownerUserId in the body has no way to reach ingestGroup's real implementation, which
    // resolves the owner itself from the live trackable-groups list.
    assert.deepEqual(receivedArgs, ["tenant-1", "g1@g.us"]);
  } finally {
    await server.close();
  }
});

test("a real fetch/adapter failure surfaces as 502 with the real error message, never a silent 500", async () => {
  const server = await startTestServer(
    buildTestDeps({
      keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
      whatsapp: fakeWhatsAppDeps({
        ingestGroup: async () => { throw new Error("whatsapp_msg Mongo unreachable"); },
      }),
    }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/ingest`, {
      method: "POST",
      headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
      body: JSON.stringify({ groupJid: "g1@g.us" }),
    });
    assert.equal(res.status, 502);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /whatsapp_msg Mongo unreachable/);
  } finally {
    await server.close();
  }
});

test("POST /whatsapp/ingest without the whatsapp scope returns 403", async () => {
  const server = await startTestServer(
    buildTestDeps({ keyStore: fakeKeyStore({ "ask-only-key": { tenantId: "tenant-1", scopes: ["ask"] } }) }),
  );
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/ingest`, {
      method: "POST",
      headers: { authorization: "Bearer ask-only-key", "content-type": "application/json" },
      body: JSON.stringify({ groupJid: "g1@g.us" }),
    });
    assert.equal(res.status, 403);
  } finally {
    await server.close();
  }
});

// Synthetic adapters only: no archive connection, app database or writes.
test("unavailable owner is sanitized503 before any archive access, including foreign query authority", async () => {
  for (const resolveOwner of [undefined, async () => null, async () => "bad-owner",
    createConfiguredWhatsAppOwnerResolver(JSON.stringify([{ tenantId: "foreign", ownerUserId: "111111111111111111111111" }]))]) {
    let upstream = 0;
    const whatsapp = createMongoWhatsAppDeps(undefined, { resolveOwner,
      listGroups: async () => { upstream++; throw new Error("must not access archive"); },
      appDb: () => { throw new Error("must not access app database"); },
    });
    const server = await startTestServer(buildTestDeps({ whatsapp,
      keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
    }));
    try {
      const res = await fetch(
        `${server.baseUrl}/whatsapp/groups?tenantId=foreign&ownerUserId=111111111111111111111111`,
        { headers: { authorization: "Bearer wa-key" } });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "whatsapp_unavailable", message: "WhatsApp source unavailable" });
      assert.equal(upstream, 0);
    } finally { await server.close(); }
  }
});

test("known source network/config errors become sanitized503 only after authenticated owner resolution", async () => {
  for (const error of [new MongoNetworkError("synthetic private diagnostic"),
    new MongoParseError("synthetic private diagnostic"),
    new MongoServerSelectionError("synthetic private diagnostic", {} as ConstructorParameters<typeof MongoServerSelectionError>[1])]) {
    const calls: string[] = [];
    const whatsapp = createMongoWhatsAppDeps(undefined, {
      resolveOwner: async tenant => { calls.push(tenant); return "111111111111111111111111"; },
      listGroups: async owner => { calls.push(owner); throw error; },
      fetchMessages: async () => { throw new Error("must not fetch messages"); },
      appDb: () => { throw new Error("must not access app database"); },
    });
    const server = await startTestServer(buildTestDeps({ whatsapp,
      keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
    }));
    try {
      const res = await fetch(`${server.baseUrl}/whatsapp/groups`, { headers: { authorization: "Bearer wa-key" } });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "whatsapp_unavailable", message: "WhatsApp source unavailable" });
      assert.deepEqual(calls, ["tenant-1", "111111111111111111111111"]);
      calls.length = 0;
      const ingest = await fetch(`${server.baseUrl}/whatsapp/ingest`, { method: "POST",
        headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
        body: JSON.stringify({ groupJid: "synthetic-group" }),
      });
      assert.equal(ingest.status, 503);
      assert.deepEqual(await ingest.json(), { error: "whatsapp_unavailable", message: "WhatsApp source unavailable" });
      assert.deepEqual(calls, ["tenant-1", "111111111111111111111111"]);
    } finally { await server.close(); }
  }
});

test("unexpected group-list errors remain500; message/name spoofing does not become unavailable", async () => {
  const error = new Error("WhatsApp owner authorization unavailable");
  error.name = "WhatsAppUnavailableError";
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
    whatsapp: createMongoWhatsAppDeps(undefined, {
      resolveOwner: async () => "111111111111111111111111", listGroups: async () => { throw error; },
    }),
  }));
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/groups`, { headers: { authorization: "Bearer wa-key" } });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal_error", message: "internal error" });
  } finally { await server.close(); }
});

test("auth and scope refuse before owner resolver or archive is called", async () => {
  let effects = 0;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "ask-key": { tenantId: "tenant-1", scopes: ["ask"] } }),
    whatsapp: createMongoWhatsAppDeps(undefined, {
      resolveOwner: async () => { effects++; return null; },
      listGroups: async () => { effects++; return []; },
    }),
  }));
  try {
    for (const [headers, status] of [[{}, 401], [{ authorization: "Bearer ask-key" }, 403]] as const) {
      const res = await fetch(`${server.baseUrl}/whatsapp/groups`, { headers });
      assert.equal(res.status, status);
    }
    assert.equal(effects, 0);
  } finally { await server.close(); }
});

test("POST missing owner is sanitized503 with zero archive/message/app effects", async () => {
  let effects = 0;
  const server = await startTestServer(buildTestDeps({
    keyStore: fakeKeyStore({ "wa-key": { tenantId: "tenant-1", scopes: ["whatsapp"] } }),
    whatsapp: createMongoWhatsAppDeps(undefined, {
      listGroups: async () => { effects++; return []; },
      fetchMessages: async () => { effects++; return []; },
      appDb: () => { effects++; throw new Error("app database must not be reached"); },
    }),
  }));
  try {
    const res = await fetch(`${server.baseUrl}/whatsapp/ingest`, { method: "POST",
      headers: { authorization: "Bearer wa-key", "content-type": "application/json" },
      body: JSON.stringify({ groupJid: "synthetic-group" }),
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "whatsapp_unavailable", message: "WhatsApp source unavailable" });
    assert.equal(effects, 0);
  } finally { await server.close(); }
});
