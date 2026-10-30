import assert from "node:assert/strict";
import test from "node:test";
import { createAuthService } from "./auth-service.js";
import { memoryAuthStore } from "./auth-service.testsupport.js";
import * as realPassword from "./password.js";
import { createSessionService } from "./sessions.js";
import { fakeClock, memorySessionStore } from "./sessions.testsupport.js";

const SECRET = "k".repeat(48), PW = "correct horse battery staple";
const log = (...a: unknown[]) => console.log("PROBE", ...a);
async function mk() {
  const clock = fakeClock(), mem = memorySessionStore();
  const a = memoryAuthStore({ now: clock.now, sessionRows: mem.rows });
  let verifies = 0, verifiesNull = 0, verifiesReal = 0;
  const password = { hash: realPassword.hash, verify: async (s: string | null | undefined, p: string) => { verifies++; if (s == null) verifiesNull++; else verifiesReal++; return realPassword.verify(s, p); }, needsRehash: realPassword.needsRehash };
  const sessions = createSessionService({ store: mem.store, users: { getUser: (t, id) => a.store.findUserById(t, id) }, now: clock.now });
  const service = createAuthService({ store: a.store, sessions, password, csrfSecret: SECRET, now: clock.now });
  const u = await a.store.insertUser("tA", { emailNormalized: "u@x.org", displayName: "U", passwordHash: await realPassword.hash(PW), status: "active", role: "member" }, clock.now());
  return { clock, a, service, u, mem, counts: () => ({ verifies, verifiesNull, verifiesReal }) };
}
const med = (xs: number[]) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]!;

test("Q1 timing: unknown vs wrong vs locked vs badshape, real argon2 (recorded, not asserted tight)", async () => {
  const m = await mk();
  const time = async (email: string, pw: string) => { const t = process.hrtime.bigint(); await m.service.login("tA", { email, password: pw }); return Number(process.hrtime.bigint() - t) / 1e6; };
  await time("u@x.org", "warmup warmup warmup"); await time("g@x.org", "warmup warmup warmup");
  const res: Record<string, number[]> = { unknown: [], wrong: [], badshape: [], locked: [] };
  for (let i = 0; i < 4; i++) { res.unknown!.push(await time(`g${i}@x.org`, "wrong wrong wrong")); res.badshape!.push(await time("notanemail", "wrong wrong wrong")); }
  // wrong (existing) – keep below lock threshold by clearing between
  for (let i = 0; i < 4; i++) { res.wrong!.push(await time("u@x.org", "wrong wrong wrong")); }
  await m.service.unlockEmail("tA", "u@x.org");
  for (let i = 0; i < 5; i++) await m.service.login("tA", { email: "lk@x.org", password: "wrong wrong wrong" });
  for (let i = 0; i < 4; i++) res.locked!.push(await time("lk@x.org", "wrong wrong wrong"));
  log("timing median ms", JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, +med(v).toFixed(1)]))));
  log("verify calls total / with null stored hash", JSON.stringify(m.counts()));
});

test("Q2 lockout schedule with fake clock: 5/15min, doubling, success clears, admin unlock clears, existing sessions unaffected", async () => {
  const m = await mk();
  const bad = (e = "u@x.org") => m.service.login("tA", { email: e, password: "wrong wrong wrong" });
  const good = () => m.service.login("tA", { email: "u@x.org", password: PW });
  const s0 = await good(); assert.equal(s0.status, 200);
  for (let i = 0; i < 4; i++) await bad(); assert.equal((await good()).status, 200, "4 failures + success OK"); // success clears
  for (let i = 0; i < 4; i++) await bad(); assert.equal((await good()).status, 200, "counter was cleared by success");
  for (let i = 0; i < 5; i++) await bad(); assert.equal((await good()).status, 401, "locked");
  m.clock.advance(14 * 60_000); assert.equal((await good()).status, 401, "still locked at 14 min");
  m.clock.advance(61_000); // lock over; do NOT log in (success would clear lockCount)
  for (let i = 0; i < 5; i++) await bad(); // second lock: 30 min
  m.clock.advance(29 * 60_000); assert.equal((await good()).status, 401, "second lock lasts 30 min (29 still locked)");
  m.clock.advance(61_000);
  for (let i = 0; i < 5; i++) await bad(); // third lock: 60 min
  m.clock.advance(59 * 60_000); assert.equal((await good()).status, 401, "third lock lasts 60 min");
  m.clock.advance(2 * 60_000); assert.equal((await good()).status, 200, "third lock over");
  for (let i = 0; i < 5; i++) await bad(); assert.equal((await good()).status, 401);
  assert.equal(await m.service.unlockEmail("tA", "u@x.org", "adm"), true); assert.equal((await good()).status, 200, "admin unlock");
  // a failure while locked changes nothing (hammering doesn't extend)
  for (let i = 0; i < 5; i++) await bad("h@x.org");
  const before = JSON.stringify([...m.a.throttles.values()].find((r) => r.lockedUntil && r.lockCount === 1));
  for (let i = 0; i < 20; i++) await bad("h@x.org");
  const after = JSON.stringify([...m.a.throttles.values()].find((r) => r.lockedUntil && r.lockCount === 1));
  assert.equal(before, after);
  // sliding window: 4 failures, 16 min pause, 4 more => no lock
  const m2 = await mk(); const bad2 = () => m2.service.login("tA", { email: "u@x.org", password: "wrong wrong wrong" });
  for (let i = 0; i < 4; i++) await bad2(); m2.clock.advance(16 * 60_000); for (let i = 0; i < 4; i++) await bad2();
  assert.equal((await m2.service.login("tA", { email: "u@x.org", password: PW })).status, 200, "window expiry: 4+4 across 16 min does not lock");
  // existing session unaffected by lock
  const m3 = await mk(); const s = await m3.service.login("tA", { email: "u@x.org", password: PW }); for (let i = 0; i < 5; i++) await m3.service.login("tA", { email: "u@x.org", password: "wrong wrong wrong" });
  assert.ok(s.sessionToken); const rows = [...m3.mem.rows.values()]; assert.equal(rows.filter((r) => !r.revokedAt).length, 1);
});

