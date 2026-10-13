/**
 * scripts/eval/llm-eval.test.mjs - U0.10: --llm harness, fake transport/LLM only (no network, no Mongo).
 * Run: node --test scripts/eval/llm-eval.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLlmArgs, redactor, createEvalComplete, createLlmScoreFn, calibrateLlm, rankSessionsLlm, limitByQuestion, latencySummary, CapReached } from "./llm-eval.mjs";

const env = { OLLAMA_API_KEY: "ok-key-123456", GEMINI_API_KEY: "gem-key-123456" };
const node = { title: "T", summary: "S" };
const reply = (score) => ({ status: 200, body: { message: { content: JSON.stringify({ score, reason: "r" }) }, prompt_eval_count: 5, eval_count: 2 } });
const done = (score, costUsd = 0) => async () => ({ text: JSON.stringify({ score }), usage: {}, provider: "p", model: "m", costUsd });

test("flags: without --llm nothing is enabled; --llm needs a model and a cap", () => {
  assert.deepEqual(parseLlmArgs(["--retriever", "vector"], env), { llm: false });
  assert.match(parseLlmArgs(["--llm", "--max-calls", "5"], env).error, /--model/);
  assert.match(parseLlmArgs(["--llm", "--model", "m"], env).error, /cap/);
  assert.match(parseLlmArgs(["--llm", "--model", "m", "--max-calls", "0"], env).error, /positive/);
  assert.match(parseLlmArgs(["--llm", "--model", "m", "--max-calls", "5"], {}).error, /OLLAMA_API_KEY/);
  const ok = parseLlmArgs(["--llm", "--model", "glm", "--max-calls", "10", "--limit-questions", "3"], env);
  assert.equal(ok.error, undefined);
  assert.equal(ok.baseUrl, "https://ollama.com");
  assert.equal(ok.limitQuestions, 3);
});

test("fake transport: cloud URL + bearer header sent, model id passed, OLLAMA_BASE_URL untouched", async () => {
  const before = process.env.OLLAMA_BASE_URL;
  const seen = [];
  const transport = async (req) => { seen.push(req); return reply(0.8); };
  const o = parseLlmArgs(["--llm", "--model", "glm-5.3-flash", "--max-calls", "5"], env);
  const complete = await createEvalComplete(o, env, transport);
  const { scoreFn, stats } = await createLlmScoreFn(complete, o);
  const r = await scoreFn("q", node);
  assert.equal(r.score, 0.8);
  assert.equal(r.fellBack, false);
  assert.equal(seen[0].url, "https://ollama.com/api/chat");
  assert.equal(seen[0].headers.authorization, "Bearer ok-key-123456");
  assert.equal(seen[0].body.model, "glm-5.3-flash");
  assert.equal(stats.calls, 1);
  assert.equal(stats.inputTokens, 5);
  assert.equal(process.env.OLLAMA_BASE_URL, before);
});

test("cap: checked before each call; the capped call is never sent", async () => {
  let sent = 0;
  const counting = async (j) => { sent++; return done(0.5, 0.4)(j); };
  const { scoreFn, stats } = await createLlmScoreFn(counting, { maxCostUsd: 0.5 });
  await scoreFn("q", node);
  await scoreFn("q", node);
  await assert.rejects(scoreFn("q", node), CapReached);
  assert.equal(sent, 2);
  assert.equal(stats.capReached, true);
  const c2 = await createLlmScoreFn(done(0.5), { maxCalls: 1 });
  await c2.scoreFn("q", node);
  await assert.rejects(c2.scoreFn("q", node), CapReached);
  assert.equal(c2.stats.calls, 1);
});

test("a failed or unparseable reply is flagged as a heuristic fallback, never silently counted as an LLM score", async () => {
  const bad = await createLlmScoreFn(async () => ({ text: "not json", usage: {}, provider: "p", model: "m", costUsd: 0 }), { maxCalls: 9 });
  assert.equal((await bad.scoreFn("q", node)).fellBack, true);
  const boom = await createLlmScoreFn(async () => { throw new Error("401 denied"); }, { maxCalls: 9 });
  assert.equal((await boom.scoreFn("q", node)).fellBack, true);
  assert.equal(boom.stats.fallbacks, 1);
  assert.equal(boom.stats.failed, 1);
  assert.match(boom.stats.errors[0], /401/);
});

test("calibration stops cleanly at the cap and reports not-scored pairs", async () => {
  const { computeMAE } = await import("../../packages/ask/src/eval/calibration.ts");
  const complete = async (job) => ({ text: JSON.stringify({ score: job.messages[1].content.includes("good") ? 1 : 0 }), usage: {}, provider: "p", model: "m", costUsd: 0 });
  const { scoreFn } = await createLlmScoreFn(complete, { maxCalls: 2 });
  const pairs = [1, 2, 3].map((i) => ({ id: `p${i}`, query: "good", node, referenceScore: 1 }));
  const r = await calibrateLlm(pairs, scoreFn, computeMAE);
  assert.equal(r.n, 2);
  assert.equal(r.notScored, 1);
  assert.equal(r.mae, 0);
});

test("recall ranking scores whole questions only and reports the rest as not-scored", async () => {
  const sessions = new Map([["a", { title: "a", summary: "alpha" }], ["b", { title: "b", summary: "beta" }]]);
  const complete = async (job) => ({ text: JSON.stringify({ score: job.messages[1].content.includes("alpha") ? 0.9 : 0.1 }), usage: {}, provider: "p", model: "m", costUsd: 0 });
  const { scoreFn } = await createLlmScoreFn(complete, { maxCalls: 3 });
  const r = await rankSessionsLlm([{ question: "A" }, { question: "B" }], sessions, scoreFn, 1);
  assert.deepEqual(r.ranked.get("A"), ["a"]);
  assert.equal(r.ranked.has("B"), false);
  assert.equal(r.notScored, 1);
});

test("helpers: limitByQuestion, redactor, latencySummary", () => {
  const items = [{ q: "x" }, { q: "x" }, { q: "y" }, { q: "z" }];
  assert.equal(limitByQuestion(items, (i) => i.q, 2).length, 3);
  assert.equal(limitByQuestion(items, (i) => i.q, undefined).length, 4);
  assert.equal(redactor(["secret-abc"])("a secret-abc b"), "a [redacted] b");
  assert.equal(latencySummary([]).n, 0);
  assert.equal(latencySummary([10, 20, 30]).p50Ms, 20);
});
