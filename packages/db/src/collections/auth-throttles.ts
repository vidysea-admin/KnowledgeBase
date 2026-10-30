// packages/db/src/collections/auth-throttles.ts - user-accounts A1 (D-206, UA-24/UA-27). The `auth_throttles` collection.
// Failed-login counters keyed by `subjectHash`, a salted hash of the normalised email: a row exists even for an
// address with no account, so the raw address is never stored. The lock state machine (5 failures in 15 min, doubling
// to 24 h) is the auth service's (A4); this layer owns the row shape, the tenant scoping and the TTL invariant:
// purgeAt (a BSON Date) is never earlier than lockedUntil, so Mongo cannot drop a live lock.
import { randomUUID } from "node:crypto";
import type { AuthThrottles } from "@lkb/core";
import type { Db } from "mongodb";
import { getDb } from "../client.js";
import { scopedCollection } from "../lib/tenantScope.js";
import { SHA256_HEX } from "./users.js";

/** A row survives this long past its last activity (and never less than past lockedUntil). */
export const THROTTLE_RETENTION_MS = 24 * 60 * 60 * 1000;

export function authThrottles(tenantId: string, db: Db = getDb()) {
  return scopedCollection<AuthThrottles>(db, "auth_throttles")(tenantId);
}

export interface ThrottleInput {
  subjectHash: string;
  failures: number;
  lockCount?: number;
  windowStartedAt?: Date;
  lockedUntil?: Date;
}

/** purgeAt for a row last touched at `lastActivity`: the later of activity+24h and lockedUntil+24h. */
export function throttlePurgeAt(lastActivity: Date, lockedUntil?: Date): Date {
  const base = lockedUntil && lockedUntil.getTime() > lastActivity.getTime() ? lockedUntil : lastActivity;
  return new Date(base.getTime() + THROTTLE_RETENTION_MS);
}

/** Builds exactly the schema fields (minus tenantId). */
export function buildThrottle(input: ThrottleInput, now: Date = new Date(), id: string = randomUUID()): Omit<AuthThrottles, "tenantId"> {
  if (typeof input.subjectHash !== "string" || !SHA256_HEX.test(input.subjectHash)) throw new Error("Invalid throttle subjectHash: a salted sha256 hex digest is required, never an email");
  if (!Number.isInteger(input.failures) || input.failures < 0 || input.failures > 1_000_000) throw new Error("Invalid throttle failures");
  const lockCount = input.lockCount ?? 0;
  if (!Number.isInteger(lockCount) || lockCount < 0 || lockCount > 64) throw new Error("Invalid throttle lockCount");
  const row: Omit<AuthThrottles, "tenantId"> = {
    _id: id, subjectHash: input.subjectHash, failures: input.failures, lockCount,
    windowStartedAt: (input.windowStartedAt ?? now).toISOString(), lastFailureAt: now.toISOString(),
    purgeAt: throttlePurgeAt(now, input.lockedUntil),
  };
  if (input.lockedUntil !== undefined) row.lockedUntil = input.lockedUntil.toISOString();
  return row;
}

/** This tenant's counter for one subject; null when none or when the row belongs to another tenant. */
export async function findThrottle(tenantId: string, subjectHash: string, db: Db = getDb()): Promise<AuthThrottles | null> {
  if (typeof subjectHash !== "string" || !SHA256_HEX.test(subjectHash)) throw new Error("Invalid throttle subjectHash");
  return authThrottles(tenantId, db).findOne({ subjectHash });
}
