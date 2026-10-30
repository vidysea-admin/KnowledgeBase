/** Test doubles for the A4 auth service: an in-memory AuthStore with Mongo's observable semantics (global unique email -> E11000, atomic single-use
 * tokens, tenant scoping, closed-vocabulary audit rows validated by the REAL `buildAuthEvent`), and a fast recording password module. No real-Mongo claim. */
import { createHash } from "node:crypto";
import type { UserSessions, Users } from "@lkb/core";
import { buildAuthEvent, buildToken, buildUser, type AuthEventInput } from "@lkb/db";
import type { AuthStore } from "./auth-service.js";
import type { PasswordApi } from "./auth-service.js";
import type { ThrottleState } from "./throttle.js";
import type { SessionRow } from "./sessions.js";

export type StoredEvent = ReturnType<typeof buildAuthEvent> & { tenantId: string };
type TokenRow = ReturnType<typeof buildToken> & { tenantId: string };

export function memoryAuthStore(opts: { now: () => Date; sessionRows: Map<string, SessionRow> }) {
  const users = new Map<string, Users>();
  const tokens: TokenRow[] = [];
  const throttles = new Map<string, ThrottleState>();
  const events: StoredEvent[] = [];
  const store: AuthStore = {
    async findUserByEmail(t, email) { return [...users.values()].find((u) => u.tenantId === t && u.emailNormalized === email) ?? null; },
    async findUserById(t, id) { const u = users.get(id); return u && u.tenantId === t ? structuredClone(u) : null; },
    async insertUser(t, input, now) {
      const row = buildUser(input, now);
      if ([...users.values()].some((u) => u.emailNormalized === row.emailNormalized)) throw Object.assign(new Error("E11000 duplicate key error index: emailNormalized_1"), { code: 11000, keyPattern: { emailNormalized: 1 } });
      const full = { ...row, tenantId: t } as Users; users.set(full._id, full); return structuredClone(full);
    },
    async updateUser(t, id, set, expectStatus) {
      const u = users.get(id); if (!u || u.tenantId !== t || (expectStatus !== undefined && u.status !== expectStatus)) return false;
      Object.assign(u, set); return true;
    },
    async countUsersCreatedSince(t, since) { return [...users.values()].filter((u) => u.tenantId === t && u.createdAt >= since.toISOString()).length; },
    async deleteStaleUnverified(t, olderThan) {
      let n = 0; for (const u of [...users.values()]) if (u.tenantId === t && u.status === "unverified" && u.createdAt < olderThan.toISOString()) { users.delete(u._id); n++; }
      return n;
    },
    async insertToken(t, input, now) { tokens.push({ ...buildToken(input, now), tenantId: t }); },
    async peekToken(t, tokenHash, purpose, now) {
      const r = tokens.find((x) => x.tenantId === t && x.tokenHash === tokenHash && x.purpose === purpose && !x.usedAt && x.expiresAt > now.toISOString());
      return r?.userId ?? null;
    },
    async consumeToken(t, tokenHash, purpose, now) {
      const r = tokens.find((x) => x.tenantId === t && x.tokenHash === tokenHash && x.purpose === purpose && !x.usedAt && x.expiresAt > now.toISOString());
      if (!r) return null; r.usedAt = now.toISOString(); return r.userId;
    },
    async listSessions(t, userId) { return [...opts.sessionRows.values()].filter((r) => r.tenantId === t && r.userId === userId && !r.revokedAt).map((r) => structuredClone(r)); },
    async getSession(t, id) { const r = opts.sessionRows.get(id); return r && r.tenantId === t ? structuredClone(r) : null; },
    throttle: {
      async get(t, h) { const r = throttles.get(`${t}|${h}`); return r ? structuredClone(r) : null; },
      async put(t, h, next, prev) {
        if (JSON.stringify(throttles.get(`${t}|${h}`) ?? null) !== JSON.stringify(prev)) return false; // compare-and-set, like the Mongo store
        throttles.set(`${t}|${h}`, structuredClone(next)); return true;
      },
      async clear(t, h) { throttles.delete(`${t}|${h}`); },
    },
    async recordEvent(t, event: AuthEventInput, now) { events.push({ ...buildAuthEvent(event, now), tenantId: t }); },
  };
  return { store, users, tokens, throttles, events };
}

const body = (p: string) => createHash("sha256").update(p, "utf8").digest("base64").replace(/=+$/, "").replace(/[+/]/g, "A");
/** A hash in the stored PHC shape; `old` marks one that `needsRehash` reports. */
export const fastHash = (p: string, old = false): string => `$argon2id$v=19$m=1,t=1,p=1$${old ? "OLD" : "NEW"}$${body(p)}`;

/** Recording stand-in for ./password.js: same contract (null stored hash -> still "verifies" against a dummy, returns false). */
export function fastPassword(): PasswordApi & { calls: { hash: string[]; verify: Array<{ stored: string | null | undefined; password: string }> } } {
  const calls = { hash: [] as string[], verify: [] as Array<{ stored: string | null | undefined; password: string }> };
  return {
    calls,
    async hash(p) { calls.hash.push(p); return fastHash(p); },
    async verify(stored, p) { calls.verify.push({ stored, password: p }); return typeof stored === "string" && (stored === fastHash(p) || stored === fastHash(p, true)); },
    needsRehash: (stored) => stored.includes("$OLD$"),
  };
}

export type { UserSessions };
