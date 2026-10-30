/**
 * apps/api/src/route/bm25-router.test.ts - D-206 /route step A: BM25 over the tree's session/topic nodes + derived facets.
 * Deterministic, no LLM, no I/O. Includes the no-LLM latency target (<300 ms on a 110-topic tree).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import { bm25Scores, buildBm25, tokenize } from "./bm25.js";
import { facetsOf, queryFacetTokens } from "./facets.js";
import { buildRouteIndex, CONFIDENCE_MARGIN, routeStepA, topicCountryView } from "./bm25-router.js";
import { NATURAL_QUESTIONS, syntheticTree } from "./route.testsupport.js";

test("BM25: rare terms outrank common ones and length normalisation prefers the tighter document", () => {
  const ix = buildBm25([["visa", "germany"], ["visa", "visa", "canada", "x", "x", "x", "x", "x", "x", "x"], ["canada"], ["rent"]]);
  const s = bm25Scores(ix, ["germany", "visa"]);
  assert.ok(s[0]! > s[1]! && s[1]! > 0 && s[2] === 0 && s[3] === 0);
});

test("tokenizer drops question stopwords, keeps short content tokens such as uk, folds plurals", () => {
  assert.deepEqual(tokenize("What are the IELTS requirements for UK masters?"), ["ielt", "requirement", "uk", "master"]);
});

test("facets: Toronto implies Canada, cost implies the cost axis, university names become facets", () => {
  assert.deepEqual(queryFacetTokens("cost of living in Toronto").sort(), ["fa:cost", "fc:canada"]);
  const f = facetsOf("UniAccess Live: Xavier University and the University of California admissions deadline");
  assert.ok(f.universities.includes("xavier-university") && f.universities.includes("university-of-california"));
  assert.ok(f.axes.includes("admissions"));
});

for (const { q, session } of NATURAL_QUESTIONS) {
  test(`step A routes "${q}" to ${session} first, deterministically`, () => {
    const index = buildRouteIndex(syntheticTree(), "toc");
    const a = routeStepA(index, q);
    assert.equal(a.sessions[0]?.sessionId, session);
    assert.deepEqual(routeStepA(index, q).sessions, a.sessions);
  });
}

test("no-LLM path: index build + step A over 22 sessions / 110 topics stays far under 300 ms", () => {
  const tree = syntheticTree();
  const t0 = performance.now();
  const index = buildRouteIndex(tree, "toc");
  const build = performance.now() - t0;
  assert.equal(index.docs.filter((d) => d.level === "topic").length, 110);
  const timings = NATURAL_QUESTIONS.map(({ q }) => { const t = performance.now(); routeStepA(index, q); return performance.now() - t; });
  assert.ok(build < 300, `index build ${build}ms`);
  assert.ok(Math.max(...timings) < 300, `step A ${timings.join(",")}ms`);
});

test("confidence: a clear top-3 is confident, a query with no lexical match is not", () => {
  const index = buildRouteIndex(syntheticTree(), "toc");
  assert.equal(routeStepA(index, "visa requirements for Germany").confident, true);
  const none = routeStepA(index, "campus orientation guidance");
  assert.equal(none.confident, false);
  assert.equal(none.sessions.length, 0);
});

test("topic/country view is derived from node text only", () => {
  const view = topicCountryView(buildRouteIndex(syntheticTree(), "toc"));
  assert.ok(view.canada!.length >= 5 && view.germany!.length >= 3);
});

test("a tree carrying another tenant's marker, a cycle-sized tree, or native branches is handled safely", () => {
  const tree = syntheticTree();
  assert.throws(() => buildRouteIndex({ ...tree, tenantId: "other" } as TreeIndexNode, "toc"), /tenant mismatch/);
  const withNative = { ...tree, children: [...tree.children, { node_id: "toc/native:1", title: "Secret Native Doc", level: "native-source", summary: "visa germany secret", children: [
    { node_id: "toc/native:1/p", title: "p", level: "native-passage", summary: "germany", children: [] }] }] } as TreeIndexNode;
  const ix = buildRouteIndex(withNative, "toc");
  assert.ok(!ix.docs.some((d) => d.nodeId.includes("native")), "native branches are not routed as transcript sessions");
});

// ISS-417: pin CONFIDENCE_MARGIN. The 3rd kept session vs the best one left out: a tie and a near-tie are NOT confident,
// 1.259 (just over 1.25) is. Measured margins for the tree below: 1.000 / 1.211 / 1.259 (padding = filler words in the summary).
function marginTree(padThird: number, padFourth: number): TreeIndexNode {
  const text = (n: number) => "zebra " + "filler ".repeat(n);
  const sums = [text(0), text(0), text(padThird), text(padFourth), text(20)];
  return { node_id: "tenant:t", tenantId: "t", title: "t", level: "tenant", summary: "", children: sums.map((summary, i) => ({
    node_id: `t/s${i}`, title: `Session ${i}`, level: "session", summary, evidence: { sessionRef: `s${i}` }, children: [] })) } as TreeIndexNode;
}
const stepA = (a: number, b: number) => routeStepA(buildRouteIndex(marginTree(a, b), "t"), "zebra");

test("ISS-417 confidence margin: the constant is 1.25", () => { assert.equal(CONFIDENCE_MARGIN, 1.25); });
test("ISS-417 confidence margin: an exact tie between the 3rd kept and the 4th session is not confident (margin 1.0)", () => {
  const a = stepA(3, 3);
  assert.ok(Math.abs(a.margin - 1) < 1e-9 && a.confident === false);
});
test("ISS-417 confidence margin: a near-tie just UNDER 1.25 is not confident", () => {
  const a = stepA(3, 7);
  assert.ok(a.margin > 1.2 && a.margin < 1.25, `margin ${a.margin}`);
  assert.equal(a.confident, false);
});
test("ISS-417 confidence margin: just OVER 1.25 is confident", () => {
  const a = stepA(3, 8);
  assert.ok(a.margin > 1.25 && a.margin < 1.3, `margin ${a.margin}`);
  assert.equal(a.confident, true);
});
test("ISS-417 confidence margin: nothing left out (fewer than 4 matching sessions) is confident", () => {
  const index = buildRouteIndex({ ...marginTree(0, 0), children: marginTree(0, 0).children.slice(0, 3) } as TreeIndexNode, "t");
  const a = routeStepA(index, "zebra");
  assert.equal(a.margin, Infinity); assert.equal(a.confident, true);
});
