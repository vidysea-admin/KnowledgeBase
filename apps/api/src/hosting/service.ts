import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { HostingJournal } from "./journal.js";
import { authorizeHosting, hostingRole, hostingUrl } from "./policy.js";
import { replayHosting } from "./state.js";
import { validateHostingDestination } from "./transport.js";
import { HostingError, hostingId, type HostingJournalChange, type HostingJournalRecord, type HostingPermission, type HostingPrincipal, type HostingRole, type HostingState, type HostingSubscription } from "./types.js";

export interface HostingServiceOptions {
  journal: HostingJournal; bootstrap: ReadonlyMap<string, ReadonlySet<string>>; origins: ReadonlySet<string>;
  encryptionKey: Buffer; keyExists(tenantId: string, keyId: string): Promise<boolean>; now?: () => number;
  accountStatus?: (tenantId: string, keyId: string) => Promise<"active" | "inactive" | "deleted" | "unbound" | "recovery">;
  validateDestination?: (url: URL) => Promise<void>;
}
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
const REVOKE_CONTROLLERS = new Map<string, Set<AbortController>>();
export const HOSTING_EVENT_TYPES = ["session.indexed", "claim.verified", "transcript.corrected", "retention.completed"] as const;

/** Only verified principals and locked current grants enter any covered mutation. */
export class HostingService {
  readonly now: () => number;
  private accountStatus: NonNullable<HostingServiceOptions["accountStatus"]>;
  constructor(readonly options: HostingServiceOptions) {
    if (options.encryptionKey.length !== 32 || !options.origins.size || !options.bootstrap.size) throw new HostingError("hosting_unavailable", 503);
    this.now = options.now ?? Date.now;
    this.accountStatus = options.accountStatus ?? (async () => "unbound");
  }
  setAccountStatusProvider(provider: NonNullable<HostingServiceOptions["accountStatus"]>): void { this.accountStatus = provider; }
  /** Global authentication lifecycle guard; scopes do not bypass incomplete role/account/key commits. */
  async isIdentityActive(tenantId: string, keyId: string): Promise<boolean> {
    hostingId(tenantId, "tenant"); hostingId(keyId, "actor");
    return this.options.journal.transaction(tenantId, keyId, new Date(this.now()).toISOString(), async (rows) => {
      const state = replayHosting(rows);
      if (state.pendingKeys.size || state.pendingAccounts.has(keyId)) throw new HostingError("identity_recovery_required", 503);
      return { value: await this.options.keyExists(tenantId, keyId) && ["active", "unbound"].includes(await this.accountStatus(tenantId, keyId)) };
    });
  }
  private revokeKey(tenantId: string, id: string): string {
    const path = this.options.journal.root;
    return JSON.stringify([process.platform === "win32" ? path.toLowerCase() : path, tenantId, id]);
  }
  observeRevoke(tenantId: string, id: string, controller: AbortController): () => void {
    const key = this.revokeKey(tenantId, id), controllers = REVOKE_CONTROLLERS.get(key) ?? new Set<AbortController>();
    controllers.add(controller); REVOKE_CONTROLLERS.set(key, controllers);
    return () => { controllers.delete(controller); if (!controllers.size) REVOKE_CONTROLLERS.delete(key); };
  }
  async operate<T>(principal: HostingPrincipal, permission: HostingPermission, build: (state: HostingState, rows: HostingJournalRecord[]) => Promise<HostingJournalChange<T> | { value: T }>): Promise<T> {
    hostingId(principal.tenantId, "tenant"); hostingId(principal.keyId, "actor");
    return this.options.journal.transaction(principal.tenantId, principal.keyId, new Date(this.now()).toISOString(), async (rows) => {
      if (!await this.options.keyExists(principal.tenantId, principal.keyId)) throw new HostingError("forbidden", 403);
      const state = replayHosting(rows);
      if (state.pendingAccounts.has(principal.keyId)) throw new HostingError("account_recovery_required", 503);
      if (!["active", "unbound"].includes(await this.accountStatus(principal.tenantId, principal.keyId))) throw new HostingError("forbidden", 403);
      authorizeHosting(principal, state, permission, this.options.bootstrap);
      return build(state, rows);
    });
  }
  async withPermission<T>(principal: HostingPrincipal, permission: HostingPermission, callback: () => Promise<T>): Promise<T> {
    return this.operate(principal, permission, async () => ({ value: await callback() }));
  }
  async validateKey(principal: HostingPrincipal, keyId: string): Promise<void> {
    return this.withPermission(principal, "accounts:manage", async () => {
      if (!await this.options.keyExists(principal.tenantId, hostingId(keyId, "key"))) throw new HostingError("key_not_found", 404);
    });
  }
  async getRole(principal: HostingPrincipal, keyId: string): Promise<HostingRole | null> {
    return this.operate(principal, "accounts:read", async (state) => ({ value: state.pendingAccounts.has(keyId) ||
      !await this.options.keyExists(principal.tenantId, hostingId(keyId, "key")) ||
      !["active", "unbound"].includes(await this.accountStatus(principal.tenantId, keyId)) ? null : hostingRole({ ...principal, keyId }, state, this.options.bootstrap) }));
  }
  async getRoles(principal: HostingPrincipal): Promise<{ roles: Array<{ keyId: string; role: HostingRole }> }> {
    return this.operate(principal, "roles:read", async (state) => {
      const roles = new Map<string, HostingRole>(state.roles);
      for (const keyId of this.options.bootstrap.get(principal.tenantId) ?? []) roles.set(keyId, "owner");
      return { value: { roles: [...roles].map(([keyId, role]) => ({ keyId, role })) } };
    });
  }
  async changeAccountRole<T>(principal: HostingPrincipal, keyId: string, role: "viewer" | "editor" | "admin" | null, before: () => Promise<void>, after?: () => Promise<T>): Promise<T | undefined> {
    hostingId(keyId, "key");
    if (role !== null && !["viewer", "editor", "admin"].includes(role)) throw new HostingError("invalid_role");
    return this.operate<T | undefined>(principal, "roles:manage", async (state) => {
      if (this.options.bootstrap.get(principal.tenantId)?.has(keyId)) throw new HostingError("owner_binding_is_operator_managed", 403);
      if (keyId === principal.keyId && role === null) throw new HostingError("cannot_deactivate_self", 403);
      if (state.pendingAccounts.has(keyId)) throw new HostingError("account_recovery_required", 503);
      const status = await this.accountStatus(principal.tenantId, keyId);
      if (role !== null && !["active", "unbound"].includes(status)) throw new HostingError("account_inactive", 403);
      if (!await this.options.keyExists(principal.tenantId, keyId) && !(role === null && (state.roles.has(keyId) || status === "active" || status === "inactive" || status === "deleted"))) throw new HostingError("key_not_found", 404);
      // This callback is read-only validation. Mutation occurs only after durable role/audit append.
      await before();
      return { value: undefined, operation: "role.set", target: keyId, outcome: after ? "account_pending" : "success", data: { keyId, role, accountPending: Boolean(after) },
        afterCommit: after, completion: after ? { operation: "account.complete", target: keyId, outcome: "success", data: { keyId } } : undefined };
    });
  }
  async setRole(principal: HostingPrincipal, keyId: string, role: "viewer" | "editor" | "admin" | null): Promise<void> {
    await this.changeAccountRole(principal, keyId, role, async () => {});
  }
  async keyMutation<T>(principal: HostingPrincipal, kind: "create" | "revoke", targetId: string | null, mutation: () => Promise<T>, resultId: (value: T) => string): Promise<T> {
    if (!["create", "revoke"].includes(kind)) throw new HostingError("invalid_key_operation");
    if (targetId !== null) hostingId(targetId, "key");
    return this.operate<T>(principal, "keys:manage", async (state) => {
      if (state.pendingKeys.size) throw new HostingError("key_recovery_required", 503);
      if (kind === "revoke" && targetId !== null && this.options.bootstrap.get(principal.tenantId)?.has(targetId)) throw new HostingError("owner_binding_is_operator_managed", 403);
      const commandId = randomUUID();
      const completion = { operation: "key.change.complete", target: targetId ?? commandId, outcome: "success", data: { commandId, kind } };
      return { value: undefined as T, operation: "key.change.intent", target: targetId ?? commandId, outcome: "pending", data: { commandId, kind }, completion,
        afterCommit: async () => { const value = await mutation(); completion.target = hostingId(resultId(value), "key");
          completion.outcome = value === false ? "not_found" : "success"; return value; } };
    });
  }
  async audit(principal: HostingPrincipal): Promise<{ records: HostingState["audit"] }> {
    return this.operate(principal, "audit:read", async (state) => ({ value: { records: state.audit.slice(-200) } }));
  }
  private seal(tenantId: string, id: string, secret: string): string {
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.options.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(`${tenantId}\0${id}`));
    const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return [nonce, cipher.getAuthTag(), bytes].map((part) => part.toString("base64url")).join(".");
  }
  unseal(tenantId: string, subscription: HostingSubscription): string {
    try {
      const parts = subscription.sealedSecret.split(".").map((part) => Buffer.from(part, "base64url"));
      if (parts.length !== 3) throw new Error("invalid envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.options.encryptionKey, parts[0]!);
      decipher.setAAD(Buffer.from(`${tenantId}\0${subscription.id}`)); decipher.setAuthTag(parts[1]!);
      return Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString("utf8");
    } catch { throw new HostingError("signing_material_unavailable", 503); }
  }
  async register(principal: HostingPrincipal, value: unknown, events: unknown): Promise<{ id: string; signingSecret: string }> {
    const url = hostingUrl(value, this.options.origins);
    if (!Array.isArray(events) || !events.length || events.length > HOSTING_EVENT_TYPES.length || events.some((event) => !HOSTING_EVENT_TYPES.includes(event as typeof HOSTING_EVENT_TYPES[number]))) throw new HostingError("invalid_events");
    return this.operate(principal, "webhooks:manage", async () => {
      if (this.options.validateDestination) await this.options.validateDestination(url);
      else await validateHostingDestination(url);
      const id = randomUUID(), signingSecret = randomBytes(32).toString("base64url");
      const subscription: HostingSubscription = { id, url: url.href, events: [...new Set(events as string[])], generation: 1, enabled: true,
        sealedSecret: this.seal(principal.tenantId, id, signingSecret), createdAt: new Date(this.now()).toISOString() };
      return { value: { id, signingSecret }, operation: "webhook.register", target: id, outcome: "success", data: { subscription } };
    });
  }
  async subscriptions(principal: HostingPrincipal): Promise<{ subscriptions: Array<Omit<HostingSubscription, "sealedSecret">> }> {
    return this.operate(principal, "webhooks:read", async (state) => ({ value: { subscriptions: [...state.subscriptions.values()].map(({ sealedSecret: _, ...publicFields }) => publicFields) } }));
  }
  async revoke(principal: HostingPrincipal, id: string): Promise<void> {
    hostingId(id, "subscription");
    await this.operate(principal, "webhooks:manage", async (state) => {
      const s = state.subscriptions.get(id); if (!s) throw new HostingError("not_found", 404);
      if (!s.enabled) return { value: undefined };
      return { value: undefined, operation: "webhook.revoke", target: id, outcome: "success", data: { id, generation: s.generation + 1 } };
    });
    for (const controller of REVOKE_CONTROLLERS.get(this.revokeKey(principal.tenantId, id)) ?? []) controller.abort();
  }
  async publish(principal: HostingPrincipal, eventId: string, eventType: string, payload: unknown): Promise<{ deliveryIds: string[]; replay: boolean }> {
    hostingId(eventId, "event");
    if (!HOSTING_EVENT_TYPES.includes(eventType as typeof HOSTING_EVENT_TYPES[number])) throw new HostingError("invalid_event_type");
    let body: string; try { body = JSON.stringify({ id: eventId, type: eventType, tenantId: principal.tenantId, payload }); } catch { throw new HostingError("invalid_payload"); }
    if (body.length > 16 * 1024) throw new HostingError("event_too_large");
    const hash = fingerprint(body);
    return this.operate<{ deliveryIds: string[]; replay: boolean }>(principal, "events:publish", async (state) => {
      const old = state.events.get(eventId);
      if (old) {
        if (old !== hash) throw new HostingError("event_identity_conflict", 409);
        return { value: { deliveryIds: [...state.deliveries.values()].filter((d) => d.eventId === eventId).map((d) => d.id), replay: true } };
      }
      const deliveries = [...state.subscriptions.values()].filter((s) => s.enabled && s.events.includes(eventType)).map((s) => ({
        id: fingerprint(`${principal.tenantId}\0${eventId}\0${s.id}`), eventId, subscriptionId: s.id, generation: s.generation, eventType, body,
        status: "queued" as const, attempts: 0, nextAt: this.now(), leaseUntil: 0, attemptId: null, error: null, deliveredAt: null }));
      return { value: { deliveryIds: deliveries.map((d) => d.id), replay: false }, operation: "event.publish", target: eventId, outcome: "queued", data: { eventId, fingerprint: hash, deliveries } };
    });
  }
  async deliveries(principal: HostingPrincipal): Promise<{ deliveries: Array<Omit<import("./types.js").HostingDelivery, "body">> }> {
    return this.operate(principal, "deliveries:read", async (state) => ({ value: { deliveries: [...state.deliveries.values()].map(({ body: _, ...fields }) => fields) } }));
  }
}
