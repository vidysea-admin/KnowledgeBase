/**
 * t043-ask-webinar-citation-proof. Hermetic proof of the Ask retrieval -> citation path over
 * webinar-shaped content: askV2 with the bounded source-context option, real selectNodes / rrfMerge /
 * membership guard / validateHydration / evaluator / answer code, and in-memory fakes for the model,
 * the tree-search seam and the hydrator. No network, DB, LLM or embeddings.
 *
 * SCOPE OF THE TENANT CLAIM. packages/ask does not filter by tenant: the tenant boundary on this
 * path is (1) the per-tenant tree apps/api loads, (2) the tenant-bound hydrator/arms apps/api
 * injects. What THIS package owns, and what these tests pin, is that it never widens that scope:
 * foreign nodes, foreign quotes and foreign evidence offered by an arm, the selector or a hydrator
 * are refused, and nothing foreign reaches context, citations or observability output.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TreeIndexNode } from "@lkb/core";
import type { CompleteResult, Job } from "@lkb/ai";
import { askV2, type AskV2Deps } from "./ask-v2.js";
import { BoundedAskError, type SourceQuote } from "./source-context.js";
import { unpackContext } from "./bounded-refine.js";
import { fakeTreeSearch, fakeWrite } from "./testUtils.js";
import {
  A_SESSIONS, A_TENANT, B_MARKERS, B_SESSION, hydratorOver, quotesOf, treeFor,
} from "./webinar-fixture.js";

const STOP = new Set(["which", "were", "what", "that", "with", "from", "was"]);
const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];
const terms = (q: string): string[] => [...new Set(words(q).filter((w) => w.length > 3 && !STOP.has(w)))];
const passageText = (n: TreeIndexNode): string => {
  try { return (JSON.parse(n.summary) as { quote: string }[]).map((x) => x.quote).join(" "); } catch { return n.summary; }
};
/** Lexical scorer: coverage of query terms (90%) + term-frequency saturation (10%). A passage that
 * repeats the query terms outranks one that states the answer once. */
const lexicalScore = (query: string, node: TreeIndexNode): [number, string] => {
  const ws = words(passageText(node)), ts = terms(query);
  const cov = ts.filter((t) => ws.includes(t)).length / Math.max(1, ts.length);
  const occ = ws.filter((w) => ts.includes(w)).length;
  return [0.9 * cov + 0.1 * Math.min(1, occ / 6), "keyword overlap"];
};

const A_TREE = treeFor(A_TENANT, A_SESSIONS);
const A_STORE = new Map(A_SESSIONS.map((s) => [s.nodeId, quotesOf(s)]));
const B_NODE_QUOTES = quotesOf(B_SESSION);
const quoteOf = (sessionRef: string, turnId: string): SourceQuote =>
  quotesOf(A_SESSIONS.find((s) => s.sessionRef === sessionRef)!).find((q) => q.turnId === turnId)!;

const res = (json: unknown): CompleteResult => ({ text: JSON.stringify(json), json, provider: "fake", model: "fake-model",
  costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });

interface Run { result: Awaited<ReturnType<typeof askV2>>; jobs: Job[]; written: ReturnType<typeof fakeWrite>;
  hydrateSeen: string[][]; cited: { sourceId: string; source: unknown; text: string }[] }

async function run(query: string, opts: { tenantId?: string; selectExtra?: string[]; arms?: AskV2Deps["extraCandidateArmsFn"];
  store?: Map<string, SourceQuote[]>; hydrate?: AskV2Deps["sourceContext"] } = {}): Promise<Run> {
  const jobs: Job[] = [], hydrateSeen: string[][] = [], cited: Run["cited"] = [];
  const written = fakeWrite();
  const complete = async (job: Job): Promise<CompleteResult> => {
    jobs.push(job);
    const user = job.messages[job.messages.length - 1]!.content;
    if (job.kind === "ask.select_nodes") {
      // A selector that picks every session it was SHOWN, plus any ids the test makes it hallucinate.
      const shown = [...user.matchAll(/^- (\S+) \|/gm)].map((m) => m[1]!).filter((id) => id.includes("/session:"));
      return res({ node_ids: [...shown, ...(opts.selectExtra ?? [])] });
    }
    if (job.kind === "ask.answer") {
      const ctx = JSON.parse(user) as { query: string; context: Parameters<typeof unpackContext>[0] };
      const strips = unpackContext(ctx.context);
      const ts = terms(ctx.query);
      const best = strips.map((s) => ({ s, n: ts.filter((t) => words(s.text).includes(t)).length }))
        .sort((a, b) => b.n - a.n)[0]!.s;
      cited.push({ sourceId: best.sourceId, source: best.source, text: best.text });
      return res({ sentences: [{ text: best.text, sourceIds: [best.sourceId] }] });
    }
    if (job.kind === "ask.answer_grounding") {
      const ids = (JSON.parse(user) as { sentences: { id: string }[] }).sentences.map((s) => s.id);
      return res({ decisions: ids.map((id) => ({ id, supported: true, answersQuery: true })) });
    }
    throw new Error("unexpected completion kind " + job.kind);
  };
  const store = opts.store ?? A_STORE;
  const result = await askV2(query, A_TREE, {
    complete, scoreFn: lexicalScore, treeSearchFn: fakeTreeSearch, write: written,
    tenantId: opts.tenantId ?? A_TENANT, lower: 0.5,
    sourceContext: opts.hydrate ?? { hydrate: hydratorOver(store, hydrateSeen) },
    ...(opts.arms ? { extraCandidateArmsFn: opts.arms } : {}),
  });
  return { result, jobs, written, hydrateSeen, cited };
}

