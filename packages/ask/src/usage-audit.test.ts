import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompleteResult } from "@lkb/ai";
import { completionAudit } from "./usage-audit.js";
import { initAskGraphState } from "./ask-graph.js";

const result = (over: Partial<CompleteResult> = {}): CompleteResult => ({
  text: "ok", provider: "ollama-cloud", model: "fixture", usage: { inputTokens: 123, outputTokens: 17 }, ...over,
});

test("unknown price omits monetary field even when provider supplies a zero placeholder", () => {
  const audit = completionAudit("answer", result({ costUsd: 0, costStatus: "unknown" }));
  assert.equal(Object.hasOwn(audit, "costUsd"), false);
  assert.equal(audit.costStatus, "unknown");
  assert.equal(audit.inputTokens, 123); assert.equal(audit.outputTokens, 17);
  assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit);
});

test("reported free and positive calls survive while invalid prices are unknown", () => {
  for (const costUsd of [0, 0.123]) {
    assert.equal(completionAudit("answer", result({ costUsd, costStatus: "reported" })).costUsd, costUsd);
  }
  for (const costUsd of [undefined, NaN, Infinity, -1]) {
    const audit = completionAudit("answer", result({ costUsd, costStatus: "reported" }));
    assert.equal(audit.costStatus, "unknown"); assert.equal(Object.hasOwn(audit, "costUsd"), false);
  }
});

test("legacy finite audit shape remains compatible and invalid counts are omitted", () => {
  assert.deepEqual(completionAudit("answer", result({ costUsd: 0 })), {
    jobKind: "ask.answer", step: "answer", provider: "ollama-cloud", model: "fixture", costUsd: 0,
  });
  const audit = completionAudit("answer", result({ usage: { inputTokens: NaN, outputTokens: -1 } }));
  assert.equal(Object.hasOwn(audit, "inputTokens"), false); assert.equal(Object.hasOwn(audit, "outputTokens"), false);
});

test("Ask completion path emits persisted-safe unknown audit without changing result identity", async () => {
  const reply = result({ costStatus: "unknown" });
  const state = initAskGraphState("q", { node_id: "tenant:t", title: "t", level: "tenant", summary: "", children: [] }, {
    complete: async () => reply, scoreFn: async () => [0, "fixture"],
    treeSearchFn: () => [], write: async () => {}, tenantId: "t",
  });
  assert.equal(await state.loggingComplete("answer")({ kind: "ask.answer", messages: [] }), reply);
  assert.deepEqual(state.auditLog, [completionAudit("answer", reply)]);
});
