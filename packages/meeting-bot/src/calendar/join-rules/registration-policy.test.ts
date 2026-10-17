import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateRegistrationPolicy, registrationPolicyAllows } from "./registration-policy.js";
import { loadRegistrationPolicy, mutateRegistrationPolicy, resolveRegistrationPolicy } from "./registration-policy-store.js";
import { saveJoinRules, recordTenantOptOut } from "./join-rules-store.js";

export const policy = () => ({version: 1, operator: {firstName: "Operator", lastName: "Test", email: "operator@example.org"},
  form: {mode: "native-html", formSelector: "#registration", submitSelector: "button[type=submit]", fields: {firstName: "#first", lastName: "#last", email: "#email"}},
  scope: {organizers: ["host@example.org"], domains: [], platforms: ["unknown"], allowedHosts: ["events.example.org"]},
  relevance: {includeTerms: ["career"], excludeTerms: ["sales"]}});
export const candidate = () => ({id: "source-1", title: "Career guidance", senderEmail: "host@example.org", senderAuthenticated: true,
  status: "approved", registrationUrl: "https://events.example.org/register"});

test("approved exact scope and authenticated approved source need positive relevance; exclusions win", () => {
  const p = validateRegistrationPolicy(policy()); assert.equal(registrationPolicyAllows(p, candidate()), true);
  for (const change of [{status: "pending"}, {status: "rejected"}, {cancelled: true}, {senderAuthenticated: false},
    {senderEmail: "other@example.org"}, {senderEmail: "host@example.org.evil"}, {registrationUrl: "https://events.example.org.evil/register"},
    {registrationUrl: "https://sub.events.example.org/register"}, {registrationUrl: "http://events.example.org/register"},
    {registrationUrl: "https://events.example.org:8443/register"}, {registrationUrl: "https://user:password@events.example.org/register"},
    {registrationUrl: "https://events.example.org/register#consent"}, {title: "Unrelated webinar"}, {title: "Career sales"}])
    assert.equal(registrationPolicyAllows(p, {...candidate(), ...change}), false, JSON.stringify(change));
});
test("policy strict fields refuse implicit scope, credentials and malformed profile/relevance", () => {
  const p = policy();
  for (const invalid of [{...p, tenantId: "foreign"}, {...p, approved: true}, {...p, operator: {...p.operator, password: "x"}},
    {...p, form: {...p.form, fields: {...p.form.fields, creditCard: "#card"}}}, {...p, scope: {...p.scope, organizers: []}},
    {...p, scope: {...p.scope, allowedHosts: ["*.example.org"]}}, {...p, scope: {...p.scope, platforms: ["anything"]}},
    {...p, operator: {...p.operator, email: "lookаlike@example.org"}}, {...p, operator: {...p.operator, email: "a(b)@example.org"}}, {...p, relevance: {...p.relevance, includeTerms: []}},
    {...p, relevance: {...p.relevance, excludeTerms: ["\nsecret"]}}, {...p, form: {...p.form, fields: {firstName: "#one", lastName: "#one", email: "#email"}}}])
    assert.throws(() => validateRegistrationPolicy(invalid));
});
test("CAS persists explicit profile approval across restart; edits revoke it and stale operations cannot restore it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-policy-"));
  try {
    assert.equal(loadRegistrationPolicy(root, "tenant-a").revision, "absent");
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /unavailable/);
    const saved = mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy());
    assert.equal(saved.approved, false); assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /unapproved/);
    const approved = mutateRegistrationPolicy(root, "tenant-a", saved.revision, "approve");
    assert.equal(loadRegistrationPolicy(root, "tenant-a").approved, true);
    assert.deepEqual(resolveRegistrationPolicy(root, "tenant-a", candidate()).operator, policy().operator);
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-b", candidate()), /unavailable/);
    assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", saved.revision, "revoke"), /conflict/);
    const edited = mutateRegistrationPolicy(root, "tenant-a", approved.revision, "replace", {...policy(), relevance: {includeTerms: ["engineering"], excludeTerms: []}});
    assert.equal(edited.approved, false);
    assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", approved.revision, "approve"), /conflict/);
    const reapproved = mutateRegistrationPolicy(root, "tenant-a", edited.revision, "approve");
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /denied/);
    assert.equal(mutateRegistrationPolicy(root, "tenant-a", reapproved.revision, "revoke").approved, false);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test("corrupt/foreign/stale approval refuses and cannot be silently repaired", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-policy-"));
  try {
    mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy());
    const file = path.join(root, "registration-policies", "tenant-a.json"), original = readFileSync(file, "utf8");
    for (const data of ["{broken", JSON.stringify({...JSON.parse(original), tenantId: "tenant-b"}),
      JSON.stringify({...JSON.parse(original), approvedPolicyRevision: "0".repeat(64)})]) {
      writeFileSync(file, data);
      assert.throws(() => loadRegistrationPolicy(root, "tenant-a"), /unavailable/);
      assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy()), /unavailable/);
      assert.equal(readFileSync(file, "utf8"), data);
    }
    assert.throws(() => loadRegistrationPolicy(root, "../foreign"));
    assert.throws(() => loadRegistrationPolicy(root, "CON"));
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test("approved registration profile never overrides saved join-rule deny or per-meeting opt-out", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-policy-"));
  try {
    const saved = mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy());
    mutateRegistrationPolicy(root, "tenant-a", saved.revision, "approve");
    saveJoinRules(root, "tenant-a", {ruleSet: {version: 1, ownDomains: [], rules: [{id: "deny-host", effect: "deny", match: {email: "host@example.org"}}]},
      state: {approvedSenders: ["host@example.org"], approvedDomains: [], optedOutEventIds: []}});
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /denied/);
    saveJoinRules(root, "tenant-a", {ruleSet: {version: 1, ownDomains: [], rules: []},
      state: {approvedSenders: ["host@example.org"], approvedDomains: [], optedOutEventIds: []}});
    recordTenantOptOut(root, "tenant-a", "source-1");
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /denied/);
    const file = path.join(root, "join-rules", "tenant-a.json"), before = readFileSync(file, "utf8");
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", candidate()), /denied/);
    assert.equal(readFileSync(file, "utf8"), before);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test("unsafe ancestor is refused before missing policy directory can be created outside the state root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-link-root-")), outside = mkdtempSync(path.join(tmpdir(), "t037-link-outside-"));
  const link = path.join(root, "linked");
  try {
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => mutateRegistrationPolicy(link, "tenant-a", "absent", "replace", policy()), /unavailable/);
    assert.equal(existsSync(path.join(outside, "registration-policies")), false);
  } finally {
    if (existsSync(link)) unlinkSync(link);
    rmSync(root, {recursive: true, force: true}); rmSync(outside, {recursive: true, force: true});
  }
});
test("oversized mailbox is refused and oversized stored bytes cannot be read or overwritten", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-size-"));
  try {
    const saved = mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy());
    const file = path.join(root, "registration-policies", "tenant-a.json"), before = readFileSync(file, "utf8");
    assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", saved.revision, "replace", {...policy(), operator: {...policy().operator, email: `${"x".repeat(321)}@example.org`}}), /invalid/);
    assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", saved.revision, "replace", {...policy(), relevance: {includeTerms: ["\uFDFA".repeat(95)], excludeTerms: []}}), /invalid/);
    assert.equal(readFileSync(file, "utf8"), before);
    const huge = " ".repeat(100001); writeFileSync(file, huge);
    assert.throws(() => loadRegistrationPolicy(root, "tenant-a"), /unavailable/);
    assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", saved.revision, "replace", policy()), /unavailable/);
    assert.equal(readFileSync(file, "utf8"), huge);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test("private proven registration aliases only restrict cross-source opt-outs; they cannot grant profile scope", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-alias-"));
  try {
    const saved = mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", policy());
    mutateRegistrationPolicy(root, "tenant-a", saved.revision, "approve");
    const identity = {sourceOccurrenceKey: "occurrence-1", sourceIds: ["calendar-copy"], sessionKeys: ["shared-session"]};
    assert.equal(resolveRegistrationPolicy(root, "tenant-a", {...candidate(), registrationIdentity: identity}).version, 1);
    recordTenantOptOut(root, "tenant-a", "calendar-copy");
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", {...candidate(), registrationIdentity: identity}), /denied/);
    assert.equal(resolveRegistrationPolicy(root, "tenant-a", candidate()).version, 1); // unproven title-equal copies cannot be guessed.
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", {...candidate(), senderEmail: "foreign@example.org", registrationIdentity: identity}), /denied/);
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", {...candidate(), registrationIdentity: {...identity, sourceOccurrenceKey: "private\nidentity"}}), /unavailable/);
    recordTenantOptOut(root, "tenant-a", "another-copy", {}, {sessionKey: "shared-session"});
    assert.throws(() => resolveRegistrationPolicy(root, "tenant-a", {...candidate(), registrationIdentity: {...identity, sourceIds: []}}), /denied/);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
