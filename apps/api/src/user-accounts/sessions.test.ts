// user-accounts A3 (D-206): session service rules with an in-memory store: resolution matrix, tenancy (ISS-415),
// revocation, idle expiry, rotation + grace + replay (UA-14), storage failure. Real-Mongo races: sessions.mongo.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../hash.js";
import { fakeClock, memorySessionStore, memoryUsers, user } from "./sessions.testsupport.js";
import { createSessionService, IDLE_EXPIRY_MS, ROTATE_AFTER_MS, ROTATION_GRACE_MS, type SessionStore } from "./sessions.js";
import { GENERIC_SIGNUP_RESPONSE, isDuplicateEmailError } from "./principal.js";

const DAY = 864e5;
function setup(users = [user({ _id: "u1", tenantId: "tA" }), user({ _id: "ux", tenantId: "tB" })], opts: { lie?: boolean; store?: SessionStore } = {}) {
  const clock = fakeClock(), mem = memorySessionStore(), events: Array<[string, unknown]> = [];
  const usersApi = memoryUsers(users, { lie: opts.lie });
  const svc = createSessionService({ store: opts.store ?? mem.store, users: usersApi, now: clock.now, audit: async (t, e) => { events.push([t, e]); } });
  return { svc, clock, mem, events, users: usersApi };
}
const expectFail = (out: { ok: boolean; code?: string; status?: number }, code: string, status = 401) => { assert.equal(out.ok, false); assert.equal(out.code, code); assert.equal(out.status, status); };

test("a valid session resolves to a tenant-scoped principal with role scopes and no keyId (A3 #1, #7)", async () => {
  const { svc } = setup();
  const { token } = await svc.create("tA", "u1");
  const out = await svc.authenticate(token);
  assert.ok(out.ok);
  assert.equal(out.auth.tenantId, "tA"); assert.equal(out.auth.principal, "session"); assert.equal(out.auth.userId, "u1"); assert.equal("keyId" in out.auth, false);
  assert.ok(out.auth.scopes.includes("ingest") && !out.auth.scopes.includes("user-admin"));
});

test("only the hash is stored, never the token", async () => {
  const { svc, mem } = setup();
  const { token } = await svc.create("tA", "u1");
  const row = [...mem.rows.values()][0]!;
  assert.equal(row.tokenHash, sha256Hex(token));
  assert.ok(!JSON.stringify(row).includes(token));
});

test("unknown, malformed and wrong-shape tokens are the generic 401", async () => {
  const { svc } = setup();
  for (const t of ["", "x", "a".repeat(43), "a".repeat(44), "{$ne:null}", "../../etc/passwd"]) expectFail(await svc.authenticate(t), "unauthorized");
});

test("cross-tenant mismatch is refused: the user row of another tenant (or a faulty store) never yields a principal (ISS-415, UA-27)", async () => {
  // the session row names tenant tA, but the user id exists only in tenant tB
  const a = setup([user({ _id: "u1", tenantId: "tB" })]);
  expectFail(await a.svc.authenticate((await a.svc.create("tA", "u1")).token), "unauthorized");
  // a lying store returns tB's user for a tA session: the explicit equality check still refuses
  const b = setup([user({ _id: "u1", tenantId: "tB" })], { lie: true });
  expectFail(await b.svc.authenticate((await b.svc.create("tA", "u1")).token), "unauthorized");
  // and the principal's tenant always comes from the matching rows, never from elsewhere
  const c = setup(); const ok = await c.svc.authenticate((await c.svc.create("tA", "u1")).token);
  assert.ok(ok.ok && ok.auth.tenantId === "tA");
});

test("the session id is not a bearer secret: a session _id or a family id as the token is refused", async () => {
  const { svc, mem } = setup();
  await svc.create("tA", "u1");
  const row = [...mem.rows.values()][0]!;
  for (const t of [row._id, row.familyId, row.tokenHash, row.tokenHash.slice(0, 43)]) expectFail(await svc.authenticate(t), "unauthorized");
});

test("status matrix: pending -> no scopes + notActive; disabled/rejected/unverified -> no principal; active without a role -> none (A3 #1)", async () => {
  const mk = (status: string, role?: string) => setup([user({ _id: "u1", tenantId: "tA", status: status as never, ...(role ? { role: role as never } : { role: undefined }) })]);
  const p = mk("pending"); const pend = await p.svc.authenticate((await p.svc.create("tA", "u1")).token);
  assert.ok(pend.ok); assert.deepEqual(pend.auth.scopes, []); assert.equal(pend.auth.notActive, true);
  for (const s of ["disabled", "rejected", "unverified"]) { const x = mk(s, "admin"); expectFail(await x.svc.authenticate((await x.svc.create("tA", "u1")).token), "session_revoked"); }
  const norole = mk("active"); expectFail(await norole.svc.authenticate((await norole.svc.create("tA", "u1")).token), "session_revoked");
  const bogus = mk("active", "root"); expectFail(await bogus.svc.authenticate((await bogus.svc.create("tA", "u1")).token), "session_revoked");
});

test("a role change applies on the very next request (A3 #7)", async () => {
  const s = setup(); const { token } = await s.svc.create("tA", "u1");
  assert.ok(!(await s.svc.authenticate(token) as { auth: { scopes: string[] } }).auth.scopes.includes("user-admin"));
  s.users.list[0]!.role = "admin";
  assert.ok((await s.svc.authenticate(token) as { auth: { scopes: string[] } }).auth.scopes.includes("user-admin"));
  s.users.list[0]!.role = "viewer";
  const v = await s.svc.authenticate(token) as { auth: { scopes: string[] } };
  assert.ok(!v.auth.scopes.includes("ingest"));
});

