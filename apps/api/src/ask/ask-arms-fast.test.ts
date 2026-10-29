/** D-206 K1/K2: /ask no longer loads or visibility-filters EVERY tenant turn (batched, memoised, best-slice-first visibility). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode } from "@lkb/core";
import { createAskArmsFor } from "./ask-arms.js";
import { withVisibleTranscripts } from "../visibility/read-fixture.js";
import { chunkContentMatches } from "../indexing/chunk-integrity.js";
import { TREE, applyFilter, cursor, completeRows, type Row } from "./ask-arms.testsupport.js";

const embedOk = async () => ({ vectors: [[1, 0, 0]], dims: 3, provider: "fake", model: "fake" });

import { rankSessionsByCosine, lexicalSearchTurns } from "@lkb/index";

const nodeFor = (id: string) => `tenant:t1/year:2026/month:06/session:${id}`;
function bigTree(ids: string[]): TreeIndexNode {
  return { node_id: "tenant:t1", title: "t1", level: "tenant", summary: "", children: [{ node_id: "tenant:t1/year:2026", title: "2026", level: "year", summary: "",
    children: ids.map((id) => ({ node_id: nodeFor(id), title: id, level: "session" as const, summary: "", children: [] })) }] };
}
/** fakeDb + a log of every `turns` read and a hook that withdraws sessions (consent=false) via the visibility fixture. */
function armsFixture(shorthand: { chunks?: unknown[]; turns?: unknown[] }, withdrawn: string[] = []) {
  const rows = completeRows(shorthand);
  const turnFinds: Row[] = [];
  const base = { collection(name: string) { return { find: (filter?: Row) => {
    if (name === "turns") turnFinds.push(filter ?? {});
    const all = (name === "chunks" ? rows.chunks : name === "turns" ? rows.turns : []) as Row[];
    return cursor(applyFilter(all, filter));
  } }; } } as unknown as Pick<Db, "collection">;
  const extraSources = withdrawn.map((sessionId) => ({ _id: `fixture-source:${sessionId}`, tenantId: "t1", kind: "recording", path: `fixture/${sessionId}`, consent: { given: false, recordedBy: "owner" } }));
  return { rows, turnFinds, db: withVisibleTranscripts(base, () => rows.turns, { sources: extraSources }) };
}
const proofSize = (finds: Row[]) => Math.max(0, ...finds.filter(f => f._id !== undefined).map(f => ((f._id as { $in: unknown[] }).$in).length));

test("K1: the lexical arm proves visibility for the best slice only, never for every tenant turn", async () => {
  const turns = Array.from({ length: 600 }, (_, i) => ({ _id: `t${i}`, sessionId: `s${i % 6}`, text: `visa guidance filler ${"x ".repeat(i % 7)}number ${i}` }));
  const f = armsFixture({ turns });
  const res = await createAskArmsFor({ db: f.db })("t1")("visa guidance", bigTree(["s0", "s1", "s2", "s3", "s4", "s5"]));
  assert.equal(res.degraded, null);
  assert.ok(res.arms[0]!.length > 0);
  assert.ok(proofSize(f.turnFinds) <= 48, `visibility proof covered ${proofSize(f.turnFinds)} of 600 turns`);
  assert.equal(f.turnFinds.filter(find => find._id === undefined && find.sessionId === undefined && find.$or === undefined).length, 0, "no unfiltered turns.find({})");
});

test("K1: a withdrawn session is excluded from BOTH arms even when it is the best match, and healthy sessions still surface", async () => {
  const turns = [
    ...Array.from({ length: 30 }, (_, i) => ({ _id: `w${i}`, sessionId: "s-withdrawn", text: "scholarship deadline scholarship deadline" })),
    { _id: "g1", sessionId: "s-good", text: "scholarship information only" },
  ];
  const chunks = [{ _id: "cw", sourceRef: "s-withdrawn", vector: [1, 0, 0] }, { _id: "cg", sourceRef: "s-good", vector: [0.8, 0.2, 0] }];
  const f = armsFixture({ turns, chunks }, ["s-withdrawn"]);
  const res = await createAskArmsFor({ db: f.db, embed: embedOk as never })("t1")("scholarship deadline", bigTree(["s-withdrawn", "s-good"]));
  const ids = res.arms.map(arm => arm.map(n => n.node_id));
  assert.deepEqual(ids, [[nodeFor("s-good")], [nodeFor("s-good")]], "vector then lexical arm: only the healthy session");
});

test("K1: the vector arm examines only the sessions that can still reach the top k (40 sessions, k=2)", async () => {
  const sessions = Array.from({ length: 40 }, (_, i) => `v${i}`);
  const turns = sessions.map((s, i) => ({ _id: `${s}-t`, sessionId: s, text: `topic ${i}` }));
  const chunks = sessions.map((s, i) => ({ _id: `c${i}`, sourceRef: s, vector: [1 - i * 0.02, i * 0.02, 0] }));
  const f = armsFixture({ turns, chunks });
  const res = await createAskArmsFor({ db: f.db, embed: embedOk as never, k: 2 })("t1")("zzzz", bigTree(sessions));
  assert.equal(res.degraded, null);
  assert.deepEqual(res.arms[0]!.map(n => n.node_id), [nodeFor("v0"), nodeFor("v1")]);
  const loaded = new Set(f.turnFinds.flatMap(find => find.sessionId ? ((find.sessionId as { $in: string[] }).$in) : []));
  assert.ok(loaded.size < 40, `loaded ${loaded.size} of 40 sessions' turns`);
});

