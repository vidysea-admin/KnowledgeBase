import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareChunkDocuments, writeSessionChunks } from "./chunk-write.js";
import { chunkContentId, chunkContentMatches } from "./chunk-integrity.js";
import { buildChunks } from "@lkb/index";
import type { Turns } from "@lkb/core";

const turn = (id: string, text: string, tenantId = "tenant-a"): Turns => ({
  _id: id, tenantId, sessionId: "source", text, speakerRef: "expert", tStart: 0, tEnd: 1,
});
const embed = async (job: { texts: string[] }) => ({ vectors: job.texts.map(() => [1, 0]), dims: 2, provider: "fixture", model: "fixture" });

function durable(rows: Record<string, unknown>[] = [], failWrite = 0) {
  const calls: { operation: string; filter: Record<string, unknown> }[] = [];
  let writes = 0;
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
    row.tenantId === filter.tenantId && row.sourceRef === filter.sourceRef &&
    (typeof filter._id === "string" ? row._id === filter._id :
      !(filter._id as { $nin?: unknown[] } | undefined)?.$nin?.includes(row._id));
  const db = { collection: () => ({
    async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }, options: { upsert: boolean }) {
      calls.push({ operation: "updateOne", filter });
      assert.equal(options.upsert, true);
      if (++writes === failWrite) throw new Error("injected write failure");
      const index = rows.findIndex(row => matches(row, filter));
      if (index < 0) rows.push({ ...update.$set }); else rows[index] = { ...update.$set };
    },
    async deleteMany(filter: Record<string, unknown>) {
      calls.push({ operation: "deleteMany", filter });
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, filter)) rows.splice(i, 1);
    },
  }) };
  return { db: db as never, rows, calls };
}

test("content identities survive rerun and store reload; changed bytes and tenants cannot reuse identity", async () => {
  const source = [turn("one", "A".repeat(450)), turn("two", "B".repeat(450))];
  const storage = durable();
  const result = await writeSessionChunks("tenant-a", "source", source, embed as never, storage.db);
  assert.deepEqual(result, { written: 2, skipped: null });
  const first = JSON.stringify(storage.rows);
  await writeSessionChunks("tenant-a", "source", source, embed as never, storage.db);
  assert.equal(JSON.stringify(storage.rows), first);
  const reloaded = durable(JSON.parse(first));
  await writeSessionChunks("tenant-a", "source", source, embed as never, reloaded.db);
  assert.equal(JSON.stringify(reloaded.rows), first);
  const plan = buildChunks(source)[0]!;
  assert.equal(storage.rows[0]!._id, chunkContentId("tenant-a", "source", plan.turnRefs, plan.text));
  assert.notEqual(prepareChunkDocuments("tenant-b", "source", [plan], await embed({ texts: [plan.text] }) as never)[0]!._id, storage.rows[0]!._id);
  for (const call of storage.calls) assert.equal(call.filter.tenantId, "tenant-a");
});

test("changed source plus provider failure leaves durable rows but zero trusted stale hits; retry prunes", async () => {
  const before = [turn("one", "Old instructions.")], changed = [turn("one", "New instructions.")];
  const storage = durable();
  await writeSessionChunks("tenant-a", "source", before, embed as never, storage.db);
  const old = JSON.stringify(storage.rows);
  assert.deepEqual(await writeSessionChunks("tenant-a", "source", changed, async () => { throw new Error("provider down"); }, storage.db),
    { written: 0, skipped: "embedding-failed" });
  assert.equal(JSON.stringify(storage.rows), old, "provider outage must not erase durable rows");
  const current = new Map(changed.map(row => [row._id, row]));
  assert.equal(storage.rows.filter(row => chunkContentMatches(row as never, current, "tenant-a")).length, 0);
  await writeSessionChunks("tenant-a", "source", changed, embed as never, storage.db);
  assert.equal(storage.rows.length, 1);
  assert.equal(chunkContentMatches(storage.rows[0] as never, current, "tenant-a"), true);
  assert.equal(chunkContentMatches({ ...storage.rows[0], _id: "legacy-uuid" } as never, current, "tenant-a"), false);
});

test("partial write failure never prunes prior index; empty source clears only its tenant", async () => {
  const prior = [turn("old", "Prior source.")];
  const storage = durable();
  await writeSessionChunks("tenant-a", "source", prior, embed as never, storage.db);
  const priorId = storage.rows[0]!._id;
  const failing = durable(storage.rows, 2);
  const result = await writeSessionChunks("tenant-a", "source", [turn("one", "A".repeat(450)), turn("two", "B".repeat(450))], embed as never, failing.db);
  assert.equal(result.skipped, "embedding-failed");
  assert.ok(storage.rows.some(row => row._id === priorId));
  assert.ok(!failing.calls.some(call => call.operation === "deleteMany"));
  storage.rows.push({ _id: "foreign", tenantId: "tenant-b", sourceRef: "source" });
  assert.equal((await writeSessionChunks("tenant-a", "source", [], embed as never, storage.db)).skipped, "no-chunkable-turns");
  assert.deepEqual(storage.rows.map(row => row._id), ["foreign"]);
});

test("missing embedding model identity cannot write or prune the durable corpus", async () => {
  const storage = durable([{ _id: "prior", tenantId: "tenant-a", sourceRef: "source" }]);
  const result = await writeSessionChunks("tenant-a", "source", [turn("one", "A real source.")],
    async job => ({ ...await embed(job), model: "" }), storage.db);
  assert.equal(result.skipped, "embedding-failed");
  assert.deepEqual(storage.rows.map(row => row._id), ["prior"]);
  assert.equal(storage.calls.length, 0);
});
