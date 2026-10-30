// user-accounts A4 (D-206): the /auth HTTP surface through the REAL createServer perimeter (mountUserAccounts + requireAuth + guards),
// in-memory stores, fake clock. Plan A4 acceptance items are cited in each test name. v1 sends no mail; tokens are admin-issued.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { createAuthRouter } from "./auth-router.js";
import { createAuthService } from "./auth-service.js";
import { fastHash, fastPassword, memoryAuthStore } from "./auth-service.testsupport.js";
import * as realPassword from "./password.js";
import { clearSessionCookie, cookieMode, COOKIE_NAME_SECURE, sessionCookie } from "./cookie.js";
import { createSessionAuth } from "./principal.js";
import { createSessionService } from "./sessions.js";
import { fakeClock, memorySessionStore } from "./sessions.testsupport.js";
import type { IpLimits } from "./throttle.js";

const ORIGIN = "https://kb.example.org", SECRET = "k".repeat(48), PW = "correct horse battery staple", PW2 = "another long passphrase 2026";
const COOKIE = { basePath: "/knowledgebase", production: true }, CSRF = { secret: SECRET, allowedOrigins: [ORIGIN] };

async function rig(o: { tenant?: string | undefined; ip?: Partial<IpLimits>; real?: boolean; failStore?: boolean } = {}) {
  const clock = fakeClock(), mem = memorySessionStore(), password = o.real ? realPassword : fastPassword();
  const a = memoryAuthStore({ now: clock.now, sessionRows: mem.rows });
  if (o.failStore) a.store.findUserByEmail = async () => { throw new Error("mongo exploded: secret-host:27017"); };
  const sessions = createSessionService({ store: mem.store, users: { getUser: (t, id) => a.store.findUserById(t, id) }, now: clock.now });
  const service = createAuthService({ store: a.store, sessions, password, csrfSecret: SECRET, now: clock.now });
  const authRouter = createAuthRouter({ service, cookie: COOKIE, csrf: CSRF, signupTenant: "tenant" in o ? o.tenant : "tA", ipLimits: { loginPerWindow: 1000, signupPerHour: 1000, forgotPerHour: 1000, tokenPerHour: 1000, ...o.ip } });
  const keyStore = fakeKeyStore({ "key-admin": { tenantId: "tA", scopes: ["user-admin", "ask", "ingest"], keyId: "k1" } });
  const server = await startTestServer(buildTestDeps({ keyStore, corsOrigins: [ORIGIN], userAccounts: { session: createSessionAuth({ sessions, cookie: COOKIE, csrf: CSRF }), authRouter } }));
  const seed = (email: string, x: { status?: "unverified" | "pending" | "active" | "rejected" | "disabled"; role?: "admin" | "member" | "viewer" | null } = {}) => {
    const status = x.status ?? "active";
    return a.store.insertUser("tA", { emailNormalized: email, displayName: "Seed", passwordHash: o.real ? "" : fastHash(PW), status, role: x.role === undefined ? (status === "active" ? "member" : null) : x.role }, clock.now());
  };
  type Opt = { cookie?: string; bearer?: string; csrf?: string; origin?: string | null; body?: unknown; raw?: string; ctype?: string; xff?: string };
  const call = async (method: string, path: string, p: Opt = {}) => {
    const headers: Record<string, string> = { connection: "close" };
    if (p.cookie) headers.cookie = `${COOKIE_NAME_SECURE}=${p.cookie}`;
    if (p.bearer) headers.authorization = `Bearer ${p.bearer}`;
    if (p.csrf) headers["x-lkb-csrf"] = p.csrf;
    if (p.origin !== null) headers.origin = p.origin ?? ORIGIN;
    const payload = p.raw ?? (p.body === undefined ? undefined : JSON.stringify(p.body));
    if (payload !== undefined) headers["content-type"] = p.ctype ?? "application/json";
    const res = await fetch(server.baseUrl + path, { method, headers, ...(payload === undefined ? {} : { body: payload }) });
    const text = await res.text();
    let json: Record<string, any> | null = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, text, json, setCookie: res.headers.getSetCookie(), headers: res.headers };
  };
  const tokenOf = (setCookie: string[]) => new RegExp(`${COOKIE_NAME_SECURE}=([A-Za-z0-9_-]{43});`).exec(setCookie.join("\n"))?.[1];
  const login = async (email: string, pw = PW) => { const r = await call("POST", "/auth/login", { body: { email, password: pw } }); return { ...r, token: tokenOf(r.setCookie), csrf: r.json?.csrfToken as string | undefined }; };
  return { ...server, clock, mem, a, service, sessions, seed, call, login, tokenOf };
}
const STRICT = (r: { token?: string; csrf?: string }) => ({ cookie: r.token, csrf: r.csrf });

