// user-accounts A4 (D-206): the auth service against in-memory stores and a fake clock. Each test names the plan A4 acceptance item it proves.
// v1 sends NO mail (A5 dropped): verify / reset tokens are issued by an admin (`issueToken`) and redeemed here.
import assert from "node:assert/strict";
import test from "node:test";
import { csrfTokenFor } from "./csrf.js";
import { createAuthService, UNVERIFIED_MAX_AGE_MS } from "./auth-service.js";
import { fastHash, fastPassword, memoryAuthStore } from "./auth-service.testsupport.js";
import { createSessionService } from "./sessions.js";
import { fakeClock, memorySessionStore } from "./sessions.testsupport.js";
import { hashToken } from "./tokens.js";

const SECRET = "s".repeat(48), PW = "correct horse battery staple", PW2 = "another long passphrase 2026";
const META = { ipPrefix: "203.0.113.0/24", userAgentSummary: "Chrome on Windows" };

function rig(over: { cap?: number } = {}) {
  const clock = fakeClock(), mem = memorySessionStore(), password = fastPassword();
  const a = memoryAuthStore({ now: clock.now, sessionRows: mem.rows });
  const sessions = createSessionService({ store: mem.store, users: { getUser: (t, id) => a.store.findUserById(t, id) }, now: clock.now });
  const service = createAuthService({ store: a.store, sessions, password, csrfSecret: SECRET, now: clock.now, signupDailyCap: over.cap ?? 200 });
  const seed = async (tenant: string, email: string, o: { status?: "unverified" | "pending" | "active" | "rejected" | "disabled"; role?: "admin" | "member" | "viewer" | null; pw?: string; old?: boolean } = {}) => {
    const status = o.status ?? "active";
    return a.store.insertUser(tenant, { emailNormalized: email, displayName: "Seed", passwordHash: fastHash(o.pw ?? PW, o.old), status, role: o.role === undefined ? (status === "active" ? "member" : null) : o.role }, clock.now());
  };
  const types = () => a.events.map((e) => e.type);
  return { clock, mem, a, password, sessions, service, seed, types };
}
const BAD = { status: 401, body: { error: "invalid_credentials", message: "invalid email or password" } };

test("A4 #1 signup: new and existing email give a byte-equal response; both hash; only one user exists; cross-tenant duplicate is the same response", async () => {
  const r = rig();
  const fresh = await r.service.signup("tA", { email: "New@Example.org ", password: PW, displayName: "New" }, META);
  const again = await r.service.signup("tA", { email: "new@example.org", password: PW2, displayName: "Other" }, META);
  assert.equal(fresh.status, 202); assert.equal(again.status, 202);
  assert.equal(JSON.stringify(fresh.body), JSON.stringify(again.body)); assert.equal(fresh.sessionToken, undefined);
  assert.equal(r.a.users.size, 1); const u = [...r.a.users.values()][0]!;
  assert.equal(u.status, "unverified"); assert.equal(u.role, undefined); assert.equal(u.emailNormalized, "new@example.org"); assert.equal(u.tenantId, "tA");
  assert.ok(!JSON.stringify(u).includes(PW) && u.passwordHash.startsWith("$argon2id$"), "only a PHC hash is stored");
  assert.equal(r.password.calls.hash.length, 2, "the existing-email path hashes too (timing parity)");
  await r.seed("tB", "tb-only@example.org");
  const cross = await r.service.signup("tA", { email: "tb-only@example.org", password: PW, displayName: "X" }, META);
  assert.equal(JSON.stringify(cross.body), JSON.stringify(fresh.body)); assert.equal(cross.status, 202);
  assert.equal([...r.a.users.values()].filter((x) => x.tenantId === "tA").length, 1, "no tenant-A row for an address held in tenant B");
});

test("A4 #1 signup: invalid email / displayName / policy-failing password are 400 and create nothing; role/status can never be supplied", async () => {
  const r = rig();
  for (const bad of [{ email: "nope", password: PW, displayName: "x" }, { email: "a@b.org", password: "short", displayName: "x" }, { email: "a@b.org", password: PW, displayName: "" },
    { email: "a@b.org", password: PW, displayName: "x".repeat(101) }, { email: "mel@b.org", password: "mel-mel-mel-mel", displayName: "x" }, { email: "a@b.org", password: "password1234", displayName: "x" }]) {
    const res = await r.service.signup("tA", bad as never, META);
    assert.equal(res.status, 400, JSON.stringify(bad)); assert.equal((res.body as { error: string }).error, "invalid_request");
  }
  assert.equal(r.a.users.size, 0);
  await r.service.signup("tA", { email: "x@y.org", password: PW, displayName: "X", role: "admin", status: "active" } as never, META);
  const u = [...r.a.users.values()][0]!; assert.equal(u.status, "unverified"); assert.equal(u.role, undefined);
});

