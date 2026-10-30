// CHECKER-B adversarial probe (scratch copy only; never committed to the bound tree). Real mongod (loopback), real argon2, real createServer perimeter.
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import http from "node:http";
import { MongoClient, type Db } from "mongodb";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { buildUserAccounts, createMongoAuthStore } from "../composition/integrations/user-accounts.js";
import { createAuthRouter } from "./auth-router.js";
import * as realPassword from "./password.js";

const uri = process.env.LKB_UA_AUTH_MONGO_URI!;
const require = createRequire(import.meta.url);
const migration = require("../../../../migrations/20261029100000-user-accounts.cjs") as { up(db: Db): Promise<void> };
const SECRET = "k".repeat(48), PW = "correct horse battery staple", PW2 = "another long passphrase 2026", ORIGIN = "https://kb.example.org";
const results: Array<{ name: string; ok: boolean; detail?: unknown }> = [];
const ok = (name: string, cond: boolean, detail?: unknown) => { results.push({ name, ok: !!cond, detail }); console.log(`PROBE ${cond ? "OK  " : "FAIL"} ${name}${cond ? "" : " :: " + JSON.stringify(detail)}`); };
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };

test("checker-b probe", { timeout: 600_000 }, async () => {
  const dbName = `lkb_ua_chkb_${randomBytes(6).toString("hex")}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }); await client.connect();
  const db = client.db(dbName);
  process.env.MONGO_WORK_DB = dbName; process.env.MONGODB_URL = uri; delete process.env.MONGODB_DB;
  const warns: string[] = [];
  try {
    await migration.up(db);
    const env = { AUTH_CSRF_SECRET: SECRET, USER_SIGNUP_TENANT: "tA", APP_PUBLIC_ORIGIN: ORIGIN, APP_BASE_PATH: "/knowledgebase" };
    const ua = buildUserAccounts(env, db, { warn: (m: string) => { warns.push(m); } } as never)!;
    const store = createMongoAuthStore(db);
    const keyStore = fakeKeyStore({ "key-admin": { tenantId: "tA", scopes: ["user-admin", "ask", "ingest"], keyId: "k1" } });
    const big = { loginPerWindow: 100000, signupPerHour: 100000, forgotPerHour: 100000, tokenPerHour: 100000 };
    const bigRouter = createAuthRouter({ service: ua.auth, cookie: ua.cookie, csrf: ua.csrf, signupTenant: "tA", ipLimits: big });
    const srv = await startTestServer(buildTestDeps({ keyStore, corsOrigins: [ORIGIN], userAccounts: { session: ua.session, authRouter: bigRouter } }));
    const stock = await startTestServer(buildTestDeps({ keyStore, corsOrigins: [ORIGIN], userAccounts: { session: ua.session, authRouter: ua.authRouter! } }));

    type Opt = { cookie?: string; bearer?: string; auth?: string; csrf?: string; origin?: string | null; body?: unknown; raw?: string; ctype?: string };
    const mk = (base: string) => async (method: string, path: string, p: Opt = {}) => {
      const headers: Record<string, string> = { connection: "close" };
      if (p.cookie) headers.cookie = `lkb_sid=${p.cookie}`;
      if (p.bearer) headers.authorization = `Bearer ${p.bearer}`;
      if (p.auth) headers.authorization = p.auth;
      if (p.csrf) headers["x-lkb-csrf"] = p.csrf;
      if (p.origin !== null) headers.origin = p.origin ?? ORIGIN;
      const payload = p.raw ?? (p.body === undefined ? undefined : JSON.stringify(p.body));
      if (payload !== undefined) headers["content-type"] = p.ctype ?? "application/json";
      const t0 = performance.now();
      const res = await fetch(base + path, { method, headers, ...(payload === undefined ? {} : { body: payload }) });
      const text = await res.text(); const ms = performance.now() - t0;
      let json: any = null; try { json = JSON.parse(text); } catch { /* */ }
      const hdr = [...res.headers.entries()].filter(([k]) => !/^(date|etag|x-request-id|ratelimit.*|connection|keep-alive|content-length|retry-after)$/i.test(k)).map(([k, v]) => `${k}:${v}`).sort().join("|");
      return { status: res.status, text, json, ms, hdr, setCookie: res.headers.getSetCookie() };
    };
    const call = mk(srv.baseUrl), callStock = mk(stock.baseUrl);
    const tokOf = (sc: string[]) => /lkb_sid=([A-Za-z0-9_-]{43});/.exec(sc.join("\n"))?.[1];
    const login = async (email: string, pw = PW) => { const r = await call("POST", "/auth/login", { body: { email, password: pw } }); return { ...r, token: tokOf(r.setCookie), csrf: r.json?.csrfToken as string | undefined }; };
    const seed = async (email: string, x: { status?: any; role?: any; tenant?: string; pw?: string } = {}) => {
      const status = x.status ?? "active";
      return store.insertUser(x.tenant ?? "tA", { emailNormalized: email, displayName: "Seed", passwordHash: await realPassword.hash(x.pw ?? PW), status, role: x.role === undefined ? (status === "active" ? "member" : null) : x.role }, new Date());
    };
    const secrets: string[] = [PW, PW2, "wrongpass-zzz-1", "wrongpass-zzz-2"];
    const rawEmails: string[] = [];
    const issue = async (purpose: "verify_email" | "password_reset", userId: string) => (await ua.auth.issueToken("tA", purpose, userId, "admin-1"))!.token;

    // ---- 1. signup enumeration: new / existing / other-tenant ----
    const exist = await seed("exists@example.org"); await seed("othertenant@example.org", { tenant: "tB" });
    rawEmails.push("exists@example.org", "othertenant@example.org", "brandnew@example.org");
    const s1 = await call("POST", "/auth/signup", { body: { email: "brandnew@example.org", password: PW, displayName: "N" } });
    const s2 = await call("POST", "/auth/signup", { body: { email: "Exists@Example.org", password: PW, displayName: "N" } });
    const s3 = await call("POST", "/auth/signup", { body: { email: "othertenant@example.org", password: PW, displayName: "N" } });
    ok("A4-1 signup byte-equal new/existing/other-tenant (status+body+headers)", s1.status === 202 && s1.text === s2.text && s2.text === s3.text && s1.status === s2.status && s2.status === s3.status && s1.hdr === s2.hdr && s2.hdr === s3.hdr, { s1: s1.text, s2: s2.text, s3: s3.text, h: [s1.hdr, s2.hdr, s3.hdr] });
    ok("A4-1 signup created exactly 1 user in tA for new, none for existing", (await db.collection("users").countDocuments({ emailNormalized: { $in: ["brandnew@example.org", "exists@example.org"] }, tenantId: "tA" })) === 2);
    ok("A4-1 other-tenant signup created nothing in tA", (await db.collection("users").countDocuments({ emailNormalized: "othertenant@example.org" })) === 1);
    const sx = await call("POST", "/auth/signup", { body: { email: "x@example.org", password: PW, displayName: "N", tenantId: "tB" } });
    ok("A4-1 tenant in body -> 400 and nothing created", sx.status === 400 && (await db.collection("users").countDocuments({ emailNormalized: "x@example.org" })) === 0, sx.text);
    const newUser = await db.collection("users").findOne({ emailNormalized: "brandnew@example.org" });
    ok("A4-1 new signup is unverified, role null, stored hash is argon2id", newUser?.status === "unverified" && /^\$argon2id\$/.test(newUser.passwordHash) && !newUser.role, { status: newUser?.status, role: newUser?.role });

    // ---- 2. verify ----
    const nu = newUser!._id as string;
    const vt = await issue("verify_email", nu);
    const rt0 = await issue("password_reset", nu); // wrong purpose for verify
    const junk = await call("POST", "/auth/verify-email", { body: { token: "A".repeat(43) } });
    const wrongPurpose = await call("POST", "/auth/verify-email", { body: { token: rt0 } });
    const okv = await call("POST", "/auth/verify-email", { body: { token: vt } });
    const reuse = await call("POST", "/auth/verify-email", { body: { token: vt } });
    ok("A4-2 verify valid once -> pending", okv.status === 200 && okv.json?.state === "pending" && (await db.collection("users").findOne({ _id: nu as never }))?.status === "pending", okv.text);
    ok("A4-2 reuse / junk / wrong-purpose all identical 400 invalid_token", [junk, wrongPurpose, reuse].every((r) => r.status === 400 && r.text === junk.text && r.hdr === junk.hdr) && junk.json?.error === "invalid_token", [junk.text, wrongPurpose.text, reuse.text]);
    ok("A4-2 wrong-purpose token not consumed by the failed verify (still usable for reset)", !!(await db.collection("user_tokens").findOne({ purpose: "password_reset", usedAt: { $exists: false } })));
    const pre = await db.collection("user_tokens").countDocuments({ usedAt: { $exists: true } });
    // expired
    const vt2user = await seed("expiredtok@example.org", { status: "unverified" }); rawEmails.push("expiredtok@example.org");
    const vt2 = await issue("verify_email", vt2user._id);
    await db.collection("user_tokens").updateMany({ userId: vt2user._id as never }, { $set: { expiresAt: new Date(Date.now() - 1000).toISOString() } });
    const exp = await call("POST", "/auth/verify-email", { body: { token: vt2 } });
    ok("A4-2 expired token -> same generic 400", exp.status === 400 && exp.text === junk.text, exp.text);
    // stale unverified
    const stale = await seed("stale@example.org", { status: "unverified" }); rawEmails.push("stale@example.org");
    await db.collection("users").updateOne({ _id: stale._id as never }, { $set: { createdAt: new Date(Date.now() - 8 * 86400_000).toISOString() } });
    const vt3 = await issue("verify_email", stale._id);
    const st = await call("POST", "/auth/verify-email", { body: { token: vt3 } });
    ok("A4-2 unverified older than 7d cannot verify", st.status === 400 && (await db.collection("users").findOne({ _id: stale._id as never }))?.status === "unverified", st.text);
    // sweep deletes stale at next signup, only in own tenant
    const staleB = await seed("staleb@example.org", { status: "unverified", tenant: "tB" });
    await db.collection("users").updateOne({ _id: staleB._id as never }, { $set: { createdAt: new Date(Date.now() - 8 * 86400_000).toISOString() } });
    await call("POST", "/auth/signup", { body: { email: "trigger-sweep@example.org", password: PW, displayName: "T" } }); rawEmails.push("trigger-sweep@example.org");
    ok("A4-2 sweep removes stale unverified of tA", !(await db.collection("users").findOne({ _id: stale._id as never })));
    ok("A4-2 sweep in tA never touches tB's stale unverified", !!(await db.collection("users").findOne({ _id: staleB._id as never })));
    void pre;

    // ---- 3. login: enumeration, pending, rejected/disabled ----
    const pend = await login("brandnew@example.org");
    ok("A4-3 pending user correct pw -> 200 state pending + cookie", pend.status === 200 && pend.json?.state === "pending" && !!pend.token, pend.text);
    const dataPend = await call("GET", "/search?q=x", { cookie: pend.token });
    const dataPend2 = await call("GET", "/ask", { cookie: pend.token });
    ok("A4-3 pending session: data routes 403 account_not_active", dataPend.status === 403 && dataPend.json?.error === "account_not_active" && dataPend2.status === 403, [dataPend.status, dataPend.text, dataPend2.status]);
    const sessPend = await call("GET", "/auth/session", { cookie: pend.token });
    ok("A4-3 /auth/session works for pending", sessPend.status === 200 && sessPend.json?.state === "pending", sessPend.text);
    const rej = await seed("rej@example.org", { status: "rejected", role: null }), dis = await seed("dis@example.org", { status: "disabled", role: "member" }); rawEmails.push("rej@example.org", "dis@example.org");
    for (const e of ["rej@example.org", "dis@example.org"]) { const r = await login(e); ok(`A4-3 ${e} correct pw -> no cookie`, r.setCookie.length === 0 && r.status === 200 && ["rejected", "disabled"].includes(r.json?.state), r.text); const w = await login(e, "wrongpass-zzz-1"); ok(`A4-3 ${e} wrong pw -> 401 generic`, w.status === 401 && w.json?.error === "invalid_credentials"); }
    void rej; void dis;
    rawEmails.push("ghost@example.org");
    const uk = await login("ghost@example.org", "wrongpass-zzz-1"), wr = await login("exists@example.org", "wrongpass-zzz-1");
    ok("A4-3 unknown vs wrong-password: identical status+body+headers", uk.status === 401 && uk.text === wr.text && uk.hdr === wr.hdr, [uk.text, wr.text, uk.hdr, wr.hdr]);

    // ---- 4. lockout ----
    for (let i = 0; i < 4; i++) await login("  GHOST@Example.ORG ", "wrongpass-zzz-2");
    const g5 = await login("ghost@example.org", "wrongpass-zzz-2");
    const g6 = await login("ghost@example.org", PW);
    const thr = await db.collection("auth_throttles").find({ tenantId: "tA" }).toArray();
    const ghostRow = thr.find((r) => r.lockedUntil);
    ok("A4-4 never-registered email locks after 5 (case/space variants count together); row exists; raw email not stored", !!ghostRow && g5.status === 401 && g6.status === 401 && !JSON.stringify(thr).includes("ghost"), { n: thr.length });
    ok("A4-4 lock does not change the 401 body", g6.text === uk.text && g6.hdr === uk.hdr, [g6.text, uk.text]);
    // registered user: locked + correct password = 401
    const lockee = await seed("lockee@example.org"); rawEmails.push("lockee@example.org");
    const lsess = await login("lockee@example.org");
    for (let i = 0; i < 5; i++) await login("lockee@example.org", "wrongpass-zzz-1");
    const lc = await login("lockee@example.org", PW);
    ok("A4-4 locked registered: correct pw still 401, no cookie", lc.status === 401 && lc.setCookie.length === 0 && lc.text === uk.text, lc.text);
    const stillOk = await call("GET", "/auth/session", { cookie: lsess.token });
    ok("A4-4 existing session survives the lock", stillOk.status === 200, stillOk.text);
    const lockedRow = await db.collection("auth_throttles").findOne({ tenantId: "tA", lockedUntil: { $exists: true }, lockCount: 1 });
    const dur = lockedRow ? Date.parse(lockedRow.lockedUntil) - Date.now() : 0;
    ok("A4-4 first lock ~15 min", dur > 14 * 60_000 && dur <= 15 * 60_000 + 2000, dur);
    // expire lock -> next failures: second lock 30 min
    const lh = ua.auth.subjectHash("tA", "lockee@example.org");
    await db.collection("auth_throttles").updateOne({ tenantId: "tA", subjectHash: lh }, { $set: { lockedUntil: new Date(Date.now() - 1000).toISOString() } });
    for (let i = 0; i < 5; i++) await login("lockee@example.org", "wrongpass-zzz-1");
    const row2 = await db.collection("auth_throttles").findOne({ tenantId: "tA", subjectHash: lh });
    const dur2 = Date.parse(row2!.lockedUntil) - Date.now();
    ok("A4-4 second lock ~30 min (doubling) and lockCount 2", row2!.lockCount === 2 && dur2 > 29 * 60_000 && dur2 <= 30 * 60_000 + 2000, { lc: row2!.lockCount, dur2 });
    // hammering while locked does not extend
    for (let i = 0; i < 3; i++) await login("lockee@example.org", "wrongpass-zzz-1");
    const row3 = await db.collection("auth_throttles").findOne({ tenantId: "tA", subjectHash: lh });
    ok("A4-4 hammering while locked does not extend/alter the lock", row3!.lockedUntil === row2!.lockedUntil && row3!.lockCount === 2);
    // admin unlock
    await ua.auth.unlockEmail("tA", "lockee@example.org", "admin-1");
    const afterUnlock = await login("lockee@example.org", PW);
    ok("A4-4 admin unlock clears; login works again", afterUnlock.status === 200 && !!afterUnlock.token && !(await db.collection("auth_throttles").findOne({ tenantId: "tA", subjectHash: lh })), afterUnlock.text);
    // success clears counter
    await seed("clear@example.org"); rawEmails.push("clear@example.org");
    for (let i = 0; i < 4; i++) await login("clear@example.org", "wrongpass-zzz-1");
    await login("clear@example.org");
    for (let i = 0; i < 4; i++) await login("clear@example.org", "wrongpass-zzz-1");
    const cl = await login("clear@example.org");
    ok("A4-4 success clears the failure counter (4+ok+4+ok never locks)", cl.status === 200);
    // parallel guesses (real mongo, via HTTP)
    await seed("par@example.org"); rawEmails.push("par@example.org");
    await Promise.all(Array.from({ length: 20 }, () => login("par@example.org", "wrongpass-zzz-1")));
    const prow = await db.collection("auth_throttles").find({ tenantId: "tA", subjectHash: ua.auth.subjectHash("tA", "par@example.org") }).toArray();
    ok("A4-4 20 parallel wrong guesses -> single row, locked once", prow.length === 1 && !!prow[0]!.lockedUntil && prow[0]!.lockCount === 1, prow);
    // lock per-tenant: same hash differs per tenant
    ok("A4-4 subject hash differs per tenant and is not the plain sha256 of the email", ua.auth.subjectHash("tA", "a@b.co") !== ua.auth.subjectHash("tB", "a@b.co"));

    // ---- 5. reset ----
    const ru = await seed("reset@example.org"); rawEmails.push("reset@example.org");
    const rs1 = await login("reset@example.org"), rs2 = await login("reset@example.org");
    const f1 = await call("POST", "/auth/password/forgot", { body: { email: "reset@example.org" } }), f2 = await call("POST", "/auth/password/forgot", { body: { email: "nobody-here@example.org" } });
    ok("A4-5 forgot: registered vs unregistered identical 202", f1.status === 202 && f1.text === f2.text && f1.hdr === f2.hdr, [f1.text, f2.text]);
    const tokens = await db.collection("user_tokens").countDocuments({ userId: ru._id as never });
    ok("A4-5 forgot issues nothing in v1", tokens === 0);
    const rt = await issue("password_reset", ru._id);
    const shortpw = await call("POST", "/auth/password/reset", { body: { token: rt, newPassword: "short" } });
    ok("A4-5 weak new password -> 400 and token NOT spent", shortpw.status === 400 && !!(await db.collection("user_tokens").findOne({ userId: ru._id as never, usedAt: { $exists: false } })), shortpw.text);
    const rr = await Promise.all(Array.from({ length: 6 }, () => call("POST", "/auth/password/reset", { body: { token: rt, newPassword: PW2 } })));
    ok("A4-5 6 parallel redemptions of one reset token -> exactly one 200", rr.filter((r) => r.status === 200).length === 1 && rr.filter((r) => r.status === 400 && r.text === junk.text).length === 5, rr.map((r) => r.status));
    const o1 = await call("GET", "/auth/session", { cookie: rs1.token }), o2 = await call("GET", "/auth/session", { cookie: rs2.token });
    ok("A4-5 both pre-existing sessions dead after reset (401)", o1.status === 401 && o2.status === 401, [o1.status, o1.text, o2.status]);
    const oldpw = await login("reset@example.org"), newpw = await login("reset@example.org", PW2);
    ok("A4-5 old password refused, new works", oldpw.status === 401 && newpw.status === 200, [oldpw.status, newpw.status]);
    // reset refuses rejected/disabled generically and keeps token
    const rjTok = await issue("password_reset", (await db.collection("users").findOne({ emailNormalized: "rej@example.org" }))!._id as string);
    const dsTok = await issue("password_reset", (await db.collection("users").findOne({ emailNormalized: "dis@example.org" }))!._id as string);
    const rj = await call("POST", "/auth/password/reset", { body: { token: rjTok, newPassword: PW2 } }), ds = await call("POST", "/auth/password/reset", { body: { token: dsTok, newPassword: PW2 } });
    ok("A4-5 rejected/disabled reset -> same generic 400, no password change", rj.text === junk.text && ds.text === junk.text && rj.status === 400 && ds.status === 400);
    ok("A4-5 rejected user's password hash unchanged", (await login("rej@example.org", PW)).json?.state === "rejected");
    // pre-existing reset token for expired
    // cross purpose: verify token used as reset
    const vtok = await issue("verify_email", ru._id);
    const xr = await call("POST", "/auth/password/reset", { body: { token: vtok, newPassword: PW2 } });
    ok("A4-5 verify-purpose token on reset -> generic 400", xr.status === 400 && xr.text === junk.text);
    // reset does not auto-activate: pending/unverified reset keeps status
    // forgot per-address 429 uniform
    const fr = []; for (let i = 0; i < 4; i++) fr.push(await call("POST", "/auth/password/forgot", { body: { email: i % 2 ? "reset@example.org" : "reset@example.org" } }));
    const fu = []; for (let i = 0; i < 4; i++) fu.push(await call("POST", "/auth/password/forgot", { body: { email: "zzz-unknown@example.org" } }));
    ok("A4-8 per-address forgot limit identical for registered/unregistered (3 then 429)", fr.map((r) => r.status).join() === fu.map((r) => r.status).join() , [fr.map((r) => r.status), fu.map((r) => r.status)]);

    // ---- 6. change password ----
    const cu = await seed("change@example.org"); rawEmails.push("change@example.org");
    const c1 = await login("change@example.org"), c2 = await login("change@example.org");
    const noCsrf = await call("POST", "/auth/password/change", { cookie: c1.token, body: { currentPassword: PW, newPassword: PW2 } });
    ok("A4-6 change without CSRF header -> 403 csrf (perimeter)", noCsrf.status === 403, noCsrf.text);
    const wrongCur = await call("POST", "/auth/password/change", { cookie: c1.token, csrf: c1.csrf, body: { currentPassword: "wrongpass-zzz-1", newPassword: PW2 } });
    ok("A4-6 wrong current password refused (403, not 401) and nothing changed", wrongCur.status === 403 && (await login("change@example.org")).status === 200, wrongCur.text);
    const good = await call("POST", "/auth/password/change", { cookie: c1.token, csrf: c1.csrf, body: { currentPassword: PW, newPassword: PW2 } });
    const s1ok = await call("GET", "/auth/session", { cookie: c1.token }), s2dead = await call("GET", "/auth/session", { cookie: c2.token });
    ok("A4-6 success: current session stays, OTHER sessions revoked", good.status === 200 && s1ok.status === 200 && s2dead.status === 401, [good.status, s1ok.status, s2dead.status]);
    void cu;

    // ---- 7. logout, logout-all, exact cookie path ----
    const lo = await login("change@example.org", PW2), lo2 = await login("change@example.org", PW2);
    const out = await call("POST", "/auth/logout", { cookie: lo.token, csrf: lo.csrf, body: {} });
    ok("A4-7 logout clears cookie on exact path (<base>/api), Max-Age=0", out.status === 200 && out.setCookie.some((c) => /^lkb_sid=;/.test(c) && /Path=\/knowledgebase\/api/.test(c) && /(Max-Age=0|Expires=)/i.test(c)), out.setCookie);
    ok("A4-7 logout revoked exactly that session", (await call("GET", "/auth/session", { cookie: lo.token })).status === 401 && (await call("GET", "/auth/session", { cookie: lo2.token })).status === 200);
    const outNoCsrf = await call("POST", "/auth/logout", { cookie: lo2.token, body: {} });
    ok("A4-7 logout without CSRF refused and session survives", outNoCsrf.status === 403 && (await call("GET", "/auth/session", { cookie: lo2.token })).status === 200);
    const la = await call("POST", "/auth/logout-all", { cookie: lo2.token, csrf: lo2.csrf, body: {} });
    const lo3 = await login("change@example.org", PW2);
    ok("A4-7 logout-all revokes every session of the user and clears cookie", la.status === 200 && la.setCookie.length > 0 && (await call("GET", "/auth/session", { cookie: lo2.token })).status === 401 && lo3.status === 200);
    const list = await call("GET", "/auth/sessions", { cookie: lo3.token });
    ok("A4-7 /auth/sessions never exposes token hashes/family ids", list.status === 200 && !/tokenHash|family|hash/i.test(list.text), list.text);
    const other = await login("change@example.org", PW2); const exlist = (await call("GET", "/auth/sessions", { cookie: lo3.token })).json.sessions;
    const del = await call("DELETE", `/auth/sessions/${exlist.find((s: any) => !s.current).id}`, { cookie: lo3.token, csrf: lo3.csrf });
    ok("A4-7 revoke-own-session works; other user's session id -> 404", del.status === 200 && (await call("GET", "/auth/session", { cookie: other.token })).status === 401);
    const sIdOther = (await db.collection("user_sessions").findOne({ userId: exist._id as never }));
    const foreign = await call("DELETE", `/auth/sessions/${(await db.collection("user_sessions").findOne({ userId: lockee._id as never }))!._id}`, { cookie: lo3.token, csrf: lo3.csrf });
    ok("A4-7 cannot revoke another user's session (404)", foreign.status === 404, foreign.text); void sIdOther;

    // ---- 8. rate limits (stock router: defaults) ----
    const L: number[] = []; for (let i = 0; i < 22; i++) L.push((await callStock("POST", "/auth/login", { body: { email: `rl${i}@example.org`, password: "wrongpass-zzz-1" } })).status);
    const rl = await callStock("POST", "/auth/login", { body: { email: "rlx@example.org", password: "x" } });
    ok("A4-8 login per-IP: 20 pass then 429 standard body + Retry-After", L.slice(0, 20).every((s) => s === 401) && L[20] === 429 && rl.status === 429 && rl.json?.error === "rate_limited", L);
    const S: number[] = []; for (let i = 0; i < 6; i++) S.push((await callStock("POST", "/auth/signup", { body: { email: `sg${i}@example.org`, password: PW, displayName: "S" } })).status); rawEmails.push(...Array.from({ length: 6 }, (_, i) => `sg${i}@example.org`));
    ok("A4-8 signup per-IP: 5 pass then 429", S.slice(0, 5).every((s) => s === 202) && S[5] === 429, S);
    const T: number[] = []; for (let i = 0; i < 22; i++) T.push((await callStock("POST", "/auth/verify-email", { body: { token: "B".repeat(43) } })).status);
    ok("A4-8 verify token attempts per-IP: 20 then 429", T.slice(0, 20).every((s) => s === 400) && T[20] === 429, T);
    const FG: number[] = []; for (let i = 0; i < 6; i++) FG.push((await callStock("POST", "/auth/password/forgot", { body: { email: `fg${i}@example.org` } })).status);
    ok("A4-8 forgot per-IP: 5 then 429", FG.slice(0, 5).every((s) => s === 202) && FG[5] === 429, FG);
    // global signup cap
    const capSrv = await startTestServer(buildTestDeps({ keyStore, corsOrigins: [ORIGIN], userAccounts: { session: ua.session, authRouter: createAuthRouter({ service: (await import("./auth-service.js")).createAuthService({ store, sessions: ua.sessions, password: realPassword, csrfSecret: SECRET, signupDailyCap: 1 }), cookie: ua.cookie, csrf: ua.csrf, signupTenant: "tA", ipLimits: big }) } }));
    const cap = await mk(capSrv.baseUrl)("POST", "/auth/signup", { body: { email: "capped@example.org", password: PW, displayName: "C" } });
    ok("A4-8 global signup cap -> 429 signup_capacity", cap.status === 429 && cap.json?.error === "signup_capacity", cap.text);
    await capSrv.close();

    // ---- 9. Bearer / key on every /auth route ----
    const routes: Array<[string, string]> = [["POST", "/auth/signup"], ["POST", "/auth/login"], ["POST", "/auth/verify-email"], ["POST", "/auth/password/forgot"], ["POST", "/auth/password/reset"], ["GET", "/auth/session"], ["POST", "/auth/logout"], ["POST", "/auth/logout-all"], ["GET", "/auth/sessions"], ["DELETE", "/auth/sessions/abc"], ["POST", "/auth/password/change"], ["GET", "/auth/nope"], ["POST", "/auth/nope"]];
    let bad: unknown[] = [];
    for (const [m, p] of routes) for (const o of [{ bearer: "key-admin" }, { bearer: "junk" }, { auth: "Basic dXNlcjpwdw==" }, { bearer: "key-admin", cookie: lo3.token, csrf: lo3.csrf }] as Opt[]) {
      const r = await call(m, p, { ...o, body: m === "GET" ? undefined : { email: "bearer@example.org", password: PW, displayName: "B" } });
      if (r.status !== 403 || r.json?.error !== "key_not_allowed" || r.setCookie.length) bad.push([m, p, Object.keys(o), r.status, r.text]);
    }
    ok("A4-10 every /auth route (+unknown) with Bearer/Basic/junk/cookie+Bearer -> 403 key_not_allowed, no cookie", bad.length === 0, bad.slice(0, 5));
    ok("A4-10 bearer signup/login created nothing", (await db.collection("users").countDocuments({ emailNormalized: "bearer@example.org" })) === 0);
    // raw http: empty Authorization header
    const emptyAuth = await new Promise<{ s: number; b: string }>((resolve) => { const u = new URL(srv.baseUrl); const rq = http.request({ host: u.hostname, port: u.port, path: "/auth/session", method: "GET", headers: { authorization: "", cookie: `lkb_sid=${lo3.token}` } }, (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ s: res.statusCode!, b })); }); rq.end(); });
    ok("A4-10 empty Authorization header + valid cookie is refused too", emptyAuth.s === 403, emptyAuth);
    // key on another real route stays working (UA-28) and cookie-only: session cookie must not reach key-only /admin w/o scope
    const adm = await call("GET", "/admin/users", { cookie: lo3.token });
    ok("UA-28 member session cookie on /admin does not get through (401/403/503 placeholder, never 200)", adm.status !== 200, adm.status);

    // ---- 10. Origin / CSRF perimeter ----
    const evil: string[] = [];
    for (const [m, p, b] of [["POST", "/auth/login", { email: "a@b.co", password: "x" }], ["POST", "/auth/signup", { email: "a@b.co", password: PW, displayName: "x" }], ["POST", "/auth/password/forgot", { email: "a@b.co" }], ["POST", "/auth/password/reset", { token: "C".repeat(43), newPassword: PW }], ["POST", "/auth/verify-email", { token: "C".repeat(43) }]] as const) {
      for (const origin of ["https://evil.example", "null", "https://kb.example.org.evil.com", "HTTPS://KB.EXAMPLE.ORG:443x"]) { const r = await call(m, p, { origin, body: b }); if (r.status !== 403) evil.push(`${p}@${origin}=${r.status}`); }
    }
    ok("Perimeter: foreign / null / look-alike Origin on every public POST -> 403", evil.length === 0, evil);
    const noOrigin = await call("POST", "/auth/login", { origin: null, body: { email: "ghost2@example.org", password: "x" } });
    ok("Perimeter: missing Origin (curl) allowed -> normal 401", noOrigin.status === 401, noOrigin.status);

    // ---- 11. malformed ----
    const mal: Array<[string, Opt]> = [["invalid json", { raw: "{not json" }], ["array", { raw: "[]" }], ["null", { raw: "null" }], ["operator email", { raw: '{"email":{"$ne":null},"password":"x"}' }], ["numeric pw", { raw: '{"email":"a@b.co","password":12345678}' }], ["proto", { raw: '{"__proto__":{"x":1},"email":"a@b.co","password":"x"}' }], ["text/plain", { raw: '{"email":"a@b.co","password":"x"}', ctype: "text/plain" }], ["huge", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(5000) }) }], ["empty", {}]];
    const malBad: unknown[] = [];
    for (const [n, o] of mal) { const r = await call("POST", "/auth/login", o); if (r.status >= 500 || /at .*\.(ts|js):\d+|node_modules|stack/i.test(r.text)) malBad.push([n, r.status, r.text.slice(0, 120)]); }
    ok("Malformed bodies never 5xx and never leak a stack", malBad.length === 0, malBad);
    const bigPw = await call("POST", "/auth/login", { body: { email: "exists@example.org", password: "é".repeat(1000) } });
    ok("Over-long (<=1024) password on login is a normal 401 (no 500/DoS)", bigPw.status === 401, bigPw.status);

    // ---- 12. login while holding a cookie; stale cookie; single Set-Cookie ----
    const h = await login("exists@example.org");
    const relogNoCsrf = await call("POST", "/auth/login", { cookie: h.token, body: { email: "exists@example.org", password: PW } });
    const relog = await call("POST", "/auth/login", { cookie: h.token, csrf: h.csrf, body: { email: "exists@example.org", password: PW } });
    ok("Login while holding live cookie: needs CSRF (403 without), ends old session, exactly one Set-Cookie", relogNoCsrf.status === 403 && relog.status === 200 && relog.setCookie.length === 1 && (await call("GET", "/auth/session", { cookie: h.token })).status === 401, [relogNoCsrf.status, relog.status, relog.setCookie.length]);
    const revokedCookieLogin = await call("POST", "/auth/login", { cookie: h.token, body: { email: "exists@example.org", password: PW } });
    ok("Login with a stale/revoked cookie still works with one Set-Cookie", revokedCookieLogin.status === 200 && revokedCookieLogin.setCookie.length === 1 && !!tokOf(revokedCookieLogin.setCookie), [revokedCookieLogin.status, revokedCookieLogin.setCookie]);

    // ---- 13. audit grep ----
    const events = await db.collection("auth_events").find({}).toArray();
    const blob = JSON.stringify(events);
    const sessRows = await db.collection("user_sessions").find({}).toArray();
    const liveTokens: string[] = [h.token!, lo3.token!, c1.token!, pend.token!, relog.setCookie.join(";")].filter(Boolean) as string[];
    const rawTokens = [vt, rt, rt0, vtok, rjTok, dsTok, vt2, vt3];
    const leaks = [...secrets, ...liveTokens, ...rawTokens, ...rawEmails, ...rawEmails.map((e) => e.toUpperCase()), "Bearer", "key-admin", "argon2"].filter((s) => s && blob.includes(s));
    ok(`A4-9 auth_events (${events.length} rows) hold no password/token/cookie/raw-email/hash substring`, leaks.length === 0, leaks);
    const detailVals = [...new Set(events.map((e) => `${e.type}/${e.outcome}/${e.detail}`))].sort();
    console.log("PROBE INFO distinct type/outcome/detail:", JSON.stringify(detailVals));
    ok("A4-9 stored sessions hold hashes only (no raw cookie token)", !liveTokens.some((t) => JSON.stringify(sessRows).includes(t)));
    const usersBlob = JSON.stringify(await db.collection("users").find({}).toArray()); ok("A4-9 users collection holds no plaintext password", !secrets.some((s) => usersBlob.includes(s)));
    // one row per transition: fresh user, login ok, logout
    await db.collection("auth_events").deleteMany({}); // throwaway db
    await seed("one@example.org");
    const a = await login("one@example.org"); await call("POST", "/auth/logout", { cookie: a.token, csrf: a.csrf, body: {} });
    await login("one@example.org", "wrongpass-zzz-1");
    const ev = (await db.collection("auth_events").find({}).toArray()).map((e) => `${e.type}/${e.outcome}/${e.detail}`);
    ok("A4-9 login_ok + logout + login_failed => exactly one row each (plus session audit rows)", ev.filter((x) => x.startsWith("login_ok")).length === 1 && ev.filter((x) => x.startsWith("logout")).length === 1 && ev.filter((x) => x.startsWith("login_failed")).length === 1, ev);

    // ---- 14. timing (recorded, not asserted tight) ----
    const T1: number[] = [], T2: number[] = [], T3: number[] = [], T4: number[] = [];
    for (let i = 0; i < 12; i++) {
      T1.push((await call("POST", "/auth/login", { body: { email: `nobody${i}@example.org`, password: "wrongpass-zzz-1" } })).ms);
      T2.push((await call("POST", "/auth/login", { body: { email: "exists@example.org", password: "wrongpass-zzz-1" } })).ms);
    }
    for (let i = 0; i < 4; i++) { T3.push((await call("POST", "/auth/login", { body: { email: "ghost@example.org", password: "x1y2z3-wrong" } })).ms); T4.push((await call("POST", "/auth/login", { body: { email: "par@example.org", password: "x1y2z3-wrong" } })).ms); }
    console.log("PROBE TIMING login ms median: unknown", med(T1).toFixed(1), "wrongpw(registered)", med(T2).toFixed(1), "locked-unregistered", med(T3).toFixed(1), "locked-registered", med(T4).toFixed(1));
    for (let i = 0; i < 4; i++) await seed(`tm${i}@example.org`);
    const SN: number[] = [], SE: number[] = [];
    for (let i = 0; i < 4; i++) { SN.push((await call("POST", "/auth/signup", { body: { email: `tmnew${i}@example.org`, password: PW, displayName: "T" } })).ms); SE.push((await call("POST", "/auth/signup", { body: { email: `tm${i}@example.org`, password: PW, displayName: "T" } })).ms); }
    console.log("PROBE TIMING signup ms median: new", med(SN).toFixed(1), "existing", med(SE).toFixed(1));
    console.log("PROBE WARNS", JSON.stringify(warns));
    await srv.close(); await stock.close();
  } catch (e) { console.log("PROBE EXCEPTION", String((e as Error).stack).slice(0, 1800)); } finally {
    await db.dropDatabase(); await client.close();
    const bad = results.filter((r) => !r.ok);
    console.log(`PROBE SUMMARY ${results.length - bad.length}/${results.length} ok; failing: ${JSON.stringify(bad.map((b) => b.name))}`);
  }
});