const noForeign = (label: string, value: unknown): void => {
  const s = JSON.stringify(value);
  for (const m of B_MARKERS) assert.ok(!s.includes(m), `${label} leaked tenant-B marker "${m}"`);
};
const EUROPE = "Which countries were suggested for Europe?";
const PRICING = "What pricing model was settled on?";

test("fixture sanity: the tenant-B bait really outscores tenant A's right answer", () => {
  const a = lexicalScore(EUROPE, { node_id: "x", title: "", level: "session", children: [], summary: JSON.stringify(quotesOf(A_SESSIONS[1]!)) } as TreeIndexNode)[0];
  const b = lexicalScore(EUROPE, { node_id: "y", title: "", level: "session", children: [], summary: JSON.stringify(B_NODE_QUOTES) } as TreeIndexNode)[0];
  assert.ok(b > a && a >= 0.7, `bait ${b} must exceed answer ${a}`);
});

test("Europe question: retrieves the right passage and cites the exact session, turn, speaker and timing", async () => {
  const { result, cited, jobs } = await run(EUROPE);
  const expected = quoteOf("wb-a-002", "wb-a-002-t8");
  assert.equal(result.verdict, "correct");
  assert.equal(result.insufficient_coverage, false);
  assert.match(result.answer, /Germany, Poland and Portugal/);
  // Only the matching session is a citation: the Europe-only distractor (1 of 3 terms) is below `lower`.
  assert.deepEqual(result.sources.internal.map((s) => s.node_id), ["tenant:tA/session:wb-a-002"]);
  // The strip the answer was grounded on carries exactly the fixture's identity tuple.
  assert.equal(cited.length, 1);
  assert.deepEqual(cited[0]!.source, { speakerRef: "Priya", turnId: "wb-a-002-t8", sessionRef: "wb-a-002", tStart: 312.5, tEnd: 341 });
  assert.equal(cited[0]!.text, expected.quote);
  // The citation record returned to the caller carries the full quote proof, equal to the fixture.
  const ev = result.sources.internal[0]!.evidence as { sessionRef: string; sourceQuotes: SourceQuote[] };
  assert.equal(ev.sessionRef, "wb-a-002");
  assert.deepEqual(ev.sourceQuotes.find((q) => q.id === cited[0]!.sourceId), expected);
  // The model saw the session turn time in its answer prompt.
  const answerJob = jobs.find((j) => j.kind === "ask.answer")!;
  assert.ok(answerJob.messages[1]!.content.includes("312.5") && answerJob.messages[1]!.content.includes("Priya"));
});

test("retrieval ranges across sessions: all three are candidates and a second question is answered from a different one", async () => {
  const first = await run(EUROPE), second = await run(PRICING);
  assert.deepEqual([...first.hydrateSeen[0]!].sort(), A_SESSIONS.map((s) => s.nodeId).sort());
  assert.equal(second.hydrateSeen[0]!.length, 3);
  assert.deepEqual(second.result.sources.internal.map((s) => s.node_id), ["tenant:tA/session:wb-a-003"]);
  assert.deepEqual(second.cited[0]!.source, { speakerRef: "Arjun", turnId: "wb-a-003-t3", sessionRef: "wb-a-003", tStart: 95.5, tEnd: 120 });
  assert.notEqual(first.cited[0]!.sourceId.split(":")[0], second.cited[0]!.sourceId.split(":")[0]);
});

test("tenant-B bait absent from context, citations, audit trail, job ledger and every model prompt", async () => {
  const r = await run(EUROPE);
  noForeign("result", r.result);
  noForeign("job writes", r.written.writes);
  noForeign("model prompts", r.jobs);
  assert.ok(r.written.writes.every((w) => w.tenantId === A_TENANT), "every job row carries the requesting tenant");
});