test("A4 #8 signup: global daily cap -> 429 signup_capacity (before any lookup); per-email limit 3/h -> 429 rate_limited", async () => {
  const r = rig({ cap: 2 });
  assert.equal((await r.service.signup("tA", { email: "a@x.org", password: PW, displayName: "A" }, META)).status, 202);
  assert.equal((await r.service.signup("tA", { email: "b@x.org", password: PW, displayName: "B" }, META)).status, 202);
  const capped = await r.service.signup("tA", { email: "c@x.org", password: PW, displayName: "C" }, META);
  assert.deepEqual([capped.status, (capped.body as { error: string }).error], [429, "signup_capacity"]);
  const exists = await r.service.signup("tA", { email: "a@x.org", password: PW, displayName: "A" }, META);
  assert.equal((exists.body as { error: string }).error, "signup_capacity", "the cap answers the same for an existing and a new address");
  r.clock.advance(25 * 3600_000);
  assert.equal((await r.service.signup("tA", { email: "c@x.org", password: PW, displayName: "C" }, META)).status, 202, "the cap is a rolling 24 h count");
  const r2 = rig();
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) codes.push((await r2.service.signup("tA", { email: "same@x.org", password: PW, displayName: "S" }, META)).status);
  assert.deepEqual(codes, [202, 202, 202, 429]);
  r2.clock.advance(3600_001);
  assert.equal((await r2.service.signup("tA", { email: "same@x.org", password: PW, displayName: "S" }, META)).status, 202);
});

test("A4 #2 verify: an admin-issued token moves unverified -> pending exactly once; reuse / expired / wrong purpose / junk give the same 400", async () => {
  const r = rig();
  const u = await r.seed("tA", "v@x.org", { status: "unverified", role: null });
  const t1 = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!;
  assert.equal(hashToken(t1.token) !== null, true); assert.ok(!JSON.stringify(r.a.tokens).includes(t1.token), "the raw token is never stored");
  const ok = await r.service.verifyEmail("tA", t1.token, META);
  assert.equal(ok.status, 200); assert.equal(r.a.users.get(u._id)!.status, "pending"); assert.ok(r.a.users.get(u._id)!.emailVerifiedAt);
  const INVALID = { status: 400, body: { error: "invalid_token", message: "this link is invalid or has expired" } };
  assert.deepEqual(await r.service.verifyEmail("tA", t1.token, META), INVALID, "reuse");
  const u2 = await r.seed("tA", "v2@x.org", { status: "unverified", role: null });
  const old = (await r.service.issueToken("tA", "verify_email", u2._id, "admin-1"))!;
  r.clock.advance(24 * 3600_000 + 1);
  assert.deepEqual(await r.service.verifyEmail("tA", old.token, META), INVALID, "expired");
  const u3 = await r.seed("tA", "v3@x.org", { status: "unverified", role: null });
  const reset = (await r.service.issueToken("tA", "password_reset", u3._id, "admin-1"))!;
  assert.deepEqual(await r.service.verifyEmail("tA", reset.token, META), INVALID, "wrong purpose");
  assert.equal(r.a.users.get(u3._id)!.status, "unverified");
  assert.deepEqual(await r.service.verifyEmail("tA", "not-a-token", META), INVALID, "junk");
  assert.deepEqual(await r.service.verifyEmail("tB", reset.token, META), INVALID, "another tenant");
  const act = await r.seed("tA", "act@x.org"); const tk = (await r.service.issueToken("tA", "verify_email", act._id, "admin-1"))!;
  assert.deepEqual(await r.service.verifyEmail("tA", tk.token, META), INVALID, "a non-unverified account is not moved");
  assert.equal(r.a.users.get(act._id)!.status, "active");
});

