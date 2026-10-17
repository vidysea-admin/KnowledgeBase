import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationFixtureDatabase } from "./form-fixture.js";
import { createMongoApplicationStore } from "./form-store.js";
import { ApplicationFormRuntime } from "./form-runtime.js";
import { createConfiguredFormAdapter } from "./form-adapter.js";
import { AutomationError } from "./types.js";
import { applicationOperationView, type ApplicationAdapter, type ApplicationOperation, type ApplicationTarget } from "./form-types.js";
const p = { tenantId: "tenant-a", actorId: "operator-a" }, other = { tenantId: "tenant-b", actorId: "operator-b" };
const field = { name: "courseRef", value: "MATH", source: { documentId: "document-1", page: 1, start: 0, end: 4, revision: "a".repeat(64) } };
const config = { targetId: "university-application", enabled: true, maxAttempts: 3, timeoutMs: 100, expectedVersion: 0 };
const input = { targetId: "university-application", idempotencyKey: "form-1", fields: [field] };
const rejects = (code: string) => (e: unknown) => e instanceof AutomationError && e.code === code;
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function setup(adapter?: ApplicationAdapter) {
  const db = new ApplicationFixtureDatabase(); let now = 1000;
  const target: ApplicationTarget = { id: "university-application", version: "v1", requiredFields: ["courseRef"], allowedFields: ["courseRef"], configurationDigest: "d".repeat(64),
    adapter: adapter ?? { duplicateGuarantee: "operation-id", submit: async () => ({ receiptId: "receipt-1" }), verifyReceipt: async request => request.receiptId === "receipt-1" },
    async verifyField(tenant, f) { return tenant === p.tenantId && JSON.stringify(f) === JSON.stringify(field); } };
  const runtime = new ApplicationFormRuntime(createMongoApplicationStore(db.collection), [target], () => now);
  return { db, runtime, target, setTime: (value: number) => { now = value; } };
}
async function approved(runtime: ApplicationFormRuntime) { await runtime.configure(p, config); const created = await runtime.submit(p, input); return runtime.approve(p, created.operation._id, created.operation.version); }
test("approved actual configured adapter flow, protected provenance, replay/conflict and fresh store reconstruction", async () => {
  const requests: { operationId: string; values: string[] }[] = [];
  const adapter = createConfiguredFormAdapter({ endpoint: "https://forms.example.test/applications", allowedOrigins: new Set(["https://forms.example.test"]), token: "fixture-secret", duplicateGuarantee: "operation-id", transport: async request => { const body = JSON.parse(request.body!); requests.push({ operationId: body.operationId, values: body.fields.map((f: { value: string }) => f.value) }); assert.equal(request.headers["idempotency-key"], body.operationId); return { status: 201, body: { operationId: body.operationId, tenantId: body.tenantId, receiptId: "receipt-1", status: "accepted" } }; } });
  const { db, runtime, target } = setup(adapter), run = await approved(runtime), done = await runtime.execute(p, run._id, run.version);
  assert.equal(done.status, "succeeded"); assert.equal(done.sideEffectUncertain, false); assert.deepEqual(requests, [{ operationId: run._id, values: ["MATH"] }]);
  const restored = new ApplicationFormRuntime(createMongoApplicationStore(db.collection), [target]); assert.equal((await restored.load(p.tenantId, run._id)).receiptId, "receipt-1");
  assert.equal((await restored.submit(p, input)).replay, true); await assert.rejects(restored.submit(p, { ...input, fields: [] }), rejects("conflict"));
  await assert.rejects(restored.load(other.tenantId, run._id), rejects("not_found"));
  const served = JSON.stringify(applicationOperationView(done)); for (const secret of ["MATH", "document-1", "fixture-secret", "operator-a", "receipt-1"]) assert.ok(!served.includes(secret), secret);
});
test("missing/unknown fields, unverifiable source and unregistered target cannot execute", async () => {
  const { runtime } = setup(); await runtime.configure(p, config);
  await assert.rejects(runtime.submit(p, { ...input, targetId: "caller-controlled-url" }), rejects("invalid_request"));
  await assert.rejects(runtime.submit(p, { ...input, fields: [{ ...field, name: "password" }] }), rejects("invalid_request"));
  await assert.rejects(runtime.submit(p, { ...input, actorId: "owner" }), rejects("invalid_request"));
  for (const documentId of ["invalid document", "invalid\tdocument"]) await assert.rejects(runtime.submit(p, { ...input, fields: [{ ...field, source: { ...field.source, documentId } }] }), rejects("invalid_request"));
  const missing = await runtime.submit(p, { ...input, fields: [] }); assert.equal(missing.operation.incident, "missing-required-fields"); await assert.rejects(runtime.approve(p, missing.operation._id, missing.operation.version), rejects("conflict"));
  const forged = await runtime.submit(p, { ...input, idempotencyKey: "forged", fields: [{ ...field, source: { ...field.source, revision: "b".repeat(64) } }] }); await assert.rejects(runtime.approve(p, forged.operation._id, forged.operation.version), rejects("conflict"));
  await assert.rejects(runtime.execute(p, forged.operation._id, forged.operation.version), rejects("conflict"));
});
test("approval binds exact fields/target version and revision invalidates approval before effects", async () => {
  const { db, runtime, target } = setup(), run = await approved(runtime);
  const revised = await runtime.revise(p, run._id, { expectedVersion: run.version, fields: [] }); assert.equal(revised.approval, null); assert.equal(revised.status, "draft");
  await assert.rejects(runtime.execute(p, revised._id, revised.version), rejects("conflict"));
  const newTarget = { ...target, version: "v2" }, changed = new ApplicationFormRuntime(createMongoApplicationStore(db.collection), [newTarget]);
  await assert.rejects(changed.approve(p, revised._id, revised.version), rejects("conflict"));
});
test("stable operation identity deduplicates a committed effect across an ambiguous safe retry", async () => {
  const effects = new Map<string, string>(); let invocations = 0;
  const { runtime } = setup({ duplicateGuarantee: "operation-id", async submit(request) { invocations++; if (!effects.has(request.operationId)) { effects.set(request.operationId, "receipt-1"); throw new Error("network-lost-after-commit-secret"); } return { receiptId: effects.get(request.operationId)! }; }, verifyReceipt: async () => true });
  const run = await approved(runtime), waiting = await runtime.execute(p, run._id, run.version); assert.equal(waiting.sideEffectUncertain, true);
  await assert.rejects(runtime.intervene(p, waiting._id, { action: "cancel", receiptId: null, expectedVersion: waiting.version }), rejects("conflict"));
  const retry = await runtime.intervene(p, waiting._id, { action: "retry", receiptId: null, expectedVersion: waiting.version });
  const done = await runtime.execute(p, retry._id, retry.version); assert.equal(done.status, "succeeded"); assert.equal(effects.size, 1); assert.equal(invocations, 2);
  assert.ok(!JSON.stringify(done).includes("network-lost"));
});
test("unsafe crash after effect before durable result quarantines and requires verified receipt proof", async () => {
  let effects = 0;
  const { db, runtime, setTime } = setup({ duplicateGuarantee: "none", async submit() { effects++; db.failNextWrite = true; return { receiptId: "verified-receipt" }; }, verifyReceipt: async request => request.receiptId === "verified-receipt" });
  const run = await approved(runtime); await assert.rejects(runtime.execute(p, run._id, run.version), rejects("unavailable")); setTime(7000);
  assert.equal((await runtime.monitor(p)).changed, 1); assert.equal((await runtime.monitor(p)).changed, 0);
  const waiting = await runtime.load(p.tenantId, run._id); assert.equal(waiting.incident, "uncertain-side-effect"); assert.equal(waiting.sideEffectUncertain, true);
  await assert.rejects(runtime.intervene(p, run._id, { action: "retry", receiptId: null, expectedVersion: waiting.version }), rejects("conflict"));
  await assert.rejects(runtime.intervene(p, run._id, { action: "reconcile", receiptId: "invented-receipt", expectedVersion: waiting.version }), rejects("conflict"));
  assert.equal((await runtime.load(p.tenantId, run._id)).status, "waiting-for-operator");
  const reconciled = await runtime.intervene(p, run._id, { action: "reconcile", receiptId: "verified-receipt", expectedVersion: waiting.version }); assert.equal(reconciled.status, "succeeded"); assert.equal(effects, 1);
});
test("concurrent claims are exclusive and expired owners cannot commit after monitor recovery", async () => {
  const gate = deferred<{ receiptId: string }>(), entered = deferred<void>(); let invocations = 0;
  let heartbeat!: () => Promise<void>;
  const { runtime, setTime } = setup({ duplicateGuarantee: "operation-id", async submit(context) { invocations++; heartbeat = context.heartbeat; entered.resolve(); return gate.promise; }, verifyReceipt: async () => true });
  const run = await approved(runtime), executing = runtime.execute(p, run._id, run.version); await entered.promise;
  await assert.rejects(runtime.execute(p, run._id, run.version), rejects("conflict")); assert.equal(invocations, 1); setTime(7000); await runtime.monitor(p);
  await assert.rejects(heartbeat(), rejects("conflict")); gate.resolve({ receiptId: "receipt-1" }); await assert.rejects(executing, rejects("conflict")); assert.equal((await runtime.load(p.tenantId, run._id)).status, "approved");
});
test("configured adapter refuses unsafe destinations, redirects and wrong-operation receipts without external requests", async () => {
  const opts = { endpoint: "https://forms.example.test/applications", allowedOrigins: new Set(["https://forms.example.test"]), token: "fixture-token", duplicateGuarantee: "none" as const };
  for (const endpoint of ["http://forms.example.test/applications", "https://127.0.0.1/applications", "https://forms.example.test/applications?token=x", "https://evil.test/applications"]) assert.throws(() => createConfiguredFormAdapter({ ...opts, endpoint, allowedOrigins: endpoint.includes("127.0.0.1") ? new Set(["https://127.0.0.1"]) : opts.allowedOrigins }));
  const controller = new AbortController(), request = { operationId: "operation-1", tenantId: p.tenantId, fields: [field], signal: controller.signal, heartbeat: async () => {} };
  const redirect = createConfiguredFormAdapter({ ...opts, transport: async () => ({ status: 302, body: { location: "https://evil.test" } }) }); await assert.rejects(redirect.submit(request));
  const wrong = createConfiguredFormAdapter({ ...opts, transport: async () => ({ status: 200, body: { operationId: "other-operation", tenantId: p.tenantId, receiptId: "receipt-1", status: "accepted" } }) }); await assert.rejects(wrong.submit(request)); assert.equal(await wrong.verifyReceipt({ ...request, receiptId: "receipt-1" }), false);
  const foreign = createConfiguredFormAdapter({ ...opts, transport: async () => ({ status: 200, body: { operationId: request.operationId, tenantId: other.tenantId, receiptId: "receipt-1", status: "accepted" } }) }); await assert.rejects(foreign.submit(request)); assert.equal(await foreign.verifyReceipt({ ...request, receiptId: "receipt-1" }), false);
  const valid = createConfiguredFormAdapter({ ...opts, transport: async r => { assert.equal(r.headers["x-lkb-tenant-id"], encodeURIComponent(p.tenantId)); assert.ok(r.url.pathname.endsWith("/operations/operation-1")); return { status: 200, body: { operationId: request.operationId, tenantId: p.tenantId, receiptId: "receipt-1", status: "accepted" } }; } });
  assert.equal(await valid.verifyReceipt({ ...request, receiptId: "receipt-1" }), true); assert.equal(await valid.verifyReceipt({ ...request, receiptId: "forged" }), false);
});
test("timeouts/exhaustion, failed writes and corrupt approval remain honest and do not fabricate success", async () => {
  const { db, runtime } = setup({ duplicateGuarantee: "operation-id", submit: async () => new Promise(() => {}), verifyReceipt: async () => false });
  let run = await approved(runtime); for (let attempt = 0; attempt < 3; attempt++) { run = await runtime.execute(p, run._id, run.version); if (attempt < 2) run = await runtime.intervene(p, run._id, { action: "retry", receiptId: null, expectedVersion: run.version }); }
  assert.equal(run.status, "failed"); assert.equal(run.sideEffectUncertain, true); assert.equal(run.attempts, 3);
  await assert.rejects(runtime.intervene(p, run._id, { action: "retry", receiptId: null, expectedVersion: run.version }), rejects("conflict"));
  const corrupt = db.rows.get(run._id) as ApplicationOperation; corrupt.approval!.payloadDigest = "a".repeat(64); await assert.rejects(runtime.load(p.tenantId, run._id), rejects("unavailable"));
  db.failNextWrite = true; await assert.rejects(runtime.submit(p, { ...input, idempotencyKey: "write-failure" }), rejects("unavailable"));
});