test("an arm that returns the tenant-B passage is dropped, reported, and never reaches any output", async () => {
  const bait = { node_id: B_SESSION.nodeId, title: B_SESSION.title, level: "session", summary: JSON.stringify(B_NODE_QUOTES), children: [],
    evidence: { sessionRef: B_SESSION.sessionRef, sourceQuotes: B_NODE_QUOTES } } as TreeIndexNode;
  const r = await run(EUROPE, { arms: async () => ({ arms: [[bait]], degraded: null }) });
  assert.match(r.result.answer, /Germany, Poland and Portugal/);
  assert.deepEqual(r.result.sources.internal.map((s) => s.node_id), ["tenant:tA/session:wb-a-002"]);
  assert.ok(r.result.auditLog.some((e) => e.jobKind === "ask.candidates_dropped"), "dropping is reported");
  noForeign("result", r.result); noForeign("job writes", r.written.writes); noForeign("model prompts", r.jobs);
  assert.ok(!r.hydrateSeen.flat().includes(B_SESSION.nodeId), "bait never reaches the hydrator");
});

test("a foreign node wearing tenant A's real node_id cannot substitute its evidence", async () => {
  const wearer = { node_id: "tenant:tA/session:wb-a-002", title: "x", level: "session", summary: JSON.stringify(B_NODE_QUOTES), children: [],
    evidence: { sessionRef: B_SESSION.sessionRef, sourceQuotes: B_NODE_QUOTES } } as TreeIndexNode;
  const r = await run(EUROPE, { arms: async () => ({ arms: [[wearer]], degraded: null }) });
  assert.match(r.result.answer, /Germany, Poland and Portugal/);
  noForeign("result", r.result); noForeign("model prompts", r.jobs);
});

test("a selector that names a tenant-B node id gets nothing: ids resolve only inside the supplied tree", async () => {
  const r = await run(EUROPE, { selectExtra: [B_SESSION.nodeId] });
  assert.deepEqual(r.result.sources.internal.map((s) => s.node_id), ["tenant:tA/session:wb-a-002"]);
  noForeign("result", r.result); noForeign("job writes", r.written.writes);
  // the selector's own hallucinated id is the only B marker allowed anywhere: it is not in what followed it
  noForeign("later model prompts", r.jobs.filter((j) => j.kind !== "ask.select_nodes"));
});

test("a hydrator that returns tenant-B quotes (or a tenant-B node) is refused, not trusted", async () => {
  const swapQuotes = { hydrate: async () => {
    const n = { ...A_TREE.children[1]!, summary: JSON.stringify(B_NODE_QUOTES),
      evidence: { sessionRef: "wb-a-002", sourceQuotes: B_NODE_QUOTES, sourceSnapshotSHA256: "a".repeat(64) } } as TreeIndexNode;
    return { nodes: [n], snapshotSHA256: "a".repeat(64), sourceBytes: 1 };
  } };
  await assert.rejects(run(EUROPE, { hydrate: swapQuotes }), (e: unknown) => e instanceof BoundedAskError && /quote proof/.test(e.reason));
  const foreignNode = { hydrate: async () => {
    const n = { node_id: B_SESSION.nodeId, title: "t", level: "session", children: [], summary: JSON.stringify(B_NODE_QUOTES),
      evidence: { sessionRef: B_SESSION.sessionRef, sourceQuotes: B_NODE_QUOTES, sourceSnapshotSHA256: "a".repeat(64) } } as TreeIndexNode;
    return { nodes: [n], snapshotSHA256: "a".repeat(64), sourceBytes: 1 };
  } };
  await assert.rejects(run(EUROPE, { hydrate: foreignNode }), (e: unknown) => e instanceof BoundedAskError && /outside admitted/.test(e.reason));
});

test("missing/empty tenant: the package neither widens retrieval nor rewrites the tenant on audit rows", async () => {
  for (const tenantId of ["", "   "]) {
    const r = await run(EUROPE, { tenantId });
    // Scope is the tree supplied; an empty tenant id does not trigger any all-tenant lookup.
    assert.deepEqual(r.result.sources.internal.map((s) => s.node_id), ["tenant:tA/session:wb-a-002"]);
    noForeign("result", r.result); noForeign("job writes", r.written.writes);
    assert.ok(r.written.writes.length > 0 && r.written.writes.every((w) => w.tenantId === tenantId), "tenant is passed through verbatim, never defaulted");
  }
});

test("insufficient internal coverage is reported, not answered from unrelated sessions", async () => {
  const r = await run("What was the quarterly revenue of Atlantis?");
  assert.equal(r.result.verdict, "incorrect");
  assert.equal(r.result.insufficient_coverage, true);
  assert.deepEqual(r.result.sources.internal, []);
  assert.match(r.result.answer, /No supported internal source/);
  assert.ok(!r.jobs.some((j) => j.kind === "ask.answer"), "no answer generation without evidence");
});
