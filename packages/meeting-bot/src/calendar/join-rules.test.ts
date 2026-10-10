import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateJoinRules, recordApproval, recordOptOut, ruleSetFromTrustedSenderConfig, validateJoinRuleSet,
  JoinRuleSetValidationError, validateJoinRuleState, EMPTY_JOIN_RULE_STATE, normalizeDomain, normalizeEmail,
  type JoinRuleSet, type JoinRuleState, type JoinRuleEvent, type JoinRule,
} from "./join-rules.js";
import { isTrustedSender, loadTrustedSenderConfig } from "./auto-record-policy.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const ZOOM = "https://us02web.zoom.us/j/123456789";
const ev = (organizer: string | undefined, over: Partial<JoinRuleEvent> = {}): JoinRuleEvent =>
  ({ id: "e1", organizer, meetingUrl: MEET, ...over });
const set = (rules: JoinRule[] = [], ownDomains: string[] = []): JoinRuleSet => ({ version: 1, ownDomains, rules });
const allow = (id: string, match: JoinRule["match"]): JoinRule => ({ id, effect: "allow", match });
const deny = (id: string, match: JoinRule["match"]): JoinRule => ({ id, effect: "deny", match });

test("rule dimension: sender email", () => {
  const rs = set([allow("a", { email: "boss@example.com" })]);
  assert.deepEqual(evaluateJoinRules(ev("boss@example.com"), rs), { action: "join", reason: "allow-rule", ruleId: "a" });
  assert.equal(evaluateJoinRules(ev("other@example.com"), rs).action, "needs-approval");
});

test("rule dimension: sender domain (exact and true subdomain)", () => {
  const rs = set([allow("d", { domain: "example.com" })]);
  assert.equal(evaluateJoinRules(ev("a@example.com"), rs).ruleId, "d");
  assert.equal(evaluateJoinRules(ev("a@mail.example.com"), rs).ruleId, "d");
  assert.equal(evaluateJoinRules(ev("a@x.y.example.com"), rs).action, "join");
  const exact = set([allow("d", { domain: "example.com", subdomains: false })]);
  assert.equal(evaluateJoinRules(ev("a@mail.example.com"), exact).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("a@example.com"), exact).action, "join");
});

test("domain look-alikes never match", () => {
  const rs = set([allow("d", { domain: "example.com" })]);
  for (const s of ["a@evil-example.com", "a@evilexample.com", "a@example.com.evil.org", "a@example.co", "a@notexample.com", "a@example.com.au"]) {
    assert.equal(evaluateJoinRules(ev(s), rs).action, "needs-approval", s);
  }
});

test("rule dimension: platform", () => {
  const rs = set([allow("p", { platform: "zoom" })]);
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: ZOOM }), rs).ruleId, "p");
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: MEET }), rs).action, "needs-approval");
  const denyUnknown = set([deny("u", { platform: "unknown" }), allow("all", { domain: "x.com" })]);
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: "https://random.example.org/room" }), denyUnknown).action, "skip");
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: "not a url" }), denyUnknown).reason, "deny-rule");
});

test("rule dimension: internal vs external organiser", () => {
  const rs = set([allow("in", { scope: "internal" }), deny("ext-zoom", { scope: "external", platform: "zoom" })], ["corp.com"]);
  assert.equal(evaluateJoinRules(ev("a@corp.com"), rs).ruleId, "in");
  assert.equal(evaluateJoinRules(ev("a@eng.corp.com"), rs).ruleId, "in");
  assert.equal(evaluateJoinRules(ev("a@evilcorp.com"), rs).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("a@corp.com.evil.org"), rs).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("a@other.com", { meetingUrl: ZOOM }), rs).ruleId, "ext-zoom");
  assert.equal(evaluateJoinRules(ev("a@corp.com", { meetingUrl: ZOOM }), rs).ruleId, "in");
  // scope cannot be established without a sender
  assert.equal(evaluateJoinRules(ev(undefined), set([allow("in", { scope: "internal" })], ["corp.com"])).action, "needs-approval");
});

