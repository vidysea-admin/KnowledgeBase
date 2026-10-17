/**
 * packages/ask/src/select-nodes.test.ts — T-005b C5. `selectNodes` parses a fake LLM's
 * `node_ids` response and returns the matching (full) tree nodes via the injected
 * `treeSearchFn` (production callers inject `@lkb/index`'s real `treeSearch`; `packages/ask`
 * cannot import `@lkb/index` itself — ARCHITECTURE §5 — so this test uses a same-shape fake).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { TreeIndexNode } from "@lkb/core";
import { fakeComplete, fakeTreeSearch } from "./testUtils.js";
import { selectNodes, parseNodeIds } from "./select-nodes.js";

const TREE: TreeIndexNode = {
  node_id: "tenant:t1",
  title: "t1",
  level: "tenant",
  summary: "",
  children: [
    { node_id: "tenant:t1/session:a", title: "A", level: "session", summary: "about apples", children: [] },
    { node_id: "tenant:t1/session:b", title: "B", level: "session", summary: "about bananas", children: [] },
  ],
};

test("selectNodes parses node_ids from the completion and resolves them via treeSearchFn", async () => {
  const complete = fakeComplete({ text: "", json: { node_ids: ["tenant:t1/session:a"] } });
  const nodes = await selectNodes("what about apples?", TREE, complete, fakeTreeSearch);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]!.node_id, "tenant:t1/session:a");
  assert.equal(nodes[0]!.summary, "about apples");

  assert.equal(complete.calls.length, 1);
  assert.match(complete.calls[0]!.messages[1]!.content, /what about apples\?/);
  assert.match(complete.calls[0]!.messages[1]!.content, /tenant:t1\/session:a \| "A" \| "about apples"/);
});

test("selectNodes falls back to parsing node_ids out of plain text JSON", async () => {
  const complete = fakeComplete({ text: '{"node_ids": ["tenant:t1/session:b"]}' });
  const nodes = await selectNodes("bananas", TREE, complete, fakeTreeSearch);
  assert.deepEqual(nodes.map((n) => n.node_id), ["tenant:t1/session:b"]);
});

test("selectNodes returns no nodes when the completion names none", async () => {
  const complete = fakeComplete({ text: "no idea" });
  const nodes = await selectNodes("nothing relevant", TREE, complete, fakeTreeSearch);
  assert.deepEqual(nodes, []);
});

test("parseNodeIds ignores non-string entries and non-array json", () => {
  assert.deepEqual(
    parseNodeIds({ text: "", json: { node_ids: ["a", 1, "b"] }, usage: { inputTokens: 0, outputTokens: 0 }, provider: "p", model: "m", costUsd: 0 }),
    ["a", "b"],
  );
  assert.deepEqual(
    parseNodeIds({ text: "", json: { nope: true }, usage: { inputTokens: 0, outputTokens: 0 }, provider: "p", model: "m", costUsd: 0 }),
    [],
  );
});
