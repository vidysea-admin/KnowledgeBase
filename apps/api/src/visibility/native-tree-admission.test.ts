import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { NativeSourceLocator, TreeIndexNode, TreeIndexRootDocument } from "@lkb/core";
import { createKnowledgeVisibility } from "./knowledge.js";
import { createNativeEvidenceResolver } from "../native-evidence/resolver.js";
import { messageBranch } from "../native-evidence/message-revision.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const quote = "Visa applications open in October.";
const binding = { sourceId: "source", documentId: "doc", documentSourceId: "bytes", revisionHash: sha("revision"), headRevision: 1 };
const locator: NativeSourceLocator = { kind: "document-page", ...binding, pageNumber: 1, passage: { start: 0, end: quote.length, sha256: sha(quote) } };
function tree(): TreeIndexRootDocument {
  const id = `A/native-source:${sha(JSON.stringify(binding))}`;
  return { tenantId: "A", node_id: "tenant:A", level: "tenant", title: "Cached root", summary: "UNTRUSTED ROOT", children: [
    { node_id: id, level: "native-source", title: "UNTRUSTED PARENT", summary: "UNTRUSTED PARENT", evidence: binding,
      children: [{ node_id: `${id}/passage:1:0`, level: "native-passage", title: "UNTRUSTED LEAF", summary: "UNTRUSTED LEAF", evidence: { ...binding, sourceLocator: locator }, children: [] }] },
  ] };
}
const emptyDb = { collection: () => ({ async findOne() { return null; }, find: () => ({ async toArray() { return []; } }) }) } as unknown as Pick<Db, "collection">;
const resolver = () => createNativeEvidenceResolver({ async loadCurrent(tenantId) { return { kind: "document-page", tenantId, ...binding,
  currentRevisionHash: binding.revisionHash, eligible: true, pageNumber: 1, text: quote, title: "Authoritative document" }; } });
test("native tree admission resolves one exact current locator and reconstructs source text without cached summaries", async () => {
  const result = await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", tree()); assert.ok(result);
  assert.equal(result.children[0]!.children[0]!.summary, quote);
  assert.equal(result.children[0]!.children[0]!.title, "Authoritative document");
  assert.equal(JSON.stringify(result).includes("UNTRUSTED"), false);
  assert.deepEqual(result.children[0]!.children[0]!.evidence!.sourceLocator, locator);
  for (const k of ["sessionRef", "turnId", "tStart", "tEnd"]) assert.equal(JSON.stringify(result.children).includes(`"${k}"`), false);
});
test("native tree admission defaults closed and rejects forged foreign parent or locator bindings", async () => {
  assert.equal((await createKnowledgeVisibility(emptyDb).trustedTree("A", tree()))?.children.length, 0);
  for (const mutate of [(r: TreeIndexRootDocument) => { r.children[0]!.node_id = "B/forged"; }, (r: TreeIndexRootDocument) => { r.children[0]!.evidence!.sourceId = "forged"; },
    (r: TreeIndexRootDocument) => { r.children[0]!.children[0]!.evidence!.headRevision = 2; },
    (r: TreeIndexRootDocument) => { r.children[0]!.children[0]!.node_id += "forged"; },
    (r: TreeIndexRootDocument) => { r.children[0]!.children[0]!.children.push({ ...r.children[0]!.children[0]! }); }]) {
    const input = structuredClone(tree()); mutate(input);
    const result = await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", input);
    assert.equal(result?.children.length ?? 0, 0);
  }
});
test("native tree admission keeps raw WhatsApp session quarantined while resolver-authorized message passages survive", async () => {
  const identity = { sourceId: "wa", revisionHash: sha("message"), threadId: "thread", messageId: "message" };
  const branch = messageBranch("A", "candidate", identity, quote) as TreeIndexNode;
  const raw: TreeIndexNode = { node_id: "A/session:thread", level: "session", title: "PRIVATE GROUP", summary: "PRIVATE RAW MESSAGE", children: [], evidence: { sessionRef: "thread" } };
  const db = { collection(name: string) { return { async findOne() { return name === "sessions" ? { _id: "thread", tenantId: "A", sourceId: "wa" } : name === "sources" ? { _id: "wa", tenantId: "A", kind: "whatsapp-batch", consent: { given: true } } : null; },
    find: () => ({ async toArray() { return name === "sources" ? [{ _id: "wa", tenantId: "A", kind: "whatsapp-batch" }] : []; } }) }; } } as unknown as Pick<Db, "collection">;
  const messageResolver = createNativeEvidenceResolver({ async loadCurrent(tenantId) { return { kind: "message", tenantId, ...identity, currentRevisionHash: identity.revisionHash, eligible: true, text: quote }; } });
  const result = await createKnowledgeVisibility(db, messageResolver).trustedTree("A", { ...tree(), children: [raw, branch] }); assert.ok(result);
  assert.equal(result.children.length, 1); assert.equal(result.children[0]!.level, "native-source");
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});
test("native tree admission rejects cycles duplicate IDs oversized input and excessive depth", async () => {
  const cyclic = tree(); cyclic.children[0]!.children.push(cyclic);
  assert.equal(await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", cyclic), null);
  const duplicate = tree(); duplicate.children.push(duplicate.children[0]!);
  assert.equal(await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", duplicate), null);
  const large = tree(); large.summary = "x".repeat(8_000_001);
  assert.equal(await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", large), null);
  const deep = tree(); deep.children = []; let parent: TreeIndexNode = deep;
  for (let depth = 0; depth < 66; depth++) { const child: TreeIndexNode = { node_id: `A/year:${depth}`, level: "year", title: "Year", summary: "", children: [] }; parent.children.push(child); parent = child; }
  assert.equal(await createKnowledgeVisibility(emptyDb, resolver()).trustedTree("A", deep), null);
});