test("combined matcher fields are ANDed; empty matcher never matches", () => {
  const rs = set([allow("both", { domain: "x.com", platform: "zoom" })]);
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: ZOOM }), rs).action, "join");
  assert.equal(evaluateJoinRules(ev("a@x.com"), rs).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("a@y.com", { meetingUrl: ZOOM }), rs).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("a@x.com"), set([allow("empty", {})])).action, "needs-approval");
});

test("precedence table", () => {
  const st: JoinRuleState = { approvedSenders: ["a@x.com"], approvedDomains: ["x.com"], optedOutEventIds: [] };
  const rs = set([deny("deny-a", { email: "a@x.com" }), allow("allow-x", { domain: "x.com" })]);
  // 1 opt-out beats deny, allow, approval
  const optedOut = recordOptOut(st, "e1");
  assert.deepEqual(evaluateJoinRules(ev("a@x.com"), rs, optedOut), { action: "skip", reason: "meeting-opt-out", ruleId: "opt-out:e1" });
  assert.equal(evaluateJoinRules(ev("a@x.com"), set([allow("allow-x", { domain: "x.com" })]), optedOut).reason, "meeting-opt-out");
  // 2 deny beats allow and approval
  assert.deepEqual(evaluateJoinRules(ev("a@x.com"), rs, st), { action: "skip", reason: "deny-rule", ruleId: "deny-a" });
  assert.equal(evaluateJoinRules(ev("b@x.com"), set([deny("d", { domain: "x.com" })]), st).reason, "deny-rule");
  // first deny in list order decides
  assert.equal(evaluateJoinRules(ev("a@x.com"), set([deny("d1", { domain: "x.com" }), deny("d2", { email: "a@x.com" })])).ruleId, "d1");
  // 3 cancelled, 4 no url
  assert.equal(evaluateJoinRules(ev("a@x.com", { cancelled: true }), set([allow("a", { domain: "x.com" })])).reason, "cancelled");
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: undefined }), set([allow("a", { domain: "x.com" })])).reason, "no-meeting-url");
  assert.equal(evaluateJoinRules(ev("a@x.com", { meetingUrl: "  " }), set([allow("a", { domain: "x.com" })])).reason, "no-meeting-url");
  // 5 unverifiable sender beats allow rule that has no sender dimension
  assert.equal(evaluateJoinRules(ev(undefined), set([allow("p", { platform: "meet" })]), st).reason, "sender-unverifiable");
  // 6 allow beats approval (reason shows which)
  assert.deepEqual(evaluateJoinRules(ev("a@x.com"), set([allow("allow-x", { domain: "x.com" })]), st), { action: "join", reason: "allow-rule", ruleId: "allow-x" });
  // 7 approval
  assert.deepEqual(evaluateJoinRules(ev("a@x.com"), set(), { ...EMPTY_JOIN_RULE_STATE, approvedSenders: ["a@x.com"] }),
    { action: "join", reason: "approved-sender", ruleId: "approval:sender:a@x.com" });
  assert.deepEqual(evaluateJoinRules(ev("z@x.com"), set(), { ...EMPTY_JOIN_RULE_STATE, approvedDomains: ["x.com"] }),
    { action: "join", reason: "approved-domain", ruleId: "approval:domain:x.com" });
  // 8 default-deny
  assert.deepEqual(evaluateJoinRules(ev("a@x.com"), set()), { action: "needs-approval", reason: "no-matching-rule", ruleId: "default-deny" });
  assert.equal(evaluateJoinRules(ev("a@x.com"), set([allow("o", { email: "o@x.com" })])).action, "needs-approval");
});

test("default-deny: no rules, no state is never join", () => {
  for (const o of ["a@x.com", "", "garbage", undefined]) assert.notEqual(evaluateJoinRules(ev(o), set()).action, "join");
});

