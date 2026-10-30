// user-accounts A3 (D-206): the HTTP-level principal matrix through the REAL createServer perimeter, role table checks,
// CSRF, viewer / non-active guards, API-key precedence and the /auth + /admin mounts. In-memory stores only.
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { actorId } from "../auth.js";
import { ALL_SCOPES } from "../../../../scripts/lib/mint-scopes.mjs";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import { createSessionAuth } from "./principal.js";
import { COOKIE_NAME_SECURE } from "./cookie.js";
import { csrfTokenFor } from "./csrf.js";
import { OPERATOR_ONLY_SCOPES, ROLE_SCOPES, scopesForRole } from "./roles.js";
import { createSessionService, IDLE_EXPIRY_MS, ROTATE_AFTER_MS } from "./sessions.js";
import { fakeClock, memorySessionStore, memoryUsers, user } from "./sessions.testsupport.js";

const ORIGIN = "https://kb.example.org", SECRET = "k".repeat(48);
const cookieCfg = { basePath: "/knowledgebase", production: true }, csrfCfg = { secret: SECRET, allowedOrigins: [ORIGIN] };

async function rig(users = [user({ _id: "m1", tenantId: "tA" }), user({ _id: "v1", tenantId: "tA", role: "viewer" }), user({ _id: "a1", tenantId: "tA", role: "admin" }),
  user({ _id: "p1", tenantId: "tA", status: "pending", role: undefined }), user({ _id: "d1", tenantId: "tA", status: "disabled" }), user({ _id: "b1", tenantId: "tB" })]) {
  const clock = fakeClock(), mem = memorySessionStore(), usersApi = memoryUsers(users);
  const sessions = createSessionService({ store: mem.store, users: usersApi, now: clock.now });
  const keyStore = fakeKeyStore({ "key-ask": { tenantId: "tA", scopes: ["ask", "ingest"], keyId: "k1" }, "key-b": { tenantId: "tB", scopes: ["ask"], keyId: "k2" } });
  const server = await startTestServer(buildTestDeps({ keyStore, corsOrigins: [ORIGIN], userAccounts: { session: createSessionAuth({ sessions, cookie: cookieCfg, csrf: csrfCfg }) } }));
  const login = async (tenantId: string, userId: string) => (await sessions.create(tenantId, userId)).token;
  const call = async (method: string, path: string, o: { cookie?: string; bearer?: string; csrf?: boolean | string; origin?: string; body?: unknown; sid?: string } = {}) => {
    const headers: Record<string, string> = { connection: "close" };
    if (o.cookie) headers.cookie = `${COOKIE_NAME_SECURE}=${o.cookie}`;
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
    if (o.origin !== undefined) headers.origin = o.origin;
    if (o.csrf) headers["x-lkb-csrf"] = typeof o.csrf === "string" ? o.csrf : csrfTokenFor(o.sid ?? "", SECRET);
    if (o.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(server.baseUrl + path, { method, headers, ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }) });
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, any> | null, setCookie: res.headers.getSetCookie() };
  };
  return { ...server, clock, mem, sessions, login, call, users: usersApi };
}
const GET = "/system/status"; // any authenticated GET; scope-free answers are not needed, only the auth outcome

test("principal matrix: bearer only, cookie only, both, neither, junk (A3 #1)", async () => {
  const r = await rig(); try {
    const t = await r.login("tA", "m1");
    assert.notEqual((await r.call("GET", "/health")).status, 401, "health stays public");
    assert.equal((await r.call("GET", GET, { bearer: "key-ask" })).status === 401, false, "bearer only");
    assert.equal((await r.call("GET", GET, { cookie: t })).status === 401, false, "cookie only");
    assert.equal((await r.call("GET", GET)).status, 401, "neither");
    // both: Bearer wins and the cookie is ignored (a bad bearer is NOT rescued by a good cookie)
    const both = await r.call("GET", GET, { bearer: "nope", cookie: t });
    assert.equal(both.status, 401); assert.equal(both.json!.message, "invalid or revoked API key");
    assert.equal((await r.call("GET", GET, { bearer: "key-ask", cookie: "x".repeat(43) })).status === 401, false, "valid bearer with a junk cookie");
    assert.equal((await r.call("GET", GET, { cookie: "not-a-token" })).status, 401);
    const basic = await fetch(r.baseUrl + GET, { headers: { authorization: "Basic abc", cookie: `${COOKIE_NAME_SECURE}=${t}`, connection: "close" } });
    assert.equal(basic.status, 401, "any Authorization header present means the cookie is not consulted");
  } finally { await r.close(); }
});

