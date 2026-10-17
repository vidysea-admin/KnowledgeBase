import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import type { TreeIndexNode } from "@lkb/core";
import type { PageDocument } from "../../../../../packages/ingest/src/sources/document-pages.js";
import type { DocumentRow } from "../../knowledge/collections-store.js";
import { publicPreservedReviewFixture } from "../../indexing/public-preserved-review.fixture.js";
import { buildNativeIntegrations } from "./native.js";
import { trustedTreeReads } from "./trusted-readers.js";

async function fixture() {
  const f = publicPreservedReviewFixture({ preserveReview: false }); let refuseHead = false;
  const docs = new Map<string, DocumentRow>();
  const db = { client: { startSession: () => ({ async withTransaction(run: () => Promise<unknown>) { return run(); }, async endSession() {} }) },
    collection(name: string) { const original = f.db.collection(name); return { ...original,
      find(filter: Record<string, unknown>) { let limit = Infinity; const cursor = original.find(filter);
        const bounded = { limit(n: number) { limit = n; return bounded; }, async toArray() { return (await cursor.toArray()).slice(0, limit); } }; return bounded; },
      async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown> = {}) {
        if (name === "sources" && refuseHead && JSON.stringify(update).includes("nativeDocumentHead")) return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
        const before = await original.findOne(filter);
        const result = await original.updateOne(filter, update, options);
        const after = before ? await original.findOne({ _id: before._id, tenantId: before.tenantId }) : null;
        return { ...result, modifiedCount: result.matchedCount === 1 && before && after && !isDeepStrictEqual(before, after) ? 1 : 0 };
      },
    }; } } as unknown as Db;
  const native = buildNativeIntegrations({ db, knowledgeStore: { async getDocument(tenant, id) { const doc = docs.get(id); return doc?.tenantId === tenant ? structuredClone(doc) : null; } } });
  const { sourceId } = await native.headStore.registerLogicalSource("A", { recordedBy: "synthetic-fixture" });
  const add = (id: string, revision: string, text: string) => { const doc: DocumentRow = { _id: id, tenantId: "A", sourceId: `bytes:${id}`, version: revision.repeat(64), title: "Document authority", format: "pdf", createdAt: "2026-10-15T00:00:00Z", pages: [{ pageNumber: 1, text }], highlights: [] }; docs.set(id, doc); return doc; };
  const first = add("doc:1", "a", "Visa forms open in October.");
  const publish = (doc: PageDocument, expectedHeadRevision: number | null) => native.headStore.publish("A", { sourceId, documentId: doc._id, documentSourceId: doc.sourceId, revisionHash: doc.version, expectedHeadRevision });
  await publish(first, null);
  return { f, db, native, sourceId, add, publish, reader: trustedTreeReads(() => db, native.resolver), failHead(v: boolean) { refuseHead = v; } };
}
function leaves(root: TreeIndexNode | null): TreeIndexNode[] {
  if (!root) return []; const stack = [root], output: TreeIndexNode[] = [];
  while (stack.length) { const node = stack.pop()!; if (node.level === "native-passage") output.push(node); stack.push(...node.children); } return output;
}
test("actual trusted tree reader admits current publisher head and resolver documents after transcript filtering", async () => {
  const f = await fixture(); const result = await f.reader.load("A");
  assert.deepEqual(leaves(result).map(n => n.summary), ["Visa forms open in October."]);
  assert.equal(leaves(await trustedTreeReads(() => f.db).load("A")).length, 0);
  assert.equal(leaves(await f.reader.load("B")).length, 0);
  const physical = f.f.rows("tree_index")[0] as unknown as TreeIndexNode;
  physical.summary = "FORGED ROOT"; physical.children[0]!.summary = "FORGED PARENT"; physical.children[0]!.children[0]!.summary = "FORGED LEAF";
  const repaired = await f.reader.load("A"); assert.equal(JSON.stringify(repaired).includes("FORGED"), false);
  assert.deepEqual(leaves(repaired).map(n => n.summary), ["Visa forms open in October."]);
});
test("actual trusted tree reader prunes failed CAS physical candidates old heads and revocations", async () => {
  const f = await fixture(); const second = f.add("doc:2", "b", "Scholarships close on Friday.");
  f.failHead(true); await assert.rejects(f.publish(second, 1), /head_conflict/); f.failHead(false);
  assert.equal((f.f.rows("tree_index")[0]!.children as unknown[]).length, 2, "failed head CAS leaves a quarantined physical branch");
  assert.deepEqual(leaves(await f.reader.load("A")).map(n => n.summary), ["Visa forms open in October."]);
  await f.publish(second, 1);
  assert.deepEqual(leaves(await f.reader.load("A")).map(n => n.summary), ["Scholarships close on Friday."]);
  await f.native.headStore.tombstone("A", { sourceId: f.sourceId, expectedHeadRevision: 2, status: "revoked" });
  assert.equal(leaves(await f.reader.load("A")).length, 0);
});
test("actual trusted tree reader rejects forged foreign branch and never revives transcript session without page proof", async () => {
  const f = await fixture(); const physical = f.f.rows("tree_index")[0] as unknown as TreeIndexNode;
  const forged = structuredClone(physical.children[0]!); forged.node_id = "B/native-source:forged"; physical.children.push(forged);
  physical.children.push({ node_id: "A/session:session-a", level: "session", title: "UNPUBLISHED TRANSCRIPT", summary: "UNPUBLISHED TRANSCRIPT", children: [], evidence: { sessionRef: "session-a" } });
  const result = await f.reader.load("A"); assert.equal(leaves(result).length, 1);
  assert.equal(JSON.stringify(result).includes("UNPUBLISHED"), false); assert.equal(JSON.stringify(result).includes("B/native-source"), false);
});
