/**
 * packages/index/src/vector/chunk-evidence.test.ts — T-008 chunk-level evidence + Atlas adapter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachEvidence, rankChunksWithEvidence, selectQuote, verifyQuoteSpan,
  type EvidenceChunk, type EvidenceTurn,
} from "./chunk-evidence.js";
import { buildVectorSearchPipeline, collectTurnIds, mapAtlasResults, type AtlasDoc } from "./atlas-adapter.js";

const turn = (id: string, session: string, tStart: number, tEnd: number, text: string): EvidenceTurn =>
  ({ _id: id, sessionId: session, tStart, tEnd, text, tenantId: "t1" });
const TURNS = new Map([
  turn("u1", "S1", 0, 10, "Welcome everyone. Today we cover student visa rules."),
  turn("u2", "S1", 10, 25, "Funding comes from scholarships. Apply early."),
  turn("u3", "S2", 5, 9, "Creative careers need a portfolio."),
].map((t) => [t._id, t] as const));
const chunk = (id: string, s: string, refs: string[], vector: number[], idx = 0): EvidenceChunk =>
  ({ _id: id, sourceRef: s, turnRefs: refs, vector, chunkIndex: idx, tenantId: "t1" });
const CHUNKS = [
  chunk("c1", "S1", ["u1", "u2"], [1, 0], 0),
  chunk("c2", "S1", ["u2"], [0.9, 0.1], 1),
  chunk("c3", "S2", ["u3"], [0, 1], 0),
];

test("returns chunk-level results, NOT session-deduped, with turn/time/quote evidence", () => {
  const r = rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 3, { queryText: "student visa" });
  assert.deepEqual(r.map((x) => x.chunkId), ["c1", "c2", "c3"]);
  assert.equal(r.filter((x) => x.sessionId === "S1").length, 2, "same session appears twice");
  assert.deepEqual(r[0]!.turnIds, ["u1", "u2"]);
  assert.equal(r[0]!.tStart, 0);
  assert.equal(r[0]!.tEnd, 25);
  assert.equal(r[0]!.quote.text, "Today we cover student visa rules.");
  assert.equal(r[0]!.quote.turnId, "u1");
  const t = TURNS.get(r[0]!.quote.turnId)!;
  assert.equal(t.text.slice(r[0]!.quote.charStart, r[0]!.quote.charEnd), r[0]!.quote.text);
});

test("quote selection is deterministic and falls back to the first sentence without overlap", () => {
  const ts = [TURNS.get("u1")!, TURNS.get("u2")!];
  assert.equal(selectQuote(ts, "zzz").text, "Welcome everyone.");
  assert.equal(selectQuote(ts).text, "Welcome everyone.");
  assert.equal(selectQuote(ts, "scholarships funding").text, "Funding comes from scholarships.");
});

test("provenance: a quote that is not verbatim text of its turn is refused", () => {
  const u = TURNS.get("u1")!;
  const good = { turnId: "u1", charStart: 0, charEnd: 7, text: "Welcome" };
  verifyQuoteSpan(good, u);
  assert.throws(() => verifyQuoteSpan({ ...good, text: "Welcomf" }, u), /not verbatim/);
  assert.throws(() => verifyQuoteSpan({ ...good, charEnd: 9999 }, u), /offsets/);
  assert.throws(() => verifyQuoteSpan({ ...good, charStart: 3, charEnd: 3 }, u), /offsets/);
  assert.throws(() => verifyQuoteSpan({ ...good, turnId: "u2" }, u), /references turn/);
});

test("refuses loudly on malformed or missing evidence", () => {
  const bad = (c: Partial<EvidenceChunk>, m: Map<string, EvidenceTurn> = TURNS) =>
    () => attachEvidence({ ...CHUNKS[0]!, ...c } as EvidenceChunk, 0.5, m);
  assert.throws(bad({ turnRefs: [] }), /turnRefs/);
  assert.throws(bad({ turnRefs: undefined as never }), /turnRefs/);
  assert.throws(bad({ turnRefs: ["u1", "u1"] }), /turnRefs/);
  assert.throws(bad({ turnRefs: ["nope"] }), /missing turn nope/);
  assert.throws(bad({ sourceRef: "S2" }), /belongs to session S1/);
  assert.throws(bad({ sourceRef: "" }), /no sourceRef/);
  assert.throws(() => attachEvidence(CHUNKS[0]!, NaN, TURNS), /non-finite score/);
  const mk = (t: EvidenceTurn) => new Map([["u1", t], ["u2", TURNS.get("u2")!]]);
  assert.throws(bad({}, mk(turn("u1", "S1", 10, 5, "x y z."))), /invalid time/);
  assert.throws(bad({}, mk(turn("u1", "S1", NaN, 5, "x y z."))), /invalid time/);
  assert.throws(bad({}, mk(turn("u1", "S1", 0, 5, "   "))), /empty text/);
});

test("rank refuses dimension mismatch by default, skips only on opt-in; k validated", () => {
  const mixed = [...CHUNKS, chunk("c4", "S2", ["u3"], [1, 0, 0])];
  assert.throws(() => rankChunksWithEvidence([1, 0], mixed, TURNS, 2), /dims/);
  assert.equal(rankChunksWithEvidence([1, 0], mixed, TURNS, 9, { skipMismatched: true }).length, 3);
  assert.throws(() => rankChunksWithEvidence([1, 0], CHUNKS, TURNS, -1), /k must be/);
  assert.deepEqual(rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 0), []);
});

test("a bad row inside the top k refuses instead of being silently skipped", () => {
  const broken = [chunk("c0", "S1", ["ghost"], [1, 0]), ...CHUNKS];
  assert.throws(() => rankChunksWithEvidence([1, 0], broken, TURNS, 1), /missing turn ghost/);
});

test("ties break on chunkId (deterministic) and tenant mismatch is refused", () => {
  const tie = [chunk("b", "S1", ["u1"], [1, 0]), chunk("a", "S1", ["u2"], [1, 0])];
  assert.deepEqual(rankChunksWithEvidence([1, 0], tie, TURNS, 2).map((x) => x.chunkId), ["a", "b"]);
  assert.throws(() => rankChunksWithEvidence([1, 0], tie, TURNS, 1, { tenantId: "other" }), /tenant mismatch/);
});

test("atlas: pipeline pins tenant filter and projects the score", () => {
  const p = buildVectorSearchPipeline({ indexName: "chunks_vec", queryVector: [1, 2], tenantId: "t1", limit: 5 });
  const vs = (p[0] as { $vectorSearch: Record<string, unknown> }).$vectorSearch;
  assert.deepEqual(vs.filter, { tenantId: "t1" });
  assert.equal(vs.limit, 5);
  assert.equal(vs.numCandidates, 100);
  assert.equal(vs.path, "vector");
  assert.deepEqual((p[1] as { $project: Record<string, unknown> }).$project.score, { $meta: "vectorSearchScore" });
});

test("atlas: pipeline refuses unscoped, empty, non-finite and out-of-range params", () => {
  const base = { indexName: "i", queryVector: [1], tenantId: "t1", limit: 5 };
  assert.throws(() => buildVectorSearchPipeline({ ...base, tenantId: "" }), /tenantId/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, tenantId: { $ne: null } as never }), /tenantId/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, queryVector: [] }), /queryVector/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, queryVector: [1, NaN] }), /queryVector/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, limit: 0 }), /limit/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, limit: 1001 }), /limit/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, numCandidates: 2 }), /numCandidates/);
  assert.throws(() => buildVectorSearchPipeline({ ...base, indexName: "" }), /indexName/);
});

test("atlas: mapper yields evidence results in Atlas order and refuses bad docs/tenants", () => {
  const docs: AtlasDoc[] = [{ ...CHUNKS[2]!, score: 0.9 }, { ...CHUNKS[0]!, score: 0.8 }];
  assert.deepEqual(collectTurnIds(docs).sort(), ["u1", "u2", "u3"]);
  const r = mapAtlasResults(docs, TURNS, { tenantId: "t1", queryText: "portfolio" });
  assert.deepEqual(r.map((x) => x.chunkId), ["c3", "c1"]);
  assert.equal(r[0]!.quote.text, "Creative careers need a portfolio.");
  assert.equal(r[0]!.score, 0.9);
  assert.throws(() => mapAtlasResults(docs, TURNS, { tenantId: "t2" }), /tenant mismatch/);
  assert.throws(() => mapAtlasResults([{ ...docs[0]!, score: undefined as never }], TURNS, { tenantId: "t1" }), /non-finite/);
  assert.throws(() => collectTurnIds([{ ...docs[0]!, turnRefs: [] }]), /turnRefs/);
});
