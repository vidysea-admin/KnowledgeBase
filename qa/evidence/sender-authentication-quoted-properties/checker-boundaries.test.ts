import {test} from "node:test";
import assert from "node:assert/strict";
import {assessSender} from "../../../packages/core/src/domain/sender-authentication.js";

const sender = "a@ashoka.edu.in";
const assess = (value: string, extra: string[] = []) => assessSender([
  {name: "From", value: sender},
  ...[value, ...extra].map(value => ({name: "Authentication-Results", value})),
])?.senderAuthenticated;

test("independent: exact original quoted property stays literal and unrelated quoted metadata cannot grant alignment", () => {
  assert.equal(assess('mx.google.com; dmarc=pass header.from="ashoka.edu.in"'), true);
  assert.equal(assess('mx.google.com; dmarc=pass header.from="ASHOKA.EDU.IN"'), true);
  assert.equal(assess('mx.google.com; dmarc=pass header.from=evil.example policy.note="ashoka.edu.in"'), false);
  assert.equal(assess('mx.google.com; dkim=fail header.i=@evil.example policy.note="header.from=ashoka.edu.in"'), false);
});

test("independent: quotation cannot bypass method/receiver uniqueness or duplicate property decisions", () => {
  const valid = 'mx.google.com; dmarc=pass header.from="ashoka.edu.in"';
  assert.equal(assess(valid, ['mx.google.com; dmarc=fail header.from=ashoka.edu.in']), false);
  assert.equal(assess('mx.google.com; dmarc=fail header.from=ashoka.edu.in', [valid]), false);
  assert.equal(assess(valid + '; dmarc=fail header.from="ashoka.edu.in"'), false);
  assert.equal(assess('mx.google.com; dmarc=pass header.from="ashoka.edu.in" header.from="ashoka.edu.in"'), false);
  assert.equal(assess('mx.google.com.evil.example; dmarc=pass header.from="ashoka.edu.in"'), false);
  assert.equal(assess('mx.google.com; dkim=pass header.i="@ashoka.edu.in"; dmarc=fail header.from="ashoka.edu.in"'), false);
});

test("independent: quotes on ignored metadata must not allow a valid neighboring method to rescue malformed input", () => {
  const attacks = [
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x;y"',
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x\\y"',
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x y"',
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x\u0000y"',
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x"suffix',
    'mx.google.com; dkim=pass header.i=@ashoka.edu.in policy.note="x',
    'mx.google.com; spf=fail smtp.mailfrom="x; dmarc=pass header.from=ashoka.edu.in"',
  ];
  for (const value of attacks) assert.equal(assess(value), false, value);
  console.log("Independent quoted boundaries: 17 cases asserted (not a ledger corpus substitute)");
});