test("A4 #2 unverified accounts older than 7 days are swept and cannot verify", async () => {
  const r = rig();
  const stale = await r.seed("tA", "stale@x.org", { status: "unverified", role: null });
  r.clock.advance(UNVERIFIED_MAX_AGE_MS + 1000);
  const fresh = await r.seed("tA", "fresh@x.org", { status: "unverified", role: null });
  const pend = await r.seed("tA", "pend@x.org", { status: "pending", role: null });
  const tk = (await r.service.issueToken("tA", "verify_email", stale._id, "admin-1"))!;
  assert.equal((await r.service.verifyEmail("tA", tk.token, META)).status, 400, "a stale unverified account cannot be verified");
  assert.equal(await r.service.sweepUnverified("tA"), 1);
  assert.deepEqual([...r.a.users.keys()].sort(), [fresh._id, pend._id].sort());
  assert.equal(r.service.isStaleUnverified({ status: "unverified", createdAt: new Date(r.clock.now().getTime() - UNVERIFIED_MAX_AGE_MS - 1).toISOString() }), true);
});

test("A4 #3 login: unknown email and wrong password are the same 401 and both run a full verify; invalid email shape too", async () => {
  const r = rig(); await r.seed("tA", "real@x.org");
  const wrong = await r.service.login("tA", { email: "real@x.org", password: "wrong wrong wrong" }, META);
  const unknown = await r.service.login("tA", { email: "ghost@x.org", password: "wrong wrong wrong" }, META);
  const junk = await r.service.login("tA", { email: "not an email", password: "wrong wrong wrong" }, META);
  for (const x of [wrong, unknown, junk]) assert.deepEqual({ status: x.status, body: x.body }, BAD);
  assert.equal(r.password.calls.verify.length, 3, "a verify ran for every failure");
  assert.ok(r.password.calls.verify[0]!.stored, "wrong password verified against the real hash"); assert.equal(r.password.calls.verify[1]!.stored ?? null, null, "unknown email ran the verify against the dummy path");
  assert.equal(wrong.sessionToken, undefined); assert.equal(r.mem.rows.size, 0);
});

test("A4 #3 login: active gets a session + csrf token; pending gets a ZERO-scope session; rejected / disabled / unverified get state only and no session", async () => {
  const r = rig(); const inserted: Array<{ tokenHash: string; userId: string; ipPrefix?: string; userAgentSummary?: string }> = [];
  const insert = r.mem.store.insert; r.mem.store.insert = (t, input, now) => { inserted.push(input); return insert(t, input, now); };
  await r.seed("tA", "act@x.org", { role: "admin" }); await r.seed("tA", "pen@x.org", { status: "pending", role: null });
  await r.seed("tA", "rej@x.org", { status: "rejected", role: null }); await r.seed("tA", "dis@x.org", { status: "disabled", role: "member" }); await r.seed("tA", "unv@x.org", { status: "unverified", role: null });
  const act = await r.service.login("tA", { email: "ACT@x.org", password: PW }, META);
  assert.equal(act.status, 200); assert.ok(act.sessionToken);
  const b = act.body as { state: string; user: { id: string; displayName: string; role: string }; csrfToken: string };
  assert.equal(b.state, "active"); assert.equal(b.user.role, "admin"); assert.equal("passwordHash" in b.user, false);
  const auth = await r.sessions.authenticate(act.sessionToken!);
  assert.ok(auth.ok); if (auth.ok) { assert.equal(b.csrfToken, csrfTokenFor(auth.session._id, SECRET)); assert.ok(auth.auth.scopes.includes("user-admin")); assert.deepEqual(inserted[0], { userId: auth.session.userId, tokenHash: inserted[0]!.tokenHash, ...META }, "request meta reaches the session row"); }
  const pen = await r.service.login("tA", { email: "pen@x.org", password: PW }, META);
  assert.equal((pen.body as { state: string }).state, "pending"); assert.ok(pen.sessionToken);
  const pa = await r.sessions.authenticate(pen.sessionToken!);
  assert.ok(pa.ok); if (pa.ok) { assert.deepEqual(pa.auth.scopes, []); assert.equal(pa.auth.notActive, true); }
  const before = r.mem.rows.size;
  for (const [email, state] of [["rej@x.org", "rejected"], ["dis@x.org", "disabled"], ["unv@x.org", "unverified"]] as const) {
    const x = await r.service.login("tA", { email, password: PW }, META);
    assert.equal(x.status, 200); assert.deepEqual(x.body, { state }); assert.equal(x.sessionToken, undefined, state);
    const wrong = await r.service.login("tA", { email, password: "nope nope nope nope" }, META);
    assert.deepEqual({ status: wrong.status, body: wrong.body }, BAD, "the status is revealed only after the password verified");
  }
  assert.equal(r.mem.rows.size, before, "no session for rejected / disabled / unverified");
});

