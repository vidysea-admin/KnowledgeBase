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

const norm = (h: Headers) => [...h.entries()].filter(([k]) => !["date", "connection", "keep-alive", "x-request-id", "ratelimit-remaining", "ratelimit", "ratelimit-reset", "ratelimit-policy"].includes(k)).sort().map(([k, v]) => `${k}: ${v}`).join("|");
const log = (...a: unknown[]) => console.log("PROBE", ...a);

test("P1 enumeration: signup new/existing/rejected/disabled byte+header equal; login unknown/wrong/badshape/locked equal", async () => {
  const r = await rig(); try {
    await r.seed("ex@x.org"); await r.seed("rj@x.org", { status: "rejected", role: null }); await r.seed("ds@x.org", { status: "disabled" });
    const outs = [];
    for (const e of ["brand-new@x.org", "ex@x.org", "rj@x.org", "ds@x.org"]) outs.push(await r.call("POST", "/auth/signup", { body: { email: e, password: PW2, displayName: "Q" } }));
    for (const o of outs) { assert.equal(o.text, outs[0]!.text); assert.equal(norm(o.headers), norm(outs[0]!.headers)); assert.equal(o.status, 202); }
    const l = [];
    for (const e of ["ghost@x.org", "ex@x.org", "notanemail", "rj@x.org", "ds@x.org"]) l.push(await r.call("POST", "/auth/login", { body: { email: e, password: "wrong wrong wrong" } }));
    for (const o of l) { assert.equal(o.status, 401); assert.equal(o.text, l[0]!.text); assert.equal(norm(o.headers), norm(l[0]!.headers)); }
    for (let i = 0; i < 6; i++) { await r.call("POST", "/auth/login", { body: { email: "ghost@x.org", password: "wrong wrong wrong" } }); await r.call("POST", "/auth/login", { body: { email: "ex@x.org", password: "wrong wrong wrong" } }); }
    const lg = await r.call("POST", "/auth/login", { body: { email: "ghost@x.org", password: "wrong wrong wrong" } });
    const lex = await r.call("POST", "/auth/login", { body: { email: "ex@x.org", password: PW } });
    assert.equal(lg.text, l[0]!.text); assert.equal(lex.text, l[0]!.text); assert.equal(norm(lex.headers), norm(l[0]!.headers)); assert.deepEqual(lex.setCookie, []);
    log("throttle rows", r.a.throttles.size);
    assert.ok(r.a.throttles.size >= 2);
    const f1 = await r.call("POST", "/auth/password/forgot", { body: { email: "ex@x.org" } }), f2 = await r.call("POST", "/auth/password/forgot", { body: { email: "nobody@x.org" } });
    assert.equal(f1.text, f2.text); assert.equal(f1.status, 202); assert.equal(norm(f1.headers), norm(f2.headers));
    log("P1 ok");
  } finally { await r.close(); }
});

test("P3 lock key normalisation: case/space/NFKC variants share one lock", async () => {
  const r = await rig(); try {
    await r.seed("u@x.org");
    const variants = ["U@X.ORG", " u@x.org ", "ｕ@x.org", "u@X.org", "U@x.org"];
    for (const v of variants) await r.call("POST", "/auth/login", { body: { email: v, password: "wrong wrong wrong" } });
    log("throttle rows after 5 variant failures", r.a.throttles.size);
    const ok = await r.login("u@x.org");
    log("login with correct pw after 5 variant failures ->", ok.status);
    assert.equal(ok.status, 401, "locked after 5 normalised-equal failures");
  } finally { await r.close(); }
});