test("a session never carries keyId and a key never carries user fields; actorId distinguishes them (UA-17, UA-29)", async () => {
  assert.equal(actorId({ tenantId: "t", scopes: [], principal: "session", userId: "u9" }), "user:u9");
  assert.equal(actorId({ tenantId: "t", scopes: [], keyId: "k1" }), "k1");
  assert.equal(actorId({ tenantId: "t", scopes: [], principal: "session" }), undefined);
  assert.equal(actorId(undefined), undefined);
  const seen: unknown[] = [];
  const { requireAuth } = await import("../auth.js");
  const mw = requireAuth({ verify: async () => ({ tenantId: "tA", scopes: ["ask"], keyId: "k1", principal: "session", userId: "evil", userRole: "admin", sessionId: "s", notActive: false }) });
  const req = { header: () => "Bearer x" } as unknown as import("express").Request;
  await mw(req, {} as never, () => { seen.push(req.auth); });
  assert.deepEqual(seen[0], { tenantId: "tA", scopes: ["ask"], keyId: "k1" });
});

test("revoked, idle-expired, disabled, pending and cross-tenant sessions (A3 #1)", async () => {
  const r = await rig(); try {
    const t = await r.login("tA", "m1"), id = [...r.mem.rows.values()][0]!._id;
    await r.sessions.revoke("tA", id, "admin");
    const gone = await r.call("GET", GET, { cookie: t });
    assert.equal(gone.status, 401); assert.equal(gone.json!.error, "session_revoked");
    assert.match(gone.setCookie.join("|"), /__Secure-lkb_sid=; Max-Age=0.*Path=\/knowledgebase\/api/, "stale cookie is cleared on the exact path");
    const idle = await r.login("tA", "m1"); r.clock.advance(IDLE_EXPIRY_MS + 864e5);
    const exp = await r.call("GET", GET, { cookie: idle }); assert.equal(exp.status, 401); assert.equal(exp.json!.error, "session_expired");
    const dis = await r.call("GET", GET, { cookie: await r.login("tA", "d1") }); assert.equal(dis.status, 401);
    const pend = await r.login("tA", "p1");
    const p1 = await r.call("GET", GET, { cookie: pend }); assert.equal(p1.status, 403); assert.equal(p1.json!.error, "account_not_active");
    assert.equal((await r.call("GET", "/search?q=x", { cookie: pend })).status, 403);
    // session row says tenant tA but the user id belongs to tB only
    assert.equal((await r.call("GET", GET, { cookie: await r.login("tA", "b1") })).status, 401);
  } finally { await r.close(); }
});

test("rotation re-issues the cookie with the exact attributes; the CSRF token survives rotation (A3 #3, #4)", async () => {
  const r = await rig(); try {
    const t = await r.login("tA", "m1"); const id = [...r.mem.rows.values()][0]!._id;
    r.clock.advance(ROTATE_AFTER_MS + 1000);
    const res = await r.call("GET", GET, { cookie: t });
    assert.equal(res.setCookie.length, 1);
    assert.match(res.setCookie[0]!, /^__Secure-lkb_sid=[A-Za-z0-9_-]{43}; Max-Age=34560000; Path=\/knowledgebase\/api; HttpOnly; Secure; SameSite=Strict$/);
    const next = /=([^;]+);/.exec(res.setCookie[0]!)![1]!;
    assert.equal((await r.call("POST", "/ask", { cookie: next, origin: ORIGIN, csrf: true, sid: id, body: {} })).status === 403, false, "same CSRF token still valid under the new cookie");
  } finally { await r.close(); }
});

test("CSRF on a cookie principal for unsafe methods; keys exempt; GET exempt (A3 #5)", async () => {
  const r = await rig(); try {
    const t = await r.login("tA", "m1"), id = [...r.mem.rows.values()][0]!._id;
    const csrf403 = (res: { status: number; json: Record<string, any> | null }) => { assert.equal(res.status, 403); assert.equal(res.json!.error, "csrf"); };
    csrf403(await r.call("POST", "/ask", { cookie: t, body: {} }));
    csrf403(await r.call("POST", "/ask", { cookie: t, origin: ORIGIN, body: {} }));
    csrf403(await r.call("POST", "/ask", { cookie: t, csrf: true, sid: id, body: {} }));
    csrf403(await r.call("POST", "/ask", { cookie: t, origin: "https://evil.example", csrf: true, sid: id, body: {} }));
    csrf403(await r.call("POST", "/ask", { cookie: t, origin: ORIGIN, csrf: "wrong", body: {} }));
    csrf403(await r.call("DELETE", "/keys/abc", { cookie: t, origin: ORIGIN, body: undefined }));
    const ok = await r.call("POST", "/ask", { cookie: t, origin: ORIGIN, csrf: true, sid: id, body: {} });
    assert.ok(ok.status !== 403 && ok.status !== 401, `handler reached (${ok.status})`);
    assert.ok((await r.call("POST", "/ask", { bearer: "key-ask", body: {} })).status !== 403, "bearer key needs no CSRF");
    assert.notEqual((await r.call("GET", GET, { cookie: t })).status, 403);
  } finally { await r.close(); }
});

