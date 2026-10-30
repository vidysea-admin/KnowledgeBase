// packages/db/src/collections/users.ts - user-accounts A1 (D-206, UA-2/UA-27). The `users` collection.
// Every operation goes through `scopedCollection()` (tenantId forced at the call site and merged into every
// filter); there is no raw handle. `buildUser` is the ONLY place a row's shape is decided: an exact, closed key
// set, so nothing a caller passes (a plaintext password, a role from a request body, a tenant) can reach the
// database. Hashes only: `passwordHash` must already be a PHC string, `emailNormalized` already the UA-2 form
// (the normaliser and the hasher live in apps/api, unit A2; this layer refuses anything that is not in their output form).
import { randomUUID } from "node:crypto";
import type { Users } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";

export type UserStatus = Users["status"];
export type UserRole = NonNullable<Users["role"]>;
export const USER_STATUSES: readonly UserStatus[] = ["unverified", "pending", "active", "rejected", "disabled"];
export const USER_ROLES: readonly UserRole[] = ["admin", "member", "viewer"];

/** sha256 hex digest: the only form a token or subject may take in these collections. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;
/** PHC string with a known algorithm; a plaintext password can never match. */
const PHC_HASH = /^\$(argon2id|scrypt)\$[!-~]+$/;
/** UA-2 maximum. */
const EMAIL_MAX = 254;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export function users(tenantId: string, db: Db = getDb()) {
  return scopedCollection<Users>(db, "users")(tenantId);
}

/** True when `value` is exactly what the UA-2 normaliser would return: trimmed, NFKC, lowercase, one '@', <= 254, no control characters. */
export function isNormalizedEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > EMAIL_MAX) return false;
  if (CONTROL_CHARS.test(value) || value !== value.trim() || value !== value.normalize("NFKC") || value !== value.toLowerCase()) return false;
  const at = value.indexOf("@");
  return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

/** The only inputs a caller supplies. Extra properties on a runtime object are ignored, never copied. */
export interface UserInput {
  emailNormalized: string;
  displayName: string;
  /** PHC string from the A2 hasher, never a password. */
  passwordHash: string;
  /** Default `unverified` (self-signup). The bootstrap script passes `active` + `admin`. */
  status?: UserStatus;
  role?: UserRole | null;
  statusChangedBy?: string;
}

/** Builds exactly the schema fields (minus tenantId, which the scoped accessor adds). */
export function buildUser(input: UserInput, now: Date = new Date(), id: string = randomUUID()): Omit<Users, "tenantId"> {
  if (!isNormalizedEmail(input.emailNormalized)) throw new Error("Invalid user email: not in normalised form");
  if (typeof input.displayName !== "string" || input.displayName.length < 1 || input.displayName.length > 100 || CONTROL_CHARS.test(input.displayName)) throw new Error("Invalid user displayName");
  if (typeof input.passwordHash !== "string" || input.passwordHash.length < 20 || input.passwordHash.length > 512 || !PHC_HASH.test(input.passwordHash)) throw new Error("Invalid user passwordHash: a PHC hash is required, never a password");
  const status = input.status ?? "unverified";
  if (!USER_STATUSES.includes(status)) throw new Error("Invalid user status");
  const role = input.role ?? null;
  if (role !== null && !USER_ROLES.includes(role)) throw new Error("Invalid user role");
  if (status === "active" && role === null) throw new Error("An active user requires a role");
  if (input.statusChangedBy !== undefined && (typeof input.statusChangedBy !== "string" || input.statusChangedBy.length < 1 || input.statusChangedBy.length > 64)) throw new Error("Invalid user statusChangedBy");
  const at = now.toISOString();
  const row: Omit<Users, "tenantId"> = { _id: id, emailNormalized: input.emailNormalized, displayName: input.displayName, passwordHash: input.passwordHash, status, createdAt: at, updatedAt: at };
  if (role !== null) row.role = role;
  if (status !== "unverified") { row.statusChangedAt = at; if (input.statusChangedBy !== undefined) row.statusChangedBy = input.statusChangedBy; }
  if (status === "active") row.emailVerifiedAt = at;
  return row;
}

export async function insertUser(tenantId: string, input: UserInput, db: Db = getDb(), now: Date = new Date()): Promise<Omit<Users, "tenantId">> {
  const row = buildUser(input, now);
  await users(tenantId, db).insertOne(row);
  return row;
}

/** One user of THIS tenant; another tenant's id resolves to null, not to the row. */
export async function findUserById(tenantId: string, userId: string, db: Db = getDb()): Promise<Users | null> {
  if (typeof userId !== "string" || userId.length === 0) throw new Error("Invalid userId");
  return users(tenantId, db).findOne({ _id: userId });
}

/** Lookup by the UA-2 normalised address, within this tenant. */
export async function findUserByEmail(tenantId: string, emailNormalized: string, db: Db = getDb()): Promise<Users | null> {
  if (!isNormalizedEmail(emailNormalized)) throw new Error("Invalid user email: not in normalised form");
  return users(tenantId, db).findOne({ emailNormalized });
}
