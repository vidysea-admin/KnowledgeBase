/**
 * scripts/webinar/join-rules-host.test.ts — T-037 `t037-join-rules-api-host`. The REAL createServer (auth,
 * rate limit, router) with `createJoinRulesDeps` over a temp state dir; other deps are fakes.
 * Run: node --test --import tsx scripts/webinar/join-rules-host.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import { joinRulesFilePath } from "../../packages/meeting-bot/src/calendar/join-rules-store.js";
import { acquireHostLock, createJoinRulesDeps, HOST_PID_FILE, prepareStateDir, resolveStateDir } from "./join-rules-host.js";

const KEYS: Record<string, { tenantId: string; scopes: string[] }> = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
  "noscope-key": { tenantId: "tenant-a", scopes: ["calendar"] },
};
const RULES = { version: 1, ownDomains: ["own.example"], rules: [{ id: "r1", effect: "allow", match: { domain: "Trusted.Example" } }] };
const P = "/calendar/join-rules";
type Call = (method: string, p: string, key: string, body?: unknown) => Promise<{ status: number; json: any }>;

async function serve(dir: string) {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: createJoinRulesDeps({ stateDir: dir }) }));
  const call: Call = async (method, p, key, body) => {
    const res = await fetch(`${server.baseUrl}${p}`, {
      method, headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => undefined) };
  };
  return { call, close: server.close };
}
async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jr-host-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("GET is no longer 503; PUT/GET round trip; approvals and opt-outs persist and survive a restart", () => withDir(async dir => {
  let s = await serve(dir);
  try {
    const first = await s.call("GET", P, "a-key");
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    const put = await s.call("PUT", P, "a-key", RULES);
    assert.equal(put.status, 200);
    assert.equal(put.json.ruleSet.rules[0].match.domain, "trusted.example");
    assert.equal((await s.call("POST", `${P}/approvals`, "a-key", { kind: "sender", value: "Ann@X.example" })).status, 200);
    assert.equal((await s.call("POST", `${P}/opt-outs`, "a-key", { eventId: "ev1" })).status, 200);
  } finally { await s.close(); }
  const onDisk = JSON.parse(readFileSync(joinRulesFilePath(dir, "tenant-a"), "utf8"));
  assert.equal(onDisk.tenantId, "tenant-a");
  assert.deepEqual(onDisk.state, { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: ["ev1"] });
  s = await serve(dir); // new server + new binder instance = restart
  try {
    const again = await s.call("GET", P, "a-key");
    assert.equal(again.json.ruleSet.rules[0].match.domain, "trusted.example");
    assert.deepEqual(again.json.state, onDisk.state);
  } finally { await s.close(); }
}));

test("two tenants are isolated on disk; without the join-rules scope writes are 403 (reads stay calendar-scoped) and nothing is written", () => withDir(async dir => {
  const s = await serve(dir);
  try {
    assert.equal((await s.call("PUT", P, "a-key", RULES)).status, 200);
    assert.equal((await s.call("POST", `${P}/approvals`, "b-key", { kind: "domain", value: "b-only.example" })).status, 200);
    assert.deepEqual((await s.call("GET", P, "b-key")).json.ruleSet.rules, []);
    assert.deepEqual((await s.call("GET", P, "a-key")).json.state.approvedDomains, []);
    const before = readFileSync(joinRulesFilePath(dir, "tenant-a"));
    for (const [m, p, b] of [["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${P}/opt-outs`, { eventId: "e" }]] as const)
      assert.equal((await s.call(m, p, "noscope-key", b)).status, 403, `${m} ${p}`);
    assert.equal((await s.call("GET", P, "noscope-key")).status, 200);
    assert.equal((await s.call("GET", P, "no-such-key")).status, 401);
    assert.ok(readFileSync(joinRulesFilePath(dir, "tenant-a")).equals(before));
  } finally { await s.close(); }
}));

test("a corrupt stored file answers 500 (store error passes through) and the bytes are unchanged", () => withDir(async dir => {
  const s = await serve(dir);
  try {
    const file = joinRulesFilePath(dir, "tenant-a");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{ this is not json");
    const before = readFileSync(file);
    for (const [m, p, b] of [["GET", P, undefined], ["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${P}/opt-outs`, { eventId: "e" }]] as const)
      assert.equal((await s.call(m, p, "a-key", b)).status, 500, `${m} ${p}`);
    assert.ok(readFileSync(file).equals(before));
    assert.deepEqual(readdirSync(path.dirname(file)).filter(f => f.endsWith(".tmp")), []);
  } finally { await s.close(); }
}));

test("state directory: resolves like the scheduler, is created, and refusals are clear", () => withDir(async dir => {
  const resolved = resolveStateDir();
  assert.ok(path.isAbsolute(resolved));
  assert.equal(path.relative(path.resolve(import.meta.dirname, "..", ".."), resolved), path.join("raw", "webinars"));
  assert.throws(() => resolveStateDir("not-a-file-url"), /cannot resolve the repository root/);
  const made = path.join(dir, "a", "b");
  assert.equal(prepareStateDir(made), made);
  assert.ok(existsSync(made));
  assert.throws(() => prepareStateDir("relative/dir"), /absolute/);
  assert.throws(() => prepareStateDir(""), /absolute/);
  const blocker = path.join(dir, "file");
  writeFileSync(blocker, "x");
  assert.throws(() => prepareStateDir(path.join(blocker, "sub")), /cannot be created or is not writable/);
}));

test("single-host guard: second host refused, leftover file never stolen, released on shutdown", () => withDir(async dir => {
  const release = acquireHostLock(dir, 4242);
  const file = path.join(dir, HOST_PID_FILE);
  assert.equal(readFileSync(file, "utf8"), "4242\n");
  assert.throws(() => acquireHostLock(dir, 1), /another host owns this state directory/);
  assert.equal(readFileSync(file, "utf8"), "4242\n", "owner's file untouched by the refused attempt");
  release(); release(); // idempotent
  assert.ok(!existsSync(file));
  acquireHostLock(dir, 7)();
  writeFileSync(file, "999\n"); // simulated crash leftover
  assert.throws(() => acquireHostLock(dir, 8), /Not starting/);
  assert.equal(readFileSync(file, "utf8"), "999\n");
}));
