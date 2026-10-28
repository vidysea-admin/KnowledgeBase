import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { NativeSourceLocator, TreeIndexNode } from "@lkb/core";
import type { DocumentRow } from "../../knowledge/collections-store.js";
import { buildNativeIntegrations } from "./native.js";

type Row = Record<string, any>;
/** Public synthetic Mongo protocol only: the production factory, head store, publisher,
 * resolver and Ask adapters execute unchanged. No native DB/provider/embedding proof. */
function fixture() {
  const tables = new Map<string, Row[]>(), documents = new Map<string, DocumentRow>();
  const calls: string[] = [], forbiddenCollections: string[] = [];
  const rows = (name: string) => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
  const at = (row: Row, path: string): any => path.split(".").reduce((v, key) => v?.[key], row);
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([key, expected]) => {
    if (key === "$and") return expected.every((part: Row) => matches(row, part));
    if (key === "$or") return expected.some((part: Row) => matches(row, part));
    const actual = at(row, key);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected) return (actual !== undefined) === expected.$exists;
      if ("$nin" in expected) return !expected.$nin.includes(actual);
      if ("$in" in expected) return expected.$in.includes(actual);
      if ("$eq" in expected) return actual === expected.$eq;
    }
    return actual === expected;
  });
  const set = (row: Row, path: string, value: unknown) => {
    const keys = path.split("."); let target = row;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)!] = structuredClone(value);
  };
  const db = { collection(name: string) {
    if (!new Set(["sources", "tree_index"]).has(name)) {
      forbiddenCollections.push(name); throw new Error("unexpected native collection: " + name);
    }
    return {
      find(filter: Row) {
        calls.push(name + ".find"); let bound = Infinity;
        const cursor = { limit(value: number) { bound = value; return cursor; },
          async toArray() { return structuredClone(rows(name).filter(row => matches(row, filter)).slice(0, bound)); } };
        return cursor;
      },
      async findOne(filter: Row) { calls.push(name + ".findOne"); return structuredClone(rows(name).find(row => matches(row, filter)) ?? null); },
      async insertOne(row: Row) { calls.push(name + ".insertOne");
        if (rows(name).some(old => old._id === row._id && old.tenantId === row.tenantId)) throw new Error("duplicate");
        rows(name).push(structuredClone(row)); return { acknowledged: true, insertedId: row._id }; },
      async updateOne(filter: Row, update: Row, options: Row = {}) {
        calls.push(name + ".updateOne"); let row = rows(name).find(row => matches(row, filter));
        if (!row && !options.upsert) return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
        const inserted = !row;
        if (!row) { row = structuredClone(filter); rows(name).push(row!); }
        for (const [key, value] of Object.entries(update.$set ?? {})) set(row!, key, value);
        if (inserted) for (const [key, value] of Object.entries(update.$setOnInsert ?? {})) set(row!, key, value);
        for (const [key, value] of Object.entries(update.$inc ?? {})) set(row!, key, Number(at(row!, key) ?? 0) + Number(value));
        return { acknowledged: true, modifiedCount: 1, matchedCount: inserted ? 0 : 1, upsertedCount: inserted ? 1 : 0 };
      },
      async replaceOne(filter: Row, replacement: Row, options: Row = {}) {
        calls.push(name + ".replaceOne"); const index = rows(name).findIndex(row => matches(row, filter));
        if (index < 0 && !options.upsert) return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
        if (index < 0) rows(name).push(structuredClone(replacement)); else rows(name)[index] = structuredClone(replacement);
        return { acknowledged: true, modifiedCount: index < 0 ? 0 : 1, matchedCount: index < 0 ? 0 : 1, upsertedCount: index < 0 ? 1 : 0 };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  const knowledgeStore = { async getDocument(tenantId: string, id: string) {
    calls.push("documents.getDocument"); const document = documents.get(id);
    return document?.tenantId === tenantId ? structuredClone(document) : null;
  } };
  const open = () => buildNativeIntegrations({ db, knowledgeStore });
  const document = (id: string, version: string, text: string): DocumentRow => ({ _id: id, sourceId: id,
    tenantId: "native-public", title: "Public synthetic instructions", format: "pdf", version: version.repeat(64),
    pages: [{ pageNumber: 1, text }], highlights: [], createdAt: "2026-10-15T00:00:00.000Z" });
  return { db, knowledgeStore, open, documents, document, calls, rows, forbiddenCollections };
}

test("production native factory is pure; actual publication hydrates and revalidates through one current-head authority", async () => {
  const f = fixture(), native = f.open(); assert.equal(f.calls.length, 0);
  const first = f.document("immutable:first", "a", "Public guidance explains student visa requirements.");
  f.documents.set(first._id, first);
  const { sourceId } = await native.headStore.registerLogicalSource("native-public", { recordedBy: "synthetic-owner" });
  assert.equal(await native.resolver.resolve("native-public", {} as NativeSourceLocator), null);
  await native.headStore.publish("native-public", { sourceId, documentId: first._id, documentSourceId: first.sourceId,
    revisionHash: first.version, expectedHeadRevision: null });
  assert.equal(f.rows("tree_index").length, 1);
  const locators = await native.listLocators("native-public", { sourceId, revisionHash: first.version });
  assert.ok(locators.length > 0); assert.equal(locators[0]!.kind, "document-page");
  const resolved = await native.resolver.resolve("native-public", locators[0]!);
  assert.ok(resolved); assert.ok(first.pages[0]!.text.includes(resolved.quote));
  const admitted = [{ node_id: "native-public-node", title: first.title, summary: "retrieval is not evidence", children: [],
    evidence: { sourceId, revisionHash: first.version } }] as unknown as TreeIndexNode[];
  const context = await native.nativeSources("native-public").hydrate("student visa requirements", admitted);
  assert.equal(context.nodes.length, 1);
  await native.nativeSources("native-public").revalidate(context.nodes);
  assert.equal(await native.resolver.resolve("foreign", locators[0]!), null);
  assert.deepEqual(await native.listLocators("foreign", { sourceId, revisionHash: first.version }), []);
  assert.deepEqual(f.forbiddenCollections, []);
});

test("replacement, restart and revocation reject old immutable evidence and current-head binding forgery", async () => {
  const f = fixture(), native = f.open();
  const first = f.document("immutable:first", "a", "Student visa guidance is published here.");
  const second = f.document("immutable:second", "b", "Updated student visa requirements are published here.");
  f.documents.set(first._id, first); f.documents.set(second._id, second);
  const { sourceId } = await native.headStore.registerLogicalSource("native-public", { recordedBy: "synthetic-owner" });
  const publish = (document: DocumentRow, expectedHeadRevision: number | null) => native.headStore.publish("native-public", {
    sourceId, documentId: document._id, documentSourceId: document.sourceId, revisionHash: document.version, expectedHeadRevision });
  await publish(first, null);
  const old = (await native.listLocators("native-public", { sourceId, revisionHash: first.version }))[0]!;
  const oldContext = await native.nativeSources("native-public").hydrate("student visa guidance", [{
    node_id: "native-old", title: first.title, summary: "", children: [], evidence: { sourceId, revisionHash: first.version },
  }] as unknown as TreeIndexNode[]);
  assert.equal(oldContext.nodes.length, 1);
  await publish(first, null);
  assert.equal(f.rows("tree_index")[0]!.children.length, 1);
  await publish(second, 1);
  const reopened = f.open(); assert.equal(f.documents.has(first._id), true);
  assert.equal(await reopened.resolver.resolve("native-public", old), null);
  await assert.rejects(reopened.nativeSources("native-public").revalidate(oldContext.nodes), /native source changed/);
  assert.deepEqual(await reopened.listLocators("native-public", { sourceId, revisionHash: first.version }), []);
  const current = (await reopened.listLocators("native-public", { sourceId, revisionHash: second.version }))[0]!;
  assert.ok(await reopened.resolver.resolve("native-public", current));
  if (current.kind !== "document-page") throw new Error("document locator expected");
  for (const patch of [{ documentId: first._id }, { documentSourceId: first.sourceId }, { headRevision: 1 }, { pageNumber: 2 }]) {
    assert.equal(await reopened.resolver.resolve("native-public", { ...current, ...patch }), null);
  }
  await reopened.headStore.tombstone("native-public", { sourceId, expectedHeadRevision: 2, status: "revoked" });
  assert.equal(await reopened.resolver.resolve("native-public", current), null);
  assert.deepEqual(await reopened.listLocators("native-public", { sourceId, revisionHash: second.version }), []);
  assert.deepEqual(f.forbiddenCollections, []);
});

test("missing trusted message authority refuses message evidence without querying immutable documents", async () => {
  const f = fixture(), native = f.open();
  const message: NativeSourceLocator = { kind: "message", sourceId: "message-source", revisionHash: "c".repeat(64),
    threadId: "thread-public", messageId: "message-public", passage: { start: 0, end: 4, sha256: "d".repeat(64) } };
  assert.equal(await native.resolver.resolve("native-public", message), null);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await native.listLocators("native-public", { sourceId: message.sourceId, revisionHash: message.revisionHash }), []);
  assert.equal(f.calls.filter(call => call === "documents.getDocument").length, 0);
});