test("A4 #3 login success rehashes an old hash and stamps lastLoginAt", async () => {
  const r = rig(); const u = await r.seed("tA", "old@x.org", { old: true });
  const res = await r.service.login("tA", { email: "old@x.org", password: PW }, META);
  assert.equal(res.status, 200); const row = r.a.users.get(u._id)!;
  assert.equal(row.passwordHash, fastHash(PW)); assert.ok(row.lastLoginAt);
});

test("A4 #4 lockout: 5 failures lock the email 15 min, a never-registered one too; same 401 body; correct password refused while locked; success clears; admin unlock clears", async () => {
  const r = rig(); await r.seed("tA", "lock@x.org");
  const bad = (email: string) => r.service.login("tA", { email, password: "wrong wrong wrong" }, META);
  for (let i = 0; i < 4; i++) assert.equal((await bad("lock@x.org")).status, 401);
  const fifth = await bad("lock@x.org");
  assert.deepEqual({ status: fifth.status, body: fifth.body }, BAD, "the 5th failure answers exactly like the first four");
  const lockedBody = await r.service.login("tA", { email: "lock@x.org", password: PW }, META);
  assert.deepEqual({ status: lockedBody.status, body: lockedBody.body }, BAD, "correct password while locked: same 401, no Retry-After info");
  assert.equal(lockedBody.sessionToken, undefined);
  const callsBefore = r.password.calls.verify.length;
  await r.service.login("tA", { email: "lock@x.org", password: PW }, META);
  assert.equal(r.password.calls.verify.length, callsBefore + 1, "a locked attempt still costs a full verify (no timing tell)");
  for (let i = 0; i < 5; i++) await bad("never@x.org");
  const ghost = await r.service.login("tA", { email: "never@x.org", password: PW }, META);
  assert.deepEqual({ status: ghost.status, body: ghost.body }, BAD); assert.equal(r.types().filter((t) => t === "locked").length, 2, "a never-registered email locks too");
  r.clock.advance(15 * 60_000 - 1000); assert.equal((await r.service.login("tA", { email: "lock@x.org", password: PW }, META)).status, 401, "still locked just before 15 min");
  r.clock.advance(2000); assert.equal((await r.service.login("tA", { email: "lock@x.org", password: PW }, META)).status, 200, "unlocked after 15 min");
  // success cleared the row: four more failures do not lock
  for (let i = 0; i < 4; i++) await bad("lock@x.org");
  assert.equal((await r.service.login("tA", { email: "lock@x.org", password: PW }, META)).status, 200, "a success clears the counter");
  // admin unlock
  for (let i = 0; i < 5; i++) await bad("lock@x.org");
  assert.equal((await r.service.login("tA", { email: "lock@x.org", password: PW }, META)).status, 401);
  assert.equal(await r.service.unlockEmail("tA", "LOCK@x.org", "admin-1"), true);
  assert.equal((await r.service.login("tA", { email: "lock@x.org", password: PW }, META)).status, 200, "admin unlock clears the lock");
  assert.equal(r.a.events.filter((e) => e.type === "unlocked").length, 1);
  assert.equal(await r.service.unlockEmail("tA", "not an email", "admin-1"), false);
});

test("A4 #4 a lock does not end existing sessions; the second lock lasts 30 min", async () => {
  const r = rig(); await r.seed("tA", "keep@x.org");
  const s = await r.service.login("tA", { email: "keep@x.org", password: PW }, META);
  const bad = () => r.service.login("tA", { email: "keep@x.org", password: "wrong wrong wrong" }, META);
  for (let i = 0; i < 5; i++) await bad();
  assert.equal((await r.sessions.authenticate(s.sessionToken!)).ok, true, "existing session unaffected");
  r.clock.advance(15 * 60_000 + 1000);
  for (let i = 0; i < 5; i++) await bad();
  r.clock.advance(15 * 60_000 + 1000); assert.equal((await r.service.login("tA", { email: "keep@x.org", password: PW }, META)).status, 401, "30 min second lock");
  r.clock.advance(15 * 60_000); assert.equal((await r.service.login("tA", { email: "keep@x.org", password: PW }, META)).status, 200);
});

