/**
 * ISS-CAPTURE-001 regression: isTrustedSender decides from a strictly parsed email; a caller-supplied
 * domain never grants trust. Section 1 re-runs the issue's recorded reproductions verbatim (D-015).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedSender, loadTrustedSenderConfig } from "./auto-record-policy.js";
import { parseStrictEmail } from "./join-rules.js";

const cfg = loadTrustedSenderConfig({} as NodeJS.ProcessEnv); // defaults: 2 emails, 2 domains

// Recorded: qa/issues.capture.jsonl ISS-CAPTURE-001 evidence (a, b) and the checker verdict
// qa/verdicts/t037-auto-join-rules-engine.md "ISS-CAPTURE-001 review" (c, the live Gmail shape).
const RECORDED: Array<[string, string | undefined, string | undefined]> = [
  ["row: multi-@, no domain", "evil@x.com@ashoka.edu.in", undefined],
  ["row: explicit domain vs unrelated email", "evil@x.com", "ashoka.edu.in"],
  ["verdict: From x@ashoka.edu.in@evil.com with upstream senderDomain split('@')[1]", "x@ashoka.edu.in@evil.com", "ashoka.edu.in"],
];

test("ISS-CAPTURE-001 recorded reproductions (verbatim): all refused", () => {
  let refused = 0;
  for (const [label, email, domain] of RECORDED) {
    const r = isTrustedSender(email, domain, cfg);
    if (!r) refused++;
    assert.equal(r, false, label);
  }
  assert.equal(`${refused}/${RECORDED.length}`, "3/3");
  console.log(`ISS-CAPTURE-001: ${refused}/${RECORDED.length} refused`);
});

test("additional: supplied-domain / email mismatch in both directions", () => {
  assert.equal(isTrustedSender("a@evil.com", "ashoka.edu.in", cfg), false);
  assert.equal(isTrustedSender("a@ashoka.edu.in", "evil.com", cfg), false);
  assert.equal(isTrustedSender("karunn@vidysea.com", "evil.com", cfg), false); // trusted email, wrong domain
  assert.equal(isTrustedSender(undefined, "ashoka.edu.in", cfg), false); // bare domain, no email
  assert.equal(isTrustedSender("", "ashoka.edu.in", cfg), false);
  assert.equal(isTrustedSender("a@ashoka.edu.in", "", cfg), false); // supplied-but-empty disagrees
});

test("additional: multi-@, display-name, whitespace, control, empty-part forms are refused", () => {
  const bad = [
    "a@b@ashoka.edu.in", "ashoka.edu.in@evil.com@ashoka.edu.in", "x@ashoka.edu.in@", "@@ashoka.edu.in",
    "Name <a@ashoka.edu.in>", "<a@ashoka.edu.in>", '"a@ashoka.edu.in" <b@evil.com>', "a@ashoka.edu.in (x)", "a@ashoka.edu.in, b@evil.com",
    " a@ashoka.edu.in", "a@ashoka.edu.in ", "a@ashoka.edu.in\r\n", "a@ashoka.edu.in\r\nBcc: b@evil.com", "a b@ashoka.edu.in",
    "a@ashoka.edu.in\0", "a\0@ashoka.edu.in", "a\t@ashoka.edu.in", "a@ashoka.edu.in​", "a​@ashoka.edu.in",
    "@ashoka.edu.in", "a@", "a@.", "a@ashoka", "ashoka.edu.in", "a@ashoka.edu.in.", "a@.ashoka.edu.in", "a@ashoka..edu.in",
    "a@ashoka.edu.in.evil.com", "a@evil-ashoka.edu.in", "a@sub.ashoka.edu.in", "a@xashoka.edu.in", "karunn@vidysea.com.evil.com",
    "a@ashоka.edu.in", /* Cyrillic o */ "a@ashoka.edu.іn", /* Cyrillic i */ "a@аshoka.edu.in", "ａ@ashoka.edu.in",
  ];
  for (const e of bad) {
    assert.equal(isTrustedSender(e, undefined, cfg), false, JSON.stringify(e));
    assert.equal(isTrustedSender(e, "ashoka.edu.in", cfg), false, `${JSON.stringify(e)} + domain`);
  }
  for (const nonString of [null, 1, {}, [], true] as unknown[]) assert.equal(isTrustedSender(nonString as string, undefined, cfg), false);
});

test("additional: mixed-case is accepted (case-insensitive), supplied domain compared after normalisation", () => {
  assert.equal(isTrustedSender("A@ASHOKA.EDU.IN", undefined, cfg), true);
  assert.equal(isTrustedSender("a@Ashoka.Edu.In", "ASHOKA.EDU.IN", cfg), true);
  assert.equal(isTrustedSender("a@ashoka.edu.in", "ashoka.edu.in.", cfg), true); // agrees after normalisation
  assert.equal(isTrustedSender("a@ashoka.edu.in", undefined, cfg), true);
});

test("legitimately trusted senders from the default config remain trusted", () => {
  const trusted: Array<[string, string | undefined]> = [
    ["karunn@vidysea.com", undefined], ["KARUNN@VIDYSEA.COM", undefined], ["karunn@vidysea.com", "vidysea.com"],
    ["umeshsugara@vidysea.com", undefined], ["umeshsugara@vidysea.com", "vidysea.com"],
    ["someone@theoutreachcollective.in", undefined], ["someone@theoutreachcollective.in", "theoutreachcollective.in"],
    ["first.last+tag@ashoka.edu.in", "ashoka.edu.in"], ["someone@ashoka.edu.in", undefined],
  ];
  for (const [e, d] of trusted) assert.equal(isTrustedSender(e, d, cfg), true, `${e} / ${d}`);
  // still not trusted, as before: other vidysea.com mailboxes (email-level entries only), vendors
  assert.equal(isTrustedSender("other@vidysea.com", undefined, cfg), false);
  assert.equal(isTrustedSender("x@zoom.us", undefined, cfg), false);
});

test("parseStrictEmail shape", () => {
  assert.deepEqual(parseStrictEmail("A@B.Com"), { email: "a@b.com", domain: "b.com" });
  assert.equal(parseStrictEmail("a@b.com "), undefined);
  assert.equal(parseStrictEmail("a@b.com."), undefined);
  assert.equal(parseStrictEmail(undefined), undefined);
});
