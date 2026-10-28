import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createAnswerPolicyRouter } from "./routes.js";
import { requireAuth } from "../auth.js";
import { fakeKeyStore, fakeAskDeps, buildTestDeps } from "../fixtures.js";
import { startTestServer } from "../testUtils.js";
import type { AskRouteDeps } from "../routes/ask/ask.js";
import { BoundedAskError } from "@lkb/ask";

async function start(deps: AskRouteDeps) {
  const app = express(); app.use(express.json());
  app.use(requireAuth(fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] }, "b-key": { tenantId: "tenant-b", scopes: ["ask"] },
    "read-key": { tenantId: "tenant-a", scopes: ["sessions"] } })));
  app.use(createAnswerPolicyRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/answer-policy/simulate`,
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); } };
}
function input() { return { query: " Topic One ", draft: { policyId: "browser-draft", version: 2, mode: "internal-only" } }; }
function deps(log: string[] = []): AskRouteDeps {
  return { askDeps: fakeAskDeps(), tree: { load: async (tenant) => { log.push(tenant); return {
    node_id: `root:${tenant}`, title: "Root", summary: "Root", level: "tenant", children: [{ node_id: "n1", title: "Topic One", summary: "Topic One",
      level: "session", evidence: { sessionRef: `session:${tenant}` }, children: [] }] }; } } };
}
async function post(url: string, body: unknown, key = "a-key") {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
}
test("simulation runs real Ask composition for each authenticated tenant and ignores submitted answer/tenant", async () => {
  const tenants: string[] = []; const d = deps(tenants); const factoryTenants: string[] = [];
  d.requestDepsFor = (tenantId) => { factoryTenants.push(tenantId); return fakeAskDeps(); };
  d.extraCandidateArmsFor = () => { throw new Error("legacy factory must not run"); };
  const server = await start(d);
  try {
    for (const [key, tenant] of [["a-key", "tenant-a"], ["b-key", "tenant-b"]]) {
      const reply = await post(server.url, { ...input(), tenantId: "foreign", result: { answer: "FORGED" } }, key);
      assert.equal(reply.status, 200); const payload = await reply.json() as { draft: { version: number }; simulation: { decision: string }; result: { answer: string; sources: { internal: { evidence: { sessionRef: string } }[] } } };
      assert.equal(payload.draft.version, 2); assert.equal(payload.simulation.decision, "allow");
      assert.equal(payload.result.answer, "This is the fake answer.");
      assert.equal(payload.result.sources.internal[0]!.evidence.sessionRef, `session:${tenant}`);
    }
    assert.deepEqual(tenants, ["tenant-a", "tenant-b"]); assert.deepEqual(factoryTenants, tenants);
  } finally { await server.close(); }
});
test("missing credentials and missing Ask scope prevent all retrieval", async () => {
  const tenants: string[] = []; const server = await start(deps(tenants));
  try { assert.equal((await post(server.url, input(), "invalid")).status, 401);
    assert.equal((await post(server.url, input(), "read-key")).status, 403); assert.equal(tenants.length, 0); }
  finally { await server.close(); }
});
test("invalid drafts and query budget fail before retrieval", async () => {
  const tenants: string[] = []; const server = await start(deps(tenants));
  try {
    for (const body of [null, { ...input(), query: " " }, { ...input(), query: "x".repeat(4001) },
      { ...input(), draft: { ...input().draft, mode: "unsafe" } }, { ...input(), draft: { ...input().draft, version: 0 } },
      { ...input(), draft: { ...input().draft, policyId: " " } }]) assert.equal((await post(server.url, body)).status, 400);
    assert.equal(tenants.length, 0);
  } finally { await server.close(); }
});
test("missing tenant tree and bounded source failures report honest errors", async () => {
  const empty = await start({ ...deps(), tree: { load: async () => null } });
  try { assert.equal((await post(empty.url, input())).status, 404); } finally { await empty.close(); }
  const d = deps(); d.requestDepsFor = () => ({ ...fakeAskDeps(), sourceContext: { hydrate: async () => { throw new BoundedAskError("source unavailable"); } } });
  const failed = await start(d);
  try { const reply = await post(failed.url, input()); assert.equal(reply.status, 503);
    assert.equal((await reply.json() as { error: string }).error, "source_context_unavailable"); } finally { await failed.close(); }
});
test("actual createServer mounts simulation behind shared auth and existing Ask dependencies", async () => {
  const tenants: string[] = [];
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  base.ask = deps(tenants);
  const server = await startTestServer(base);
  try {
    const url = server.baseUrl + "/answer-policy/simulate";
    assert.equal((await post(url, input(), "invalid")).status, 401);
    const reply = await post(url, input()); assert.equal(reply.status, 200);
    assert.equal((await reply.json() as { simulation: { decision: string } }).simulation.decision, "allow");
    assert.deepEqual(tenants, ["tenant-a"]);
  } finally { await server.close(); }
});

test("graph selector mounted policy simulation forwards normalized hints, never claimed tenant or top-level selectors", async () => {
  const calls: { tenant: string; selection: unknown }[] = [];
  const base = buildTestDeps({ keyStore: fakeKeyStore({ "a-key": { tenantId: "tenant-a", scopes: ["ask"] } }) });
  base.ask = deps();
  base.ask.requestDepsFor = (tenant, selection) => { calls.push({ tenant, selection }); return fakeAskDeps(); };
  const server = await startTestServer(base);
  try {
    const reply = await post(server.baseUrl + "/answer-policy/simulate", { ...input(), tenantId: "tenant-b",
      topicRefs: ["forged"], filters: { speakerRefs: [" person:alice ", "person:alice"], topicRefs: ["topic:fees"] } });
    assert.equal(reply.status, 200);
    assert.deepEqual(calls, [{ tenant: "tenant-a", selection: { speakerRefs: ["person:alice"], topicRefs: ["topic:fees"] } }]);
  } finally { await server.close(); }
});

test("graph selector policy simulation rejects invalid filters before retrieval and preserves tenant authority on foreign hints", async () => {
  const tenants: string[] = [], d = deps(tenants); let factories = 0;
  d.requestDepsFor = (tenant, selection) => {
    factories++; assert.equal(tenant, "tenant-a"); assert.deepEqual(selection, { topicRefs: ["tenant-b:fees"] });
    throw new BoundedAskError("selected graph authority unavailable");
  };
  const server = await start(d);
  try {
    for (const filters of [{ speakerRefs: ["spk:0"] }, { topicRefs: ["topic/foreign"] }, { topicRefs: [42] },
      { speakerRefs: Array.from({ length: 17 }, (_, n) => `person:${n}`) }, { authority: "trusted" }]) {
      const reply = await post(server.url, { ...input(), filters }); assert.equal(reply.status, 400);
    }
    assert.equal(tenants.length, 0); assert.equal(factories, 0);
    const refused = await post(server.url, { ...input(), filters: { topicRefs: ["tenant-b:fees"] } });
    assert.equal(refused.status, 503); assert.equal(factories, 1); assert.deepEqual(tenants, ["tenant-a"]);
  } finally { await server.close(); }
  const noFactory = await start(deps());
  try { assert.equal((await post(noFactory.url, { ...input(), filters: { topicRefs: ["topic:fees"] } })).status, 503); }
  finally { await noFactory.close(); }
});
