/**
 * apps/api/src/user-accounts/password.test.ts -- unit `ua-credentials`, UA-10 / UA-11 (A2 acceptance 1, 2, 6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import argon2 from "argon2";
import { hash, verify, needsRehash, PASSWORD_HASH_PARAMS } from "./password.js";

const PW = "correct horse battery staple";

test("hash then verify round-trips; wrong password, empty string and a 129-character string fail", async () => {
  const h = await hash(PW);
  assert.equal(await verify(h, PW), true);
  assert.equal(await verify(h, `${PW}x`), false);
  assert.equal(await verify(h, ""), false);
  assert.equal(await verify(h, "x".repeat(129)), false);
});

test("a 128-character password is accepted and hashes; 129 and empty are refused by hash()", async () => {
  const p = "p".repeat(64) + "q".repeat(64);
  const h = await hash(p);
  assert.equal(await verify(h, p), true);
  await assert.rejects(() => hash(p + "r"), RangeError);
  await assert.rejects(() => hash(""), RangeError);
  await assert.rejects(() => hash(undefined as unknown as string), TypeError);
});

test("the 129th character is judged on the true length, so a 129-character hash input cannot be verified as its 128 prefix", async () => {
  const p = "a".repeat(128);
  const h = await hash(p);
  assert.equal(await verify(h, p + "a"), false);
});

test("stored value is argon2id PHC, OWASP parameters, salted, and contains no password", async () => {
  const [h1, h2] = await Promise.all([hash(PW), hash(PW)]);
  assert.notEqual(h1, h2, "per-user random salt: two hashes of one password differ");
  assert.match(h1, /^\$argon2id\$v=19\$[mtp=0-9,]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
  assert.deepEqual(h1.split("$")[3]!.split(",").sort(), ["m=19456", "p=1", "t=2"]);
  assert.deepEqual(PASSWORD_HASH_PARAMS, { memoryCost: 19456, timeCost: 2, parallelism: 1, version: 19 });
  for (const w of PW.split(" ")) assert.ok(!h1.includes(w));
  assert.ok(!h1.includes(Buffer.from(PW).toString("base64")));
  const salt = h1.split("$")[4]!;
  assert.ok(Buffer.from(salt, "base64").length >= 16, "salt is at least 128 bits");
});

test("needsRehash: false for the current parameters; true for weaker m, t, p, a lower version, another algorithm, or garbage", async () => {
  const cur = await hash(PW);
  assert.equal(needsRehash(cur), false);
  const weakM = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 8192, timeCost: 2, parallelism: 1 });
  const weakT = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 19456, timeCost: 1, parallelism: 1 });
  const id = await argon2.hash(PW, { type: argon2.argon2i, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  assert.equal(needsRehash(weakM), true);
  assert.equal(needsRehash(weakT), true);
  assert.equal(needsRehash(id), true, "argon2i is not argon2id");
  assert.equal(needsRehash(cur.replace("v=19", "v=16")), true);
  assert.equal(needsRehash(cur.replace("p=1", "p=0")), true);
  for (const junk of ["", "not a hash", "$argon2id$", "$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123456", cur.slice(0, 30)]) {
    assert.equal(needsRehash(junk), true, junk);
  }
  assert.equal(needsRehash(undefined as unknown as string), true);
});

test("needsRehash is false for a hash made with stronger-than-current parameters (never downgrade silently)", async () => {
  const strong = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 32768, timeCost: 3, parallelism: 1 });
  assert.equal(needsRehash(strong), false);
  assert.equal(await verify(strong, PW), true);
});

test("a hash made with older weaker parameters still verifies (so a login can rehash it)", async () => {
  const old = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1 });
  assert.equal(await verify(old, PW), true);
  assert.equal(needsRehash(old), true);
});

test("verify never throws on a malformed stored hash and returns false", async () => {
  for (const junk of ["", "x", "$argon2id$v=19$m=1,t=1,p=1$$", "$bogus$v=19$m=1,t=1,p=1$AAAA$BBBB", "{}"]) {
    assert.equal(await verify(junk, PW), false, junk);
  }
});

test("verify(null, ...) (unknown account) does a full verify against a fixed dummy hash and is always false (UA-11)", async () => {
  const realish = await hash(PW);
  const t0 = process.hrtime.bigint();
  assert.equal(await verify(realish, "wrong password here"), false);
  const tWrong = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(await verify(null, "wrong password here"), false);   // warm the lazily built dummy hash
  const t1 = process.hrtime.bigint();
  assert.equal(await verify(null, "wrong password here"), false);
  const tDummy = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.ok(tDummy > 5, `dummy verify must cost a real argon2 run, took ${tDummy.toFixed(1)} ms`);
  assert.ok(tDummy < tWrong * 6 + 50 && tWrong < tDummy * 6 + 50, `wrong ${tWrong.toFixed(1)} ms vs dummy ${tDummy.toFixed(1)} ms`);
  assert.equal(await verify(null, ""), false);
  assert.equal(await verify(undefined, PW), false);
});

test("the dummy verify cannot succeed for any password (its plaintext is not guessable by callers)", async () => {
  for (const guess of ["", "dummy", "password", "dummy-password", "x".repeat(12), "lkb-dummy"]) assert.equal(await verify(null, guess), false);
});

test("passwords are NFKC-normalised: composed and decomposed spellings of one passphrase verify against each other", async () => {
  const composed = "café au lait 2026";
  const decomposed = "café au lait 2026";
  const h = await hash(composed);
  assert.equal(await verify(h, decomposed), true);
});

test("the module surface is exactly hash, verify, needsRehash (plus the published parameters)", async () => {
  const mod = await import("./password.js");
  assert.deepEqual(Object.keys(mod).sort(), ["PASSWORD_HASH_PARAMS", "hash", "needsRehash", "verify"]);
});

test("the argon2 dependency is exactly pinned (no range) and ships prebuilt linux-x64 glibc + musl binaries (the API image base needs no compile step)", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
  assert.match(pkg.dependencies.argon2 ?? "", /^\d+\.\d+\.\d+$/, "argon2 must be an exact version");
  const dir = new URL("../../node_modules/argon2/prebuilds/linux-x64/", import.meta.url);
  for (const f of ["argon2.glibc.node", "argon2.musl.node"]) assert.ok(readFileSync(new URL(f, dir)).length > 1000, f);
});
