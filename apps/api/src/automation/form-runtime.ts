import { randomUUID } from "node:crypto";
import { isAutomationReference } from "../../../../packages/core/src/domain/automation-monitor.js";
import { AutomationError } from "./types.js";
import { applicationDigest, applicationFields, applicationObject, applicationTargetFingerprint } from "./form-validation.js";
import type { ApplicationAudit, ApplicationDefinition, ApplicationOperation, ApplicationPrincipal, ApplicationRecord, ApplicationStore, ApplicationTarget } from "./form-types.js";
const history = (r: ApplicationRecord, at: number, actor: string, action: ApplicationAudit["action"]): ApplicationOperation["history"] => [...r.history, { at, actor, action, binding: { payloadDigest: r.recordType === "operation" ? r.payloadDigest : null, targetFingerprint: r.targetFingerprint, priorVersion: r.version } }].slice(-100) as ApplicationOperation["history"];
export class ApplicationFormRuntime {
  private targets: Map<string, ApplicationTarget>;
  constructor(readonly store: ApplicationStore, targets: readonly ApplicationTarget[], private clock = Date.now) {
    this.targets = new Map();
    for (const target of targets) { applicationTargetFingerprint(target); if (this.targets.has(target.id)) throw new AutomationError("unavailable"); this.targets.set(target.id, Object.freeze({ ...target, requiredFields: Object.freeze([...target.requiredFields]), allowedFields: Object.freeze([...target.allowedFields]) })); }
  }
  private now(): number { const at = this.clock(); if (!Number.isSafeInteger(at) || at < 0) throw new AutomationError("unavailable"); return at; }
  private principal(p: ApplicationPrincipal): void { if (!p || typeof p.tenantId !== "string" || !p.tenantId.trim() || p.tenantId !== p.tenantId.trim() || /[\u0000-\u001f\u007f]/.test(p.tenantId) || !isAutomationReference(p.actorId)) throw new AutomationError("forbidden"); }
  private target(id: unknown): ApplicationTarget { if (!isAutomationReference(id) || !this.targets.has(id)) throw new AutomationError("invalid_request"); return this.targets.get(id)!; }
  definitionId(tenantId: string, targetId: string): string { return `formdef-${applicationDigest([tenantId, targetId])}`; }
  registeredTargets(): { id: string; version: string; requiredFields: readonly string[]; allowedFields: readonly string[] }[] { return [...this.targets.values()].map(({ id, version, requiredFields, allowedFields }) => ({ id, version, requiredFields: [...requiredFields], allowedFields: [...allowedFields] })); }
  async configure(p: ApplicationPrincipal, value: unknown): Promise<ApplicationDefinition> {
    this.principal(p); const body = applicationObject(value, ["targetId", "enabled", "maxAttempts", "timeoutMs", "expectedVersion"]), target = this.target(body.targetId);
    if (typeof body.enabled !== "boolean" || !Number.isInteger(body.maxAttempts) || Number(body.maxAttempts) < 1 || Number(body.maxAttempts) > 3 || !Number.isInteger(body.timeoutMs) || Number(body.timeoutMs) < 100 || Number(body.timeoutMs) > 30000 || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) throw new AutomationError("invalid_request");
    const _id = this.definitionId(p.tenantId, target.id), previous = await this.store.get(p.tenantId, _id), at = this.now();
    if (previous && previous.recordType !== "definition") throw new AutomationError("unavailable");
    if (previous ? previous.version !== body.expectedVersion : body.expectedVersion !== 0) throw new AutomationError("conflict");
    const next: ApplicationDefinition = { _id, tenantId: p.tenantId, recordType: "definition", targetId: target.id, targetFingerprint: applicationTargetFingerprint(target), enabled: body.enabled, maxAttempts: Number(body.maxAttempts), timeoutMs: Number(body.timeoutMs), version: previous ? previous.version + 1 : 1, updatedAt: at, history: previous ? history(previous, at, p.actorId, "configured") : [{ at, actor: p.actorId, action: "configured", binding: { payloadDigest: null, targetFingerprint: applicationTargetFingerprint(target), priorVersion: 0 } }] };
    if (previous ? !await this.store.cas(p.tenantId, previous, next) : !await this.store.insert(p.tenantId, next)) throw new AutomationError("conflict"); return next;
  }
  private async definition(tenantId: string, target: ApplicationTarget): Promise<ApplicationDefinition> {
    const d = await this.store.get(tenantId, this.definitionId(tenantId, target.id));
    if (!d || d.recordType !== "definition" || !d.enabled || d.targetFingerprint !== applicationTargetFingerprint(target)) throw new AutomationError("conflict"); return d;
  }
  async submit(p: ApplicationPrincipal, value: unknown): Promise<{ operation: ApplicationOperation; replay: boolean }> {
    this.principal(p); const body = applicationObject(value, ["targetId", "idempotencyKey", "fields"]), target = this.target(body.targetId), fields = applicationFields(body.fields);
    if (!isAutomationReference(body.idempotencyKey) || fields.some(f => !target.allowedFields.includes(f.name))) throw new AutomationError("invalid_request");
    const identityDigest = applicationDigest([p.tenantId, body.idempotencyKey]), payloadDigest = applicationDigest(fields), _id = `form-${identityDigest}`;
    const replay = async () => { const existing = await this.store.get(p.tenantId, _id); if (!existing) return null; if (existing.recordType !== "operation" || existing.payloadDigest !== payloadDigest || existing.targetId !== target.id) throw new AutomationError("conflict"); return { operation: existing, replay: true }; };
    const existing = await replay(); if (existing) return existing;
    const d = await this.definition(p.tenantId, target), at = this.now(), missing = target.requiredFields.some(name => !fields.some(f => f.name === name));
    const operation: ApplicationOperation = { _id, tenantId: p.tenantId, recordType: "operation", definitionId: d._id, targetId: target.id, targetFingerprint: d.targetFingerprint, identityDigest, payloadDigest, fields, status: "draft", approval: null, attempts: 0, maxAttempts: d.maxAttempts, timeoutMs: d.timeoutMs, version: 1, createdAt: at, updatedAt: at, ownerToken: null, leaseUntil: null, receiptId: null, sideEffectUncertain: false, incident: missing ? "missing-required-fields" : null, history: [{ at, actor: p.actorId, action: "submitted", binding: { payloadDigest, targetFingerprint: d.targetFingerprint, priorVersion: 0 } }] };
    if (await this.store.insert(p.tenantId, operation)) return { operation, replay: false }; const raced = await replay(); if (!raced) throw new AutomationError("unavailable"); return raced;
  }
  async load(tenantId: string, id: string): Promise<ApplicationOperation> { if (!isAutomationReference(id)) throw new AutomationError("invalid_request"); const row = await this.store.get(tenantId, id); if (!row || row.recordType !== "operation") throw new AutomationError("not_found"); return row; }
  private async change(r: ApplicationOperation, p: ApplicationPrincipal, action: ApplicationAudit["action"], patch: Partial<ApplicationOperation>): Promise<ApplicationOperation> {
    const at = this.now(), next = { ...r, ...patch, version: r.version + 1, updatedAt: at, history: history(r, at, p.actorId, action) };
    if (!await this.store.cas(p.tenantId, r, next)) throw new AutomationError("conflict"); return next;
  }
  private async verified(r: ApplicationOperation): Promise<ApplicationTarget> {
    const target = this.target(r.targetId); await this.definition(r.tenantId, target);
    if (r.targetFingerprint !== applicationTargetFingerprint(target) || target.requiredFields.some(name => !r.fields.some(f => f.name === name)) || r.fields.some(f => !target.allowedFields.includes(f.name))) throw new AutomationError("conflict");
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([(async () => { for (const field of r.fields) { controller.signal.throwIfAborted(); let valid = false; try { valid = await target.verifyField(r.tenantId, structuredClone(field), controller.signal); } catch { throw new AutomationError("unavailable"); } if (valid !== true) throw new AutomationError("conflict"); } })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AutomationError("unavailable")); }, r.timeoutMs); })]);
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
    return target;
  }
  async approve(p: ApplicationPrincipal, id: string, expectedVersion: number): Promise<ApplicationOperation> {
    this.principal(p); const r = await this.load(p.tenantId, id); if (r.version !== expectedVersion || r.status !== "draft") throw new AutomationError("conflict");
    await this.verified(r); const at = this.now(); return this.change(r, p, "approved", { status: "approved", incident: null, approval: { actor: p.actorId, at, payloadDigest: r.payloadDigest, targetFingerprint: r.targetFingerprint } });
  }
  async revise(p: ApplicationPrincipal, id: string, value: unknown): Promise<ApplicationOperation> {
    this.principal(p); const body = applicationObject(value, ["expectedVersion", "fields"]), r = await this.load(p.tenantId, id);
    if (!Number.isSafeInteger(body.expectedVersion) || r.version !== body.expectedVersion || !["draft", "approved"].includes(r.status) || r.attempts !== 0 || r.sideEffectUncertain) throw new AutomationError("conflict");
    const target = this.target(r.targetId), d = await this.definition(p.tenantId, target), fields = applicationFields(body.fields);
    if (fields.some(f => !target.allowedFields.includes(f.name))) throw new AutomationError("invalid_request");
    return this.change(r, p, "fields-revised", { fields, payloadDigest: applicationDigest(fields), targetFingerprint: d.targetFingerprint, status: "draft", approval: null, incident: target.requiredFields.some(name => !fields.some(f => f.name === name)) ? "missing-required-fields" : null });
  }
  private async owned(p: ApplicationPrincipal, id: string, token: string): Promise<ApplicationOperation> { const r = await this.load(p.tenantId, id); if (r.status !== "running" || r.ownerToken !== token || r.leaseUntil! <= this.now()) throw new AutomationError("conflict"); return r; }
  async execute(p: ApplicationPrincipal, id: string, expectedVersion: number): Promise<ApplicationOperation> {
    this.principal(p); const r = await this.load(p.tenantId, id); if (r.version !== expectedVersion || r.status !== "approved" || r.attempts >= r.maxAttempts || r.approval?.payloadDigest !== r.payloadDigest || r.approval.targetFingerprint !== r.targetFingerprint) throw new AutomationError("conflict");
    const target = await this.verified(r), token = randomUUID(), controller = new AbortController();
    await this.change(r, p, "claimed", { status: "running", attempts: r.attempts + 1, ownerToken: token, leaseUntil: this.now() + r.timeoutMs + 5000, sideEffectUncertain: true, incident: null });
    let timer: ReturnType<typeof setTimeout> | undefined, receiptId: string;
    try {
      const receipt = await Promise.race([target.adapter.submit({ operationId: id, tenantId: p.tenantId, fields: structuredClone(r.fields), signal: controller.signal, heartbeat: async () => { controller.signal.throwIfAborted(); const owned = await this.owned(p, id, token); await this.change(owned, p, "heartbeat", { leaseUntil: this.now() + r.timeoutMs + 5000 }); } }), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, r.timeoutMs); })]);
      if (!receipt || typeof receipt !== "object" || Object.keys(receipt).join(",") !== "receiptId" || !isAutomationReference(receipt.receiptId)) throw new Error("invalid_receipt"); receiptId = receipt.receiptId;
    } catch {
      const owned = await this.owned(p, id, token), safe = target.adapter.duplicateGuarantee === "operation-id", exhausted = owned.attempts >= owned.maxAttempts;
      return this.change(owned, p, "execution-uncertain", { status: safe && exhausted ? "failed" : "waiting-for-operator", ownerToken: null, leaseUntil: null, sideEffectUncertain: true, incident: !safe ? "uncertain-side-effect" : exhausted ? "retry-exhausted" : controller.signal.aborted ? "handler-timeout" : "handler-failed" });
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
    // Any persistence failure leaves the claimed row running. Monitor never blindly retries an unsafe adapter.
    const owned = await this.owned(p, id, token); return this.change(owned, p, "succeeded", { status: "succeeded", ownerToken: null, leaseUntil: null, receiptId, sideEffectUncertain: false, incident: null });
  }
  async monitor(p: ApplicationPrincipal): Promise<{ scanned: number; changed: number; truncated: boolean }> {
    this.principal(p); const rows = await this.store.list(p.tenantId, "operation", "running"); let changed = 0;
    for (const row of rows) { if (row.recordType !== "operation") throw new AutomationError("unavailable"); if (row.leaseUntil! > this.now()) continue;
      const target = this.targets.get(row.targetId), safe = !!target && target.adapter.duplicateGuarantee === "operation-id" && applicationTargetFingerprint(target) === row.targetFingerprint, exhausted = row.attempts >= row.maxAttempts;
      try { await this.change(row, p, "lease-expired", { status: safe ? exhausted ? "failed" : "approved" : "waiting-for-operator", ownerToken: null, leaseUntil: null, sideEffectUncertain: true, incident: !safe ? "uncertain-side-effect" : exhausted ? "retry-exhausted" : "handler-timeout" }); changed++; }
      catch (e) { if (!(e instanceof AutomationError && e.code === "conflict")) throw e; }
    }
    return { scanned: rows.length, changed, truncated: rows.length === 100 };
  }
  async intervene(p: ApplicationPrincipal, id: string, value: unknown): Promise<ApplicationOperation> {
    this.principal(p); const body = applicationObject(value, ["expectedVersion", "action", "receiptId"]), r = await this.load(p.tenantId, id);
    if (!Number.isSafeInteger(body.expectedVersion) || r.version !== body.expectedVersion || !["draft", "approved", "waiting-for-operator", "failed"].includes(r.status) || typeof body.action !== "string" || !["retry", "cancel", "reconcile"].includes(body.action)) throw new AutomationError("conflict");
    const target = this.target(r.targetId);
    if (body.action === "cancel") { if (body.receiptId !== null || r.sideEffectUncertain) throw new AutomationError("conflict"); return this.change(r, p, "operator-cancel", { status: "cancelled", ownerToken: null, leaseUntil: null }); }
    if (body.action === "retry") {
      if (body.receiptId !== null || r.status !== "waiting-for-operator" || r.attempts >= r.maxAttempts || target.adapter.duplicateGuarantee !== "operation-id") throw new AutomationError("conflict"); await this.verified(r); return this.change(r, p, "operator-retry", { status: "approved", incident: null });
    }
    if (!["waiting-for-operator", "failed"].includes(r.status) || !r.sideEffectUncertain || !isAutomationReference(body.receiptId)) throw new AutomationError("conflict");
    if (applicationTargetFingerprint(target) !== r.targetFingerprint) throw new AutomationError("conflict");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), r.timeoutMs);
    try { const verified = await Promise.race([target.adapter.verifyReceipt({ operationId: id, tenantId: p.tenantId, receiptId: body.receiptId, signal: controller.signal }), new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(new AutomationError("unavailable")), { once: true }); })]); if (verified !== true) throw new AutomationError("conflict"); }
    finally { clearTimeout(timer); controller.abort(); }
    return this.change(r, p, "operator-reconciled", { status: "succeeded", receiptId: body.receiptId, sideEffectUncertain: false, incident: null });
  }
}
