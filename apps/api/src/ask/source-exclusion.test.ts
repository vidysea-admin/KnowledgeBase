/**
 * Lane badturns, D-153 (pending append): /ask EXCLUDES a scoped turn that fails row validation (per turn, with a structured
 * warning naming session and turn) and keeps answering from the rest. Scope breaches (foreign tenant / session) still refuse;
 * if EVERY row is invalid the existing refusal stands. Fakes only. Real shapes: visa-blueprint t141 (2008 > 213), ucas t114 (1883 > 1868).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { TreeIndexNode, Turns } from "@lkb/core";
import { askV2, BoundedAskError, validateHydration } from "@lkb/ask";
import { createSourceHydrator, createSourceRequestDepsFor } from "./source-context.js";
import { unpackContext } from "../../../../packages/ask/src/bounded-refine.js";
import { withVisibleTranscripts } from "../visibility/read-fixture.js";

const VISA = "2026-04-21-visa-blueprint-part2-italy-france-nz", UCAS = "2026-08-10-ucas-what-changed-what-matters", OK = "2026-05-08-funding-dreams-loans-forex";
const row = (sessionId: string, n: number, text: string, tStart: number, tEnd: number, extra: Partial<Turns> = {}): Turns =>
  ({ _id: `${sessionId}-t${n}`, tenantId: "toc", sessionId, speakerRef: "spk:0", tStart, tEnd, text, ...extra });
const node = (sessionId: string, title: string): TreeIndexNode => ({ node_id: `tenant:toc/session:${sessionId}`, title, level: "session", summary: "", evidence: { sessionRef: sessionId }, children: [] });
const tree = (...kids: TreeIndexNode[]): TreeIndexNode => ({ node_id: "tenant:toc", title: "toc", level: "tenant", summary: "", children: kids });
function fakeDb(turns: Turns[]) {
  return withVisibleTranscripts(fakeFind(turns), () => turns as unknown as Record<string, unknown>[]);
}
function fakeFind(turns: Turns[]) {
  return { collection: (name: string) => ({ find: (filter: Record<string, unknown>) => ({ toArray: async () => name !== "turns" ? [] : turns.filter((r) => {
    const ids = (filter.sessionId as { $in?: string[] }).$in; return r.tenantId === filter.tenantId && (!ids || ids.includes(r.sessionId)); }) }) }) } as unknown as Pick<Db, "collection">;
}
const completion = (json: unknown) => ({ text: JSON.stringify(json), json, provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
const quotesOf = (n: TreeIndexNode) => n.evidence!.sourceQuotes as { turnId: string; quote: string; sessionRef: string }[];

const visaN = node(VISA, "Visa forms"), okN = node(OK, "Loans forex");
const T141 = row(VISA, 141, "Visa forms for Italy open in October, the bad row shout visa forms October October.", 2008, 213);
const GOOD_VISA = row(VISA, 140, "Visa forms for France open in October.", 1990, 2005);
const GOOD_OK = row(OK, 2, "Education loans cover tuition for visa students in October.", 486, 545);

test("one bad turn: it is excluded (per turn), named in a structured warning, never cited; other turns and sessions still answer", async () => {
  const result = await createSourceHydrator("toc", { db: fakeDb([T141, GOOD_VISA, GOOD_OK]) })("visa forms October", [visaN, okN]);
  assert.deepEqual(result.excludedTurns, [{ sessionId: VISA, turnId: `${VISA}-t141`, reason: "tEnd 213 is before tStart 2008" }]);
  const nodes = validateHydration(result, [visaN, okN]);
  assert.deepEqual(nodes.map((n) => n.evidence!.sessionRef).sort(), [OK, VISA].sort(), "the session with a bad turn is NOT dropped");
  const cited = nodes.flatMap(quotesOf).map((q) => q.turnId);
  assert.ok(cited.includes(`${VISA}-t140`) && cited.includes(GOOD_OK._id));
  assert.ok(!cited.includes(`${VISA}-t141`), "excluded turn never cited");
  assert.ok(!JSON.stringify(nodes).includes("bad row shout"));
});
test("end to end askV2: the answer is produced and the response carries the structured warning naming session and turn", async () => {
  const deps = createSourceRequestDepsFor({ db: fakeDb([T141, GOOD_VISA, GOOD_OK]), write: async () => {}, treeSearchFn: () => [visaN, okN],
    dispatch: async (job) => {
      if (job.kind === "ask.select_nodes") return completion({ node_ids: [visaN.node_id, okN.node_id] });
      if (job.kind === "evaluator") return completion({ score: 0.9, reason: "source answers" });
      if (job.kind === "ask.answer_grounding") return completion({ decisions: [{ id: "sentence-0", supported: true, answersQuery: true }] });
      const context = unpackContext(JSON.parse(job.messages[1]!.content).context);
      return completion({ sentences: [{ text: "Forms open in October.", sourceIds: [context[0]!.sourceId] }] });
    } })("toc");
  const result = await askV2("visa forms October", tree(visaN, okN), { ...deps, tenantId: "toc" });
  assert.equal(result.verdict, "correct"); assert.equal(result.answer, "Forms open in October.");
  const warn = result.auditLog.find((a) => a.jobKind === "ask.source_rows_excluded");
  assert.ok(warn, "warning present in the response");
  assert.deepEqual(warn.excludedTurns, [{ sessionId: VISA, turnId: `${VISA}-t141`, reason: "tEnd 213 is before tStart 2008" }]);
  assert.match(warn.step, new RegExp(`session ${VISA} turn ${VISA}-t141`));
  const cited = result.sources.internal.flatMap((n) => quotesOf(n as TreeIndexNode).map((q) => q.turnId));
  assert.ok(cited.length > 0 && !cited.includes(`${VISA}-t141`));
});
test("no invalid row: no warning field at all", async () => {
  const result = await createSourceHydrator("toc", { db: fakeDb([GOOD_VISA, GOOD_OK]) })("visa forms October", [visaN, okN]);
  assert.equal("excludedTurns" in result, false);
});
test("real shapes: visa t141 (2008>213) and ucas t114 (1883>1868) are both excluded and named", async () => {
  const ucasN = node(UCAS, "UCAS");
  const rows = [T141, GOOD_VISA, row(UCAS, 114, "UCAS deadlines changed in January.", 1883, 1868), row(UCAS, 113, "UCAS deadlines are in January.", 1800, 1850)];
  const result = await createSourceHydrator("toc", { db: fakeDb(rows) })("UCAS deadlines January", [visaN, ucasN]);
  assert.deepEqual(result.excludedTurns!.map((e) => `${e.sessionId}/${e.turnId}`).sort(), [`${UCAS}/${UCAS}-t114`, `${VISA}/${VISA}-t141`].sort());
  const cited = validateHydration(result, [visaN, ucasN]).flatMap(quotesOf).map((q) => q.turnId);
  assert.ok(cited.includes(`${UCAS}-t113`) && !cited.includes(`${UCAS}-t114`));
});
test("a session whose every turn is invalid is skipped (and named); the other session still answers", async () => {
  const result = await createSourceHydrator("toc", { db: fakeDb([T141, GOOD_OK]) })("visa forms October", [visaN, okN]);
  assert.deepEqual(validateHydration(result, [visaN, okN]).map((n) => n.evidence!.sessionRef), [OK]);
  assert.equal(result.excludedTurns![0]!.sessionId, VISA);
});
test("EVERY row invalid: the existing refusal, never an empty success", async () => {
  await assert.rejects(() => createSourceHydrator("toc", { db: fakeDb([T141, row(OK, 9, "x", 5, 1)]) })("visa", [visaN, okN]),
    (e: unknown) => e instanceof BoundedAskError && /invalid scoped source row/.test((e as Error).message));
});
test("tenant scoping unchanged: a foreign-tenant or foreign-session row still refuses the whole request, never a warning", async () => {
  for (const bad of [row(OK, 7, "FOREIGN", 1, 2, { tenantId: "other" }), row("not-admitted", 7, "FOREIGN", 1, 2)]) {
    // a db that does NOT filter, to simulate a poisoned read
    const db = { collection: () => ({ find: () => ({ toArray: async () => [GOOD_OK, bad] }) }) } as unknown as Pick<Db, "collection">;
    await assert.rejects(() => createSourceHydrator("toc", { db })("loans", [okN]), BoundedAskError);
  }
});
test("validateHydration refuses a hydration that cites an excluded turn", async () => {
  const good = await createSourceHydrator("toc", { db: fakeDb([GOOD_OK]) })("loans October", [okN]);
  const citedTurn = quotesOf(good.nodes[0]!)[0]!.turnId;
  assert.throws(() => validateHydration({ ...good, excludedTurns: [{ sessionId: OK, turnId: citedTurn, reason: "x" }] }, [okN]), /excluded turn cited/);
});
test("ISS-BADTURNS-003: a negative tStart (with tEnd >= tStart) is excluded with its own reason, not cited", async () => {
  const neg = row(OK, 8, "Education loans negative start October.", -5, 10);
  const result = await createSourceHydrator("toc", { db: fakeDb([neg, GOOD_OK]) })("education loans October", [okN]);
  assert.deepEqual(result.excludedTurns, [{ sessionId: OK, turnId: neg._id, reason: "tStart -5 is negative" }]);
  assert.ok(!validateHydration(result, [okN]).flatMap(quotesOf).some((q) => q.turnId === neg._id));
});
test("ISS-BADTURNS-002: a foreign-tenant or foreign-session CHUNK that covers an excluded turn refuses the request (never dropped)", async () => {
  const chunk = (fields: Record<string, unknown>) => ({ _id: "c1", tenantId: "toc", sourceRef: OK, turnRefs: [`${VISA}-t141`], chunkIndex: 0, vector: [1, 0], dims: 2, embeddingModel: "fixture", ...fields });
  for (const bad of [chunk({ tenantId: "other" }), chunk({ sourceRef: "not-admitted" })]) {
    const db = withVisibleTranscripts({ collection: (name: string) => ({ find: () => ({ toArray: async () => name === "turns" ? [T141, GOOD_VISA, GOOD_OK] : [bad] }) }) } as unknown as Pick<Db, "collection">,
      () => [T141, GOOD_VISA, GOOD_OK] as unknown as Record<string, unknown>[]);
    await assert.rejects(() => createSourceHydrator("toc", { db, embed: async () => ({ vectors: [[1, 0]], dims: 2, provider: "offline", model: "fixture" }) })("visa forms October", [visaN, okN]), BoundedAskError);
  }
});
test("ISS-BUDGETAPI-002: scope is checked BEFORE timing exclusion: a row that is foreign AND badly timed refuses the whole request, never an exclusion", async () => {
  for (const bad of [row(OK, 8, "FOREIGN", 50, 10, { tenantId: "other" }), row("not-admitted", 8, "FOREIGN", 50, 10), row(OK, 9, "FOREIGN", -5, 10, { tenantId: "other" })]) {
    const db = { collection: () => ({ find: () => ({ toArray: async () => [GOOD_OK, bad] }) }) } as unknown as Pick<Db, "collection">;
    await assert.rejects(() => createSourceHydrator("toc", { db })("loans", [okN]), BoundedAskError);
  }
});