test("P6 reset/verify tokens: single use, cross-purpose, expiry, session death, rejected/disabled generic", async () => {
  const r = await rig(); try {
    const u = await r.seed("u@x.org"); const pend = await r.seed("pend@x.org", { status: "pending", role: null }); const unv = await r.seed("unv@x.org", { status: "unverified", role: null });
    const rj = await r.seed("rj@x.org", { status: "rejected", role: null }); const ds = await r.seed("ds@x.org", { status: "disabled" });
    const garbage = await r.call("POST", "/auth/password/reset", { body: { token: "x".repeat(43), newPassword: PW2 } });
    assert.equal(garbage.status, 400);
    const s1 = await r.login("u@x.org"), s2 = await r.login("u@x.org");
    const rt = (await r.service.issueToken("tA", "password_reset", u._id, "adm"))!.token;
    const vt = (await r.service.issueToken("tA", "verify_email", unv._id, "adm"))!.token;
    const x1 = await r.call("POST", "/auth/verify-email", { body: { token: rt } }); const x2 = await r.call("POST", "/auth/password/reset", { body: { token: vt, newPassword: PW2 } });
    assert.equal(x1.text, garbage.text); assert.equal(x2.text, garbage.text);
    const ok = await r.call("POST", "/auth/password/reset", { body: { token: rt, newPassword: PW2 } });
    assert.equal(ok.status, 200);
    const reuse = await r.call("POST", "/auth/password/reset", { body: { token: rt, newPassword: PW2 } });
    assert.equal(reuse.text, garbage.text);
    for (const s of [s1, s2]) { const me = await r.call("GET", "/auth/session", { cookie: s.token }); log("session after reset", me.status, me.text); assert.equal(me.status, 401); }
    assert.equal((await r.login("u@x.org", PW)).status, 401); assert.equal((await r.login("u@x.org", PW2)).status, 200);
    const v1 = await r.call("POST", "/auth/verify-email", { body: { token: vt } }); assert.equal(v1.status, 200); assert.equal(v1.json!.state, "pending");
    assert.equal((await r.call("POST", "/auth/verify-email", { body: { token: vt } })).text, garbage.text);
    const et = (await r.service.issueToken("tA", "password_reset", u._id, "adm"))!.token; r.clock.advance(60 * 60_000 + 1000);
    assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: et, newPassword: PW } })).text, garbage.text);
    for (const x of [rj, ds]) { const t = (await r.service.issueToken("tA", "password_reset", x._id, "adm"))!.token; const o = await r.call("POST", "/auth/password/reset", { body: { token: t, newPassword: PW2 } }); assert.equal(o.text, garbage.text); assert.equal(o.status, 400); }
    const pt = (await r.service.issueToken("tA", "password_reset", pend._id, "adm"))!.token; assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: pt, newPassword: PW2 } })).status, 200);
    const wt = (await r.service.issueToken("tA", "password_reset", u._id, "adm"))!.token;
    const weak = await r.call("POST", "/auth/password/reset", { body: { token: wt, newPassword: "short" } }); log("weak", weak.status, weak.text);
    assert.equal((await r.call("POST", "/auth/password/reset", { body: { token: wt, newPassword: PW } })).status, 200);
    const pt2 = (await r.service.issueToken("tA", "password_reset", u._id, "adm"))!.token;
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => r.call("POST", "/auth/password/reset", { body: { token: pt2, newPassword: `parallel passphrase number ${i}` } })));
    log("parallel redeem statuses", res.map((x) => x.status).join(","));
    assert.equal(res.filter((x) => x.status === 200).length, 1);
  } finally { await r.close(); }
});

test("P7 Bearer/Authorization on every /auth route, with and without cookie; case/path variants; no session minted", async () => {
  const r = await rig(); try {
    await r.seed("u@x.org"); const s = await r.login("u@x.org");
    const rowsBefore = r.mem.rows.size;
    const routes: Array<[string, string]> = [["POST", "/auth/signup"], ["POST", "/auth/verify-email"], ["POST", "/auth/login"], ["POST", "/auth/password/forgot"], ["POST", "/auth/password/reset"], ["GET", "/auth/session"], ["POST", "/auth/logout"], ["POST", "/auth/logout-all"], ["GET", "/auth/sessions"], ["DELETE", "/auth/sessions/abc"], ["POST", "/auth/password/change"], ["POST", "/Auth/login"], ["POST", "/auth/login/"], ["POST", "/AUTH/password/change"]];
    for (const [m, p] of routes) for (const withCookie of [false, true]) for (const bearer of ["key-admin", "junk"]) {
      const o = await r.call(m, p, { bearer, ...(m === "GET" ? {} : { body: { email: "u@x.org", password: PW } }), ...(withCookie ? { cookie: s.token, csrf: s.csrf } : {}) });
      assert.equal(o.status, 403, `${m} ${p} cookie=${withCookie} ${bearer} -> ${o.status} ${o.text}`); assert.equal(o.json!.error, "key_not_allowed"); assert.deepEqual(o.setCookie, []);
    }
    assert.equal(r.mem.rows.size, rowsBefore, "no session minted");
    for (const h of ["Basic dTpw", "bearer key-admin", "", "Token abc"]) {
      const res = await fetch(r.baseUrl + "/auth/login", { method: "POST", headers: { authorization: h, "content-type": "application/json", origin: ORIGIN, connection: "close" }, body: JSON.stringify({ email: "u@x.org", password: PW }) });
      log("authorization header variant", JSON.stringify(h), res.status, res.headers.getSetCookie().length); assert.equal(res.status, 403);
    }
    const res2 = await fetch(r.baseUrl + "/auth/session", { headers: { "x-api-key": "key-admin", connection: "close" } }); log("x-api-key /auth/session", res2.status); assert.equal(res2.status, 401);
    const ad = await r.call("GET", "/admin/users", { bearer: "key-admin" }); log("admin w/ key", ad.status, ad.text);
    const ad2 = await r.call("GET", "/admin/users"); log("admin no key", ad2.status, ad2.text);
  } finally { await r.close(); }
});