test("viewer is read-only (403 read_only_role) except the allowlisted read-like POSTs; non-active gets 403 account_not_active (A3 #6)", async () => {
  const r = await rig(); try {
    const v = await r.login("tA", "v1"), vid = [...r.mem.rows.values()].find((x) => x.userId === "v1")!._id;
    const send = (method: string, path: string) => r.call(method, path, { cookie: v, origin: ORIGIN, csrf: true, sid: vid, body: method === "DELETE" ? undefined : {} });
    for (const [m, p] of [["POST", "/ingest"], ["POST", "/watched-sources"], ["PUT", "/calendar/join-rules"], ["DELETE", "/keys/x"], ["PATCH", "/anything"], ["POST", "/ASK/extra"]] as const) {
      const res = await send(m, p); assert.equal(res.status, 403, `${m} ${p}`); assert.equal(res.json!.error, "read_only_role", `${m} ${p}`);
    }
    for (const p of ["/ask", "/ask/", "/citations/native/resolve"]) assert.notEqual((await send("POST", p)).json?.error, "read_only_role", p);
    assert.notEqual((await r.call("GET", GET, { cookie: v })).status, 403);
    const m = await r.login("tA", "m1"), mid = [...r.mem.rows.values()].find((x) => x.userId === "m1")!._id;
    assert.notEqual((await r.call("POST", "/ingest", { cookie: m, origin: ORIGIN, csrf: true, sid: mid, body: {} })).json?.error, "read_only_role", "a member is not a viewer");
  } finally { await r.close(); }
});

test("roles: no operator scope in any role, new scopes are mintable, unknown role -> none (A3 #7)", () => {
  for (const [role, scopes] of Object.entries(ROLE_SCOPES)) {
    for (const op of OPERATOR_ONLY_SCOPES) assert.ok(!scopes.includes(op), `${role} must not hold ${op}`);
    for (const s of scopes) assert.ok((ALL_SCOPES as string[]).includes(s), `${role} scope '${s}' is issuable (in ALL_SCOPES)`);
    assert.ok(!scopes.some((s) => s.startsWith("automation:")));
  }
  for (const s of OPERATOR_ONLY_SCOPES) assert.ok((ALL_SCOPES as string[]).includes(s) || s === "webhooks" || s === "gmail", s);
  assert.ok(ROLE_SCOPES.viewer.every((s) => ROLE_SCOPES.member.includes(s)) && ROLE_SCOPES.member.every((s) => ROLE_SCOPES.admin.includes(s)));
  assert.deepEqual(scopesForRole("viewer"), ["ask", "search", "citations", "sessions", "graph", "gaps", "calendar", "sources"]);
  for (const bad of [undefined, null, "root", "Admin", "", 1, {}, ["admin"]]) assert.deepEqual(scopesForRole(bad), []);
  const copy = scopesForRole("admin"); copy.push("hosting"); assert.ok(!ROLE_SCOPES.admin.includes("hosting"), "callers get a copy");
});

test("without userAccounts deps the cookie is ignored and /auth, /admin are not mounted (API keys unchanged)", async () => {
  const s = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore({ k: { tenantId: "tA", scopes: ["ask"] } }) }));
  try {
    const a = await fetch(s.baseUrl + "/system/status", { headers: { cookie: `${COOKIE_NAME_SECURE}=${"a".repeat(43)}`, connection: "close" } });
    assert.equal(a.status, 401); assert.equal((await a.json() as { message: string }).message, "missing or malformed Authorization: Bearer <key> header");
    assert.equal((await fetch(s.baseUrl + "/auth/login", { method: "POST", headers: { connection: "close" } })).status, 401, "no public /auth mount when the feature is off");
  } finally { await s.close(); }
});

test("/auth is a public perimeter with a soft principal and a terminal 404; /admin needs authentication (A3 mounts)", async () => {
  const r = await rig(); try {
    const anon = await r.call("POST", "/auth/login", { body: {} }); assert.equal(anon.status, 503); assert.equal(anon.json!.error, "not_implemented");
    const raw = (path: string) => new Promise<number>((res, rej) => { const q = http.request({ host: "127.0.0.1", port: Number(new URL(r.baseUrl).port), path, method: "GET", headers: { connection: "close" } }, (m) => { m.resume(); res(m.statusCode ?? 0); }); q.on("error", rej); q.end(); });
    for (const trick of ["/auth/../admin/users", "/auth/..%2Fask", "/auth/%2e%2e/system/status"]) assert.ok([404, 503].includes(await raw(trick)), `${trick} stays inside the /auth router and reaches no data route`);
    assert.equal((await r.call("GET", "/admin/users")).status, 401, "admin placeholder requires auth");
    assert.equal((await r.call("GET", "/admin/users", { cookie: await r.login("tA", "a1") })).status, 503);
    const t = await r.login("tA", "m1");
    assert.equal((await r.call("POST", "/auth/logout", { cookie: t, body: {} })).json!.error, "csrf", "a session principal on /auth is CSRF-checked");
    assert.equal((await r.call("POST", "/auth/login", { cookie: "x".repeat(43), body: {} })).status, 503, "a stale cookie does not block public routes");
    assert.equal((await r.call("GET", GET, { bearer: "key-ask" })).status === 401, false);
  } finally { await r.close(); }
});
