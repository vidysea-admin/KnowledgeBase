// user-accounts A3 (D-206): session cookie attributes (UA-15), strict parsing, CSRF (UA-16), trust proxy (UA-23).
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Request } from "express";
import { applyTrustProxy, parseTrustProxyHops } from "../composition/integrations/user-accounts.js";
import { clearSessionCookie, cookiePath, cookieMode, normalizeBasePath, readSessionCookie, sessionCookie } from "./cookie.js";
import { checkCsrf, csrfTokenFor } from "./csrf.js";
import { generateToken } from "./tokens.js";

const PROD = { basePath: "/knowledgebase", production: true };
const req = (headers: Record<string, string>, remote = "203.0.113.9"): Request => ({ headers, header: (n: string) => headers[n.toLowerCase()], socket: { remoteAddress: remote } }) as unknown as Request;

test("Set-Cookie attributes are exact for base path /knowledgebase, / and a trailing slash (A3 #3)", () => {
  const { token } = generateToken();
  const expectFor = (basePath: string, path: string) => assert.equal(sessionCookie(token, cookieMode(PROD, req({})), { basePath, production: true }),
    `__Secure-lkb_sid=${token}; Max-Age=34560000; Path=${path}; HttpOnly; Secure; SameSite=Strict`);
  expectFor("/knowledgebase", "/knowledgebase/api");
  expectFor("/", "/api");
  expectFor("", "/api");
  expectFor("/knowledgebase/", "/knowledgebase/api");
  assert.doesNotMatch(sessionCookie(token, cookieMode(PROD, req({})), PROD), /Domain/i);
  assert.equal(normalizeBasePath("//kb//"), "/kb");
  for (const bad of ["/a/../b", "/a b", "/a;b", "http://x", "/a?b"]) assert.throws(() => normalizeBasePath(bad), /APP_BASE_PATH/);
});

test("clear cookie uses the same name and path and expires immediately", () => {
  const c = clearSessionCookie(cookieMode(PROD, req({})), PROD);
  assert.equal(c, "__Secure-lkb_sid=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/knowledgebase/api; HttpOnly; Secure; SameSite=Strict");
  assert.equal(cookiePath(PROD), "/knowledgebase/api");
});

test("Secure is dropped only outside production on loopback; never from request headers (downgrade attempt)", () => {
  const dev = { basePath: "", production: false };
  assert.deepEqual(cookieMode(dev, req({}, "127.0.0.1")), { secure: false, name: "lkb_sid" });
  assert.deepEqual(cookieMode(dev, req({}, "::1")), { secure: false, name: "lkb_sid" });
  assert.equal(cookieMode(dev, req({}, "203.0.113.9")).secure, true, "non-loopback keeps Secure even in dev");
  assert.equal(cookieMode(dev, req({ "x-forwarded-proto": "https" }, "127.0.0.1")).secure, true);
  for (const h of <Record<string, string>[]>[{ "x-forwarded-proto": "http" }, { host: "localhost" }, { "x-forwarded-for": "127.0.0.1" }]) {
    assert.deepEqual(cookieMode(PROD, req(h, "127.0.0.1")), { secure: true, name: "__Secure-lkb_sid" }, `production ignores ${JSON.stringify(h)}`);
  }
  assert.doesNotMatch(sessionCookie(generateToken().token, { secure: false, name: "lkb_sid" }, dev), /Secure/);
});

test("cookie parsing is strict: one cookie of the right name, token-shaped, length capped", () => {
  const { token } = generateToken(), other = generateToken().token, name = "__Secure-lkb_sid";
  const read = (cookie: string | undefined) => readSessionCookie(req(cookie === undefined ? {} : { cookie }), PROD);
  assert.equal(read(`a=1; ${name}=${token}; b=2`), token);
  assert.equal(read(undefined), null);
  assert.equal(read(`${name}=${token}; ${name}=${other}`), null, "duplicate name is ambiguous: refused");
  assert.equal(read(`lkb_sid=${token}`), null, "unprefixed name is not accepted in production");
  assert.equal(read(`${name}=short`), null);
  assert.equal(read(`${name}=${token}x`), null);
  assert.equal(read(`${name}="${token}"`), null);
  assert.equal(read(`${name}=${token}; ` + "x=".padEnd(5000, "y")), null, "over-long header refused");
  assert.equal(readSessionCookie(req({ cookie: `lkb_sid=${token}` }, "127.0.0.1"), { basePath: "", production: false }), token);
});

test("CSRF: Origin must be allowed and X-LKB-CSRF must equal the HMAC of the session id (UA-16)", () => {
  const cfg = { secret: "s".repeat(40), allowedOrigins: ["https://kb.example.org", "http://localhost:5173/"] };
  const good = csrfTokenFor("sess-1", cfg.secret);
  const call = (headers: Record<string, string>, sid = "sess-1") => checkCsrf(req(headers), sid, cfg);
  assert.equal(call({ origin: "https://kb.example.org", "x-lkb-csrf": good }), true);
  assert.equal(call({ origin: "http://localhost:5173", "x-lkb-csrf": good }), true, "trailing slash in config is normalised");
  assert.equal(call({ "x-lkb-csrf": good }), false, "missing Origin");
  assert.equal(call({ origin: "null", "x-lkb-csrf": good }), false);
  assert.equal(call({ origin: "https://evil.example", "x-lkb-csrf": good }), false);
  assert.equal(call({ origin: "https://kb.example.org" }), false, "missing header");
  assert.equal(call({ origin: "https://kb.example.org", "x-lkb-csrf": good + "a" }), false);
  assert.equal(call({ origin: "https://kb.example.org", "x-lkb-csrf": good }, "sess-2"), false, "token is bound to the session id");
  assert.notEqual(csrfTokenFor("sess-1", "t".repeat(40)), good, "token depends on the server secret");
  assert.throws(() => csrfTokenFor("s", "short"), /AUTH_CSRF_SECRET/);
});

test("trust proxy: only the configured hop count is trusted; spoofed X-Forwarded-For does not change req.ip (A3 #8)", async () => {
  assert.deepEqual(["", undefined, "0", "1", "2", " 3 "].map((v) => parseTrustProxyHops(v)), [0, 0, 0, 1, 2, 3]);
  for (const bad of ["-1", "x", "1.5", "99", "true", "1,2"]) assert.equal(parseTrustProxyHops(bad), 0, `invalid ${bad} fails closed to 0`);
  const logs: string[] = [];
  const probe = async (hops: string | undefined, xff: string) => {
    const app = express(); applyTrustProxy(app, hops, { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m) });
    app.get("/ip", (r, s) => { s.json({ ip: r.ip }); });
    const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
    try { const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/ip`, { headers: { "x-forwarded-for": xff, connection: "close" } }); return (await res.json() as { ip: string }).ip; }
    finally { await new Promise((r) => server.close(r)); }
  };
  assert.match(await probe("0", "1.1.1.1, 2.2.2.2"), /127\.0\.0\.1/, "0 hops: header ignored");
  assert.match(await probe(undefined, "1.1.1.1"), /127\.0\.0\.1/, "unset: header ignored");
  assert.equal(await probe("1", "6.6.6.6, 2.2.2.2"), "2.2.2.2", "1 hop: spoofed left entry ignored");
  assert.equal(await probe("2", "6.6.6.6, 5.5.5.5, 2.2.2.2"), "5.5.5.5", "2 hops");
  assert.ok(logs.some((l) => /trust proxy/i.test(l) && /hops=1/.test(l)), "startup line prints the effective setting");
});