test("A4 #5 reset: forgot is always the same 202; an admin-issued token is single use; success revokes ALL sessions; rejected / disabled are refused generically", async () => {
  const r = rig(); const u = await r.seed("tA", "re@x.org");
  const known = await r.service.forgotPassword("tA", "re@x.org"), unknown = await r.service.forgotPassword("tA", "ghost@x.org"), junk = await r.service.forgotPassword("tA", "###");
  for (const x of [known, unknown, junk]) assert.equal(x.status, 202);
  assert.equal(JSON.stringify(known.body), JSON.stringify(unknown.body)); assert.equal(JSON.stringify(known.body), JSON.stringify(junk.body));
  const s1 = await r.service.login("tA", { email: "re@x.org", password: PW }, META), s2 = await r.service.login("tA", { email: "re@x.org", password: PW }, META);
  const tk = (await r.service.issueToken("tA", "password_reset", u._id, "admin-1"))!;
  const res = await r.service.resetPassword("tA", { token: tk.token, newPassword: PW2 }, META);
  assert.equal(res.status, 200); assert.equal(r.a.users.get(u._id)!.passwordHash, fastHash(PW2)); assert.ok(r.a.users.get(u._id)!.passwordChangedAt);
  for (const s of [s1, s2]) { const a = await r.sessions.authenticate(s.sessionToken!); assert.equal(a.ok, false); if (!a.ok) assert.equal(a.code, "session_revoked"); }
  const again = await r.service.resetPassword("tA", { token: tk.token, newPassword: "yet another passphrase 33" }, META);
  assert.deepEqual({ status: again.status, body: again.body }, { status: 400, body: { error: "invalid_token", message: "this link is invalid or has expired" } });
  assert.equal(r.a.users.get(u._id)!.passwordHash, fastHash(PW2), "a replayed token changes nothing");
  assert.equal((await r.service.login("tA", { email: "re@x.org", password: PW2 }, META)).status, 200);
  for (const status of ["rejected", "disabled"] as const) {
    const x = await r.seed("tA", `${status}@x.org`, { status, role: null }); const t = (await r.service.issueToken("tA", "password_reset", x._id, "admin-1"))!;
    const out = await r.service.resetPassword("tA", { token: t.token, newPassword: PW2 }, META);
    assert.equal(out.status, 400); assert.equal((out.body as { error: string }).error, "invalid_token"); assert.equal(r.a.users.get(x._id)!.passwordHash, fastHash(PW));
  }
  const pend = await r.seed("tA", "pending@x.org", { status: "pending", role: null }); const pt = (await r.service.issueToken("tA", "password_reset", pend._id, "admin-1"))!;
  assert.equal((await r.service.resetPassword("tA", { token: pt.token, newPassword: PW2 }, META)).status, 200, "pending users may reset");
});

test("A4 #5 reset: a policy failure does not burn the token; expired and wrong-purpose tokens are the generic 400", async () => {
  const r = rig(); const u = await r.seed("tA", "pol@x.org");
  const tk = (await r.service.issueToken("tA", "password_reset", u._id, "admin-1"))!;
  assert.equal((await r.service.resetPassword("tA", { token: tk.token, newPassword: "short" }, META)).status, 400);
  assert.equal((await r.service.resetPassword("tA", { token: tk.token, newPassword: "pol-pol-pol-pol-pol" }, META)).status, 400, "contains the email local part");
  assert.equal((await r.service.resetPassword("tA", { token: tk.token, newPassword: PW2 }, META)).status, 200, "the token survived two policy failures");
  const t2 = (await r.service.issueToken("tA", "password_reset", u._id, "admin-1"))!; r.clock.advance(3600_001);
  assert.equal((await r.service.resetPassword("tA", { token: t2.token, newPassword: PW }, META)).status, 400, "reset tokens last 1 h");
  const v = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!;
  assert.equal((await r.service.resetPassword("tA", { token: v.token, newPassword: PW }, META)).status, 400, "a verify token cannot reset");
});