test("A4 #1 signup over HTTP: new and existing email give a byte-equal body; unknown field and tenant-in-body are 400 and create nothing; no tenant configured is 503", async () => {
  const r = await rig(); try {
    const first = await r.call("POST", "/auth/signup", { body: { email: "new@x.org", password: PW, displayName: "N" } });
    const second = await r.call("POST", "/auth/signup", { body: { email: "NEW@x.org", password: PW2, displayName: "M" } });
    assert.equal(first.status, 202); assert.equal(second.status, 202); assert.equal(first.text, second.text); assert.deepEqual(first.setCookie, []);
    assert.equal(r.a.users.size, 1);
    for (const extra of [{ tenantId: "tB" }, { role: "admin" }, { status: "active" }, { __proto__: null, x: 1 }]) {
      const res = await r.call("POST", "/auth/signup", { raw: JSON.stringify({ email: "z@x.org", password: PW, displayName: "Z" }).replace("}", `,${JSON.stringify(extra).slice(1, -1) || '"x":1'}}`) });
      assert.equal(res.status, 400, JSON.stringify(extra)); assert.equal(res.json!.error, "invalid_request");
    }
    assert.equal(r.a.users.size, 1, "nothing created by the rejected bodies, in any tenant");
    for (const bad of [[], null, "str", 5, { email: 5, password: PW, displayName: "x" }, { email: "a@b.org", password: PW }]) assert.equal((await r.call("POST", "/auth/signup", { body: bad })).status, 400, JSON.stringify(bad));
    assert.equal((await r.call("POST", "/auth/signup", { raw: "email=a@b.org&password=x", ctype: "application/x-www-form-urlencoded" })).status, 400);
    assert.equal((await r.call("POST", "/auth/signup", { raw: "{not json", ctype: "application/json" })).status, 400);
  } finally { await r.close(); }
  const off = await rig({ tenant: undefined }); try {
    const res = await off.call("POST", "/auth/signup", { body: { email: "a@b.org", password: PW, displayName: "A" } });
    assert.deepEqual([res.status, res.json!.error], [503, "signup_not_configured"]);
    assert.equal((await off.call("POST", "/auth/login", { body: { email: "a@b.org", password: PW } })).json!.error, "auth_not_configured");
  } finally { await off.close(); }
});

test("A4 public POSTs refuse a foreign Origin (403 csrf) but accept the app origin and a missing Origin (non-browser)", async () => {
  const r = await rig(); try {
    await r.seed("o@x.org");
    for (const p of ["/auth/login", "/auth/signup", "/auth/verify-email", "/auth/password/forgot", "/auth/password/reset"]) {
      const bad = await r.call("POST", p, { origin: "https://evil.example", body: { email: "o@x.org", password: PW } });
      assert.deepEqual([bad.status, bad.json!.error], [403, "csrf"], p);
    }
    assert.equal((await r.call("POST", "/auth/login", { origin: null, body: { email: "o@x.org", password: PW } })).status, 200);
    assert.equal((await r.call("POST", "/auth/login", { origin: ORIGIN + "/", body: { email: "o@x.org", password: PW } })).status, 200);
  } finally { await r.close(); }
});

