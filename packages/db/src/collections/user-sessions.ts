// packages/db/src/collections/user-sessions.ts - user-accounts A1 (D-206, UA-13/UA-14/UA-27). The `user_sessions` collection.
// Only sha256(token) is ever stored; the cookie token never reaches this layer. Every operation is tenant-scoped
// through `scopedCollection()`. `buildSession` and `revocationFields` decide the row shape: an ACTIVE row has no
// revokedAt/revokedReason/purgeAt, a REVOKED row has all three (purgeAt = revoke time + 30 days, a BSON Date so the
// TTL index removes it), and an active row can therefore never be purged by Mongo.
import { randomUUID } from "node:crypto";
import type { UserSessions } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";
import { SHA256_HEX } from "./users.js";

export type SessionRevokedReason = NonNullable<UserSessions["revokedReason"]>;
export const SESSION_REVOKED_REASONS: readonly SessionRevokedReason[] = ["logout", "admin", "password_change", "password_reset", "disabled", "reuse_detected", "idle_expired"];
/** Revoked and expired rows are purged this long after the event (UA-13). */
export const SESSION_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const IP_PREFIX = /^[0-9A-Fa-f:.]+\/(24|48)$/;
const UA_SUMMARY = /^[A-Za-z0-9 ._+-]*$/;

export function userSessions(tenantId: string, db: Db = getDb()) {
  return scopedCollection<UserSessions>(db, "user_sessions")(tenantId);
}

export interface SessionInput {
  userId: string;
  tokenHash: string;
  /** Omit for a new login; rotation keeps the family. */
  familyId?: string;
  ipPrefix?: string;
  userAgentSummary?: string;
}

function id64(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) throw new Error(`Invalid session ${what}`);
  return value;
}

/** A new active session. Exactly the schema fields; extra input properties are ignored. */
export function buildSession(input: SessionInput, now: Date = new Date(), id: string = randomUUID()): Omit<UserSessions, "tenantId"> {
  if (typeof input.tokenHash !== "string" || !SHA256_HEX.test(input.tokenHash)) throw new Error("Invalid session tokenHash: a sha256 hex digest is required, never the token");
  const at = now.toISOString();
  const row: Omit<UserSessions, "tenantId"> = {
    _id: id64(id, "id"), userId: id64(input.userId, "userId"), familyId: id64(input.familyId ?? randomUUID(), "familyId"),
    tokenHash: input.tokenHash, createdAt: at, lastUsedAt: at, rotatedAt: at,
  };
  if (input.ipPrefix !== undefined) { if (typeof input.ipPrefix !== "string" || input.ipPrefix.length > 64 || !IP_PREFIX.test(input.ipPrefix)) throw new Error("Invalid session ipPrefix: a truncated /24 or /48 is required"); row.ipPrefix = input.ipPrefix; }
  if (input.userAgentSummary !== undefined) { if (typeof input.userAgentSummary !== "string" || input.userAgentSummary.length > 80 || !UA_SUMMARY.test(input.userAgentSummary)) throw new Error("Invalid session userAgentSummary"); row.userAgentSummary = input.userAgentSummary; }
  return row;
}

/** The three fields that mark a session revoked, always together. */
export function revocationFields(reason: SessionRevokedReason, now: Date = new Date()): { revokedAt: string; revokedReason: SessionRevokedReason; purgeAt: Date } {
  if (!SESSION_REVOKED_REASONS.includes(reason)) throw new Error("Invalid session revokedReason");
  return { revokedAt: now.toISOString(), revokedReason: reason, purgeAt: new Date(now.getTime() + SESSION_PURGE_AFTER_MS) };
}

export async function insertSession(tenantId: string, input: SessionInput, db: Db = getDb(), now: Date = new Date()): Promise<Omit<UserSessions, "tenantId">> {
  const row = buildSession(input, now);
  await userSessions(tenantId, db).insertOne(row);
  return row;
}

/** A session of THIS tenant by id; another tenant's id resolves to null. */
export async function findSessionById(tenantId: string, sessionId: string, db: Db = getDb()): Promise<(UserSessions) | null> {
  return userSessions(tenantId, db).findOne({ _id: id64(sessionId, "id") });
}

/** Revokes one still-active session of this tenant. Compare-and-swap: true only when this call did it. */
export async function revokeSession(tenantId: string, sessionId: string, reason: SessionRevokedReason, db: Db = getDb(), now: Date = new Date()): Promise<boolean> {
  const res = await userSessions(tenantId, db).updateOne({ _id: id64(sessionId, "id"), revokedAt: { $exists: false } }, { $set: revocationFields(reason, now) });
  return res.modifiedCount === 1;
}

/** Revokes every still-active session of one user in this tenant (optionally keeping one). Returns how many changed. */
export async function revokeUserSessions(tenantId: string, userId: string, reason: SessionRevokedReason, opts: { exceptSessionId?: string } = {}, db: Db = getDb(), now: Date = new Date()): Promise<number> {
  const filter: Record<string, unknown> = { userId: id64(userId, "userId"), revokedAt: { $exists: false } };
  if (opts.exceptSessionId !== undefined) filter._id = { $ne: id64(opts.exceptSessionId, "id") };
  const res = await userSessions(tenantId, db).bulkWrite([{ updateMany: { filter, update: { $set: revocationFields(reason, now) } } }]);
  return res.modifiedCount;
}
