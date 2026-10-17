/**
 * packages/ai/src/routing-config.test.ts — T-019 C4. Tiny YAML-subset parser for
 * config/ai-routing.yaml's flat `key: [a, b, c]` shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { parseRoutingYaml } from "./routing-config.js";

test("parses a flat key: [a, b, c] document, skipping comments and blank lines", () => {
  const text = [
    "# comment",
    "",
    "transcribe: [gemini, ollama, claude-code]",
    "namemap: [gemini]",
  ].join("\n");
  assert.deepEqual(parseRoutingYaml(text), {
    transcribe: ["gemini", "ollama", "claude-code"],
    namemap: ["gemini"],
  });
});

test("handles an empty array and ignores malformed lines", () => {
  const text = "empty: []\nnot a valid line\nsummarize: [gemini, claude-code]";
  assert.deepEqual(parseRoutingYaml(text), { empty: [], summarize: ["gemini", "claude-code"] });
});

test("parses the real config/ai-routing.yaml with every jobKind an ordered array of length >= 1", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const text = readFileSync(join(root, "config", "ai-routing.yaml"), "utf8");
  const chains = parseRoutingYaml(text);

  const expectedKinds = ["transcribe", "namemap", "summarize", "claims", "tree-summary", "evaluator", "answer"];
  for (const kind of expectedKinds) {
    assert.ok(Array.isArray(chains[kind]) && chains[kind]!.length >= 1, `${kind} must be a non-empty array`);
  }
  // Current provider policy: Ollama Cloud first for text work; Gemini stays first only for
  // transcribe because Ollama has no audio model (supersedes the original Gemini-first D-005/D-008 expectation).
  assert.equal(chains["transcribe"]![0], "gemini", "transcribe must start with gemini (no Ollama audio model)");
  for (const kind of expectedKinds.filter(k => k !== "transcribe")) {
    assert.match(chains[kind]![0]!, /^ollama-cloud/, `${kind} must start with an ollama-cloud route`);
  }
});
