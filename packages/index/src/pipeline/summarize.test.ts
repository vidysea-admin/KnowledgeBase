/**
 * packages/index/src/pipeline/summarize.test.ts — real JSON parsing + honest-fallback behavior,
 * fake `complete` (never a real LLM call in tests).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";

import { summarizeSession, type SummarizeCompleteFn } from "./summarize.js";

function turn(id: string, speakerRef: string, text: string): Turns {
  return { _id: id, tenantId: "t1", sessionId: "s1", speakerRef, tStart: 0, tEnd: 0, text };
}

function completion(text: string): CompleteResult {
  return { text, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-1", costUsd: 0 };
}

test("summarizeSession returns (no content) for an empty turn list, never calls complete, NOT degraded", async () => {
  const complete: SummarizeCompleteFn = async () => { throw new Error("must not be called"); };
  const { page, degraded } = await summarizeSession([], complete);
  assert.equal(page.summary, "(no content to summarize)");
  assert.equal(degraded, null, "an empty session is an honest empty result, not a failure");
});

test("summarizeSession parses a real JSON completion into a full result, NOT degraded", async () => {
  const turns = [turn("t1", "spk:0", "We discussed visas."), turn("t2", "spk:1", "Decided to apply early.")];
  const complete: SummarizeCompleteFn = async (job: Job) => {
    assert.equal(job.kind, "summarize");
    assert.match(job.messages[1]!.content, /We discussed visas\./);
    return completion(JSON.stringify({
      summary: "Discussion about visas and an early-application decision.",
      keyInsights: ["Visas take time"],
      decisions: ["Apply early"],
      actionItems: [],
    }));
  };
  const { page, degraded } = await summarizeSession(turns, complete);
  assert.equal(page.summary, "Discussion about visas and an early-application decision.");
  assert.deepEqual(page.keyInsights, ["Visas take time"]);
  assert.deepEqual(page.decisions, ["Apply early"]);
  assert.deepEqual(page.actionItems, []);
  assert.equal(degraded, null);
});

test("summarizeSession falls back to a labeled transcript slice on an unparseable response, never throws — and says it DEGRADED", async () => {
  const turns = [turn("t1", "spk:0", "Real transcript content.")];
  const complete: SummarizeCompleteFn = async () => completion("not json at all");
  const { page, degraded } = await summarizeSession(turns, complete);
  assert.match(page.summary, /^\(fallback, LLM summary unavailable\)/);
  assert.match(page.summary, /Real transcript content\./);
  assert.ok(degraded, "an unparseable response must be reported as degraded");
});

test("summarizeSession falls back honestly when complete() rejects, never throws into the caller — DEGRADED", async () => {
  const turns = [turn("t1", "spk:0", "Some content.")];
  const complete: SummarizeCompleteFn = async () => { throw new Error("provider down"); };
  const { page, degraded } = await summarizeSession(turns, complete);
  assert.match(page.summary, /^\(fallback, LLM summary unavailable\)/);
  assert.ok(degraded, "a failed provider call must be reported as degraded, not as a silent fallback");
  assert.match(degraded.reason, /provider down/);
});

test("summarizeSession rejects a response with a missing/empty summary field, falls back instead — DEGRADED", async () => {
  const turns = [turn("t1", "spk:0", "Content here.")];
  const complete: SummarizeCompleteFn = async () => completion(JSON.stringify({ summary: "" }));
  const { page, degraded } = await summarizeSession(turns, complete);
  assert.match(page.summary, /^\(fallback, LLM summary unavailable\)/);
  assert.ok(degraded, "an unusable response must be reported as degraded");
});

type RuntimeReply = Record<string, unknown>;
function strictFixture(mutate: (phase: string, payload: RuntimeReply, reply: RuntimeReply) => void = () => {}) {
  const seen: RuntimeReply[] = [];
  const complete: SummarizeCompleteFn = async (job) => {
    const p = JSON.parse(job.messages[1]!.content) as RuntimeReply; seen.push(p);
    const spans = p.spans as { turnId: string; sessionId: string; text: string; origin: string }[];
    const evidence = (s: typeof spans[number]) => [{ turnId: s.turnId, sessionId: s.sessionId, quote: s.text }];
    let reply: RuntimeReply;
    if (p.phase === "extract-summary") reply = { processed: p.inventory,
      items: spans.filter((s) => !s.text.includes("What is")).map((s) => ({ kind: "insight", text: s.text, origin: s.origin, verification: "unverified", evidence: evidence(s) })),
      qa: spans.filter((s) => s.text.includes("What is")).map((s) => ({ question: s.text, questionEvidence: evidence(s), answer: null, answerEvidence: [], status: "unanswered" })) };
    else if (p.phase === "reconcile-questions") reply = { processed: p.inventory,
      answers: (p.questions as { id: string; question: string }[]).map((q) => {
        const answer = q.question === "What is the deadline?" ? spans.find((s) => s.text === "The deadline is Friday.") : undefined;
        return { id: q.id, answer: answer?.text ?? null, answerEvidence: answer ? evidence(answer) : [] };
      }) };
    else {
      assert.match(job.messages[0]!.content, p.mode === "pending-qa" ? /completeness is per-question/ : /summary extraction completeness/);
      reply = { processed: p.inventory, complete: true, noContent: false,
      verdicts: (p.items as { id: string }[]).map((item) => ({ id: item.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    }
    mutate(p.phase as string, p, reply); return completion(JSON.stringify(reply));
  };
  return { complete, seen };
}
test("strict windows cover early/middle/late oversized source and preserve separate cross-window QA", async () => {
  const turns = [turn("q", "spk:0", "What is the deadline?"), turn("long", "spk:1", Array.from({ length: 600 }, (_, i) => `Source paragraph${i}: detailed content. `).join("")),
    turn("answer", "spk:1", "The deadline is Friday."), turn("unanswered", "spk:0", "What is the scholarship?"),
    { ...turn("screen", "screen", "[Visual observation; unverified] A graph shows three bars."), screenEvidence: { frameId: "f1", file: "frames/f1.png", hash: "a".repeat(64), tStart: 0 } }];
  for (const [i, t] of turns.entries()) { t.tStart = i * 10; t.tEnd = i * 10 + 1; if (t.speakerRef === "screen") (t.screenEvidence as { tStart: number }).tStart = t.tStart; }
  const supplied = [turns[2]!, turns[4]!, turns[1]!, turns[0]!, turns[3]!];
  const beforeIds = supplied.map((t) => t._id);
  const { complete, seen } = strictFixture();
  const result = await summarizeSession(supplied, complete, { strictWebinar: true });
  assert.deepEqual(supplied.map((t) => t._id), beforeIds, "input order is preserved");
  assert.equal(result.degraded, null); assert.deepEqual(result.page.coveredTurnIds, turns.map((t) => t._id));
  const submitted = seen.filter((p) => p.phase === "extract-summary"); assert.ok(submitted.length >= 3);
  const longSpans = submitted.flatMap((p) => p.spans as { turnId: string; from: number; to: number; text: string }[]).filter((s) => s.turnId === "long");
  const unique = [...new Map(longSpans.map((s) => [s.from, s])).values()].sort((a, b) => a.from - b.from);
  assert.equal(unique.map((s) => s.text).join(""), turns[1]!.text); assert.ok(submitted.every((p) => JSON.stringify(p).length <= 16000));
  const answered = result.page.qa!.find((q) => q.question === turns[0]!.text)!;
  assert.equal(answered.answer, turns[2]!.text); assert.equal(answered.questionEvidence[0]!.turnId, "q"); assert.equal(answered.answerEvidence[0]!.turnId, "answer");
  assert.equal(result.page.qa!.find((q) => q.question === turns[3]!.text)!.status, "unanswered");
  assert.ok(result.page.citedItems!.some((i) => i.origin === "visual-observation")); assert.deepEqual(result.page.decisions, []); assert.deepEqual(result.page.actionItems, []);
});
test("strict source and independent judgment attacks degrade rather than invent zero gaps", async () => {
  const turns = [turn("real", "spk:0", "Original exact fact."), turn("wrong-valid", "spk:1", "Unrelated source.")];
  for (const attack of ["wrong-valid", "foreign", "altered-quote", "missing-span", "wrong-digest", "missing-judge", "duplicate-judge", "unknown-judge", "unsupported", "negated-decision", "irrelevant-answer", "informative-empty"]) {
    const { complete } = strictFixture((phase, _, reply) => {
      if (phase === "extract-summary") {
        const items = reply.items as { evidence: { turnId: string; sessionId: string; quote: string }[]; kind: string }[];
        if (attack === "wrong-valid") items[0]!.evidence[0]!.turnId = "wrong-valid";
        if (attack === "foreign") items[0]!.evidence[0]!.sessionId = "other";
        if (attack === "altered-quote") items[0]!.evidence[0]!.quote = "Invented fact.";
        if (attack === "missing-span") (reply.processed as unknown[]).pop();
        if (attack === "wrong-digest") (reply.processed as { digest: string }[])[0]!.digest = "bad";
        if (attack === "negated-decision") items[0]!.kind = "decision";
        if (attack === "informative-empty") reply.items = [];
      } else if (phase === "judge") {
        const verdicts = reply.verdicts as { id: string; supported: boolean; categoryCorrect: boolean; answerRelevant: boolean }[];
        if (attack === "missing-judge") verdicts.pop(); if (attack === "duplicate-judge") verdicts.push(verdicts[0]!);
        if (attack === "unknown-judge") verdicts[0]!.id = "unknown";
        if (attack === "unsupported") verdicts[0]!.supported = false;
        if (attack === "negated-decision") verdicts[0]!.categoryCorrect = false;
        if (attack === "irrelevant-answer") verdicts[0]!.answerRelevant = false;
      }
    });
    const result = await summarizeSession(turns, complete, { strictWebinar: true });
    assert.ok(result.degraded, attack); assert.equal(result.page.coveredTurnIds, undefined, attack);
  }
});
test("strict OCR origin, duplicate identities and over-budget full context refuse", async () => {
  const screen = { ...turn("s", "screen", "[Screen OCR; unverified] Fees: 100."), screenEvidence: { frameId: "f", file: "frames/f.png", hash: "b".repeat(64), tStart: 0 } };
  const valid = await summarizeSession([screen], strictFixture().complete, { strictWebinar: true });
  assert.equal(valid.degraded, null); assert.equal(valid.page.citedItems![0]!.origin, "screen-ocr");
  for (const invalid of [{ frameId: "" }, { frameId: "   " }, { file: "" }, { file: "   " }, { file: "frames/f\n.png" }]) {
    assert.ok((await summarizeSession([{ ...screen, screenEvidence: { ...screen.screenEvidence, ...invalid } }], strictFixture().complete, { strictWebinar: true })).degraded);
  }
  for (const turns of [[turn("a", "spk:0", "one"), turn("a", "spk:1", "two")], [turn("huge", "spk:0", "X".repeat(50000))], [{ ...screen, text: "[Visual observation; verified] invented" }]]) {
    assert.ok((await summarizeSession(turns, strictFixture().complete, { strictWebinar: true })).degraded);
  }
});

test("strict pending question review rejects an irrelevant answer rather than assigning it", async () => {
  const turns = [turn("question", "spk:0", "What is the scholarship?"), turn("answer", "spk:1", "The deadline is Friday.")];
  const { complete } = strictFixture((phase, payload, reply) => {
    if (phase === "reconcile-questions") {
      const answer = (reply.answers as { answer: string | null; answerEvidence: unknown[] }[])[0]!;
      answer.answer = turns[1]!.text; answer.answerEvidence = [{ turnId: "answer", sessionId: "s1", quote: turns[1]!.text }];
    }
    if (phase === "judge" && payload.mode === "pending-qa") (reply.verdicts as { answerRelevant: boolean }[])[0]!.answerRelevant = false;
  });
  assert.ok((await summarizeSession(turns, complete, { strictWebinar: true })).degraded);
});

test("strict multi-hour-sized source keeps all windows local and all ten pending questions", async () => {
  const questions = Array.from({ length: 10 }, (_, i) => turn(`question${i}`, "spk:0", i === 0 ? "What is the deadline?" : `What is scholarship${i}?`));
  const facts = Array.from({ length: 1000 }, (_, i) => turn(`fact${i}`, "spk:1", `At minute${i}, the speaker explains distinct programme${i} details and eligibility${i}. `.repeat(3)));
  const turns = [...questions, ...facts, turn("late-answer", "spk:1", "The deadline is Friday.")];
  for (const [i, t] of turns.entries()) { t.tStart = i * 5; t.tEnd = i * 5 + 4; }
  assert.ok(turns.reduce((n, t) => n + t.text.length, 0) > 100000);
  const { complete, seen } = strictFixture();
  const result = await summarizeSession(turns, complete, { strictWebinar: true });
  assert.equal(result.degraded, null); assert.equal(result.page.coveredTurnIds!.length, turns.length);
  assert.equal(result.page.qa!.length, 10); assert.equal(result.page.qa!.filter((q) => q.status === "answered").length, 1);
  assert.equal(result.page.qa!.find((q) => q.question === "What is the deadline?")!.answerEvidence[0]!.turnId, "late-answer");
  const requests = seen.filter((p) => p.phase === "reconcile-questions");
  assert.ok(requests.some((p) => (p.questions as unknown[]).length === 8)); assert.ok(requests.every((p) => (p.questions as unknown[]).length <= 8));
  const judged = seen.filter((p) => p.phase === "judge");
  assert.ok(judged.length > 20); assert.ok(judged.every((p) => JSON.stringify(p.context).length <= 48000 && (p.context as unknown[]).length < turns.length));
  const submitted = seen.filter((p) => p.phase === "extract-summary");
  const ids = new Set(submitted.flatMap((p) => (p.spans as { turnId: string }[]).map((span) => span.turnId)));
  assert.equal(ids.size, turns.length); assert.ok(submitted.every((p) => JSON.stringify(p).length <= 16000));
});