test("approve-once flow", () => {
  const rs = set();
  const first = evaluateJoinRules(ev("host@uni.edu", { id: "w1" }), rs, EMPTY_JOIN_RULE_STATE);
  assert.equal(first.action, "needs-approval");
  const st = recordApproval(EMPTY_JOIN_RULE_STATE, { kind: "sender", value: "Host@Uni.edu " });
  const next = evaluateJoinRules(ev("host@uni.edu", { id: "w2" }), rs, st);
  assert.deepEqual(next, { action: "join", reason: "approved-sender", ruleId: "approval:sender:host@uni.edu" });
  // sender-level approval does not extend to another sender at the same domain
  assert.equal(evaluateJoinRules(ev("other@uni.edu", { id: "w3" }), rs, st).action, "needs-approval");
  // domain-level approval is exact-domain only
  const dst = recordApproval(EMPTY_JOIN_RULE_STATE, { kind: "domain", value: "uni.edu" });
  assert.equal(evaluateJoinRules(ev("other@uni.edu"), rs, dst).action, "join");
  assert.equal(evaluateJoinRules(ev("other@sub.uni.edu"), rs, dst).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("other@evil-uni.edu"), rs, dst).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("other@uni.edu.evil.org"), rs, dst).action, "needs-approval");
});

test("opt-out is per meeting and beats approval and allow rule", () => {
  const rs = set([allow("a", { domain: "uni.edu" })]);
  let st = recordApproval(EMPTY_JOIN_RULE_STATE, { kind: "sender", value: "host@uni.edu" });
  st = recordOptOut(st, "w1");
  assert.equal(evaluateJoinRules(ev("host@uni.edu", { id: "w1" }), rs, st).action, "skip");
  assert.equal(evaluateJoinRules(ev("host@uni.edu", { id: "w2" }), rs, st).action, "join");
});

test("case and whitespace variants", () => {
  const rs = set([allow("a", { email: "  Boss@Example.COM " }), allow("d", { domain: " Corp.Org. " })]);
  assert.equal(evaluateJoinRules(ev("  BOSS@example.com\t"), rs).ruleId, "a");
  assert.equal(evaluateJoinRules(ev("x@CORP.org"), rs).ruleId, "d");
  assert.equal(evaluateJoinRules(ev("x@Sub.Corp.Org."), rs).ruleId, "d");
  assert.equal(evaluateJoinRules(ev("a@x.com"), set(), { ...EMPTY_JOIN_RULE_STATE, approvedSenders: [" A@X.com "] }).action, "join");
  assert.equal(normalizeEmail(" A@B.Co "), "a@b.co");
  assert.equal(normalizeDomain("Example.COM."), "example.com");
});

test("senderEmail overrides organizer", () => {
  const rs = set([allow("a", { email: "real@x.com" })]);
  assert.equal(evaluateJoinRules(ev("other@y.com", { senderEmail: "real@x.com" }), rs).action, "join");
  assert.equal(evaluateJoinRules(ev("real@x.com", { senderEmail: "other@y.com" }), rs).action, "needs-approval");
});

test("malformed or missing sender data never yields join", () => {
  const permissive = set([allow("all-meet", { platform: "meet" }), allow("in", { scope: "internal" }), allow("d", { domain: "x.com" })], ["x.com"]);
  const st: JoinRuleState = { approvedSenders: ["a@x.com"], approvedDomains: ["x.com"], optedOutEventIds: [] };
  const bad: unknown[] = [undefined, null, "", "   ", "no-at-sign", "a@", "@x.com", "a@@x.com", "a@b@x.com", "a b@x.com", "Name <a@x.com>",
    "a@x", "a@x..com", "a@-x.com", 42, {}, ["a@x.com"], "a@x.com\n@evil.org", "a@x.com, b@evil.org"];
  for (const b of bad) {
    const d = evaluateJoinRules({ id: "e1", organizer: b as string, meetingUrl: MEET }, permissive, st);
    assert.notEqual(d.action, "join", String(JSON.stringify(b)));
    assert.equal(d.action, "needs-approval");
  }
  assert.equal(evaluateJoinRules(ev(undefined, { meetingUrl: 5 as unknown as string }), permissive, st).action, "skip");
});

