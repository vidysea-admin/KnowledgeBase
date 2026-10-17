import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoOutputRepository } from "../../../apps/api/src/knowledge-outputs/repository.js";
import { outputAssessmentDigest } from "../../../apps/api/src/knowledge-outputs/assessment.js";
import type { OutputDraft } from "../../../apps/api/src/knowledge-outputs/types.js";

// Synthetic rows and inert instrumented driver only: no MongoClient, connection, provider or browser.
function draft(tenantId: string): OutputDraft {
  const value: OutputDraft = { _id: "12345678-1234-1234-1234-123456789abc", tenantId, kind: "faq", title: "Adapter fixture", purpose: "Check the driver boundary",
    sessionIds: ["fixture-session"], revision: 1, createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z",
    sourceDigest: "0".repeat(64), sourceCoverage: { status: "ready", withheldClaims: 0 }, provider: "synthetic", model: "no-call", reviewState: "draft",
    sections: [{ key: "faq", title: "Questions and answers", missing: "", items: [{ id: "faq-1", kind: "fact", text: "Q: What did the board do?\nA: The board extended the deadline.", citationIds: ["e1"], validation: "ai-supported", assessmentDigest: "" }] }],
    citations: [{ id: "e1", claimId: "fixture-claim", turnId: "fixture-turn", sessionId: "fixture-session", speakerRef: "person:chair", start: 1, end: 2,
      unit: "seconds", quote: "The board extended the deadline.", href: "/sessions/fixture-session#turn-fixture-turn" }] };
  value.sections[0]!.items[0]!.assessmentDigest = outputAssessmentDigest(value.sourceDigest, value.sections[0]!.items[0]!);
  return value;
}
function instrumentedDriver() {
  const rows: OutputDraft[] = [];
  const writes: { filter: Record<string, unknown>; replacement: OutputDraft; options: Record<string, unknown> }[] = [];
  const reads: Record<string, unknown>[] = [];
  let insertions = 0;
  const matches = (row: OutputDraft, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => row[key as keyof OutputDraft] === value);
  const db = { databaseName: "test_t058_inert_driver", collection(name: string) {
    assert.equal(name, "knowledge_outputs");
    return {
      async insertOne(value: OutputDraft) { insertions++; rows.push(structuredClone(value)); return { acknowledged: true, insertedId: value._id }; },
      async findOne(filter: Record<string, unknown>) { reads.push(structuredClone(filter)); return structuredClone(rows.find((row) => matches(row, filter)) ?? null); },
      find(filter: Record<string, unknown>) { reads.push(structuredClone(filter)); return { sort() { return { limit() { return { async toArray() { return structuredClone(rows.filter((row) => matches(row, filter))); } }; } }; } }; },
      async replaceOne(filter: Record<string, unknown>, replacement: OutputDraft, options: Record<string, unknown> = {}) {
        writes.push(structuredClone({ filter, replacement, options }));
        const index = rows.findIndex((row) => matches(row, filter));
        if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
        rows[index] = structuredClone(replacement); return { matchedCount: 1, modifiedCount: 1 };
      },
    };
  } };
  return { repository: createMongoOutputRepository(db as unknown as Db), rows, writes, reads, insertions: () => insertions };
}

test("independent actual adapter sends tenant+ID+revision/no-upsert and refuses stale or foreign matches", async () => {
  const f = instrumentedDriver(), original = draft("tenant-a"), before = structuredClone(original);
  await f.repository.insert("tenant-a", original);
  const updated = { ...original, title: "Winning revision", revision: 2 };
  assert.equal(await f.repository.replace("tenant-a", updated, 1), true);
  assert.deepEqual(f.writes[0]!.filter, { _id: original._id, revision: 1, tenantId: "tenant-a" });
  assert.equal(f.writes[0]!.replacement.tenantId, "tenant-a");
  assert.equal(f.writes[0]!.options.upsert, undefined);
  assert.equal(await f.repository.replace("tenant-a", { ...original, title: "Stale overwrite", revision: 2 }, 1), false);
  assert.equal(await f.repository.replace("tenant-b", { ...original, tenantId: "tenant-b", revision: 2 }, 1), false);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0]!.title, "Winning revision");
  assert.equal(await f.repository.get("tenant-b", original._id), null); assert.deepEqual(await f.repository.list("tenant-b"), []);
  assert.deepEqual(f.reads.at(-2), { _id: original._id, tenantId: "tenant-b" });
  assert.deepEqual(f.reads.at(-1), { tenantId: "tenant-b" });
  assert.deepEqual(original, before); assert.deepEqual(await f.repository.get("tenant-a", original._id), updated);
});

test("independent actual adapter competing expected revisions preserve one winning replacement", async () => {
  const f = instrumentedDriver(), original = draft("tenant-a"); await f.repository.insert("tenant-a", original);
  const outcomes = await Promise.all(["First writer", "Second writer"].map((title) => f.repository.replace("tenant-a", { ...original, title, revision: 2 }, 1)));
  assert.deepEqual(outcomes, [true, false]);
  assert.equal(f.rows[0]!.title, "First writer"); assert.equal(f.rows[0]!.revision, 2);
  assert.equal(f.writes.length, 2); assert.ok(f.writes.every((write) => write.filter.tenantId === "tenant-a" && write.filter.revision === 1 && write.options.upsert !== true));
});

test("independent actual adapter refuses invalid ownership/revision/assessed text before driver writes", async () => {
  const f = instrumentedDriver(), original = draft("tenant-a");
  await assert.rejects(f.repository.insert("tenant-b", original));
  await assert.rejects(f.repository.insert("tenant-a", { ...original, revision: 2 }));
  await assert.rejects(f.repository.insert("", { ...original, tenantId: "" }));
  assert.equal(f.insertions(), 0);
  await f.repository.insert("tenant-a", original);
  await assert.rejects(f.repository.replace("tenant-b", { ...original, revision: 2 }, 1));
  await assert.rejects(f.repository.replace("tenant-a", { ...original, revision: 3 }, 1));
  const damaged = structuredClone(original); damaged.revision = 2; damaged.sections[0]!.items[0]!.text = "Q: Is tuition free?\nA: Everyone receives free tuition.";
  await assert.rejects(f.repository.replace("tenant-a", damaged, 1));
  assert.equal(f.writes.length, 0); assert.deepEqual(f.rows[0], original);
});
