import { test } from "node:test";
import assert from "node:assert/strict";
import { passageLexicalScorer, slices } from "./passage-lexical.js";

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
