import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { SessionPages, Sessions, TreeIndexNode } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { buildTopicIndex } from "./topic-indexing.js";
import { buildTree } from "./build.js";
import { regenerate } from "./regenerate.js";
import { promoteTreeEntities } from "./promote-entities.js";
import { treeSearch } from "./search.js";

const session = (id: string, tenantId = "a", date = "2026-01-01"): Sessions => ({
  _id: id, tenantId, date, sourceId: `source-${id}`, title: id,
  status: { transcribe: "done", index: "done" },
});
const page = (id: string, tenantId = "a", summary = "Student Visa in New Zealand."): SessionPages => ({
  _id: `page-${id}`, tenantId, sessionId: id, summary, evidence: [{ sessionId: id, turnId: "t1" }],
});
const result = (json: unknown): CompleteResult => ({ text: "", json, provider: "injected", model: "test",
  usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 });
const names = (root: TreeIndexNode) => promoteTreeEntities(root).topics.map((topic) => topic.name);

test("off uses the same regex build and regeneration without inference", async () => {
  const sessions = [session("s1"), session("s2", "a", "2025-01-01")];
  const pages = sessions.map((s) => page(s._id));
  const never = async () => { throw new Error("model must not run"); };
  const initial = await buildTopicIndex("a", sessions, pages, never, { enabled: false });
  assert.deepEqual(initial.root, buildTree(sessions, pages).a);
  assert.equal(initial.results.size, 0);
  const updated = await buildTopicIndex("a", sessions, pages, never,
    { enabled: false, existingRoot: initial.root!, changedSessionIds: ["s1"] });
  assert.deepEqual(updated.root, regenerate(initial.root!, ["s1"], sessions, pages));
  assert.equal(updated.root!.children.find((n) => n.title === "2025"), initial.root!.children.find((n) => n.title === "2025"));
});

test("tenant and session selection precede inference even for colliding foreign session ids", async () => {
  const seen: string[] = [];
  const output = await buildTopicIndex("a", [session("same", "b"), session("same")],
    [page("same", "b", "FOREIGN SECRET"), page("orphan", "a", "ORPHAN SECRET"), page("same")],
    async (job) => { seen.push(job.messages[1]!.content); return result(["Student Visa"]); }, { enabled: true });
  assert.deepEqual(seen, ["Student Visa in New Zealand."]);
  assert.equal(output.results.size, 1);
  assert.deepEqual(names(output.root!), ["Student Visa"]);
  assert.ok(!JSON.stringify(output.root).includes("SECRET"));
});

test("enabled regeneration refreshes all years and promotes shared model topics", async () => {
  const sessions = [session("old", "a", "2025-01-01"), session("new")];
  const pages = sessions.map((s) => page(s._id));
  const existingRoot = buildTree(sessions, pages).a!;
  let calls = 0;
  const output = await buildTopicIndex("a", sessions, pages, async () => { calls++; return result(["Student Visa"]); },
    { enabled: true, existingRoot, changedSessionIds: ["new"] });
  assert.equal(calls, 2);
  assert.deepEqual(promoteTreeEntities(output.root!).topics, [{ _id: "student-visa", name: "Student Visa", sessionRefs: ["new", "old"] }]);
  assert.notEqual(output.root!.children.find((n) => n.title === "2025"), existingRoot.children.find((n) => n.title === "2025"));
});

test("each degraded page continues through build and promotion with its regex topics", async () => {
  const sessions = [session("s")], pages = [page("s")];
  for (const [expected, complete] of [
    ["error", async () => { throw new Error("provider failed"); }],
    ["timeout", () => new Promise<CompleteResult>(() => {})],
    ["invalid-output", async () => result({ topics: [] })],
    ["ungrounded", async () => result(["Unmentioned Topic"])],
  ] as const) {
    const output = await buildTopicIndex("a", sessions, pages, complete, { enabled: true, timeoutMs: 10 });
    assert.deepEqual(output.root, buildTree(sessions, pages).a);
    assert.equal([...output.results.values()][0]!.degraded!.reason, expected);
  }
  const empty = await buildTopicIndex("a", sessions, pages, async () => result([]), { enabled: true });
  assert.deepEqual(names(empty.root!), []);
  assert.equal([...empty.results.values()][0]!.degraded, null);
});

