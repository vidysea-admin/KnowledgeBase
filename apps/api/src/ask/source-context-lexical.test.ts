/** Lexical/year-shorthand source hydration tests, split from source-context.test.ts (pure relocation). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode, Turns } from "@lkb/core";
import { createSourceHydrator } from "./source-context.js";
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
