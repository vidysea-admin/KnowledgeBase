/**
 * scripts/eval/llm-eval.test.mjs - U0.10: --llm harness, fake transport/LLM only (no network, no Mongo).
 * Run: node --test scripts/eval/llm-eval.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLlmArgs, redactor, createEvalComplete, createLlmScoreFn, calibrateLlm, rankSessionsLlm, limitByQuestion, latencySummary, CapReached, capHit, fallbackWarning } from "./llm-eval.mjs";

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

test("ISS-U010HARNESS-001: --max-cost-usd alone is refused (adapters report costUsd 0); allowed with --max-calls", () => {
  for (const provider of ["ollama", "gemini"]) {
    const alone = parseLlmArgs(["--llm", "--model", "m", "--provider", provider, "--max-cost-usd", "5"], env);
    assert.match(alone.error, /--max-calls/);
    assert.match(alone.error, /can never trip/);
    const both = parseLlmArgs(["--llm", "--model", "m", "--provider", provider, "--max-cost-usd", "5", "--max-calls", "10"], env);
    assert.equal(both.error, undefined);
    assert.equal(both.maxCalls, 10);
  }
});

test("cap boundary: at exactly the limit the next call is refused; one below it is allowed", () => {
  assert.equal(capHit({ maxCostUsd: 0.5 }, { calls: 0, costUsd: 0.5 }), true);
  assert.equal(capHit({ maxCostUsd: 0.5 }, { calls: 0, costUsd: 0.4999 }), false);
  assert.equal(capHit({ maxCalls: 3 }, { calls: 3, costUsd: 0 }), true);
  assert.equal(capHit({ maxCalls: 3 }, { calls: 2, costUsd: 0 }), false);
  assert.equal(capHit({}, { calls: 99, costUsd: 99 }), false);
});

test("results warning field appears only when heuristic fallbacks > 0", () => {
  assert.deepEqual(fallbackWarning({ fallbacks: 0 }), {});
  assert.match(fallbackWarning({ fallbacks: 1 }).warning, /1 call\(s\) fell back.*NOT a pure LLM/);
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
  assert.equal(stats.costUsd, 0.8);
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

// ---------------------------------------------------------------------------------------------------------------------
// D4 pairwise judge (D-227): answer-against-answer, two judges, blind, order-swapped. Stub judges only: no network, no model.
// ---------------------------------------------------------------------------------------------------------------------
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPairwisePrompt, parsePairwiseChoice, wilsonInterval, loadPairwiseItems, runPairwise, runPairwiseFile, formatPairwiseSummary, parsePairwiseArgs, createPairwiseJudge } from "./pairwise/pairwise-judge.mjs";

/** Which position (1 or 2) holds the answer containing `token`, read from the blind user prompt; undefined if neither. */
const positionOf = (user, token) => {
  const a1 = user.split("Answer 1:")[1].split("Answer 2:")[0], a2 = user.split("Answer 2:")[1];
  return a1.includes(token) ? 1 : a2.includes(token) ? 2 : undefined;
};
const reply12 = (n) => JSON.stringify({ winner: n, reason: "stub" });
/** A judge that prefers the answer containing `token`, whichever position it is in. */
const prefers = (name, token) => ({ name, call: async ({ user }) => reply12(positionOf(user, token)) });
const pitem = (id, aGood) => ({ id, question: `Q ${id}?`, answerA: aGood ? `GOOD ${id}` : `BAD ${id}`, answerB: aGood ? `BAD ${id}` : `GOOD ${id}` });

