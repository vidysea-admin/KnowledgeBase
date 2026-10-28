import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { AskV2Result } from "@lkb/ask";
import { requireAuth } from "../auth.js";
import { fakeKeyStore } from "../fixtures.js";
import { createAnswerHistoryRouter, type AnswerReviewAuthority, type HumanReviewAction } from "./answer-router.js";
import { createAnswerWorkflow } from "./answer-workflow.js";
import { createAnswerPolicyService } from "./service.js";
import { createInMemoryAnswerPolicyStore } from "./store.js";
import { createInMemoryAnswerRecordStore } from "./answer-record-store.js";
import { answerEvidence, digest } from "./answer-evidence.js";

// Synthetic HTTP fixture only; these identities never establish real human acceptance.
const fixtureAuthority: AnswerReviewAuthority = { verifyHuman: async (req) => ({ kind: "human", tenantId: req.auth!.tenantId, subject: "fixture-reviewer" }) };
async function start(authority?: AnswerReviewAuthority) {
  const store = createInMemoryAnswerRecordStore(), service = createAnswerPolicyService(createInMemoryAnswerPolicyStore());
  const candidate: AskV2Result = { answer: "Fee is 100.", verdict: "ambiguous", reason: "partial", scored: [], auditLog: [], web_used: false, insufficient_coverage: true,
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [{ quote: "Fee is 100.", turnId: "t1", speakerRef: "spk:0", tStart: 0, tEnd: 10 }] } },
      { node_id: "n2", evidence: { sessionRef: "s2", sourceQuotes: [{ quote: "Fee is 200.", turnId: "t2", speakerRef: "spk:0", tStart: 0, tEnd: 10 }] } }], web: [] } };
  const evidence = answerEvidence(candidate), candidateDigest = digest(candidate), evidenceDigest = digest(evidence);
  await store.create("tenant-a", { id: "run-1", tenantId: "tenant-a", actor: { actor: "api-key:tenant-a" }, query: "Fee?", questionClass: "fees", createdAt: "2026-10-14T00:00:00.000Z",
    filters: { sessionIds: [], sources: "internal" }, evidenceMode: true, state: "review", reason: "insufficient-coverage", candidate, candidateDigest, evidenceDigest, evidence, policy: null, feedback: [] });
  const app = express(); app.use(express.json()); app.use(requireAuth(fakeKeyStore({
    ask: { tenantId: "tenant-a", scopes: ["ask"] }, read: { tenantId: "tenant-a", scopes: ["answer-policy:read"] },
    reviewer: { tenantId: "tenant-a", scopes: ["ask", "answer-policy:read", "answer-policy:write"] },
    foreign: { tenantId: "tenant-b", scopes: ["ask", "answer-policy:read", "answer-policy:write"] },
  })));
  app.use(createAnswerHistoryRouter(createAnswerWorkflow(service, store, async () => true), authority));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, key: string | null, body?: unknown) => {
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, json: await response.json() as Record<string, any> };
  };
  const close = async () => { server.closeAllConnections(); await new Promise<void>((r, j) => server.close((e) => e ? j(e) : r())); };
  return { call, close, store, candidateDigest, evidenceDigest };
}
test("human-authorized history/answer-review endpoints preserve scope, tenant, revision and duplicate boundaries", async () => {
  const s = await start(fixtureAuthority);
  try {
    assert.equal((await s.call("/answer-history", null)).status, 401);
    assert.equal((await s.call("/answer-reviews", "ask")).status, 403);
    const hidden = await s.call("/answer-history", "ask"); assert.equal(hidden.json.history[0].result.answer, "");
    const candidate = await s.call("/answer-reviews", "read"); assert.equal(candidate.json.items[0].candidate.answer, "Fee is 100.");
    const review = { decision: "approved", note: "Checked source quote", candidateDigest: s.candidateDigest, evidenceDigest: s.evidenceDigest };
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "ask", review)).status, 403);
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "read", review)).status, 403);
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "foreign", review)).status, 404);
    assert.deepEqual((await s.call("/answer-history", "foreign")).json.history, []);
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "reviewer", { ...review, candidateDigest: "forged" })).status, 409);
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "reviewer", review)).status, 200);
    assert.equal((await s.store.get("tenant-a", "run-1"))!.review!.by.actor, "human:fixture-reviewer");
    assert.equal((await s.call("/answer-history/run-1", "ask")).json.result.answer, "Fee is 100.");
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "reviewer", review)).status, 409);
    assert.equal((await s.call("/answer-history/run-1/feedback", "foreign", { rating: "helpful", note: "x" })).status, 404);
    assert.equal((await s.call("/answer-history/run-1/feedback", "ask", { rating: "unhelpful", note: "Need context", tenantId: "tenant-b" })).status, 200);
    assert.equal((await s.store.get("tenant-a", "run-1"))!.feedback[0]!.by.actor, "human:fixture-reviewer");
    assert.equal(await s.store.get("tenant-b", "run-1"), null);
  } finally { await s.close(); }
});

