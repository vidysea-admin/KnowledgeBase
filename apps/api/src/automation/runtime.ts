import { createHash, randomUUID } from "node:crypto";
import { checkApplicationReadiness, isAutomationReference, parseApplicationReadiness, planAutomationMonitor } from "../../../../packages/core/src/domain/automation-monitor.js";
import { AutomationError, type AutomationAudit, type AutomationDefinition, type AutomationHandler, type AutomationPrincipal, type AutomationRecord, type AutomationRun, type AutomationStore } from "./types.js";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const fields = (body: unknown, keys: string[]): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== keys.sort().join(",")) throw new AutomationError("invalid_request");
  return body as Record<string, unknown>;
};
const audit = (record: AutomationRecord, at: number, actor: string, action: AutomationAudit["action"]): AutomationRun["history"] => [...record.history, { at, actor, action }].slice(-100) as AutomationRun["history"];
/** Registered read-only form-completeness routine; never submits a student application externally. */
export const applicationReadinessHandler: AutomationHandler = {
  retrySafe: true,
  async execute(input, { signal }) { signal.throwIfAborted(); return checkApplicationReadiness(input); },
};
export class AutomationRuntime {
  constructor(readonly store: AutomationStore, private readonly handler: AutomationHandler = applicationReadinessHandler, private readonly clock = Date.now) {}
  private now(): number { const at = this.clock(); if (!Number.isSafeInteger(at) || at < 0) throw new AutomationError("unavailable"); return at; }
  private principal(p: AutomationPrincipal): void {
    if (!p || typeof p.tenantId !== "string" || !p.tenantId.trim() || p.tenantId !== p.tenantId.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(p.tenantId) || !isAutomationReference(p.actorId)) throw new AutomationError("forbidden");
  }
  definitionId(tenantId: string): string { return `def-${sha(tenantId).slice(0, 40)}`; }
  async configure(p: AutomationPrincipal, value: unknown): Promise<AutomationDefinition> {
    this.principal(p);
    const body = fields(value, ["enabled", "maxAttempts", "timeoutMs", "expectedVersion"]);
    if (typeof body.enabled !== "boolean" || !Number.isInteger(body.maxAttempts) || Number(body.maxAttempts) < 1 || Number(body.maxAttempts) > 3 || !Number.isInteger(body.timeoutMs) || Number(body.timeoutMs) < 100 || Number(body.timeoutMs) > 30000 || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) throw new AutomationError("invalid_request");
    const _id = this.definitionId(p.tenantId), previous = await this.store.get(p.tenantId, _id), at = this.now();
    if (previous && previous.recordType !== "definition") throw new AutomationError("unavailable");
    if (previous ? body.expectedVersion !== previous.version : body.expectedVersion !== 0) throw new AutomationError("conflict");
    const next: AutomationDefinition = { _id, tenantId: p.tenantId, recordType: "definition", kind: "application-readiness", enabled: body.enabled,
      maxAttempts: Number(body.maxAttempts), timeoutMs: Number(body.timeoutMs), version: previous ? previous.version + 1 : 1, updatedAt: at,
      history: previous ? audit(previous, at, p.actorId, "configured") : [{ at, actor: p.actorId, action: "configured" }] };
    if (previous ? !await this.store.compareAndSwap(p.tenantId, previous, next) : !await this.store.insert(p.tenantId, next)) throw new AutomationError("conflict");
    return next;
  }
  async submit(p: AutomationPrincipal, value: unknown): Promise<{ run: AutomationRun; replay: boolean }> {
    this.principal(p);
    const body = fields(value, ["idempotencyKey", "kind", "input"]);
    if (body.kind !== "application-readiness" || !isAutomationReference(body.idempotencyKey)) throw new AutomationError("invalid_request");
    let payload; try { payload = parseApplicationReadiness(body.input); } catch { throw new AutomationError("invalid_request"); }
    const identityDigest = sha(JSON.stringify([p.tenantId, body.idempotencyKey])), payloadDigest = sha(JSON.stringify([body.kind, payload])), _id = `run-${identityDigest}`;
    const replay = async (): Promise<{ run: AutomationRun; replay: boolean } | null> => {
      const existing = await this.store.get(p.tenantId, _id); if (!existing) return null;
      if (existing.recordType !== "run" || existing.identityDigest !== identityDigest || existing.payloadDigest !== payloadDigest) throw new AutomationError("conflict");
      return { run: existing, replay: true };
    };
    const existing = await replay(); if (existing) return existing;
    const def = await this.store.get(p.tenantId, this.definitionId(p.tenantId));
    if (!def || def.recordType !== "definition" || !def.enabled) throw new AutomationError("conflict");
    const at = this.now();
    const run: AutomationRun = { _id, tenantId: p.tenantId, recordType: "run", kind: "application-readiness", definitionId: def._id,
      identityDigest, payloadDigest, payload, status: "queued", version: 1, createdAt: at, updatedAt: at, attempts: 0,
      maxAttempts: def.maxAttempts, timeoutMs: def.timeoutMs, ownerToken: null, leaseUntil: null, incident: null, outcome: null,
      history: [{ at, actor: p.actorId, action: "submitted" }] };
    if (await this.store.insert(p.tenantId, run)) return { run, replay: false };
    const raced = await replay(); if (!raced) throw new AutomationError("unavailable"); return raced;
  }
  async load(tenantId: string, id: string): Promise<AutomationRun> {
    if (!isAutomationReference(id)) throw new AutomationError("invalid_request");
    const run = await this.store.get(tenantId, id);
    if (!run || run.recordType !== "run") throw new AutomationError("not_found");
    return run;
  }
  private async change(previous: AutomationRun, actor: string, action: AutomationAudit["action"], changes: Partial<AutomationRun>): Promise<AutomationRun> {
    const at = this.now(), next = { ...previous, ...changes, version: previous.version + 1, updatedAt: at, history: audit(previous, at, actor, action) };
    if (!await this.store.compareAndSwap(previous.tenantId, previous, next)) throw new AutomationError("conflict"); return next;
  }
  private async owned(tenantId: string, id: string, token: string): Promise<AutomationRun> {
    const run = await this.load(tenantId, id);
    if (run.status !== "running" || run.ownerToken !== token || run.leaseUntil! <= this.now()) throw new AutomationError("conflict");
    return run;
  }
  async execute(p: AutomationPrincipal, id: string, expectedVersion: number): Promise<AutomationRun> {
    this.principal(p);
    const previous = await this.load(p.tenantId, id);
    if (previous.status !== "queued" || previous.version !== expectedVersion || previous.attempts >= previous.maxAttempts) throw new AutomationError("conflict");
    const definition = await this.store.get(p.tenantId, previous.definitionId);
    if (!definition || definition.recordType !== "definition" || !definition.enabled) throw new AutomationError("conflict");
    const token = randomUUID(), controller = new AbortController();
    const running = await this.change(previous, p.actorId, "claimed", { status: "running", attempts: previous.attempts + 1, ownerToken: token, leaseUntil: this.now() + previous.timeoutMs + 5000, incident: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const context = { operationId: running._id, tenantId: p.tenantId, signal: controller.signal,
      heartbeat: async () => { const owned = await this.owned(p.tenantId, id, token); await this.change(owned, p.actorId, "heartbeat", { leaseUntil: this.now() + running.timeoutMs + 5000 }); } };
    let outcome;
    try {
      outcome = await Promise.race([this.handler.execute(structuredClone(running.payload), context), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, running.timeoutMs); })]);
      const expected = checkApplicationReadiness(running.payload);
      if (!outcome || typeof outcome !== "object" || Object.keys(outcome).sort().join(",") !== "missingDocuments,ready" || JSON.stringify(outcome.missingDocuments) !== JSON.stringify(expected.missingDocuments) || outcome.ready !== expected.ready) throw new Error("bad_outcome");
    } catch {
      const owned = await this.owned(p.tenantId, id, token), timedOut = controller.signal.aborted;
      return this.change(owned, p.actorId, timedOut ? "handler-timeout" : "handler-failed", {
        status: this.handler.retrySafe && owned.attempts >= owned.maxAttempts ? "failed" : "waiting-for-operator", ownerToken: null, leaseUntil: null,
        incident: this.handler.retrySafe && owned.attempts >= owned.maxAttempts ? "retry-exhausted" : timedOut ? "handler-timeout" : "handler-failed", outcome: null });
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
    // Commit failures remain a leased running row. Monitor retries only retry-safe handlers; otherwise reconciliation.
    const owned = await this.owned(p.tenantId, id, token);
    return this.change(owned, p.actorId, "succeeded", { status: "succeeded", ownerToken: null, leaseUntil: null, incident: null, outcome });
  }
  async monitor(p: AutomationPrincipal): Promise<{ scanned: number; changed: number; truncated: boolean }> {
    this.principal(p); const runs = await this.store.list(p.tenantId, "run", 100, "running"); let changed = 0;
    for (const row of runs) {
      if (row.recordType !== "run") throw new AutomationError("unavailable");
      const decision = planAutomationMonitor({ ...row, retrySafe: this.handler.retrySafe }, this.now());
      if (decision === "unchanged") continue;
      const status = decision === "retry" ? "queued" : decision === "exhausted" ? "failed" : "waiting-for-operator";
      const incident = decision === "retry" ? "lease-expired" : decision === "exhausted" ? "retry-exhausted" : "reconciliation-required";
      try { await this.change(row, p.actorId, decision === "retry" ? "lease-expired-retry" : decision === "exhausted" ? "lease-expired-exhausted" : "reconciliation-required", { status, incident, ownerToken: null, leaseUntil: null }); changed++; }
      catch (e) { if (!(e instanceof AutomationError && e.code === "conflict")) throw e; }
    }
    return { scanned: runs.length, changed, truncated: runs.length === 100 };
  }
  async intervene(p: AutomationPrincipal, id: string, value: unknown): Promise<AutomationRun> {
    this.principal(p); const body = fields(value, ["expectedVersion", "action"]);
    if (!Number.isSafeInteger(body.expectedVersion) || typeof body.action !== "string" || !["retry", "cancel", "reconcile"].includes(body.action)) throw new AutomationError("invalid_request");
    const run = await this.load(p.tenantId, id);
    if (run.version !== body.expectedVersion || !["queued", "waiting-for-operator", "failed"].includes(run.status)) throw new AutomationError("conflict");
    if (body.action === "retry" && (!this.handler.retrySafe || run.status !== "waiting-for-operator" || run.attempts >= run.maxAttempts)) throw new AutomationError("conflict");
    if (body.action === "reconcile" && (run.status !== "waiting-for-operator" || run.incident !== "reconciliation-required")) throw new AutomationError("conflict");
    if (body.action === "reconcile") return this.change(run, p.actorId, "operator-reconcile", { status: "succeeded", incident: null, outcome: checkApplicationReadiness(run.payload) });
    return this.change(run, p.actorId, body.action === "retry" ? "operator-retry" : "operator-cancel", { status: body.action === "retry" ? "queued" : "cancelled", incident: null, ownerToken: null, leaseUntil: null });
  }
}