test("pairwise: two judges agree - A wins 3 of 4, each (item,judge) asked twice in opposite orders, CI named", async () => {
  const items = [pitem("i1", true), pitem("i2", true), pitem("i3", true), pitem("i4", false)];
  const seen = [];
  const spy = (j) => ({ name: j.name, call: async (p) => { seen.push({ judge: j.name, user: p.user }); return j.call(p); } });
  const r = await runPairwise(items, [spy(prefers("j1", "GOOD")), spy(prefers("j2", "GOOD"))]);
  assert.equal(seen.length, 16);
  for (const j of ["j1", "j2"]) for (const it of items) {
    const calls = seen.filter((s) => s.judge === j && s.user.includes(it.question));
    assert.equal(calls.length, 2);
    assert.notEqual(positionOf(calls[0].user, it.answerA), positionOf(calls[1].user, it.answerA), "the two orders put answerA in opposite positions");
  }
  assert.deepEqual(r.judges.j1.counts, { A: 3, B: 1, tie: 0, inconsistent: 0, error: 0 });
  assert.deepEqual(r.combined.counts, { A: 3, B: 1, tie: 0, inconsistent: 0, error: 0 });
  assert.equal(r.combined.winRate.rate, 0.75);
  assert.equal(r.combined.winRate.n, 4);
  assert.match(r.combined.winRate.method, /Wilson/);
  assert.match(r.combined.winRate.method, /95%/);
  assert.ok(Math.abs(r.combined.winRate.low - 0.3006) < 0.005 && Math.abs(r.combined.winRate.high - 0.9544) < 0.005);
  assert.equal(r.agreement.rate, 1);
  assert.equal(r.inconsistencyRate.rate, 0);
  assert.equal(r.items.length, 4);
  assert.equal(r.items[3].combined, "B");
});

test("pairwise: judges disagree - opposite preferences give A vs B per judge, a combined tie, agreement 0", async () => {
  const items = [pitem("i1", true), pitem("i2", true), pitem("i3", false)];
  const r = await runPairwise(items, [prefers("j1", "GOOD"), prefers("j2", "BAD")]);
  assert.deepEqual(r.judges.j1.counts, { A: 2, B: 1, tie: 0, inconsistent: 0, error: 0 });
  assert.deepEqual(r.judges.j2.counts, { A: 1, B: 2, tie: 0, inconsistent: 0, error: 0 });
  assert.deepEqual(r.combined.counts, { A: 0, B: 0, tie: 3, inconsistent: 0, error: 0 });
  assert.equal(r.combined.winRate.rate, null);
  assert.equal(r.agreement.rate, 0);
  assert.equal(r.agreement.n, 3);
});

