import test from "node:test";
import assert from "node:assert/strict";
import { runOperationsTick } from "./tick.js";
import type { OperationsService } from "../../apps/api/src/operations-integrations/service.js";
import type { HostingService } from "../../apps/api/src/hosting/service.js";
import { OperationsError } from "../../apps/api/src/operations-integrations/model.js";
test("one-shot scheduler passes only verified host principal and due-only execution", async () => {
  const principal = { tenantId: "A", keyId: "service-key", scopes: ["hosting", "operations"] }, calls: unknown[][] = [];
  const service = { list: async () => ({ schedules: [{ kind: "digest", enabled: true, lastResult: "never", revision: 4 }, { kind: "sheets", enabled: false, lastResult: "never", revision: 1 }] }), run: async (...args: unknown[]) => { calls.push(args); return { kind: "digest", lastResult: "succeeded" }; } } as unknown as OperationsService;
  const hosting = { withPermission: async (p: typeof principal, permission: string, callback: () => Promise<unknown>) => { assert.equal(p, principal); assert.equal(permission, "operations:run"); return callback(); } } as Pick<HostingService, "withPermission">;
  await runOperationsTick(service, hosting, principal); assert.equal(calls.length, 1); assert.deepEqual(calls[0]?.slice(0, 4), ["A", "digest", 4, "service-key"]); assert.equal(calls[0]?.[5], true);
});

test("a refused digest leaves the independent due Sheets operation reachable", async () => {
  const calls: string[] = [], principal = { tenantId: "A", keyId: "service-key", scopes: ["hosting", "operations"] };
  const service = { list: async () => ({ schedules: [{ kind: "digest", enabled: true, lastResult: "never", revision: 1 }, { kind: "sheets", enabled: true, lastResult: "never", revision: 2 }] }),
    run: async (_tenant: string, kind: string) => { calls.push(kind); if (kind === "digest") throw new OperationsError("disabled"); return { kind: "sheets", lastResult: "succeeded" }; },
  } as unknown as OperationsService;
  const hosting = { withPermission: async (_p: unknown, _permission: unknown, callback: () => Promise<unknown>) => callback() } as Pick<HostingService, "withPermission">;
  const result = await runOperationsTick(service, hosting, principal);
  assert.deepEqual(calls, ["digest", "sheets"]);
  assert.deepEqual(result.outcomes, [{ kind: "digest", lastResult: "refused", reason: "disabled" }, { kind: "sheets", lastResult: "succeeded" }]);
});
