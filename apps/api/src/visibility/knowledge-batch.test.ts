/**
 * apps/api/src/visibility/knowledge-batch.test.ts - D-206 K1. `filterTurns` resolves visibility with a bounded number of
 * reads (O(distinct sessions), not O(rows)) and a hard deadline, while every exclusion the per-row loop enforced still
 * holds on the batched path. One regression per exclusion reason: this is the ISS-078 class (a leak that survives a
 * green suite), so each case asserts the EXCLUDED row is absent next to a VISIBLE control row in the same batch.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import { createKnowledgeVisibility, newVisibilityRequestMemo, VisibilityDeadlineError } from "./knowledge.js";
import { headId } from "../transcript-review/store.js";

type Row = Record<string, unknown>;
const T = "tenant-a";
function values(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => values(item, path));
  if (!path.length) return [value];
  if (!value || typeof value !== "object") return [];
  return values((value as Row)[path[0]!], path.slice(1));
}
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => values(row, key.split(".")).some(actual => {
    if (expected && typeof expected === "object" && "$in" in expected) return (expected as { $in: unknown[] }).$in.includes(actual);
    return actual === expected;
  }));
}

/** `sessions` s0..s(n-1): each a consented recording with `perSession` turns. Mutate `rows` to open a hole per test. */
function corpus(sessionCount: number, perSession: number) {
  const rows: Record<string, Row[]> = { sessions: [], sources: [], turns: [], whatsapp_candidates: [], transcript_reviews: [], claims: [], whatsapp_review_log: [] };
  for (let s = 0; s < sessionCount; s++) {
    rows.sources!.push({ _id: `src${s}`, tenantId: T, kind: "recording", path: `p${s}`, consent: { given: true, recordedBy: "owner" } });
    rows.sessions!.push({ _id: `s${s}`, tenantId: T, sourceId: `src${s}`, title: `S${s}`, date: "2026-01-01", status: { transcribe: "done", index: "done" } });
    for (let n = 0; n < perSession; n++) rows.turns!.push({ _id: `s${s}-t${n}`, tenantId: T, sessionId: `s${s}`, speakerRef: "spk:0", tStart: n, tEnd: n + 1, text: `Visa guidance number ${s}-${n}.` });
  }
  const calls: { coll: string; op: string; filter: Row }[] = [];
  const db = { collection: (name: string) => ({
    find: (filter: Row) => { calls.push({ coll: name, op: "find", filter: structuredClone(filter) });
      return { toArray: async () => structuredClone((rows[name] ?? []).filter(r => matches(r, filter))) }; },
    findOne: async (filter: Row) => { calls.push({ coll: name, op: "findOne", filter: structuredClone(filter) });
      return structuredClone((rows[name] ?? []).find(r => matches(r, filter)) ?? null); },
  }) } as unknown as Pick<Db, "collection">;
  const turn = (id: string) => rows.turns!.find(r => r._id === id)!;
  return { rows, db, calls, turn, visibility: createKnowledgeVisibility(db) };
}
const ids = (rows: { _id: string }[]) => rows.map(r => r._id);

test("K1: reads are O(distinct sessions), not O(rows): 200 rows over 4 sessions", async () => {
  const f = corpus(4, 50), all = f.rows.turns! as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  const out = await f.visibility.filterTurns(T, all);
  assert.deepEqual(ids(out), ids(all), "every visible row is kept, in input order");
  assert.ok(f.calls.length <= 40, `expected a bounded number of reads, saw ${f.calls.length} for ${all.length} rows`);
  assert.equal(f.calls.filter(c => c.coll === "sessions").length, 4, "one session read per DISTINCT session");
  assert.equal(f.calls.filter(c => c.coll === "sources").length, 4, "one source read per DISTINCT session");
  assert.ok(f.calls.every(c => c.filter.tenantId === T), "every read is tenant-qualified");
});

