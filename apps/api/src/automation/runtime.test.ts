import test from "node:test";
import assert from "node:assert/strict";
import { checkApplicationReadiness } from "../../../../packages/core/src/domain/automation-monitor.js";
import { AutomationRuntime, applicationReadinessHandler } from "./runtime.js";
import { createMongoAutomationStore } from "./store.js";
import { AutomationError, automationRunView, type AutomationHandler, type AutomationRun } from "./types.js";
import { AutomationFixtureDatabase } from "./fixture-store.js";
const p = { tenantId: "tenant-a", actorId: "key-admin" }, foreign = { tenantId: "tenant-b", actorId: "key-other" };
const configure = { enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 };
const input = { idempotencyKey: "request-1", kind: "application-readiness", input: { applicationRef: "private-app-1", requiredDocuments: ["identity"], availableDocuments: ["identity"] } };
const rejected = (code: string) => (e: unknown) => e instanceof AutomationError && e.code === code;
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function setup(handler: AutomationHandler = applicationReadinessHandler) {
  const db = new AutomationFixtureDatabase(); let now = 1000;
  const runtime = new AutomationRuntime(createMongoAutomationStore(db.collection), handler, () => now);
  return { db, runtime, setTime: (v: number) => { now = v; } };
}
test("durable adapter contract, definition CAS, replay, conflict and tenant isolation", async () => {
  const { db, runtime } = setup();
  const def = await runtime.configure(p, configure); assert.equal(def.version, 1);
  await assert.rejects(runtime.configure(p, configure), rejected("conflict"));
  const first = await runtime.submit(p, input), replay = await runtime.submit(p, input);
  assert.equal(replay.run._id, first.run._id); assert.equal(replay.replay, true);
  const reordered = { ...input, idempotencyKey: "canonical-order", input: { ...input.input, requiredDocuments: ["transcript", "identity"] } };
  const orderedRun = await runtime.submit(p, reordered);
  assert.equal((await runtime.submit(p, { ...reordered, input: { ...reordered.input, requiredDocuments: ["identity", "transcript"] } })).run._id, orderedRun.run._id);
  await assert.rejects(runtime.submit(p, { ...input, input: { ...input.input, availableDocuments: [] } }), rejected("conflict"));
  await runtime.configure(foreign, configure); const other = await runtime.submit(foreign, input);
  assert.notEqual(other.run._id, first.run._id);
  await assert.rejects(runtime.load(foreign.tenantId, first.run._id), rejected("not_found"));
  // Fresh store/runtime over the same backing fixture data proves adapter reconstruction, not actual Mongo persistence.
  const reconstructed = new AutomationRuntime(createMongoAutomationStore(db.collection));
  assert.equal((await reconstructed.load(p.tenantId, first.run._id)).status, "queued");
  const done = await reconstructed.execute(p, first.run._id, first.run.version); assert.equal(done.status, "succeeded");
  assert.deepEqual(done.outcome, { ready: true, missingDocuments: [] });
  const served = JSON.stringify(automationRunView(done)); assert.ok(!served.includes("private-app-1")); assert.ok(!served.includes("key-admin")); assert.ok(!served.includes("identityDigest"));
});
test("unknown handlers, extra caller identities, malformed input and write failures are refused", async () => {
  const { db, runtime } = setup(); await runtime.configure(p, configure);
  for (const value of [{ ...input, kind: "shell" }, { ...input, tenantId: "foreign" }, { ...input, actorId: "owner" }, { ...input, input: { ...input.input, url: "https://example.org" } }]) await assert.rejects(runtime.submit(p, value), rejected("invalid_request"));
  db.failNextWrite = true; await assert.rejects(runtime.submit(p, input), rejected("unavailable")); assert.equal((await runtime.store.list(p.tenantId, "run", 100)).length, 0);
  const first = await runtime.submit(p, input); db.failNextWrite = true;
  await assert.rejects(runtime.execute(p, first.run._id, first.run.version), rejected("unavailable")); assert.equal((await runtime.load(p.tenantId, first.run._id)).status, "queued");
});
test("disabled definitions block queued execution and cancelled work never executes", async () => {
  let calls = 0;
  const { runtime } = setup({ retrySafe: true, async execute(value) { calls++; return checkApplicationReadiness(value); } });
  const definition = await runtime.configure(p, configure), first = await runtime.submit(p, input);
  const disabled = await runtime.configure(p, { ...configure, enabled: false, expectedVersion: definition.version });
  await assert.rejects(runtime.execute(p, first.run._id, first.run.version), rejected("conflict")); assert.equal(calls, 0);
  await runtime.configure(p, { ...configure, expectedVersion: disabled.version });
  const cancelled = await runtime.intervene(p, first.run._id, { action: "cancel", expectedVersion: first.run.version });
  await assert.rejects(runtime.execute(p, cancelled._id, cancelled.version), rejected("conflict")); assert.equal(calls, 0);
});
test("concurrent execution has one claim and stale workers cannot commit or heartbeat after recovery", async () => {
  const gate = deferred<ReturnType<typeof checkApplicationReadiness>>(), entered = deferred<void>(); let heartbeat!: () => Promise<void>, calls = 0;
  const { runtime, setTime } = setup({ retrySafe: true, async execute(_input, ctx) { calls++; heartbeat = ctx.heartbeat; entered.resolve(); return gate.promise; } });
  await runtime.configure(p, configure); const first = await runtime.submit(p, input);
  const executing = runtime.execute(p, first.run._id, first.run.version); await entered.promise;
  await assert.rejects(runtime.execute(p, first.run._id, first.run.version), rejected("conflict")); assert.equal(calls, 1);
  setTime(7000); assert.deepEqual(await runtime.monitor(p), { scanned: 1, changed: 1, truncated: false });
  assert.deepEqual(await runtime.monitor(p), { scanned: 0, changed: 0, truncated: false });
  await assert.rejects(heartbeat(), rejected("conflict"));
  gate.resolve({ ready: true, missingDocuments: [] }); await assert.rejects(executing, rejected("conflict"));
  assert.equal((await runtime.load(p.tenantId, first.run._id)).status, "queued");
});
test("timeout writes a durable operator handoff and retry obeys current version and attempt cap", async () => {
  const { runtime } = setup({ retrySafe: true, execute: async () => new Promise(() => {}) }); await runtime.configure(p, configure);
  const first = await runtime.submit(p, input); const waiting = await runtime.execute(p, first.run._id, first.run.version);
  assert.equal(waiting.status, "waiting-for-operator"); assert.equal(waiting.incident, "handler-timeout");
  await assert.rejects(runtime.intervene(p, first.run._id, { action: "retry", expectedVersion: first.run.version }), rejected("conflict"));
  let run = await runtime.intervene(p, waiting._id, { action: "retry", expectedVersion: waiting.version });
  run = await runtime.execute(p, run._id, run.version); run = await runtime.intervene(p, run._id, { action: "retry", expectedVersion: run.version });
  run = await runtime.execute(p, run._id, run.version); assert.equal(run.attempts, 3);
  await assert.rejects(runtime.intervene(p, run._id, { action: "retry", expectedVersion: run.version }), rejected("conflict"));
  const cancelled = await runtime.intervene(p, run._id, { action: "cancel", expectedVersion: run.version }); assert.equal(cancelled.status, "cancelled");
});
test("crash after unsafe side effect before durable commit parks reconciliation instead of blind retry", async () => {
  let committedActions = 0;
  const { db, runtime, setTime } = setup({ retrySafe: false, async execute(value) { committedActions++; db.failNextWrite = true; return checkApplicationReadiness(value); } });
  await runtime.configure(p, configure); const first = await runtime.submit(p, input);
  await assert.rejects(runtime.execute(p, first.run._id, first.run.version), rejected("unavailable"));
  assert.equal((await runtime.load(p.tenantId, first.run._id)).status, "running");
  setTime(7000); await runtime.monitor(p); const waiting = await runtime.load(p.tenantId, first.run._id);
  assert.equal(waiting.status, "waiting-for-operator"); assert.equal(waiting.incident, "reconciliation-required");
  await assert.rejects(runtime.intervene(p, waiting._id, { action: "retry", expectedVersion: waiting.version }), rejected("conflict"));
  await assert.rejects(runtime.execute(p, waiting._id, waiting.version), rejected("conflict"));
  const reconciled = await runtime.intervene(p, waiting._id, { action: "reconcile", expectedVersion: waiting.version }); assert.equal(reconciled.status, "succeeded");
  assert.equal(committedActions, 1);
});
test("corrupt stored state, arbitrary upstream text and forged outcomes never become successful status", async () => {
  const { db, runtime } = setup({ retrySafe: true, async execute() { throw new Error("secret-token-and-form-PII"); } }); await runtime.configure(p, configure);
  const first = await runtime.submit(p, input); const waiting = await runtime.execute(p, first.run._id, first.run.version);
  assert.equal(waiting.status, "waiting-for-operator"); assert.ok(!JSON.stringify(waiting).includes("secret-token"));
  const corrupt = db.rows.get(first.run._id) as AutomationRun; corrupt.status = "running"; corrupt.ownerToken = null;
  await assert.rejects(runtime.load(p.tenantId, corrupt._id), rejected("unavailable"));
  const bad = setup({ retrySafe: true, async execute() { return { ready: false, missingDocuments: [] }; } }); await bad.runtime.configure(p, configure);
  const row = await bad.runtime.submit(p, input); assert.equal((await bad.runtime.execute(p, row.run._id, row.run.version)).status, "waiting-for-operator");
});
