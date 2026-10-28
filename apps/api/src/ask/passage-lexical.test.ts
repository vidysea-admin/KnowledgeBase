import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import { passageLexicalScorer, slices, treeLexicalIds } from "./passage-lexical.js";

test("label-free native passages retain Hindi combining marks and Hinglish tokens", () => {
  const rows = [{ text: "आवेदन प्रक्रिया अक्टूबर में शुरू होगी" }, { text: "scholarship ki deadline October hai" }];
  assert.ok(passageLexicalScorer("आवेदन", rows)(rows[0]!.text).textContribution > 0);
  assert.equal(passageLexicalScorer("आवेदन", rows)(rows[1]!.text).textContribution, 0);
  assert.ok(passageLexicalScorer("scholarship deadline", rows)(rows[1]!.text).textContribution > 0);
});

test("optional label contributes no invented speaker evidence", () => {
  const rows = [{ text: "Visa opens October" }, { text: "Forms close November", speakerRef: "advisor" }];
  const score = passageLexicalScorer("advisor", rows);
  assert.equal(score(rows[0]!.text).speakerContribution, 0);
  assert.ok(score(rows[1]!.text, "advisor").speakerContribution > 0);
});

test("English verb families preserve literal LED acronym and calendar-only year expansion", () => {
  const rows = [{ text: "They led the cohort of ’24" }, { text: "LED physics business news 24%" }];
  const score = passageLexicalScorer("lead cohort 2024", rows);
  assert.ok(score(rows[0]!.text).textContribution > 0);
  assert.equal(score(rows[1]!.text).textContribution, 0);
});

test("Unicode passage slices reconstruct exact text without splitting surrogate pairs", () => {
  const text = "आवेदन 😀 ".repeat(200), spans = slices(text);
  assert.equal(spans.map(span => text.slice(span.charStart, span.charEnd)).join(""), text);
  for (const span of spans) {
    assert.ok(Buffer.byteLength(text.slice(span.charStart, span.charEnd), "utf8") <= 1024);
    assert.ok(!/[\uD800-\uDBFF]$/.test(text.slice(span.charStart, span.charEnd)));
  }
});

test("treeLexicalIds ranks native passages and topics lexically, skips sessions/containers, honours the limit (no model call)", () => {
  const n = (node_id: string, level: TreeIndexNode["level"], title: string, summary: string, children: TreeIndexNode[] = []): TreeIndexNode => ({ node_id, level, title, summary, children });
  const tree = n("root", "tenant", "Tenant", "आवेदन everywhere", [
    n("s1", "session", "आवेदन session", "आवेदन आवेदन", []),
    n("src", "native-source", "Doc", "आवेदन", [n("p1", "native-passage", "Doc - page 1", "आवेदन प्रक्रिया अक्टूबर"), n("p2", "native-passage", "Doc - page 2", "unrelated fees")]),
    n("t1", "topic", "Scholarships", "scholarship deadline October"),
  ]);
  assert.deepEqual(treeLexicalIds("आवेदन", tree, 5), ["p1"]);
  assert.deepEqual(treeLexicalIds("scholarship deadline", tree, 5), ["t1"]);
  assert.deepEqual(treeLexicalIds("zzz nothing", tree, 5), []);
  assert.deepEqual(treeLexicalIds("october", tree, 1).length, 1);
});
