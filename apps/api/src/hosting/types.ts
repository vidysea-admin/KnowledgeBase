export type HostingRole = "viewer" | "editor" | "admin" | "owner";
export type HostingPermission = "roles:read" | "roles:manage" | "audit:read" | "webhooks:read" | "webhooks:manage" | "events:publish" | "deliveries:read" | "deliveries:dispatch" | "accounts:read" | "accounts:manage" | "automation:read" | "automation:manage" | "automation:operate" | "keys:read" | "keys:manage" | "operations:read" | "operations:manage" | "operations:run";
export interface HostingPrincipal { tenantId: string; keyId: string; scopes: string[] }
export interface HostingSubscription {
  id: string; url: string; events: string[]; generation: number; enabled: boolean;
  sealedSecret: string; createdAt: string;
}
export interface HostingDelivery {
  id: string; eventId: string; subscriptionId: string; generation: number;
  eventType: string; body: string; status: "queued" | "sending" | "delivered" | "failed" | "cancelled";
  attempts: number; nextAt: number; leaseUntil: number; attemptId: string | null;
  error: string | null; deliveredAt: string | null;
}
export interface HostingAuditRecord {
  sequence: number; at: string; actorId: string; operation: string; target: string; outcome: string;
}
export interface HostingState {
  roles: Map<string, Exclude<HostingRole, "owner">>;
  subscriptions: Map<string, HostingSubscription>;
  deliveries: Map<string, HostingDelivery>;
  events: Map<string, string>;
  pendingAccounts: Set<string>;
  pendingKeys: Set<string>;
  audit: HostingAuditRecord[];
}
export interface HostingJournalRecord {
  version: 1; tenantId: string; sequence: number; previous: string; at: string;
  actorId: string; operation: string; target: string; outcome: string; data: unknown; hash: string;
}
export interface HostingJournalChange<T> {
  value: T; operation: string; target: string; outcome: string; data: unknown;
  afterCommit?: () => Promise<T>;
  completion?: { operation: string; target: string; outcome: string; data: unknown };
}
export class HostingError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
export function hostingId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > 256 || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) throw new HostingError(`invalid_${field}`);
  return value;
}
export function hostingObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HostingError("invalid_body");
  return value as Record<string, unknown>;
}
export function hostingFields(body: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new HostingError("unexpected_body_field");
}
