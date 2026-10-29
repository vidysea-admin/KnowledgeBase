/** Test doubles for user-accounts session code: an in-memory SessionStore with Mongo's CAS semantics, a user lookup, a fake clock. No real-Mongo claim (see sessions.mongo.test.ts). */
import { randomUUID } from "node:crypto";
import type { Users } from "@lkb/core";
import type { SessionRow, SessionStore, UserLookup } from "./sessions.js";
import { ROTATION_GRACE_MS } from "./sessions.js";

export function fakeClock(start = "2026-11-01T00:00:00.000Z") {
  let t = Date.parse(start);
  return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
}

export function memorySessionStore() {
  const rows = new Map<string, SessionRow>();
  const revokeRow = (r: SessionRow, reason: NonNullable<SessionRow["revokedReason"]>, now: Date) => { r.revokedAt = now.toISOString(); r.revokedReason = reason; (r as { purgeAt?: unknown }).purgeAt = new Date(now.getTime() + 30 * 864e5); };
  const store: SessionStore = {
    async insert(tenantId, input, now) {
      const at = now.toISOString();
      const row = { _id: randomUUID(), tenantId, userId: input.userId, familyId: randomUUID(), tokenHash: input.tokenHash, createdAt: at, lastUsedAt: at, rotatedAt: at } as SessionRow;
      rows.set(row._id, row); return structuredClone(row);
    },
    async findByTokenHash(h) {
      const hit = [...rows.values()].find((r) => r.tokenHash === h) ?? [...rows.values()].find((r) => r.previousTokenHash === h || (r.retiredTokenHashes as readonly string[] | undefined)?.includes(h));
      return hit ? structuredClone(hit) : null;
    },
    async touch(t, id, now) { const r = rows.get(id); if (r && r.tenantId === t && !r.revokedAt) r.lastUsedAt = now.toISOString(); },
    async rotate(t, e, newHash, now) {
      const r = rows.get(e.id);
      if (!r || r.tenantId !== t || r.tokenHash !== e.tokenHash || r.rotatedAt !== e.rotatedAt || r.revokedAt) return false;
      r.previousTokenHash = e.tokenHash; r.previousValidUntil = new Date(now.getTime() + ROTATION_GRACE_MS).toISOString();
      r.retiredTokenHashes = [...(r.retiredTokenHashes ?? []), e.tokenHash].slice(-5) as NonNullable<typeof r.retiredTokenHashes>;
      r.tokenHash = newHash; r.rotatedAt = now.toISOString(); r.lastUsedAt = now.toISOString(); return true;
    },
    async revoke(t, id, reason, now) { const r = rows.get(id); if (!r || r.tenantId !== t || r.revokedAt) return false; revokeRow(r, reason, now); return true; },
    async revokeFamily(t, familyId, reason, now) { let n = 0; for (const r of rows.values()) if (r.tenantId === t && r.familyId === familyId && !r.revokedAt) { revokeRow(r, reason, now); n++; } return n; },
    async revokeAllForUser(t, userId, reason, except, now) { let n = 0; for (const r of rows.values()) if (r.tenantId === t && r.userId === userId && r._id !== except && !r.revokedAt) { revokeRow(r, reason, now); n++; } return n; },
  };
  return { store, rows };
}

export function user(over: Partial<Users> & Pick<Users, "_id" | "tenantId">): Users {
  return { emailNormalized: `${over._id}@example.org`, displayName: "U", passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo", status: "active", role: "member", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over } as Users;
}

/** Tenant-scoped like `findUserById`: another tenant's user id resolves to null. `lie` returns the row regardless of tenant (a faulty store). */
export function memoryUsers(list: Users[], opts: { lie?: boolean } = {}): UserLookup & { list: Users[] } {
  return { list, async getUser(tenantId, userId) { return list.find((u) => u._id === userId && (opts.lie || u.tenantId === tenantId)) ?? null; } };
}
