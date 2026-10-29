/**
 * apps/api/src/user-accounts/tokens.ts -- unit `ua-credentials`, spec UA-4 / UA-13 / UA-21.
 *
 * One token shape for every single-use or session secret: 32 random bytes (256 bits) from the OS CSPRNG,
 * base64url (43 characters). The raw value is returned ONCE to the caller (to put in a cookie or hand to an
 * admin); the only thing a store ever holds is its SHA-256 hex (`hashToken`, reusing `../hash.ts`). A
 * 256-bit random secret needs no salt or slow hash. Comparison of digests is `timingSafeEqual` on
 * equal-length buffers, and malformed input is a plain `false`, never a throw (a throw would be an oracle).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "../hash.js";

export const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_SHAPE = /^[0-9a-f]{64}$/;

export type TokenPurpose = "verify_email" | "password_reset";
export const TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = Object.freeze({
  verify_email: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
});

export function tokenExpiry(purpose: TokenPurpose, now: Date = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS[purpose]);
}

/** A fresh token: `token` is shown once and never stored; `tokenHash` is what is stored. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}

/** SHA-256 hex of a presented token, or null when the value is not shaped like a token (so junk never reaches a query). */
export function hashToken(token: string): string | null {
  return typeof token === "string" && TOKEN_SHAPE.test(token) ? sha256Hex(token) : null;
}

/** True when `token` hashes to `storedHash`. Constant-time on the digest comparison. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const presented = hashToken(token);
  if (presented === null || typeof storedHash !== "string" || !DIGEST_SHAPE.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(presented, "hex"), Buffer.from(storedHash, "hex"));
}

export type TokenRecord = { userId: string; purpose: TokenPurpose; tokenHash: string; expiresAt: Date; usedAt?: Date | null };

/**
 * A token is usable only if it matches the stored digest AND is bound to this (userId, purpose), is unexpired
 * and unused. Every failure is the same `false`, so a caller can answer one generic 400 `invalid_token`.
 */
export function checkTokenRecord(record: TokenRecord, token: string, expect: { userId: string; purpose: TokenPurpose; now?: Date }): boolean {
  const now = (expect.now ?? new Date()).getTime();
  const match = tokenMatches(token, record.tokenHash);
  const bound = record.userId === expect.userId && record.purpose === expect.purpose;
  const expires = record.expiresAt instanceof Date ? record.expiresAt.getTime() : Number.NaN;
  const live = Number.isFinite(expires) && now < expires && !record.usedAt;
  return match && bound && live;
}
