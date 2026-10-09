import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Db } from "mongodb";
import type { TreeIndexNode, Turns } from "@lkb/core";
import { askV2, completionBudget, BoundedAskError, validateHydration, type CompleteFn } from "@lkb/ask";
import { createSourceHydrator, createSourceRequestDepsFor } from "./source-context.js";
import { createLlmScorer } from "../score.js";
import { unpackContext } from "../../../../packages/ask/src/bounded-refine.js";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const source = (text = "Visa forms open in October.", fields: Partial<Turns> = {}): Turns =>
  ({ _id: "s-t1", tenantId: "toc", sessionId: "s", speakerRef: "spk:0", tStart: 12, tEnd: 20, text, ...fields });
const node: TreeIndexNode = { node_id: "tenant:toc/session:s", title: "Visa forms", level: "session", summary: "PRIVATE".repeat(350000),
  evidence: { sessionRef: "s" }, children: [] };
function fakeDb(rows: { turns?: Turns[]; chunks?: unknown[] }, enforce = true) {
  const filters: { name: string; filter: Record<string, unknown> }[] = [];
  const db = { collection: (name: string) => ({ find: (filter: Record<string, unknown>) => ({
    toArray: async () => {
      filters.push({ name, filter });
      const data = name === "turns" ? rows.turns ?? [] : rows.chunks ?? [];
      return data.filter((row) => {
        const r = row as { tenantId: string; sessionId?: string; sourceRef?: string };
        if (!enforce) return true;
        if (r.tenantId !== filter.tenantId) return false;
        const key = name === "turns" ? "sessionId" : "sourceRef";
        const ids = (filter[key] as { $in?: string[] } | undefined)?.$in;
        return !ids || ids.includes(r[key]!);
      });
    },
  }) }) } as unknown as Pick<Db, "collection">;
  return { db, filters };
}
function completion(json: unknown) { return { text: JSON.stringify(json), json, provider: "offline", model: "fixture",
  costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } }; }
