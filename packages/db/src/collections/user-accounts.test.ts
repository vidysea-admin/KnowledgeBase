// user-accounts A1 (D-206): the five stores against a stateful fake Db (no Mongo). Covers tenant scoping, the
// closed row shapes, hashes-only inputs, single-use tokens, session revocation invariants and the append-only audit log.
// Unique-index, validator and TTL behaviour need a real Mongo: see user-accounts.mongo.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import type { Db } from "mongodb";
import * as pkg from "../index.js";
import { authEvents, AUTH_EVENT_DETAILS, buildAuthEvent, listAuthEvents, recordAuthEvent } from "./auth-events.js";
import { authThrottles, buildThrottle, findThrottle, throttlePurgeAt, THROTTLE_RETENTION_MS } from "./auth-throttles.js";
import { buildSession, findSessionById, insertSession, revocationFields, revokeSession, revokeUserSessions, SESSION_PURGE_AFTER_MS, userSessions } from "./user-sessions.js";
import { buildToken, consumeToken, insertToken, TOKEN_PURGE_GRACE_MS, TOKEN_TTL_MS, userTokens } from "./user-tokens.js";
import { buildUser, findUserByEmail, findUserById, insertUser, isNormalizedEmail, users } from "./users.js";

type Row = Record<string, unknown>;
const get = (row: Row, key: string) => row[key];
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Row[]).some((f) => matches(row, f));
    const v = get(row, key);
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond as Row).every(([op, arg]) => {
        if (op === "$exists") return (v !== undefined) === arg;
        if (op === "$gt") return (v as string) > (arg as string);
        if (op === "$lt") return (v as string) < (arg as string);
        if (op === "$ne") return v !== arg;
        throw new Error(`fake db: operator ${op} not supported`);
      });
    }
    return v === cond;
  });
}
function fakeDb() {
  const store = new Map<string, Row[]>();
  const rowsOf = (name: string) => { if (!store.has(name)) store.set(name, []); return store.get(name)!; };
  const collection = (name: string) => ({
    async insertOne(doc: Row) { rowsOf(name).push({ ...doc }); return { acknowledged: true }; },
    async findOne(filter: Row) { return rowsOf(name).find((r) => matches(r, filter)) ?? null; },
    find(filter: Row) {
      let out = rowsOf(name).filter((r) => matches(r, filter));
      const cursor = {
        sort: (s: Record<string, 1 | -1>) => { const [[k, d]] = Object.entries(s).slice(0, 1) as [[string, 1 | -1]]; out = [...out].sort((a, b) => ((get(a, k) as string) < (get(b, k) as string) ? -d : (get(a, k) as string) > (get(b, k) as string) ? d : (a._id as string) < (b._id as string) ? 1 : -1)); return cursor; },
        limit: (n: number) => { out = out.slice(0, n); return cursor; },
        toArray: async () => out,
      };
      return cursor;
    },
    async updateOne(filter: Row, update: { $set?: Row }) {
      const hit = rowsOf(name).find((r) => matches(r, filter));
      if (!hit) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(hit, update.$set); return { matchedCount: 1, modifiedCount: 1 };
    },
    async bulkWrite(ops: { updateMany: { filter: Row; update: { $set: Row } } }[]) {
      let modified = 0;
      for (const { updateMany } of ops) for (const r of rowsOf(name).filter((x) => matches(x, updateMany.filter))) { Object.assign(r, updateMany.update.$set); modified++; }
      return { modifiedCount: modified };
    },
  });
  return { db: { collection } as unknown as Db, rowsOf };
}
const now = new Date("2026-10-29T10:00:00.000Z");
const HASH = (c: string) => c.repeat(64);
const PHC = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNo";

test("every accessor refuses a missing or operator-shaped tenant", () => {
  const { db } = fakeDb();
  const accessors = [users, userSessions, userTokens, authThrottles, authEvents] as const;
  for (const make of accessors) {
    for (const bad of ["", " toc", undefined, null, 7, { $ne: null }, "a\nb"]) assert.throws(() => make(bad as never, db), /tenantId is required/, `${make.name} accepted ${JSON.stringify(bad)}`);
  }
});

