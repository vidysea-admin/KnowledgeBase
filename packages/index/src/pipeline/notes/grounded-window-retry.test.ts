/**
 * T-040 live fix: a malformed judge acknowledgement is retried (halves, hinted, verifier model); a part that still fails is skipped, never thrown (D-185). Fake `complete` only; no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { summarizeSession } from "../summarize.js";
import { extractClaims } from "../claims.js";

const turn = (i: number, text: string): Turns => ({ _id: `t${i}`, tenantId: "t1", sessionId: "s1", speakerRef: `spk:${i % 3}`, tStart: i * 10, tEnd: i * 10 + 5, text });
const done = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 });
type R = Record<string, unknown>;
const turns = [turn(0, "Fees for the programme are listed on the website."), turn(1, "Applications close on the first of March.")];

function fake(kind: "summarize" | "claims", incompleteJudgements: number) {
  const phases: string[] = [], hints: unknown[] = [], kinds: string[] = [];
  let judged = 0;
  const complete = async (job: { kind: string; messages: { content: string }[] }): Promise<CompleteResult> => {
    const p = JSON.parse(job.messages[1]!.content) as R;
    phases.push(p.phase as string);
    const spans = (p.spans ?? []) as { turnId: string; sessionId: string; text: string; origin: string }[];
    if (p.phase === "extract-summary" || p.phase === "extract-claims") {
      hints.push(p.retry); kinds.push(job.kind);
      const list = spans.map((s) => ({ kind: "insight", text: s.text, origin: s.origin, verification: "unverified", evidence: [{ turnId: s.turnId, sessionId: s.sessionId, quote: s.text }] }));
      return done(kind === "summarize" ? { processed: p.inventory, qa: [], items: list } : { processed: p.inventory, claims: list.map(({ kind: _k, ...c }) => c) });
    }
    const badAck = ++judged <= incompleteJudgements;
    return done({ processed: badAck ? spans.map((x) => x.turnId) : p.inventory, complete: true, noContent: false, noClaims: false, verdicts: ((p.items ?? []) as { id: string }[]).map((x) => ({ id: x.id, supported: true, categoryCorrect: true, answerRelevant: true })) });
  };
  return { complete, phases, hints, kinds };
}

test("summary: one malformed judge reply is cured by re-extracting the window as two hinted halves", async () => {
  const f = fake("summarize", 1);
  const r = await summarizeSession(turns, f.complete as never, { strictWebinar: true });
  assert.equal(r.degraded, null);
  assert.deepEqual(f.phases, ["extract-summary", "judge", "extract-summary", "judge", "extract-summary", "judge"]);
  assert.equal(f.hints[0], undefined);
  assert.match(String(f.hints[1]), /omitted/);
  assert.match(String(f.hints[2]), /omitted/);
  assert.equal(r.page.citedItems!.length, 2);
  assert.deepEqual(f.kinds, ["summarize", "output-verifier", "output-verifier"]); // hybrid: retries extract with the verifier model
});

test("summary: persistent protocol failure is bounded (3 extracts), emits nothing, degrades only because no grounded insight exists", async () => {
  const f = fake("summarize", 99);
  const r = await summarizeSession(turns, f.complete as never, { strictWebinar: true });
  assert.ok(r.degraded); assert.equal(r.page.citedItems, undefined);
  assert.equal(f.phases.filter((x) => x === "extract-summary").length, 3); // full window, then each lone-span half once
});

test("claims: same bounded half-window retry", async () => {
  const ok = fake("claims", 1);
  const r = await extractClaims(turns, ok.complete as never, { strictWebinar: true, dropUnverified: true });
  assert.equal(r.degraded, null);
  assert.equal(r.claims.length, 2);
  assert.equal(ok.phases.filter((x) => x === "extract-claims").length, 3);
  const bad = fake("claims", 99);
  const d = await extractClaims(turns, bad.complete as never, { strictWebinar: true, dropUnverified: true });
  assert.equal(d.degraded, null); assert.deepEqual(d.claims, []); // skipped, not crashed
  assert.equal(bad.phases.filter((x) => x === "extract-claims").length, 3);
});

test("coverage acknowledgement: the span's own sessionId echo is tolerated; strings, other extra keys and altered rows are retryable protocol errors", async () => {
  const { assertRuntimeCoverage, runtimeWindows, runtimeInventory, RuntimeIncompleteError } = await import("../grounded.js");
  const spans = runtimeWindows(turns)[0]!, inv = runtimeInventory(spans);
  assertRuntimeCoverage(inv, spans);
  assertRuntimeCoverage(inv.map((r, i) => ({ ...r, sessionId: spans[i]!.sessionId })), spans);
  for (const bad of [spans.map((s) => s.turnId), inv.map((r) => ({ ...r, extra: 1 })), inv.map((r) => ({ ...r, sessionId: "other" })), inv.slice(1), inv.map((r) => ({ ...r, digest: "0" }))])
    assert.throws(() => assertRuntimeCoverage(bad, spans), RuntimeIncompleteError);
});

test("windows hold at most budget/8 characters of source text (2000 at the default budget)", async () => {
  const { runtimeWindows } = await import("../grounded.js");
  const long = [turn(0, "Fees are listed. ".repeat(500)), turn(1, "Short line here."), turn(2, "Another short line.")];
  const ws = runtimeWindows(long);
  assert.ok(ws.length > 4);
  for (const w of ws) assert.ok(w.reduce((n, x) => n + x.text.length, 0) <= 2000);
  assert.ok(runtimeWindows(long, 32000).length < ws.length);
});
