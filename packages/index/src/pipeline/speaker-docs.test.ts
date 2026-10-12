/**
 * packages/index/src/pipeline/speaker-docs.test.ts — U2.4 apply step, the PURE half.
 *
 * This is the unit that finally writes identities down, so the failure modes change character:
 * everything before it could only refuse to name someone, while this one can assert that two
 * different humans are the same person. `personId` is derived from the spoken name, so two people
 * legitimately called "Ruby" in different sessions collide — carried here as a blocking item from
 * three earlier checker cycles.
 *
 * The rule adopted: never merge silently. A collision is surfaced to the caller and the merged
 * document's confidence drops, so a manifest cannot report a clean write over an ambiguous one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSpeakerDocs, type SessionResolution } from "./speaker-docs.js";

function res(sessionId: string, displayName: string, personId: string, turnIds: string[]): SessionResolution {
  return {
    sessionId,
    resolved: [{
      speakerRef: "spk:0",
      displayName,
      personId,
      evidence: turnIds.map((turnId) => ({ turnId, sessionId })),
      // Segment-aware scope (speaker-segment-identity gate): fixtures claim the block holding
      // their evidence turn; block windows are indexes into the fixture's turn list.
      blocks: turnIds.map((_, i) => ({ startTurnIndex: i, endTurnIndex: i })),
    }],
  };
}

test("builds one schema-shaped doc per resolved speaker", () => {
  const { docs, collisions } = buildSpeakerDocs("toc", [res("s1", "Jubin Thakkar", "person:jubin-thakkar", ["t1"])]);
  assert.deepEqual(collisions, []);
  assert.equal(docs.length, 1);
  const d = docs[0];
  assert.ok(d);
  assert.equal(d.tenantId, "toc");
  assert.equal(d.personId, "person:jubin-thakkar");
  assert.deepEqual(d.aliases, ["Jubin Thakkar"]);
  assert.deepEqual(d.evidence, [{ turnId: "t1", sessionId: "s1" }]);
  assert.ok(d._id.length > 0, "schema requires a stable _id");
});

test("evidence is never empty -- the schema forbids it", () => {
  const { docs } = buildSpeakerDocs("toc", [{ sessionId: "s1", resolved: [
    { speakerRef: "spk:0", displayName: "Ghost", personId: "person:ghost", evidence: [], blocks: [] },
  ] }]);
  assert.deepEqual(docs, [], "a speaker with no evidence must not be written");
});

test("merges the same person across sessions and unions the evidence", () => {
  const { docs, collisions } = buildSpeakerDocs("toc", [
    res("s1", "Ruby", "person:ruby", ["t1"]),
    res("s2", "Ruby", "person:ruby", ["t9"]),
  ]);
  assert.equal(docs.length, 1, "one identity, not two documents");
  assert.deepEqual(docs[0]?.evidence, [
    { turnId: "t1", sessionId: "s1" },
    { turnId: "t9", sessionId: "s2" },
  ]);
  assert.equal(collisions.length, 1, "a cross-session merge is a COLLISION, reported, never silent");
  assert.equal(collisions[0]?.personId, "person:ruby");
  assert.deepEqual(collisions[0]?.sessionIds, ["s1", "s2"]);
});

test("a cross-session merge lowers confidence -- it is an inference, not an observation", () => {
  const single = buildSpeakerDocs("toc", [res("s1", "Ruby", "person:ruby", ["t1"])]);
  const merged = buildSpeakerDocs("toc", [
    res("s1", "Ruby", "person:ruby", ["t1"]),
    res("s2", "Ruby", "person:ruby", ["t9"]),
  ]);
  const a = single.docs[0]?.confidence ?? 0;
  const b = merged.docs[0]?.confidence ?? 0;
  assert.ok(b < a, `merged confidence ${b} must be below single-session ${a}`);
});

test("two speakers in ONE session sharing a name merge without a cross-session collision", () => {
  const { docs, collisions } = buildSpeakerDocs("toc", [{ sessionId: "s1", resolved: [
    { speakerRef: "spk:0", displayName: "Ruby", personId: "person:ruby", evidence: [{ turnId: "t1", sessionId: "s1" }], blocks: [{ startTurnIndex: 0, endTurnIndex: 0 }] },
    { speakerRef: "spk:3", displayName: "Ruby", personId: "person:ruby", evidence: [{ turnId: "t4", sessionId: "s1" }], blocks: [{ startTurnIndex: 3, endTurnIndex: 3 }] },
  ] }]);
  assert.equal(docs.length, 1);
  assert.deepEqual(collisions, [], "same session, same name is diarization splitting one voice");
  assert.equal(docs[0]?.evidence.length, 2);
});

test("different names never merge, even when they share a session", () => {
  const { docs } = buildSpeakerDocs("toc", [{ sessionId: "s1", resolved: [
    { speakerRef: "spk:0", displayName: "Ruby", personId: "person:ruby", evidence: [{ turnId: "t1", sessionId: "s1" }], blocks: [{ startTurnIndex: 0, endTurnIndex: 0 }] },
    { speakerRef: "spk:1", displayName: "Anita Desai", personId: "person:anita-desai", evidence: [{ turnId: "t2", sessionId: "s1" }], blocks: [{ startTurnIndex: 1, endTurnIndex: 1 }] },
  ] }]);
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.personId).sort(), ["person:anita-desai", "person:ruby"]);
});

test("aliases collect every distinct spelling, deduped and ordered", () => {
  const { docs } = buildSpeakerDocs("toc", [
    res("s1", "D'Souza", "person:d-souza", ["t1"]),
    res("s2", "D'souza", "person:d-souza", ["t2"]),
    res("s3", "D'Souza", "person:d-souza", ["t3"]),
  ]);
  assert.deepEqual(docs[0]?.aliases, ["D'Souza", "D'souza"]);
});

test("every doc carries the tenant it was built for", () => {
  const { docs } = buildSpeakerDocs("other-tenant", [res("s1", "Ruby", "person:ruby", ["t1"])]);
  assert.equal(docs[0]?.tenantId, "other-tenant");
});

test("no input produces no documents and no collisions", () => {
  assert.deepEqual(buildSpeakerDocs("toc", []), { docs: [], collisions: [] });
});

/**
 * The WRITE half. ISS-102: the first version of this lived in `scripts/sync-speakers.mjs` and
 * called `speakers(tenant).replaceOne(...)` — a method the tenant-scoped accessor does not expose,
 * so the live write threw `TypeError` on its first document and the "separately approved step"
 * could not execute at all.
 *
 * It was invisible because every `tsconfig.json` is `include: ["src/**\/*.ts"]`, so a `.mjs`
 * entrypoint is outside `pnpm -r typecheck` entirely, and nothing exercised the non-dry-run branch.
 * That is the THIRD recurrence of the same shape (ISS-060, ISS-065, ISS-068).
 *
 * The fix is structural, not a patch: the write logic moved HERE, into typechecked source, behind
 * a `SpeakerWriteTarget` interface that names exactly the accessor methods it may use. Reaching
 * for `replaceOne` again is now a compile error, and the fake below mirrors the real surface so a
 * drift in `scopedCollection` shows up as a test failure rather than at 3am on a live run.
 */
