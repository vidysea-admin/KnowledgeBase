import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateJoinRules, recordApproval, recordOptOut, ruleSetFromTrustedSenderConfig, validateJoinRuleSet,
  JoinRuleSetValidationError, EMPTY_JOIN_RULE_STATE, normalizeDomain, normalizeEmail,
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
  // legacy takes everything after the LAST @; the engine rejects multi-@ addresses outright
  assert.equal(isTrustedSender("evil@x.com@ashoka.edu.in", undefined, cfg), true);
  assert.equal(evaluateJoinRules(ev("evil@x.com@ashoka.edu.in"), rs).action, "needs-approval");
  // legacy does not trim; the engine does
  assert.equal(isTrustedSender("a@ashoka.edu.in ", undefined, cfg), false);
  assert.equal(evaluateJoinRules(ev("a@ashoka.edu.in "), rs).action, "join");
});
