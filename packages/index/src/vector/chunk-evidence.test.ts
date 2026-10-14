/**
 * packages/index/src/vector/chunk-evidence.test.ts — T-008 chunk-level evidence + Atlas adapter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachEvidence, rankChunksWithEvidence, selectQuote, verifyQuoteSpan,
  type EvidenceChunk, type EvidenceTurn,
} from "./chunk-evidence.js";

const T = { tenantId: "t1" };
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
  const r = rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 3, { tenantId: "t1", queryText: "student visa" });
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
    () => attachEvidence({ ...CHUNKS[0]!, ...c } as EvidenceChunk, 0.5, m, T);
  assert.throws(bad({ turnRefs: [] }), /turnRefs/);
  assert.throws(bad({ turnRefs: undefined as never }), /turnRefs/);
  assert.throws(bad({ turnRefs: ["u1", "u1"] }), /turnRefs/);
  assert.throws(bad({ turnRefs: ["nope"] }), /missing turn nope/);
  assert.throws(bad({ sourceRef: "S2" }), /belongs to session S1/);
  assert.throws(bad({ sourceRef: "" }), /no sourceRef/);
  assert.throws(() => attachEvidence(CHUNKS[0]!, NaN, TURNS, T), /non-finite score/);
  const mk = (t: EvidenceTurn) => new Map([["u1", t], ["u2", TURNS.get("u2")!]]);
  assert.throws(bad({}, mk(turn("u1", "S1", 10, 5, "x y z."))), /invalid time/);
  assert.throws(bad({}, mk(turn("u1", "S1", NaN, 5, "x y z."))), /invalid time/);
  assert.throws(bad({}, mk(turn("u1", "S1", 0, 5, "   "))), /empty text/);
});

test("rank refuses dimension mismatch by default, skips only on opt-in; k validated", () => {
  const mixed = [...CHUNKS, chunk("c4", "S2", ["u3"], [1, 0, 0])];
  assert.throws(() => rankChunksWithEvidence([1, 0], mixed, TURNS, 2, T), /dims/);
  assert.equal(rankChunksWithEvidence([1, 0], mixed, TURNS, 9, { tenantId: "t1", skipMismatched: true }).length, 3);
  assert.throws(() => rankChunksWithEvidence([1, 0], CHUNKS, TURNS, -1, T), /k must be/);
  assert.deepEqual(rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 0, T), []);
});

test("a bad row inside the top k refuses instead of being silently skipped", () => {
  const broken = [chunk("c0", "S1", ["ghost"], [1, 0]), ...CHUNKS];
  assert.throws(() => rankChunksWithEvidence([1, 0], broken, TURNS, 1, T), /missing turn ghost/);
});

test("ties break on chunkId (deterministic) and tenant mismatch is refused", () => {
  const tie = [chunk("b", "S1", ["u1"], [1, 0]), chunk("a", "S1", ["u2"], [1, 0])];
  assert.deepEqual(rankChunksWithEvidence([1, 0], tie, TURNS, 2, T).map((x) => x.chunkId), ["a", "b"]);
  assert.throws(() => rankChunksWithEvidence([1, 0], tie, TURNS, 1, { tenantId: "other" }), /tenant mismatch/);
});

test("tenancy (ISS-001/002): tenantId is REQUIRED; chunk and turn tenant checks each independently refuse", () => {
  const noTenant = [undefined, {}, { tenantId: "" }, { tenantId: { $ne: null } }] as never[];
  for (const o of noTenant) {
    assert.throws(() => rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 1, o), /tenantId is required/);
    assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, TURNS, o), /tenantId is required/);
    // refused even when there is nothing to scope (empty corpus, k=0): the entry point itself is gated
    assert.throws(() => rankChunksWithEvidence([1, 0], [], TURNS, 1, o), /tenantId is required/);
    assert.throws(() => rankChunksWithEvidence([1, 0], CHUNKS, TURNS, 0, o), /tenantId is required/);
  }
  // foreign chunk, matching turns
  const foreignChunk = [{ ...CHUNKS[0]!, tenantId: "OTHER" }];
  assert.throws(() => rankChunksWithEvidence([1, 0], foreignChunk, TURNS, 1, T), /chunk c1 tenant mismatch/);
  const noTenantChunk = [{ ...CHUNKS[0]!, tenantId: undefined }];
  assert.throws(() => rankChunksWithEvidence([1, 0], noTenantChunk, TURNS, 1, T), /chunk c1 tenant mismatch/);
  // matching chunk, foreign turn
  const foreignTurns = new Map(TURNS);
  foreignTurns.set("u2", { ...TURNS.get("u2")!, tenantId: "OTHER" });
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, foreignTurns, T), /turn u2 tenant mismatch/);
  const untenantedTurns = new Map(TURNS);
  untenantedTurns.set("u1", { ...TURNS.get("u1")!, tenantId: undefined });
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, untenantedTurns, T), /turn u1 tenant mismatch/);
});

test("provenance (ISS-003): a faulty selector is caught through attachEvidence, incl. whitespace and foreign-turn quotes", () => {
  const sel = (q: { turnId: string; charStart: number; charEnd: number; text: string }) => ({ ...T, selectQuote: () => q });
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, TURNS, sel({ turnId: "u1", charStart: 0, charEnd: 7, text: "Welcomf" })), /not verbatim/);
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, TURNS, sel({ turnId: "u1", charStart: 7, charEnd: 8, text: " " })), /not verbatim/);
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, TURNS, sel({ turnId: "u3", charStart: 0, charEnd: 8, text: "Creative" })), /not in chunk/);
  assert.throws(() => attachEvidence(CHUNKS[0]!, 0.5, TURNS, sel({ turnId: "zz", charStart: 0, charEnd: 1, text: "a" })), /unloaded turn/);
  const ok = attachEvidence(CHUNKS[0]!, 0.5, TURNS, sel({ turnId: "u1", charStart: 0, charEnd: 7, text: "Welcome" }));
  assert.equal(ok.quote.text, "Welcome");
});

test("degenerate vectors (ISS-006): empty query vector and non-finite chunk components refuse regardless of rank", () => {
  assert.throws(() => rankChunksWithEvidence([], [chunk("e", "S1", ["u1"], [])], TURNS, 1, T), /non-empty/);
  const nan = [...CHUNKS, chunk("z", "S2", ["u3"], [NaN, 1])];
  assert.throws(() => rankChunksWithEvidence([1, 0], nan, TURNS, 1, T), /non-finite vector/);
});
