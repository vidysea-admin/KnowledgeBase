import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { request } from "node:http";
import type { VerifiedKey } from "../auth.js";
import { createSpeakerRelationSourceRouter, type SpeakerRelationSourceRouterDeps } from "./source-router.js";
import type { RelationshipAuthority, RelationshipContext } from "./types.js";

const auth: VerifiedKey = { tenantId: "A", keyId: "key:1", scopes: ["sessions"] };
const human: RelationshipContext = { tenantId: "A", actorId: "reviewer:1", canPropose: true, canReview: true, reviewerKind: "human" };
const citation = { sessionId: "session:1", turnId: "turn:1", quote: "Exact cited quotation", sessionTitle: "Private title", tStart: 0, tEnd: 2 };
function authority(): RelationshipAuthority {
  return { view: { tenantId: "A", personId: "person:priya", identityStatus: "human-confirmed", ambiguity: null, revision: "a".repeat(64), nodes: [], edges: [], statements: [{ id: "claim:1", text: "Claim", topicIds: ["private-topic"], evidence: [citation] }], withheldRelationships: 0 }, transcriptHashes: { "session:1": "b".repeat(64) } };
}
async function boot(deps: SpeakerRelationSourceRouterDeps, principal: VerifiedKey | null = auth) {
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.auth = principal ?? undefined; next(); });
  app.use(createSpeakerRelationSourceRouter(deps)); const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { call: (query = "personId=person:priya", body?: unknown) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: unknown }>((resolve, reject) => {
    // node:http allows GET bodies so the body-forgery boundary is exercised explicitly.
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port: address.port, path: `/speaker-relations/source?${query}`, method: "GET", headers: { "x-lkb-tenant": "FOREIGN", "x-actor-id": "forged", ...(serialized === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(serialized) }) } }, response => {
      const chunks: Buffer[] = []; response.on("data", c => chunks.push(Buffer.from(c))); response.on("error", reject);
      response.on("end", () => { try { resolve({ status: response.statusCode!, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (e) { reject(e); } });
    }); req.on("error", reject); req.end(serialized);
  }), close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
