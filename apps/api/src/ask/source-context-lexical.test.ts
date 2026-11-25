/** Lexical/year-shorthand source hydration tests, split from source-context.test.ts (pure relocation). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode, Turns } from "@lkb/core";
import { validateHydration } from "@lkb/ask";
import { createSourceHydrator, createSourceRequestDepsFor } from "./source-context.js";
import { withVisibleTranscripts } from "../visibility/read-fixture.js";
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
  return { db: withVisibleTranscripts(db, () => (rows.turns ?? []) as unknown as Record<string, unknown>[]), filters };
}

test("content terms outrank common question wording and short irrelevant speaker mentions", async () => {
  const answer = source("Stellar bursary applicants require a robotics portfolio.", { _id: "specific", speakerRef: "Mira", tStart: 100, tEnd: 110 });
  const crowd = Array.from({ length: 20 }, (_, i) => source("What did Mira say about a bursary and what did she describe to the students?", { _id: "crowd-" + i, speakerRef: "Mira", tStart: i, tEnd: i + 1 }));
  const short = source("Hi!", { _id: "short", speakerRef: "Mira", tStart: 30, tEnd: 31 });
  const { db } = fakeDb({ turns: [...crowd, short, answer] });
  const proof = await createSourceHydrator("toc", { db })("Which Stellar bursary requirement did Mira describe?", [node]);
  assert.equal((proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string }[])[0]!.turnId, "specific");
});
test("standard irregular verb families and plural forms match neutral source wording", async () => {
  for (const [query, text] of [
    ["Who bought robotics portfolios?", "The school is buying robotics portfolios for applicants."],
    ["Who led the exchange?", "The council is leading the exchange."],
    ["Who wrote applications?", "A mentor is writing an application."],
    ["Who grew the bursary?", "The foundation is growing the bursary."],
  ]) {
    const { db } = fakeDb({ turns: [source(text, { _id: "answer" }), source("Business news and physics.", { _id: "unrelated", tStart: 1, tEnd: 2 })] });
    const proof = await createSourceHydrator("toc", { db })(query!, [node]);
    assert.equal((proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string }[])[0]!.turnId, "answer", query);
  }
});
test("LED acronyms and singular nouns are not mistaken for verb/plural inflections", async () => {
  const rows = [source("Leading a business requires news awareness and physics.", { _id: "verbs" }),
    source("LED panels cut power consumption.", { _id: "device", tStart: 30, tEnd: 31 })];
  const { db } = fakeDb({ turns: rows });
  const diagnostics: { turnId: string; lexical: number }[] = [];
  const proof = await createSourceHydrator("toc", { db, observePassages: (_id, hits) => diagnostics.push(...hits) })("LED", [node]);
  assert.equal((proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string }[])[0]!.turnId, "device");
  assert.equal(diagnostics.find(h => h.turnId === "verbs"), undefined);
});
test("explicit calendar shorthand matches a unique query year while quantities remain literal", async () => {
  for (const [query, answer] of [["2031 admissions", "The '31 admissions opened in September."], ["1998 graduates", "The class of '98 graduates chose research."]]) {
    const rows = [source(answer, { _id: "calendar", tStart: 50, tEnd: 51 }),
      source("31 admissions documents and 31% graduates.", { _id: "quantity" }),
      source("The '31' admissions exercise is a quoted quantity.", { _id: "quoted", tStart: 1, tEnd: 2 }),
      source("These are '32 admissions documents.", { _id: "other-year", tStart: 2, tEnd: 3 })];
    const { db } = fakeDb({ turns: rows });
    const proof = await createSourceHydrator("toc", { db })(query!, [node]);
    const q = (proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string; quote: string }[])[0]!;
    assert.equal(q.turnId, "calendar", query); assert.equal(q.quote, answer);
  }
});
test("ambiguous centuries, quoted shorthand and noncalendar apostrophes cannot resolve a year", async () => {
  for (const [query, text] of [["1926 2026", "The '26 placements increased."], ["2026", "The '26' placements increased."],
    ["2026", "26 placements and 26% uptake."], ["2026", "He bought '26 apples."],
    ["2026", "The report says year '26% of responses."], ["2026", "He counted in '26 apples."]]) {
    const { db } = fakeDb({ turns: [source(text)] });
    const proof = await createSourceHydrator("toc", { db })(query!, [node]);
    assert.equal(proof.nodes.length, 0, query + ": " + text);
  }
});
test("a long answer keeps approximate figures, historical differences and source offsets literally", async () => {
  const text = "Background context. ".repeat(22) + "For the '34 placements, renewables led at roughly 23%. Last year it was 11.2%; services remained about 17–18%, depending on the final cohort.";
  const answer = source(text, { _id: "qualified", speakerRef: "Rhea", tStart: 700, tEnd: 740 });
  const { db } = fakeDb({ turns: [answer, source("2034 placements are promising.", { _id: "intro", tStart: 1, tEnd: 2 })] });
  const proof = await createSourceHydrator("toc", { db })("Which sector led 2034 placements and at what share?", [node]);
  const qs = proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string; quote: string; charStart: number; charEnd: number; tStart: number; tEnd: number }[];
  const q = qs.find(q => q.turnId === "qualified")!;
  assert.equal(q.quote, text); assert.match(q.quote, /roughly 23%/); assert.match(q.quote, /Last year it was 11.2%/); assert.match(q.quote, /17–18%/);
  assert.equal(q.charStart, 0); assert.equal(q.charEnd, text.length); assert.equal(q.tStart, 700); assert.equal(q.tEnd, 740);
  assert.ok(Buffer.byteLength(JSON.stringify(qs)) <= 3500);
});
test("duplicate source wording retains actual distinct turn identities and times", async () => {
  const text = "Applicants should compare commutes, campus size, academic experience and friendships.";
  const rows = [source(text, { _id: "dup-a", tStart: 10, tEnd: 11 }), source(text, { _id: "dup-b", tStart: 20, tEnd: 21 })];
  const { db } = fakeDb({ turns: rows });
  const proof = await createSourceHydrator("toc", { db })("compare commutes campus size", [node]);
  const qs = proof.nodes[0]!.evidence!.sourceQuotes as { turnId: string; tStart: number; quote: string; id: string }[];
  assert.deepEqual(qs.map(q => q.turnId), ["dup-a", "dup-b"]); assert.deepEqual(qs.map(q => q.tStart), [10, 20]);
  assert.notEqual(qs[0]!.id, qs[1]!.id); assert.ok(qs.every(q => q.quote === text));
});

// ---- F1B (ask-condition-fidelity, unit f1-whole-turn-hydration): the hydrator hands whole cited turns to answer generation ----------------
const nodeOf = (sessionId: string): TreeIndexNode => ({ ...node, node_id: "tenant:toc/session:" + sessionId, evidence: { sessionRef: sessionId } });
const quotesOf = (nodes: TreeIndexNode[]) => nodes.flatMap((n) => n.evidence!.sourceQuotes as { turnId: string; quote: string; charStart: number; charEnd: number; byteEnd: number }[]);

test("[F1B-C1] liveTurns carries each cited turn whole, byte for byte, next to the unchanged slices; a turn over the 16 KiB cap is left out, never cut", async () => {
  const mid = "Visa forms open in October, café déjà vu. ".repeat(80);      // about 3.4 KB of multibyte text
  const big = "Visa forms open in October. ".repeat(720);                   // 20,160 bytes
  assert.ok(Buffer.byteLength(mid) >= 3000 && Buffer.byteLength(mid) < 16384); assert.ok(Buffer.byteLength(big) > 16384);
  const a = source(mid, { _id: "a-t1", sessionId: "a" }), b = source(big, { _id: "b-t1", sessionId: "b" });
  const { db } = fakeDb({ turns: [a, b] });
  const admitted = [nodeOf("a"), nodeOf("b")];
  const hydrated = await createSourceHydrator("toc", { db })("visa October", admitted);
  // the slices stay exactly as before: bounded excerpts of the turn, never the turn
  const quotes = quotesOf(hydrated.nodes);
  assert.ok(quotes.some((q) => q.turnId === "a-t1") && quotes.some((q) => q.turnId === "b-t1"), "both turns are cited");
  assert.ok(quotes.every((q) => Buffer.byteLength(q.quote) <= 1024 && q.quote.length < (q.turnId === "a-t1" ? mid : big).length));
  assert.deepEqual(hydrated.liveTurns, [{ sessionId: "a", turnId: "a-t1", text: mid }]);
  assert.equal(Buffer.from(hydrated.liveTurns![0]!.text, "utf8").equals(Buffer.from(mid, "utf8")), true, "byte for byte");
  // CORE-REQUEST-1 (changed assertion, was: the over-cap turn's quotes are excluded as stale): the over-cap turn is named in overCapTurns, its quotes survive
  // validation as excerpt evidence (never whole, so an answer that cites it is held), and nothing is reported as excluded.
  assert.deepEqual(hydrated.overCapTurns, [{ sessionId: "b", turnId: "b-t1" }]);
  const kept = validateHydration(hydrated, admitted);
  assert.deepEqual([...new Set(quotesOf(kept).map((q) => q.turnId))].sort(), ["a-t1", "b-t1"]);
  assert.equal(hydrated.excludedTurns, undefined);
  // guard: a cited turn that is missing from liveTurns for any other reason is still a stale proof and excluded; only the turn the hydrator named is relaxed
  const missing = structuredClone(hydrated); missing.liveTurns = [];
  assert.deepEqual([...new Set(quotesOf(validateHydration(missing, admitted)).map((q) => q.turnId))], ["b-t1"]);
  assert.deepEqual([...new Set(missing.excludedTurns!.map((e) => e.turnId))], ["a-t1"]);
  assert.throws(() => validateHydration({ ...hydrated, overCapTurns: [{ sessionId: "", turnId: "b-t1" }] }, admitted), /invalid over-cap turn list/);
});

test("[F1B-I1] liveTurns adds no read: the store is read the same number of times as before, with the same filters", async () => {
  const { db, filters } = fakeDb({ turns: [source("Visa forms open in October. ".repeat(60)), source("Another speaker.", { _id: "s-t2", tStart: 30, tEnd: 40 })] });
  const hydrated = await createSourceHydrator("toc", { db })("visa October", [node]);
  assert.ok(hydrated.liveTurns!.length > 0);
  // measured at the branch point f7eb479f with this same fixture (hydrator unchanged there): the scoped read of the admitted sessions, then the visibility gate's read by id
  assert.deepEqual(filters, BASE_READS);
  assert.ok(filters.every((f) => f.filter.tenantId === "toc"), "every read is tenant scoped");
});
const BASE_READS = [{ name: "turns", filter: { sessionId: { $in: ["s"] }, tenantId: "toc" } }, { name: "turns", filter: { _id: { $in: ["s-t1", "s-t2"] }, tenantId: "toc" } }];

test("[F1B-I1] two tenants: a turn of tenant B, a foreign turn smuggled into the session, and a turn the visibility gate drops never appear in liveTurns", async () => {
  const own = source("Visa forms open in October. Only the team of tenant A sees this.");
  const foreign = source("TENANT-B SECRET visa forms close in May.", { _id: "b-t1", tenantId: "other", sessionId: "s" });
  const hiddenRow = source("WITHHELD visa forms are cancelled.", { _id: "s-hidden", tStart: 30, tEnd: 40 });
  const rows = [own, foreign, hiddenRow];
  const { db: plain } = fakeDb({ turns: rows });
  // the visibility gate re-reads raw turns by id; a turn it cannot confirm for this caller is dropped
  const gated = { collection: (name: string) => { const c = plain.collection(name) as unknown as { find: (f: Record<string, unknown>) => unknown } & Record<string, unknown>;
    return name !== "turns" ? c : { ...c, find: (f: Record<string, unknown>) => (f._id as { $in?: string[] } | undefined)?.$in
      ? { limit() { return this; }, toArray: async () => rows.filter((r) => (f._id as { $in: string[] }).$in.includes(r._id) && r._id !== "s-hidden" && r.tenantId === f.tenantId) }
      : c.find(f) }; } } as unknown as typeof plain;
  const hydrated = await createSourceHydrator("toc", { db: gated })("visa forms October", [node]);
  const everything = JSON.stringify(hydrated);
  assert.deepEqual(hydrated.liveTurns!.map((t) => t.turnId), ["s-t1"]);
  for (const leak of ["TENANT-B SECRET", "WITHHELD"]) assert.equal(everything.includes(leak), false, leak);
  // with no tenant enforcement in the store, a foreign row in scope refuses the request instead of reaching liveTurns
  const { db: lax } = fakeDb({ turns: [own, foreign] }, false);
  await assert.rejects(createSourceHydrator("toc", { db: lax })("visa", [node]), /invalid scoped source row/);
});

test("[F1B-C1] the mixed transcript plus native hydration passes the transcript liveTurns through", async () => {
  const nativeNode: TreeIndexNode = { node_id: "native", title: "Native", level: "topic", summary: "", children: [], evidence: { sourceId: "source", revisionHash: "a".repeat(64) } };
  const turn = source("Visa forms open in October."); const { db } = fakeDb({ turns: [turn] });
  const deps = createSourceRequestDepsFor({ db, dispatch: async () => ({ text: "{}", json: {}, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } }), treeSearchFn: () => [], write: async () => {},
    nativeSources: () => ({ async hydrate(_q, admitted) { return { nodes: [], snapshotSHA256: "b".repeat(64), sourceBytes: 1 }; }, async revalidate() {} }) })("toc");
  const mixed = await deps.sourceContext!.hydrate("visa October", [node, nativeNode]);
  assert.equal(mixed.nodes.length, 1);
  assert.deepEqual(mixed.liveTurns, [{ sessionId: "s", turnId: "s-t1", text: turn.text }]);
  assert.equal(mixed.overCapTurns, undefined);
});

test("[F1B-C1] the mixed transcript plus native hydration passes the over-cap turn list through, so its quotes still validate", async () => {
  const nativeNode: TreeIndexNode = { node_id: "native", title: "Native", level: "topic", summary: "", children: [], evidence: { sourceId: "source", revisionHash: "a".repeat(64) } };
  const { db } = fakeDb({ turns: [source("Visa forms open in October. ".repeat(720))] });
  const deps = createSourceRequestDepsFor({ db, dispatch: async () => ({ text: "{}", json: {}, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } }), treeSearchFn: () => [], write: async () => {},
    nativeSources: () => ({ async hydrate() { return { nodes: [], snapshotSHA256: "b".repeat(64), sourceBytes: 1 }; }, async revalidate() {} }) })("toc");
  const mixed = await deps.sourceContext!.hydrate("visa October", [node, nativeNode]);
  assert.deepEqual([mixed.liveTurns, mixed.overCapTurns], [[], [{ sessionId: "s", turnId: "s-t1" }]]);
  assert.ok(validateHydration(mixed, [node]).length === 1 && mixed.nodes.length === 1, "the over-cap quotes survive the second validation");
});
