import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { mountAnswerPolicyAdmin } from "./admin-router.js";
import { createAnswerPolicyService } from "./service.js";
import { createInMemoryAnswerPolicyStore } from "./store.js";
import { requireAuth } from "../auth.js";
import { fakeKeyStore } from "../fixtures.js";

async function start() {
  const app = express(); app.use(express.json());
  app.use(requireAuth(fakeKeyStore({
    "a-rw": { tenantId: "tenant-a", scopes: ["answer-policy:read", "answer-policy:write"] },
    "a-ro": { tenantId: "tenant-a", scopes: ["answer-policy:read"] },
    "b-rw": { tenantId: "tenant-b", scopes: ["answer-policy:read", "answer-policy:write"] },
    "ask-only": { tenantId: "tenant-a", scopes: ["ask"] } })));
  mountAnswerPolicyAdmin(app, createAnswerPolicyService(createInMemoryAnswerPolicyStore()));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, key: string | null, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: await res.json() as Record<string, any> };
  };
  return { call, close: async () => { server.closeAllConnections(); await new Promise<void>((r, j) => server.close((e) => e ? j(e) : r())); } };
}
const pol = (o: Record<string, unknown> = {}) => ({ questionClass: "fees", mode: "internal-only", style: "concise", onInsufficient: "review", note: "init", ...o });

test("auth and scopes: 401 without key, 403 for wrong scope or read-only writes; nothing is written", async () => {
  const s = await start();
  try {
    assert.equal((await s.call("GET", "/answer-policies", null)).status, 401);
    assert.equal((await s.call("GET", "/answer-policies", "ask-only")).status, 403);
    assert.equal((await s.call("PUT", "/answer-policies/p1", "a-ro", pol())).status, 403);
    assert.equal((await s.call("POST", "/answer-policies/p1/retire", "a-ro", { note: "x", expectedVersion: 1 })).status, 403);
    assert.equal((await s.call("POST", "/answer-policies/review-queue/x/resolve", "a-ro", {})).status, 403);
    assert.deepEqual((await s.call("GET", "/answer-policies", "a-ro")).json.policies, []);
  } finally { await s.close(); }
});
test("save/history/conflict/queue/resolve over HTTP, with tenant taken from the key only", async () => {
  const s = await start();
  try {
    const put = await s.call("PUT", "/answer-policies/p1", "a-rw", pol({ tenantId: "tenant-b", claimedBy: "Priya" }));
    assert.equal(put.status, 400, "client tenant field is refused as unknown");
    const ok = await s.call("PUT", "/answer-policies/p1", "a-rw", pol({ claimedBy: "Priya" }));
    assert.equal(ok.status, 200); assert.equal(ok.json.revision.tenantId, "tenant-a"); assert.equal(ok.json.revision.changedBy.actor, "api-key:tenant-a");
    const two = await s.call("PUT", "/answer-policies/p2", "a-rw", pol({ mode: "internal-and-web" }));
    assert.equal(two.json.conflicts[0].dimension, "mode");
    assert.equal((await s.call("PUT", "/answer-policies/p1", "a-rw", pol())).status, 409);
    assert.equal((await s.call("PUT", "/answer-policies/p1", "a-rw", pol({ citations: "optional" }))).json.error, "policy_cannot_override_evidence");
    assert.equal((await s.call("GET", "/answer-policies/p1/history", "a-ro")).json.history.length, 1);
    assert.equal((await s.call("GET", "/answer-policies/conflicts", "a-ro")).json.conflicts.length, 1);
    const q = (await s.call("GET", "/answer-policies/review-queue?status=open", "a-ro")).json.items as { id: string; kind: string }[];
    assert.equal(q.length, 3);
    assert.equal((await s.call("GET", "/answer-policies/review-queue?status=bogus", "a-ro")).status, 400);
    const conflict = q.find((i) => i.kind === "conflict")!;
    const res = await s.call("POST", `/answer-policies/review-queue/${conflict.id}/resolve`, "a-rw", { decision: "acknowledged", note: "known" });
    assert.equal(res.status, 200); assert.equal(res.json.item.status, "acknowledged");
    assert.equal((await s.call("POST", `/answer-policies/review-queue/${conflict.id}/resolve`, "a-rw", { decision: "dismissed", note: "again" })).status, 409);
    assert.equal((await s.call("PUT", "/answer-policies/bad id!", "a-rw", pol())).status, 400);
    assert.equal((await s.call("POST", "/answer-policies/p2/retire", "a-rw", { note: "drop", expectedVersion: 1 })).status, 200);
  } finally { await s.close(); }
});
test("cross-tenant over HTTP: B cannot read, resolve, retire or collide with A's policies", async () => {
  const s = await start();
  try {
    await s.call("PUT", "/answer-policies/p1", "a-rw", pol());
    await s.call("PUT", "/answer-policies/p2", "a-rw", pol({ mode: "internal-and-web" }));
    const aItems = (await s.call("GET", "/answer-policies/review-queue", "a-rw")).json.items as { id: string }[];
    assert.deepEqual((await s.call("GET", "/answer-policies", "b-rw")).json.policies, []);
    assert.deepEqual((await s.call("GET", "/answer-policies/p1/history", "b-rw")).json.history, []);
    assert.deepEqual((await s.call("GET", "/answer-policies/conflicts", "b-rw")).json.conflicts, []);
    assert.deepEqual((await s.call("GET", "/answer-policies/review-queue", "b-rw")).json.items, []);
    for (const item of aItems) assert.equal((await s.call("POST", `/answer-policies/review-queue/${item.id}/resolve`, "b-rw", { decision: "approved", note: "x" })).status, 404);
    assert.equal((await s.call("POST", "/answer-policies/p1/retire", "b-rw", { note: "x", expectedVersion: 1 })).status, 404);
    assert.equal((await s.call("PUT", "/answer-policies/p1", "b-rw", pol({ style: "detailed", expectedVersion: 1 }))).status, 409, "B has no p1, so A's version number is meaningless to B");
    const bNew = await s.call("PUT", "/answer-policies/p1", "b-rw", pol({ style: "detailed" }));
    assert.equal(bNew.json.revision.version, 1);
    assert.equal((await s.call("GET", "/answer-policies/p1/history", "a-rw")).json.history[0].style, "concise");
    assert.equal((await s.call("GET", "/answer-policies/review-queue?status=open", "a-rw")).json.items.length, aItems.length);
  } finally { await s.close(); }
});