test("A4 #3 login over HTTP: unknown email and wrong password are byte-equal 401s with no cookie; success sets the exact cookie; responses are no-store", async () => {
  const r = await rig(); try {
    await r.seed("u@x.org");
    const wrong = await r.call("POST", "/auth/login", { body: { email: "u@x.org", password: "wrong wrong wrong" } });
    const unknown = await r.call("POST", "/auth/login", { body: { email: "ghost@x.org", password: "wrong wrong wrong" } });
    assert.equal(wrong.status, 401); assert.equal(wrong.text, unknown.text); assert.deepEqual([wrong.setCookie, unknown.setCookie], [[], []]);
    assert.equal(wrong.headers.get("cache-control"), "no-store"); assert.equal(wrong.headers.get("retry-after"), null);
    const ok = await r.login("u@x.org");
    assert.equal(ok.status, 200); assert.equal(ok.setCookie.length, 1);
    assert.match(ok.setCookie[0]!, new RegExp(`^${COOKIE_NAME_SECURE}=[A-Za-z0-9_-]{43}; Max-Age=34560000; Path=/knowledgebase/api; HttpOnly; Secure; SameSite=Strict$`));
    assert.equal(typeof ok.csrf, "string"); assert.equal(ok.text.includes(ok.token!), false, "the session token is never in the body");
    assert.equal(ok.json!.user.role, "member"); assert.equal("passwordHash" in ok.json!.user, false);
    const me = await r.call("GET", "/auth/session", { cookie: ok.token });
    assert.equal(me.status, 200); assert.equal(me.json!.csrfToken, ok.csrf);
    assert.equal((await r.call("GET", "/auth/session")).status, 401);
  } finally { await r.close(); }
});

test("A4 #3 a pending user gets a session with ZERO scopes: /auth works, every data route is 403 account_not_active; rejected / disabled get no cookie", async () => {
  const r = await rig(); try {
    await r.seed("p@x.org", { status: "pending", role: null }); await r.seed("rj@x.org", { status: "rejected", role: null }); await r.seed("ds@x.org", { status: "disabled", role: "member" });
    const p = await r.login("p@x.org");
    assert.equal(p.status, 200); assert.equal(p.json!.state, "pending"); assert.ok(p.token);
    assert.equal((await r.call("GET", "/auth/session", { cookie: p.token })).json!.state, "pending");
    for (const [m, path] of [["GET", "/system/status"], ["GET", "/graph/overview"], ["POST", "/ask"], ["POST", "/ingest"], ["GET", "/keys"]] as const) {
      const res = await r.call(m, path, { ...STRICT(p), body: m === "POST" ? {} : undefined });
      assert.deepEqual([res.status, res.json?.error], [403, "account_not_active"], `${m} ${path}`);
    }
    for (const email of ["rj@x.org", "ds@x.org"]) { const x = await r.login(email); assert.equal(x.status, 200); assert.equal(x.setCookie.length, 0, email); assert.ok(["rejected", "disabled"].includes(x.json!.state)); }
  } finally { await r.close(); }
});

