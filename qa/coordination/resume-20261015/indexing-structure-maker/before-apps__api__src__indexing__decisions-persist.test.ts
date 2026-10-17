import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { Decisions, Turns } from "@lkb/core";
import type { DecisionsCompleteFn } from "@lkb/index";
import { extractAndPersistDecisions } from "./decisions-persist.js";
import { evaluateExtractionCase } from "../../../../packages/index/src/eval/extraction.js";

const turns: Turns[] = [
  { _id: "a", tenantId: "t", sessionId: "s", speakerRef: "speaker", text: "We will ship Friday.", tStart: 2, tEnd: 4 },
  { _id: "b", tenantId: "t", sessionId: "s", speakerRef: "speaker", text: "Agreed.", tStart: 4, tEnd: 6 },
];
const complete = (payload: unknown): DecisionsCompleteFn => async () => ({ text: JSON.stringify(payload), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fixture", model: "fixture", costUsd: 0 });
const proposed = (text = "Ship Friday.", turnIds = ["a", "b"]) => ({ text, turnIds, owner: "speaker", status: "verified" });
const row = (id: string, status: Decisions["status"] = "proposed", sessionId = "s", tenantId = "t", text = id): Decisions =>
  ({ _id: id, tenantId, status, text, evidence: [{ turnId: "a", sessionId }] });

type Filter = Record<string, unknown>;
function matches(d: Decisions, f: Filter): boolean {
  return Object.entries(f).every(([key, value]) => {
    if (key === "evidence.sessionId") return d.evidence.some((e) => e.sessionId === value);
    if (key === "evidence") return d.evidence.every((e) => e.sessionId === (value as { $not: { $elemMatch: { sessionId: { $ne: string } } } }).$not.$elemMatch.sessionId.$ne);
    const actual = d[key];
    if (typeof value === "object" && value !== null && "$in" in value) return (value as { $in: unknown[] }).$in.includes(actual);
    return actual === value;
  });
}
// This fake honors every tenant/session/status/id predicate and actual state, so broadening
// a filter changes outcomes. Mongo's unique _id refusal is modeled for concurrent reviews.
function storage(initial: Decisions[] = [], failAt = 0) {
  const rows = structuredClone(initial);
  const calls: { op: string; filter: Filter; update?: Filter; options?: Filter }[] = [];
  let writes = 0;
  let beforeWrite: (() => void) | undefined;
  const db = { collection(name: string) {
    assert.equal(name, "decisions");
    return {
      find(filter: Filter) { calls.push({ op: "find", filter }); return { toArray: async () => structuredClone(rows.filter((d) => matches(d, filter))) }; },
      async updateOne(filter: Filter, update: { $setOnInsert: Decisions }, options: Filter) {
        calls.push({ op: "updateOne", filter, update, options });
        beforeWrite?.();
        if (++writes === failAt) throw new Error("synthetic upsert failure");
        const found = rows.findIndex((d) => matches(d, filter));
        if (found < 0) {
          assert.equal(options.upsert, true);
          if (rows.some((d) => d._id === update.$setOnInsert._id)) throw new Error("duplicate key after review");
          rows.push(structuredClone(update.$setOnInsert));
        }
        return {};
      },
      async deleteMany(filter: Filter) {
        calls.push({ op: "deleteMany", filter });
        const removed = rows.filter((d) => matches(d, filter));
        for (const d of removed) rows.splice(rows.indexOf(d), 1);
        return { deletedCount: removed.length };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  return { db, rows, calls, beforeWrite: (fn: () => void) => { beforeWrite = fn; } };
}

test("ISS-U25DECISIONS-001(a): clean re-extraction discards human-set status (verified/needs-review) — refused", async () => {
  const prior = [row("legacy-reviewed", "verified", "s", "t", "SHIP Friday."), row("legacy-review", "needs-review"), row("stale")];
  const store = storage(prior);
  const result = await extractAndPersistDecisions("t", "s", turns, complete([proposed(), proposed("Other decision.")]), store.db);
  assert.equal(result.degraded, null);
  for (const d of prior.slice(0, 2)) assert.deepEqual(store.rows.find((r) => r._id === d._id), d);
  assert.equal(store.rows.some((d) => d._id === "stale"), false);
  assert.equal(store.rows.filter((d) => d.status === "proposed").length, 1);
  assert.equal(store.rows.find((d) => d.status === "proposed")!.status, "proposed");
});

test("partial failure leaves preexisting stable proposals byte-identical, even with cosmetic candidate changes", async () => {
  const seeded = storage();
  await extractAndPersistDecisions("t", "s", turns, complete([proposed()]), seeded.db);
  const prior = structuredClone(seeded.rows), store = storage(prior, 2);
  await assert.rejects(extractAndPersistDecisions("t", "s", turns,
    complete([proposed("SHIP   Friday."), proposed("Another decision.")]), store.db), /upsert failure/);
  assert.deepEqual(store.rows, prior);
  assert.equal(store.calls.some((c) => c.op === "deleteMany"), false);
});

test("ISS-U25DECISIONS-001(b): failed insertMany after the delete loses the rows — prior loss refused on write failure", async () => {
  const prior = [row("old-proposed"), row("old-reviewed", "verified")], store = storage(prior, 1);
  await assert.rejects(extractAndPersistDecisions("t", "s", turns, complete([proposed()]), store.db), /upsert failure/);
  assert.deepEqual(store.rows, prior);
  assert.equal(store.calls.some((c) => c.op === "deleteMany"), false);
});

test("partial upsert failure may add proposals but never prunes any prior row", async () => {
  const prior = [row("old-a"), row("old-b")], store = storage(prior, 2);
  await assert.rejects(extractAndPersistDecisions("t", "s", turns, complete([proposed(), proposed("Another decision.")]), store.db), /upsert failure/);
  for (const d of prior) assert.deepEqual(store.rows.find((r) => r._id === d._id), d);
  assert.equal(store.rows.length, 3);
  assert.equal(store.calls.some((c) => c.op === "deleteMany"), false);
});

test("stable reruns deduplicate text/evidence and write before tightly scoped stale pruning", async () => {
  const prior = [row("old"), row("foreign-tenant", "proposed", "s", "foreign"), row("foreign-session", "proposed", "other")];
  const store = storage(prior);
  await extractAndPersistDecisions("t", "s", turns, complete([proposed(), proposed(" Ship   Friday. ", ["b", "a", "a"])]), store.db);
  const current = store.rows.find((d) => !prior.some((p) => p._id === d._id))!;
  assert.ok(current);
  assert.match(current._id, /^[a-f0-9]{64}$/);
  assert.deepEqual(current.evidence, [{ turnId: "a", sessionId: "s" }, { turnId: "b", sessionId: "s" }]);
  assert.equal(current.tStart, 2); assert.equal(current.tEnd, 6);
  assert.equal(current.owner, "speaker"); assert.equal(current.status, "proposed");
  assert.equal(store.rows.length, 3);
  const deletion = store.calls.find((c) => c.op === "deleteMany")!;
  assert.deepEqual(deletion.filter, { tenantId: "t", "evidence.sessionId": "s", evidence: { $not: { $elemMatch: { sessionId: { $ne: "s" } } } }, status: "proposed", _id: { $in: ["old"] } });
  assert.ok(store.calls.findIndex((c) => c.op === "updateOne") < store.calls.findIndex((c) => c.op === "deleteMany"));
  await extractAndPersistDecisions("t", "s", turns, complete([proposed("Ship Friday.", ["b", "a"])]), store.db);
  assert.equal(store.rows.length, 3); assert.equal(store.rows.find((d) => d.tenantId === "t" && d.evidence[0].sessionId === "s")!._id, current._id);
  for (const call of store.calls) { assert.equal(call.filter.tenantId, "t"); assert.equal(call.filter["evidence.sessionId"], "s"); }
});

test("genuine empty response prunes proposed only; reviewed and other scopes survive", async () => {
  const prior = [row("old"), row("verified", "verified"), row("review", "needs-review"), row("other", "proposed", "other"), row("tenant", "proposed", "s", "other")];
  prior.push({ ...row("shared-source"), evidence: [{ turnId: "a", sessionId: "s" }, { turnId: "foreign", sessionId: "other" }] });
  const store = storage(prior);
  assert.deepEqual(await extractAndPersistDecisions("t", "s", turns, complete([]), store.db), { count: 0, degraded: null });
  assert.deepEqual(store.rows, prior.slice(1));
});

test("degraded, non-array, unusable and partial responses issue no collection operation", async () => {
  for (const provider of [async () => { throw new Error("offline"); }, complete({ decisions: [] }), complete([null]),
    complete([proposed("Fabricated", ["missing"])]), complete([proposed(), proposed("Fabricated", ["missing"])])]) {
    const prior = [row("old")], store = storage(prior);
    const result = await extractAndPersistDecisions("t", "s", turns, provider as DecisionsCompleteFn, store.db);
    assert.ok(result.degraded); assert.deepEqual(store.rows, prior); assert.deepEqual(store.calls, []);
  }
});

test("foreign target scope and invalid source refuse before provider and DB", async () => {
  const bad = [[{ ...turns[0]!, tenantId: "other" }], [{ ...turns[0]!, sessionId: "other" }],
    [turns[0]!, turns[0]!], [{ ...turns[0]!, tEnd: NaN }]];
  for (const input of bad) {
    const store = storage([row("old")]); let calls = 0;
    const result = await extractAndPersistDecisions("t", "s", input, async () => { calls++; return complete([])({} as never); }, store.db);
    assert.ok(result.degraded); assert.equal(calls, 0); assert.deepEqual(store.calls, []);
  }
});

test("review racing a refresh cannot be reverted to proposed or pruned", async () => {
  const store = storage();
  await extractAndPersistDecisions("t", "s", turns, complete([proposed()]), store.db);
  const original = structuredClone(store.rows[0]!);
  store.beforeWrite(() => { store.rows[0]!.status = "verified"; });
  await assert.rejects(extractAndPersistDecisions("t", "s", turns, complete([proposed()]), store.db), /duplicate key/);
  assert.deepEqual(store.rows, [{ ...original, status: "verified" }]);
  assert.equal(store.calls.some((c) => c.op === "deleteMany"), false);
});

test("an omitted owner clears a prior proposal owner instead of preserving stale attribution", async () => {
  const store = storage();
  await extractAndPersistDecisions("t", "s", turns, complete([proposed()]), store.db);
  assert.equal(store.rows[0]!.owner, "speaker");
  await extractAndPersistDecisions("t", "s", turns, complete([{ text: "Ship Friday.", turnIds: ["a", "b"], owner: "invented" }]), store.db);
  assert.equal(store.rows.length, 1);
  assert.ok(!("owner" in store.rows[0]!));
});

test("actual In-Focus transcript exercises provenance persistence and downstream harness (scripted provider; no semantic acceptance)", {
  skip: process.env.KB_U25_PRIVATE_TOC_TESTS !== "1" ? "HOLD: authentic TOC persistence sample requires explicit private-test opt-in" : false,
}, async () => {
  const bytes = readFileSync(new URL("../../../../data/toc-migrated/2026-08-27-in-focus-4/turns.json", import.meta.url));
  const source: Turns[] = JSON.parse(bytes.toString("utf8"));
  assert.equal(source.length, 51);
  const cited = source.find((t) => t.text.length > 100)!;
  const store = storage();
  // This deliberate literal source quote tests transport/provenance only. It is NOT a
  // gold decision label or a claim that this utterance semantically contains a decision.
  const result = await extractAndPersistDecisions("toc", "2026-08-27-in-focus-4", source,
    complete([{ text: cited.text, turnIds: [cited._id], owner: cited.speakerRef }]), store.db);
  assert.deepEqual(result, { count: 1, degraded: null });
  assert.equal(store.rows.length, 1);
  const report = evaluateExtractionCase({ id: "u25-real-source-transport", tenantId: "toc", sessionId: "2026-08-27-in-focus-4",
    artifactHash: createHash("sha256").update(bytes).digest("hex"), turns: source, persisted: store.rows });
  assert.deepEqual(report.stages.persisted.issues, []);
  assert.equal(report.stages.persisted.invalidCitationRate.numerator, 0);
  assert.equal(report.semantic.measured, false);
});