test("Q3 TOCTOU: parallel burst of wrong guesses before the lock lands (real argon2, in-memory CAS store)", async () => {
  const m = await mk();
  const N = 12;
  const before = m.counts().verifiesReal;
  const burst = await Promise.all(Array.from({ length: N }, (_, i) => m.service.login("tA", { email: "u@x.org", password: i === N - 1 ? PW : `wrong guess number ${i}` })));
  const verified = m.counts().verifiesReal - before;
  log("burst: statuses of correct-password request (last):", burst[N - 1]!.status, "total verifies run:", verified, "of", N);
  // sequential baseline
  const m2 = await mk(); const b2 = m2.counts().verifiesReal;
  for (let i = 0; i < N; i++) await m2.service.login("tA", { email: "u@x.org", password: `wrong guess number ${i}` });
  log("sequential: verifies run:", m2.counts().verifiesReal - b2, "of", N);
});

test("Q4 stale unverified: sweep at signup, verify of stale user fails, unverified older than 7d", async () => {
  const m = await mk();
  const r1 = await m.service.signup("tA", { email: "new@x.org", password: PW, displayName: "N" });
  const nu = [...m.a.users.values()].find((u) => u.emailNormalized === "new@x.org")!; assert.equal(nu.status, "unverified");
  const tok = (await m.service.issueToken("tA", "verify_email", nu._id, "adm"))!;
  m.clock.advance(7 * 24 * 3600_000 + 1000);
  const v = await m.service.verifyEmail("tA", tok.token); log("verify stale", v.status, JSON.stringify(v.body));
  assert.equal(v.status, 400);
  // re-signup by same address after >7d: swept first?
  const r2 = await m.service.signup("tA", { email: "new@x.org", password: PW, displayName: "N2" });
  log("re-signup after 7d", r2.status, "user rows with that email:", [...m.a.users.values()].filter((u) => u.emailNormalized === "new@x.org").map((u) => u.status).join(","));
  assert.equal(r1.status, r2.status);
  // second signup within the hour of the first sweep: stale user not swept yet?
  const m4 = await mk();
  await m4.service.signup("tA", { email: "old@x.org", password: PW, displayName: "O" });
  m4.clock.advance(1000); await m4.service.signup("tA", { email: "other@x.org", password: PW, displayName: "O" }); // triggers first sweep
  m4.clock.advance(7 * 24 * 3600_000 + 60_000);
  await m4.service.signup("tA", { email: "old@x.org", password: PW, displayName: "O2" }); // sweep is due again (>1h) so old@ gets swept, then re-created
  log("old@ rows after resignup:", [...m4.a.users.values()].filter((u) => u.emailNormalized === "old@x.org").map((u) => u.status + "@" + u.createdAt.slice(0, 10)).join(","));
  m4.clock.advance(60_000); await m4.service.signup("tA", { email: "old2@x.org", password: PW, displayName: "x" });
});

test("Q5 change-password lockout interplay + session-revoke exceptions; login with role-less active user", async () => {
  const m = await mk();
  const s = await m.service.login("tA", { email: "u@x.org", password: PW }); assert.equal(s.status, 200);
  const rows = [...m.mem.rows.values()]; const auth = { principal: "session", tenantId: "tA", userId: m.u._id, sessionId: rows[0]!._id, scopes: [], keyId: undefined } as never;
  for (let i = 0; i < 5; i++) { const r = await m.service.changePassword(auth, { currentPassword: "nope nope nope nope", newPassword: "brand new passphrase 12345" }); assert.equal(r.status, 403); }
  const g = await m.service.login("tA", { email: "u@x.org", password: PW }); log("login after 5 failed password-changes (session holder locks owner out):", g.status);
});
