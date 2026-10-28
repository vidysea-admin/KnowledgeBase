import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { createNativePassageIndex } from "./publication.js";
import { createNativeDocumentHeadStore, type NativeDocumentCandidate } from "./head-store.js";
import { createNativeEvidenceResolver } from "./resolver.js";

type Row = Record<string, any>;
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function candidate(overrides: Partial<NativeDocumentCandidate> = {}): NativeDocumentCandidate {
  const c: NativeDocumentCandidate = { tenantId: "A", sourceId: "stable:1", documentId: "doc:1", documentSourceId: "bytes:1",
    revisionHash: "a".repeat(64), headRevision: 1, document: { _id: "doc:1", tenantId: "A", sourceId: "bytes:1",
      version: "a".repeat(64), title: "Original title", format: "pdf", createdAt: "2026-10-15T00:00:00Z",
      pages: [{ pageNumber: 1, text: "😀 policy\n".repeat(160) }, { pageNumber: 2, text: "" }, { pageNumber: 3, text: "Final page" }] }, ...overrides };
  return c;
}
function fixture() {
  const rows: Record<string, Row[]> = { tree_index: [], sources: [] };
  let replacements = 0, forbidden = 0;
  let replaceHook: ((next: Row) => Promise<boolean>) | undefined, readHook: ((result: Row[]) => Row[]) | undefined;
  const at = (row: Row, path: string): unknown => path.split(".").reduce((v, k) => v?.[k], row as any);
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([k, v]) => {
    const value = at(row, k);
    if (v && typeof v === "object") {
      if ("$exists" in v) return (value !== undefined) === v.$exists;
      if ("$nin" in v) return !v.$nin.includes(value);
    }
    return value === v;
  });
  const db = { collection(name: string) {
    // Actual publisher collection access is intercepted; vector/embedding-backed storage is forbidden.
    if (!Object.hasOwn(rows, name)) { forbidden++; throw new Error("forbidden vector/embedding collection: " + name); }
    return {
      find(filter: Row) {
        let max = Infinity;
        return { limit(n: number) { max = n; return this; }, async toArray() {
          const result = structuredClone(rows[name]!.filter(row => matches(row, filter)).slice(0, max));
          return name === "tree_index" && readHook ? readHook(result) : result;
        } };
      },
      async findOne(filter: Row) { return structuredClone(rows[name]!.find(row => matches(row, filter)) ?? null); },
      async insertOne(row: Row) {
        if (rows[name]!.some(r => r._id === row._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        rows[name]!.push(structuredClone(row)); return { acknowledged: true, insertedId: row._id };
      },
      async replaceOne(filter: Row, next: Row) {
        replacements++;
        if (replaceHook && !await replaceHook(next)) return { acknowledged: true, matchedCount: 0 };
        const i = rows[name]!.findIndex(row => matches(row, filter));
        if (i < 0) return { acknowledged: true, matchedCount: 0 };
        rows[name]![i] = structuredClone(next); return { acknowledged: true, matchedCount: 1 };
      },
      async updateOne(filter: Row, update: Row) {
        const row = rows[name]!.find(row => matches(row, filter)); if (!row) return { modifiedCount: 0 };
        for (const [path, value] of Object.entries(update.$set)) {
          const keys = path.split("."); let target = row;
          for (const key of keys.slice(0, -1)) target = target[key] ??= {};
          target[keys.at(-1)!] = structuredClone(value);
        }
        return { modifiedCount: 1 };
      },
    };
  } } as unknown as Pick<Db, "collection">;
  const index = createNativePassageIndex(db);
  return { rows, db, index, counts: () => ({ replacements, forbidden }),
    onReplace(hook?: typeof replaceHook) { replaceHook = hook; }, onRead(hook?: typeof readHook) { readHook = hook; } };
}
test("real producer indexes every page and UTF-16 passage; restart reads exact locators without vectors", async () => {
  const f = fixture(), c = candidate(); await f.index.indexCandidate(c);
  const locators = await createNativePassageIndex(f.db).listLocators("A", c);
  assert.ok(locators.length > 2); assert.equal(f.rows.tree_index!.length, 1);
  for (const page of c.document.pages) {
    let text = "";
    for (const locator of locators) {
      assert.equal(locator.kind, "document-page"); if (locator.kind !== "document-page" || locator.pageNumber !== page.pageNumber) continue;
      assert.equal(locator.documentSourceId, c.documentSourceId); assert.equal(locator.sourceId, c.sourceId);
      assert.equal(locator.headRevision, c.headRevision); assert.equal(locator.passage.start, text.length);
      const slice = page.text.slice(locator.passage.start, locator.passage.end);
      assert.equal(sha(slice), locator.passage.sha256); text += slice;
    }
    assert.equal(text, page.text);
  }
  const before = structuredClone(f.rows); await f.index.indexCandidate(c); assert.deepEqual(f.rows, before);
  assert.deepEqual(await f.index.listLocators("B", c), []); assert.equal(f.counts().forbidden, 0);
});
test("candidate CAS retries preserve unrelated branches and competing candidate branches", async () => {
  const f = fixture(), first = candidate(); await f.index.indexCandidate(first);
  const root = f.rows.tree_index![0]!;
  root.children.unshift({ node_id: "A/session:unrelated", level: "session", title: "Existing", summary: "Keep", children: [] });
  const unrelated = structuredClone(root.children[0]);
  let conflict = true;
  f.onReplace(async () => {
    if (!conflict) return true; conflict = false;
    f.rows.tree_index![0]!.indexRevision++;
    f.rows.tree_index![0]!.children.push({ node_id: "A/session:concurrent", level: "session", title: "Concurrent", summary: "Keep too", children: [] });
    return false;
  });
  const second = candidate({ documentId: "doc:2", documentSourceId: "bytes:2", revisionHash: "b".repeat(64), headRevision: 2 });
  second.document = { ...second.document, _id: second.documentId, sourceId: second.documentSourceId, version: second.revisionHash };
  await f.index.indexCandidate(second);
  assert.equal(f.counts().replacements, 2); assert.deepEqual(f.rows.tree_index![0]!.children[0], unrelated);
  assert.equal(f.rows.tree_index![0]!.children.length, 4);
  assert.ok((await f.index.listLocators("A", first)).length); assert.ok((await f.index.listLocators("A", second)).length);
  const changed = structuredClone(first); changed.document.pages[0]!.text = "forged same identity";
  await assert.rejects(f.index.indexCandidate(changed), /candidate_authority_conflict/);
});
test("bounded CAS exhaustion, malformed authority, incomplete readback and oversized roots fail closed", async () => {
  const f = fixture(), c = candidate(); await f.index.indexCandidate(c);
  f.onReplace(async () => false);
  await assert.rejects(f.index.indexCandidate(candidate({ headRevision: 2 })), /cas_exhausted/);
  assert.equal(f.counts().replacements, 4); f.onReplace();
  const invalid = candidate(); invalid.document.tenantId = "B";
  await assert.rejects(f.index.indexCandidate(invalid), /invalid_document/);
  f.rows.tree_index![0]!.summary = "x".repeat(8_000_001);
  await assert.rejects(f.index.listLocators("A", c), /invalid_root/);
  f.rows.tree_index![0]!.summary = "";
  f.onRead(rows => { const root = rows[0]; if (root && root.indexRevision >= 2) root.children.at(-1).children.pop(); return rows; });
  await assert.rejects(f.index.indexCandidate(candidate({ headRevision: 2 })), /readback_mismatch/);
  await assert.rejects(f.index.listLocators("A", c), /invalid_coverage|invalid_passage/);
  f.onRead(); f.rows.tree_index!.push({ ...structuredClone(f.rows.tree_index![0]), _id: "second-root" });
  await assert.rejects(f.index.listLocators("A", c), /ambiguous_root/);
  assert.equal(f.counts().forbidden, 0);
});
test("actual head publisher and resolver quarantine failed CAS and late timed-out index candidates", async () => {
  const f = fixture(), c = candidate(); let release!: () => void;
  let wait: Promise<void> | undefined;
  const head = createNativeDocumentHeadStore({ db: f.db, loadDocument: async (tenant, id) => tenant === "A" && id === c.documentId ? c.document : null,
    randomUUID: () => "logical", indexTimeoutMs: 10,
    async indexCandidate(input) { if (wait) await wait; await f.index.indexCandidate(input); } });
  const { sourceId } = await head.registerLogicalSource("A", { recordedBy: "human" });
  const publish = () => head.publish("A", { ...c, sourceId, expectedHeadRevision: null });
  wait = new Promise<void>(resolve => { release = resolve; });
  await assert.rejects(publish(), /index_timeout/); release(); await wait; await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await head.loadPublished("A", sourceId), null);
  const candidates = await f.index.listLocators("A", { sourceId, revisionHash: c.revisionHash });
  assert.ok(candidates.length > 0);
  assert.equal(await head.isCurrent("A", { ...c, sourceId }), false);
  wait = undefined; await publish();
  const resolver = createNativeEvidenceResolver({ async loadCurrent(tenant, locator) {
    const current = await head.loadPublished(tenant, locator.sourceId);
    if (!current || locator.kind !== "document-page") return null;
    const page = current.document.pages.find(p => p.pageNumber === locator.pageNumber); if (!page) return null;
    return { kind: "document-page", tenantId: tenant, sourceId, documentId: current.document._id,
      documentSourceId: current.document.sourceId, headRevision: current.head.headRevision, revisionHash: current.document.version,
      currentRevisionHash: current.head.currentRevisionHash, eligible: true, pageNumber: page.pageNumber, text: page.text };
  } });
  const resolved = await resolver.resolve("A", candidates[0]!); assert.ok(resolved);
  assert.ok(await resolver.revalidate("A", resolved));
  await head.tombstone("A", { sourceId, expectedHeadRevision: 1, status: "revoked" });
  assert.equal(await resolver.revalidate("A", resolved), null); assert.equal(f.counts().forbidden, 0);
});
test("competing actual head CAS retains both complete candidate branches but authorizes only the winner", async () => {
  const f = fixture(), first = candidate(), second = candidate();
  second.document = { ...second.document, _id: "doc:other", sourceId: "bytes:other", version: "b".repeat(64) };
  const docs = [first.document, second.document];
  let waiting = 0, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const indexed: NativeDocumentCandidate[] = [];
  const head = createNativeDocumentHeadStore({ db: f.db, randomUUID: () => "logical",
    async loadDocument(tenant, id) { return docs.find(doc => doc.tenantId === tenant && doc._id === id) ?? null; },
    async indexCandidate(input) {
      await f.index.indexCandidate(input); indexed.push(input);
      if (++waiting === 2) release(); await gate;
    } });
  const { sourceId } = await head.registerLogicalSource("A", { recordedBy: "human" });
  const results = await Promise.allSettled(docs.map(doc => head.publish("A", { sourceId, documentId: doc._id,
    documentSourceId: doc.sourceId, revisionHash: doc.version, expectedHeadRevision: null })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(f.rows.tree_index![0]!.children.length, 2);
  assert.deepEqual((await Promise.all(indexed.map(row => head.isCurrent("A", row)))).sort(), [false, true]);
  for (const row of indexed) assert.ok((await f.index.listLocators("A", row)).length);
  assert.equal(f.counts().forbidden, 0);
});