test("K1: a shared request memo resolves each session's context once across several filterTurns calls", async () => {
  const f = corpus(3, 10), all = f.rows.turns! as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  const memo = newVisibilityRequestMemo();
  for (let i = 0; i < 5; i++) await f.visibility.filterTurns(T, all.slice(i * 6, i * 6 + 6), { memo });
  assert.equal(f.calls.filter(c => c.coll === "sessions").length, 3, "5 rounds, still 3 session reads");
  const bare = corpus(3, 10);
  for (let i = 0; i < 5; i++) await bare.visibility.filterTurns(T, (bare.rows.turns! as never as typeof all).slice(i * 6, i * 6 + 6));
  assert.ok(bare.calls.filter(c => c.coll === "sessions").length > 3, "without a memo the contexts are re-read (the memo is request-scoped, not global)");
});

test("K1: output keeps input order and duplicates are not invented", async () => {
  const f = corpus(2, 3), all = f.rows.turns! as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  const shuffled = [all[4]!, all[0]!, all[3]!, all[1]!];
  assert.deepEqual(ids(await f.visibility.filterTurns(T, shuffled)), ids(shuffled));
});

// ---- one regression per exclusion reason, each next to a visible control row -----------------------------------------
type Mutate = (f: ReturnType<typeof corpus>) => void;
const EXCLUSIONS: [string, Mutate][] = [
  ["consent withdrawn on the source", f => { (f.rows.sources![1] as Row).consent = { given: false, recordedBy: "owner" }; }],
  ["source row missing", f => { f.rows.sources!.splice(1, 1); }],
  ["session row missing", f => { f.rows.sessions!.splice(1, 1); }],
  ["session points at a source that does not exist", f => { (f.rows.sessions![1] as Row).sourceId = "ghost"; }],
  ["unknown source kind", f => { (f.rows.sources![1] as Row).kind = "voice-memo"; }],
  ["non-WhatsApp source relabelled over a WhatsApp review candidate", f => { f.rows.whatsapp_candidates!.push({ _id: "cand", tenantId: T, sessionId: "s1", sourceId: "src1" }); }],
  ["unapproved WhatsApp-batch source (no approved claim)", f => { (f.rows.sources![1] as Row).kind = "whatsapp-batch"; }],
  ["session belongs to another tenant", f => { (f.rows.sessions![1] as Row).tenantId = "tenant-b"; }],
  ["source belongs to another tenant", f => { (f.rows.sources![1] as Row).tenantId = "tenant-b"; }],
  ["live turn no longer exists", f => { f.rows.turns = f.rows.turns!.filter(r => r.sessionId !== "s1"); }],
  ["live turn text changed since the candidate was read", f => { for (const r of f.rows.turns!) if (r.sessionId === "s1") r.text = "edited after read"; }],
  ["live turn text now CONTAINS the candidate text (edited after read)", f => { for (const r of f.rows.turns!) if (r.sessionId === "s1") r.text = `${r.text} and an appended claim`; }],
  ["live turn moved to a different session", f => { for (const r of f.rows.turns!) if (r.sessionId === "s1") r.sessionId = "s0"; }],
  ["live turn is malformed (no speaker)", f => { for (const r of f.rows.turns!) if (r.sessionId === "s1") delete r.speakerRef; }],
  ["live turn has inverted times", f => { for (const r of f.rows.turns!) if (r.sessionId === "s1") { r.tStart = 9; r.tEnd = 1; } }],
];
for (const [name, mutate] of EXCLUSIONS) test(`K1 exclusion on the batched path: ${name}`, async () => {
  const f = corpus(3, 2);
  const snapshot = structuredClone(f.rows.turns!) as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  mutate(f);
  const out = await f.visibility.filterTurns(T, snapshot);
  const leaked = out.filter(r => r.sessionId === "s1" && snapshot.find(s => s._id === r._id)!.sessionId === "s1");
  assert.deepEqual(ids(leaked), [], `rows of the excluded session leaked: ${ids(leaked)}`);
  assert.deepEqual(ids(out).filter(id => id.startsWith("s0-") || id.startsWith("s2-")).sort(),
    ["s0-t0", "s0-t1", "s2-t0", "s2-t1"].filter(id => f.rows.turns!.some(r => r._id === id)),
    "control rows of healthy sessions stay visible");
});

