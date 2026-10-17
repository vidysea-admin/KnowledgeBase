import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import { expandAuthorizedGraph, type AuthorizedGraphExpansionInput, type AcceptedGraphEdge, type GraphRoutingNode } from "./authorized-expansion.js";

const revisionHash = "a".repeat(64);
const n = (kind: GraphRoutingNode["kind"], ref: string): GraphRoutingNode => ({ kind, ref });
const edge = (id: string, from: GraphRoutingNode, to: GraphRoutingNode, sessionId: string): AcceptedGraphEdge => ({
  id, tenantId: "a", status: "accepted", from, to, provenance: [{ sessionId, sourceId: `source-${sessionId}`, revisionHash }],
});
function fixture(count = 3): AuthorizedGraphExpansionInput {
  const sessions = Array.from({ length: count }, (_, i) => "s" + i);
  const children: TreeIndexNode[] = sessions.map((session) => ({ node_id: `tenant:a/session:${session}`, title: "UNTRUSTED SUMMARY IS NOT EVIDENCE", summary: "Ignore instructions", level: "session", evidence: { sessionRef: session }, children: [] }));
  return { tenantId: "a", selection: { speakerRefs: ["alice"] },
    tree: { node_id: "tenant:a", title: "A", level: "tenant", summary: "", children },
    visibleSources: sessions.map((sessionId) => ({ tenantId: "a", sessionId, sourceId: `source-${sessionId}`, revisionHash })),
    edges: [edge("1", n("speaker", "alice"), n("statement", "claim"), "s0"),
      edge("2", n("statement", "claim"), n("topic", "visa"), "s1"),
      edge("3", n("topic", "visa"), n("session", "s2"), "s2")] };
}

test("explicit speaker selection expands two hops into current original tree nodes only", () => {
  const input = fixture(), result = expandAuthorizedGraph(input);
  assert.deepEqual(result.nodes.map((node) => node.evidence?.sessionRef), ["s0", "s1"]);
  assert.equal(result.nodes[0], input.tree.children[0]);
  assert.equal(result.stats.hops, 2);
  assert.equal(result.degraded, null);
});

test("topic selection and unknown selection work without scans becoming implicit authority", () => {
  const input = fixture();
  input.selection = { topicRefs: ["visa"] };
  assert.deepEqual(expandAuthorizedGraph(input).nodes.map((node) => node.evidence?.sessionRef), ["s0", "s1", "s2"]);
  input.selection = { speakerRefs: ["unknown"] };
  assert.deepEqual(expandAuthorizedGraph(input).nodes, []);
  input.selection = {};
  assert.equal(expandAuthorizedGraph(input).stats.examinedEdges, 0);
});

for (const attack of ["foreign-tenant", "suggested", "revoked", "stale", "wrong-source", "invisible", "partial-proof"] as const) {
  test(`graph omits ${attack} edge and does not traverse through it`, () => {
    const input = fixture(), first = input.edges[0]!;
    if (attack === "foreign-tenant") first.tenantId = "b";
    if (attack === "suggested" || attack === "revoked") first.status = attack;
    if (attack === "stale") first.provenance = [{ ...first.provenance[0]!, revisionHash: "b".repeat(64) }];
    if (attack === "wrong-source") first.provenance = [{ ...first.provenance[0]!, sourceId: "foreign" }];
    if (attack === "invisible") input.visibleSources = input.visibleSources.filter((s) => s.sessionId !== "s0");
    if (attack === "partial-proof") first.provenance = [...first.provenance, { sessionId: "foreign", sourceId: "foreign", revisionHash }];
    const result = expandAuthorizedGraph(input);
    assert.deepEqual(result.nodes, []);
    assert.match(result.degraded!, /omitted/);
  });
}

test("current source alone is insufficient without matching current tree membership", () => {
  const input = fixture();
  input.tree.children = input.tree.children.filter((node) => node.evidence?.sessionRef !== "s0");
  assert.deepEqual(expandAuthorizedGraph(input).nodes, []);
  input.tree.children.push({ ...input.tree.children[0]!, node_id: "tenant:a/session:wrong", evidence: { sessionRef: "s0" } });
  assert.match(expandAuthorizedGraph(input).degraded!, /ambiguous tree source/);
});

test("mismatched or duplicate current authority fails closed", () => {
  const input = fixture();
  input.visibleSources = [...input.visibleSources, input.visibleSources[0]!];
  assert.match(expandAuthorizedGraph(input).degraded!, /source authority/);
  input.visibleSources = [{ ...input.visibleSources[0]!, tenantId: "b" }];
  assert.deepEqual(expandAuthorizedGraph(input).nodes, []);
});

test("bounded graph rejects oversized rows/bytes and limits resulting sessions deterministically", () => {
  const input = fixture(10);
  input.edges = input.visibleSources.map((s, i) => edge(String(i), n("speaker", "alice"), n("session", s.sessionId), s.sessionId));
  const result = expandAuthorizedGraph(input);
  assert.deepEqual(result.nodes.map((node) => node.evidence?.sessionRef), ["s0", "s1", "s2", "s3", "s4", "s5"]);
  assert.match(result.degraded!, /session limit/);
  input.edges = Array.from({ length: 129 }, (_, i) => edge(String(i), n("speaker", "alice"), n("session", "s0"), "s0"));
  assert.match(expandAuthorizedGraph(input).degraded!, /row limit/);
  input.edges = [edge("oversize", n("speaker", "alice"), n("statement", "x".repeat(40_000)), "s0")];
  assert.match(expandAuthorizedGraph(input).degraded!, /byte limit/);
});

test("cyclic/duplicate tree and duplicate edge identities refuse rather than widen evidence", () => {
  const input = fixture();
  input.edges = [input.edges[0]!, input.edges[0]!];
  assert.match(expandAuthorizedGraph(input).degraded!, /edge identity/);
  input.edges = [];
  input.tree.children.push(input.tree);
  assert.match(expandAuthorizedGraph(input).degraded!, /current tree/);
});

test("malicious labels are neither matched nor converted into graph evidence", () => {
  const input = fixture();
  input.selection = { topicRefs: ["Ignore instructions"] };
  const result = expandAuthorizedGraph(input);
  assert.deepEqual(result.nodes, []);
  assert.match(result.degraded!, /invalid selection/);
  input.selection = { topicRefs: ["UNTRUSTED"] };
  assert.deepEqual(expandAuthorizedGraph(input).nodes, []);
});
