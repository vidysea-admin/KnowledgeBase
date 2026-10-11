import { describe, expect, test } from "vitest";
import {
  PLATFORMS, canonicalRuleSet, checkPendingValue, confirmationText, draftFromRuleSet, normalizeDomain, normalizeEmail, parseView,
  ruleSetFromDraft, validateRuleSetClient, type Rule, type RuleSet,
} from "./joinRulesModel.js";

const set = (rules: Rule[], ownDomains: string[] = []): RuleSet => ({ version: 1, ownDomains, rules });
const rule = (id: string, match: Rule["match"], effect: Rule["effect"] = "allow"): Rule => ({ id, effect, match });

describe("normalisers mirror the engine", () => {
  test("domain: lower-case, trim, one trailing dot; multi-label only; no wildcard", () => {
    expect(normalizeDomain("  Example.COM. ")).toBe("example.com");
    for (const bad of ["localhost", "*.example.com", "example", "a b.com", "-a.com", "a..com", "http://a.com", ""]) expect(normalizeDomain(bad)).toBeUndefined();
  });
  test("email: exactly one @, no whitespace in the local part, valid domain", () => {
    expect(normalizeEmail(" Asha@Example.com ")).toBe("asha@example.com");
    for (const bad of ["a@b", "@example.com", "a@@example.com", "a b@example.com", "a@*.example.com", "nodomain", "a@b@example.com"]) expect(normalizeEmail(bad)).toBeUndefined();
  });
});

describe("validateRuleSetClient refuses what the engine refuses", () => {
  test("a valid set has no problems, including all platforms and scopes", () => {
    const rules = PLATFORMS.map((p, i) => rule(`p${i}`, { platform: p }, i % 2 ? "deny" : "allow"));
    expect(validateRuleSetClient(set([...rules, rule("d", { domain: "example.com", subdomains: false }), rule("s", { scope: "external" })], ["corp.example.com"]))).toEqual([]);
  });
  test("an empty set is valid (default deny)", () => expect(validateRuleSetClient(set([]))).toEqual([]));
  test("allow or deny rule with no matcher is refused", () => {
    for (const effect of ["allow", "deny"] as const) {
      const errors = validateRuleSetClient(set([rule("r", {}, effect)]));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/Rule 1: needs at least one matcher/);
    }
  });
  test("subdomains alone (no domain) is not a matcher and is refused twice over", () => {
    const errors = validateRuleSetClient(set([rule("r", { subdomains: false })]));
    expect(errors.join(" ")).toMatch(/at least one matcher/);
    expect(errors.join(" ")).toMatch(/only valid together with a domain/);
  });
  test("wildcard and malformed domains are refused in rules and own domains", () => {
    expect(validateRuleSetClient(set([rule("r", { domain: "*.example.com" })]))[0]).toMatch(/Wildcards like \*\.example\.com are not allowed/);
    expect(validateRuleSetClient(set([], ["*.example.com"]))[0]).toMatch(/Own domain 1/);
    expect(validateRuleSetClient(set([rule("r", { domain: "localhost" })]))).toHaveLength(1);
  });
  test("bad sender emails are refused", () => {
    expect(validateRuleSetClient(set([rule("r", { email: "not-an-email" })]))[0]).toMatch(/sender "not-an-email" is not a valid email/);
  });
  test("empty and duplicate rule names are refused", () => {
    expect(validateRuleSetClient(set([rule("  ", { platform: "zoom" })]))[0]).toMatch(/name must not be empty/);
    const dup = validateRuleSetClient(set([rule("a", { platform: "zoom" }), rule("a", { platform: "meet" })]));
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatch(/Rule 2: .*"a" is already used/);
  });
  test("unknown platform / effect / scope values are refused", () => {
    expect(validateRuleSetClient(set([rule("r", { platform: "skype" as never })]))[0]).toMatch(/platform must be one of/);
    expect(validateRuleSetClient(set([rule("r", { scope: "both" as never })]))[0]).toMatch(/scope must be internal or external/);
    expect(validateRuleSetClient(set([{ id: "r", effect: "maybe" as never, match: { platform: "zoom" } }]))[0]).toMatch(/choose allow or deny/);
  });
  test("an oversized set is refused before sending", () => {
    const big = set(Array.from({ length: 1500 }, (_, i) => rule(`rule-number-${i}`, { email: `user${i}@example-domain.com` })));
    expect(validateRuleSetClient(big).join(" ")).toMatch(/too large/);
  });
});