test("a cross-tenant findOne by id returns null for every new collection", async () => {
  const { db } = fakeDb();
  const user = await insertUser("tenant-a", { emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC }, db, now);
  const sess = await insertSession("tenant-a", { userId: user._id, tokenHash: HASH("a") }, db, now);
  const tok = await insertToken("tenant-a", { userId: user._id, purpose: "verify_email", tokenHash: HASH("b") }, db, now);
  await authThrottles("tenant-a", db).insertOne(buildThrottle({ subjectHash: HASH("c"), failures: 1 }, now, "th-1"));
  await recordAuthEvent("tenant-a", { type: "signup", outcome: "ok" }, db, now);
  const evId = (await listAuthEvents("tenant-a", {}, db)).rows[0]!._id;
  assert.equal((await findUserById("tenant-a", user._id, db))?._id, user._id);
  assert.equal(await findUserById("tenant-b", user._id, db), null);
  assert.equal(await findUserByEmail("tenant-b", "a@example.com", db), null);
  assert.equal(await findSessionById("tenant-b", sess._id, db), null);
  assert.equal(await userTokens("tenant-b", db).findOne({ _id: tok._id }), null);
  assert.equal(await findThrottle("tenant-b", HASH("c"), db), null);
  assert.equal(await authThrottles("tenant-b", db).findOne({ _id: "th-1" }), null);
  assert.equal(await authEvents("tenant-b", db).find({ _id: evId }).toArray().then((r) => r.length), 0);
  assert.equal((await listAuthEvents("tenant-b", {}, db)).rows.length, 0);
});

test("buildUser: closed key set, hashes only, normalised email only, active needs a role", () => {
  const row = buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC, password: "hunter2hunter2", tenantId: "evil", isAdmin: true } as never, now, "u-1");
  assert.deepEqual(Object.keys(row).sort(), ["_id", "createdAt", "displayName", "emailNormalized", "passwordHash", "status", "updatedAt"]);
  assert.equal(row.status, "unverified");
  assert.doesNotMatch(JSON.stringify(row), /hunter2/);
  assert.throws(() => buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: "correct horse battery staple" }), /PHC/);
  assert.throws(() => buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC, status: "active" }), /requires a role/);
  assert.throws(() => buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC, status: "active", role: "owner" as never }), /role/);
  assert.throws(() => buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC, status: "banned" as never }), /status/);
  const admin = buildUser({ emailNormalized: "a@example.com", displayName: "A", passwordHash: PHC, status: "active", role: "admin", statusChangedBy: "bootstrap-script" }, now);
  assert.equal(admin.role, "admin"); assert.equal(admin.statusChangedBy, "bootstrap-script"); assert.equal(admin.emailVerifiedAt, now.toISOString());
});

test("isNormalizedEmail accepts only the UA-2 output form", () => {
  assert.equal(isNormalizedEmail("a@example.com"), true);
  for (const bad of ["A@example.com", " a@example.com", "a@example.com ", "ａ@example.com", "a@@example.com", "a@b@c.com", "@example.com", "a@", "a\n@example.com", "é@example.com", `${"x".repeat(250)}@e.co`, 5, null, undefined]) assert.equal(isNormalizedEmail(bad), false, JSON.stringify(bad));
});

test("session rows: hash-only, active rows carry no revocation fields, revocation sets all three together", async () => {
  const { db, rowsOf } = fakeDb();
  assert.throws(() => buildSession({ userId: "u-1", tokenHash: "raw-cookie-token-value" }), /sha256/);
  assert.throws(() => buildSession({ userId: "u-1", tokenHash: HASH("a"), ipPrefix: "203.0.113.77" }), /ipPrefix/);
  const s = await insertSession("toc", { userId: "u-1", tokenHash: HASH("a"), ipPrefix: "203.0.113.0/24", userAgentSummary: "Firefox on Windows" }, db, now);
  for (const k of ["revokedAt", "revokedReason", "purgeAt"]) assert.equal(k in s, false, `active session must not carry ${k}`);
  assert.ok(s.familyId.length > 0);
  const f = revocationFields("logout", now);
  assert.ok(f.purgeAt instanceof Date); assert.equal(f.purgeAt.getTime() - now.getTime(), SESSION_PURGE_AFTER_MS);
  assert.throws(() => revocationFields("because" as never, now), /revokedReason/);
  assert.equal(await revokeSession("toc", s._id, "logout", db, now), true);
  assert.equal(await revokeSession("toc", s._id, "admin", db, now), false, "second revoke must not overwrite (compare-and-swap)");
  assert.equal(rowsOf("user_sessions")[0]!.revokedReason, "logout");
  assert.equal(await revokeSession("other", s._id, "admin", db, now), false);
});