test("state helpers are pure", () => {
  const frozen: JoinRuleState = Object.freeze({
    approvedSenders: Object.freeze(["a@x.com"]), approvedDomains: Object.freeze([]), optedOutEventIds: Object.freeze([]),
  }) as JoinRuleState;
  const snapshot = JSON.stringify(frozen);
  const s1 = recordApproval(frozen, { kind: "sender", value: "b@x.com" });
  const s2 = recordApproval(frozen, { kind: "domain", value: "y.org" });
  const s3 = recordOptOut(frozen, "e9");
  assert.equal(JSON.stringify(frozen), snapshot);
  assert.deepEqual(s1.approvedSenders, ["a@x.com", "b@x.com"]);
  assert.deepEqual(s2.approvedDomains, ["y.org"]);
  assert.deepEqual(s3.optedOutEventIds, ["e9"]);
  assert.notEqual(s1, frozen);
  assert.notEqual(s1.approvedDomains, frozen.approvedDomains);
  // idempotent, no duplicates
  assert.deepEqual(recordApproval(s1, { kind: "sender", value: "B@X.com" }).approvedSenders, ["a@x.com", "b@x.com"]);
  assert.deepEqual(recordOptOut(s3, "e9").optedOutEventIds, ["e9"]);
  // invalid input throws and leaves state untouched
  assert.throws(() => recordApproval(frozen, { kind: "sender", value: "nope" }));
  assert.throws(() => recordApproval(frozen, { kind: "domain", value: "evil/.com" }));
  assert.throws(() => recordApproval(frozen, { kind: "weird" as "sender", value: "a@x.com" }));
  assert.throws(() => recordOptOut(frozen, ""));
  assert.equal(JSON.stringify(frozen), snapshot);
});

test("evaluation does not mutate its inputs and is deterministic", () => {
  const rs = Object.freeze(set([allow("a", { domain: "x.com" })])) as JoinRuleSet;
  const e = Object.freeze(ev("a@x.com"));
  const d1 = evaluateJoinRules(e, rs, EMPTY_JOIN_RULE_STATE);
  assert.deepEqual(evaluateJoinRules(e, rs, EMPTY_JOIN_RULE_STATE), d1);
});

test("decision type carries no registration outcome", () => {
  const d = evaluateJoinRules(ev("a@x.com"), set([allow("a", { domain: "x.com" })]));
  assert.deepEqual(Object.keys(d).sort(), ["action", "reason", "ruleId"]);
});

test("validator accepts and normalises a valid rule set (JSON round trip)", () => {
  const raw = JSON.parse(JSON.stringify({
    version: 1, ownDomains: [" Corp.COM "],
    rules: [{ id: "r1", effect: "deny", match: { email: "A@B.com" } },
      { id: "r2", effect: "allow", match: { domain: "X.org", subdomains: false, platform: "zoom" } },
      { id: "r3", effect: "allow", match: { scope: "internal" } }],
  }));
  const rs = validateJoinRuleSet(raw);
  assert.deepEqual(rs.ownDomains, ["corp.com"]);
  assert.equal(rs.rules[0]!.match.email, "a@b.com");
  assert.deepEqual(rs.rules[1]!.match, { domain: "x.org", subdomains: false, platform: "zoom" });
  assert.deepEqual(validateJoinRuleSet(JSON.parse(JSON.stringify(rs))), rs);
});

test("validator rejects bad rule sets with a clear error", () => {
  const ok = { version: 1, ownDomains: [], rules: [{ id: "r", effect: "allow", match: { domain: "x.com" } }] };
  const mut = (f: (o: any) => void) => { const o = JSON.parse(JSON.stringify(ok)); f(o); return o; };
  const cases: [string, unknown, RegExp][] = [
    ["not object", [], /\$: must be an object/],
    ["null", null, /must be an object/],
    ["unknown top field", mut((o) => { o.extra = 1; }), /unknown field "extra"/],
    ["bad version", mut((o) => { o.version = 2; }), /\$\.version/],
    ["ownDomains not array", mut((o) => { o.ownDomains = "x.com"; }), /\$\.ownDomains/],
    ["bad own domain", mut((o) => { o.ownDomains = ["nodot"]; }), /ownDomains\[0\]/],
    ["rules not array", mut((o) => { o.rules = {}; }), /\$\.rules/],
    ["rule not object", mut((o) => { o.rules = ["x"]; }), /rules\[0\]/],
    ["unknown rule field", mut((o) => { o.rules[0].priority = 1; }), /unknown field "priority"/],
    ["missing id", mut((o) => { delete o.rules[0].id; }), /rules\[0\]\.id/],
    ["duplicate id", mut((o) => { o.rules.push({ ...o.rules[0] }); }), /duplicate id/],
    ["bad effect", mut((o) => { o.rules[0].effect = "maybe"; }), /effect/],
    ["unknown matcher kind", mut((o) => { o.rules[0].match = { organizerName: "x" }; }), /unknown field "organizerName"/],
    ["empty matcher", mut((o) => { o.rules[0].match = {}; }), /at least one/],
    ["bad email", mut((o) => { o.rules[0].match = { email: "nope" }; }), /match\.email/],
    ["bad domain", mut((o) => { o.rules[0].match = { domain: "*.x.com" }; }), /match\.domain/],
    ["subdomains without domain", mut((o) => { o.rules[0].match = { email: "a@b.com", subdomains: true }; }), /subdomains/],
    ["subdomains not boolean", mut((o) => { o.rules[0].match = { domain: "x.com", subdomains: "yes" }; }), /subdomains/],
    ["bad platform", mut((o) => { o.rules[0].match = { platform: "skype" }; }), /platform/],
    ["bad scope", mut((o) => { o.rules[0].match = { scope: "both" }; }), /scope/],
  ];
  for (const [name, input, re] of cases) {
    assert.throws(() => validateJoinRuleSet(input), (e: unknown) => e instanceof JoinRuleSetValidationError && re.test(e.message), name);
  }
});

