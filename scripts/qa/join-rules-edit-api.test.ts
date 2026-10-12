/**
 * scripts/qa/join-rules-edit-api.test.ts — T-037 `t037-join-rules-edit-api` contract test.
 * Round trip of the REAL `packages/meeting-bot` join-rules store + engine validator through the REAL
 * `apps/api` join-rules router over HTTP. It lives under `scripts/` on purpose: `.dependency-cruiser.cjs`
 * forbids `apps/* -> packages/meeting-bot` (and applies to apps' test files), but only cruises
 * `packages apps workers`, so a script is the one lawful place that may see both sides. It is also the
 * proof that the real store/validator satisfy `JoinRulesDeps` (checked once with tsc, see the manifest).
 * Run from the repo root: node --test --import tsx scripts/qa/join-rules-edit-api.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import type { JoinRulesDeps } from "../../apps/api/src/join-rules/deps.js";
import { loadJoinRules, saveJoinRules, loadJoinRulesWithValidator, saveJoinRulesIf, joinRulesValidator, recordTenantApproval, recordTenantOptOut, joinRulesFilePath } from "../../packages/meeting-bot/src/calendar/join-rules-store.js";
import { validateJoinRuleSet } from "../../packages/meeting-bot/src/calendar/join-rules.js";
import { createJoinRulesDeps } from "../webinar/join-rules-host.js";

const KEYS: Record<string, { tenantId: string; scopes: string[] }> = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
};
const RULES = { version: 1, ownDomains: ["own.example"], rules: [{ id: "r1", effect: "allow", match: { domain: "Trusted.Example" } }] };

async function harness(fn: (dir: string, call: (method: string, p: string, key: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any; etag: string | null }>) => Promise<void>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jr-edit-api-"));
  // The injected deps: the real store functions bound to a temp state dir. Nothing else is adapted.
  const deps: JoinRulesDeps = {
    load: t => loadJoinRules(dir, t),
    save: (t, v) => saveJoinRules(dir, t, v),
    loadWithValidator: t => loadJoinRulesWithValidator(dir, t),
    saveIf: (t, expected, ruleSet) => saveJoinRulesIf(dir, t, expected, ruleSet),
    validateRuleSet: validateJoinRuleSet,
    recordApproval: (t, a) => recordTenantApproval(dir, t, a),
    recordOptOut: (t, id) => recordTenantOptOut(dir, t, id),
    removeOptOut: createJoinRulesDeps({ stateDir: dir }).removeOptOut,
  };
  // The real createServer (auth + rate limit + router), not a hand-built app.
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: deps }));
  const call = async (method: string, p: string, key: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${server.baseUrl}${p}`, {
      method, headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => undefined), etag: res.headers.get("etag") };
  };
  try { await fn(dir, call); } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
}

const P = "/calendar/join-rules";
/** PUT needs a precondition: create with If-None-Match: *, replace with If-Match "<etag from GET>". */
const NONE = { "if-none-match": "*" };