test("trusted hydrator reads scoped exact sessions, preserves literal speech and unknown speaker labels", async () => {
  const { db, filters } = fakeDb({ turns: [source(), source("FOREIGN", { tenantId: "other" })] });
  const input = structuredClone(node);
  const result = await createSourceHydrator("toc", { db })("visa October", [input]);
  const actual = validateHydration(result, [input]);
  const quotes = actual[0]!.evidence!.sourceQuotes as { quote: string; speakerRef: string; tStart: number }[];
  assert.equal(quotes[0]!.quote, source().text);
  assert.equal(quotes[0]!.speakerRef, "spk:0");
  assert.equal(quotes[0]!.tStart, 12);
  assert.ok(!JSON.stringify(actual).includes("PRIVATE"));
  assert.equal(input.summary, node.summary);
  assert.deepEqual(filters[0]!.filter, { sessionId: { $in: ["s"] }, tenantId: "toc" });
});
test("all 23 original + six additional dated sources can hydrate genuine scoped corpus text", async () => {
  const corpus = fileURLToPath(new URL("../../../../data/toc-migrated/", import.meta.url));
  const ids = readdirSync(corpus).filter((id) => /^\d{4}-\d\d-\d\d-/.test(id)).sort();
  assert.equal(ids.length, 29);
  assert.equal(ids.filter((id) => id.startsWith("2026-09")).length, 6);
  let retained = 0;
  for (const id of ids) {
    const rows = (JSON.parse(readFileSync(join(corpus, id, "turns.json"), "utf8")) as Turns[])
      .filter((t) => t.tStart >= 0 && t.tEnd >= t.tStart);
    retained += rows.length;
    const session = JSON.parse(readFileSync(join(corpus, id, "session.json"), "utf8")) as { title: string };
    const n: TreeIndexNode = { ...node, node_id: "tenant:toc/session:" + id, title: session.title, evidence: { sessionRef: id } };
    const { db } = fakeDb({ turns: rows });
    const informative = rows.find((t) => t.text.length > 80)!;
    const query = informative.text.split(/\W+/).filter((w) => w.length > 4).slice(0, 6).join(" ");
    const proof = await createSourceHydrator("toc", { db })(query, [n]);
    const hydrated = validateHydration(proof, [n]);
    assert.equal(hydrated.length, 1, id + " unavailable");
    for (const q of hydrated[0]!.evidence!.sourceQuotes as { turnId: string; quote: string; charStart: number; charEnd: number }[]) {
      const turn = rows.find((t) => t._id === q.turnId)!;
      assert.equal(turn.text.slice(q.charStart, q.charEnd), q.quote, id);
    }
  }
  assert.equal(retained, 3424);
});
test("large individual turn hydrates a late exact Unicode span without fabricated sub-turn times", async () => {
  const text = "A long introduction. ".repeat(400) + "The rare Atlas capstone uses an industry jury. 世界 😀";
  const turn = source(text, { tStart: 100, tEnd: 900 });
  const { db } = fakeDb({ turns: [turn] });
  const proof = await createSourceHydrator("toc", { db })("rare Atlas capstone industry jury", [node]);
  const qs = proof.nodes[0]!.evidence!.sourceQuotes as { quote: string; charStart: number; byteStart: number; tStart: number; tEnd: number }[];
  assert.ok(qs.some((q) => q.quote.includes("industry jury")));
  const late = qs.find((q) => q.quote.includes("industry jury"))!;
  assert.ok(late.charStart > 5000);
  assert.equal(late.byteStart, Buffer.byteLength(text.slice(0, late.charStart)));
  assert.equal(late.tStart, 100); assert.equal(late.tEnd, 900);
});
test("adjacent numeric and country context both remain cited", async () => {
  const a = source("Students need 20000 dollars.", { _id: "s-numeric", tStart: 10, tEnd: 11 });
  const b = source("This amount applies to New Zealand.", { _id: "s-country", tStart: 11, tEnd: 12 });
  const { db } = fakeDb({ turns: [b, a] });
  const proof = await createSourceHydrator("toc", { db })("20000 students", [node]);
  const ids = (proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string }[]).map((q) => q.turnId);
  assert.ok(ids.includes("s-numeric") && ids.includes("s-country"));
});
for (const fields of [{ tenantId: "foreign" }, { sessionId: "foreign" }, { speakerRef: "" }, { _id: "" }, { tEnd: 1 }]) {
  test("refuses malicious returned source row " + JSON.stringify(fields), async () => {
    const { db } = fakeDb({ turns: [source(undefined, fields)] }, false);
    await assert.rejects(createSourceHydrator("toc", { db })("visa", [node]), BoundedAskError);
  });
}
test("same frozen rows survive DB object mutation during later embedding", async () => {
  const turn = source();
  const chunks = [{ _id: "c1", tenantId: "toc", sourceRef: "s", turnRefs: ["s-t1"], chunkIndex: 0,
    vector: [1, 0], dims: 2, embeddingModel: "fixture" }];
  const { db } = fakeDb({ turns: [turn], chunks });
  const proof = await createSourceHydrator("toc", { db, embed: async () => {
    turn.text = "AFTER SNAPSHOT POISON";
    return { vectors: [[1, 0]], dims: 2, provider: "offline", model: "fixture" };
  } })("visa forms", [node]);
  assert.ok(JSON.stringify(proof.nodes).includes("Visa forms open in October."));
  assert.ok(!JSON.stringify(proof.nodes).includes("POISON"));
});
test("vector span hash/offset poisoning refuses before embedding or quoted answer", async () => {
  const turn = source("世界 😀 visa.");
  const span = { turnId: turn._id, charStart: 0, charEnd: 2, byteStart: 0, byteEnd: 6,
    turnTextSHA256: sha(turn.text), sliceSHA256: sha(turn.text.slice(0, 2)) };
  for (const attack of [{ byteEnd: 2 }, { charStart: 4 }, { turnTextSHA256: "a".repeat(64) }, { turnId: "foreign" }]) {
    let calls = 0;
    const altered = { ...span, ...attack };
    const spanId = sha(JSON.stringify(altered));
    const { db } = fakeDb({ turns: [turn], chunks: [{ _id: "c", tenantId: "toc", sourceRef: "s", turnRefs: [turn._id],
      chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture", sourceSpans: [{ ...altered, spanId }], rawTextSha256: sha(turn.text.slice(0, 2)) }] });
    await assert.rejects(createSourceHydrator("toc", { db, embed: async () => { calls++; throw new Error("not reached"); } })("visa", [node]), /span/);
    assert.equal(calls, 0);
  }
});
test("runtime origin keeps OCR/visual distinct and refuses a screen row with no origin", async () => {
  for (const [prefix, origin] of [["[Screen OCR; unverified]", "screen-ocr-unverified"], ["[Visual observation; unverified]", "visual-observation-unverified"]]) {
    const { db } = fakeDb({ turns: [source(prefix + " visa forms", { speakerRef: "screen" })] });
    const proof = await createSourceHydrator("toc", { db })("visa", [node]);
    assert.equal((proof.nodes[0]!.evidence!.sourceQuotes as { origin: string }[])[0]!.origin, origin);
  }
  const { db } = fakeDb({ turns: [source("visa forms", { speakerRef: "screen" })] });
  await assert.rejects(createSourceHydrator("toc", { db })("visa", [node]), /origin/);
});
test("production request factory uses actual scorer behind shared budget and evaluator routing", async () => {
  const { db } = fakeDb({ turns: [source()] });
  const calls: string[] = [];
  const deps = createSourceRequestDepsFor({ db, write: async () => {}, treeSearchFn: (_root, ids) => ids.includes(node.node_id) ? [node] : [],
    dispatch: async (job, tenantId) => {
      assert.equal(tenantId, "toc");
      calls.push(job.kind);
      assert.ok(!job.messages.some((m) => m.content.includes("PRIVATE")));
      if (job.kind === "ask.select_nodes") return completion({ node_ids: [node.node_id] });
      if (job.kind === "evaluator") return completion({ score: 0.9, reason: "source directly answers" });
      if (job.kind === "ask.answer_grounding") return completion({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = unpackContext(JSON.parse(job.messages[1]!.content).context);
      return completion({ sentences: [{ text: "The source says forms open in October.", sourceIds: [context[0]!.sourceId] }] });
    } })("toc");
  const result = await askV2("Visa October", { ...node, level: "tenant", node_id: "tenant:toc", children: [node] }, { ...deps, tenantId: "toc" });
  assert.equal(result.verdict, "correct");
  assert.equal(result.auditLog.filter((a) => a.step === "score").length, 1, "actual scorer completion audited exactly once");
  assert.deepEqual(calls, ["ask.select_nodes", "evaluator", "ask.answer", "ask.answer_grounding"]);
});
test("actual createLlmScorer cannot swallow quota exhaustion into a grounded answer", async () => {
  let calls = 0;
  const budget = completionBudget(async () => { calls++; return completion({ score: 0.9, reason: "valid" }); });
  const score = createLlmScorer(budget.complete);
  for (let i = 0; i < 12; i++) await score("visa", { ...node, summary: "visa" });
  const fallback = await score("visa", { ...node, summary: "visa" });
  assert.match(fallback[1], /fell back/);
  assert.equal(calls, 12);
  assert.throws(budget.assertHealthy, /budget/);
});
test("request-local memo shares one genuine query embedding across original arm and trusted hydration", async () => {
  let embeds = 0;
  const { db } = fakeDb({ turns: [source()], chunks: [{ _id: "c1", tenantId: "toc", sourceRef: "s", turnRefs: ["s-t1"],
    chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture" }] });
  const deps = createSourceRequestDepsFor({ db, write: async () => {}, treeSearchFn: () => [node],
    dispatch: async () => completion({}), embed: async (job) => {
      embeds++; assert.equal(job.purpose, "query");
      return { vectors: [[1, 0]], dims: 2, provider: "offline", model: "fixture" };
    } })("toc");
  await deps.extraCandidateArmsFn!("visa", node);
  await deps.sourceContext!.hydrate("visa", [node]);
  assert.equal(embeds, 1);
});

test("claimed nomic provenance validates positive spans and refuses altered policy/digest/input", async () => {
  const turn = source();
  const span = { turnId: turn._id, charStart: 0, charEnd: turn.text.length, byteStart: 0, byteEnd: Buffer.byteLength(turn.text),
    turnTextSHA256: sha(turn.text), sliceSHA256: sha(turn.text) };
  const chunk = { _id: "nomic-c1", tenantId: "toc", sourceRef: "s", turnRefs: [turn._id], chunkIndex: 0,
    vector: [1, ...Array.from({ length: 767 }, () => 0)], dims: 768, embeddingModel: "nomic-embed-text",
    sourceSpans: [{ ...span, spanId: sha(JSON.stringify(span)) }], rawTextSha256: sha(turn.text),
    embeddingInputSha256: sha("search_document: " + turn.text), embeddingPolicy: "nomic-rag-prefix-v1",
    embeddingModelDigest: "sha256:0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f" };
  const embed = async () => ({ vectors: [chunk.vector], dims: 768, provider: "offline", model: "nomic-embed-text" });
  const valid = fakeDb({ turns: [turn], chunks: [chunk] });
  const proof = await createSourceHydrator("toc", { db: valid.db, embed })("visa forms", [node]);
  assert.equal(validateHydration(proof, [node]).length, 1);
  for (const attack of [{ embeddingPolicy: "unprefixed" }, { embeddingModelDigest: "sha256:" + "f".repeat(64) },
    { embeddingInputSha256: sha(turn.text) }, { rawTextSha256: "a".repeat(64) }]) {
    let called = false;
    const { db } = fakeDb({ turns: [turn], chunks: [{ ...chunk, ...attack }] });
    await assert.rejects(createSourceHydrator("toc", { db, embed: async () => { called = true; return embed(); } })("visa", [node]), /vector/);
    assert.equal(called, false);
  }
});

test("actual factory query embedding outage retains exact grounded lexical answer and failed-arm audit", async () => {
  for (const malformed of [false, true]) {
    let embeds = 0;
    const { db } = fakeDb({ turns: [source()], chunks: [{ _id: "c1", tenantId: "toc", sourceRef: "s", turnRefs: ["s-t1"],
      chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture" }] });
    const deps = createSourceRequestDepsFor({ db, write: async () => {}, treeSearchFn: () => [],
      embed: async () => { embeds++; if (!malformed) throw new Error("local embed unavailable");
        return { vectors: [[]], dims: 0, provider: "offline", model: "fixture" }; },
      dispatch: async (job) => {
        if (job.kind === "ask.select_nodes") return completion({ node_ids: [] });
        if (job.kind === "evaluator") return completion({ score: 0.9, reason: "exact lexical source answers" });
        if (job.kind === "ask.answer_grounding") return completion({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
        const context = unpackContext(JSON.parse(job.messages[1]!.content).context);
        return completion({ sentences: [{ text: "The source says forms open in October.", sourceIds: [context[0]!.sourceId] }] });
      } })("toc");
    const tree = { ...node, level: "tenant" as const, node_id: "tenant:toc", children: [node] };
    const result = await askV2("Visa October", tree, { ...deps, tenantId: "toc" });
    assert.equal(result.verdict, "correct");
    assert.equal(embeds, 1);
    assert.equal(result.answer, "The source says forms open in October.");
    const quotes = result.sources.internal[0]!.evidence!.sourceQuotes as { quote: string; turnId: string }[];
    assert.equal(quotes[0]!.turnId, "s-t1");
    assert.equal(quotes[0]!.quote, source().text);
    assert.ok(result.auditLog.some((a) => a.jobKind === "ask.retrieval_degraded" && a.step.includes("scoped lexical excerpts")));
  }
});
