/** Trusted deployment grants, never client input. Missing configuration denies all owners. */
export type WhatsAppOwnerResolver = (authenticatedTenantId: string) => Promise<string | null>;
export function createConfiguredWhatsAppOwnerResolver(raw: string | undefined): WhatsAppOwnerResolver {
  if (raw === undefined || raw.trim() === "") return async () => null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid WHATSAPP_TENANT_OWNER_MAP configuration"); }
  const fail = (): never => { throw new Error("Invalid WHATSAPP_TENANT_OWNER_MAP configuration"); };
  if (!Array.isArray(parsed)) return fail();
  const grants = new Map<string, string>();
  const owners = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const row = item as Record<string, unknown>;
    if (Object.keys(row).length !== 2 || !Object.hasOwn(row, "tenantId") || !Object.hasOwn(row, "ownerUserId")) return fail();
    if (typeof row.tenantId !== "string" || row.tenantId.length === 0 || row.tenantId !== row.tenantId.trim()) return fail();
    if (typeof row.ownerUserId !== "string" || !/^[0-9a-fA-F]{24}$/.test(row.ownerUserId)) return fail();
    const owner = row.ownerUserId.toLowerCase();
    // One archiver owner per tenant; sharing an owner would collide with current source IDs.
    if (grants.has(row.tenantId) || owners.has(owner)) return fail();
    grants.set(row.tenantId, owner); owners.add(owner);
  }
  return async tenantId => grants.get(tenantId) ?? null;
}
