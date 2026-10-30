/**
 * apps/api/src/user-accounts/password-policy.test.ts -- unit `ua-credentials`, UA-3 (A2 acceptance 4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPassword, PASSWORD_MIN, PASSWORD_MAX, commonPasswordCount } from "./password-policy.js";

const EMAIL = "alice.smith@example.com";
const reasons = (pw: unknown, email?: string) => {
  const r = checkPassword(pw, email === undefined ? {} : { email });
  return r.ok ? [] : r.reasons;
};

test("bounds are 12..128 characters", () => {
  assert.equal(PASSWORD_MIN, 12);
  assert.equal(PASSWORD_MAX, 128);
});

test("rejects shorter than 12 and longer than 128, accepts exactly 12 and exactly 128", () => {
  assert.deepEqual(reasons("Tr0ub4dor&3"), ["too_short"]);
  assert.deepEqual(reasons(""), ["too_short"]);
  assert.deepEqual(reasons("x".repeat(129)), ["too_long"]);
  assert.deepEqual(reasons("zq7vk3mw9pl4"), []);
  assert.equal(checkPassword("zq7vk3mw9pl4".padEnd(128, "k")).ok, true);
});

test("length counts characters (code points), not UTF-16 units or bytes", () => {
  assert.deepEqual(reasons("\u{1F600}".repeat(11)), ["too_short"]);
  assert.deepEqual(reasons("\u{1F600}".repeat(12)), []);
  assert.deepEqual(reasons("\u{1F600}".repeat(128)), []);
  assert.deepEqual(reasons("\u{1F600}".repeat(129)), ["too_long"]);
});

test("accepts passphrases with spaces and non-ASCII, and no composition rules", () => {
  for (const pw of ["correct horse battery staple", "我爱你的美丽家园世界你好", "münchen im herbst schön", "aaaaaaaaaaaaaaab", "alllowercaseletters", "1029384756102938"]) {
    assert.deepEqual(reasons(pw), [], pw);
  }
});

test("rejects exact deny-list hits case-insensitively, after NFKC, and with a trailing digit/symbol run", () => {
  for (const pw of ["administrator", "ADMINISTRATOR", "ｐａｓｓｗｏｒｄpassword", "passwordpassword", "password1234", "Password123456", "password2026!!", "qwertyuiop123", "iloveyou12345", "1q2w3e4r5t6y7u"]) {
    assert.ok(reasons(pw).includes("common"), pw);
  }
});

test("does not reject a long passphrase merely because it contains a common word", () => {
  for (const pw of ["my password is a long sentence", "dragon-flies-over-the-river", "monkey business at the zoo 2026"]) {
    assert.deepEqual(reasons(pw), [], pw);
  }
});

test("rejects a password containing the email local part (case-insensitive), a +tag-free form and any dotless form", () => {
  assert.ok(reasons("xx-alice.smith-yy-77", EMAIL).includes("contains_email"));
  assert.ok(reasons("XX-ALICE.SMITH-YY-77", EMAIL).includes("contains_email"));
  assert.ok(reasons("zzzaliceSMITH.", "ALICE.SMITH@example.com").includes("contains_email") === false, "dot removed is not the local part");
  assert.ok(reasons("hello-bob-the-builder", "bob+news@example.com").includes("contains_email"), "part before +tag");
  assert.ok(reasons("hello-bob+news-builder", "bob+news@example.com").includes("contains_email"), "whole local part");
  assert.deepEqual(reasons("a-different-phrase-0042", EMAIL), []);
});

test("short local parts (under 3 characters) do not make normal passwords unusable", () => {
  assert.deepEqual(reasons("an ordinary passphrase", "an@example.com"), []);
});

test("the email argument is normalised first (spacing, case, fullwidth)", () => {
  assert.ok(reasons("xx-alice.smith-yy", "  ALICE.Smith@Example.com ").includes("contains_email"));
  assert.ok(reasons("xx-alice.smith-yy", "Ａlice.smith＠example.com").includes("contains_email"));
});

test("non-strings and unpaired surrogates are invalid, never a throw", () => {
  for (const bad of [undefined, null, 12345678901234, {}, ["abcdefghijklmnop"]]) {
    const r = checkPassword(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.reasons, ["invalid"]);
  }
  assert.deepEqual(reasons("abcdefghijkl\uD800mnop"), ["invalid"]);
});

test("multiple failures are all reported, in a closed vocabulary, with no password echo", () => {
  const r = checkPassword("alice", { email: "alice@example.com" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.reasons, ["too_short", "contains_email"]);
    assert.ok(!JSON.stringify(r).includes("alice@"));
  }
});

test("the bundled deny list is a checked-in data file, lowercase, de-duplicated, one entry per line, and sizeable", () => {
  const raw = readFileSync(new URL("./common-passwords.txt", import.meta.url), "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length >= 400, `only ${lines.length} entries`);
  assert.equal(new Set(lines).size, lines.length, "no duplicates");
  for (const l of lines) assert.equal(l, l.normalize("NFKC").toLowerCase(), l);
  assert.equal(commonPasswordCount(), lines.length);
});
