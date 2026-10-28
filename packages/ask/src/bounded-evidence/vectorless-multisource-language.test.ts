/** Unsupported native sources must never be answered from routing metadata.
 * Characterization only: positive document/message locator support remains absent.
 * All dependencies are offline; this does not certify mounted vector boundaries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TreeIndexNode } from "@lkb/core";
import { askV2 } from "../ask-v2.js";
import { BoundedAskError } from "../source-context.js";
import { fakeComplete, fakeTreeSearch, fakeWrite } from "../testUtils.js";

for (const fixture of [
  { kind: "document", query: "करियर सलाह", title: "करियर सलाह", metadata: "दस्तावेज़ में करियर सलाह है।" },
  { kind: "message", query: "admission kaise", title: "admission kaise", metadata: "admission kaise milega: message thread" },
]) {
  test(fixture.kind + " routing metadata is not answerable without supported source proof (" + fixture.query + ")", async () => {
    const node: TreeIndexNode = {
      node_id: "tenant:t/" + fixture.kind + ":native", title: fixture.title,
      level: "session", summary: fixture.metadata, children: [],
      evidence: { routingSummary: fixture.metadata },
    };
    const tree: TreeIndexNode = { node_id: "tenant:t", title: "Sources", level: "tenant", summary: "", children: [node] };
    const snapshot = createHash("sha256").update(fixture.metadata).digest("hex");
    const complete = fakeComplete({ json: { node_ids: [node.node_id] } });
    const write = fakeWrite();
    let scored = 0, hydrated = 0;
    await assert.rejects(askV2(fixture.query, tree, {
      tenantId: "t", complete, treeSearchFn: fakeTreeSearch, write,
      scoreFn: () => { scored++; throw new Error("unsupported source reached scoring"); },
      sourceContext: { hydrate: async (query, nodes) => {
        hydrated++;
        assert.equal(query, fixture.query);
        assert.deepEqual(nodes, [node], "real selection must reach the admitted original node");
        // The public hydrator cannot supply document/message proof through today's
        // transcript-only SourceQuote interface. Never invent speech fields or times.
        return { nodes: [{ ...node, evidence: { ...node.evidence, sourceSnapshotSHA256: snapshot } }],
          snapshotSHA256: snapshot, sourceBytes: Buffer.byteLength(fixture.metadata) };
      } },
    }), (error: unknown) => error instanceof BoundedAskError && error.reason === "missing source quote inventory");
    assert.equal(hydrated, 1);
    assert.equal(scored, 0);
    assert.deepEqual(complete.calls.map((job) => job.kind), ["ask.select_nodes"]);
    assert.ok(write.writes.some((job) => job.kind === "ask.source_context_refused"));
    assert.ok(!write.writes.some((job) => job.kind === "ask.answer"));
  });
}
