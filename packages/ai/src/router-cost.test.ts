import { test } from "node:test";
import assert from "node:assert/strict";
import { complete } from "./router.js";
import type { JobEntry } from "./jobs.js";

test("unknown cloud monetary cost stays absent while the attempt ledger preserves actual token usage", async () => {
  const entries: JobEntry[] = [];
  const result = await complete("ask", { kind: "ask", messages: [{ role: "user", content: "question" }] }, {
    chains: { ask: ["cloud"] }, tenantId: "tenant-a",
    providers: { cloud: { name: "cloud", listModels: async () => [], complete: async () => ({
      text: "answer", provider: "cloud", model: "model", costStatus: "unknown",
      usage: { inputTokens: 17, outputTokens: 8 },
    }) } },
    write: async entry => { entries.push(entry); },
  });
  assert.equal(result.costStatus, "unknown");
  assert.equal(entries.length, 1);
  assert.equal(Object.hasOwn(entries[0]!, "costUsd"), false);
  assert.equal(entries[0]!.costStatus, "unknown");
  assert.equal(entries[0]!.inputTokens, 17);
  assert.equal(entries[0]!.outputTokens, 8);
  assert.equal(entries[0]!.tenantId, "tenant-a");
});