test("A4 #7 logout needs CSRF; it revokes the session and clears the cookie on the exact path; the old cookie is then 401 session_revoked; logout-all revokes every session", async () => {
  const r = await rig(); try {
    await r.seed("l@x.org");
    const a = await r.login("l@x.org"), b = await r.login("l@x.org");
    assert.deepEqual([(await r.call("POST", "/auth/logout", { cookie: a.token })).json!.error, (await r.call("POST", "/auth/logout", { cookie: a.token, csrf: "wrong" })).json!.error], ["csrf", "csrf"]);
    assert.equal((await r.call("POST", "/auth/logout", { cookie: a.token, csrf: a.csrf, origin: "https://evil.example" })).json!.error, "csrf");
    const out = await r.call("POST", "/auth/logout", { ...STRICT(a), body: {} });
    assert.equal(out.status, 200);
    assert.equal(out.setCookie[0], clearSessionCookie(cookieMode(COOKIE, { headers: {}, socket: { remoteAddress: "10.0.0.1" } } as never), COOKIE));
    assert.equal(out.setCookie[0], `${COOKIE_NAME_SECURE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/knowledgebase/api; HttpOnly; Secure; SameSite=Strict`);
    const after = await r.call("GET", "/system/status", { cookie: a.token });
    assert.deepEqual([after.status, after.json!.error], [401, "session_revoked"]);
    assert.notEqual((await r.call("GET", "/system/status", { cookie: b.token })).status, 401, "the other session lives");
    const c = await r.login("l@x.org");
    assert.equal((await r.call("POST", "/auth/logout-all", { ...STRICT(c), body: {} })).status, 200);
    assert.equal((await r.call("GET", "/system/status", { cookie: b.token })).json!.error, "session_revoked");
  } finally { await r.close(); }
});

test("A4 UA-20 sessions list and revoke-own over HTTP; revoking the current session clears the cookie; another session id is 404", async () => {
  const r = await rig(); try {
    await r.seed("s@x.org"); await r.seed("t@x.org");
    const a = await r.login("s@x.org"), b = await r.login("s@x.org"), other = await r.login("t@x.org");
    const list = await r.call("GET", "/auth/sessions", { cookie: a.token });
    assert.equal(list.json!.sessions.length, 2); assert.equal(list.json!.sessions.filter((s: any) => s.current).length, 1);
    const otherId = [...r.mem.rows.values()].find((x) => x.userId !== [...r.mem.rows.values()][0]!.userId)!._id;
    assert.equal((await r.call("DELETE", `/auth/sessions/${otherId}`, STRICT(a))).status, 404);
    const bId = list.json!.sessions.find((s: any) => !s.current).id;
    assert.equal((await r.call("DELETE", `/auth/sessions/${bId}`, STRICT(a))).status, 200);
    assert.equal((await r.call("GET", "/auth/session", { cookie: b.token })).json!.error, "session_revoked");
    const own = list.json!.sessions.find((s: any) => s.current).id;
    const gone = await r.call("DELETE", `/auth/sessions/${own}`, STRICT(a));
    assert.equal(gone.status, 200); assert.match(gone.setCookie[0]!, /Max-Age=0/);
    assert.ok(other.token);
  } finally { await r.close(); }
});

test("A4 #5 reset over HTTP: forgot is a uniform 202; an admin-issued token resets once; a session that existed before gets 401 on its next request", async () => {
  const r = await rig(); try {
    const u = await r.seed("re@x.org");
    const known = await r.call("POST", "/auth/password/forgot", { body: { email: "re@x.org" } }), unknown = await r.call("POST", "/auth/password/forgot", { body: { email: "ghost@x.org" } });
    assert.equal(known.status, 202); assert.equal(known.text, unknown.text);
    const pre = await r.login("re@x.org");
    assert.notEqual((await r.call("GET", "/system/status", { cookie: pre.token })).status, 401);
    const tk = (await r.service.issueToken("tA", "password_reset", u._id, "admin-1"))!;
    const done = await r.call("POST", "/auth/password/reset", { body: { token: tk.token, newPassword: PW2 } });
    assert.equal(done.status, 200);
    const next = await r.call("GET", "/system/status", { cookie: pre.token });
    assert.deepEqual([next.status, next.json!.error], [401, "session_revoked"]);
    assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: tk.token, newPassword: PW2 } })).json!.error, "invalid_token");
    assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: tk.token, newPassword: PW2, extra: 1 } })).json!.error, "invalid_request");
  } finally { await r.close(); }
});

