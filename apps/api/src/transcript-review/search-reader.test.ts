import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { buildTurnPrefilter } from "../search-prefilter.js";
import { readSearchCandidateTurns } from "./search-reader.js";
import { headId } from "./store.js";
import { lexicalSearchTurns } from "@lkb/index";

type Row = Record<string, unknown>;
const fieldValues = (row: unknown, keys: string[]): unknown[] => !keys.length ? [row] : Array.isArray(row)
  ? row.flatMap((value) => fieldValues(value, keys)) : fieldValues(row && typeof row === "object" ? (row as Row)[keys[0]!] : undefined, keys.slice(1));
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return (condition as Row[]).some((clause) => matches(row, clause));
    const values = fieldValues(row, key.split("."));
    if (condition && typeof condition === "object") {
      const c = condition as Row;
      if ("$in" in c) return values.some((value) => (c.$in as unknown[]).includes(value));
      if ("$regex" in c) return values.some((value) => typeof value === "string" && new RegExp(String(c.$regex), String(c.$options)).test(value));
    }
    return values.some((value) => value === condition);
  });
}
function fixture() {
  const data = new Map<string, Row[]>(), calls: { name: string; filter: Row; options: Row; limit?: number }[] = [];
  let beforeHeadRead: (() => void) | undefined;
  const db = { collection(name: string) { return {
    find(filter: Row, options: Row = {}) {
      const call = { name, filter: structuredClone(filter), options, limit: Number.POSITIVE_INFINITY }; calls.push(call);
      const cursor = { limit(value: number) { call.limit = value; return cursor; }, async toArray() {
        return structuredClone((data.get(name) ?? []).filter((row) => matches(row, filter)).slice(0, call.limit));
      } }; return cursor;
    },
    async findOne(filter: Row, options: Row = {}) {
      calls.push({ name, filter: structuredClone(filter), options }); if (name === "transcript_reviews") beforeHeadRead?.();
      return structuredClone((data.get(name) ?? []).find((row) => matches(row, filter)) ?? null);
    },
  }; } } as unknown as Pick<Db, "collection">;
  const add = (name: string, row: Row) => { if (!data.has(name)) data.set(name, []); data.get(name)!.push(row); };
  const turn = (id: string, text: string, tenantId = "t", sessionId = "s") => ({ _id: id, tenantId, sessionId, text, speakerRef: "spk:0", tStart: 0, tEnd: 1 });
  const review = (id: string, text: string, tenantId = "t", sessionId = "s") => ({ _id: headId(tenantId, sessionId), tenantId, sessionId, revision: "r1",
    overlay: [{ turnId: id, text, speakerRef: "person:reviewed" }] });
  return { db, data, calls, add, turn, review, beforeHeadRead(fn: () => void) { beforeHeadRead = fn; } };
}

test("search unions exact raw and corrected-only candidates; scorer sees corrected text and immutable originals", async () => {
  const h = fixture(), raw = h.turn("a", "visa original"), correctedOnly = h.turn("b", "old unrelated");
  h.add("turns", raw); h.add("turns", correctedOnly); h.add("transcript_reviews", h.review("b", "visa corrected"));
  const originals = structuredClone(h.data.get("turns"));
  const result = await readSearchCandidateTurns(h.db, "t", buildTurnPrefilter("visa"));
  assert.deepEqual(result.map((row) => row._id).sort(), ["a", "b"]);
  assert.equal(result.find((row) => row._id === "b")!.text, "visa corrected");
  assert.equal(lexicalSearchTurns("visa", result, 10).length, 2);
  assert.deepEqual(h.data.get("turns"), originals);
  assert.ok(h.calls.every((call) => call.filter.tenantId === "t" && Number(call.options.maxTimeMS) > 0 && Number(call.options.maxTimeMS) <= 1500 && call.options.timeoutMS === call.options.maxTimeMS));
  assert.ok(h.calls.filter((call) => call.limit !== undefined).every((call) => call.options.timeoutMode === "cursorLifetime"));
  const query = h.calls.find((call) => call.name === "transcript_reviews" && "$or" in call.filter)!;
  assert.deepEqual(query.filter.$or, [{ "overlay.text": { $regex: "visa", $options: "i" } }]);
  assert.ok(h.calls.filter((call) => call.limit !== undefined).every((call) => call.limit === 5001));
});
test("old raw match corrected away scores zero; duplicate overlay match and foreign tenants do not leak", async () => {
  const h = fixture(); h.add("turns", h.turn("a", "visa")); h.add("transcript_reviews", h.review("a", "different subject"));
  h.add("turns", h.turn("foreign", "visa", "other")); h.add("transcript_reviews", h.review("foreign", "visa", "other"));
  const result = await readSearchCandidateTurns(h.db, "t", buildTurnPrefilter("visa"));
  assert.equal(result.length, 1); assert.equal(result[0]!.text, "different subject"); assert.deepEqual(lexicalSearchTurns("visa", result, 10), []);
  const same = fixture(); same.add("turns", same.turn("a", "visa")); same.add("transcript_reviews", same.review("a", "visa corrected"));
  assert.equal((await readSearchCandidateTurns(same.db, "t", buildTurnPrefilter("visa"))).length, 1);
});
test("overlay-only orphan fails reconciliation even when all physical source turns disappeared", async () => {
  const h = fixture(); h.add("transcript_reviews", h.review("gone", "visa"));
  await assert.rejects(readSearchCandidateTurns(h.db, "t", buildTurnPrefilter("visa")), /reconciliation/);
});
test("superseded matched review fails honestly instead of reporting old candidate generation", async () => {
  const h = fixture(), head = h.review("a", "visa"); h.add("turns", h.turn("a", "old")); h.add("transcript_reviews", head);
  let read = 0; h.beforeHeadRead(() => { if (++read === 2) head.revision = "r2"; });
  await assert.rejects(readSearchCandidateTurns(h.db, "t", buildTurnPrefilter("visa")), /changed; retry/);
});
test("candidate and source-ID reconciliation ceilings refuse partial results", async () => {
  for (const rawMatches of [true, false]) {
    const h = fixture(); for (let i = 0; i < 5001; i++) h.add("turns", h.turn(`t${i}`, rawMatches ? "visa" : "old"));
    if (!rawMatches) h.add("transcript_reviews", h.review("t0", "visa"));
    await assert.rejects(readSearchCandidateTurns(h.db, "t", buildTurnPrefilter("visa")), /candidate limit/);
  }
});
test("empty-token filter makes no queries; invalid tenant and malformed filters refuse", async () => {
  const h = fixture(); assert.deepEqual(await readSearchCandidateTurns(h.db, "t", null), []); assert.equal(h.calls.length, 0);
  await assert.rejects(readSearchCandidateTurns(h.db, " t", null), /tenantId/);
  await assert.rejects(readSearchCandidateTurns(h.db, "t", { $or: [] }), /Invalid.*prefilter/);
});
