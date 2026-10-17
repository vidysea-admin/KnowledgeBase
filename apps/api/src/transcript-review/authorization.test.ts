import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireAuth } from "../auth.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { memoryDb } from "./memdb.testsupport.js";
import { keys, SESSION, seed } from "./persist.testkit.js";
import { createTranscriptReviewRouter } from "./router.js";
import { createMongoReviewStore, type ReviewStore } from "./store.js";

async function authorizedFixture() {
  const m = memoryDb(); seed(m);
  for (const tenantId of ["tenant-A", "tenant-B"]) {
    m.seed("sessions", { _id: SESSION, tenantId, sourceId: "source", title: "Sensitive source title" });
    m.seed("sources", { _id: "source", tenantId, kind: tenantId === "tenant-A" ? "recording" : "whatsapp-batch", path: "private-group" });
  }
  const base = createMongoReviewStore(m.db);
  let accesses = 0, refreshes = 0;
  const store: ReviewStore = {
    originalTurns: (...args) => { accesses++; return base.originalTurns(...args); },
    head: (...args) => { accesses++; return base.head(...args); },
    insertHead: (...args) => { accesses++; return base.insertHead(...args); },
    replaceHead: (...args) => { accesses++; return base.replaceHead(...args); },
    recordRevision: (...args) => { accesses++; return base.recordRevision(...args); },
    listRevisions: (...args) => { accesses++; return base.listRevisions(...args); },
    setRefresh: (...args) => { accesses++; return base.setRefresh(...args); },
  };
  const authorized: [string, string][] = [];
  const app = express(); app.use(express.json()); app.use(requireAuth(keys));
  app.use(createTranscriptReviewRouter({ store, refresh: async () => { refreshes++; },
    authorizeSession: async (tenantId, sessionId) => {
      authorized.push([tenantId, sessionId]); return createKnowledgeVisibility(m.db).sessionVisible(tenantId, sessionId);
    } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const call = (method: string, suffix: string, key: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}/sessions/${SESSION}/transcript-review${suffix}`, {
    method, headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { m, authorized, call, accesses: () => accesses, refreshes: () => refreshes,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("actual source visibility denies every maintenance endpoint before raw/history/precondition/write access", async () => {
  const h = await authorizedFixture();
  try {
    for (const [method, suffix] of [["GET", ""], ["GET", "/history"], ["POST", ""], ["POST", "/refresh"]]) {
      const response = await h.call(method!, suffix!, "key-b", method === "POST" ? { authorizeSession: true, tenantId: "tenant-A" } : undefined);
      assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "not_found", message: "Transcript review not found" });
      assert.equal(response.headers.get("etag"), null);
    }
    assert.deepEqual(h.authorized, Array.from({ length: 4 }, () => ["tenant-B", SESSION]));
    assert.equal(h.accesses(), 0, "no raw rows, revisions, CAS or refresh bookkeeping may be read before refusal");
    assert.equal(h.refreshes(), 0); assert.deepEqual(h.m.writes, []);
  } finally { await h.close(); }
});
test("verified tenant controls eligibility; recording review remains accessible and source withdrawal is rechecked", async () => {
  const h = await authorizedFixture();
  try {
    const response = await h.call("GET", "", "key-a"); assert.equal(response.status, 200);
    const body = await response.json() as { turns: { text: string }[] }; assert.ok(body.turns[0]!.text.startsWith("Alpha"));
    const accesses = h.accesses(); h.m.rows("sources").find((row) => row.tenantId === "tenant-A")!.kind = "whatsapp-batch";
    assert.equal((await h.call("GET", "/history", "key-a")).status, 404);
    assert.equal(h.accesses(), accesses, "source eligibility is not cached from the successful snapshot read");
    assert.deepEqual(h.authorized, [["tenant-A", SESSION], ["tenant-A", SESSION]]);
  } finally { await h.close(); }
});
