/** Operator-run real HTTP/provider proof. No fixture approval or data writes are performed here. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chunkContentMatches } from "../../../apps/api/src/indexing/chunk-integrity.js";

assert.equal(process.env.T008_RUN_LIVE_PROOF, "1", "root must explicitly lease the real provider/API proof");
const base = new URL(process.env.T008_API_BASE_URL ?? "http://127.0.0.1:3000");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && !base.username && !base.password,
  "this proof only uses the authorized local API, without URL credentials");
const key = process.env.T008_API_KEY, query = process.env.T008_LIVE_QUERY,
  tenant = process.env.T008_LIVE_TENANT, expectedSession = process.env.T008_APPROVED_SESSION;
assert.ok(key && query && tenant && expectedSession, "supply the authorized search/sessions key and real approved source/query/tenant");
const started = Date.now();
async function get(path: string): Promise<any> {
  const response = await fetch(new URL(path, base), { headers: { authorization: `Bearer ${key}` },
    redirect: "error", signal: AbortSignal.timeout(120_000) });
  assert.equal(response.status, 200, `actual API ${path.split("?")[0]} status`);
  return response.json();
}
const params = new URLSearchParams({ q: query, k: "20", mode: "chunks" });
const result = await get(`/search/semantic?${params}`);
assert.equal(result.query, query);
assert.equal(result.mode, "chunks");
assert.ok(Array.isArray(result.hits) && result.hits.length > 0 && result.hits.length <= 20);
assert.ok(result.hits.some((hit: any) => hit.sessionId === expectedSession), "real approved unstructured source must be retrieved");
assert.equal(new Set(result.hits.map((hit: any) => hit.chunkId)).size, result.hits.length);
const sources = new Map<string, any>();
const receipts: unknown[] = [];
for (let i = 0; i < result.hits.length; i++) {
  const hit = result.hits[i];
  assert.ok(Number.isFinite(hit.score));
  if (i) assert.ok(result.hits[i - 1].score + 1e-9 >= hit.score);
  if (!sources.has(hit.sessionId)) sources.set(hit.sessionId, await get(`/sessions/${encodeURIComponent(hit.sessionId)}`));
  const detail = sources.get(hit.sessionId);
  assert.equal(detail.session._id, hit.sessionId);
  assert.equal(detail.session.tenantId, tenant);
  const turns = new Map<string, any>(detail.turns.map((turn: any) => [turn._id, turn]));
  const quoteTurn = turns.get(hit.quote.turnId);
  assert.ok(hit.turnIds.includes(hit.quote.turnId) && quoteTurn);
  assert.equal(quoteTurn.tenantId, tenant);
  assert.equal(quoteTurn.sessionId, hit.sessionId);
  assert.equal(quoteTurn.text.slice(hit.quote.charStart, hit.quote.charEnd), hit.quote.text);
  assert.equal(quoteTurn.speakerRef, hit.quote.speakerRef);
  assert.equal(quoteTurn.speakerLabel, hit.quote.speakerLabel);
  assert.equal(quoteTurn.occurredAt, hit.quote.occurredAt);
  assert.equal(quoteTurn.tStart, hit.quote.tStart);
  assert.equal(quoteTurn.tEnd, hit.quote.tEnd);
  hit.turnIds.forEach((id: string) => {
    const turn = turns.get(id); assert.ok(turn); assert.equal(turn.tenantId, tenant);
    assert.equal(turn.sessionId, hit.sessionId);
  });
  assert.equal(chunkContentMatches({ _id: hit.chunkId, tenantId: tenant, sourceRef: hit.sessionId,
    turnRefs: hit.turnIds, sourceSpans: hit.sourceSpans, rawTextSha256: hit.rawTextSha256 }, turns, tenant), true);
  if (hit.sourceSpans) assert.ok(hit.sourceSpans.some((span: any) => span.turnId === hit.quote.turnId &&
    span.charStart <= hit.quote.charStart && span.charEnd >= hit.quote.charEnd), "quote must belong to actual embedded span");
  receipts.push({ chunkId: hit.chunkId, sessionId: hit.sessionId, quoteTurnId: hit.quote.turnId,
    score: hit.score, speakerRef: hit.quote.speakerRef, occurredAt: hit.quote.occurredAt ?? null,
    quoteStart: hit.quote.charStart, quoteEnd: hit.quote.charEnd,
    sourceBinding: hit.sourceSpans ? "verified-source-spans" : "content-bound-id",
    quoteSha256: createHash("sha256").update(hit.quote.text).digest("hex"),
    target: `/sessions/${encodeURIComponent(hit.sessionId)}#turn-${encodeURIComponent(hit.quote.turnId)}` });
}
params.delete("mode");
const sessionMode = await get(`/search/semantic?${params}`);
assert.equal(new Set(sessionMode.hits.map((hit: any) => hit.sessionId)).size, sessionMode.hits.length,
  "legacy default must still dedupe sessions before k");
console.log(JSON.stringify({ status: "verified-real-direct-search-source-consumption", elapsedMs: Date.now() - started,
  querySha256: createHash("sha256").update(query).digest("hex"), approvedSession: expectedSession,
  chunks: receipts, defaultSessionCount: sessionMode.hits.length,
  exclusions: ["not a Mongo restart/reindex/write proof", "not a human approval proof", "not browser/Ask/quality acceptance"] }, null, 2));
