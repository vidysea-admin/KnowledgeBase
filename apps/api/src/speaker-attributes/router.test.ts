import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { VerifiedKey } from "../auth.js";
import { createSpeakerAttributesRouter, type SpeakerAttributesRouterDeps } from "./router.js";
import type { AttributeContext, AttributeProposal, AttributeRow, SpeakerAttributeService } from "./types.js";

const human: AttributeContext = { tenantId: "A", actorId: "user:1", canPropose: true, canReview: true, reviewerKind: "human" };
const principal: VerifiedKey = { tenantId: "A", keyId: "key:1", scopes: ["sessions"] };
const proposal: AttributeProposal = { id: "p:1", personId: "person:priya", field: "org", value: "Example", sourceRevisionDigest: "a".repeat(64),
  evidence: [{ sessionId: "s1", turnId: "t1", quote: "I work at Example", transcriptHash: "b".repeat(64), speakerRef: "spk:1", startTurnIndex: 0, endTurnIndex: 2 }] };
function fixture() {
  const calls: unknown[] = []; const row: AttributeRow = { _id: "attr:1", tenantId: "A", personId: proposal.personId, field: "org", value: "Example", revision: 1, status: "suggested", createdBy: "internal", evidence: proposal.evidence, sourceRevisionDigest: proposal.sourceRevisionDigest, reviewHistory: [] };
  const service: SpeakerAttributeService = {
    async propose(c, p) { calls.push([c, p]); return { id: row._id, revision: 1, status: "suggested", replayed: false }; },
    async review(c, input) { calls.push([c, input]); return { id: row._id, revision: 2, status: "accepted", replayed: false, secret: "SECRET" } as Awaited<ReturnType<SpeakerAttributeService["review"]>>; },
    async list(c, person, status) { calls.push([c, person, status]); return [{ ...row, status }]; }, async accepted() { throw Error("not router"); },
  }; return { service, calls, row };
}
async function boot(deps: SpeakerAttributesRouterDeps, auth: VerifiedKey | null = principal) {
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.auth = auth ?? undefined; next(); }); app.use(createSpeakerAttributesRouter(deps));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); }); const address = server.address(); assert.ok(address && typeof address === "object");
  return { call(path: string, body?: unknown) { return fetch(`http://127.0.0.1:${address.port}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "X-LKB-Tenant": "B", "X-Actor-Id": "forged" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
test("mounted attribute router trusts verified context and exposes bounded source-safe DTO/receipts", async () => {
  const f = fixture(); const seen: unknown[] = []; const server = await boot({ service: f.service, async contextFor(p) { seen.push(p); return human; } });
  try { const created = await server.call("/speaker-attributes", proposal); assert.equal(created.status, 201); assert.deepEqual(seen, [principal]); assert.deepEqual(f.calls[0], [human, proposal]); assert.equal(created.headers.get("cache-control"), "private, no-store");
    const reviewed = await server.call("/speaker-attributes/attr:1/review", { baseRevision: 1, requestId: "r:1", decision: "accept" }); assert.equal(reviewed.status, 200); assert.equal(JSON.stringify(await reviewed.json()).includes("SECRET"), false);
    const response = await server.call("/speaker-attributes?personId=person:priya"); const body: unknown = await response.json(); assert.equal(response.status, 200);
    assert.ok(body && typeof body === "object" && "attributes" in body && Array.isArray(body.attributes));
    const first: unknown = body.attributes[0]; assert.ok(first && typeof first === "object" && "evidence" in first && Array.isArray(first.evidence));
    const evidence: unknown = first.evidence[0]; assert.ok(evidence && typeof evidence === "object" && "quote" in evidence); assert.equal(evidence.quote, "I work at Example");
    for (const key of ["tenantId", "createdBy", "transcriptHash", "reviewHistory"]) assert.equal(JSON.stringify(body).includes(key), false);
  } finally { await server.close(); }
});
test("missing principal/scope, foreign policy and automation review cannot reach service", async () => {
  for (const auth of [null, { ...principal, scopes: [] }]) { const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } }, auth); try { assert.equal((await server.call("/speaker-attributes", proposal)).status, auth ? 403 : 401); assert.deepEqual(f.calls, []); } finally { await server.close(); } }
  for (const policy of [{ ...human, tenantId: "B" }, { ...human, reviewerKind: "automation" as const }, { ...human, canReview: false }]) { const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return policy; } }); try {
    assert.equal((await server.call("/speaker-attributes/attr:1/review", { baseRevision: 1, requestId: "r:1", decision: "accept" })).status, policy.tenantId === "B" ? 503 : 403); assert.deepEqual(f.calls, []);
  } finally { await server.close(); } }
});
test("forged body authority, invalid evidence/review and ambiguous query shapes refused", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  try { for (const extra of ["tenantId", "actorId", "reviewerKind", "canReview"]) assert.equal((await server.call("/speaker-attributes", { ...proposal, [extra]: "forged" })).status, 400);
    for (const input of [{ ...proposal, evidence: [] }, { ...proposal, evidence: [{ ...proposal.evidence[0], startTurnIndex: -1 }] }, { ...proposal, evidence: [{ ...proposal.evidence[0], accepted: true }] }, { ...proposal, sourceRevisionDigest: "bad" }]) assert.equal((await server.call("/speaker-attributes", input)).status, 400);
    for (const body of [{ baseRevision: 0, requestId: "r", decision: "accept" }, { baseRevision: 1, requestId: "r", decision: "accepted" }, { baseRevision: 1, requestId: "r", decision: "accept", actorId: "forged" }]) assert.equal((await server.call("/speaker-attributes/attr:1/review", body)).status, 400);
    for (const query of ["", "personId=person:priya&personId=person:other", "personId=person:priya&tenantId=B", "personId=person:priya&status=unknown"]) assert.equal((await server.call(`/speaker-attributes?${query}`)).status, 400);
    assert.deepEqual(f.calls, []);
  } finally { await server.close(); }
});
test("foreign list outputs and async service/policy failure sanitize errors", async () => {
  const f = fixture(); const server = await boot({ service: f.service, async contextFor() { return human; } });
  try { for (const row of [{ ...f.row, tenantId: "B" }, { ...f.row, personId: "person:other" }, { ...f.row, status: "accepted" as const }]) { f.service.list = async () => [row]; assert.equal((await server.call("/speaker-attributes?personId=person:priya")).status, 503); }
    f.service.propose = async () => { throw Error("SECRET transcript"); }; const response = await server.call("/speaker-attributes", proposal); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "speaker_attribute_unavailable" });
  } finally { await server.close(); }
  const missing = await boot({ service: f.service, async contextFor() { throw Error("SECRET policy"); } }); try { const response = await missing.call("/speaker-attributes", proposal); assert.equal(response.status, 503); assert.equal(JSON.stringify(await response.json()).includes("SECRET"), false); } finally { await missing.close(); }
});
