import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ClientSession, Db, TransactionOptions } from "mongodb";
import type { NativeSourceLocator, TreeIndexNode } from "@lkb/core";
import type { DocumentRow } from "../../knowledge/collections-store.js";
import { messagePublicationFixture } from "../../native-evidence/message-publication-fixture.js";
import { buildNativeProductionIntegrations } from "./native-production.js";
import { trustedTreeReads } from "./trusted-readers.js";

test("actual native tree read binds message authority to the outer view while later resolver checks stay fresh", async () => {
  const f = await messagePublicationFixture(["Scholarship closes Friday."]);
  const [candidate] = await f.wiring.repository.list("tenant-a"); assert.ok(candidate);
  assert.equal((await f.wiring.repository.decide("tenant-a", candidate._id, "approved", "reviewer")).result, "ok");
  let starts = 0, ends = 0; let active: ClientSession | undefined;
  const sessions: ClientSession[] = [];
  const db = new Proxy(f.db, { get(target, key) {
    if (key !== "client") return Reflect.get(target, key, target);
    return new Proxy(target.client, { get(client, member) {
      if (member !== "startSession") return Reflect.get(client, member, client);
      return () => {
        assert.equal(active, undefined, "native read must not start a nested authority transaction"); starts++;
        const raw = client.startSession();
        const session: ClientSession = new Proxy(raw, { get(current, method) {
          if (method === "withTransaction") return (run: () => Promise<unknown>, options: TransactionOptions) => current.withTransaction(async () => {
            assert.equal(active, undefined); active = session;
            try { return await run(); } finally { active = undefined; }
          }, options);
          if (method === "endSession") return async () => { ends++; await current.endSession(); };
          const value = Reflect.get(current, method, current); return typeof value === "function" ? value.bind(current) : value;
        } });
        sessions.push(session); return session;
      };
    } });
  } });
  const native = buildNativeProductionIntegrations(db);
  const originalResolve = native.resolver.resolve, bind = native.resolver.forReadView;
  let bindings = 0;
  native.resolver.forReadView = view => {
    bindings++; assert.equal("client" in view, false);
    const bound = bind(view); assert.notEqual(bound, native.resolver); assert.equal(bound.forReadView, undefined);
    return bound;
  };
  f.operations.length = 0;
  const tree = await trustedTreeReads(() => db, native.resolver).load("tenant-a"); assert.ok(tree);
  const stack: TreeIndexNode[] = [tree]; let locator: NativeSourceLocator | undefined;
  while (stack.length) { const node = stack.pop()!; if (node.level === "native-passage") locator = node.evidence!.sourceLocator as NativeSourceLocator; stack.push(...node.children); }
  assert.ok(locator); assert.equal(bindings, 1); assert.equal(starts, 1); assert.equal(ends, 1);
  const reads = f.operations.filter(o => o.operation === "find" || o.operation === "findOne");
  assert.ok(reads.length > 5); assert.ok(reads.every(o => o.session === sessions[0]), "all tree/approval/source/overlay reads use outer snapshot");
  assert.equal(native.resolver.resolve, originalResolve);
  const evidence = await native.resolver.resolve("tenant-a", locator); assert.equal(evidence?.quote, "Scholarship closes Friday.");
  assert.equal(starts, 2); assert.equal(ends, 2);
  await f.db.collection<{ _id: string; tenantId: string }>("sources").updateOne({ _id: f.result.sourceId, tenantId: "tenant-a" }, { $set: { "consent.given": false } });
  assert.ok(evidence); assert.equal(await native.resolver.revalidate("tenant-a", evidence), null);
  assert.equal(starts, 3); assert.equal(ends, 3); assert.equal(bindings, 1);
});

test("native read-view document getter stays tenant scoped on the supplied view without base DB fallback", async () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const text = "Visa guidance.", version = sha("document revision");
  const document: DocumentRow = { _id: "doc", tenantId: "A", sourceId: "bytes", version, title: "Current document", format: "pdf", createdAt: "2026-10-15T00:00:00Z", pages: [{ pageNumber: 1, text }], highlights: [] };
  const source = { _id: "logical", tenantId: "A", kind: "document", hash: "logical", consent: { given: true, recordedBy: "fixture" }, sourceMeta: { nativeDocumentHead: { documentId: "doc", currentRevisionHash: version, status: "published", headRevision: 1 } } };
  const calls: { name: string; filter: Record<string, unknown> }[] = [];
  const view = { collection(name: string) { return { async findOne(filter: Record<string, unknown>) {
    calls.push({ name, filter }); if (filter.tenantId !== "A") return null;
    return name === "sources" && filter._id === source._id ? structuredClone(source) : name === "document_documents" && filter._id === document._id ? structuredClone(document) : null;
  } }; } } as unknown as Pick<Db, "collection">;
  const handles: string[] = [], baseOperations: string[] = [];
  const native = buildNativeProductionIntegrations({ collection(name: string) {
    handles.push(name);
    // Construction may acquire handles; every operation must use the supplied read view.
    return new Proxy({}, { get(_target, operation) { return () => {
      baseOperations.push(`${name}.${String(operation)}`);
      throw new Error("base DB must not be read by read view");
    }; } });
  } } as unknown as Db);
  assert.ok(handles.length > 0); assert.deepEqual(baseOperations, []);
  const bound = native.resolver.forReadView(view);
  const locator: NativeSourceLocator = { kind: "document-page", sourceId: "logical", documentId: "doc", documentSourceId: "bytes", revisionHash: version, headRevision: 1, pageNumber: 1, passage: { start: 0, end: text.length, sha256: sha(text) } };
  assert.equal((await bound.resolve("A", locator))?.quote, text);
  assert.ok(calls.some(c => c.name === "document_documents" && c.filter._id === document._id)); assert.ok(calls.every(c => c.filter.tenantId === "A"));
  assert.equal(await bound.resolve("B", locator), null);
  assert.deepEqual(baseOperations, [], "bound resolution must never query base collection handles");
});