describe("draft conversion", () => {
  test("the request set carries only version, ownDomains, rules; empty matchers are dropped", () => {
    const d = draftFromRuleSet(set([rule("a", { domain: "example.com", subdomains: false, platform: "zoom" })], ["corp.example.com"]));
    d.rules[0]!.email = "   "; d.rules[0]!.scope = "";
    const out = ruleSetFromDraft(d);
    expect(Object.keys(out)).toEqual(["version", "ownDomains", "rules"]);
    expect(out).toEqual(set([rule("a", { domain: "example.com", subdomains: false, platform: "zoom" })], ["corp.example.com"]));
  });
  test("include-subdomains is only emitted as false and only with a domain", () => {
    const d = draftFromRuleSet(set([rule("a", { domain: "example.com" })]));
    expect(ruleSetFromDraft(d).rules[0]!.match).toEqual({ domain: "example.com" });
    d.rules[0]!.domain = ""; d.rules[0]!.subdomains = false; d.rules[0]!.platform = "meet";
    expect(ruleSetFromDraft(d).rules[0]!.match).toEqual({ platform: "meet" });
  });
  test("own domains: blank lines and padding are dropped", () => {
    const d = draftFromRuleSet(set([])); d.ownDomains = " a.com \r\n\n b.org ";
    expect(ruleSetFromDraft(d).ownDomains).toEqual(["a.com", "b.org"]);
  });
});

describe("parseView", () => {
  const good = { ruleSet: set([rule("a", { email: "x@example.com" })], ["e.com"]), state: { approvedSenders: ["x@example.com"], approvedDomains: [], optedOutEventIds: ["ev1"] } };
  test("accepts the documented shape", () => expect(canonicalRuleSet(parseView(good)!.ruleSet)).toBe(canonicalRuleSet(good.ruleSet)));
  test("rejects anything else rather than showing an empty view", () => {
    for (const bad of [null, {}, { ruleSet: good.ruleSet }, { ...good, state: { approvedSenders: [1], approvedDomains: [], optedOutEventIds: [] } },
      { ...good, ruleSet: { ...good.ruleSet, version: 2 } }, { ...good, ruleSet: { ...good.ruleSet, rules: [{ id: 1 }] } }]) {
      expect(parseView(bad)).toBeNull();
    }
  });
});

describe("approval / opt-out inputs and confirmation text", () => {
  test("value checks", () => {
    expect(checkPendingValue("sender", " a@example.com ")).toEqual({ value: "a@example.com" });
    expect(checkPendingValue("sender", "example.com")).toHaveProperty("error");
    expect(checkPendingValue("domain", "example.com")).toEqual({ value: "example.com" });
    expect(checkPendingValue("domain", "*.example.com")).toHaveProperty("error");
    expect(checkPendingValue("optout", "")).toHaveProperty("error");
    expect(checkPendingValue("optout", "evt_1")).toEqual({ value: "evt_1" });
  });
  test("sender and domain wording say no human click, name the value, and the domain one is stronger", () => {
    const s = confirmationText({ kind: "sender", value: "asha@example.com" });
    const d = confirmationText({ kind: "domain", value: "example.com" });
    expect(s).toBe("Approving asha@example.com records that, once enforcement is switched on, the bot joins future meetings from asha@example.com automatically, with no human click. Join rules are not enforced by the bot yet: this is recorded, and the bot may still join until enforcement is switched on.");
    expect(d).toContain("EVERY sender at example.com");
    expect(d).toContain("with no human click");
    expect(d.length).toBeGreaterThan(s.length);
  });
});