test("revokeUserSessions revokes this user's active sessions in this tenant, optionally keeping one", async () => {
  const { db, rowsOf } = fakeDb();
  const keep = await insertSession("toc", { userId: "u-1", tokenHash: HASH("1") }, db, now);
  await insertSession("toc", { userId: "u-1", tokenHash: HASH("2") }, db, now);
  await insertSession("toc", { userId: "u-2", tokenHash: HASH("3") }, db, now);
  await insertSession("other", { userId: "u-1", tokenHash: HASH("4") }, db, now);
  assert.equal(await revokeUserSessions("toc", "u-1", "password_change", { exceptSessionId: keep._id }, db, now), 1);
  const alive = rowsOf("user_sessions").filter((r) => r.revokedAt === undefined).map((r) => r.tokenHash);
  assert.deepEqual(alive.sort(), [HASH("1"), HASH("3"), HASH("4")].sort());
});

test("tokens: hash-only, expiry per purpose, purgeAt is a Date after expiry, single use", async () => {
  const { db } = fakeDb();
  assert.throws(() => buildToken({ userId: "u-1", purpose: "verify_email", tokenHash: "rawtoken" }), /sha256/);
  assert.throws(() => buildToken({ userId: "u-1", purpose: "login" as never, tokenHash: HASH("a") }), /purpose/);
  assert.throws(() => buildToken({ userId: "u-1", purpose: "verify_email", tokenHash: HASH("a"), issuedBy: "u-2" }), /issuedBy/);
  const v = buildToken({ userId: "u-1", purpose: "verify_email", tokenHash: HASH("a") }, now, "t-1");
  const r = buildToken({ userId: "u-1", purpose: "password_reset", tokenHash: HASH("b"), issuedVia: "admin", issuedBy: "u-9" }, now, "t-2");
  assert.equal(new Date(v.expiresAt).getTime() - now.getTime(), TOKEN_TTL_MS.verify_email);
  assert.equal(new Date(r.expiresAt).getTime() - now.getTime(), TOKEN_TTL_MS.password_reset);
  assert.ok(v.purgeAt instanceof Date); assert.equal(v.purgeAt.getTime() - new Date(v.expiresAt).getTime(), TOKEN_PURGE_GRACE_MS);
  await insertToken("toc", { userId: "u-1", purpose: "verify_email", tokenHash: HASH("a") }, db, now);
  await insertToken("toc", { userId: "u-1", purpose: "password_reset", tokenHash: HASH("b") }, db, now);
  assert.equal(await consumeToken("toc", HASH("a"), "password_reset", db, now), null, "wrong purpose");
  assert.equal(await consumeToken("other", HASH("a"), "verify_email", db, now), null, "other tenant");
  assert.equal(await consumeToken("toc", "not-a-hash", "verify_email", db, now), null);
  assert.equal(await consumeToken("toc", HASH("a"), "verify_email", db, new Date(now.getTime() + TOKEN_TTL_MS.verify_email + 1)), null, "expired");
  assert.equal(await consumeToken("toc", HASH("a"), "verify_email", db, now), "u-1");
  assert.equal(await consumeToken("toc", HASH("a"), "verify_email", db, now), null, "reuse");
});

test("throttles: salted-hash subject only, purgeAt never earlier than the lock", () => {
  assert.throws(() => buildThrottle({ subjectHash: "alice@example.com", failures: 1 }), /subjectHash/);
  assert.throws(() => buildThrottle({ subjectHash: HASH("a"), failures: -1 }), /failures/);
  const lockedUntil = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  const row = buildThrottle({ subjectHash: HASH("a"), failures: 5, lockCount: 3, lockedUntil }, now, "th-1");
  assert.ok(row.purgeAt instanceof Date);
  assert.ok(row.purgeAt.getTime() >= lockedUntil.getTime());
  assert.equal(row.purgeAt.getTime(), lockedUntil.getTime() + THROTTLE_RETENTION_MS);
  assert.equal(throttlePurgeAt(now).getTime(), now.getTime() + THROTTLE_RETENTION_MS);
  assert.equal(row.lockedUntil, lockedUntil.toISOString());
});