test("revoked session is 401 session_revoked on its next request (UA-19)", async () => {
  const s = setup(); const { token, session } = await s.svc.create("tA", "u1");
  assert.equal(await s.svc.revoke("tA", session._id, "admin"), true);
  expectFail(await s.svc.authenticate(token), "session_revoked");
  assert.equal(await s.svc.revoke("tB", session._id, "admin"), false, "another tenant cannot revoke it");
});

test("revokeAllForUser keeps the excepted session and revokes the rest", async () => {
  const s = setup(); const a = await s.svc.create("tA", "u1"), b = await s.svc.create("tA", "u1");
  assert.equal(await s.svc.revokeAllForUser("tA", "u1", "password_change", a.session._id), 1);
  assert.ok((await s.svc.authenticate(a.token)).ok); expectFail(await s.svc.authenticate(b.token), "session_revoked");
});

test("idle expiry: 365 d since lastUsedAt expires and revokes the row; activity keeps it alive (UA-13)", async () => {
  const s = setup(); const first = await s.svc.create("tA", "u1");
  s.clock.advance(IDLE_EXPIRY_MS - DAY);
  const a = await s.svc.authenticate(first.token); assert.ok(a.ok, "just inside the window");
  const token = a.ok && a.rotatedToken ? a.rotatedToken : first.token;
  s.clock.advance(IDLE_EXPIRY_MS - DAY);
  assert.ok((await s.svc.authenticate(token)).ok, "activity refreshed lastUsedAt, so a second near-year gap is still inside the window");
  const idle = setup(); const f = await idle.svc.create("tA", "u1");
  idle.clock.advance(IDLE_EXPIRY_MS + DAY);
  expectFail(await idle.svc.authenticate(f.token), "session_expired");
  assert.equal(idle.mem.rows.get(f.session._id)!.revokedReason, "idle_expired");
  expectFail(await idle.svc.authenticate(f.token), "session_revoked");
});

test("rotation after 24 h issues a new token; the old one works for the 30 s grace, then replay revokes the family and audits (A3 #4)", async () => {
  const s = setup(); const { token: t0, session } = await s.svc.create("tA", "u1");
  s.clock.advance(ROTATE_AFTER_MS - 1000);
  const early = await s.svc.authenticate(t0); assert.ok(early.ok && early.rotatedToken === undefined, "not yet due");
  s.clock.advance(2000);
  const due = await s.svc.authenticate(t0); assert.ok(due.ok && typeof due.rotatedToken === "string");
  const t1 = due.rotatedToken!;
  assert.notEqual(t1, t0);
  const row = s.mem.rows.get(session._id)!;
  assert.equal(row.tokenHash, sha256Hex(t1)); assert.equal(row.previousTokenHash, sha256Hex(t0)); assert.equal(row.familyId, session.familyId);
  // parallel tab still holding the old token: inside the grace it works and does not rotate again or fork the family
  s.clock.advance(ROTATION_GRACE_MS - 1000);
  const parallel = await s.svc.authenticate(t0); assert.ok(parallel.ok && parallel.rotatedToken === undefined);
  assert.ok((await s.svc.authenticate(t1)).ok);
  // after the grace the retired token is a replay
  s.clock.advance(2000);
  expectFail(await s.svc.authenticate(t0), "session_revoked");
  assert.ok(s.mem.rows.get(session._id)!.revokedAt);
  assert.equal(s.mem.rows.get(session._id)!.revokedReason, "reuse_detected");
  expectFail(await s.svc.authenticate(t1), "session_revoked");
  assert.deepEqual(s.events.map(([t, e]) => [t, (e as { type: string }).type, (e as { detail: string }).detail]), [["tA", "reuse_detected", "family_revoked"]]);
});

test("two simultaneous rotations: exactly one wins the compare-and-swap, the family is not forked (A3 #4)", async () => {
  const s = setup(); const { token, session } = await s.svc.create("tA", "u1");
  s.clock.advance(ROTATE_AFTER_MS + 1);
  const [x, y] = await Promise.all([s.svc.authenticate(token), s.svc.authenticate(token)]);
  assert.ok(x.ok && y.ok);
  assert.equal([x, y].filter((o) => o.ok && o.rotatedToken !== undefined).length, 1);
  assert.equal([...s.mem.rows.values()].length, 1);
  assert.equal(s.mem.rows.get(session._id)!.retiredTokenHashes!.length, 1);
});

test("a storage failure is 503 auth_unavailable, never treated as logged in", async () => {
  const mem = memorySessionStore();
  const broken: SessionStore = { ...mem.store, findByTokenHash: async () => { throw new Error("mongo down"); } };
  const s = setup(undefined, { store: broken });
  expectFail(await s.svc.authenticate("a".repeat(43)), "auth_unavailable", 503);
});

test("duplicate-email errors from any tenant map to one generic signup response (ISS-415 part 2)", () => {
  assert.equal(isDuplicateEmailError({ code: 11000, keyPattern: { emailNormalized: 1 }, keyValue: { emailNormalized: "x@y.z" } }), true);
  assert.equal(isDuplicateEmailError({ code: 11000, message: "E11000 duplicate key error collection: db.users index: emailNormalized_1 dup key" }), true);
  assert.equal(isDuplicateEmailError({ code: 11000, keyPattern: { tokenHash: 1 } }), false);
  for (const e of [null, undefined, "x", { code: 121 }, new Error("boom")]) assert.equal(isDuplicateEmailError(e), false);
  assert.deepEqual(GENERIC_SIGNUP_RESPONSE, { status: 202, body: { ok: true, next: "check_email" } });
});
