import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contextStrips, packContext, unpackContext, type ContextSource } from "./bounded-refine.js";
import type { TreeIndexNode } from "@lkb/core";
import { askV2 } from "./ask-v2.js";
import { fakeComplete, fakeTreeSearch, fakeWrite } from "./testUtils.js";
import { BoundedAskError, type NativeSourceLocator } from "./source-context.js";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
for (const kind of ["document-page", "message"] as const) {
  const text = kind === "document-page" ? "करियर की सलाह यहाँ है।" : "admission ka form yahan hai.";
  const sourceLocator: NativeSourceLocator = { sourceId: "s-native", revisionHash: sha("revision"),
    passage: { start: 0, end: text.length, sha256: sha(text) },
    ...(kind === "document-page" ? { kind, documentId: "doc-1", documentSourceId: "immutable-document-source", headRevision: 1, pageNumber: 3 } : { kind, threadId: "thread-1", messageId: "message-1" }) };
  const source: ContextSource = { id: "q-native", text, origin: kind, source: { sourceLocator } };
  test(kind + " exact native locator survives the real context dictionary", () => {
    const strips = contextStrips([source]);
    const restored = unpackContext(packContext(strips));
    assert.deepEqual(restored, strips);
    assert.deepEqual(restored[0]!.source, { sourceLocator });
    assert.ok(!JSON.stringify(restored).includes("tStart"));
    assert.ok(!JSON.stringify(restored).includes("sessionRef"));
  });
  test(kind + " packed native identity refuses invented transcript times", () => {
    const packed = packContext(contextStrips([source]));
    Object.assign(packed.sources[0]!.source!, { tStart: 0, tEnd: 0 });
    assert.throws(() => unpackContext(packed), BoundedAskError);
  });
  test(kind + " packed native identity refuses a changed origin", () => {
    const packed = packContext(contextStrips([source]));
    packed.sources[0]!.origin = "speech";
    assert.throws(() => unpackContext(packed), BoundedAskError);
  });
  async function runNative(mode: "current" | "missing" | "changed-before" | "deleted-after") {
    const node: TreeIndexNode = { node_id: "native", title: text, level: "session", summary: "ROUTING ONLY", children: [],
      evidence: { sourceId: sourceLocator.sourceId, revisionHash: sourceLocator.revisionHash } };
    const tree: TreeIndexNode = { node_id: "tenant:t", title: "T", level: "tenant", summary: "", children: [node] };
    const proof = { id: source.id, nodeId: node.node_id, quote: text, origin: kind, sourceLocator };
    const complete = fakeComplete((job) => {
      if (job.kind === "ask.select_nodes") return { json: { node_ids: [node.node_id] } };
      if (job.kind === "ask.answer") {
        const input = JSON.parse(job.messages[1]!.content);
        const restored = unpackContext(input.context);
        assert.deepEqual(restored[0]!.source, { sourceLocator });
        return { json: { sentences: [{ text, sourceIds: [source.id] }] } };
      }
      if (job.kind === "ask.answer_grounding") return { json: { decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] } };
      throw new Error("unexpected completion " + job.kind);
    });
    const write = fakeWrite();
    let checks = 0;
    const pending = askV2(text, tree, { tenantId: "t", complete, write, treeSearchFn: fakeTreeSearch,
      scoreFn: () => [0.9, "offline fixture scorer"],
      sourceContext: { hydrate: async () => ({ snapshotSHA256: sha("snapshot"), sourceBytes: Buffer.byteLength(text),
        nodes: [{ ...node, summary: JSON.stringify([proof]), evidence: { ...node.evidence,
          sourceSnapshotSHA256: sha("snapshot"), sourceQuotes: [proof] } }] }),
        ...(mode === "missing" ? {} : { revalidate: async (nodes: TreeIndexNode[]) => {
          checks++;
          assert.deepEqual(nodes.map((n) => n.node_id), [node.node_id]);
          if (mode === "changed-before" || mode === "deleted-after" && checks === 2) throw new BoundedAskError("canonical source changed or deleted");
        } }),
      },
    });
    return { pending, complete, write, checks: () => checks };
  }
  test(kind + " native evidence reaches grounded Ask with exact locator and two authority checks", async () => {
    const run = await runNative("current");
    const result = await run.pending;
    assert.equal(result.answer, text);
    assert.equal(run.checks(), 2);
    assert.deepEqual(result.sources.internal[0]!.evidence!.sourceQuotes, [{ id: source.id, nodeId: "native", quote: text, origin: kind, sourceLocator }]);
    assert.deepEqual(run.complete.calls.map((j) => j.kind), ["ask.select_nodes", "ask.answer", "ask.answer_grounding"]);
  });
  for (const mode of ["missing", "changed-before", "deleted-after"] as const) {
    test(kind + " native Ask refuses " + mode + " canonical authority", async () => {
      const run = await runNative(mode);
      await assert.rejects(run.pending, BoundedAskError);
      assert.equal(run.complete.calls.filter((j) => j.kind === "ask.answer").length, mode === "deleted-after" ? 1 : 0);
      assert.equal(run.complete.calls.filter((j) => j.kind === "ask.answer_grounding").length, mode === "deleted-after" ? 1 : 0);
      assert.ok(run.write.writes.some((j) => j.kind === "ask.source_context_refused"));
    });
  }

}
