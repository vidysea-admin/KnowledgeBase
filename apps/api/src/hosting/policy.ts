import { isIP } from "node:net";
import { HostingError, hostingId, type HostingPermission, type HostingPrincipal, type HostingRole, type HostingState } from "./types.js";

const READ: HostingPermission[] = ["webhooks:read", "deliveries:read", "accounts:read", "automation:read", "operations:read"];
const EDIT: HostingPermission[] = [...READ, "events:publish"];
const ADMIN: HostingPermission[] = [...EDIT, "roles:read", "roles:manage", "audit:read", "webhooks:manage", "deliveries:dispatch", "accounts:manage", "automation:manage", "automation:operate", "keys:read", "keys:manage", "operations:manage", "operations:run"];
const PERMISSIONS: Record<HostingRole, readonly HostingPermission[]> = { viewer: READ, editor: EDIT, admin: ADMIN, owner: ADMIN };

export function hostingRole(principal: HostingPrincipal, state: HostingState, bootstrap: ReadonlyMap<string, ReadonlySet<string>>): HostingRole | null {
  return bootstrap.get(principal.tenantId)?.has(principal.keyId) ? "owner" : state.roles.get(principal.keyId) ?? null;
}
export function authorizeHosting(principal: HostingPrincipal, state: HostingState, permission: HostingPermission, bootstrap: ReadonlyMap<string, ReadonlySet<string>>): HostingRole {
  hostingId(principal.tenantId, "tenant"); hostingId(principal.keyId, "actor");
  if (!Array.isArray(principal.scopes) || !principal.scopes.includes("hosting")) throw new HostingError("forbidden", 403);
  if ((permission.startsWith("webhooks:") || permission.startsWith("deliveries:") || permission === "events:publish") && !principal.scopes.includes("webhooks")) throw new HostingError("forbidden", 403);
  if (permission.startsWith("keys:") && !principal.scopes.includes("keys")) throw new HostingError("forbidden", 403);
  if (permission.startsWith("operations:") && !principal.scopes.includes("operations")) throw new HostingError("forbidden", 403);
  const role = hostingRole(principal, state, bootstrap);
  if (!role || !PERMISSIONS[role].includes(permission)) throw new HostingError("forbidden", 403);
  return role;
}

/** Allow only routable addresses; mapped/tunnel IPv6 is refused rather than unwrapped. */
export function hostingPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const n = address.split(".").map(Number), a = n[0]!, b = n[1]!, c = n[2]!;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes("%")) return false;
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const parts = normalized.split(":"), first = parseInt(parts[0]!, 16), second = parseInt(parts[1] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    !(first === 0x3fff && second < 0x1000);
}
export function hostingUrl(value: unknown, origins: ReadonlySet<string>): URL {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) throw new HostingError("invalid_destination");
  let url: URL; try { url = new URL(value); } catch { throw new HostingError("invalid_destination"); }
  if (url.href.length > 2048) throw new HostingError("invalid_destination");
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || !origins.has(url.origin)) throw new HostingError("destination_not_allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || (isIP(host) && !hostingPublicAddress(host))) throw new HostingError("destination_not_allowed");
  return url;
}