test("P8 audit events carry no secrets after a full scenario; raw unknown email absent", async () => {
  const r = await rig(); try {
    const WRONG = "wrong wrong wrong"; const secrets: string[] = [PW, PW2, WRONG];
    await r.call("POST", "/auth/signup", { body: { email: "newbie@x.org", password: PW, displayName: "Canary Display" } });
    await r.call("POST", "/auth/signup", { body: { email: "newbie@x.org", password: PW2, displayName: "Canary Display" } });
    const nu = [...r.a.users.values()].find((u) => u.emailNormalized === "newbie@x.org")!;
    const vt = (await r.service.issueToken("tA", "verify_email", nu._id, "adm"))!.token; secrets.push(vt);
    await r.call("POST", "/auth/verify-email", { body: { token: vt } }); await r.call("POST", "/auth/verify-email", { body: { token: "zz" + vt.slice(2) } });
    for (let i = 0; i < 6; i++) await r.call("POST", "/auth/login", { body: { email: "ghost-canary@x.org", password: WRONG } });
    await r.call("POST", "/auth/login", { body: { email: "newbie@x.org", password: WRONG } });
    const res = await fetch(r.baseUrl + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "user-agent": `Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 ${PW} SECRETUA`, connection: "close" }, body: JSON.stringify({ email: "newbie@x.org", password: PW }) });
    const j: any = await res.json(); const tok = r.tokenOf(res.headers.getSetCookie())!; secrets.push(tok, j.csrfToken);
    await r.call("POST", "/auth/password/change", { cookie: tok, csrf: j.csrfToken, body: { currentPassword: WRONG, newPassword: PW2 } });
    await r.call("POST", "/auth/password/change", { cookie: tok, csrf: j.csrfToken, body: { currentPassword: PW, newPassword: PW2 } });
    const rt = (await r.service.issueToken("tA", "password_reset", nu._id, "adm"))!.token; secrets.push(rt);
    await r.call("POST", "/auth/password/reset", { body: { token: rt, newPassword: "yet another long passphrase 77" } }); secrets.push("yet another long passphrase 77");
    await r.service.unlockEmail("tA", "ghost-canary@x.org", "adm");
    const s3 = await r.login("newbie@x.org", "yet another long passphrase 77"); secrets.push(s3.token!, s3.csrf!);
    await r.call("POST", "/auth/logout", { cookie: s3.token, csrf: s3.csrf, body: {} });
    const dump = JSON.stringify(r.a.events) + JSON.stringify([...r.a.throttles.values()]);
    for (const s of [...secrets, "SECRETUA", "ghost-canary", "newbie@x.org", "Canary Display"]) log("grep", JSON.stringify(s.slice(0, 12)), dump.includes(s) ? "FOUND" : "absent");
    for (const s of [...secrets, "SECRETUA", "ghost-canary"]) assert.equal(dump.includes(s), false, `secret in events: ${s.slice(0, 8)}`);
    const counts: Record<string, number> = {}; for (const e of r.a.events) counts[`${e.type}/${e.outcome}/${e.detail}`] = (counts[`${e.type}/${e.outcome}/${e.detail}`] ?? 0) + 1;
    log("event histogram", JSON.stringify(counts));
    log("keys of an event", Object.keys(r.a.events[0]!).join(","));
  } finally { await r.close(); }
});