test("pairwise: a position-biased judge (always answer 1) is 100% inconsistent, win rate undefined (never 50%)", async () => {
  const items = [pitem("i1", true), pitem("i2", false), pitem("i3", true)];
  const first = { name: "first", call: async () => reply12(1) };
  const r = await runPairwise(items, [first, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.first.counts, { A: 0, B: 0, tie: 0, inconsistent: 3, error: 0 });
  assert.equal(r.judges.first.winRate.rate, null);
  assert.equal(r.judges.first.winRate.low, null);
  assert.equal(r.judges.first.winRate.high, null);
  assert.equal(r.judges.first.inconsistencyRate.rate, 1);
  assert.equal(r.judges.first.items.every((v) => v.verdict === "inconsistent"), true);
  assert.equal(r.combined.winRate.rate, null, "an inconsistent judge cannot make a combined win");
  assert.equal(r.combined.counts.inconsistent, 3);
  assert.equal(r.agreement.rate, null, "no item has two decisive verdicts");
  assert.equal(r.inconsistencyRate.rate, 0.5, "pooled over both judges: 3 of 6 judge-items");
});

test("pairwise: a judge that answers in prose instead of a choice is an error, never a win for either side", async () => {
  const items = [pitem("i1", true), pitem("i2", true)];
  const prose = { name: "prose", call: async () => "Both answers are quite good, I slightly like the first one." };
  const r = await runPairwise(items, [prose, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.prose.counts, { A: 0, B: 0, tie: 0, inconsistent: 0, error: 2 });
  assert.equal(r.judges.prose.winRate.rate, null);
  assert.equal(r.judges.prose.inconsistencyRate.rate, null);
  assert.deepEqual(r.combined.counts, { A: 0, B: 0, tie: 0, inconsistent: 0, error: 2 });
  assert.equal(r.combined.winRate.rate, null);
});

test("pairwise: a judge call that throws is an error for that item only, and the run completes", async () => {
  const items = [pitem("i1", true), pitem("i2", true), pitem("i3", true)];
  let n = 0;
  const flaky = { name: "flaky", call: async (p) => { n++; if (n === 3) throw new Error("503 upstream"); return prefers("x", "GOOD").call(p); } };
  const r = await runPairwise(items, [flaky, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.flaky.counts, { A: 2, B: 0, tie: 0, inconsistent: 0, error: 1 });
  assert.equal(r.judges.flaky.items[1].verdict, "error");
  assert.match(r.judges.flaky.items[1].detail, /503/);
  assert.deepEqual(r.combined.counts, { A: 2, B: 0, tie: 0, inconsistent: 0, error: 1 });
  assert.equal(r.combined.winRate.rate, 1);
  assert.equal(r.combined.winRate.n, 2);
});

test("pairwise: one order parses and the other is prose - error, not inconsistent and not a win", async () => {
  let n = 0;
  const half = { name: "half", call: async (p) => (++n % 2 === 1 ? prefers("x", "GOOD").call(p) : "no idea") };
  const r = await runPairwise([pitem("i1", true)], [half, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.half.counts, { A: 0, B: 0, tie: 0, inconsistent: 0, error: 1 });
});

test("pairwise: an empty item list gives zero counts and undefined rates, makes no judge call, and does not throw", async () => {
  let calls = 0;
  const j = (name) => ({ name, call: async () => { calls++; return reply12(1); } });
  const r = await runPairwise([], [j("j1"), j("j2")]);
  assert.equal(calls, 0);
  assert.equal(r.n, 0);
  assert.deepEqual(r.combined.counts, { A: 0, B: 0, tie: 0, inconsistent: 0, error: 0 });
  assert.equal(r.combined.winRate.rate, null);
  assert.equal(r.agreement.rate, null);
  assert.equal(r.inconsistencyRate.rate, null);
  assert.match(formatPairwiseSummary(r), /undefined/);
});

test("pairwise blind prompt: only the question and 'Answer 1'/'Answer 2'; no id, source, session, speaker or side label", () => {
  const it = { ...pitem("SESSION-0042", true), question: "What is the deadline?", answerA: "GOOD alpha", answerB: "BAD beta", source: "SRC-LEAK", sessionId: "SID-LEAK", speakerName: "SPK-LEAK", side: "AI-LEAK" };
  for (const swapped of [false, true]) {
    const { system, user } = buildPairwisePrompt(it, swapped);
    const all = `${system}\n${user}`;
    for (const leak of ["SESSION-0042", "SRC-LEAK", "SID-LEAK", "SPK-LEAK", "AI-LEAK"]) assert.equal(all.includes(leak), false, leak);
    assert.equal(/\b(human|expert|knowledge base|session|speaker|source|answerA|answerB|answer a|answer b)\b/i.test(all), false);
    assert.match(user, /Answer 1:/);
    assert.match(user, /Answer 2:/);
    assert.equal(positionOf(user, "GOOD"), swapped ? 2 : 1);
    assert.ok(user.includes(it.question));
  }
});

test("pairwise reply parsing: JSON winner 1 or 2 only; prose, tie, out-of-range and missing are undefined", () => {
  assert.equal(parsePairwiseChoice('{"winner": 1, "reason": "x"}'), 1);
  assert.equal(parsePairwiseChoice('```json\n{"winner": "2"}\n```'), 2);
  assert.equal(parsePairwiseChoice("2"), 2);
  assert.equal(parsePairwiseChoice("Answer 1"), 1);
  for (const bad of ["", "tie", "Both are good", '{"winner": 3}', '{"winner": "tie"}', "{}", "Answer 1 is better but Answer 2 is more complete", null, undefined])
    assert.equal(parsePairwiseChoice(bad), undefined, String(bad));
});

test("pairwise wilson interval: known values, n=0 undefined, bounds stay within [0,1]", () => {
  const w = wilsonInterval(3, 4);
  assert.equal(w.rate, 0.75);
  assert.ok(Math.abs(w.low - 0.3006) < 0.001 && Math.abs(w.high - 0.9544) < 0.001);
  const none = wilsonInterval(0, 0);
  assert.equal(none.rate, null);
  assert.equal(none.low, null);
  assert.equal(none.n, 0);
  assert.equal(wilsonInterval(10, 10).high, 1);
  assert.equal(wilsonInterval(0, 10).low, 0);
  assert.match(w.method, /Wilson score interval/);
});

test("pairwise file mode: reads items JSON, writes the report JSON with the method and prints a summary; bad items are refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pairwise-"));
  const inPath = join(dir, "items.json"), outPath = join(dir, "out", "report.json");
  writeFileSync(inPath, JSON.stringify([pitem("i1", true), pitem("i2", false)]));
  const { report, summary, path } = await runPairwiseFile(inPath, [prefers("j1", "GOOD"), prefers("j2", "GOOD")], outPath);
  assert.equal(path, outPath);
  const onDisk = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(onDisk.combined.winRate.rate, 0.5);
  assert.match(onDisk.combined.winRate.method, /Wilson/);
  assert.match(summary, /win rate/i);
  assert.match(summary, /95%/);
  assert.equal(report.n, 2);
  writeFileSync(inPath, JSON.stringify({ items: [pitem("i1", true)] }));
  assert.equal(loadPairwiseItems(inPath).length, 1);
  writeFileSync(inPath, JSON.stringify([{ id: "x", question: "q", answerA: "a" }]));
  assert.throws(() => loadPairwiseItems(inPath), /item 0.*answerB/);
  writeFileSync(inPath, JSON.stringify([pitem("d", true), pitem("d", true)]));
  assert.throws(() => loadPairwiseItems(inPath), /duplicate id/);
  await assert.rejects(runPairwise([pitem("i", true)], [prefers("same", "GOOD"), prefers("same", "BAD")]), /two distinct judges/);
});

test("pairwise flags: needs a file, two provider:model judges and a call cap; reuses the --llm validation", () => {
  assert.deepEqual(parsePairwiseArgs(["--retriever", "vector"], env), { pairwise: false });
  const base = ["--pairwise", "items.json", "--llm", "--judge-1", "ollama:glm-5.3-flash", "--judge-2", "gemini:gemini-3-flash", "--max-calls", "400"];
  const ok = parsePairwiseArgs(base, env);
  assert.equal(ok.error, undefined);
  assert.equal(ok.file, "items.json");
  assert.equal(ok.judges[0].model, "glm-5.3-flash");
  assert.equal(ok.judges[1].provider, "gemini");
  assert.equal(ok.maxCalls, 400);
  assert.match(parsePairwiseArgs(base.filter((_, i) => i !== 3 && i !== 4), env).error, /--judge-1/);
  assert.match(parsePairwiseArgs(base.slice(0, 7), env).error, /--max-calls/);
  assert.match(parsePairwiseArgs(base, {}).error, /OLLAMA_API_KEY|GEMINI_API_KEY/);
  assert.match(parsePairwiseArgs(["--pairwise", "i.json", "--llm", "--judge-1", "nocolon", "--judge-2", "ollama:m", "--max-calls", "9"], env).error, /provider:model/);
});

test("pairwise real-judge seam: createPairwiseJudge sends the blind prompt through the existing complete(job), counts calls, honours the cap", async () => {
  const jobs = [];
  const complete = async (job) => { jobs.push(job); return { text: reply12(1), usage: { inputTokens: 3, outputTokens: 1 }, provider: "p", model: "m", costUsd: 0 }; };
  const j = createPairwiseJudge("j", complete, { maxCalls: 2 });
  const p = buildPairwisePrompt(pitem("i1", true), false);
  assert.equal(await j.call(p), reply12(1));
  await j.call(p);
  await assert.rejects(j.call(p), CapReached);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].kind, "evaluator");
  assert.equal(jobs[0].messages[0].role, "system");
  assert.equal(jobs[0].messages[1].content, p.user);
  assert.equal(j.stats.calls, 2);
  assert.equal(j.stats.inputTokens, 6);
  assert.equal(j.stats.capReached, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// Contract qa/contracts/pairwise-answer-judge.md (D4J-C1..C6, I1..I2) - alignment tests added after the checker fold-in.
// ---------------------------------------------------------------------------------------------------------------------
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("D4J-C1 pairwise: swapping which side holds which text gives the same prompt body; answer text stays verbatim", () => {
  const x = "Per Dr. Rao in the 'Visa Basics' session: apply 3 months early [S1].", y = "  Apply early.\nBring your I-20.  ";
  const one = buildPairwisePrompt({ id: "a", question: "Q?", answerA: x, answerB: y }, false);
  const two = buildPairwisePrompt({ id: "b", question: "Q?", answerA: y, answerB: x }, true);
  assert.deepEqual(one, two, "side labels carry no identity: the prompt depends only on what is shown in position 1 and 2");
  assert.ok(one.user.includes(x) && one.user.includes(y), "names, titles, citations and whitespace pass through unscrubbed");
});

test("D4J-C1 pairwise: the report notes that style cues in verbatim text can unblind a judge", async () => {
  const r = await runPairwise([pitem("i1", true)], [prefers("j1", "GOOD"), prefers("j2", "GOOD")]);
  assert.ok(r.notes.some((n) => /style cues/i.test(n) && /unblind/i.test(n)));
});

test("D4J-C2 pairwise: an empty reply is an error and is not retried", async () => {
  let calls = 0;
  const empty = { name: "empty", call: async () => { calls++; return "   "; } };
  const r = await runPairwise([pitem("i1", true)], [empty, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.empty.counts, { A: 0, B: 0, tie: 0, inconsistent: 0, error: 1 });
  assert.equal(calls, 1, "no retry, and no second order after a failure");
});

test("D4J-C3 pairwise: two judges must have distinct model ids (same model under two names is refused); answering model named and overlap flagged", async () => {
  const j = (name, model) => ({ ...prefers(name, "GOOD"), model });
  await assert.rejects(runPairwise([pitem("i", true)], [j("a", "glm-5"), j("b", "glm-5")]), /distinct model ids/);
  const r = await runPairwise([pitem("i", true)], [j("a", "glm-5"), j("b", "gem-3")], { answerModels: { A: "glm-5", B: "human" } });
  assert.deepEqual(r.judgeModels, ["glm-5", "gem-3"]);
  assert.deepEqual(r.answerModels, { A: "glm-5", B: "human" });
  assert.deepEqual(r.judgeIsAnsweringModel, ["glm-5"]);
  const none = await runPairwise([pitem("i", true)], [j("a", "glm-5"), j("b", "gem-3")]);
  assert.equal(none.answerModels, null);
  assert.deepEqual(none.judgeIsAnsweringModel, []);
  assert.match(parsePairwiseArgs(["--pairwise", "i.json", "--llm", "--judge-1", "ollama:m", "--judge-2", "gemini:m", "--max-calls", "9"], env).error, /distinct model ids/);
});

test("D4J-C4 pairwise: inconsistent and error are excluded from the win-rate denominator and reported apart; rules and denominator are named", async () => {
  const items = [pitem("i1", true), pitem("i2", true), pitem("i3", false), pitem("i4", true), pitem("i5", true)];
  let n = 0;
  // j1 is inconsistent on i4 (always 1 there) and errors on i5; otherwise follows GOOD.
  const j1 = { name: "j1", call: async (p) => { const it = p.user; if (it.includes("Q i5?")) throw new Error("boom"); if (it.includes("Q i4?")) return reply12(1); n++; return prefers("x", "GOOD").call(p); } };
  const r = await runPairwise(items, [j1, prefers("j2", "GOOD")]);
  assert.deepEqual(r.judges.j1.counts, { A: 2, B: 1, tie: 0, inconsistent: 1, error: 1 });
  assert.equal(r.judges.j1.winRate.n, 3, "denominator = A + B only");
  assert.ok(Math.abs(r.judges.j1.winRate.rate - 2 / 3) < 1e-12);
  assert.match(r.judges.j1.winRate.denominator, /A \+ B/);
  assert.match(r.judges.j1.winRate.denominator, /inconsistent and error.*excluded/i);
  assert.deepEqual(r.combined.counts, { A: 2, B: 1, tie: 0, inconsistent: 1, error: 1 });
  assert.match(r.method.combined, /error.*inconsistent/s, "combined precedence rule named");
  assert.match(formatPairwiseSummary(r), /denominator/i);
});

test("D4J-C4 pairwise: a run with fewer than half the items decided is labelled low-decisive; disagreement rate is reported", async () => {
  const items = [pitem("i1", true), pitem("i2", true), pitem("i3", true)];
  const biased = { name: "first", call: async () => reply12(1) };
  const r = await runPairwise(items, [biased, prefers("j2", "GOOD")]);
  assert.equal(r.judges.first.lowDecisive, true);
  assert.equal(r.judges.j2.lowDecisive, false);
  assert.equal(r.combined.lowDecisive, true);
  assert.match(formatPairwiseSummary(r), /low-decisive/);
  const d = await runPairwise(items, [prefers("a", "GOOD"), prefers("b", "BAD")]);
  assert.equal(d.agreement.rate, 0);
  assert.equal(d.disagreementRate.rate, 1);
  assert.equal((await runPairwise([], [biased, prefers("j2", "GOOD")])).combined.lowDecisive, false, "empty list is not labelled low-decisive");
});

test("D4J-C5 pairwise flags: --llm is required; the cap is the total over items x judges x 2 and the run is refused below it", async () => {
  const base = ["--pairwise", "items.json", "--llm", "--judge-1", "ollama:glm-5.3-flash", "--judge-2", "gemini:gemini-3-flash", "--max-calls", "8"];
  assert.equal(parsePairwiseArgs(base, env).error, undefined);
  assert.match(parsePairwiseArgs(base.filter((a) => a !== "--llm"), env).error, /--llm/);
  assert.match(parsePairwiseArgs(base.filter((_, i) => i !== 7 && i !== 8), env).error, /--max-calls/);
  const dir = mkdtempSync(join(tmpdir(), "pairwise-cap-"));
  const f = join(dir, "items.json");
  writeFileSync(f, JSON.stringify([pitem("a", true), pitem("b", true), pitem("c", true)]));
  const run = (cap) => spawnSync(process.execPath, [fileURLToPath(new URL("./pairwise/pairwise-judge.mjs", import.meta.url)), "--pairwise", f, "--llm", "--judge-1", "ollama:m1", "--judge-2", "gemini:m2", "--max-calls", String(cap), "--out", join(dir, "o.json")],
    { encoding: "utf8", env: { ...process.env, OLLAMA_API_KEY: "k-123456", GEMINI_API_KEY: "g-123456" }, timeout: 60000 });
  const refused = run(11);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /12 calls/, "3 items x 2 judges x 2 orders = 12 planned, cap 11");
  assert.equal(existsSync(join(dir, "o.json")), false);
});

test("D4J-I1 pairwise: running the script directly without --pairwise does nothing, as before", () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./llm-eval.mjs", import.meta.url))], { encoding: "utf8", timeout: 60000 });
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, "");
});

test("D4J-I2 pairwise: an existing output file is never overwritten, and the refusal happens before any judge call", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pairwise-ow-"));
  const inPath = join(dir, "items.json"), outPath = join(dir, "report.json");
  writeFileSync(inPath, JSON.stringify([pitem("i1", true)]));
  writeFileSync(outPath, "PRIOR RUN");
  let calls = 0;
  const j = (name) => ({ name, call: async () => { calls++; return reply12(1); } });
  await assert.rejects(runPairwiseFile(inPath, [j("a"), j("b")], outPath), /already exists/);
  assert.equal(calls, 0);
  assert.equal(readFileSync(outPath, "utf8"), "PRIOR RUN");
});
