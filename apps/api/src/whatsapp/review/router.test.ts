import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireAuth } from "../../auth.js";
import { sha256Hex } from "../../hash.js";
import { detectWhatsAppReviewCandidates } from "./detection.js";
import { createMongoWhatsAppReviewRepository, type WhatsAppReviewRepository } from "./store.js";
import { createWhatsAppReviewRouter } from "./router.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "./test-fixtures.js";

async function boot(repository: WhatsAppReviewRepository) {
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async key => key === "a" ? { tenantId: "tenant-a", scopes: ["whatsapp"] }
    : key === "b" ? { tenantId: "tenant-b", scopes: ["whatsapp"] }
    : key === "no-scope" ? { tenantId: "tenant-a", scopes: ["ask"] } : null }));
  app.use(createWhatsAppReviewRouter(repository));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { url: `http://127.0.0.1:${address.port}`, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
const headers = (key: string) => ({ authorization: `Bearer ${key}`, "content-type": "application/json" });
async function seeded() {
  const input = reviewInput("Topic: Scholarships"); const fixture = reviewMongoFixture([input]);
  const store = createMongoWhatsAppReviewRepository(fixture.db, { now: () => REVIEW_TIME, materialize: async context => { await fixture.publish(context.candidate, context.session); } });
  const proposals = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME); await store.insert("tenant-a", proposals);
  return { fixture, store, proposals };
}

test("authenticated HTTP reviewer lists exact evidence and explicitly publishes one candidate with audit actor", async () => {
  const { fixture, store, proposals } = await seeded(); const server = await boot(store);
  try {
    const list = await fetch(`${server.url}/whatsapp/review?tenantId=tenant-b`, { headers: headers("a") }); assert.equal(list.status, 200);
    const body = await list.json() as { candidates: { _id: string }[] }; assert.equal(body.candidates.length, 2);
    const detail = await fetch(`${server.url}/whatsapp/review/${proposals[0]!._id}`, { headers: headers("a") }); assert.equal(detail.status, 200);
    const detailBody = await detail.json() as { candidate: { evidence: { turnId: string; quote: string }[] } };
    assert.equal(detailBody.candidate.evidence[0]!.turnId, "turn-a"); assert.equal(detailBody.candidate.evidence[0]!.quote, "Topic: Scholarships");
    const decision = await fetch(`${server.url}/whatsapp/review/${proposals[0]!._id}/approve`, { method: "POST", headers: headers("a"), body: "{}" });
    assert.equal(decision.status, 200); const result = await decision.json() as { candidate: { decision: { actor: string } } };
    assert.equal(result.candidate.decision.actor, `api-key-sha256:${sha256Hex("a")}`); assert.equal(fixture.rows("published").length, 1);
    assert.equal((await store.get("tenant-a", proposals[1]!._id))!.status, "needs-review");
  } finally { await server.close(); }
});

test("HTTP route refuses no auth/scope, foreign existence and forged decision principal/tenant", async () => {
  const { fixture, store, proposals } = await seeded(); const server = await boot(store); const path = `/whatsapp/review/${proposals[0]!._id}`;
  try {
    assert.equal((await fetch(`${server.url}/whatsapp/review`)).status, 401);
    assert.equal((await fetch(`${server.url}/whatsapp/review`, { headers: headers("no-scope") })).status, 403);
    assert.equal((await fetch(`${server.url}${path}?tenantId=tenant-a`, { headers: headers("b") })).status, 404);
    assert.equal((await fetch(`${server.url}${path}/approve`, { method: "POST", headers: headers("b"), body: "{}" })).status, 404);
    assert.equal((await fetch(`${server.url}${path}/approve`, { method: "POST", headers: headers("a"), body: JSON.stringify({ tenantId: "tenant-b", actor: "forged", status: "approved" }) })).status, 400);
    assert.equal(fixture.rows("published").length, 0);
  } finally { await server.close(); }
});

test("HTTP rejection is durable/idempotent and opposite decision honestly conflicts", async () => {
  const { fixture, store, proposals } = await seeded(); const server = await boot(store); const path = `/whatsapp/review/${proposals[0]!._id}`;
  try {
    const post = (verb: string) => fetch(`${server.url}${path}/${verb}`, { method: "POST", headers: headers("a"), body: "{}" });
    assert.equal((await post("reject")).status, 200); assert.equal((await post("reject")).status, 200);
    assert.equal((await post("approve")).status, 409); assert.equal(fixture.rows("published").length, 0);
  } finally { await server.close(); }
});

test("HTTP failed transaction and unresolved evidence do not return success or internal errors", async () => {
  const input = reviewInput(); const fixture = reviewMongoFixture([input]);
  const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db, { materialize: async () => { throw new Error("secret Mongo/provider detail"); } });
  await store.insert("tenant-a", [row]); const server = await boot(store);
  try {
    const result = await fetch(`${server.url}/whatsapp/review/${row._id}/approve`, { method: "POST", headers: headers("a"), body: "{}" });
    assert.equal(result.status, 502); assert.ok(!(await result.text()).includes("secret"));
    assert.equal((await store.get("tenant-a", row._id))!.status, "needs-review");
    fixture.removeTurn("turn-a");
    assert.equal((await fetch(`${server.url}/whatsapp/review/${row._id}`, { headers: headers("a") })).status, 502);
    assert.equal((await fetch(`${server.url}/whatsapp/review`, { headers: headers("a") })).status, 502);
  } finally { await server.close(); }
});

test("HTTP approval without configured materializer is unavailable and retains quarantine", async () => {
  const input = reviewInput(); const fixture = reviewMongoFixture([input]); const row = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  const store = createMongoWhatsAppReviewRepository(fixture.db); await store.insert("tenant-a", [row]); const server = await boot(store);
  try {
    const response = await fetch(`${server.url}/whatsapp/review/${row._id}/approve`, { method: "POST", headers: headers("a"), body: "{}" });
    assert.equal(response.status, 503); assert.equal((await store.get("tenant-a", row._id))!.status, "needs-review");
  } finally { await server.close(); }
});