test("adapter: rule set from TrustedSenderConfig is equivalent to isTrustedSender", () => {
  const cfg = loadTrustedSenderConfig({} as NodeJS.ProcessEnv);
  const rs = ruleSetFromTrustedSenderConfig(cfg);
  assert.deepEqual(validateJoinRuleSet(JSON.parse(JSON.stringify(rs))), rs);
  const senders = [
    "karunn@vidysea.com", "KARUNN@Vidysea.COM", "umeshsugara@vidysea.com", "someone@vidysea.com", "x@theoutreachcollective.in",
    "x@ashoka.edu.in", "X@ASHOKA.EDU.IN", "x@sub.ashoka.edu.in", "x@evil-ashoka.edu.in", "x@ashoka.edu.in.evil.org", "x@zoom.us",
    "x@zoho.com", "x@gmail.com", "karunn@vidysea.com.evil.org", "xkarunn@vidysea.com", "", "nobody", "x@",
  ];
  for (const s of senders) {
    const expected = isTrustedSender(s, undefined, cfg);
    const d = evaluateJoinRules(ev(s), rs);
    assert.equal(d.action === "join", expected, `${s} (expected trusted=${expected}, got ${d.action})`);
    if (!expected) assert.equal(d.action, "needs-approval", s);
  }
  // custom config with an uppercased entry still matches (adapter/engine normalise)
  const custom = ruleSetFromTrustedSenderConfig({ emails: ["Zed@Z.com"], domains: ["Q.org"] });
  assert.equal(evaluateJoinRules(ev("zed@z.com"), custom).action, "join");
  assert.equal(evaluateJoinRules(ev("a@q.org"), custom).action, "join");
  assert.equal(evaluateJoinRules(ev("a@sub.q.org"), custom).action, "needs-approval");
  assert.equal(ruleSetFromTrustedSenderConfig(cfg, ["vidysea.com"]).ownDomains[0], "vidysea.com");
});

test("adapter: documented deliberate divergence from isTrustedSender on malformed senders", () => {
  const cfg = { emails: [], domains: ["ashoka.edu.in"] };
  const rs = ruleSetFromTrustedSenderConfig(cfg);
  // legacy took everything after the LAST @; the engine rejects multi-@ addresses outright.
  // ISS-CAPTURE-001: isTrustedSender used to return true here (the unsafe behaviour this test
  // documented); it now rejects multi-@ too, so the divergence on this input is closed.
  assert.equal(isTrustedSender("evil@x.com@ashoka.edu.in", undefined, cfg), false);
  assert.equal(evaluateJoinRules(ev("evil@x.com@ashoka.edu.in"), rs).action, "needs-approval");
  // legacy does not trim; the engine does
  assert.equal(isTrustedSender("a@ashoka.edu.in ", undefined, cfg), false);
  assert.equal(evaluateJoinRules(ev("a@ashoka.edu.in "), rs).action, "join");
});

