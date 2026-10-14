/**
 * ISS-GROUNDBUDGET-001: strict grounded summarisation of long sessions. The extract request (spans + duplicated
 * inventory + wrapper) must fit the request budget, windows split on span boundaries, every claim still cites
 * turns inside its own window. Fake `complete` only; no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turns } from "@lkb/core";
import type { CompleteResult } from "@lkb/ai";
import { summarizeSession, type SummarizeCompleteFn } from "./summarize.js";
import { runtimeWindows, runtimeRequestBudget, runtimeChronologicalTurns, runtimeInventory } from "./grounded.js";

const turn = (i: number, text: string): Turns => ({ _id: `t${i}`, tenantId: "t1", sessionId: "s1", speakerRef: `spk:${i % 3}`, tStart: i * 10, tEnd: i * 10 + 5, text });
const done = (o: unknown): CompleteResult => ({ text: JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake", costUsd: 0 });
type R = Record<string, unknown>;
function fixture(mutate: (phase: string, payload: R, reply: R) => void = () => {}) {
  const sizes: number[] = [], seen: R[] = [];
  const complete: SummarizeCompleteFn = async (job) => {
    const content = job.messages[1]!.content, p = JSON.parse(content) as R; sizes.push(content.length); seen.push(p);
    const spans = (p.spans ?? []) as { turnId: string; sessionId: string; text: string; origin: string }[];
    let reply: R;
    if (p.phase === "extract-summary") reply = { processed: p.inventory, qa: [], items: spans.map((s) => ({ kind: "insight", text: s.text, origin: s.origin, verification: "unverified", evidence: [{ turnId: s.turnId, sessionId: s.sessionId, quote: s.text }] })) };
    else reply = { processed: p.inventory, complete: true, noContent: false, verdicts: ((p.items ?? []) as { id: string }[]).map((x) => ({ id: x.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    mutate(p.phase as string, p, reply); return done(reply);
  };
  return { complete, sizes, seen };
}
const longSession = (n = 400) => Array.from({ length: n }, (_, i) => turn(i, `Speaker statement number ${i} about admissions, fees and deadlines for programme ${i % 17}.`));

test("400-turn session passes strict mode: every request within budget, every claim cites a real in-window turn", async () => {
  const turns = longSession(), ids = new Set(turns.map((t) => t._id));
  const { complete, sizes, seen } = fixture();
  const r = await summarizeSession(turns, complete, { strictWebinar: true });
  assert.equal(r.degraded, null);
  assert.equal(r.page.coveredTurnIds!.length, 400);
  const extractSizes = seen.map((p, i) => p.phase === "extract-summary" ? sizes[i]! : 0);
  assert.ok(extractSizes.every((s) => s <= 16000), `max extract request ${Math.max(...extractSizes)}`);
  assert.ok(sizes.every((s, i) => s <= (seen[i]!.phase === "judge" ? 64000 : 16000)));
  assert.ok(seen.filter((p) => p.phase === "extract-summary").length > 5, "several windows");
  assert.equal(r.page.citedItems!.length, 400);
  for (const item of r.page.citedItems!) for (const e of item.evidence) { assert.ok(ids.has(e.turnId)); assert.ok(turns.find((t) => t._id === e.turnId)!.text.includes(e.quote)); }
});

test("the 73-short-turn shape that overflowed (extract payload > 16000 with 12000 of spans) is now split", () => {
  const turns = Array.from({ length: 73 }, (_, i) => turn(i, `Short line ${i} on fees and EMI options for students.`.repeat(1 + (i % 2))));
  const ws = runtimeWindows(turns);
  for (const w of ws) assert.ok(JSON.stringify({ phase: "extract-summary", spans: w, inventory: runtimeInventory(w) }).length <= 16000);
});

test("a claim citing a turn outside its own window is refused (session degrades, nothing invented)", async () => {
  const turns = longSession(120);
  let first = true;
  const { complete } = fixture((phase, payload, reply) => {
    if (phase !== "extract-summary" || !first) return;
    first = false;
    const spans = payload.spans as { turnId: string; sessionId: string }[];
    const outside = turns.find((t) => !spans.some((s) => s.turnId === t._id))!;
    (reply.items as { text: string; evidence: R[] }[])[0] = { kind: "insight", text: outside.text, origin: "speaker-statement", verification: "unverified", evidence: [{ turnId: outside._id, sessionId: "s1", quote: outside.text }] } as never;
  });
  const r = await summarizeSession(turns, complete, { strictWebinar: true });
  assert.ok(r.degraded); assert.match(r.degraded!.reason, /quote not bound to submitted source/); assert.equal(r.page.coveredTurnIds, undefined);
});

test("short session windows are identical to the previous fixed-12000 algorithm", () => {
  const old = (turnsIn: Turns[]) => { // verbatim previous packing rule on the same spans
    const spans = runtimeWindows(turnsIn, 1e9).flat(); const out: typeof spans[] = []; let cur: typeof spans = [];
    for (const s of spans) { if (JSON.stringify([...cur, s]).length > 12000) { out.push(cur); cur = cur.slice(-2); while (JSON.stringify([...cur, s]).length > 12000) cur.shift(); } cur.push(s); }
    if (cur.length) out.push(cur); return out;
  };
  for (const n of [1, 2, 5, 12, 18]) { const t = longSession(n); assert.deepEqual(runtimeWindows(t), old(runtimeChronologicalTurns(t)), `n=${n}`); }
});

test("LKB_GROUNDED_REQUEST_BUDGET: default 16000, larger budget gives fewer windows, junk refuses", () => {
  assert.equal(runtimeRequestBudget({}), 16000); assert.equal(runtimeRequestBudget({ LKB_GROUNDED_REQUEST_BUDGET: "32000" }), 32000);
  for (const bad of ["abc", "100", "-5", "16000.5"]) assert.throws(() => runtimeRequestBudget({ LKB_GROUNDED_REQUEST_BUDGET: bad }));
  const t = longSession(400); assert.ok(runtimeWindows(t, 32000).length < runtimeWindows(t, 16000).length);
});
