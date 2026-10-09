import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import { sourceCatalog, payloadBytes, completionBudget, SOURCE_LIMITS, validateHydration } from "./source-context.js";
import { boundedRefine, contextStrips, packContext, unpackContext } from "./bounded-refine.js";

const completion = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0,
  usage: { inputTokens: 1, outputTokens: 1 } });
test("complete 29-session metadata catalog excludes two MiB summaries and never mutates input", () => {
  const root: TreeIndexNode = { node_id: "tenant:toc", title: "TOC", level: "tenant", summary: "private ".repeat(300000),
    children: Array.from({ length: 29 }, (_, i) => ({ node_id: "session:" + i, title: "Session " + i, level: "session",
      summary: "private transcript " + i, children: [], evidence: { sessionRef: "s" + i } })) };
  const before = JSON.stringify(root);
  const catalog = sourceCatalog(root);
  assert.equal(catalog.children.length, 29);
  assert.ok(payloadBytes(catalog) < SOURCE_LIMITS.catalogBytes);
  assert.ok(!JSON.stringify(catalog).includes("private"));
  assert.equal(JSON.stringify(root), before);
  assert.deepEqual(catalog.children.map((n) => n.node_id), root.children.map((n) => n.node_id));
});
test("catalog refuses duplicate identity or complete over-budget metadata rather than dropping rows", () => {
  const child: TreeIndexNode = { node_id: "a", title: "A", level: "session", summary: "", children: [] };
  assert.throws(() => sourceCatalog({ ...child, children: [child] }), /duplicate/);
  assert.throws(() => sourceCatalog({ ...child, title: "字".repeat(30000) }), /budget/);
});
test("shared completion budget counts real dispatches and stays failed after caller catches quota refusal", async () => {
  let calls = 0;
  const budget = completionBudget(async () => { calls++; return completion({}); });
  for (let i = 0; i < 12; i++) await budget.complete({ kind: "evaluator", messages: [] });
  await assert.rejects(budget.complete({ kind: "ask.answer", messages: [] }), /budget/);
  assert.equal(calls, 12);
  assert.throws(budget.assertHealthy, /budget/);
});
test("UTF8 serialized job bytes and total-byte limit precede provider invocation", async () => {
  let calls = 0;
  const budget = completionBudget(async () => { calls++; return completion({}); });
  await assert.rejects(budget.complete({ kind: "ask", messages: [{ role: "user", content: "字".repeat(23000) }] }), /budget/);
  assert.equal(calls, 0);
  const total = completionBudget(async () => { calls++; return completion({}); });
  for (let i = 0; i < 4; i++) await total.complete({ kind: "ask", messages: [{ role: "user", content: "x".repeat(60000) }] });
  await assert.rejects(total.complete({ kind: "evaluator", messages: [{ role: "user", content: "x".repeat(30000) }] }), /budget/);
  assert.equal(calls, 4);
});
test("start deadline does not claim cancellation of an owned in-flight call", async () => {
  let now = 0, calls = 0;
  const budget = completionBudget(async () => { calls++; now = 300000; return completion({}); }, () => now);
  await budget.complete({ kind: "ask", messages: [] });
  await assert.rejects(budget.complete({ kind: "evaluator", messages: [] }), /deadline/);
  assert.equal(calls, 1);
});
test("full batched refine inventory is judged once per strip, with bounded calls and stable order", async () => {
  let calls = 0;
  const sources = Array.from({ length: 200 }, (_, i) => ({ id: "q" + i, origin: "speech", text: "A relevant sentence " + i + "." }));
  const result = await boundedRefine(sources, "sentence", async (job) => {
    calls++;
    const input = JSON.parse(job.messages[1]!.content) as { strips: { id: string }[] };
    return completion({ decisions: input.strips.map((s) => ({ id: s.id, keep: true })) });
  });
  assert.ok(calls > 1 && calls <= 3);
  assert.equal(JSON.parse(result).length, 200);
  assert.equal(JSON.parse(result)[199].sourceId, "q199");
});
for (const attack of ["unknown", "duplicate", "missing", "coerced"] as const) {
  test("refine refuses " + attack + " judgments", async () => {
    await assert.rejects(boundedRefine([{ id: "q1", origin: "speech", text: "One. Two." }], "one", async (job) => {
      const strips = JSON.parse(job.messages[1]!.content).strips as { id: string }[];
      const decisions: { id: string; keep: unknown }[] = strips.map((s) => ({ id: s.id, keep: true }));
      if (attack === "unknown") decisions[0]!.id = "ghost";
      if (attack === "duplicate") decisions[1]!.id = decisions[0]!.id;
      if (attack === "missing") decisions.pop();
      if (attack === "coerced") decisions[0]!.keep = ["true"];
      return completion({ decisions });
    }), /judgment/);
  });
}
test("source context refuses unknown hydrated nodes before they can reach scoring", () => {
  assert.throws(() => validateHydration({ nodes: [{ node_id: "foreign", title: "F", level: "session", summary: "", children: [] }],
    snapshotSHA256: "a".repeat(64), sourceBytes: 5 }, []), /admitted/);
});

