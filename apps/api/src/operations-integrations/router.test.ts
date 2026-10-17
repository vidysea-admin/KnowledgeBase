import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { requireAuth } from "../auth.js";
import { hostingFixture } from "../hosting/test-kit.js";
import { createOperationsService } from "./service.js";
import { createOperationsIntegrationsRouter } from "./router.js";
import { validateSchedule, type Schedule } from "./model.js";
async function fixture() {
  const hosting = hostingFixture(), rows = new Map<string, Schedule>(); let sent = 0;
  const service = createOperationsService({
    store: {
      async load(tenant, kind) { const row = rows.get(`${tenant}:${kind}`); return row ? structuredClone(row) : null; },
      async replace(tenant, old, next) { validateSchedule(next, tenant, next.kind); const id = `${tenant}:${next.kind}`, row = rows.get(id); if (old ? row?.revision !== old.revision || row.leaseToken !== old.leaseToken : row !== undefined) return false; rows.set(id, structuredClone(next)); return true; },
    },
    sessions: async tenant => [{ tenantId: tenant, _id: `session-${tenant}`, title: `Tenant ${tenant}`, date: "2026-10-14" }],
    notifications: async () => ({ notifications: [], limit: 50, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } }),
    adapters: { digest: { available: tenant => tenant === "A", execute: async () => { sent++; } }, sheets: { available: tenant => tenant === "A", execute: async () => { sent++; } } },
  });
  await hosting.service.setRole(hosting.ownerA, "memberA", "viewer");
  const app = express(); app.use(express.json()); app.use(requireAuth({ verify: async key => {
    if (key === "admin") return { ...hosting.ownerA, scopes: ["hosting", "operations"] };
    if (key === "viewer") return { ...hosting.memberA, scopes: ["hosting", "operations"] };
    if (key === "foreign") return { ...hosting.ownerB, scopes: ["hosting", "operations"] };
    if (key === "no-scope") return hosting.ownerA;
    return null;
  } })); app.use(createOperationsIntegrationsRouter(service, hosting.service));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { hosting, rows, sent: () => sent, async request(path: string, key = "admin", method = "GET", body?: unknown) { return fetch(url + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }, close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); hosting.close(); } };
}
test("real verified auth/roles distinguish viewer reads, admin mutation and foreign tenant config", async () => {
  const f = await fixture(); try {
    assert.equal((await f.request("/operations-integrations", "viewer")).status, 200);
    assert.equal((await f.request("/operations-integrations/digest", "viewer", "PUT", { revision: 0, enabled: true, intervalHours: 24 })).status, 403);
    assert.equal((await f.request("/operations-integrations", "no-scope")).status, 403);
    assert.equal((await f.request("/operations-integrations", "unknown")).status, 401);
    const saved = await f.request("/operations-integrations/digest", "admin", "PUT", { revision: 0, enabled: true, intervalHours: 24 }); assert.equal(saved.status, 200); assert.equal(saved.headers.get("cache-control"), "private, no-store");
    const foreign = await (await f.request("/operations-integrations", "foreign")).json() as { schedules: Array<{ revision: number; available: boolean }> }; assert.equal(foreign.schedules[0]?.revision, 0); assert.equal(foreign.schedules[0]?.available, false);
    assert.equal((await f.request("/operations-integrations/digest/run", "foreign", "POST", { revision: 0, confirm: "RUN_DIGEST" })).status, 409); assert.equal(f.sent(), 0);
    const run = await f.request("/operations-integrations/digest/run", "admin", "POST", { revision: 1, confirm: "RUN_DIGEST" }); assert.equal(run.status, 200); assert.equal((await run.json() as { lastResult: string }).lastResult, "succeeded"); assert.equal(f.sent(), 1);
    assert.deepEqual(f.rows.get("A:digest")?.audit.map(event => event.actorKeyId), ["ownerA", "ownerA", "ownerA", "ownerA"]);
  } finally { await f.close(); }
});
test("caller target/tenant/actor fields, repeated query and missing run confirmation cannot widen execution", async () => {
  const f = await fixture(); try {
    for (const extra of [{ tenantId: "B" }, { actorKeyId: "ownerB" }, { recipient: "outsider@example.test" }, { spreadsheetId: "outsider" }]) {
      assert.equal((await f.request("/operations-integrations/digest", "admin", "PUT", { revision: 0, enabled: false, intervalHours: 24, ...extra })).status, 400);
    }
    assert.equal((await f.request("/operations-integrations?tenant=B&tenant=A")).status, 400);
    assert.equal((await f.request("/operations-integrations/digest/run", "admin", "POST", { revision: 0 })).status, 400);
    assert.equal(f.rows.size, 0); assert.equal(f.sent(), 0);
  } finally { await f.close(); }
});