test("P9 change password / logout / sessions", async () => {
  const r = await rig(); try {
    const me = await r.seed("u@x.org"); const other = await r.seed("o@x.org");
    const a = await r.login("u@x.org"), b = await r.login("u@x.org"), c = await r.login("u@x.org"), oth = await r.login("o@x.org");
    const nocsrf = await r.call("POST", "/auth/password/change", { cookie: a.token, body: { currentPassword: PW, newPassword: PW2 } }); log("change w/o csrf", nocsrf.status, nocsrf.text); assert.equal(nocsrf.status, 403);
    const wrong = await r.call("POST", "/auth/password/change", { ...STRICT(a), body: { currentPassword: "nope nope nope nope", newPassword: PW2 } }); assert.equal(wrong.status, 403);
    assert.equal((await r.call("GET", "/auth/session", { cookie: b.token })).status, 200, "wrong current pw revokes nothing");
    const ok = await r.call("POST", "/auth/password/change", { ...STRICT(a), body: { currentPassword: PW, newPassword: PW2 } }); assert.equal(ok.status, 200);
    assert.equal((await r.call("GET", "/auth/session", { cookie: a.token })).status, 200); assert.equal((await r.call("GET", "/auth/session", { cookie: b.token })).status, 401); assert.equal((await r.call("GET", "/auth/session", { cookie: c.token })).status, 401);
    const d = await r.login("u@x.org", PW2);
    const list = await r.call("GET", "/auth/sessions", { cookie: d.token }); log("sessions list", list.text.slice(0, 300)); assert.equal(list.text.includes("tokenHash"), false);
    const otherSid = [...r.mem.rows.values()].find((x) => x.userId === other._id)!._id;
    const x = await r.call("DELETE", `/auth/sessions/${otherSid}`, { ...STRICT(d) }); assert.equal(x.status, 404);
    assert.equal((await r.call("GET", "/auth/session", { cookie: oth.token })).status, 200);
    const la = await r.call("POST", "/auth/logout-all", { ...STRICT(d), body: {} }); log("logout-all", la.status, la.setCookie.join(";"));
    assert.equal((await r.call("GET", "/auth/session", { cookie: d.token })).status, 401); assert.equal((await r.call("GET", "/auth/session", { cookie: oth.token })).status, 200, "other user's session survives");
    const lo = await r.login("u@x.org", PW2); const out = await r.call("POST", "/auth/logout", { ...STRICT(lo), body: {} });
    log("logout set-cookie", out.setCookie.join(";"), "login set-cookie", lo.setCookie.join(";"));
    assert.equal(out.setCookie.length, 1); assert.match(out.setCookie[0]!, /Path=\/knowledgebase\/api/); assert.match(out.setCookie[0]!, /(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
    assert.equal(me._id.length > 0, true);
  } finally { await r.close(); }
});

test("P10 rate limit: per-IP login 429 standard body, XFF spoof does not reset; per-email forgot", async () => {
  const r = await rig({ ip: { loginPerWindow: 3, signupPerHour: 2, forgotPerHour: 100 } }); try {
    const outs = [];
    for (let i = 0; i < 5; i++) { const res = await fetch(r.baseUrl + "/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `9.9.9.${i}`, connection: "close" }, body: JSON.stringify({ email: "g@x.org", password: "wrong wrong wrong" }) }); outs.push([res.status, res.headers.get("retry-after"), await res.text()]); }
    log("login XFF spoof statuses", outs.map((o) => o[0]).join(","), outs[4]![1], outs[4]![2]);
    assert.deepEqual(outs.map((o) => o[0]), [401, 401, 401, 429, 429]);
    const f = []; for (let i = 0; i < 4; i++) f.push((await r.call("POST", "/auth/password/forgot", { body: { email: "same@x.org" } })).status); log("forgot per-email", f.join(","));
    const f2 = []; for (let i = 0; i < 4; i++) f2.push((await r.call("POST", "/auth/password/forgot", { body: { email: `n${i}@x.org` } })).status); log("forgot different emails", f2.join(","));
  } finally { await r.close(); }
});
