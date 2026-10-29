/**
 * apps/api/src/user-accounts/tokens.test.ts -- unit `ua-credentials`, UA-4 / UA-13 token secrecy (A2 acceptance 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { generateToken, hashToken, tokenMatches, checkTokenRecord, tokenExpiry, TOKEN_BYTES, TOKEN_TTL_MS } from "./tokens.js";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

test("generateToken yields 256 random bits, base64url, the raw value once and only its sha256 for storage", () => {
  const t = generateToken();
  assert.equal(TOKEN_BYTES, 32);
  assert.match(t.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(t.token, "base64url").length, 32);
  assert.equal(t.tokenHash, sha(t.token));
  assert.match(t.tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(!t.tokenHash.includes(t.token));
  assert.deepEqual(Object.keys(t).sort(), ["token", "tokenHash"]);
});

test("generateToken never repeats (2000 draws) and the bits are not obviously biased", () => {
  const seen = new Set<string>();
  const ones = new Array(8).fill(0);
  for (let i = 0; i < 2000; i += 1) {
    const { token } = generateToken();
    seen.add(token);
    const b = Buffer.from(token, "base64url")[0]!;
    for (let bit = 0; bit < 8; bit += 1) if (b & (1 << bit)) ones[bit] += 1;
  }
  assert.equal(seen.size, 2000);
  for (const n of ones) assert.ok(n > 800 && n < 1200, `bit frequency ${n} out of 2000`);
});

test("hashToken is sha256 hex of the token and refuses non-token input", () => {
  const t = generateToken();
  assert.equal(hashToken(t.token), t.tokenHash);
  for (const bad of ["", "short", "x".repeat(44), "x".repeat(42), `${"a".repeat(42)}!`, " ".repeat(43), "a".repeat(43) + "\n"]) {
    assert.equal(hashToken(bad), null, JSON.stringify(bad));
  }
  assert.equal(hashToken(undefined as unknown as string), null);
  assert.equal(hashToken(7 as unknown as string), null);
});

test("tokenMatches: right token true; wrong token, malformed token, malformed stored hash all false and never throw", () => {
  const a = generateToken();
  const b = generateToken();
  assert.equal(tokenMatches(a.token, a.tokenHash), true);
  assert.equal(tokenMatches(b.token, a.tokenHash), false);
  assert.equal(tokenMatches("nope", a.tokenHash), false);
  assert.equal(tokenMatches(a.token, "zz"), false);
  assert.equal(tokenMatches(a.token, a.tokenHash.toUpperCase()), false);
  assert.equal(tokenMatches(a.token, ""), false);
  assert.equal(tokenMatches(a.token, a.token), false, "a raw token is never accepted where a hash is expected");
  assert.equal(tokenMatches(null as unknown as string, a.tokenHash), false);
});

test("tokenMatches compares with timingSafeEqual (not === / Buffer.equals) on equal-length digests", async () => {
  const src = await readFile(new URL("./tokens.ts", import.meta.url), "utf8");
  assert.match(src, /timingSafeEqual/);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /[Hh]ash\s*===|===\s*\w*[Hh]ash|\.equals\(/);
});

test("tokenExpiry: verify-email 24 h, password-reset 1 h (UA-4, UA-21)", () => {
  assert.equal(TOKEN_TTL_MS.verify_email, 24 * 3600 * 1000);
  assert.equal(TOKEN_TTL_MS.password_reset, 3600 * 1000);
  const now = new Date("2026-10-29T00:00:00Z");
  assert.equal(tokenExpiry("verify_email", now).toISOString(), "2026-10-30T00:00:00.000Z");
  assert.equal(tokenExpiry("password_reset", now).toISOString(), "2026-10-29T01:00:00.000Z");
});

const NOW = new Date("2026-10-29T12:00:00Z");
type Purpose = "verify_email" | "password_reset";
function record(purpose: Purpose = "verify_email") {
  const t = generateToken();
  return { t, rec: { userId: "u1", purpose, tokenHash: t.tokenHash, expiresAt: new Date(NOW.getTime() + 1000), usedAt: null as Date | null } };
}

test("checkTokenRecord accepts a live, unused, matching token bound to (userId, purpose)", () => {
  const { t, rec } = record();
  assert.equal(checkTokenRecord(rec, t.token, { userId: "u1", purpose: "verify_email", now: NOW }), true);
});

test("checkTokenRecord refuses wrong token, wrong purpose, wrong user, expired, used -- all the same false", () => {
  const { t, rec } = record("verify_email");
  const other = generateToken();
  const call = (r: typeof rec, tok: string, o: Partial<{ userId: string; purpose: Purpose; now: Date }> = {}) =>
    checkTokenRecord(r, tok, { userId: "u1", purpose: "verify_email", now: NOW, ...o });
  assert.equal(call(rec, other.token), false);
  assert.equal(call(rec, t.token, { purpose: "password_reset" }), false, "a verify token cannot reset");
  assert.equal(call({ ...rec, purpose: "password_reset" }, t.token), false, "a reset token cannot verify");
  assert.equal(call(rec, t.token, { userId: "u2" }), false);
  assert.equal(call(rec, t.token, { now: new Date(rec.expiresAt.getTime()) }), false, "expiry instant is already expired");
  assert.equal(call(rec, t.token, { now: new Date(rec.expiresAt.getTime() + 1) }), false);
  assert.equal(call({ ...rec, usedAt: new Date(NOW.getTime() - 1) }, t.token), false);
  assert.equal(call({ ...rec, expiresAt: new Date("garbage") }, t.token), false);
});