test("K1 equivalence: the vector arm returns exactly what the old load-everything algorithm returned (random vectors, withdrawals, stale chunks)", async () => {
  let seed = 99;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let round = 0; round < 20; round++) {
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const turns = ids.flatMap((s) => [{ _id: `${s}a`, sessionId: s, text: `alpha ${s}` }, { _id: `${s}b`, sessionId: s, text: `beta ${s}` }]);
    const withdrawn = ids.filter(() => rand() < 0.3);
    const chunks = ids.flatMap((s) => [0, 1].map((n) => ({ _id: `${s}-c${n}`, sourceRef: s, vector: [rand(), rand(), rand()] })));
    const f = armsFixture({ turns, chunks }, withdrawn);
    // make ~20% of chunks stale (id no longer binds to the current turn text)
    for (const c of f.rows.chunks) if (rand() < 0.2) (c as Row)._id = `stale-${String((c as Row)._id)}`;
    const k = 1 + Math.floor(rand() * 5), qv = [rand(), rand(), rand()];
    const embed = (async () => ({ vectors: [qv], dims: 3, provider: "fake", model: "fake" })) as never;
    const arms = await createAskArmsFor({ db: f.db, embed, k })("t1")("nomatchterm", bigTree(ids));
    // Reference: the pre-D-206 shape. Every chunk whose session is visible AND whose id still binds -> rank.
    const visible = new Set(ids.filter((s) => !withdrawn.includes(s)));
    const byTurn = new Map(f.rows.turns.filter((t) => visible.has(t.sessionId as string)).map((t) => [t._id as string, t]));
    const compatible = f.rows.chunks.filter((c) => chunkContentMatches(c as never, byTurn as never, "t1"));
    const expected = rankSessionsByCosine(qv, compatible as never, k, { skipMismatched: true }).map((h) => nodeFor(h.sessionId));
    assert.deepEqual(arms.arms[0]!.map((n) => n.node_id), expected, `round ${round} k=${k} withdrawn=${withdrawn}`);
  }
});

test("K1: the lexical arm equals filter-everything-then-score over a random corpus with withdrawn sessions", async () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const words = ["visa", "loan", "uk", "canada", "ielts", "fees", "toronto", "cost", "living"];
  for (let round = 0; round < 20; round++) {
    const ids = ["l0", "l1", "l2", "l3", "l4"];
    const turns = Array.from({ length: 80 }, (_, i) => ({ _id: `x${i}`, sessionId: ids[i % 5]!, text: Array.from({ length: 2 + Math.floor(rand() * 4) }, () => words[Math.floor(rand() * words.length)]).join(" ") }));
    const withdrawn = ids.filter(() => rand() < 0.4);
    const f = armsFixture({ turns }, withdrawn);
    const query = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => words[Math.floor(rand() * words.length)]).join(" ");
    const k = 1 + Math.floor(rand() * 5);
    const res = await createAskArmsFor({ db: f.db, k })("t1")(query, bigTree(ids));
    const visible = f.rows.turns.filter((t) => !withdrawn.includes(t.sessionId as string));
    const hits = lexicalSearchTurns(query, visible as never, k);
    const expected = [...new Set(hits.map((h) => h.sessionId))].map(nodeFor);
    assert.deepEqual(res.arms[0]!.map((n) => n.node_id), expected, `round ${round} q=${query} k=${k} withdrawn=${withdrawn}`);
  }
});

test("K1 deadline: a store that never answers degrades the arms with a reason instead of hanging /ask", async () => {
  const hang = new Promise<never>(() => undefined);
  const db = { collection: () => ({ find: () => ({ limit() { return this; }, toArray: () => hang }), findOne: () => hang }) } as unknown as Pick<Db, "collection">;
  const started = Date.now();
  const res = await createAskArmsFor({ db, embed: embedOk as never, visibilityDeadlineMs: 60 })("t1")("visa", TREE);
  assert.ok(Date.now() - started < 8000);
  assert.ok(res.degraded !== null, "a hung store must be reported as a degradation");
});

test("K2 bound: above the 5000-candidate read ceiling the lexical arm degrades VISIBLY (a `lexical:` reason), never silently empty", async () => {
  const turns = Array.from({ length: 5001 }, (_, i) => ({ _id: `t${i}`, sessionId: `s${i % 3}`, text: `visa guidance ${i}` }));
  const f = armsFixture({ turns });
  const res = await createAskArmsFor({ db: f.db })("t1")("visa", bigTree(["s0", "s1", "s2"]));
  assert.match(res.degraded ?? "", /lexical: .*candidate limit exceeded/);
  assert.deepEqual(res.arms.flat(), []);
});
