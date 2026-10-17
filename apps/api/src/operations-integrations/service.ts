import { createHash, randomBytes } from "node:crypto";
import { OperationsError, initialSchedule, kinds, publicSchedule, settingsInput, validateSchedule, type IntegrationKind, type Schedule } from "./model.js";
import type { ScheduleStore } from "./store.js";
import { exportSnapshot, type ExportSession } from "./snapshot.js";
import { notificationWindow } from "./notification-window.js";
import type { NotificationsResponse } from "../activity-health/notifications.js";
import { operationFingerprint, type OperationPayload } from "./payload.js";
export interface IntegrationAdapter {
  available(tenant: string): boolean;
  execute(input: { tenant: string; runId: string; snapshot: OperationPayload; signal: AbortSignal }): Promise<void>;
  verifyReceipt?(input: { tenant: string; runId: string; attemptAt: string; attemptRevision: number; signal: AbortSignal }): Promise<boolean>;
  fingerprint?(tenant: string, snapshot: OperationPayload): string;
}
export interface OperationsDeps {
  store: ScheduleStore;
  adapters: Record<IntegrationKind, IntegrationAdapter>;
  sessions(tenant: string, limit: number): Promise<ExportSession[]>;
  notifications?(tenant: string, limit: number): Promise<NotificationsResponse>;
  clock?: () => number;
}
export interface RunAuthorization {
  mutate<T>(callback: () => Promise<T>): Promise<T>;
  initialize<T>(callback: () => Promise<T>): Promise<{ work: Promise<T> }>;
}
export function createOperationsService(deps: OperationsDeps) {
  const clock = deps.clock ?? Date.now;
  const now = () => { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) throw new OperationsError("unavailable"); return value; };
  const get = async (tenant: string, kind: IntegrationKind) => { const raw = await deps.store.load(tenant, kind); return raw ? validateSchedule(raw, tenant, kind) : initialSchedule(tenant, kind); };
  const available = (tenant: string, kind: IntegrationKind) => deps.adapters[kind].available(tenant) && (kind !== "digest" || typeof deps.notifications === "function");
  const replace = async (tenant: string, old: Schedule, next: Schedule, actorKeyId: string, action: Schedule["audit"][number]["action"]) => {
    if (typeof actorKeyId !== "string" || !actorKeyId || actorKeyId.length > 256 || old.audit.length >= 10000) throw new OperationsError("unauthorized");
    next.audit = [...old.audit, { revision: next.revision, at: new Date(now()).toISOString(), actorKeyId, action, outcome: action === "config-save" ? "configured" : next.lastResult as Schedule["audit"][number]["outcome"] }];
    if (!await deps.store.replace(tenant, old.revision === 0 ? null : old, next)) throw new OperationsError("conflict");
  };
  return {
    async list(tenant: string) {
      return { schedules: await Promise.all(kinds.map(async kind => ({ ...publicSchedule(await get(tenant, kind)), available: available(tenant, kind) }))), exportScope: "session-metadata-only" as const };
    },
    async save(tenant: string, kind: IntegrationKind, raw: unknown, actorKeyId: string) {
      const input = settingsInput(raw), old = await get(tenant, kind), at = now();
      if (input.revision !== old.revision || old.lastResult === "running") throw new OperationsError("conflict");
      if (old.lastResult === "uncertain" && input.enabled) throw new OperationsError("uncertain");
      // Reserve two intents, completion and a possible receipt reconciliation after this save.
      if (input.enabled && old.audit.length > 9995) throw new OperationsError("unavailable");
      if (input.enabled && !available(tenant, kind)) throw new OperationsError("disabled");
      const next: Schedule = { ...old, ...input, revision: old.revision + 1, nextRunAt: input.enabled ? new Date(at + input.intervalHours * 3600000).toISOString() : null };
      await replace(tenant, old, next, actorKeyId, "config-save"); return publicSchedule(next);
    },
    async preview(tenant: string) { const snapshot = exportSnapshot(tenant, await deps.sessions(tenant, 501)); return { returned: snapshot.returned, ready: snapshot.ready, truncated: snapshot.truncated, exportScope: "session-metadata-only" as const }; },
    async run(tenant: string, kind: IntegrationKind, revision: number, actorKeyId: string, authorization: RunAuthorization, dueOnly = false) {
      const old = await get(tenant, kind), at = now();
      if (revision !== old.revision) throw new OperationsError("conflict");
      if (old.lastResult === "running") {
        if (old.leaseUntil && Date.parse(old.leaseUntil) <= at) {
          const uncertain: Schedule = { ...old, revision: old.revision + 1, enabled: false, nextRunAt: null, lastResult: "uncertain", lastErrorCode: "lease-expired", leaseToken: null, leaseUntil: null };
          await authorization.mutate(() => replace(tenant, old, uncertain, actorKeyId, "recover-uncertain")); return publicSchedule(uncertain);
        }
        throw new OperationsError("conflict");
      }
      if (old.lastResult === "uncertain") throw new OperationsError("uncertain");
      if (!old.enabled || !available(tenant, kind)) throw new OperationsError("disabled");
      if (dueOnly && (!old.nextRunAt || Date.parse(old.nextRunAt) > at)) return publicSchedule(old);
      if (old.audit.length > 9996) throw new OperationsError("unavailable");
      const runId = createHash("sha256").update(`${tenant}\0${kind}\0${old.revision}\0${old.nextRunAt ?? at}`).digest("hex");
      let claimed: Schedule = { ...old, revision: old.revision + 1, lastResult: "running", lastErrorCode: null, lastAttemptAt: new Date(at).toISOString(), runId, leaseToken: randomBytes(32).toString("hex"), leaseUntil: new Date(at + 120000).toISOString() };
      await authorization.mutate(() => replace(tenant, old, claimed, actorKeyId, "run-claim"));
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
      let result: Schedule["lastResult"] = "failed", code: Schedule["lastErrorCode"] = "source-unavailable", outbound = false;
      const withinDeadline = <T,>(work: Promise<T>): Promise<T> => Promise.race([work, new Promise<T>((_resolve, reject) => {
        if (controller.signal.aborted) reject(new Error("Deadline")); else controller.signal.addEventListener("abort", () => reject(new Error("Deadline")), { once: true });
      })]);
      try {
        const snapshot: OperationPayload = exportSnapshot(tenant, await withinDeadline(deps.sessions(tenant, 501)));
        if (kind === "digest") snapshot.notificationWindow = notificationWindow(await withinDeadline(deps.notifications!(tenant, 50)));
        if (controller.signal.aborted || !available(tenant, kind)) throw new Error("Unavailable");
        snapshot.attemptAt = claimed.lastAttemptAt!; snapshot.attemptRevision = claimed.revision + 1;
        const prepared = { ...claimed, revision: claimed.revision + 1, runId: deps.adapters[kind].fingerprint?.(tenant, snapshot) ?? operationFingerprint(kind, tenant, snapshot) };
        await authorization.mutate(() => replace(tenant, claimed, prepared, actorKeyId, "run-claim"));
        claimed = prepared;
        // Persisted ownership must still match before the irreversible boundary.
        const current = await get(tenant, kind);
        if (current.revision !== claimed.revision || current.leaseToken !== claimed.leaseToken) throw new OperationsError("conflict");
        // The verified role is checked while initializing the executor; the journal lock
        // is released before awaiting external work (promise is returned inside an object).
        const started = await authorization.initialize(() => {
          if (controller.signal.aborted) throw new Error("Deadline");
          outbound = true; return deps.adapters[kind].execute({ tenant, runId: claimed.runId!, snapshot, signal: controller.signal });
        });
        await withinDeadline(started.work);
        result = "succeeded"; code = null;
      } catch { result = outbound ? "uncertain" : "failed"; code = outbound ? "delivery-failed" : "source-unavailable"; }
      finally { clearTimeout(timer); }
      const finishedAt = now();
      const next: Schedule = { ...claimed, revision: claimed.revision + 1, lastResult: result, lastErrorCode: code, enabled: result === "uncertain" ? false : claimed.enabled,
        nextRunAt: result === "uncertain" ? null : new Date(finishedAt + claimed.intervalHours * 3600000).toISOString(), lastSuccessAt: result === "succeeded" ? new Date(finishedAt).toISOString() : claimed.lastSuccessAt, leaseToken: null, leaseUntil: null };
      await authorization.mutate(() => replace(tenant, claimed, next, actorKeyId, "run-complete")); return publicSchedule(next);
    },
    async reconcile(tenant: string, kind: IntegrationKind, revision: number, actorKeyId: string, authorization: RunAuthorization) {
      const old = await get(tenant, kind), adapter = deps.adapters[kind];
      if (old.revision !== revision || old.lastResult !== "uncertain" || !old.runId || !old.lastAttemptAt) throw new OperationsError("conflict");
      if (!adapter.available(tenant) || !adapter.verifyReceipt) throw new OperationsError("disabled");
      const prepared = old.audit.filter(event => event.action === "run-claim").at(-1);
      if (!prepared) throw new OperationsError("unavailable");
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
      let verified = false;
      try {
        const started = await authorization.initialize(() => adapter.verifyReceipt!({ tenant, runId: old.runId!, attemptAt: old.lastAttemptAt!, attemptRevision: prepared.revision, signal: controller.signal }));
        verified = await Promise.race([started.work, new Promise<boolean>((_resolve, reject) => { if (controller.signal.aborted) reject(new Error("Deadline")); else controller.signal.addEventListener("abort", () => reject(new Error("Deadline")), { once: true }); })]);
      } catch { verified = false; } finally { clearTimeout(timer); }
      if (!verified) return publicSchedule(old);
      const next: Schedule = { ...old, revision: old.revision + 1, lastResult: "succeeded", lastErrorCode: null, lastSuccessAt: new Date(now()).toISOString(), enabled: false, nextRunAt: null };
      await authorization.mutate(() => replace(tenant, old, next, actorKeyId, "run-complete")); return publicSchedule(next);
    },
  };
}
export type OperationsService = ReturnType<typeof createOperationsService>;