test("real store: GET missing file is empty; PUT normalises via the engine validator and persists", async () => {
  await harness(async (dir, call) => {
    const empty = await call("GET", P, "a-key");
    assert.deepEqual(empty.json, { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    assert.equal(empty.etag, null); // nothing stored -> no ETag
    const put = await call("PUT", P, "a-key", RULES, NONE);
    assert.equal(put.status, 200);
    assert.equal(put.etag, `"${joinRulesValidator(loadJoinRules(dir, "tenant-a").ruleSet)}"`);
    assert.equal(put.json.ruleSet.rules[0].match.domain, "trusted.example"); // engine's normalisation, not a second validator
    assert.deepEqual(loadJoinRules(dir, "tenant-a").ruleSet, put.json.ruleSet);
    assert.deepEqual((await call("GET", P, "a-key")).json.ruleSet, put.json.ruleSet);
  });
});

test("real store: PUT after approvals/opt-outs keeps them; engine rejects invalid bodies and the file is unchanged", async () => {
  await harness(async (dir, call) => {
    assert.equal((await call("POST", `${P}/approvals`, "a-key", { kind: "sender", value: "Ann@X.example" })).status, 200);
    assert.equal((await call("POST", `${P}/approvals`, "a-key", { kind: "domain", value: "d.example" })).status, 200);
    assert.equal((await call("POST", `${P}/opt-outs`, "a-key", { eventId: "ev1" })).status, 200);
    const state = { approvedSenders: ["ann@x.example"], approvedDomains: ["d.example"], optedOutEventIds: ["ev1"] };
    assert.deepEqual(loadJoinRules(dir, "tenant-a").state, state);
    const tag = (await call("GET", P, "a-key")).etag!; // the approvals/opt-outs created the file with an empty rule set
    assert.ok(tag, "a stored (even empty) rule set has an ETag");
    assert.equal((await call("PUT", P, "a-key", RULES, { "if-match": tag })).status, 200);
    assert.deepEqual(loadJoinRules(dir, "tenant-a").state, state);
    const file = joinRulesFilePath(dir, "tenant-a");
    const bytes = readFileSync(file);
    for (const bad of [{ ...RULES, tenantId: "tenant-b" }, { version: 1, ownDomains: ["bad domain"], rules: [] }, { version: 1, ownDomains: [], rules: [{ id: "x", effect: "maybe", match: { domain: "a.example" } }] }, { ...RULES, state: state }])
      assert.equal((await call("PUT", P, "a-key", bad, { "if-match": (await call("GET", P, "a-key")).etag! })).status, 400, JSON.stringify(bad));
    assert.equal((await call("POST", `${P}/approvals`, "a-key", { kind: "sender", value: "not-an-email" })).status, 400);
    assert.equal((await call("POST", `${P}/opt-outs`, "a-key", { eventId: "" })).status, 400);
    assert.ok(readFileSync(file).equals(bytes), "file bytes unchanged by every refused write");
  });
});

test("real store: a corrupt or wrong-tenant file is a 500 with no leak and the bytes are untouched", async () => {
  await harness(async (dir, call) => {
    await call("PUT", P, "a-key", RULES, NONE);
    const fileA = joinRulesFilePath(dir, "tenant-a");
    writeFileSync(fileA, "{ this is not json");
    const fileB = joinRulesFilePath(dir, "tenant-b");
    mkdirSync(path.dirname(fileB), { recursive: true });
    writeFileSync(fileB, JSON.stringify({ version: 1, tenantId: "tenant-a", ruleSet: RULES, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } }));
    const beforeA = readFileSync(fileA), beforeB = readFileSync(fileB);
    for (const key of ["a-key", "b-key"]) {
      for (const [m, p, b] of [["GET", P, undefined], ["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${P}/opt-outs`, { eventId: "e" }]] as const) {
        const r = await call(m, p, key, b, m === "PUT" ? { "if-match": `"${"0".repeat(64)}"` } : {});
        assert.equal(r.status, 500, `${key} ${m} ${p}`);
        const text = JSON.stringify(r.json);
        assert.ok(!text.includes(dir) && !/Unexpected token|tenant-a|tenant-b|\.json/.test(text), text);
      }
    }
    assert.ok(readFileSync(fileA).equals(beforeA) && readFileSync(fileB).equals(beforeB));
    assert.deepEqual(readdirSync(path.dirname(fileA)).filter(f => f.endsWith(".tmp")), []);
  });
});

test("real store: tenants are isolated on disk; concurrent approvals for one tenant all survive", async () => {
  await harness(async (dir, call) => {
    const empty = { version: 1 as const, ownDomains: [], rules: [] };
    saveJoinRules(dir, "tenant-a", { ruleSet: empty, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } }); // seed: a stored (empty) rule set, so the PUT replaces it whatever order the writes run in
    const emails = Array.from({ length: 15 }, (_, i) => `u${i}@x.example`);
    const results = await Promise.all([
      ...emails.map(value => call("POST", `${P}/approvals`, "a-key", { kind: "sender", value })),
      ...Array.from({ length: 5 }, (_, i) => call("POST", `${P}/opt-outs`, "a-key", { eventId: `ev${i}` })),
      call("PUT", P, "a-key", RULES, { "if-match": `"${joinRulesValidator(empty)}"` }),
      call("POST", `${P}/approvals`, "b-key", { kind: "domain", value: "b-only.example" }),
    ]);
    for (const r of results) assert.equal(r.status, 200);
    const a = loadJoinRules(dir, "tenant-a");
    assert.deepEqual([...a.state.approvedSenders].sort(), [...emails].sort());
    assert.equal(a.state.optedOutEventIds.length, 5);
    assert.equal(a.ruleSet.rules.length, 1);
    const b = loadJoinRules(dir, "tenant-b");
    assert.deepEqual(b.state, { approvedSenders: [], approvedDomains: ["b-only.example"], optedOutEventIds: [] });
    assert.deepEqual(b.ruleSet.rules, []);
  });
});
