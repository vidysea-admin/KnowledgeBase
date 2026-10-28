import { HostingError, hostingId, hostingObject, type HostingDelivery, type HostingJournalRecord, type HostingState, type HostingSubscription } from "./types.js";

function subscription(value: unknown): HostingSubscription {
  const s = hostingObject(value);
  for (const key of ["id", "sealedSecret", "createdAt"]) hostingId(s[key], key);
  if (typeof s.url !== "string" || !s.url || s.url.length > 2048) throw new Error("invalid subscription url");
  if (!Array.isArray(s.events) || !s.events.length || !s.events.every((e) => typeof e === "string") ||
      !Number.isInteger(s.generation) || (s.generation as number) < 1 || typeof s.enabled !== "boolean") throw new Error("invalid subscription");
  return s as unknown as HostingSubscription;
}
function delivery(value: unknown): HostingDelivery {
  const d = hostingObject(value);
  for (const key of ["id", "eventId", "subscriptionId", "eventType"]) hostingId(d[key], key);
  if (typeof d.body !== "string" || !Number.isInteger(d.generation) || !Number.isInteger(d.attempts) ||
      !["queued", "sending", "delivered", "failed", "cancelled"].includes(d.status as string) ||
      !Number.isFinite(d.nextAt) || !Number.isFinite(d.leaseUntil)) throw new Error("invalid delivery");
  return d as unknown as HostingDelivery;
}
export function replayHosting(rows: HostingJournalRecord[]): HostingState {
  const state: HostingState = { roles: new Map(), subscriptions: new Map(), deliveries: new Map(), events: new Map(), pendingAccounts: new Set(), pendingKeys: new Set(), audit: [] };
  try {
    for (const row of rows) {
      const d = hostingObject(row.data);
      switch (row.operation) {
        case "role.set": {
          const id = hostingId(d.keyId, "key");
          if (d.role === null) state.roles.delete(id);
          else if (["viewer", "editor", "admin"].includes(d.role as string)) state.roles.set(id, d.role as "viewer" | "editor" | "admin");
          else throw new Error("invalid role");
          if (d.accountPending === true) state.pendingAccounts.add(id);
          break;
        }
        case "account.complete": state.pendingAccounts.delete(hostingId(d.keyId, "key")); break;
        case "key.change.intent": state.pendingKeys.add(hostingId(d.commandId, "command")); break;
        case "key.change.complete": state.pendingKeys.delete(hostingId(d.commandId, "command")); break;
        case "webhook.register": { const s = subscription(d.subscription); state.subscriptions.set(s.id, s); break; }
        case "webhook.revoke": {
          const s = state.subscriptions.get(hostingId(d.id, "subscription"));
          if (!s || !Number.isInteger(d.generation) || d.generation !== s.generation + 1) throw new Error("invalid revoke");
          s.enabled = false; s.generation = d.generation as number;
          for (const job of state.deliveries.values()) if (job.subscriptionId === s.id && !["delivered", "failed"].includes(job.status)) {
            job.status = "cancelled"; job.error = "subscription_revoked"; job.attemptId = null; job.leaseUntil = 0;
          }
          break;
        }
        case "event.publish": {
          const id = hostingId(d.eventId, "event");
          if (state.events.has(id) || typeof d.fingerprint !== "string" || !Array.isArray(d.deliveries)) throw new Error("invalid event");
          state.events.set(id, d.fingerprint);
          for (const value of d.deliveries) { const job = delivery(value); if (state.deliveries.has(job.id)) throw new Error("duplicate job"); state.deliveries.set(job.id, job); }
          break;
        }
        case "delivery.claim": {
          const job = state.deliveries.get(hostingId(d.id, "delivery"));
          if (!job || !["queued", "sending"].includes(job.status) || typeof d.attemptId !== "string" || !Number.isFinite(d.leaseUntil)) throw new Error("invalid claim");
          job.status = "sending"; job.attempts++; job.attemptId = d.attemptId; job.leaseUntil = d.leaseUntil as number;
          break;
        }
        case "delivery.result": {
          const job = state.deliveries.get(hostingId(d.id, "delivery"));
          if (!job || job.attemptId !== d.attemptId || !["queued", "delivered", "failed"].includes(d.status as string) || !Number.isFinite(d.nextAt)) throw new Error("invalid result");
          job.status = d.status as HostingDelivery["status"]; job.error = d.error as string | null;
          job.nextAt = d.nextAt as number; job.deliveredAt = d.deliveredAt as string | null; job.attemptId = null; job.leaseUntil = 0;
          break;
        }
        default: throw new Error("unknown journal operation");
      }
      state.audit.push({ sequence: row.sequence, at: row.at, actorId: row.actorId, operation: row.operation, target: row.target, outcome: row.outcome });
    }
    return state;
  } catch { throw new HostingError("audit_recovery_required", 503); }
}
