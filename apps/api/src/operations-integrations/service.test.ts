import test from "node:test";
import assert from "node:assert/strict";
import { createOperationsService, type OperationsDeps, type RunAuthorization } from "./service.js";
import { initialSchedule, validateSchedule, type Schedule } from "./model.js";
import type { ScheduleStore } from "./store.js";
function fixture() {
  const rows = new Map<string, Schedule>(), delivered: string[] = []; let time = Date.parse("2026-10-14T00:00:00Z");
  const store: ScheduleStore = {
    async load(tenant, kind) { const row = rows.get(`${tenant}:${kind}`); return row ? structuredClone(row) : null; },
    async replace(tenant, expected, next) {
      validateSchedule(next, tenant, next.kind); const id = `${tenant}:${next.kind}`, actual = rows.get(id);
      if (expected ? actual?.revision !== expected.revision || actual.leaseToken !== expected.leaseToken : actual !== undefined) return false;
      rows.set(id, structuredClone(next)); return true;
    },
  };
  const deps: OperationsDeps = { store, clock: () => time, notifications: async () => ({ notifications: [], limit: 50, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } }), sessions: async tenant => [{ tenantId: tenant, _id: "s1", title: "Real title", date: "2026-10-14", status: { transcribe: "done", index: "done" } }], adapters: {
    digest: { available: tenant => tenant === "tenant-a", execute: async input => { delivered.push(input.runId); } },
    sheets: { available: tenant => tenant === "tenant-a", execute: async input => { delivered.push(input.runId); } },
  } };
  const authorization: RunAuthorization = { mutate: callback => callback(), initialize: async callback => ({ work: callback() }) };
  return { rows, deps, authorization, delivered, advance: (milliseconds: number) => { time += milliseconds; }, service: createOperationsService(deps) };
}
test("passive reads, durable schedules and successful run are audited atomically with current tenant", async () => {
  const f = fixture(); const absent = await f.service.list("tenant-a"); assert.equal(absent.schedules[0]?.enabled, false); assert.equal(f.rows.size, 0); assert.equal(f.delivered.length, 0);
  const saved = await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "verified-admin");
  assert.equal(saved.revision, 1); assert.ok(saved.nextRunAt); const outcome = await f.service.run("tenant-a", "digest", 1, "verified-admin", f.authorization);
  assert.equal(outcome.lastResult, "succeeded"); assert.ok(outcome.lastSuccessAt); assert.equal(f.delivered.length, 1);
  assert.deepEqual(f.rows.get("tenant-a:digest")?.audit.map(row => [row.action, row.actorKeyId]), [["config-save", "verified-admin"], ["run-claim", "verified-admin"], ["run-claim", "verified-admin"], ["run-complete", "verified-admin"]]);
  assert.equal(JSON.stringify(outcome).includes("leaseToken"), false); assert.equal(JSON.stringify(outcome).includes("tenant-a"), false);
});
test("exact target binding, unknown body fields and disabled executions refuse before effects", async () => {
  const f = fixture(); await assert.rejects(f.service.save("tenant-b", "sheets", { revision: 0, enabled: true, intervalHours: 24 }, "admin"));
  await assert.rejects(f.service.save("tenant-a", "digest", { revision: 0, enabled: false, intervalHours: 24, tenantId: "tenant-b" }, "admin"));
  await assert.rejects(f.service.run("tenant-a", "digest", 0, "admin", f.authorization)); assert.equal(f.rows.size, 0); assert.equal(f.delivered.length, 0);
});
test("concurrent/stale revision can initialize only one side effect", async () => {
  const f = fixture(); await f.service.save("tenant-a", "sheets", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  const outcomes = await Promise.allSettled([f.service.run("tenant-a", "sheets", 1, "admin", f.authorization), f.service.run("tenant-a", "sheets", 1, "admin", f.authorization)]);
  assert.equal(outcomes.filter(row => row.status === "fulfilled").length, 1); assert.equal(f.delivered.length, 1);
  await assert.rejects(f.service.save("tenant-a", "sheets", { revision: 1, enabled: false, intervalHours: 168 }, "admin"));
});
test("possible-delivery failure disables schedule; expired lease cannot resend after restart", async () => {
  const f = fixture(); f.deps.adapters.digest.execute = async () => { throw new Error("PRIVATE SMTP BODY"); };
  await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  const result = await f.service.run("tenant-a", "digest", 1, "admin", f.authorization); assert.equal(result.lastResult, "uncertain"); assert.equal(result.enabled, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false); await assert.rejects(f.service.save("tenant-a", "digest", { revision: result.revision, enabled: true, intervalHours: 24 }, "admin"));
  const recovered = structuredClone(f.rows.get("tenant-a:digest")!); recovered.lastResult = "running"; recovered.enabled = true; recovered.nextRunAt = "2026-10-14T00:00:00.000Z"; recovered.leaseToken = "a".repeat(64); recovered.leaseUntil = "2026-10-14T00:00:00.000Z";
  f.rows.set("tenant-a:digest", recovered);
  const fresh = createOperationsService(f.deps); const after = await fresh.run("tenant-a", "digest", recovered.revision, "admin", f.authorization, true);
  assert.equal(after.lastResult, "uncertain"); assert.equal(after.lastErrorCode, "lease-expired"); assert.equal(f.delivered.length, 0);
});
test("foreign or malformed source row is refused before outbound while sibling state remains unchanged", async () => {
  const f = fixture(); await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  f.deps.sessions = async () => [{ tenantId: "tenant-b", _id: "FOREIGN", title: "secret", date: "2026-10-14" }];
  const result = await f.service.run("tenant-a", "digest", 1, "admin", f.authorization); assert.equal(result.lastResult, "failed"); assert.equal(result.lastErrorCode, "source-unavailable"); assert.equal(f.delivered.length, 0); assert.equal(f.rows.has("tenant-b:digest"), false);
});
test("role revalidation precedes executor; slow external work is awaited outside authorization lock", async () => {
  const f = fixture(); await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  let lock = false; const guarded: RunAuthorization = { mutate: async callback => { assert.equal(lock, false); lock = true; try { return await callback(); } finally { lock = false; } }, initialize: async callback => { lock = true; try { return { work: callback() }; } finally { lock = false; } } };
  f.deps.adapters.digest.execute = async () => { await Promise.resolve(); assert.equal(lock, false); };
  const result = await f.service.run("tenant-a", "digest", 1, "admin", guarded); assert.equal(result.lastResult, "succeeded");
  await f.service.save("tenant-a", "digest", { revision: result.revision, enabled: true, intervalHours: 24 }, "admin");
  const revoked: RunAuthorization = { mutate: callback => callback(), initialize: async () => { throw new Error("Role revoked"); } };
  const denied = await f.service.run("tenant-a", "digest", result.revision + 1, "admin", revoked); assert.equal(denied.lastResult, "failed");
});
test("future due schedule has no side effect; malformed/cross-tenant persisted schedule refuses", async () => {
  const f = fixture(); await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  const result = await f.service.run("tenant-a", "digest", 1, "admin", f.authorization, true); assert.equal(result.lastResult, "never"); assert.equal(f.delivered.length, 0);
  const foreign = { ...initialSchedule("tenant-b", "digest"), enabled: true }; f.rows.set("tenant-a:digest", foreign); await assert.rejects(f.service.list("tenant-a"));
});
test("audit capacity refuses the exact 9997 boundary before irreversible work", async () => {
  const f = fixture(), base = initialSchedule("tenant-a", "digest");
  const audit = Array.from({ length: 9997 }, (_, index) => ({ revision: index + 1, at: "2026-10-14T00:00:00.000Z", actorKeyId: "admin", action: "config-save" as const, outcome: "configured" as const }));
  f.rows.set("tenant-a:digest", { ...base, revision: audit.length, enabled: true, nextRunAt: "2026-10-14T00:00:00.000Z", audit });
  await assert.rejects(f.service.run("tenant-a", "digest", 9997, "admin", f.authorization)); assert.equal(f.delivered.length, 0);
  await assert.rejects(f.service.save("tenant-a", "digest", { revision: 9997, enabled: true, intervalHours: 24 }, "admin"));
  const disabled = await f.service.save("tenant-a", "digest", { revision: 9997, enabled: false, intervalHours: 24 }, "admin"); assert.equal(disabled.enabled, false); assert.equal(f.rows.get("tenant-a:digest")?.audit.length, 9998);
});

test("last permitted run leaves capacity for verified receipt reconciliation without resending", async () => {
  const f = fixture(), base = initialSchedule("tenant-a", "digest");
  const audit = Array.from({ length: 9996 }, (_, index) => ({ revision: index + 1, at: "2026-10-14T00:00:00.000Z", actorKeyId: "admin", action: "config-save" as const, outcome: "configured" as const }));
  f.rows.set("tenant-a:digest", { ...base, revision: audit.length, enabled: true, nextRunAt: "2026-10-14T00:00:00.000Z", audit });
  f.deps.adapters.digest.execute = async input => { f.delivered.push(input.runId); throw new Error("Ack lost"); };
  f.deps.adapters.digest.verifyReceipt = async () => true;
  const uncertain = await f.service.run("tenant-a", "digest", 9996, "admin", f.authorization);
  assert.equal(uncertain.lastResult, "uncertain"); assert.equal(uncertain.revision, 9999);
  const proven = await f.service.reconcile("tenant-a", "digest", uncertain.revision, "admin", f.authorization);
  assert.equal(proven.lastResult, "succeeded"); assert.equal(proven.enabled, false); assert.equal(proven.revision, 10000); assert.equal(f.delivered.length, 1);
});
test("reconciliation verifies a stored content-bound receipt and never retries on absent receipt", async () => {
  const f = fixture(); f.deps.adapters.digest.execute = async input => { f.delivered.push(input.runId); throw new Error("Ack lost"); };
  f.deps.adapters.digest.verifyReceipt = async () => false;
  await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "admin");
  const unknown = await f.service.run("tenant-a", "digest", 1, "admin", f.authorization); assert.equal(unknown.lastResult, "uncertain");
  const absent = await f.service.reconcile("tenant-a", "digest", unknown.revision, "admin", f.authorization); assert.equal(absent.lastResult, "uncertain"); assert.equal(f.delivered.length, 1);
  f.deps.adapters.digest.verifyReceipt = async input => { assert.equal(input.runId, unknown.runId); assert.equal(input.attemptRevision, 3); return true; };
  const proven = await f.service.reconcile("tenant-a", "digest", unknown.revision, "admin", f.authorization); assert.equal(proven.lastResult, "succeeded"); assert.equal(proven.enabled, false); assert.equal(f.delivered.length, 1);
});

