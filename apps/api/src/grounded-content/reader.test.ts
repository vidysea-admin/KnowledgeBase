import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Db } from "mongodb";
import { requireAuth } from "../auth.js";
import { createGroundedContentDeps, createMongoGroundedContentDeps, type GroundedContent, type GroundedReadDeps } from "./reader.js";
import { createGroundedContentRouter } from "./router.js";

function fixture(): NonNullable<Awaited<ReturnType<GroundedReadDeps["getSessionDetail"]>>> {
  const ref = { turnId: "turn-1", sessionId: "session-1", quote: "Keep evidence." };
  return {
    session: { _id: "session-1", tenantId: "a", sourceId: "src", title: "Session", date: "2026-10-14", status: { transcribe: "done", index: "done" } },
    turns: [{ _id: "turn-1", tenantId: "a", sessionId: "session-1", speakerRef: "expert", text: "Keep evidence. Then review it.", tStart: 12, tEnd: 19 }],
    page: { _id: "page", tenantId: "a", sessionId: "session-1", summary: "Keep evidence.", evidence: [ref],
      citedItems: [{ id: "note", kind: "insight", text: "Keep evidence.", origin: "speaker-statement", verification: "unverified", evidence: [ref] }],
      qa: [{ id: "q", question: "Then review it.", questionEvidence: [{ ...ref, quote: "Then review it." }], answer: null, answerEvidence: [], status: "unanswered" }] },
    claims: [{ _id: "claim", tenantId: "a", text: "Keep evidence.", status: "needs-review", evidence: [ref] }],
  };
}
test("projection resolves exact quotes/times and preserves review states, with no raw extras", async () => {
  const detail = fixture(); detail.page!.privateToken = "hidden";
  const data = await createGroundedContentDeps({ getSessionDetail: async () => detail }).getGroundedContent("a", "session-1");
  assert.equal(data!.notes[0]!.evidence[0]!.available, true);
  assert.equal(data!.notes[0]!.evidence[0]!.tStart, 12);
  assert.equal(data!.notes[0]!.verification, "unverified");
  assert.equal(data!.qa[0]!.answer, null); assert.deepEqual(data!.qa[0]!.answerEvidence, []);
  assert.equal(data!.claims[0]!.status, "needs-review");
  assert.ok(!JSON.stringify(data).includes("hidden"));
});
test("missing and fabricated evidence is visibly unresolved, never borrowed from other session or tenant", async () => {
  for (const alter of [
    (d: ReturnType<typeof fixture>) => { d.turns[0]!.tenantId = "b"; },
    (d: ReturnType<typeof fixture>) => { d.turns[0]!.sessionId = "session-other"; },
    (d: ReturnType<typeof fixture>) => { d.page!.citedItems![0]!.evidence[0]!.quote = "invented"; },
    (d: ReturnType<typeof fixture>) => { d.page!.citedItems![0]!.evidence[0]!.sessionId = "session-other"; },
    (d: ReturnType<typeof fixture>) => { d.turns = []; },
  ]) {
    const detail = fixture(); alter(detail);
    const data = await createGroundedContentDeps({ getSessionDetail: async () => detail }).getGroundedContent("a", "session-1");
    assert.equal(data!.notes[0]!.evidence[0]!.available, false);
    assert.equal(data!.notes[0]!.evidence[0]!.tStart, null);
    assert.equal(data!.notes[0]!.evidence[0]!.speaker, null);
  }
});
test("foreign session is refused and foreign pages/claims are excluded", async () => {
  const detail = fixture(); detail.session.tenantId = "b";
  const deps = createGroundedContentDeps({ getSessionDetail: async () => detail });
  assert.equal(await deps.getGroundedContent("a", "session-1"), null);
  detail.session.tenantId = "a"; detail.page!.tenantId = "b"; detail.claims[0]!.tenantId = "b";
  assert.deepEqual(await deps.getGroundedContent("a", "session-1"), { sessionId: "session-1", notes: [], qa: [], claims: [] });
});
test("invalid tenant cannot reach even an injected read dependency", async () => {
  let reads = 0;
  const deps = createGroundedContentDeps({ getSessionDetail: async () => { reads++; return fixture(); } });
  for (const tenant of ["", " ", "a ", "a\n", undefined, null, 42, {}, [], { $ne: null }, { $gt: "" }, { $in: ["a"] }, { $regex: ".*" }]) {
    await assert.rejects(() => deps.getGroundedContent(tenant as string, "session-1"));
  }
  assert.equal(reads, 0);
});
test("legacy page has empty grounded collections; unanswered cannot leak stale answer", async () => {
  const detail = fixture(); detail.page!.qa![0]!.answer = "stale answer";
  detail.page!.qa![0]!.answerEvidence = [{ turnId: "turn-1", sessionId: "session-1", quote: "Keep evidence." }];
  const deps = createGroundedContentDeps({ getSessionDetail: async () => detail });
  assert.equal((await deps.getGroundedContent("a", "session-1"))!.qa[0]!.answer, null);
  delete detail.page!.qa; delete detail.page!.citedItems;
  assert.deepEqual((await deps.getGroundedContent("a", "session-1"))!.notes, []);
});
test("Mongo reads all include authenticated tenant, and unknown session avoids dependent reads", async () => {
  const detail = fixture(), queries: Array<{ name: string; filter: Record<string, unknown> }> = [];
  let found = true;
  const db = { collection(name: string) { return {
    async findOne(filter: Record<string, unknown>) { queries.push({ name, filter }); return name === "sessions" ? (found ? detail.session : null) : detail.page; },
    find(filter: Record<string, unknown>) { queries.push({ name, filter }); return { toArray: async () => name === "claims" ? detail.claims : detail.turns }; },
  }; } } as unknown as Db;
  const deps = createMongoGroundedContentDeps(db);
  assert.ok(await deps.getGroundedContent("a", "session-1"));
  assert.equal(queries.length, 4); assert.ok(queries.every((q) => q.filter.tenantId === "a"));
  found = false; queries.length = 0;
  assert.equal(await deps.getGroundedContent("a", "session-1"), null); assert.equal(queries.length, 1);
  await assert.rejects(() => deps.getGroundedContent("", "session-1"));
});
test("HTTP route requires auth and sessions scope, ignores client tenant, and returns real 404", async () => {
  const calls: string[] = [];
  const deps = createGroundedContentDeps({ getSessionDetail: async (tenant, id) => { calls.push(tenant); return tenant === "a" && id === "session-1" ? fixture() : null; } });
  const app = express();
  app.use(requireAuth({ verify: async (key) => key === "session-key" ? { tenantId: "a", scopes: ["sessions"] } : key === "ask-key" ? { tenantId: "a", scopes: ["ask"] } : null }));
  app.use(createGroundedContentRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/sessions/session-1/grounded-content`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: "Bearer ask-key" } })).status, 403);
    assert.deepEqual(calls, []);
    const response = await fetch(`${url}?tenantId=b`, { headers: { authorization: "Bearer session-key", "X-LKB-Tenant": "b" } });
    const body = await response.json() as GroundedContent;
    assert.equal(response.status, 200); assert.equal(body.notes[0]!.evidence[0]!.available, true);
    assert.deepEqual(calls, ["a"]);
    assert.equal((await fetch(url.replace("session-1", "missing"), { headers: { authorization: "Bearer session-key" } })).status, 404);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