test("K1 exclusion: a row stamped for another tenant, or asked of another tenant, is never returned", async () => {
  const f = corpus(2, 2), all = structuredClone(f.rows.turns!) as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  const foreign = { ...all[0]!, tenantId: "tenant-b" };
  assert.deepEqual(ids(await f.visibility.filterTurns(T, [foreign, all[1]!])), [all[1]!._id]);
  assert.deepEqual(await f.visibility.filterTurns("tenant-b", all), [], "asking as tenant-b matches none of tenant-a's rows");
});

test("K1 exclusion: a review overlay that rewrites the text is the text that is judged (stale candidate dropped)", async () => {
  const f = corpus(2, 2), snapshot = structuredClone(f.rows.turns!) as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  f.rows.transcript_reviews!.push({ _id: headId(T, "s1"), tenantId: T, sessionId: "s1", revision: "r1", overlay: [{ turnId: "s1-t0", text: "Corrected text.", speakerRef: "spk:0" }] });
  const out = await f.visibility.filterTurns(T, snapshot);
  assert.ok(!ids(out).includes("s1-t0"), "the stale raw text no longer matches the effective turn");
  assert.ok(ids(out).includes("s1-t1") && ids(out).includes("s0-t0"));
  const corrected = await f.visibility.filterTurns(T, [{ ...snapshot[2]!, text: "Corrected text." }]);
  assert.deepEqual(ids(corrected), ["s1-t0"], "the corrected text itself is visible");
});

test("K1 exclusion: errors fail closed (empty), never a partial or optimistic result", async () => {
  const f = corpus(2, 2), snapshot = structuredClone(f.rows.turns!) as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  const broken = createKnowledgeVisibility({ collection: (name: string) => name === "sources"
    ? { findOne: async () => { throw new Error("mongo down"); }, find: () => ({ toArray: async () => { throw new Error("mongo down"); } }) }
    : f.db.collection(name) } as never);
  assert.deepEqual(await broken.filterTurns(T, snapshot), []);
});

test("K1: WhatsApp-batch rows still need the strict per-turn approval proof", async () => {
  const f = corpus(2, 2), snapshot = structuredClone(f.rows.turns!) as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  (f.rows.sources![1] as Row).kind = "whatsapp-batch";
  (f.rows.sources![1] as Row).path = "group@g.us";
  const out = await f.visibility.filterTurns(T, snapshot);
  assert.deepEqual(ids(out).sort(), ["s0-t0", "s0-t1"], "unreviewed WhatsApp sibling turns stay out even with a consented source");
});

// ---- deadline -----------------------------------------------------------------------------------------------------
test("K5: a store that never answers cannot hold the visibility step past its deadline", async () => {
  const hang = new Promise<never>(() => undefined);
  const visibility = createKnowledgeVisibility({ collection: () => ({ find: () => ({ toArray: () => hang }), findOne: () => hang }) } as never);
  const started = Date.now();
  await assert.rejects(visibility.filterTurns(T, [{ _id: "x", tenantId: T, sessionId: "s", text: "t" }], { deadlineAt: Date.now() + 40 }), VisibilityDeadlineError);
  assert.ok(Date.now() - started < 1000, "rejected promptly, not after the store's own timeout");
});

test("K5: an already-expired deadline rejects without reading", async () => {
  const f = corpus(1, 1);
  await assert.rejects(f.visibility.filterTurns(T, f.rows.turns! as never, { deadlineAt: Date.now() - 1 }), VisibilityDeadlineError);
  assert.equal(f.calls.length, 0);
});

test("K5: a deadline that is not hit changes nothing", async () => {
  const f = corpus(2, 2), all = f.rows.turns! as never as { _id: string; tenantId: string; sessionId: string; text: string }[];
  assert.deepEqual(ids(await f.visibility.filterTurns(T, all, { deadlineAt: Date.now() + 5000 })), ids(all));
});