test("auth_events exposes insert and read only; nothing in the package can update or delete one", () => {
  const { db } = fakeDb();
  assert.deepEqual(Object.keys(authEvents("toc", db)).sort(), ["find", "insert"]);
  const names = Object.keys(pkg).filter((k) => /event/i.test(k) && /^(update|delete|remove|replace|upsert|purge|clear|bulk)/i.test(k));
  assert.deepEqual(names, [], "no mutating auth-event helper may exist");
  const handle = authEvents("toc", db) as unknown as Record<string, unknown>;
  for (const op of ["updateOne", "deleteMany", "deleteOne", "replaceOne", "bulkWrite", "update", "delete"]) assert.equal(handle[op], undefined, op);
});

test("buildAuthEvent: closed vocabularies, no free text, no raw email, no secrets", () => {
  const row = buildAuthEvent({ type: "login_failed", outcome: "failed", detail: "invalid_credentials", subjectHash: HASH("9"), ipPrefix: "203.0.113.0/24", userAgentSummary: "Firefox on Windows", password: "hunter2canary", token: "tok-canary", cookie: "sid-canary", email: "who@example.com" } as never, now, "e-1");
  assert.deepEqual(Object.keys(row).sort(), ["_id", "at", "detail", "ipPrefix", "outcome", "purgeAt", "subjectHash", "type", "userAgentSummary"]);
  assert.doesNotMatch(JSON.stringify(row), /canary|who@example/);
  assert.throws(() => buildAuthEvent({ type: "login_failed", outcome: "failed", detail: "user typed: hello" as never }), /closed vocabulary/);
  assert.throws(() => buildAuthEvent({ type: "impersonation" as never, outcome: "ok" }), /type/);
  assert.throws(() => buildAuthEvent({ type: "login_failed", outcome: "failed", subjectHash: "who@example.com" }), /subjectHash/);
  assert.throws(() => buildAuthEvent({ type: "login_ok", outcome: "ok", ipPrefix: "203.0.113.77" }), /ipPrefix/);
  assert.equal(buildAuthEvent({ type: "signup", outcome: "ok" }, now).detail, "none");
  assert.ok(AUTH_EVENT_DETAILS.every((d) => /^[a-z_]+$/.test(d)), "vocabulary entries are identifiers, not sentences");
});

test("a full scenario's audit rows never contain a password, token or cookie substring", async () => {
  const { db, rowsOf } = fakeDb();
  const secrets = ["hunter2-canary-password", "raw-token-canary", "__Secure-lkb_sid=canary"];
  for (const type of ["signup", "email_verified", "login_failed", "login_ok", "approved", "password_reset", "logout"] as const) {
    await recordAuthEvent("toc", { type, outcome: "ok", actorUserId: "u-1", targetUserId: "u-2", password: secrets[0], token: secrets[1], cookie: secrets[2] } as never, db, now);
  }
  const dump = JSON.stringify(rowsOf("auth_events"));
  for (const s of secrets) assert.equal(dump.includes(s), false, s);
  assert.doesNotMatch(dump, /"(password|token|cookie|email)"/);
});

test("listAuthEvents pages newest first with a cursor and stays inside the tenant", async () => {
  const { db } = fakeDb();
  for (let i = 0; i < 5; i++) await authEvents("toc", db).insert(buildAuthEvent({ type: "login_ok", outcome: "ok" }, new Date(now.getTime() + i * 1000), `e-${i}`));
  await authEvents("other", db).insert(buildAuthEvent({ type: "login_ok", outcome: "ok" }, new Date(now.getTime() + 9000), "e-other"));
  const first = await listAuthEvents("toc", { limit: 2 }, db);
  assert.deepEqual(first.rows.map((r) => r._id), ["e-4", "e-3"]);
  assert.ok(first.next);
  const second = await listAuthEvents("toc", { limit: 2, after: first.next! }, db);
  assert.deepEqual(second.rows.map((r) => r._id), ["e-2", "e-1"]);
  const third = await listAuthEvents("toc", { limit: 2, after: second.next! }, db);
  assert.deepEqual(third.rows.map((r) => r._id), ["e-0"]);
  assert.equal(third.next, null);
  await assert.rejects(listAuthEvents("toc", { after: { at: 1, id: 2 } as never }, db), /cursor/);
});