test("effect followed by terminal CAS failure survives restart as audited uncertainty without redelivery", async () => {
  const f = fixture(), replace = f.deps.store.replace;
  let terminalFailure = true;
  f.deps.store.replace = async (tenant, expected, next) => {
    if (terminalFailure && next.lastResult === "succeeded") { terminalFailure = false; return false; }
    return replace(tenant, expected, next);
  };
  await f.service.save("tenant-a", "digest", { revision: 0, enabled: true, intervalHours: 24 }, "original-admin");
  await assert.rejects(f.service.run("tenant-a", "digest", 1, "original-admin", f.authorization), /conflict/);
  assert.equal(f.delivered.length, 1);
  const interrupted = structuredClone(f.rows.get("tenant-a:digest")!);
  assert.equal(interrupted.lastResult, "running"); assert.equal(interrupted.revision, 3);
  assert.equal(interrupted.runId, f.delivered[0]); assert.ok(interrupted.leaseToken); assert.ok(interrupted.leaseUntil);
  assert.equal(interrupted.lastSuccessAt, null);
  assert.deepEqual(interrupted.audit.map(event => event.action), ["config-save", "run-claim", "run-claim"]);

  // A new service instance consumes the exact persisted prepared row, without editing its state.
  const restarted = createOperationsService(f.deps);
  await assert.rejects(restarted.run("tenant-a", "digest", interrupted.revision, "recovery-admin", f.authorization, true), /conflict/);
  f.advance(120001);
  const recovered = await restarted.run("tenant-a", "digest", interrupted.revision, "recovery-admin", f.authorization, true);
  assert.equal(recovered.lastResult, "uncertain"); assert.equal(recovered.lastErrorCode, "lease-expired");
  assert.equal(recovered.enabled, false); assert.equal(recovered.nextRunAt, null); assert.equal(recovered.lastSuccessAt, null);
  assert.equal(recovered.runId, interrupted.runId); assert.equal(f.delivered.length, 1);
  const recoveryRow = f.rows.get("tenant-a:digest")!;
  assert.deepEqual(recoveryRow.audit.slice(0, interrupted.audit.length), interrupted.audit);
  assert.deepEqual(recoveryRow.audit.at(-1), { revision: 4, at: "2026-10-14T00:02:00.001Z", actorKeyId: "recovery-admin", action: "recover-uncertain", outcome: "uncertain" });
  assert.equal(recoveryRow.leaseToken, null); assert.equal(recoveryRow.leaseUntil, null);
  await assert.rejects(restarted.run("tenant-a", "digest", recovered.revision, "recovery-admin", f.authorization, true), /uncertain/);
  await assert.rejects(restarted.save("tenant-a", "digest", { revision: recovered.revision, enabled: true, intervalHours: 24 }, "recovery-admin"), /uncertain/);

  // Receipt-only recovery never re-reads current sources or submits the payload again.
  f.deps.sessions = async () => { throw new Error("Current source unavailable"); };
  f.deps.adapters.digest.verifyReceipt = async () => false;
  const absent = await restarted.reconcile("tenant-a", "digest", recovered.revision, "receipt-checker", f.authorization);
  assert.equal(absent.lastResult, "uncertain"); assert.equal(absent.revision, recovered.revision);
  f.deps.adapters.digest.verifyReceipt = async input => {
    assert.equal(input.runId, interrupted.runId); assert.equal(input.attemptAt, interrupted.lastAttemptAt); assert.equal(input.attemptRevision, interrupted.revision);
    return true;
  };
  const proven = await restarted.reconcile("tenant-a", "digest", recovered.revision, "receipt-checker", f.authorization);
  assert.equal(proven.lastResult, "succeeded"); assert.equal(proven.enabled, false); assert.equal(proven.nextRunAt, null);
  assert.equal(proven.revision, 5); assert.equal(f.delivered.length, 1);
  assert.equal(f.rows.get("tenant-a:digest")?.audit.at(-1)?.actorKeyId, "receipt-checker");
});