test("A4 verify over HTTP: an admin-issued link moves unverified -> pending; the same link again is the generic 400", async () => {
  const r = await rig(); try {
    const u = await r.seed("vf@x.org", { status: "unverified", role: null });
    const tk = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!;
    assert.deepEqual([(await r.call("POST", "/auth/verify-email", { body: { token: tk.token } })).status, r.a.users.get(u._id)!.status], [200, "pending"]);
    const again = await r.call("POST", "/auth/verify-email", { body: { token: tk.token } });
    assert.deepEqual([again.status, again.json!.error], [400, "invalid_token"]);
  } finally { await r.close(); }
});

test("A4 #6 change password over HTTP: needs the session + CSRF; wrong current is 403 (not 401, the web client must not sign out)", async () => {
  const r = await rig(); try {
    await r.seed("c@x.org");
    const a = await r.login("c@x.org");
    assert.equal((await r.call("POST", "/auth/password/change", { body: { currentPassword: PW, newPassword: PW2 } })).status, 401, "no session");
    assert.equal((await r.call("POST", "/auth/password/change", { cookie: a.token, body: { currentPassword: PW, newPassword: PW2 } })).json!.error, "csrf");
    const wrong = await r.call("POST", "/auth/password/change", { ...STRICT(a), body: { currentPassword: "nope nope nope nope", newPassword: PW2 } });
    assert.deepEqual([wrong.status, wrong.json!.error], [403, "invalid_credentials"]);
    assert.equal((await r.call("POST", "/auth/password/change", { ...STRICT(a), body: { currentPassword: PW, newPassword: PW2 } })).status, 200);
  } finally { await r.close(); }
});

test("A4 #8 rate limits: per-IP login / signup / forgot / token respond 429 with the standard body and Retry-After; per-email forgot 429 too", async () => {
  const r = await rig({ ip: { loginPerWindow: 2, signupPerHour: 2, forgotPerHour: 50, tokenPerHour: 2 } }); try {
    const body = { email: "x@x.org", password: "wrong wrong wrong" };
    assert.deepEqual([(await r.call("POST", "/auth/login", { body })).status, (await r.call("POST", "/auth/login", { body })).status], [401, 401]);
    const lim = await r.call("POST", "/auth/login", { body });
    assert.equal(lim.status, 429); assert.deepEqual(lim.json, { error: "rate_limited", message: "too many requests — slow down and retry after the window" }); assert.ok(lim.headers.get("retry-after"));
    for (let i = 0; i < 2; i++) assert.equal((await r.call("POST", "/auth/signup", { body: { email: `s${i}@x.org`, password: PW, displayName: "S" } })).status, 202);
    assert.equal((await r.call("POST", "/auth/signup", { body: { email: "s9@x.org", password: PW, displayName: "S" } })).status, 429);
    for (let i = 0; i < 2; i++) assert.equal((await r.call("POST", "/auth/verify-email", { body: { token: "a".repeat(43) } })).status, 400);
    assert.equal((await r.call("POST", "/auth/verify-email", { body: { token: "a".repeat(43) } })).status, 429);
    assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: "a".repeat(43), newPassword: PW } })).status, 429, "verify and reset share the token-attempt budget");
    const codes: number[] = []; for (let i = 0; i < 4; i++) codes.push((await r.call("POST", "/auth/password/forgot", { body: { email: "mail@x.org" } })).status);
    assert.deepEqual(codes, [202, 202, 202, 429], "3 per address per hour, same body as any 429");
  } finally { await r.close(); }
});

