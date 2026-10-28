import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { requireAuth } from "../auth.js";
import { createHostingRouter } from "./router.js";
import { HostingWorker } from "./worker.js";
import { hostingFixture } from "./test-kit.js";

async function host(f: ReturnType<typeof hostingFixture>, available = true) {
  const app = express(); app.use(express.json({ limit: "24kb" }));
  app.use(requireAuth({ async verify(key) {
    if (key === "no-id") return { tenantId: "A", scopes: ["hosting"] };
    if (!/^(owner|member|editor)[AB]$/.test(key)) return null;
    return { tenantId: key.endsWith("A") ? "A" : "B", keyId: key, scopes: key === "editorA" ? [] : ["hosting", "webhooks"] };
  } }));
  let sent = 0;
  app.use(createHostingRouter(available ? { service: f.service, worker: new HostingWorker(f.service, async () => { sent++; return 202; }) } : undefined));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, key = "ownerA", method = "GET", body?: unknown) => fetch(url + path, { method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { request, sent: () => sent, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("authenticated runtime flows role mutation to durable audit and webhook delivery/status, with foreign reads refused", async () => {
  const f = hostingFixture(), h = await host(f);
  try {
    assert.equal((await h.request("/hosting/roles/memberA", "ownerA", "PUT", { role: "viewer" })).status, 200);
    assert.equal((await h.request("/hosting/roles", "memberA")).status, 403);
    const response = await h.request("/webhooks/register", "ownerA", "POST", { url: "https://hooks.example.test/path", events: ["session.indexed"] });
    assert.equal(response.status, 201); const registered = await response.json() as { id: string; signingSecret: string };
    const list = await (await h.request("/webhooks")).json();
    assert.equal(JSON.stringify(list).includes(registered.signingSecret), false);
    assert.equal((await h.request("/webhooks/events", "ownerA", "POST", { id: "e1", type: "session.indexed", payload: { sessionId: "a" } })).status, 202);
    const delivery = await (await h.request("/webhooks/dispatch", "ownerA", "POST", {})).json();
    assert.deepEqual(delivery, { attempted: 1, delivered: 1, uncertain: 0 }); assert.equal(h.sent(), 1);
    assert.equal((await (await h.request("/webhooks/deliveries")).json() as { deliveries: Array<{ status: string }> }).deliveries[0]?.status, "delivered");
    assert.deepEqual(await (await h.request("/webhooks", "ownerB")).json(), { subscriptions: [] });
    assert.equal((await h.request(`/webhooks/${registered.id}`, "ownerB", "DELETE")).status, 404);
    const audit = await (await h.request("/hosting/audit")).json();
    assert.equal(JSON.stringify(audit).includes("signingSecret"), false);
    assert.equal((await f.make().audit(f.ownerA)).records.length > 0, true);
  } finally { await h.close(); f.close(); }
});

test("HTTP layer refuses absent identity, insufficient scopes and body actor/tenant injection", async () => {
  const f = hostingFixture(), h = await host(f);
  try {
    assert.equal((await h.request("/hosting/roles", "bad")).status, 401);
    assert.equal((await h.request("/hosting/roles", "no-id")).status, 503);
    assert.equal((await h.request("/hosting/roles", "editorA")).status, 403);
    assert.equal((await h.request("/webhooks/register", "ownerA", "POST", { url: "https://hooks.example.test/", events: ["session.indexed"], tenantId: "B", actorId: "ownerB" })).status, 400);
    assert.equal((await h.request("/hosting/roles/memberB", "ownerA", "PUT", { role: "admin" })).status, 404);
    assert.equal((await f.service.audit(f.ownerA)).records.length, 0);
  } finally { await h.close(); f.close(); }
});

test("missing durable configuration is explicit unavailable, not successful registration", async () => {
  const f = hostingFixture(), h = await host(f, false);
  try {
    const response = await h.request("/webhooks/register", "ownerA", "POST", { url: "https://hooks.example.test/", events: ["session.indexed"] });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "hosting_unavailable" });
  } finally { await h.close(); f.close(); }
});
