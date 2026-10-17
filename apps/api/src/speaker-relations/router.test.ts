import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { VerifiedKey } from "../auth.js";
import { createSpeakerRelationsRouter, type SpeakerRelationsRouterDeps } from "./router.js";
import { SpeakerRelationshipError } from "./service.js";
import type { RelationshipContext, RelationshipProposal, RelationshipRow, SpeakerRelationshipService } from "./types.js";

const principal: VerifiedKey = { tenantId: "A", keyId: "key:a", scopes: ["sessions"] };
const human: RelationshipContext = { tenantId: "A", actorId: "user:reviewer", canPropose: true, canReview: true, reviewerKind: "human" };
const input: RelationshipProposal = { id: "proposal:1", personId: "person:priya", fromClaimId: "claim:1", toClaimId: "claim:2", type: "contradicts", sourceRevisionDigest: "a".repeat(64), evidence: [{ sessionId: "session:1", turnId: "turn:1", quote: "Evidence", transcriptHash: "b".repeat(64) }] };
const row: RelationshipRow = { _id: "rel:1", tenantId: "A", revision: 1, status: "suggested", type: input.type, from: { personId: input.personId, claimId: input.fromClaimId }, to: { personId: input.personId, claimId: input.toClaimId }, evidence: input.evidence, createdBy: "internal:actor", sourceRevisionDigest: input.sourceRevisionDigest, reviewHistory: [] };
function fixture() {
  const calls: unknown[][] = [];
  const service: SpeakerRelationshipService = {
    async propose(c, p) { calls.push(["propose", c, p]); return { id: "rel:1", revision: 1, status: "suggested", replayed: false }; },
    async review(c, r) { calls.push(["review", c, r]); return { id: r.id, revision: 2, status: { accept: "accepted", reject: "rejected", revoke: "revoked" }[r.decision] as RelationshipRow["status"], replayed: false }; },
    async list(c, p, s) { calls.push(["list", c, p, s]); return [{ ...row, status: s }]; },
    async accepted() { throw new Error("graph consumer is outside router scope"); },
  };
  return { service, calls };
}
async function boot(deps: SpeakerRelationsRouterDeps, auth: VerifiedKey | null = principal) {
  const app = express(); app.use(express.json());
  // This is the preverified middleware seam; request headers cannot set req.auth.
  app.use((req, _res, next) => { req.auth = auth ?? undefined; next(); });
  app.use(createSpeakerRelationsRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const call = (path: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "X-LKB-Tenant": "FOREIGN", "X-Actor-Id": "forged", authorization: "Bearer forged" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { call, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
test("relationship router requires verified principal and sessions scope", async () => {
  for (const auth of [undefined, { ...principal, tenantId: " A" }, { ...principal, keyId: "" }, { ...principal, scopes: [] }, { ...principal, scopes: "sessions" } as unknown as VerifiedKey]) {
    const f = fixture(); let policies = 0;
    const server = await boot({ service: f.service, async contextFor() { policies++; return human; } }, auth ?? null);
    try {
      assert.equal((await server.call("/speaker-relations?personId=person:priya")).status, auth?.scopes instanceof Array && auth.scopes.length === 0 && auth.tenantId === "A" ? 403 : 401);
      assert.equal(policies, 0); assert.deepEqual(f.calls, []);
    } finally { await server.close(); }
  }
});
test("relationship router trusts only injected policy and rejects foreign context", async () => {
  const f = fixture(); const seen: unknown[] = [];
  const server = await boot({ service: f.service, async contextFor(p) { seen.push(p); return human; } });
  try {
    const response = await server.call("/speaker-relations", input); assert.equal(response.status, 201);
    assert.deepEqual(seen, [principal]); assert.deepEqual(f.calls, [["propose", human, input]]);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  } finally { await server.close(); }
  const foreign = await boot({ service: f.service, async contextFor() { return { ...human, tenantId: "FOREIGN" }; } });
  try { assert.equal((await foreign.call("/speaker-relations", input)).status, 503); assert.equal(f.calls.length, 1); }
  finally { await foreign.close(); }
});
test("relationship router rejects forged authority and invalid proposal shapes", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  try {
    const extras = ["actorId", "tenantId", "canPropose", "canReview", "reviewerKind", "permission"];
    for (const extra of extras) assert.equal((await server.call("/speaker-relations", { ...input, [extra]: "forged" })).status, 400);
    for (const body of [null, [], {}, { ...input, evidence: [] }, { ...input, evidence: Array(21).fill(input.evidence[0]) }, { ...input, evidence: [{ ...input.evidence[0], reviewerKind: "human" }] }, { ...input, fromClaimId: input.toClaimId }, { ...input, sourceRevisionDigest: "bad" }, { ...input, evidence: [{ ...input.evidence[0], quote: " " }] }, { ...input, evidence: [input.evidence[0], input.evidence[0]] }]) {
      assert.equal((await server.call("/speaker-relations", body)).status, 400);
    }
    assert.equal((await server.call("/speaker-relations?tenantId=A", input)).status, 400); assert.deepEqual(f.calls, []);
  } finally { await server.close(); }
});
test("relationship router refuses automation review and missing write permissions", async () => {
  for (const policy of [{ ...human, reviewerKind: "automation" as const }, { ...human, canReview: false }, { ...human, canPropose: false, canReview: false }]) {
    const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return policy; } });
    try {
      assert.equal((await server.call("/speaker-relations/rel:1/review", { baseRevision: 1, requestId: "req:1", decision: "accept" })).status, 403);
      if (!policy.canPropose) assert.equal((await server.call("/speaker-relations", input)).status, 403);
      assert.deepEqual(f.calls, []);
    } finally { await server.close(); }
  }
});
test("relationship router bounds explicit review commands and strips receipt extras", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  const review = { baseRevision: 1, requestId: "req:1", decision: "accept" };
  try {
    for (const decision of ["accept", "reject", "revoke"]) {
      const response = await server.call("/speaker-relations/rel:1/review", { ...review, decision }); assert.equal(response.status, 200);
      assert.deepEqual(f.calls.at(-1), ["review", human, { id: "rel:1", ...review, decision }]);
    }
    for (const body of [{ ...review, id: "rel:foreign" }, { ...review, actorId: "forged" }, { ...review, reviewerKind: "human" }, { ...review, tenantId: "FOREIGN" }, { ...review, permission: true }, { ...review, baseRevision: 0 }, { ...review, baseRevision: 1.5 }, { ...review, decision: "accepted" }, { ...review, requestId: "" }]) assert.equal((await server.call("/speaker-relations/rel:1/review", body)).status, 400);
    assert.equal(f.calls.length, 3);
    f.service.review = async () => ({ id: "rel:1", revision: 2, status: "accepted", replayed: false, secret: "SECRET" });
    assert.deepEqual(await (await server.call("/speaker-relations/rel:1/review", review)).json(), { relationship: { id: "rel:1", revision: 2, status: "accepted", replayed: false } });
  } finally { await server.close(); }
});
test("relationship router lists suggested by default with source-safe DTO and bounded filters", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  try {
    const response = await server.call("/speaker-relations?personId=person:priya"); assert.equal(response.status, 200);
    const body = await response.json(); assert.deepEqual(f.calls[0], ["list", human, "person:priya", "suggested"]);
    const serialized = JSON.stringify(body); for (const internal of ["tenantId", "createdBy", "transcriptHash", "reviewHistory", "internal:actor"]) assert.equal(serialized.includes(internal), false);
    assert.ok(body && typeof body === "object" && "relationships" in body && Array.isArray(body.relationships));
    const relationship: unknown = body.relationships[0];
    assert.ok(relationship && typeof relationship === "object" && "evidence" in relationship && Array.isArray(relationship.evidence));
    const evidence: unknown = relationship.evidence[0];
    assert.ok(evidence && typeof evidence === "object" && "quote" in evidence);
    assert.equal(evidence.quote, "Evidence");
    for (const query of ["", "personId=person:priya&personId=person:other", "personId=person:priya&status=accepted&status=suggested", "personId=person:priya&status=unknown", "personId=person:priya&tenantId=FOREIGN", "personId=bad"]) assert.equal((await server.call(`/speaker-relations?${query}`)).status, 400);
    assert.equal((await server.call("/speaker-relations?personId=person:priya&status=accepted")).status, 200);
    assert.equal(f.calls.length, 2);
  } finally { await server.close(); }
});
test("relationship router fails closed on missing policy and sanitized async failures", async () => {
  for (const contextFor of [async () => null, async () => { throw new Error("SECRET credential transcript"); }, undefined]) {
    const f = fixture(); const server = await boot({ service: f.service, contextFor } as SpeakerRelationsRouterDeps);
    try { const r = await server.call("/speaker-relations", input); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "speaker_relationship_unavailable" }); assert.deepEqual(f.calls, []); }
    finally { await server.close(); }
  }
  const f = fixture(); f.service.propose = async () => { throw new Error("SECRET credential transcript"); };
  f.service.review = async () => { throw new SpeakerRelationshipError("conflict"); };
  f.service.list = async () => { throw new Error("SECRET"); };
  const server = await boot({ service: f.service, async contextFor() { return human; } });
  try {
    const r = await server.call("/speaker-relations", input); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "speaker_relationship_unavailable" });
    const review = await server.call("/speaker-relations/rel:1/review", { baseRevision: 1, requestId: "req:1", decision: "accept" }); assert.equal(review.status, 409); assert.deepEqual(await review.json(), { error: "speaker_relationship_conflict" });
    assert.equal((await server.call("/speaker-relations?personId=person:priya")).status, 503);
  } finally { await server.close(); }
});
test("relationship router refuses cross-tenant or mismatched list outputs", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  try {
    for (const output of [[{ ...row, tenantId: "FOREIGN" }], [{ ...row, from: { ...row.from, personId: "person:other" } }], [{ ...row, to: { ...row.to, personId: "person:other" } }], [{ ...row, status: "accepted" as const }], Array(101).fill(row)]) {
      f.service.list = async () => output;
      const r = await server.call("/speaker-relations?personId=person:priya"); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: "speaker_relationship_unavailable" });
    }
  } finally { await server.close(); }
});