test("foreign root, nested foreign identity and unresolvable evidence refuse before inference", async () => {
  const base = buildTree([session("s")], [page("s")]).a!;
  const roots = [buildTree([session("s", "b")], [page("s", "b")]).b!,
    { ...base, tenantId: "b" },
    { ...base, children: [{ ...base.children[0]!, node_id: "b/year:2026" }] },
    { ...base, children: [{ ...base.children[0]!, tenantId: "b" }] },
    { ...base, evidence: { sessionRefs: ["foreign-session"] } },
    { ...base, children: [{ ...base.children[0]!, level: "topic" as const, node_id: "a/session:foreign/topic:x" }] },
    { ...base, children: [{ ...base.children[0]!, level: "session" as const, node_id: "a/session:foreign" }] }];
  let calls = 0;
  for (const existingRoot of roots) {
    await assert.rejects(buildTopicIndex("a", [session("s")], [page("s")], async () => { calls++; return result([]); },
      { enabled: true, existingRoot }), /topic index:/);
  }
  assert.equal(calls, 0);
});

test("duplicate scoped identities refuse and missing pages do not call the provider", async () => {
  const never = async () => { throw new Error("must not infer"); };
  await assert.rejects(buildTopicIndex("a", [session("s"), session("s")], [page("s")], never, { enabled: true }), /duplicate/);
  await assert.rejects(buildTopicIndex("a", [session("s")], [page("s"), { ...page("s"), _id: "other" }], never, { enabled: true }), /ambiguous/);
  await assert.rejects(buildTopicIndex("a", [session("s"), session("z")], [page("s"), { ...page("z"), _id: "page-s" }], never,
    { enabled: true }), /duplicate page/);
  const absent = await buildTopicIndex("a", [session("s")], [], never, { enabled: true });
  assert.deepEqual(names(absent.root!), []);
  assert.equal(absent.results.size, 0);
  assert.equal((await buildTopicIndex("a", [], [page("s")], never, { enabled: true })).root, undefined);
});

test("source-bound migrated sample reaches actual tree regeneration and search consumers", async () => {
  const base = new URL("../../../../data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/", import.meta.url);
  const sessionBytes = readFileSync(new URL("session.json", base));
  const pageBytes = readFileSync(new URL("session_page.json", base));
  const sampleSession = JSON.parse(sessionBytes.toString()) as Sessions;
  const samplePage: SessionPages = { ...JSON.parse(pageBytes.toString()), _id: "u23-source-bound-sample", tenantId: sampleSession.tenantId, sessionId: sampleSession._id };
  const selected = "International Business School";
  const complete = async () => result([selected]); // injected mechanism proof, never semantic gold.
  const built = await buildTopicIndex("toc", [sampleSession], [samplePage], complete, { enabled: true });
  const rebuilt = await buildTopicIndex("toc", [sampleSession], [samplePage], complete,
    { enabled: true, existingRoot: built.root!, changedSessionIds: [sampleSession._id] });
  assert.deepEqual(rebuilt.root, built.root);
  assert.deepEqual(names(rebuilt.root!), [selected]);
  const topicId = `toc/year:2026/month:09/session:${sampleSession._id}/topic:international-business-school`;
  assert.equal(treeSearch(rebuilt.root!, [topicId])[0]!.title, selected);
  console.log("U2.3 sample SHA256 session=" + createHash("sha256").update(sessionBytes).digest("hex") +
    " page=" + createHash("sha256").update(pageBytes).digest("hex"));
});
