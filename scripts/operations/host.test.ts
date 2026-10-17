import test from "node:test";
import assert from "node:assert/strict";
import { createOperationsTickHost } from "./host.js";
import type { HostingService } from "../../apps/api/src/hosting/service.js";
import type { OperationsService } from "../../apps/api/src/operations-integrations/service.js";
import { runOperationsSupervisor } from "./supervisor.js";
test("host callback never adopts CLI/client principal; disabled/missing/revoked identity refuses", async () => {
  let reads = 0;
  const service = { list: async () => { reads++; return { schedules: [] }; } } as unknown as OperationsService;
  const hosting = { withPermission: async (_principal: unknown, _permission: unknown, callback: () => Promise<unknown>) => callback() } as Pick<HostingService, "withPermission">;
  const disabled = createOperationsTickHost({ service, hosting, keyStore: { verify: async () => { throw new Error("Should not verify"); } }, env: {} });
  assert.deepEqual(await disabled(), { status: "disabled", outcomes: [] });
  await assert.rejects(createOperationsTickHost({ service, hosting, keyStore: { verify: async () => null }, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" } })());
  const bound = createOperationsTickHost({ service, hosting, keyStore: { verify: async () => ({ tenantId: "A", keyId: "trusted-id", scopes: ["hosting", "operations"] }) }, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" } });
  assert.equal((await bound()).status, "checked"); assert.equal(reads, 1);
});

test("host reports attention for refused or uncertain operations without implying scheduler success", async () => {
  const service = { list: async () => ({ schedules: [{ kind: "digest", enabled: true, lastResult: "never", revision: 1 }] }), run: async () => ({ kind: "digest", lastResult: "uncertain" }) } as unknown as OperationsService;
  const hosting = { withPermission: async (_principal: unknown, _permission: unknown, callback: () => Promise<unknown>) => callback() } as Pick<HostingService, "withPermission">;
  const callback = createOperationsTickHost({ service, hosting, keyStore: { verify: async () => ({ tenantId: "A", keyId: "trusted-id", scopes: ["hosting", "operations"] }) }, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" } });
  assert.equal((await callback()).status, "attention");
});

test("actual existing supervisor is passive when disabled or aborted and drains its current tick", async () => {
  const controller = new AbortController(); let verified = 0, reads = 0;
  const service = { list: async () => { reads++; controller.abort(); return { schedules: [] }; } } as unknown as OperationsService;
  const hosting = { withPermission: async (_principal: unknown, _permission: unknown, callback: () => Promise<unknown>) => callback() } as Pick<HostingService, "withPermission">;
  const keyStore = { verify: async () => { verified++; return { tenantId: "A", keyId: "trusted-id", scopes: ["hosting", "operations"] }; } };
  const options = { service, hosting, keyStore, signal: controller.signal, env: {} };
  await runOperationsSupervisor(options); assert.equal(verified, 0);
  const logs: string[] = [];
  await runOperationsSupervisor({ ...options, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" }, log: line => logs.push(line) });
  assert.equal(verified, 1); assert.equal(reads, 1); assert.deepEqual(logs, ["Operations worker checked due schedules."]);
  await runOperationsSupervisor({ ...options, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" } });
  assert.equal(verified, 1); assert.equal(reads, 1);
});

test("supervisor sanitizes verification failure and stops without another tick after abort", async () => {
  const controller = new AbortController(), logs: string[] = [];
  const service = { list: async () => { throw new Error("Must not read"); } } as unknown as OperationsService;
  const hosting = { withPermission: async (_principal: unknown, _permission: unknown, callback: () => Promise<unknown>) => callback() } as Pick<HostingService, "withPermission">;
  await runOperationsSupervisor({ service, hosting, signal: controller.signal, env: { LKB_OPERATIONS_WORKER_ENABLED: "1", LKB_OPERATIONS_WORKER_KEY: "private" }, keyStore: { verify: async () => { controller.abort(); throw new Error("PRIVATE TOKEN OR PROVIDER DETAIL"); } }, log: line => logs.push(line) });
  assert.deepEqual(logs, ["Operations worker unavailable or unauthorized; no successful cycle established."]);
});