test("API-key scopes and claimed human labels cannot approve, prefer sources or label usefulness without trusted authority", async () => {
  const s = await start();
  try {
    const forged = { kind: "human", actor: "human:Umesh", reviewer: { tenantId: "tenant-a", subject: "Umesh" },
      decision: "approved", note: "claimed human", rating: "helpful", candidateDigest: s.candidateDigest, evidenceDigest: s.evidenceDigest };
    for (const path of ["/answer-reviews/run-1/resolve", "/answer-evidence-conflicts/conflict-1/resolve", "/answer-history/run-1/feedback"]) {
      const denied = await s.call(path, "reviewer", forged);
      assert.equal(denied.status, 503); assert.equal(denied.json.error, "human_review_unavailable");
    }
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "ask", forged)).status, 403);
    assert.equal((await s.call("/answer-reviews", "reviewer")).status, 200);
    assert.equal((await s.call("/answer-history", "ask")).status, 200);
    const run = (await s.store.get("tenant-a", "run-1"))!;
    assert.equal(run.state, "review"); assert.equal(run.review, undefined); assert.deepEqual(run.feedback, []);
  } finally { await s.close(); }
});

test("human verification fails closed on absent, foreign, nonhuman, malformed and unavailable authority", async () => {
  const deniedAuthorities: Array<{ authority: AnswerReviewAuthority; status: number }> = [
    { authority: { verifyHuman: async () => null }, status: 403 },
    { authority: { verifyHuman: async () => ({ kind: "human", tenantId: "tenant-b", subject: "foreign" }) }, status: 403 },
    { authority: { verifyHuman: async () => ({ kind: "agent", tenantId: "tenant-a", subject: "agent" } as never) }, status: 403 },
    { authority: { verifyHuman: async () => ({ kind: "human", tenantId: "tenant-a", subject: " " }) }, status: 403 },
    { authority: { verifyHuman: async () => ({ kind: "human", tenantId: "tenant-a", subject: "bad\nactor" }) }, status: 403 },
    { authority: { verifyHuman: async () => { throw new Error("private verifier details"); } }, status: 503 },
  ];
  for (const { authority, status } of deniedAuthorities) {
    const s = await start(authority);
    try {
      for (const path of ["/answer-reviews/run-1/resolve", "/answer-evidence-conflicts/conflict-1/resolve", "/answer-history/run-1/feedback"]) {
        const denied = await s.call(path, "reviewer", { decision: "approved", rating: "helpful", note: "reason" });
        assert.equal(denied.status, status); assert.equal(JSON.stringify(denied.json).includes("private verifier details"), false);
      }
      const run = (await s.store.get("tenant-a", "run-1"))!;
      assert.equal(run.state, "review"); assert.deepEqual(run.feedback, []);
    } finally { await s.close(); }
  }
});

test("trusted human authority receives each action and persists source preference attribution", async () => {
  const actions: HumanReviewAction[] = [];
  const s = await start({ verifyHuman: async (req, action) => {
    actions.push(action); return { kind: "human", tenantId: req.auth!.tenantId, subject: "fixture-human" };
  } });
  try {
    const run = (await s.store.get("tenant-a", "run-1"))!;
    const reported = await s.call("/answer-history/run-1/conflicts", "ask", { a: run.evidence[0]!.id, b: run.evidence[1]!.id, explanation: "Different quoted fees" });
    assert.equal(reported.status, 200); assert.deepEqual(actions, []);
    const conflict = reported.json;
    const resolved = await s.call(`/answer-evidence-conflicts/${String(conflict.id)}/resolve`, "reviewer", {
      keepSourceId: run.evidence[0]!.id, evidenceDigest: s.evidenceDigest, note: "Prefer current published fee", actor: "forged" });
    assert.equal(resolved.status, 200); assert.equal(resolved.json.resolution.by.actor, "human:fixture-human");
    assert.equal((await s.store.getConflict("tenant-a", String(conflict.id)))!.resolution!.by.actor, "human:fixture-human");
    assert.equal((await s.call("/answer-history/run-1/feedback", "ask", { rating: "helpful", note: "Source comparison is useful" })).status, 200);
    // Existing source conflict guards still decide whether review may proceed.
    assert.equal((await s.call("/answer-reviews/run-1/resolve", "reviewer", { decision: "approved", note: "Checked", candidateDigest: s.candidateDigest, evidenceDigest: s.evidenceDigest })).status, 409);
    assert.deepEqual(actions, ["source-preference", "usefulness", "answer-review"]);
  } finally { await s.close(); }
});
