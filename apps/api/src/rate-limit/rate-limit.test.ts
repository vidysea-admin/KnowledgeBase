// golive-launch-prep L2 (contract qa/contracts/api-rate-limit.md): createRateLimiter keys a SESSION principal on (tenant, user);
// every other principal keeps today's key (tenant for an API key, the normalised IP for a request with no authenticated principal).
// Every test drives the real middleware chain the server uses (requireAuth -> createRateLimiter) over HTTP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { isValidTenantId, requireAuth, type SessionAuthenticator, type VerifiedKey } from "../auth.js";
import { createRateLimiter, type RateLimitOptions } from "../rate-limit.js";

/**
 * Stand-in for the cookie authenticator: the header "x-test-session" (JSON [tenant, user, sessionId?]) plays the role of a valid
 * cookie, and the stand-in fills `req.auth` the way the real one does, from the stored session row.
 */
function fakeSession(role = "viewer"): SessionAuthenticator {
  return {
    authenticate: async (req) => {
      const raw = req.header("x-test-session");
      if (raw === undefined) return { kind: "none" };
      const [tenantId, userId, sessionId] = JSON.parse(raw) as [string, string, string | null];
      const auth: VerifiedKey = { tenantId, scopes: ["ask"], principal: "session", userRole: role, sessionId: sessionId ?? `s-${userId}`, ...(userId === "" ? {} : { userId }) };
      return { kind: "ok", auth };
    },
    attach: (_req, _res, next) => next(),
    guard: (_req, _res, next) => next(),
  };
}

async function fixture(opts: RateLimitOptions | undefined, run: (url: string) => Promise<void>, authed = true) {
  const app = express();
  app.use(express.json());
  if (authed) {
    app.use(requireAuth({ verify: async (key) => (key.startsWith("key-") ? { tenantId: key.slice(4), scopes: ["ask"] } : null) }, fakeSession()));
  }
  app.use(createRateLimiter(opts));
  app.all("/ping", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))); }
}

type Init = { headers: Record<string, string> };
const asUser = (tenant: string, user: string, extra: Record<string, string> = {}, sessionId: string | null = null): Init =>
  ({ headers: { "x-test-session": JSON.stringify([tenant, user, sessionId]), ...extra } });
const asKey = (tenant: string): Init => ({ headers: { authorization: `Bearer key-${tenant}` } });
const status = async (url: string, init: Init) => (await fetch(`${url}/ping`, init)).status;
async function burst(url: string, init: Init, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(await status(url, init));
  return out;
}

test("two viewers browsing at once in one tenant each get the full allowance; A exhausting theirs never 429s B [L2-C1]", async () => {
  await fixture({ max: 3 }, async (url) => {
    assert.deepEqual(await burst(url, asUser("toc", "alice"), 4), [200, 200, 200, 429]);
    // Alice is now over the limit; Bob (same tenant, different user) is untouched and gets all three.
    assert.deepEqual(await burst(url, asUser("toc", "bob"), 4), [200, 200, 200, 429]);
    assert.equal(await status(url, asUser("toc", "alice")), 429, "Alice stays limited");
  });
});

test("one viewer signing in again on a second browser shares ONE bucket: the key is the user, never the session id [L2-C1]", async () => {
  await fixture({ max: 3 }, async (url) => {
    assert.deepEqual(await burst(url, asUser("toc", "alice", {}, "session-phone"), 3), [200, 200, 200]);
    assert.equal(await status(url, asUser("toc", "alice", {}, "session-laptop")), 429, "a new login does not reset the allowance");
    assert.equal(await status(url, asUser("toc", "alice", {}, "session-phone-after-relogin")), 429);
    assert.equal(await status(url, asUser("toc", "bob", {}, "session-phone")), 200, "a different user with the same session id is still a different bucket");
  });
});

test("the default allowance stays 60 per minute for a session user [L2-C2]", async () => {
  await fixture(undefined, async (url) => {
    const codes = await burst(url, asUser("toc", "carol"), 61);
    assert.equal(codes.slice(0, 60).every((c) => c === 200), true);
    assert.equal(codes[60], 429);
    assert.equal(await status(url, asUser("toc", "dave")), 200, "a second user still has a full bucket");
  });
});

test("one API-key client keeps the per-tenant bucket and is not touched by session users in the same tenant [L2-C2]", async () => {
  await fixture({ max: 3 }, async (url) => {
    assert.deepEqual(await burst(url, asKey("toc"), 4), [200, 200, 200, 429]);
    // A session user of the SAME tenant has their own bucket, so the key client's exhaustion does not reach them.
    assert.deepEqual(await burst(url, asUser("toc", "alice"), 3), [200, 200, 200]);
    // And a second key of that tenant still shares the tenant bucket with the first (today's behaviour).
    assert.equal(await status(url, asKey("toc")), 429);
    // Another tenant's key is untouched.
    assert.deepEqual(await burst(url, asKey("other"), 3), [200, 200, 200]);
  });
});

