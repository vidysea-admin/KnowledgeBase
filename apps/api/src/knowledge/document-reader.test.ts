import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createDocxRenderer } from "./document-reader.js";
test("missing DOCX binary is an explicitly unavailable capability; relative binary configuration refuses", () => {
  assert.equal(createDocxRenderer(undefined), undefined);
  assert.equal(createDocxRenderer(resolve(".cache", "goal-t055-no-such-renderer-8ab49.com")), undefined);
  assert.equal(createDocxRenderer("soffice"), undefined);
});
