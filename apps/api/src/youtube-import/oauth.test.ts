import { test } from "node:test";
import { get as httpGet } from "node:http";
import assert from "node:assert/strict";
import { assertOfficialUrl } from "./http.js";
import type { Http } from "./http.js";
import { buildAuthUrl, createTokenProvider, loadClient, pkcePair, runLogin, YT_SCOPE } from "./oauth.js";

/** Plain node:http GET with its own non-pooled agent: no shared fetch pool left open at exit (--test-force-exit). */
const fetch = (url: string, _?: unknown) => new Promise<{ status: number }>((resolve, reject) => {
  httpGet(url, { agent: false, headers: { connection: "close" } }, (res) => { res.resume(); res.on("end", () => resolve({ status: res.statusCode ?? 0 })); }).on("error", reject);
});
const CLOSE = undefined;
const client = { clientId: "cid", clientSecret: "csecret" };

test("official-host guard: only Google OAuth and YouTube Data API v3 are reachable", () => {
  assert.ok(assertOfficialUrl("https://www.googleapis.com/youtube/v3/captions/abc?tfmt=vtt"));
  assert.ok(assertOfficialUrl("https://oauth2.googleapis.com/token"));
  for (const bad of ["https://www.youtube.com/api/timedtext?v=x", "https://www.youtube.com/youtubei/v1/player", "https://www.googleapis.com/drive/v3/files", "http://www.googleapis.com/youtube/v3/captions", "https://evil.example/youtube/v3/"]) {
    assert.throws(() => assertOfficialUrl(bad), /official|v3/, bad);
  }
});

test("loadClient: env first, then client_secret.json installed/web, else a clear error", () => {
  assert.deepEqual(loadClient({ LKB_YT_CLIENT_ID: "a", LKB_YT_CLIENT_SECRET: "b" }, () => undefined, "x"), { clientId: "a", clientSecret: "b" });
  const file = JSON.stringify({ installed: { client_id: "i", client_secret: "s" } });
  assert.deepEqual(loadClient({}, (p) => (p === "def.json" ? file : undefined), "def.json"), { clientId: "i", clientSecret: "s" });
  assert.throws(() => loadClient({}, () => undefined, "none.json"), /no OAuth client/);
});

test("auth URL: force-ssl scope, offline access, PKCE S256, state and loopback redirect", () => {
  const { challenge } = pkcePair();
  const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:5555/callback", state: "st", challenge }));
  assert.equal(u.hostname, "accounts.google.com");
  assert.equal(u.searchParams.get("scope"), YT_SCOPE);
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("state"), "st");
  assert.equal(u.searchParams.get("redirect_uri"), "http://127.0.0.1:5555/callback");
});

test("token provider: refreshes with the stored refresh token, caches until near expiry, no refresh token no call", async () => {
  const calls: string[] = [];
  const http: Http = async (r) => { calls.push(r.body ?? ""); return { status: 200, body: JSON.stringify({ access_token: `at${calls.length}`, expires_in: 3600 }) }; };
  let now = 1_000_000;
  const get = createTokenProvider({ client, http, now: () => now, store: { load: async () => ({ refreshToken: "rt" }), save: async () => {} } });
  assert.equal(await get(), "at1"); assert.equal(await get(), "at1");
  assert.match(calls[0]!, /grant_type=refresh_token/); assert.match(calls[0]!, /refresh_token=rt/);
  now += 3_600_000; assert.equal(await get(), "at2");
  const none = createTokenProvider({ client, http, store: { load: async () => undefined, save: async () => {} } });
  await assert.rejects(none(), /login/);
});

test("login: prints URL (never tokens), checks state over real loopback, stores the refresh token", async () => {
  const printed: string[] = []; let saved: { refreshToken: string } | undefined; let tokenBody = "";
  const http: Http = async (r) => { tokenBody = r.body ?? ""; return { status: 200, body: JSON.stringify({ access_token: "SECRET_AT", refresh_token: "SECRET_RT" }) }; };
  const done = runLogin({ client, http, print: (l) => printed.push(l), store: { load: async () => undefined, save: async (t) => { saved = t; } } });
  while (printed.length < 2) await new Promise((r) => setTimeout(r, 5));
  const auth = new URL(printed[1]!);
  const redirect = auth.searchParams.get("redirect_uri")!;
  const rejected = assert.rejects(done, /denied|state/);
  const bad = await fetch(`${redirect}?code=c&state=WRONG`, CLOSE);
  assert.equal(bad.status, 400);
  await rejected;
  // a fresh login with the right state succeeds
  printed.length = 0;
  const ok = runLogin({ client, http, print: (l) => printed.push(l), store: { load: async () => undefined, save: async (t) => { saved = t; } } });
  while (printed.length < 2) await new Promise((r) => setTimeout(r, 5));
  const u2 = new URL(printed[1]!);
  const res = await fetch(`${u2.searchParams.get("redirect_uri")}?code=thecode&state=${u2.searchParams.get("state")}`, CLOSE);
  assert.equal(res.status, 200);
  await ok;
  assert.equal(saved?.refreshToken, "SECRET_RT");
  assert.match(tokenBody, /code=thecode/); assert.match(tokenBody, /code_verifier=/);
  assert.ok(!printed.join("\n").includes("SECRET"), "tokens must never be printed");
});

test("token endpoint failure: neither the thrown error nor any log carries the response body", async () => {
  const body = JSON.stringify({ error: "invalid_grant", access_token: "LEAK_AT", refresh_token: "LEAK_RT", client_secret: "LEAK_CS" });
  const http: Http = async () => ({ status: 400, body });
  const leaks = (s: string) => /LEAK_|access_token|refresh_token|client_secret/.test(s);
  const get = createTokenProvider({ client, http, store: { load: async () => ({ refreshToken: "rt" }), save: async () => {} } });
  await assert.rejects(get(), (e: Error) => { assert.match(e.message, /HTTP 400 invalid_grant/); assert.ok(!leaks(e.message)); return true; });

  const printed: string[] = [];
  const login = runLogin({ client, http, print: (l) => printed.push(l), store: { load: async () => undefined, save: async () => {} } });
  const outcome = login.then(() => undefined, (e: Error) => e);
  while (printed.length < 2) await new Promise((r) => setTimeout(r, 5));
  const u = new URL(printed[1]!);
  await fetch(`${u.searchParams.get("redirect_uri")}?code=c&state=${u.searchParams.get("state")}`, CLOSE);
  const err = await outcome;
  assert.ok(err instanceof Error && /HTTP 400/.test(err.message) && !leaks(err.message));
  assert.ok(!leaks(printed.join("\n")));
});