test("an anonymous burst (no authenticated principal) is still limited per client address [L2-C2]", async () => {
  await fixture({ max: 3 }, async (url) => {
    assert.deepEqual(await burst(url, { headers: {} }, 4), [200, 200, 200, 429]);
  }, false);
});

test("a 429 keeps the existing body and Retry-After, and names no user or session [L2-C2][L2-I2]", async () => {
  await fixture({ max: 1, windowMs: 120_000 }, async (url) => {
    await status(url, asUser("toc-tenant", "alice-user", {}, "sess-secret-id"));
    const res = await fetch(`${url}/ping`, asUser("toc-tenant", "alice-user", {}, "sess-secret-id"));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "120");
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "rate_limited", message: "too many requests — slow down and retry after the window" });
    const everything = `${text}\n${[...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n")}`;
    for (const id of ["alice-user", "sess-secret-id", "toc-tenant"]) assert.ok(!everything.includes(id), `${id} is not echoed`);
  });
});

test("a viewer cannot pick or share another bucket with a forged header, query or body value [L2-C3]", async () => {
  await fixture({ max: 2 }, async (url) => {
    const forged = {
      "x-tenant-id": "someone-else", "x-user-id": "bob", "x-userid": "bob", "x-session-id": "s-bob", "x-forwarded-user": "bob",
      "content-type": "application/json",
    };
    const body = JSON.stringify({ userId: "bob", user: "bob", tenantId: "someone-else", sessionId: "s-bob", principal: "key" });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(`${url}/ping?userId=bob&tenantId=x&sessionId=s-bob`, { method: "POST", body, ...asUser("toc", "alice", forged) })).status);
    assert.deepEqual(codes, [200, 200, 429], "Alice's forged identifiers still land in Alice's own bucket");
    assert.equal(await status(url, asUser("toc", "bob")), 200, "Bob was not charged for Alice's forged requests");
    // A forged "session-looking" request with no valid credential is not a session at all: it never reaches the limiter.
    assert.equal(await status(url, { headers: { "x-user-id": "alice", "x-tenant-id": "toc", cookie: "lkb_sid=forged" } }), 401);
  });
});

test("users of one tenant stay separate even when ids contain separators or equal a tenant id; the session key can never be a tenant-only key [L2-C4]", async () => {
  await fixture({ max: 1 }, async (url) => {
    // Every user below lives in tenant "T". Each must get a FRESH bucket after the others are exhausted (on a tenant-only key the second would 429).
    const users = ["u1", 'u1","x', "u1:x", "T", "T:u1", '["T","u1"]', "u1/", "\u0001"];
    for (const u of users) assert.equal(await status(url, asUser("T", u)), 200, `first request of user ${JSON.stringify(u)}`);
    for (const u of users) assert.equal(await status(url, asUser("T", u)), 429, `second request of user ${JSON.stringify(u)}`);
    // Pairs that would collide under a naive "tenant:user" join stay separate.
    assert.equal(await status(url, asUser("a:b", "c")), 200);
    assert.equal(await status(url, asUser("a", "b:c")), 200, "(a:b, c) and (a, b:c) are different pairs");
    assert.equal(await status(url, asUser("a:b", "c")), 429);
    assert.equal(await status(url, asUser('a","b', "c")), 200);
    assert.equal(await status(url, asUser("a", 'b","c')), 200, "a separator inside the tenant id cannot be moved into the user id");
    // A user whose id equals another tenant's id does not touch that tenant's API-key bucket, and the reverse.
    assert.equal(await status(url, asUser("tenantA", "tenantB")), 200);
    assert.equal(await status(url, asKey("tenantB")), 200, "the key bucket of tenantB is still fresh");
    assert.equal(await status(url, asKey("tenantB")), 429);
    assert.equal(await status(url, asUser("tenantA", "tenantB")), 429);
    // API-key tenants named like every plausible session key spelling never land in a session bucket.
    for (const alias of ["T:u1", "T:user:u1", "T/u1", "Tu1", "session:T:u1", JSON.stringify(["T", "u1"]), JSON.stringify(["session", "T", "u1"])]) {
      assert.equal(await status(url, asKey(alias)), 200, `key tenant ${alias} has its own bucket`);
    }
    // The one spelling that WOULD alias a session bucket starts with a control character, which no API key tenant may carry.
    assert.equal(isValidTenantId(String.fromCharCode(1) + JSON.stringify(["T", "u1"])), false);
  });
});

test("a session principal with no user id falls back to today's tenant key rather than escaping the limit [L2-C2]", async () => {
  await fixture({ max: 2 }, async (url) => {
    assert.deepEqual(await burst(url, asUser("toc", ""), 3), [200, 200, 429]);
    assert.equal(await status(url, asKey("toc")), 429, "it shares the tenant bucket with the tenant's API keys");
  });
});
