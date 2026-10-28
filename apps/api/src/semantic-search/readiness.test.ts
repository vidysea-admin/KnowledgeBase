import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceSlices } from "@lkb/index";
import { corpusFixtureDb, type FixtureRead } from "./corpus-fixture.js";
import { chunkContentId } from "../indexing/chunk-integrity.js";
import { createMongoSemanticSearchDeps } from "./semantic-search-store.js";

function fixture() {
  const turn = { _id: "turn", tenantId: "tenant", sessionId: "source", text: "Actual indexed passage.", speakerRef: "expert", tStart: 1, tEnd: 2 };
  const chunks: Record<string, unknown>[] = [{ _id: chunkContentId("tenant", "source", ["turn"], turn.text),
    tenantId: "tenant", sourceRef: "source", turnRefs: ["turn"], vector: [1, 0], dims: 2, embeddingModel: "model" }];
  const turns = [turn], sessions = [{ _id: "source", tenantId: "tenant", sourceId: "doc" }];
  const gaps: Record<string, unknown>[] = [];
  const calls: FixtureRead[] = [];
  const db = corpusFixtureDb({ chunks, turns, sessions, gaps, sources: [{ _id: "doc", tenantId: "tenant", kind: "document" }] }, calls);
  const deps = createMongoSemanticSearchDeps({ db: db as never, embed: async () => { throw new Error("readiness must not embed"); } });
  return { turn, chunks, turns, sessions, gaps, calls, readiness: () => deps.readiness!("tenant") };
}

test("readiness requires complete current source bindings, exposes legacy/stale counts and performs no provider call", async () => {
  const f = fixture();
  assert.equal((await f.readiness()).status, "ready");
  f.chunks.push({ ...f.chunks[0], _id: "legacy-uuid" }, { ...f.chunks[0], _id: "chunk-v1:stale" });
  const pending = await f.readiness();
  assert.equal(pending.status, "reindex-required");
  assert.equal(pending.total, 3); assert.equal(pending.bound, 1); assert.equal(pending.legacy, 1); assert.equal(pending.stale, 1);
  assert.equal(pending.queryModelCompatibility, "checked-on-search");
  assert.ok(f.calls.length >= 3); for (const call of f.calls) assert.equal(call.filter.tenantId, "tenant");
  f.turn.text = "Source changed while provider unavailable.";
  assert.equal((await f.readiness()).bound, 0);
  f.chunks.length = 0;
  f.turns.length = 0;
  assert.equal((await f.readiness()).status, "empty");
});

test("a partial first index and unresolved durable vector gap cannot advertise ready coverage", async () => {
  const f = fixture();
  f.turns.push({ ...f.turn, _id: "uncovered", text: "Current source has no vector yet." });
  f.gaps.push({ _id: "pending", tenantId: "tenant", sourceRef: "source", kind: "vector-pending", status: "open" },
    { _id: "resolved", tenantId: "tenant", sourceRef: "source", kind: "vector-pending", status: "received" });
  const partial = await f.readiness();
  assert.equal(partial.bound, 1); assert.equal(partial.uncoveredTurns, 1); assert.equal(partial.pendingGaps, 1);
  assert.equal(partial.status, "reindex-required");
  f.turns.pop(); f.gaps[0]!.status = "received";
  assert.equal((await f.readiness()).status, "ready");
});

test("a single valid source slice cannot conceal missing embedded ranges of the same turn", async () => {
  const f = fixture();
  f.turn.text = "Long actual source passage. ".repeat(20);
  const plans = buildSourceSlices([f.turn], 32);
  const rows = plans.map((plan, i) => ({ ...f.chunks[0], ...plan, _id: `recovery-${i}` }));
  f.chunks[0] = rows[0]!;
  assert.equal((await f.readiness()).bound, 1);
  assert.equal((await f.readiness()).uncoveredTurns, 1);
  assert.equal((await f.readiness()).status, "reindex-required");
  f.chunks.splice(0, f.chunks.length, ...rows);
  assert.equal((await f.readiness()).uncoveredTurns, 0);
  assert.equal((await f.readiness()).status, "ready");
});

test("source-bound recovery slices are ready; missing vector/model/source and mixed models remain visible", async () => {
  const f = fixture();
  const plan = buildSourceSlices([f.turn], 32)[0]!;
  f.chunks[0] = { ...f.chunks[0], ...plan, _id: "recovery-row-id" };
  assert.equal((await f.readiness()).status, "ready");
  f.chunks.push({ ...f.chunks[0], _id: "other-row", embeddingModel: "another-model" });
  assert.equal((await f.readiness()).status, "reindex-required");
  assert.equal((await f.readiness()).modelCount, 2);
  f.chunks.pop();
  f.chunks[0]!.vector = [NaN, 0];
  assert.equal((await f.readiness()).invalidVectors, 1);
  f.chunks[0]!.vector = [1, 0]; f.chunks[0]!.embeddingModel = "";
  assert.equal((await f.readiness()).invalidModels, 1);
  f.chunks[0]!.embeddingModel = "model"; f.sessions.length = 0;
  assert.equal((await f.readiness()).status, "empty");
  assert.equal((await f.readiness()).total, 0, "unavailable source metadata is quarantined");
});
