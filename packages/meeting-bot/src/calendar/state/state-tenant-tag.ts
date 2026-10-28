/**
 * Tenant tag for the scheduler's own state files (schedule-state.json, scheduled/<jobKey>.json) - ISS-ALERTID-006.
 * Those files live under one shared directory (<repo>/raw/webinars). Every file now carries the tenant that wrote it and every
 * reader refuses (throws StateTenantRefusal) a file whose tag is missing or different, BEFORE using any of its content.
 * Existing untagged files from older versions are refused, never read, migrated or deleted: an operator must review them.
 * Pure: no filesystem access here.
 */
export const STATE_TENANT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export type StateTenantRefusalReason = "invalid-tenant" | "untagged" | "other-tenant" | "key-tenant-unverified" | "key-tenant-mismatch";

export class StateTenantRefusal extends Error {
  constructor(readonly reason: StateTenantRefusalReason, readonly fileLabel: string, message: string) {
    super(message);
    this.name = "StateTenantRefusal";
  }
}

/** The tenant a caller works for must be a valid tenant id; anything else (undefined, "", path-like) fails closed. */
export function requireStateTenant(tenantId: unknown): string {
  if (typeof tenantId !== "string" || !STATE_TENANT_RE.test(tenantId)) {
    throw new StateTenantRefusal("invalid-tenant", "(none)",
      "refusing to read or write scheduler state: no valid tenant id (set LKB_TENANT_ID or pass --tenant); the state files are tenant-tagged and are never used without one");
  }
  return tenantId;
}

/**
 * ISS-ALERTTENANT-002: the tenant that tags the state files must be the tenant of the API key the tick fetches meetings with.
 * `keyTenant` is the VERIFIED key tenant (the X-LKB-Tenant header, see join-rules-wiring/key-tenant.ts); null / undefined / invalid = could not
 * be verified, which is refused (a tick that cannot show whose key it holds must not record that key's meetings under any tenant).
 * Neither message names the key's tenant.
 */
export function requireStateTenantMatchesKey(stateTenant: string, keyTenant: unknown): string {
  requireStateTenant(stateTenant);
  if (typeof keyTenant !== "string" || !STATE_TENANT_RE.test(keyTenant)) {
    throw new StateTenantRefusal("key-tenant-unverified", "(none)",
      "refusing to read or write scheduler state: the API key's tenant could not be verified, so the state cannot be shown to belong to the configured tenant (LKB_TENANT_ID). Nothing was scheduled.");
  }
  if (keyTenant !== stateTenant) {
    throw new StateTenantRefusal("key-tenant-mismatch", "(none)",
      `refusing to read or write scheduler state: the API key belongs to a different tenant than the configured '${stateTenant}' (LKB_TENANT_ID). Nothing was scheduled; fix LKB_TENANT_ID or LKB_API_KEY.`);
  }
  return stateTenant;
}

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Throws unless `value` is an object tagged with exactly `tenantId`. The message never names the OTHER tenant.
 * `fileLabel` is a short label (file name), not a full path.
 */
export function assertTenantTag(value: unknown, tenantId: string, fileLabel: string): Record<string, unknown> {
  requireStateTenant(tenantId);
  const tag = isPlain(value) ? value.tenantId : undefined;
  if (typeof tag !== "string" || tag === "") {
    throw new StateTenantRefusal("untagged", fileLabel,
      `refusing ${fileLabel}: it has no tenant tag (written by an older version; the directory is shared by every tenant on this machine), ` +
      `so it cannot be shown to belong to tenant '${tenantId}'. It was not read, changed or deleted. Review it and move it aside yourself; no automatic migration is done.`);
  }
  if (tag !== tenantId) {
    throw new StateTenantRefusal("other-tenant", fileLabel,
      `refusing ${fileLabel}: it is tagged for a different tenant than '${tenantId}'. It was not read, changed or deleted.`);
  }
  return value as Record<string, unknown>;
}