test("A4 #6 change password: wrong current is refused and counted; success revokes OTHER sessions only", async () => {
  const r = rig(); const u = await r.seed("tA", "chg@x.org");
  const a = await r.service.login("tA", { email: "chg@x.org", password: PW }, META), b = await r.service.login("tA", { email: "chg@x.org", password: PW }, META);
  const authA = (await r.sessions.authenticate(a.sessionToken!)); assert.ok(authA.ok); if (!authA.ok) return;
  const wrong = await r.service.changePassword(authA.auth, { currentPassword: "not my password!!", newPassword: PW2 }, META);
  assert.equal(wrong.status, 403); assert.equal((wrong.body as { error: string }).error, "invalid_credentials"); assert.equal(r.a.users.get(u._id)!.passwordHash, fastHash(PW));
  assert.equal((await r.service.changePassword(authA.auth, { currentPassword: PW, newPassword: "short" }, META)).status, 400);
  assert.equal(r.a.users.get(u._id)!.passwordHash, fastHash(PW));
  const ok = await r.service.changePassword(authA.auth, { currentPassword: PW, newPassword: PW2 }, META);
  assert.equal(ok.status, 200); assert.equal(r.a.users.get(u._id)!.passwordHash, fastHash(PW2));
  assert.equal((await r.sessions.authenticate(a.sessionToken!)).ok, true, "the current session survives");
  const gone = await r.sessions.authenticate(b.sessionToken!); assert.equal(gone.ok, false);
  for (let i = 0; i < 5; i++) await r.service.changePassword(authA.auth, { currentPassword: "wrong wrong wrong", newPassword: PW }, META);
  const locked = await r.service.changePassword(authA.auth, { currentPassword: PW2, newPassword: PW }, META);
  assert.equal(locked.status, 403, "wrong current-password guesses count toward the same lockout");
});

test("A4 #7 logout / logout-all / session list / revoke-own: the right rows are revoked, another user's session id is 404", async () => {
  const r = rig(); const u = await r.seed("tA", "me@x.org"); await r.seed("tA", "other@x.org");
  const l = async (e: string) => r.service.login("tA", { email: e, password: PW }, META);
  const s1 = await l("me@x.org"), s2 = await l("me@x.org"), s3 = await l("me@x.org"), o = await l("other@x.org");
  const au = async (s: { sessionToken?: string }) => { const x = await r.sessions.authenticate(s.sessionToken!); assert.ok(x.ok); return (x as { ok: true; auth: import("../auth.js").VerifiedKey; session: { _id: string } }); };
  const a1 = await au(s1), a2 = await au(s2), ao = await au(o);
  const listed = await r.service.listSessions(a1.auth); const rows = (listed.body as { sessions: Array<Record<string, unknown>> }).sessions;
  assert.equal(rows.length, 3); assert.equal(rows.filter((x) => x.current).length, 1); assert.ok(rows.every((x) => !("tokenHash" in x) && !("familyId" in x)));
  assert.deepEqual((await r.service.revokeOwnSession(a1.auth, ao.session._id, META)).status, 404, "another user's session id never resolves");
  assert.equal((await r.service.revokeOwnSession(a1.auth, "no-such-id", META)).status, 404);
  assert.equal((await r.sessions.authenticate(o.sessionToken!)).ok, true);
  assert.equal((await r.service.revokeOwnSession(a1.auth, a2.session._id, META)).status, 200);
  assert.equal((await r.sessions.authenticate(s2.sessionToken!)).ok, false); assert.equal((await r.sessions.authenticate(s1.sessionToken!)).ok, true);
  const out = await r.service.logout(a1.auth, META); assert.equal(out.status, 200); assert.equal(out.clearCookie, true);
  assert.equal((await r.sessions.authenticate(s1.sessionToken!)).ok, false); assert.equal((await r.sessions.authenticate(s3.sessionToken!)).ok, true, "logout ends only the current session");
  const s4 = await l("me@x.org"), a4 = await au(s4);
  assert.equal((await r.service.logoutAll(a4.auth, META)).clearCookie, true);
  for (const s of [s3, s4]) assert.equal((await r.sessions.authenticate(s.sessionToken!)).ok, false);
  assert.equal((await r.sessions.authenticate(o.sessionToken!)).ok, true, "logout-all touches only this user");
  assert.ok(u);
});

