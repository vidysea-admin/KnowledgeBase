import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "../server.js";
import { buildTestDeps } from "../fixtures.js";
import { hostingFixture } from "../hosting/test-kit.js";
import { createOperationsService } from "./service.js";
import { validateSchedule, type Schedule } from "./model.js";
test("current real server mounts tenant/role protected operations configuration and truthful missing setup", async () => {
  const f = hostingFixture(), rows = new Map<string, Schedule>();
  const service = createOperationsService({ store: {
    load: async (tenant, kind) => rows.get(`${tenant}:${kind}`) ?? null,
    replace: async (tenant, old, next) => { validateSchedule(next, tenant, next.kind); const key = `${tenant}:${next.kind}`, row = rows.get(key); if (old ? row?.revision !== old.revision : row !== undefined) return false; rows.set(key, structuredClone(next)); return true; },
  }, sessions: async tenant => [{ tenantId: tenant, _id: "session-a", title: "Scoped session", date: "2026-10-14" }], adapters: { digest: { available: () => false, execute: async () => { throw new Error("Forbidden fixture delivery"); } }, sheets: { available: () => false, execute: async () => { throw new Error("Forbidden fixture delivery"); } } } });
  const base = buildTestDeps({ keyStore: { verify: async key => key === "admin" ? { tenantId: "A", keyId: "ownerA", scopes: ["hosting", "operations"] } : null } });
  const deps = { ...base, operationsSchedules: { service, hosting: f.service } };
  const server = createServer(deps).listen(0, "127.0.0.1"); await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(url + "/operations-integrations", { headers: { authorization: "Bearer admin" } }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = await response.json() as { schedules: Array<{ enabled: boolean; available: boolean }> }; assert.equal(payload.schedules.length, 2); assert.ok(payload.schedules.every(row => !row.enabled && !row.available));
    assert.equal((await fetch(url + "/operations-integrations")).status, 401);
    const save = await fetch(url + "/operations-integrations/sheets", { method: "PUT", headers: { authorization: "Bearer admin", "content-type": "application/json" }, body: JSON.stringify({ revision: 0, enabled: false, intervalHours: 24 }) }); assert.equal(save.status, 200); assert.equal(rows.get("A:sheets")?.audit[0]?.actorKeyId, "ownerA");
    const preview = await fetch(url + "/operations-integrations/preview", { headers: { authorization: "Bearer admin" } }); assert.equal(preview.status, 200); assert.deepEqual(await preview.json(), { returned: 1, ready: 0, truncated: false, exportScope: "session-metadata-only" });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});
