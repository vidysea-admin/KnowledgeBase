import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { buildCapturePolicyIntegrations } from "./capture-policy.js";

test("capture-policy bridge requires exact explicit enablement and an absolute private repository path", () => {
  const root = path.resolve("capture-policy-fixture");
  for (const flag of [undefined, "", "0", "true", "1 "]) assert.deepEqual(buildCapturePolicyIntegrations({root, env: {LKB_JOIN_RULES_ENABLED: flag}}), {});
  for (const invalid of ["", "relative/root", `${root}\n`, ` ${root}`])
    assert.deepEqual(buildCapturePolicyIntegrations({root: invalid, env: {LKB_JOIN_RULES_ENABLED: "1"}}), {});
});
test("construction performs no writes; actual real policy methods persist at the same scheduler directory and isolate tenants", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-bridge-"));
  try {
    const {joinRules} = buildCapturePolicyIntegrations({root, env: {LKB_JOIN_RULES_ENABLED: "1"}});
    assert.ok(joinRules?.registrationPolicy);
    assert.deepEqual(readdirSync(root), []);
    const rules = {version: 1 as const, ownDomains: [], rules: []};
    await joinRules.saveIf("tenant-a", "absent", rules);
    await joinRules.recordOptOut("tenant-a", "event-a");
    assert.equal(existsSync(path.join(root, "raw", "webinars", "join-rules", "tenant-a.json")), true);
    assert.deepEqual((await joinRules.load("tenant-a")).state.optedOutEventIds, ["event-a"]);
    assert.deepEqual((await joinRules.load("tenant-b")).state.optedOutEventIds, []);
    const policy = {version: 1, operator: {firstName: "Operator", lastName: "Test", email: "operator@example.org"},
      form: {mode: "native-html", formSelector: "#registration", submitSelector: "#submit", fields: {firstName: "#first", lastName: "#last", email: "#email"}},
      scope: {organizers: ["host@example.org"], domains: [], platforms: ["unknown"], allowedHosts: ["events.example.org"]},
      relevance: {includeTerms: ["career"], excludeTerms: ["sales"]}};
    const saved = await joinRules.registrationPolicy.mutate("tenant-a", "absent", "replace", policy) as {revision: string; approved: boolean};
    assert.equal(saved.approved, false);
    const approved = await joinRules.registrationPolicy.mutate("tenant-a", saved.revision, "approve") as {approved: boolean};
    assert.equal(approved.approved, true);
    assert.equal(existsSync(path.join(root, "raw", "webinars", "registration-policies", "tenant-a.json")), true);
    assert.equal((await joinRules.registrationPolicy.load("tenant-b") as {policy: unknown}).policy, null);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
