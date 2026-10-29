/**
 * apps/api/src/user-accounts/email.test.ts -- unit `ua-credentials`, UA-2 (email normalisation) and A2 acceptance 3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, parseEmail, emailLocalPart } from "./email.js";

const ok: Array<[string, string, string]> = [
  ["plain", "alice@example.com", "alice@example.com"],
  ["upper case", "Alice@Example.COM", "alice@example.com"],
  ["surrounding spaces", "  alice@example.com \t\n", "alice@example.com"],
  ["ideographic space padding (NFKC makes it a space)", "　alice@example.com　", "alice@example.com"],
  ["fullwidth letters (NFKC)", "ＡＢ@x.com", "ab@x.com"],
  ["fullwidth @ and dot (NFKC)", "ab＠x．com", "ab@x.com"],
  ["composed vs decomposed e-acute", "josé@example.com", "josé@example.com"],
  ["precomposed e-acute", "JosÉ@example.com", "josé@example.com"],
  ["plus tag is kept (no provider-specific folding)", "a+tag@example.com", "a+tag@example.com"],
  ["dotted local part is kept", "a.b@example.com", "a.b@example.com"],
  ["capital I with dot above stays stable", "İ@x.com", "i̇@x.com"],
  [
    "exactly 254 chars",
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
  ],
];
for (const [name, input, expected] of ok) {
  test(`normalizeEmail accepts and canonicalises: ${name}`, () => {
    assert.equal(normalizeEmail(input), expected);
    assert.equal(parseEmail(input).ok, true);
    assert.equal(normalizeEmail(expected), expected, "idempotent");
  });
}

const bad: Array<[string, unknown, string]> = [
  ["empty", "", "empty"],
  ["whitespace only", "   ", "empty"],
  ["non-string", 42, "invalid"],
  ["null", null, "invalid"],
  ["undefined", undefined, "invalid"],
  ["no at sign", "alice.example.com", "format"],
  ["two at signs", "a@b@example.com", "format"],
  ["empty local part", "@example.com", "format"],
  ["empty domain", "alice@", "format"],
  ["domain with empty label", "alice@example..com", "format"],
  ["domain leading dot", "alice@.example.com", "format"],
  ["domain trailing dot", "alice@example.com.", "format"],
  ["inner space", "al ice@example.com", "format"],
  ["angle brackets (display-name form)", "Alice <alice@example.com>", "format"],
  ["comma list", "a@x.com,b@y.com", "format"],
  ["semicolon list", "a@x.com;b@y.com", "format"],
  ["control: NUL", "al\u0000ice@example.com", "control"],
  ["control: LF (header injection)", "alice@example.com\nBcc: x@y.com", "control"],
  ["control: CR", "alice@example.com\rX", "control"],
  ["control: TAB inside", "ali\tce@example.com", "control"],
  ["control: DEL", "ali\u007fce@example.com", "control"],
  ["format char: zero width space", "ali​ce@example.com", "control"],
  ["format char: right-to-left override", "alice@exa‮mple.com", "control"],
  ["line separator", "ali ce@example.com", "control"],
  ["lone surrogate", "ali\uD800ce@example.com", "invalid"],
  ["255 chars (over length)", `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`, "too_long"],
  ["huge input", `${"a".repeat(5000)}@example.com`, "too_long"],
  ["local part over 64", `${"a".repeat(65)}@example.com`, "too_long"],
];
for (const [name, input, reason] of bad) {
  test(`normalizeEmail rejects: ${name}`, () => {
    const r = parseEmail(input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, reason);
    assert.equal(normalizeEmail(input), null);
  });
}

test("normalizeEmail is idempotent over every accepted table input and over odd Unicode", () => {
  for (const [, input] of ok) {
    const once = normalizeEmail(input)!;
    assert.equal(normalizeEmail(once), once);
  }
  for (const s of ["ẞ@x.com", "ß@x.com", "ﬁ@x.com", "Ω@x.com", "K@x.com", "İİ@x.com", "Å@x.com"]) {
    const once = normalizeEmail(s);
    assert.notEqual(once, null, s);
    assert.equal(normalizeEmail(once!), once, `idempotent for ${JSON.stringify(s)}`);
  }
});

test("different spellings of one address collapse to a single key (what the unique index relies on)", () => {
  const keys = new Set(["alice@example.com", " ALICE@EXAMPLE.COM ", "Ａlice@example.com", "alice＠example.com"].map(normalizeEmail));
  assert.deepEqual([...keys], ["alice@example.com"]);
});

test("emailLocalPart returns the part before the single @ of a normalised address", () => {
  assert.equal(emailLocalPart("alice.smith@example.com"), "alice.smith");
  assert.equal(emailLocalPart("a+tag@example.com"), "a+tag");
});
