/**
 * apps/api/src/join-rules/scope-write.test.ts — T-037 fix cycle 1 (ISS-T037API-002). PUT and both POSTs
 * need the dedicated write scope `join-rules`; GET needs the read scope `calendar`. A read-only
 * `calendar` key must not be able to change which meetings a bot joins. Also pins the failure-recovery
 * property (a thrown save must not poison later writes) that earlier passed only incidentally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import { spyStore } from "./test-store.js";

const P = "/calendar/join-rules";
const KEYS = {
  "read-key": { tenantId: "tenant-a", scopes: ["calendar"] },
  "write-key": { tenantId: "tenant-a", scopes: ["join-rules"] },
  "both-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "other-key": { tenantId: "tenant-a", scopes: ["sources", "gmail", "keys", "ingest", "compete", "ask"] },
};
// ISS-T037API-002 recorded reproductions, verbatim: the match-every-Meet rule, then approvals gmail.com and co.uk
const RULES = { version: 1, ownDomains: [], rules: [{ id: "a", effect: "allow", match: { platform: "meet" } }] };
const WRITES: [string, string, unknown][] = [
  ["PUT", P, RULES], ["POST", `${P}/approvals`, { kind: "domain", value: "gmail.com" }], ["POST", `${P}/approvals`, { kind: "domain", value: "co.uk" }], ["POST", `${P}/opt-outs`, { eventId: "e1" }],
];
const ALL: [string, string, unknown][] = [["GET", P, undefined], ...WRITES];

async function withServer(fn: (call: (m: string, p: string, key?: string, body?: unknown) => Promise<number>, s: ReturnType<typeof spyStore>) => Promise<void>) {
  const s = spyStore();
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: s.deps }));
  const call = async (m: string, p: string, key?: string, body?: unknown) => (await fetch(`${server.baseUrl}${p}`, {
    method: m, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })).status;
  try { await fn(call, s); } finally { await server.close(); }
}

test("a calendar-only (read) key gets 403 on PUT and both POSTs and NOTHING is read or written", async () => {
  await withServer(async (call, s) => {
    for (const [m, p, b] of WRITES) assert.equal(await call(m, p, "read-key", b), 403, `${m} ${p}`);
    assert.equal(s.calls.length, 0);
    assert.equal(s.bytes.size, 0);
  });
});

test("keys holding other scopes (sources, gmail, keys, ingest, compete, ask) can neither read nor write", async () => {
  await withServer(async (call, s) => {
    for (const [m, p, b] of ALL) assert.equal(await call(m, p, "other-key", b), 403, `${m} ${p}`);
    assert.equal(s.calls.length, 0);
  });
});

test("a calendar-only key may still GET (read scope unchanged)", async () => {
  await withServer(async call => { assert.equal(await call("GET", P, "read-key"), 200); });
});

test("a join-rules-only key can write but may NOT GET (least privilege: reading needs `calendar`)", async () => {
  await withServer(async (call, s) => {
    assert.equal(await call("GET", P, "write-key"), 403);
    assert.equal(s.calls.length, 0);
    for (const [m, p, b] of WRITES) assert.equal(await call(m, p, "write-key", b), 200, `${m} ${p}`);
    assert.ok(s.calls.some(c => c.op === "save" && c.tenantId === "tenant-a"));
  });
});

test("a key holding both scopes can read and write", async () => {
  await withServer(async call => {
    for (const [m, p, b] of ALL) assert.equal(await call(m, p, "both-key", b), 200, `${m} ${p}`);
  });
});

test("no key and a bad key are 401 on every route (before any scope check) and touch nothing", async () => {
  await withServer(async (call, s) => {
    for (const [m, p, b] of ALL) {
      assert.equal(await call(m, p, undefined, b), 401, `${m} ${p} no key`);
      assert.equal(await call(m, p, "bogus", b), 401, `${m} ${p} bad key`);
    }
    assert.equal(s.calls.length, 0);
  });
});

test("a failed save does not poison the tenant queue: later writes run, and a burst with one failure saves the rest", async () => {
  await withServer(async (call, s) => {
    s.failNextSave();
    assert.equal(await call("POST", `${P}/opt-outs`, "both-key", { eventId: "lost" }), 500);
    assert.equal(await call("POST", `${P}/opt-outs`, "both-key", { eventId: "k1" }), 200);
    assert.equal(await call("PUT", P, "both-key", RULES), 200);
    s.failNextSave();
    const burst = await Promise.all(["b1", "b2", "b3", "b4", "b5", "b6"].map(id => call("POST", `${P}/opt-outs`, "both-key", { eventId: id })));
    assert.equal(burst.filter(x => x === 500).length, 1);
    assert.equal(burst.filter(x => x === 200).length, 5);
    const stored = JSON.parse(s.bytes.get("tenant-a")!);
    assert.equal(stored.state.optedOutEventIds.length, 1 + 5);
    assert.ok(!stored.state.optedOutEventIds.includes("lost"));
  });
});