test("packed strip dictionary roundtrips every ordered Unicode/origin/speaker/time field", () => {
  const sources = [{ id: "q-ocr", origin: "screen-ocr-unverified", text: "世界 😀. Literal OCR.",
    source: { speakerRef: "screen", sessionRef: "s", turnId: "s-t1", tStart: 1, tEnd: 9 } },
  { id: "q-speech", origin: "speech", text: "One. Two. Three.",
    source: { speakerRef: "spk:unknown", sessionRef: "s", turnId: "s-t2", tStart: 9, tEnd: 12 } }];
  const strips = contextStrips(sources), packed = packContext(strips);
  assert.deepEqual(unpackContext(packed), strips);
  assert.equal(packed.sources.length, 2);
  assert.equal(packed.strips.length, strips.length);
  assert.equal(unpackContext(packed)[0]!.text, "世界 😀.");
});
test("packed context refuses missing/duplicate references and conflicting source identities", () => {
  const strips = contextStrips([{ id: "q1", origin: "speech", text: "One. Two." }]);
  const packet = packContext(strips);
  assert.throws(() => unpackContext({ ...packet, sources: [] }), /reference/);
  assert.throws(() => unpackContext({ ...packet, sources: [...packet.sources, packet.sources[0]!] }), /identity/);
  assert.throws(() => unpackContext({ ...packet, strips: [packet.strips[0]!, packet.strips[0]!] }), /reference/);
  assert.throws(() => packContext([strips[0]!, { ...strips[1]!, origin: "visual-observation-unverified" }]), /conflicting/);
  for (const sourceIndex of [-1, 1.5, 9, "0", null]) {
    assert.throws(() => unpackContext({ ...packet, strips: [{ ...packet.strips[0]!, sourceIndex } as never] }), /reference/);
  }
  assert.throws(() => unpackContext({ ...packet, sources: [{ ...packet.sources[0]!, source: null } as never] }), /tuple/);
});

test("real-length IDs refine all 384 strips within three jobs and unchanged complete job caps", async (t) => {
  const sources = Array.from({ length: 6 }, (_, i) => ({ id: "quote-" + String(i).repeat(24), origin: "speech",
    text: Array.from({ length: 64 }, (_, j) => "Source " + i + " fact " + j + " is explicit.").join(" "),
    source: { speakerRef: "spk:unknown", sessionRef: "session-" + String(i).repeat(80),
      turnId: "turn-" + String(i).repeat(128), tStart: i, tEnd: i + 1 } }));
  const jobs: number[] = [], ids = new Set<string>();
  const budget = completionBudget(async (job) => {
    jobs.push(payloadBytes(job));
    const input = JSON.parse(job.messages[1]!.content);
    for (const strip of unpackContext({ sources: input.sources, strips: input.strips })) {
      assert.ok(!ids.has(strip.id)); ids.add(strip.id);
    }
    return completion({ decisions: input.strips.map((s: { id: string }) => ({ id: s.id, keep: true })) });
  });
  const kept = await boundedRefine(sources, "explicit", budget.complete);
  assert.deepEqual(JSON.parse(kept), contextStrips(sources));
  assert.equal(ids.size, 384);
  assert.ok(jobs.length <= 3 && jobs.every((size) => size <= 65536));
  t.diagnostic(JSON.stringify({ refineJobs: jobs.length, completeJobBytes: jobs, judgedStrips: ids.size }));
});