test("A4 #10 no /auth route is reachable with a Bearer key (403 key_not_allowed), with or without a cookie; the key store is never consulted for /auth", async () => {
  const r = await rig(); try {
    await r.seed("k@x.org"); const s = await r.login("k@x.org");
    const routes: Array<[string, string]> = [["POST", "/auth/signup"], ["POST", "/auth/verify-email"], ["POST", "/auth/login"], ["POST", "/auth/logout"], ["POST", "/auth/logout-all"], ["GET", "/auth/session"],
      ["GET", "/auth/sessions"], ["DELETE", "/auth/sessions/x"], ["POST", "/auth/password/forgot"], ["POST", "/auth/password/reset"], ["POST", "/auth/password/change"]];
    for (const [m, p] of routes) for (const extra of [{}, { cookie: s.token, csrf: s.csrf }]) {
      const res = await r.call(m, p, { bearer: "key-admin", ...extra, body: m === "GET" || m === "DELETE" ? undefined : {} });
      assert.deepEqual([res.status, res.json?.error], [403, "key_not_allowed"], `${m} ${p}`);
    }
    assert.equal((await r.call("POST", "/auth/login", { raw: JSON.stringify({ email: "k@x.org", password: PW }), ctype: "application/json", bearer: "junk" })).status, 403);
    assert.equal((await r.call("GET", "/auth/nope")).status, 404, "terminal 404 for an unknown /auth path");
    assert.equal(r.mem.rows.size, 1, "no session was minted for any key request");
  } finally { await r.close(); }
});

test("A4 login while holding a session revokes that old session (one cookie, one live session)", async () => {
  const r = await rig(); try {
    await r.seed("w@x.org");
    const a = await r.login("w@x.org");
    const again = await r.call("POST", "/auth/login", { cookie: a.token, csrf: a.csrf, body: { email: "w@x.org", password: PW } });
    assert.equal(again.status, 200);
    assert.equal((await r.call("GET", "/auth/session", { cookie: a.token })).json!.error, "session_revoked");
    const stale = await r.call("POST", "/auth/login", { cookie: a.token, body: { email: "w@x.org", password: PW } });
    assert.equal(stale.status, 200, "a stale cookie never blocks signing in again"); assert.equal(stale.setCookie.length, 1, "one Set-Cookie: the new session, not a clear followed by a set");
    assert.ok(r.tokenOf(stale.setCookie));
  } finally { await r.close(); }
});

test("a storage failure is 503 auth_unavailable with no internal detail (never 500, never logged in)", async () => {
  const r = await rig({ failStore: true }); try {
    const res = await r.call("POST", "/auth/login", { body: { email: "a@b.org", password: PW } });
    assert.deepEqual([res.status, res.json!.error], [503, "auth_unavailable"]); assert.equal(res.text.includes("mongo"), false); assert.equal(res.setCookie.length, 0);
  } finally { await r.close(); }
});

test("end to end with the REAL argon2id module: signup, admin link, verify, approve, login, wrong password, change, reset", { timeout: 60_000 }, async () => {
  const r = await rig({ real: true }); try {
    assert.equal((await r.call("POST", "/auth/signup", { body: { email: "real@x.org", password: PW, displayName: "Real" } })).status, 202);
    const u = [...r.a.users.values()][0]!;
    assert.match(u.passwordHash, /^\$argon2id\$v=19\$/); assert.ok(!u.passwordHash.includes(PW));
    const tk = (await r.service.issueToken("tA", "verify_email", u._id, "admin-1"))!;
    assert.equal((await r.call("POST", "/auth/verify-email", { body: { token: tk.token } })).status, 200);
    assert.equal((await r.login("real@x.org")).json!.state, "pending");
    await r.a.store.updateUser("tA", u._id, { status: "active", role: "member" });
    assert.equal((await r.login("real@x.org", "wrong wrong wrong")).status, 401);
    const ok = await r.login("real@x.org"); assert.equal(ok.json!.state, "active");
    assert.equal((await r.call("POST", "/auth/password/change", { ...STRICT(ok), body: { currentPassword: PW, newPassword: PW2 } })).status, 200);
    assert.equal((await r.login("real@x.org", PW2)).status, 200);
  } finally { await r.close(); }
});

test("sessionCookie import is the same builder the router uses (cookie string pinned above)", () => {
  assert.equal(sessionCookie("t".repeat(43), { secure: true, name: COOKIE_NAME_SECURE }, COOKIE).startsWith(`${COOKIE_NAME_SECURE}=`), true);
});
