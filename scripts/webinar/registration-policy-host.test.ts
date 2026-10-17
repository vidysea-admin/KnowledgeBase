import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import { createJoinRulesDeps } from "./join-rules-host.js";
import { createRegistrationPolicyResolver } from "./registration-policy-host.js";
import { registrationConfigurationReason } from "../../packages/meeting-bot/src/calendar/registration-workflow.js";
import { loadRegistrationPolicy, mutateRegistrationPolicy } from "../../packages/meeting-bot/src/calendar/join-rules/registration-policy-store.js";

const policy = {version: 1, operator: {firstName: "Operator", lastName: "Test", email: "operator@example.org"},
  form: {mode: "native-html", formSelector: "#registration", submitSelector: "button[type=submit]", fields: {firstName: "#first", lastName: "#last", email: "#email"}},
  scope: {organizers: ["host@example.org"], domains: [], platforms: ["unknown"], allowedHosts: ["events.example.org"]},
  relevance: {includeTerms: ["career"], excludeTerms: ["sales"]}};
const candidate = {id: "source-1", title: "Career guidance", senderEmail: "host@example.org", senderAuthenticated: true,
  status: "approved", registrationUrl: "https://events.example.org/register"};
test("actual authenticated route → durable profile approval → candidate-bound registration consumer", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-http-"));
  const server = await startTestServer(buildTestDeps({joinRules: createJoinRulesDeps({stateDir: root}), keyStore: fakeKeyStore({
    "write-a": {tenantId: "tenant-a", scopes: ["calendar", "join-rules"]}, "write-b": {tenantId: "tenant-b", scopes: ["join-rules"]},
    "read-a": {tenantId: "tenant-a", scopes: ["calendar"]},
  })}));
  const base = `${server.baseUrl}/calendar/join-rules/registration-policy`;
  const hit = async (key: string, method = "GET", body?: unknown, tail = "") => {
    const r = await fetch(base + tail, {method, headers: {authorization: `Bearer ${key}`, "content-type": "application/json"},
      ...(body ? {body: JSON.stringify(body)} : {})}); return {status: r.status, body: await r.json() as any};
  };
  try {
    assert.equal((await hit("none")).status, 401);
    for (const [method, body, tail] of [["GET", undefined, ""], ["PUT", {expectedRevision: "absent", policy}, ""],
      ["POST", {expectedRevision: "absent"}, "/approve"]] as const) assert.equal((await hit("read-a", method, body, tail)).status, 403);
    const first = await hit("write-a", "PUT", {expectedRevision: "absent", policy}); assert.equal(first.status, 200); assert.equal(first.body.approved, false);
    assert.equal((await hit("write-a", "POST", {expectedRevision: first.body.revision, tenantId: "tenant-b"}, "/approve")).status, 400);
    assert.equal((await hit("write-a", "POST", {expectedRevision: "absent"}, "/approve")).status, 412);
    const approved = await hit("write-a", "POST", {expectedRevision: first.body.revision}, "/approve"); assert.equal(approved.status, 200);
    const resolve = createRegistrationPolicyResolver({stateDir: root, tenantId: "tenant-a", runtime: {python: path.join(root, "python.exe"), profileDir: path.join(root, "profile")}});
    assert.deepEqual(resolve(candidate).operator, policy.operator);
    assert.equal(registrationConfigurationReason(resolve(candidate), candidate as any), undefined);
    assert.throws(() => resolve({...candidate, title: "Career sales"}), /denied/);
    assert.equal((await hit("write-b")).body.policy, null);
    assert.equal((await hit("write-a")).body.approved, true);
    const revoked = await hit("write-a", "POST", {expectedRevision: approved.body.revision}, "/revoke"); assert.equal(revoked.status, 200);
    assert.throws(() => resolve(candidate), /unapproved/);
  } finally { await server.close(); rmSync(root, {recursive: true, force: true}); }
});
test("saved policy boundaries match actual T052 consumer limits before approval", () => {
  const root = mkdtempSync(path.join(tmpdir(), "t037-parity-"));
  try {
    const longEmail = `${"x".repeat(244)}@example.org`; // 256 characters, the browser/helper maximum.
    assert.equal(longEmail.length, 256);
    const allowedHosts = ["events.example.org", ...Array.from({length: 19}, (_, i) => `events${i}.example.org`)];
    const p = {...policy, operator: {...policy.operator, email: longEmail, organization: "Fixture organization"},
      form: {...policy.form, fields: {...policy.form.fields, organization: "#organization"}}, scope: {...policy.scope, allowedHosts}};
    const saved = mutateRegistrationPolicy(root, "tenant-a", "absent", "replace", p);
    const approved = mutateRegistrationPolicy(root, "tenant-a", saved.revision, "approve");
    const resolve = createRegistrationPolicyResolver({stateDir: root, tenantId: "tenant-a", runtime: {python: path.join(root, "python.exe"), profileDir: path.join(root, "profile")}});
    assert.equal(registrationConfigurationReason(resolve(candidate), candidate as any), undefined);
    for (const invalid of [{...p, operator: {...p.operator, email: `x${longEmail}`}},
      {...p, scope: {...p.scope, allowedHosts: [...allowedHosts, "extra.example.org"]}}]) {
      assert.throws(() => mutateRegistrationPolicy(root, "tenant-a", approved.revision, "replace", invalid), /invalid/);
      assert.equal(loadRegistrationPolicy(root, "tenant-a").revision, approved.revision);
    }
  } finally { rmSync(root, {recursive: true, force: true}); }
});