test("relationship source authenticates verified principal and scope before reading authority", async () => {
  for (const p of [null, { ...auth, tenantId: " A" }, { ...auth, keyId: "" }, { ...auth, scopes: "sessions" } as unknown as VerifiedKey, { ...auth, scopes: [] }]) {
    let calls = 0; const server = await boot({ async contextFor() { calls++; return human; }, async readAuthority() { calls++; return authority(); } }, p);
    try { assert.equal((await server.call()).status, p?.scopes instanceof Array && p.scopes.length === 0 ? 403 : 401); assert.equal(calls, 0); }
    finally { await server.close(); }
  }
});
test("relationship source projects exact current base digest hashes and trusted capabilities", async () => {
  const calls: unknown[] = []; const server = await boot({ async contextFor(p) { calls.push(p); return human; }, async readAuthority(t, p) { calls.push([t, p]); return authority(); } });
  try {
    const response = await server.call(); assert.equal(response.status, 200); assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(response.body, { capabilities: { canPropose: true, canReview: true, reviewerKind: "human" }, personId: "person:priya", sourceRevisionDigest: "a".repeat(64), statements: [{ id: "claim:1", text: "Claim", evidence: [{ sessionId: citation.sessionId, turnId: citation.turnId, quote: citation.quote, transcriptHash: "b".repeat(64) }] }] });
    assert.deepEqual(calls, [auth, ["A", "person:priya"]]);
    for (const secret of ["tenantId", "actorId", "sessionTitle", "topicIds", "Private title"]) assert.equal(JSON.stringify(response.body).includes(secret), false);
  } finally { await server.close(); }
});
test("relationship source rejects identity permission hash extras and invalid filters", async () => {
  let reads = 0; const server = await boot({ async contextFor() { return human; }, async readAuthority() { reads++; return authority(); } });
  try {
    for (const query of ["", "personId=bad", "personId=person:priya&personId=person:other", ...["tenantId", "actorId", "canPropose", "reviewerKind", "transcriptHash", "sourceRevisionDigest"].map(k => `personId=person:priya&${k}=forged`)]) assert.equal((await server.call(query)).status, 400);
    for (const body of [{ actorId: "forged" }, { tenantId: "FOREIGN" }, { canReview: true }, { isHuman: true }, { transcriptHash: "c".repeat(64) }, []]) assert.equal((await server.call("personId=person:priya", body)).status, 400);
    assert.equal(reads, 0);
  } finally { await server.close(); }
});
test("relationship source fails closed on absent foreign malformed and unauthorized policy", async () => {
  for (const policy of [null, { ...human, tenantId: "FOREIGN" }, { ...human, actorId: "" }, { ...human, canPropose: false, canReview: false }, { ...human, reviewerKind: "automation" as const }, { ...human, canReview: "true" } as unknown as RelationshipContext]) {
    let reads = 0; const server = await boot({ async contextFor() { return policy; }, async readAuthority() { reads++; return authority(); } });
    try { assert.equal((await server.call()).status, policy && !policy.canPropose && !policy.canReview ? 403 : 503); assert.equal(reads, 0); }
    finally { await server.close(); }
  }
  const server = await boot({ async contextFor() { return { ...human, canReview: false, reviewerKind: "automation" }; }, async readAuthority() { return authority(); } });
  try { assert.equal((await server.call()).status, 200); } finally { await server.close(); }
});
test("relationship source refuses missing foreign unresolved stale-shaped authority", async () => {
  for (const transform of [(a: RelationshipAuthority) => null, (a: RelationshipAuthority) => ({ ...a, view: { ...a.view, tenantId: "FOREIGN" } }), (a: RelationshipAuthority) => ({ ...a, view: { ...a.view, personId: "person:other" } }), (a: RelationshipAuthority) => ({ ...a, view: { ...a.view, identityStatus: "unresolved" } }), (a: RelationshipAuthority) => ({ ...a, view: { ...a.view, revision: "invalid" } })]) {
    const server = await boot({ async contextFor() { return human; }, async readAuthority() { return transform(authority()) as RelationshipAuthority | null; } });
    try { const r = await server.call(); assert.equal(r.status, 503); assert.deepEqual(r.body, { error: "speaker_relationship_source_unavailable" }); }
    finally { await server.close(); }
  }
});
test("relationship source refuses missing malformed or inherited transcript hashes and evidence", async () => {
  const variants = [authority(), authority(), authority(), authority(), authority(), authority()];
  variants[0]!.transcriptHashes = {};
  variants[1]!.transcriptHashes = { "session:1": "invalid" };
  variants[2]!.transcriptHashes = Object.create({ "session:1": "b".repeat(64) }) as Record<string, string>;
  variants[3]!.view.statements[0]!.evidence = [{ ...citation, sessionId: "foreign:session" }];
  variants[4]!.view.statements[0]!.evidence = [];
  variants[5]!.view.statements[0]!.evidence = [{ ...citation, quote: " " }];
  for (const value of variants) {
    const server = await boot({ async contextFor() { return human; }, async readAuthority() { return value; } });
    try { const r = await server.call(); assert.equal(r.status, 503); assert.deepEqual(r.body, { error: "speaker_relationship_source_unavailable" }); }
    finally { await server.close(); }
  }
});
test("relationship source refuses overbounds and duplicate statements without truncation", async () => {
  const variants = [authority(), authority(), authority(), authority(), authority()];
  variants[0]!.view.statements = Array.from({ length: 101 }, (_, n) => ({ ...authority().view.statements[0]!, id: `claim:${n}` }));
  variants[1]!.view.statements[0]!.evidence = Array.from({ length: 21 }, (_, n) => ({ ...citation, turnId: `turn:${n}` }));
  variants[2]!.view.statements.push(variants[2]!.view.statements[0]!);
  variants[3]!.view.statements[0]!.evidence = [citation, citation];
  variants[4]!.view.statements[0]!.text = "x".repeat(524289);
  for (const value of variants) {
    const server = await boot({ async contextFor() { return human; }, async readAuthority() { return value; } });
    try { assert.equal((await server.call()).status, 503); } finally { await server.close(); }
  }
});
test("relationship source sanitizes asynchronous policy and snapshot failures", async () => {
  for (const deps of [{ async contextFor() { throw new Error("SECRET provider credential transcript"); }, async readAuthority() { return authority(); } }, { async contextFor() { return human; }, async readAuthority() { throw new Error("SECRET provider credential transcript"); } }, { contextFor: undefined, async readAuthority() { return authority(); } }]) {
    const server = await boot(deps as SpeakerRelationSourceRouterDeps);
    try { const r = await server.call(); assert.equal(r.status, 503); assert.deepEqual(r.body, { error: "speaker_relationship_source_unavailable" }); }
    finally { await server.close(); }
  }
});