// ---- Fix cycle 2: C10 / ISS-CAPTURE-002 — the evaluator itself fails closed on invalid data ----
const bypass = (rs: unknown, sender: string, st?: unknown, over: Partial<JoinRuleEvent> = {}) =>
  evaluateJoinRules(ev(sender, over), rs as JoinRuleSet, st as JoinRuleState | undefined);
const INVALID = { action: "needs-approval", reason: "invalid-rule-set", ruleId: "invalid-rule-set" };

test("ISS-CAPTURE-002 recorded reproductions (verbatim): none joins, all report invalid-rule-set", () => {
  let refused = 0; let total = 0;
  const check = (d: { action: string; reason: string }, label: string) => {
    total++;
    assert.notEqual(d.action, "join", label);
    assert.deepEqual(d, INVALID, label);
    refused++;
  };
  // 1-7: ownDomains ['corp.com'], single allow {scope:S}, external sender a@other.com, empty state
  for (const S of ["Internal", "INTERNAL", "both", "", null, 1, true]) {
    const rs = { version: 1, ownDomains: ["corp.com"], rules: [{ id: "a", effect: "allow", match: { scope: S } }] };
    check(bypass(rs, "a@other.com", EMPTY_JOIN_RULE_STATE), `scope=${JSON.stringify(S)} external`);
  }
  // 8-14: same S with the matching INTERNAL sender (recorded as needs-approval; must still never join)
  for (const S of ["Internal", "INTERNAL", "both", "", null, 1, true]) {
    const rs = { version: 1, ownDomains: ["corp.com"], rules: [{ id: "a", effect: "allow", match: { scope: S } }] };
    check(bypass(rs, "a@corp.com", EMPTY_JOIN_RULE_STATE), `scope=${JSON.stringify(S)} internal`);
  }
  // 15: subdomains given as a string
  check(bypass({ version: 1, ownDomains: [], rules: [{ id: "r", effect: "allow", match: { domain: "x.com", subdomains: "false" } }] },
    "a@sub.x.com", EMPTY_JOIN_RULE_STATE), "subdomains string");
  // 16: invalid deny must not let a later allow win
  check(bypass({ version: 1, ownDomains: [], rules: [{ id: "d", effect: "deny", match: { domain: "*.evil.com" } },
    { id: "a", effect: "allow", match: { domain: "evil.com" } }] }, "a@evil.com", EMPTY_JOIN_RULE_STATE), "invalid deny *.evil.com");
  // 17: invalid deny scope "Internal" followed by an allow
  check(bypass({ version: 1, ownDomains: ["corp.com"], rules: [{ id: "d", effect: "deny", match: { scope: "Internal" } },
    { id: "a", effect: "allow", match: { domain: "other.com" } }] }, "a@other.com", EMPTY_JOIN_RULE_STATE), "invalid deny scope Internal");
  assert.equal(`ISS-CAPTURE-002: ${refused}/${total} refused`, "ISS-CAPTURE-002: 17/17 refused");
});

test("fail closed: other invalid rule-set shapes never join", () => {
  const good = { id: "g", effect: "allow", match: { domain: "x.com" } };
  const mk = (over: Record<string, unknown>) => ({ version: 1, ownDomains: [], rules: [good], ...over });
  const bad: [string, unknown][] = [
    ["null set", null], ["undefined set", undefined], ["array set", []], ["string set", "x"],
    ["bad version", mk({ version: 2 })], ["unknown top field", mk({ extra: 1 })],
    ["rules not array", mk({ rules: { 0: good, length: 1 } })], ["ownDomains not array", mk({ ownDomains: "x.com" })],
    ["bad ownDomain", mk({ ownDomains: ["nodot"] })],
    ["duplicate id", mk({ rules: [good, { ...good }] })],
    ["unknown effect", mk({ rules: [{ ...good, effect: "ALLOW" }] })],
    ["unknown matcher kind", mk({ rules: [{ ...good, match: { domain: "x.com", organizerName: "z" } }] })],
    ["unknown rule field", mk({ rules: [{ ...good, priority: 1 }] })],
    ["missing match", mk({ rules: [{ id: "g", effect: "allow" }] })],
    ["empty matcher", mk({ rules: [{ ...good, match: {} }] })],
    ["bad platform case", mk({ rules: [{ ...good, match: { platform: "Zoom" } }] })],
    ["non-string platform", mk({ rules: [{ ...good, match: { platform: 1 } }] })],
    ["bad email", mk({ rules: [{ ...good, match: { email: "x.com" } }] })],
    ["non-string domain", mk({ rules: [{ ...good, match: { domain: 5 } }] })],
    ["subdomains true without domain", mk({ rules: [{ ...good, match: { email: "a@x.com", subdomains: true } }] })],
    ["numeric subdomains", mk({ rules: [{ ...good, match: { domain: "x.com", subdomains: 0 } }] })],
    ["valid rule plus one broken rule", mk({ rules: [good, { id: "z", effect: "allow", match: { scope: "bad" } }] })],
  ];
  for (const [name, rs] of bad) assert.deepEqual(bypass(rs, "a@x.com", EMPTY_JOIN_RULE_STATE), INVALID, name);
  // the internal-sender inversion case: an intended "internal" rule typo'd must not join either population
  const typo = mk({ ownDomains: ["corp.com"], rules: [{ id: "a", effect: "allow", match: { scope: "Internal" } }] });
  for (const s of ["a@corp.com", "a@other.com", "a@eng.corp.com"]) assert.equal(bypass(typo, s).action, "needs-approval", s);
});

