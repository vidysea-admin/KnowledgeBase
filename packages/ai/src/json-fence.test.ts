import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonLoose } from "./json.js";

test("fenced JSON followed by prose commentary still parses (GLM judge replies, live 2026-10-19)", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"complete": false}\n```\n\nJudge notes: omitted items.'), { complete: false });
  assert.deepEqual(parseJsonLoose('Here:\n```\n[1,2]\n```'), [1, 2]);
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJsonLoose("no json here"), null);
});

test("unfenced JSON followed by prose, and prose before JSON, parse; unbalanced or non-JSON stays null", () => {
  assert.deepEqual(parseJsonLoose('{"complete": false, "s": "a } b"}\n\nNotes:\n- x {not json}'), { complete: false, s: "a } b" });
  assert.deepEqual(parseJsonLoose('Here you go: [1, {"a": [2]}] done'), [1, { a: [2] }]);
  assert.equal(parseJsonLoose('{"a": '), null);
  assert.equal(parseJsonLoose("just {words} here"), null);
});
