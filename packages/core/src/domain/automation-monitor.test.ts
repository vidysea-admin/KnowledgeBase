import test from "node:test";
import assert from "node:assert/strict";
import { checkApplicationReadiness, parseApplicationReadiness, planAutomationMonitor } from "./automation-monitor.js";
test("application routine validates typed bounded fields and canonicalizes without invoking I/O", () => {
  assert.deepEqual(parseApplicationReadiness({ applicationRef: "app-1", requiredDocuments: ["transcript", "identity"], availableDocuments: ["identity"] }), { applicationRef: "app-1", requiredDocuments: ["identity", "transcript"], availableDocuments: ["identity"] });
  assert.deepEqual(checkApplicationReadiness({ applicationRef: "app-1", requiredDocuments: ["transcript", "identity"], availableDocuments: ["identity"] }), { ready: false, missingDocuments: ["transcript"] });
  for (const body of [null, { applicationRef: "https://host/private", requiredDocuments: ["identity"], availableDocuments: [] }, { applicationRef: "x", requiredDocuments: ["identity", "identity"], availableDocuments: [] }, { applicationRef: "x", requiredDocuments: [], availableDocuments: [] }, { applicationRef: "x", requiredDocuments: ["secret"], availableDocuments: [] }, { applicationRef: "x", requiredDocuments: ["identity"], availableDocuments: [], tenantId: "other" }]) assert.throws(() => parseApplicationReadiness(body));
});
test("monitor exact lease boundary, bounded retry and reconciliation are explicit", () => {
  const running = { status: "running" as const, leaseUntil: 100, attempts: 1, maxAttempts: 3, retrySafe: true };
  assert.equal(planAutomationMonitor(running, 99), "unchanged");
  assert.equal(planAutomationMonitor(running, 100), "retry");
  assert.equal(planAutomationMonitor({ ...running, attempts: 3 }, 100), "exhausted");
  assert.equal(planAutomationMonitor({ ...running, retrySafe: false }, 100), "reconcile");
  assert.equal(planAutomationMonitor({ ...running, status: "waiting-for-operator" }, 100), "unchanged");
  assert.throws(() => planAutomationMonitor({ ...running, maxAttempts: 4 }, 100));
  assert.throws(() => planAutomationMonitor({ ...running, leaseUntil: NaN }, 100));
});
