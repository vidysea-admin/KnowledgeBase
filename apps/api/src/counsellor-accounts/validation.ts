import { HostingError, hostingFields, hostingId, hostingObject } from "../hosting/types.js";
import type { CounsellorAccount } from "./types.js";

export function accountProfile(input: unknown): { displayName: string; email: string } {
  const body = hostingObject(input); hostingFields(body, ["displayName", "email"]);
  const name = hostingId(body.displayName, "display_name"), email = hostingId(body.email, "email").toLowerCase();
  if (name.length > 160 || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new HostingError("invalid_profile");
  return { displayName: name, email };
}
export function accountRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new HostingError("invalid_revision");
  return value as number;
}
export function validateAccount(value: unknown): CounsellorAccount {
  const body = hostingObject(value);
  hostingFields(body, ["id", "keyId", "displayName", "email", "status", "revision", "createdAt", "updatedAt"]);
  hostingId(body.id, "account"); hostingId(body.keyId, "key");
  const profile = accountProfile({ displayName: body.displayName, email: body.email });
  if (profile.displayName !== body.displayName || profile.email !== body.email ||
      !["active", "inactive", "deleted"].includes(String(body.status))) throw new HostingError("account_recovery_required", 503);
  accountRevision(body.revision);
  for (const field of ["createdAt", "updatedAt"]) {
    const at = body[field];
    if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new HostingError("account_recovery_required", 503);
  }
  if (String(body.updatedAt) < String(body.createdAt)) throw new HostingError("account_recovery_required", 503);
  return body as unknown as CounsellorAccount;
}
