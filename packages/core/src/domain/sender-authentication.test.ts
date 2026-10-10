/** ISS-322 / ISS-333 / ISS-CAPTURE-003 — assessSender: strict From parse + receiver-attributed authentication. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessSender, type MailHeader } from "./sender-authentication.js";

const GOOD = "mx.google.com; dkim=pass header.i=@ashoka.edu.in header.s=google header.b=Ab1+/=; " +
  "spf=pass (google.com: domain of host@ashoka.edu.in designates 1.2.3.4 as permitted sender) smtp.mailfrom=host@ashoka.edu.in; " +
  "dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=ashoka.edu.in";
const h = (from: string | undefined, ...ar: string[]): MailHeader[] => [
  ...(from === undefined ? [] : [{ name: "From", value: from }]), { name: "Subject", value: "s" },
  ...ar.map((value) => ({ name: "Authentication-Results", value })),
];
const auth = (headers: MailHeader[]) => assessSender(headers)?.senderAuthenticated;

test("a real-shaped Gmail header authenticates an aligned sender, and parses the From strictly", () => {
  assert.deepEqual(assessSender(h("Host <Host@Ashoka.edu.in>", GOOD)),
    { senderEmail: "host@ashoka.edu.in", senderDomain: "ashoka.edu.in", senderAuthenticated: true });
  assert.equal(auth(h("host@ashoka.edu.in", "MX.Google.com 1;\r\n dmarc=pass header.from=ashoka.edu.in")), true);
});

test("fallback without any dmarc result: exactly-aligned dkim or spf pass counts, nothing else", () => {
  assert.equal(auth(h("a@ashoka.edu.in", "mx.google.com; dkim=pass header.i=@ashoka.edu.in")), true);
  assert.equal(auth(h("a@ashoka.edu.in", "mx.google.com; spf=pass smtp.mailfrom=a@ashoka.edu.in")), true);
  assert.equal(auth(h("a@ashoka.edu.in", "mx.google.com; dkim=pass header.d=ashoka.edu.in")), true);
  for (const bad of ["dkim=pass header.i=@evil.com", "spf=pass smtp.mailfrom=a@evil.com", "dkim=pass header.i=@mail.ashoka.edu.in",
    "dkim=fail header.i=@ashoka.edu.in", "spf=softfail smtp.mailfrom=a@ashoka.edu.in", "dkim=neutral header.i=@ashoka.edu.in",
    "spf=pass smtp.mailfrom=a@b@ashoka.edu.in", "none"]) {
    assert.equal(auth(h("a@ashoka.edu.in", `mx.google.com; ${bad}`)), false, bad);
  }
});

test("a dmarc result decides: fail, wrong header.from, duplicate or ambiguous header.from all refuse", () => {
  const base = "mx.google.com; dkim=pass header.i=@ashoka.edu.in; spf=pass smtp.mailfrom=a@ashoka.edu.in; ";
  for (const dmarc of ["dmarc=fail header.from=ashoka.edu.in", "dmarc=pass header.from=evil.com", "dmarc=none header.from=ashoka.edu.in",
    "dmarc=pass header.from=ashoka.edu.in header.from=evil.com", "dmarc=pass", "dmarc=pass header.from=ashoka.edu.in; dmarc=pass header.from=ashoka.edu.in"]) {
    assert.equal(auth(h("a@ashoka.edu.in", base + dmarc)), false, dmarc);
  }
});

test("only the receiving provider's single header counts: missing, foreign, forged-copy, multiple all refuse", () => {
  assert.equal(auth(h("a@ashoka.edu.in")), false, "header absent");
  assert.equal(auth(h("a@ashoka.edu.in", GOOD.replace("mx.google.com", "mail.evil.com"))), false, "foreign authserv-id");
  assert.equal(auth(h("a@ashoka.edu.in", GOOD, GOOD)), false, "two receiver headers (injected copy + real)");
  assert.equal(auth(h("a@ashoka.edu.in", GOOD, "mx.google.com; dmarc=fail header.from=ashoka.edu.in")), false, "forged pass beside real fail");
  assert.equal(auth(h("a@ashoka.edu.in", "mx.google.com; dmarc=fail header.from=ashoka.edu.in", GOOD)), false, "real fail beside forged pass");
  assert.equal(auth([...h("a@ashoka.edu.in", "mail.evil.com; dmarc=pass header.from=ashoka.edu.in"),
    { name: "ARC-Authentication-Results", value: GOOD }]), false, "ARC header is not Authentication-Results");
  assert.equal(auth(h("a@ashoka.edu.in", "(mx.google.com) " + GOOD)), false, "id hidden behind a comment is not counted");
});

test("unparseable results fail closed", () => {
  for (const bad of ["mx.google.com; dmarc=pass header.from=ashoka.edu.in)", "mx.google.com; (dmarc=pass header.from=ashoka.edu.in",
    'mx.google.com; dmarc=pass header.from="ashoka.edu.in"', "mx.google.com; dmarc=pass\\ header.from=ashoka.edu.in",
    "mx.google.com; garbage", "mx.google.com; dmarc pass header.from=ashoka.edu.in", "mx.google.com dmarc=pass header.from=ashoka.edu.in",
    "mx.google.com; dmarc=fail (dmarc=pass header.from=ashoka.edu.in) header.from=ashoka.edu.in"]) {
    assert.equal(auth(h("a@ashoka.edu.in", bad)), false, bad);
  }
});

test("CAPTURE-003: ambiguous or malformed From is dropped (undefined), never given a first-@ domain", () => {
  for (const from of ["x@ashoka.edu.in@evil.com", "a@ashoka.edu.in.", "a@localhost", "", "no-at-sign",
    "a@ashoka.edu.in, b@evil.com", '"a@ashoka.edu.in" (x)', "a@ashoka.edu.in​", "@ashoka.edu.in", "a@-x.com"]) {
    assert.equal(assessSender(h(from, GOOD)), undefined, JSON.stringify(from));
  }
  assert.equal(assessSender([...h("a@ashoka.edu.in", GOOD), { name: "from", value: "b@evil.com" }]), undefined, "two From headers");
  assert.equal(assessSender(h(undefined, GOOD)), undefined, "no From header");
  assert.equal(assessSender(h('"x@ashoka.edu.in" <b@evil.com>', GOOD))?.senderDomain, "evil.com");
});
