import test from "node:test";
import assert from "node:assert/strict";
import { parseFromAddress, dmarcPassesFor } from "./onair-address.js";
import { senderIsGoogle } from "./onair-mail-source.js";

test("parseFromAddress: angle-addr, bare, quoted display names, comments", () => {
  assert.equal(parseFromAddress("Google Cloud <Events@Google.com>")?.email, "events@google.com");
  assert.equal(parseFromAddress("a@google.com")?.domain, "google.com");
  assert.equal(parseFromAddress('"Evil <a@google.com>" <a@evil.com>')?.domain, "evil.com");
  assert.equal(parseFromAddress('"x \\" <a@google.com>" <a@evil.com>')?.domain, "evil.com");
  assert.equal(parseFromAddress("Google (a@google.com) <a@evil.com>")?.domain, "evil.com");
});

test("parseFromAddress: ambiguous or malformed values are refused", () => {
  for (const bad of ['"Evil <a@google.com>"', "A <a@google.com>, B <b@evil.com>", "<a@google.com> <b@evil.com>", "A <a@google.com", "a@google.com>", "", "no address", "A <a@@google.com>", '"unterminated <a@google.com>']) {
    assert.equal(parseFromAddress(bad), undefined, bad);
  }
});

test("dmarcPassesFor: exact clause, exact domain, Google authserv-id only", () => {
  const ok = "mx.google.com; dkim=pass header.i=@google.com; dmarc=pass (p=REJECT) header.from=google.com";
  assert.equal(dmarcPassesFor([ok], "google.com"), true);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=pass header.from=mail.google.com"], "mail.google.com"), true);
  assert.equal(dmarcPassesFor([ok], "mail.google.com"), false);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=pass header.from=google.com.evil.com"], "google.com.evil.com"), false);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=pass header.from=evilgoogle.com"], "evilgoogle.com"), false);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=pass header.from=google.com.evil.com"], "google.com"), false);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=passX header.from=google.com"], "google.com"), false);
  assert.equal(dmarcPassesFor(["mx.google.com; dmarc=pass header.from=evil.com; spf=pass header.from=google.com"], "google.com"), false);
  assert.equal(dmarcPassesFor(["evil.example; dmarc=pass header.from=google.com"], "google.com"), false);
  assert.equal(dmarcPassesFor([], "google.com"), false);
  const pass = "mx.google.com; dmarc=pass header.from=google.com", fail = "mx.google.com; dmarc=fail header.from=google.com";
  assert.equal(dmarcPassesFor([pass, fail], "google.com"), false);
  assert.equal(dmarcPassesFor([fail, pass], "google.com"), false);
  assert.equal(dmarcPassesFor(["evil.example; dmarc=pass header.from=google.com", pass], "google.com"), false);
});

test("senderIsGoogle uses the real address parser", () => {
  assert.equal(senderIsGoogle('"x <a@google.com>" <a@evil.com>', true).ok, false);
  assert.equal(senderIsGoogle("A <a@google.com>", true).ok, true);
});