import { writeSpeakerDocs, type SpeakerWriteTarget } from "./speaker-docs.js";

/** Mirrors the REAL `scopedCollection` surface: find/findOne/insertOne/insertMany/deleteMany/countDocuments/updateOne. */
function fakeTarget() {
  const stored: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const target: SpeakerWriteTarget = {
    countDocuments: async () => { calls.push("countDocuments"); return stored.length; },
    deleteMany: async (filter) => {
      calls.push("deleteMany");
      const before = stored.length;
      for (let i = stored.length - 1; i >= 0; i--) {
        if (Object.entries(filter).every(([k, v]) => (stored[i] as Record<string, unknown>)[k] === v)) stored.splice(i, 1);
      }
      return { deletedCount: before - stored.length };
    },
    insertOne: async (doc) => { calls.push("insertOne"); stored.push({ ...doc, tenantId: "toc" }); return { acknowledged: true }; },
    findOne: async (filter) => stored.find((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) ?? null,
  };
  return { target, stored, calls };
}

const doc = (personId: string) => ({
  _id: `toc-${personId}`, tenantId: "toc", personId, aliases: ["X"] as [string, ...string[]],
  confidence: 0.9, evidence: [{ turnId: "t1", sessionId: "s1" }] as [{ turnId: string; sessionId: string }],
});

test("writeSpeakerDocs replaces by personId using only accessor methods that exist", async () => {
  const { target, stored, calls } = fakeTarget();
  const result = await writeSpeakerDocs(target, [doc("person:ruby")]);
  assert.equal(result.written, 1);
  assert.equal(stored.length, 1);
  assert.deepEqual([...new Set(calls)].sort(), ["countDocuments", "deleteMany", "insertOne"]);
});

test("the stored document carries its tenantId -- a bare replace would have dropped it", async () => {
  const { target, stored } = fakeTarget();
  await writeSpeakerDocs(target, [doc("person:ruby")]);
  assert.equal(stored[0]?.tenantId, "toc", "speakers.schema.json requires tenantId");
});

test("re-running is idempotent: one document per personId, not a duplicate", async () => {
  const { target, stored } = fakeTarget();
  await writeSpeakerDocs(target, [doc("person:ruby")]);
  await writeSpeakerDocs(target, [doc("person:ruby")]);
  assert.equal(stored.length, 1, "the delete-then-insert pair must not accumulate");
});

test("writing nothing touches nothing", async () => {
  const { target, calls } = fakeTarget();
  const result = await writeSpeakerDocs(target, []);
  assert.equal(result.written, 0);
  assert.ok(!calls.includes("deleteMany"), "an empty write must not delete anything");
});