test("A4 #9 every transition writes exactly one auth_events row with a closed-vocabulary detail; no row holds a password, token, cookie or raw email", async () => {
  const r = rig(); const n = () => r.a.events.length;
  const step = async (fn: () => Promise<unknown>, type: string, outcome?: string) => { const b = n(); await fn(); assert.equal(n() - b, 1, `${type}: exactly one row`); const e = r.a.events.at(-1)!; assert.equal(e.type, type); if (outcome) assert.equal(e.outcome, outcome); };
  await step(() => r.service.signup("tA", { email: "evt@x.org", password: PW, displayName: "E" }, META), "signup", "ok");
  await step(() => r.service.signup("tA", { email: "evt@x.org", password: PW, displayName: "E" }, META), "signup");
  const u = [...r.a.users.values()][0]!;
  let tk!: { token: string }; await step(async () => { tk = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!; }, "link_issued", "ok");
  await step(() => r.service.verifyEmail("tA", tk.token, META), "email_verified", "ok");
  await step(() => r.service.verifyEmail("tA", tk.token, META), "email_verified", "failed");
  await r.a.store.updateUser("tA", u._id, { status: "active", role: "member" });
  await step(() => r.service.login("tA", { email: "evt@x.org", password: "wrong wrong wrong" }, META), "login_failed", "failed");
  let login!: Awaited<ReturnType<typeof r.service.login>>; await step(async () => { login = await r.service.login("tA", { email: "evt@x.org", password: PW }, META); }, "login_ok", "ok");
  const au = await r.sessions.authenticate(login.sessionToken!); assert.ok(au.ok); if (!au.ok) return;
  const rt = (await r.service.issueToken("tA", "password_reset", u._id, "admin-1"))!;
  await step(() => r.service.changePassword(au.auth, { currentPassword: PW, newPassword: PW2 }, META), "password_changed", "ok");
  await step(() => r.service.resetPassword("tA", { token: rt.token, newPassword: "third long passphrase 99" }, META), "password_reset", "ok");
  const l2 = await r.service.login("tA", { email: "evt@x.org", password: "third long passphrase 99" }, META); const au2 = await r.sessions.authenticate(l2.sessionToken!); assert.ok(au2.ok); if (!au2.ok) return;
  const l3 = await r.service.login("tA", { email: "evt@x.org", password: "third long passphrase 99" }, META); const au3 = await r.sessions.authenticate(l3.sessionToken!); assert.ok(au3.ok); if (!au3.ok) return;
  await step(() => r.service.revokeOwnSession(au2.auth, au3.session._id, META), "session_revoked", "ok");
  await step(() => r.service.logout(au2.auth, META), "logout", "ok");
  const lockB = n(); for (let i = 0; i < 5; i++) await r.service.login("tA", { email: "ghost@x.org", password: "wrong wrong wrong" }, META);
  assert.equal(n() - lockB, 6, "five login_failed rows plus one locked row"); assert.equal(r.a.events.at(-1)!.type, "locked");
  await step(() => r.service.unlockEmail("tA", "ghost@x.org", "admin-1"), "unlocked", "ok");
  const dump = JSON.stringify(r.a.events);
  for (const secret of [PW, PW2, "third long passphrase 99", tk.token, rt.token, login.sessionToken!, l2.sessionToken!, "evt@x.org", "ghost@x.org", "wrong wrong wrong", "passwordHash", "cookie"]) assert.ok(!dump.includes(secret), `no audit row contains ${secret.slice(0, 6)}...`);
  assert.ok(r.a.events.every((e) => !e.subjectHash || /^[0-9a-f]{64}$/.test(e.subjectHash)));
  assert.ok(r.a.events.some((e) => e.subjectHash), "unknown-account events carry a salted hash instead of the address");
});

test("A4 issueToken (for A6): unknown user -> null; an invalid user id cannot mint; the token verifies only for its purpose", async () => {
  const r = rig();
  assert.equal(await r.service.issueToken("tA", "verify_email", "nobody", "admin-1"), null);
  const u = await r.seed("tA", "tk@x.org", { status: "unverified", role: null });
  assert.equal(await r.service.issueToken("tB", "verify_email", u._id, "admin-1"), null, "another tenant's user is invisible");
  const t = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!;
  assert.ok(Date.parse(t.expiresAt) - r.clock.now().getTime() === 24 * 3600_000);
  assert.equal(r.a.tokens[0]!.issuedVia, "admin"); assert.equal(r.a.tokens[0]!.issuedBy, "admin-1");
});
