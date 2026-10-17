import assert from "node:assert/strict";
import { test } from "node:test";
import { createKnowledgeVisibility } from "../../../apps/api/src/visibility/knowledge.js";

// Independent minimal read capability: current source associations, no approval and no writers.
function guard() {
  const rows: Record<string, Record<string, unknown>[]> = {
    sources: [{ _id: "doc", tenantId: "checker", kind: "document" }, { _id: "wa", tenantId: "checker", kind: "whatsapp-batch", path: "group" }],
    sessions: [{ _id: "doc-session", tenantId: "checker", sourceId: "doc" }, { _id: "wa-session", tenantId: "checker", sourceId: "wa" }],
    whatsapp_candidates: [], claims: [],
  };
  const calls: Record<string, unknown>[] = [];
  const matching = (name: string, filter: Record<string, unknown>) => { calls.push(filter); return (rows[name] ?? []).filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)); };
  const db = { collection(name: string) { return { async findOne(filter: Record<string, unknown>) { return structuredClone(matching(name, filter)[0] ?? null); }, find(filter: Record<string, unknown>) { return { async toArray() { return structuredClone(matching(name, filter)); } }; } }; } };
  return { visibility: createKnowledgeVisibility(db as never), calls };
}
const node = (id: string, level: string, summary: string, children: unknown[], sessionRef?: string) => ({ node_id: `checker/${id}`, level, title: summary || id, summary, children,
  ...(sessionRef ? { evidence: { sessionRef } } : {}) });
const root = (children: unknown[]) => ({ node_id: "tenant:checker", tenantId: "checker", level: "tenant", title: "Root cached mixed text", summary: "Root cached mixed text", children });

test("independent C9: pruning an unapproved WhatsApp child invalidates a direct nonWhatsApp parent's cached summary and title", async () => {
  const f = guard(), secret = "UNAPPROVED DIRECT PARENT SECRET";
  const child = node("wa-child", "session", secret, [], "wa-session");
  const tree = root([node("doc-parent", "session", secret, [child], "doc-session")]);
  const before = JSON.stringify(tree), result = await f.visibility.trustedTree("checker", tree as never);
  assert.ok(result); assert.ok(!JSON.stringify(result).includes(secret), "Removed WhatsApp child leaked through direct parent's cached text");
  assert.equal(JSON.stringify(tree), before); assert.ok(f.calls.every(call => call.tenantId === "checker"));
});

test("independent C9: unsafe descendants taint all cached ancestors even when immediate child counts remain equal", async () => {
  const f = guard(), secret = "UNAPPROVED DESCENDANT SECRET";
  const child = node("wa-child", "session", secret, [], "wa-session");
  const nested = node("nested-topic", "topic", secret, [child]);
  const tree = root([node("doc-parent", "session", secret, [nested], "doc-session")]);
  const result = await f.visibility.trustedTree("checker", tree as never);
  assert.ok(result); assert.ok(!JSON.stringify(result).includes(secret), "Unsafe descendant survived through inherited/direct ancestor summaries");
});

test("independent unaffected evidence: properly associated nonWhatsApp parent retains its safe text", async () => {
  const f = guard(), safe = "VERIFIED DOCUMENT SUMMARY";
  const result = await f.visibility.trustedTree("checker", root([node("doc", "session", safe, [], "doc-session")]) as never);
  assert.ok(JSON.stringify(result).includes(safe));
});