test("fail closed: malformed state never joins; valid opt-out still skips", () => {
  const rs = set([allow("a", { domain: "x.com" })]);
  const okState = { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] };
  const bad: [string, unknown][] = [
    ["null state", null], ["array state", []], ["string state", "x"],
    ["missing approvedDomains", { approvedSenders: [], optedOutEventIds: [] }],
    ["senders not array", { ...okState, approvedSenders: "a@x.com" }],
    ["bad approved sender", { ...okState, approvedSenders: ["nope"] }],
    ["non-string approved sender", { ...okState, approvedSenders: [5] }],
    ["bad approved domain", { ...okState, approvedDomains: ["*.x.com"] }],
    ["opt-outs not array", { ...okState, optedOutEventIds: "e2" }],
    ["empty opt-out id", { ...okState, optedOutEventIds: [""] }],
    ["non-string opt-out id", { ...okState, optedOutEventIds: [1] }],
    ["unknown state field", { ...okState, extra: [] }],
  ];
  for (const [name, st] of bad) assert.deepEqual(bypass(rs, "a@x.com", st), INVALID, name);
  assert.equal(bypass(rs, "a@x.com", { ...okState, approvedSenders: ["nope"], optedOutEventIds: ["e1"] }).reason, "meeting-opt-out");
  // opt-out is honoured even when the rule set is invalid
  assert.deepEqual(bypass(null, "a@x.com", { ...okState, optedOutEventIds: ["e1"] }),
    { action: "skip", reason: "meeting-opt-out", ruleId: "opt-out:e1" });
  // validateJoinRuleState is the shared validator and accepts normal states
  assert.deepEqual(validateJoinRuleState({ approvedSenders: [" A@X.com "], approvedDomains: ["X.com"], optedOutEventIds: ["e"] }),
    { approvedSenders: ["a@x.com"], approvedDomains: ["x.com"], optedOutEventIds: ["e"] });
  assert.throws(() => validateJoinRuleState(null), JoinRuleSetValidationError);
});

test("adapter: duplicate and unrepresentable config entries stay valid and keep behaviour", () => {
  const cfg = { emails: ["a@x.com", "A@X.com", " a@x.com", "nope"], domains: ["q.org", "Q.org", "localhost", "com"] };
  const rs = ruleSetFromTrustedSenderConfig(cfg);
  assert.doesNotThrow(() => validateJoinRuleSet(JSON.parse(JSON.stringify(rs))));
  assert.deepEqual(rs.rules.map((r) => r.id), ["trusted-email:a@x.com", "trusted-domain:q.org"]);
  assert.equal(evaluateJoinRules(ev("A@x.com"), rs).action, "join");
  assert.equal(evaluateJoinRules(ev("z@q.org"), rs).action, "join");
  assert.equal(evaluateJoinRules(ev("z@sub.q.org"), rs).action, "needs-approval");
  assert.equal(evaluateJoinRules(ev("z@other.org"), rs).action, "needs-approval");
});
