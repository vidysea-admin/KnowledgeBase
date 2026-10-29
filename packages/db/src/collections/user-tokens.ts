// packages/db/src/collections/user-tokens.ts - user-accounts A1 (D-206, UA-4/UA-21). The `user_tokens` collection.
// Single-use email-verification and password-reset tokens. Only sha256(token) is stored (`tokenHash`, globally
// unique); the raw value exists once, in the mail or the admin-issued link, and never reaches this layer. Every
// operation is tenant-scoped. `consumeToken` is the single-use gate: one atomic update that only one caller can win.
import { randomUUID } from "node:crypto";
import type { UserTokens } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";
import { SHA256_HEX } from "./users.js";

export type TokenPurpose = UserTokens["purpose"];
export const TOKEN_PURPOSES: readonly TokenPurpose[] = ["verify_email", "password_reset"];
/** Validity per purpose (UA-4: 24 h, UA-21: 1 h). */
export const TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = { verify_email: 24 * 60 * 60 * 1000, password_reset: 60 * 60 * 1000 };
/** A spent or expired token lingers this long past expiresAt, then the TTL index removes it. */
export const TOKEN_PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function userTokens(tenantId: string, db: Db = getDb()) {
  return scopedCollection<UserTokens>(db, "user_tokens")(tenantId);
}

export interface TokenInput {
  userId: string;
  purpose: TokenPurpose;
  /** sha256 hex of the raw token; the raw token is never accepted. */
  tokenHash: string;
  issuedVia?: "mail" | "admin";
  /** Admin userId; allowed only with issuedVia "admin". */
  issuedBy?: string;
}

/** Builds exactly the schema fields (minus tenantId). expiresAt follows the purpose; purgeAt is a BSON Date. */
export function buildToken(input: TokenInput, now: Date = new Date(), id: string = randomUUID()): Omit<UserTokens, "tenantId"> {
  if (typeof input.userId !== "string" || input.userId.length < 1 || input.userId.length > 64) throw new Error("Invalid token userId");
  if (!TOKEN_PURPOSES.includes(input.purpose)) throw new Error("Invalid token purpose");
  if (typeof input.tokenHash !== "string" || !SHA256_HEX.test(input.tokenHash)) throw new Error("Invalid token hash: a sha256 hex digest is required, never the token");
  const issuedVia = input.issuedVia ?? "mail";
  if (issuedVia !== "mail" && issuedVia !== "admin") throw new Error("Invalid token issuedVia");
  const expires = new Date(now.getTime() + TOKEN_TTL_MS[input.purpose]);
  const row: Omit<UserTokens, "tenantId"> = {
    _id: id, userId: input.userId, purpose: input.purpose, tokenHash: input.tokenHash, issuedVia,
    createdAt: now.toISOString(), expiresAt: expires.toISOString(), purgeAt: new Date(expires.getTime() + TOKEN_PURGE_GRACE_MS),
  };
  if (input.issuedBy !== undefined) {
    if (issuedVia !== "admin" || typeof input.issuedBy !== "string" || input.issuedBy.length < 1 || input.issuedBy.length > 64) throw new Error("Invalid token issuedBy");
    row.issuedBy = input.issuedBy;
  }
  return row;
}

export async function insertToken(tenantId: string, input: TokenInput, db: Db = getDb(), now: Date = new Date()): Promise<Omit<UserTokens, "tenantId">> {
  const row = buildToken(input, now);
  await userTokens(tenantId, db).insertOne(row);
  return row;
}

/**
 * Spends a token exactly once: matches only an unused, unexpired token of this tenant with the same hash AND
 * purpose, and marks it used in the same atomic update. Returns the token's userId, or null for every failure
 * (unknown, wrong purpose, already used, expired, other tenant) - callers must not distinguish them.
 */
export async function consumeToken(tenantId: string, tokenHash: string, purpose: TokenPurpose, db: Db = getDb(), now: Date = new Date()): Promise<string | null> {
  if (typeof tokenHash !== "string" || !SHA256_HEX.test(tokenHash) || !TOKEN_PURPOSES.includes(purpose)) return null;
  const at = now.toISOString();
  const coll = userTokens(tenantId, db);
  const res = await coll.updateOne({ tokenHash, purpose, usedAt: { $exists: false }, expiresAt: { $gt: at } }, { $set: { usedAt: at } });
  if (res.modifiedCount !== 1) return null;
  const spent = await coll.findOne({ tokenHash });
  return spent?.userId ?? null;
}
