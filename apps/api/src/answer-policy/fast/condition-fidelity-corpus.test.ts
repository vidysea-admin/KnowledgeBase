/**
 * F1 ask-condition-fidelity (qa/contracts/ask-condition-fidelity.md, D-227): the recorded corpus is the floor (D-015).
 * Re-runs VERBATIM, through the real answer workflow and the Mongo evidence verifier, the 14 archived UC probes and every
 * failing case of the cycle-3 FAIL of kb-ask-web-grounding-repair (inputs and provenance: condition-fidelity-corpus.json).
 * The harness is the cycle-3 independent-check harness (cb83c010 log lines 1755-1795); no live model call, no web, no lkb_prod.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { TreeIndexNode } from "@lkb/core";
import type { AskV2Deps, AskV2Result } from "@lkb/ask";
import { createAnswerPolicyService } from "../service.js";
import { createInMemoryAnswerPolicyStore } from "../store.js";
import { createInMemoryAnswerRecordStore } from "../answer-record-store.js";
import { createAnswerWorkflow } from "../answer-workflow.js";
import { answerEvidence, conditionReleaseHold, createMongoEvidenceVerifier, digest, whyUnverified } from "../answer-evidence.js";
import { answerTestDb } from "../answer-testdb.js";

interface Row { _id: string; tenantId: string; sessionId: string; speakerRef: string; tStart: number; tEnd: number; text: string }
interface Src { id: string; text: string; row?: Row }
interface Draft { text: string; sourceIds: string[] }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const corpus = JSON.parse(readFileSync(new URL("./condition-fidelity-corpus.json", import.meta.url), "utf8"));
const repo = new URL("../../../../../", import.meta.url);
const A = corpus.provenance.archivedTurn;
const rows: Row[] = JSON.parse(readFileSync(new URL(A.path, repo), "utf8"));
const raw = rows.find((t) => t._id === A.turnId)!;
const tenant = raw.tenantId, session = raw.sessionId;
const prefix = raw.text.slice(0, A.recordedExcerptChars);
const P = corpus.ucProbes;
const SAT: string = P.questions.SAT, ENGLISH: string = P.questions.English;
const real: Src = { id: "t042", text: prefix, row: raw };
const other: Src = { id: "uncited", text: P.uncited };
const source = (id: string, text: string): Src => ({ id, text });
const draft = (text: string, ...sourceIds: string[]): Draft => ({ text, sourceIds });
const result = (json: unknown) => ({ json, text: JSON.stringify(json), provider: "offline", model: "fixture", costUsd: 0, usage: { inputTokens: 1, outputTokens: 1 } });
const snap = sha("offline verified fixture");

/** The recorded check() harness. `live` adds the hydrator's live turn text (SourceHydration.liveTurns) for every turn. */
async function check(query: string, evidence: Src[], drafts: Draft[], opt: { mode?: "deep"; live?: boolean } = {}) {
  const db = answerTestDb(), store = createInMemoryAnswerRecordStore();
  db.rows("sessions").push({ _id: session, tenantId: tenant, sourceId: "rec" });
  db.rows("sources").push({ _id: "rec", tenantId: tenant, kind: "recording" });
  const node: TreeIndexNode = { node_id: "session-node", title: "Inside the UC", level: "session", summary: "", evidence: { sessionRef: session }, children: [] };
  const tree: TreeIndexNode = { node_id: "root", title: "Tenant", level: "tenant", summary: "", children: [node] };
  const turnRows: Row[] = [];
  const quotes = evidence.map((s) => {
    const r = s.row ?? { _id: "fixture-" + s.id, tenantId: tenant, sessionId: session, speakerRef: "Presenter", tStart: 10, tEnd: 20, text: s.text };
    db.rows("turns").push({ ...r }); turnRows.push(r);
    return { id: s.id, nodeId: node.node_id, sessionRef: session, turnId: r._id, speakerRef: r.speakerRef, tStart: r.tStart, tEnd: r.tEnd, charStart: 0, charEnd: s.text.length,
      byteStart: 0, byteEnd: Buffer.byteLength(s.text), turnTextSHA256: sha(r.text), sliceSHA256: sha(s.text), quote: s.text, origin: "speech" as const };
  });
  let web = 0; const calls: string[] = []; let presented: { sourceId: string; text: string }[] = [];
  const deps: AskV2Deps = { tenantId: tenant, scoreFn: () => [0.99, "offline"], lower: 0.5, upper: 0.8, write: async () => {},
    treeSearchFn: (r, ids) => r.children.filter((n) => ids.includes(n.node_id)), extraCandidateArmsFn: async () => ({ arms: [[node]], degraded: null }),
    tavilySearchFn: async () => { web++; return [{ url: "https://example.test/evidence", content: "Fixture only." }]; },
    sourceContext: { hydrate: async (_q, nodes) => ({ nodes: nodes.map((n) => ({ ...n, summary: JSON.stringify(quotes), evidence: { ...n.evidence, sourceQuotes: quotes, sourceSnapshotSHA256: snap } })),
      snapshotSHA256: snap, sourceBytes: quotes.reduce((t, q) => t + q.byteEnd, 0),
      ...(opt.live ? { liveTurns: turnRows.map((r) => ({ sessionId: session, turnId: r._id, text: r.text })) } : {}) }) },
    complete: async (job) => {
      calls.push(job.kind);
      if (job.kind === "ask.select_nodes") return result({ node_ids: [node.node_id] });
      const data = JSON.parse(job.messages.find((m) => m.role === "user")!.content);
      if (job.kind === "ask.answer") {
        const ctx = data.context;
        presented = ctx?.strips && ctx?.sources ? ctx.strips.map((s: { sourceIndex: number; text: string }) => ({ sourceId: ctx.sources[s.sourceIndex].sourceId, text: s.text })) : [];
        return result({ sentences: drafts });
      }
      if (job.kind === "ask.answer_grounding") return result({ decisions: data.sentences.map((s: { id: string }) => ({ id: s.id, supported: true, answersQuery: true })) });
      throw new Error(job.kind);
    } } as AskV2Deps;
  const wf = createAnswerWorkflow(createAnswerPolicyService(createInMemoryAnswerPolicyStore()), store, createMongoEvidenceVerifier(db.db));
  const out = await wf.execute(tenant, { query, questionClass: "admissions", evidenceMode: true, filters: { sessionIds: [], sources: "all", ...(opt.mode ? { mode: opt.mode } : {}) } },
    { actor: "api-key:fixture" }, tree, deps);
  const record = (await store.get(tenant, out.runId))!, reopen = (await wf.get(tenant, out.runId)).result;
  const history = (await wf.history(tenant)).find((h) => h.id === out.runId)!;
  const tuples = (v: typeof out) => v.sources.internal.flatMap((n) => (n.evidence!.sourceQuotes as { id: string; turnId: string; speakerRef: string; tStart: number; tEnd: number }[])
    .map((q) => [q.id, q.turnId, q.speakerRef, q.tStart, q.tEnd]));
  const ids = tuples(out).map((q) => q[0]);
  // Recorded invariants of the harness: reopen equals execute, sourceEvidence = released citations, fast budget, no web.
  assert.deepEqual([out.answer, out.state, ids], [reopen.answer, reopen.state, tuples(reopen).map((q) => q[0])]);
  assert.deepEqual(out.sourceEvidence.flatMap((e) => (e.source.evidence as { sourceQuotes: { id: string }[] }).sourceQuotes.map((q) => q.id)), ids);
  if (!opt.mode) assert.ok(calls.length <= 2, calls.join(","));
  assert.equal(web, 0);
  return { out, record, reopen, history, ids, tuples: tuples(out), calls, presented, evidence };
}
type Run = Awaited<ReturnType<typeof check>>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const stripsOf = (r: Run, id: string) => r.presented.filter((s) => s.sourceId === id).map((s) => s.text).join(" ");

/** F1-C3: held means withheld. Nothing of a held draft is in the public response or the released history; the stored
 * candidate (the reviewer's copy, never published) keeps it. A draft that is itself verbatim source text (V-E4) is checked
 * outside the cited-evidence fields, which publish the source, not the answer. */
function assertWithheld(r: Run, drafts: Draft[], reason: RegExp) {
  assert.equal(r.out.state, "review", r.out.reason); assert.equal(r.out.answer, "");
  assert.equal(r.reopen.answer, ""); assert.equal(r.history.result.answer, ""); assert.equal(r.history.result.state, "review");
  assert.match(r.out.reason, /^held for review: /); assert.match(r.out.reason, reason);
  const strip = (v: Record<string, unknown>) => { const { sources: _s, sourceEvidence: _e, scored: _c, ...rest } = v; return rest; };
  for (const d of drafts) {
    const inEvidence = r.evidence.some((s) => s.text.includes(d.text));
    for (const [where, view] of [["public", r.out], ["history", r.history]] as const) {
      const json = JSON.stringify(inEvidence ? strip((where === "public" ? view : (view as typeof r.history).result) as never) : view);
      assert.equal(json.includes(d.text), false, `${where} output carries held draft: ${d.text.slice(0, 60)}`);
    }
    assert.ok(r.record.candidate.answer.includes(d.text), "the review copy keeps the held draft");
  }
}
const assertReleased = (r: Run, answer: string, ids: string[]) => {
  assert.equal(r.out.state, "allowed", r.out.reason); assert.equal(r.out.answer, answer); assert.deepEqual(r.ids, ids);
  assert.equal(r.history.result.answer, answer); assert.doesNotMatch(r.out.reason, /held/);
};

test("[F1-C5] corpus pins: archive path and turn hashes of the 14 UC probes, delivery log hashes are their names", () => {
  assert.equal(raw.speakerRef, A.speakerRef); assert.equal(raw.tStart, A.tStart); assert.equal(raw.tEnd, A.tEnd);
  assert.equal(sha(prefix), A.recordedExcerptSHA256);
  assert.equal(sha(raw.text), A.turnTextSHA256);
  for (const log of [corpus.provenance.independentCheckLog, corpus.provenance.engineeringLog]) assert.ok(log.path.endsWith(`${log.sha256}.log`));
  assert.equal(P.claims.length * 2, 14);
});

test("[F1-C5][F1-C3][F1-C4] UC probes 14/14 as recorded (1024-char excerpt of t042): held, empty public answer, absent from history, <=2 calls, no web", async () => {
  let held = 0;
  for (const [i, claim] of (P.claims as string[]).entries()) {
    for (const q of [SAT, ENGLISH]) {
      const ds = q === SAT ? [draft(P.adm, "t042"), draft(claim, "t042")] : [draft(claim, "t042")];
      const r = await check(q, [real, other], ds);
      // As recorded, generation could only read the 1024-char excerpt, which cuts t042 mid-sentence: the answer is held.
      assert.equal(norm(stripsOf(r, "t042")), norm(prefix));
      assertWithheld(r, ds, /excerpt of the speaker turn/);
      assert.deepEqual(r.ids, ["t042"], `probe ${i} ${q === SAT ? "SAT" : "English"}`);
      held++;
    }
  }
  assert.equal(held, 14);
});

test("[F1-C1][F1-C2][F1-C5] UC probes 14/14 with the whole t042 turn: generation reads the complete turn; the dropped school scope holds every claim", async () => {
  let held = 0;
  for (const claim of P.claims as string[]) {
    for (const q of [SAT, ENGLISH]) {
      const ds = q === SAT ? [draft(P.adm, "t042"), draft(claim, "t042")] : [draft(claim, "t042")];
      const r = await check(q, [real, other], ds, { live: true });
      // C1: the t042 strips given to generation are the complete turn (all of it, sentence-split by contextStrips as before),
      // not the 1024-char excerpt; the citation's speaker and start/end time are unchanged.
      assert.equal(norm(stripsOf(r, "t042")), norm(raw.text));
      assert.deepEqual(r.tuples, [["t042", A.turnId, A.speakerRef, A.tStart, A.tEnd]]);
      assertWithheld(r, ds, /limits this rule to "[^"]*school[^"]*"/);
      held++;
    }
  }
  assert.equal(held, 14);
});

test("[F1-C2] false-hold controls from the recorded corpus: verbatim SAT quote of the whole turn, and the unconditional admissions turn (fast and deep), are released", async () => {
  const verbatim = await check(SAT, [real, other], [draft(P.verbatimSat, "t042")], { live: true });
  assertReleased(verbatim, P.verbatimSat, ["t042"]);
  const admissions = source("admissions", P.adm);
  for (const mode of [undefined, "deep"] as const) {
    const r = await check(SAT, [real, admissions, other], [draft(P.adm, "admissions")], mode ? { mode } : {});
    // Deep releases every retrieved source at base a9bbeb98 (F4 cited-only filtering is fast-path only); not changed here.
    assertReleased(r, P.adm, mode ? ["t042", "admissions", "uncited"] : ["admissions"]);
  }
});

test("[F1-C5][F1-C3] recorded 'distinct keeper with recorded waiver' (adm->admissions + waiver->t042): the waiver is never released", async () => {
  const ds = [draft(P.adm, "admissions"), draft(P.claims[0], "t042")];
  for (const live of [false, true]) assertWithheld(await check(SAT, [real, source("admissions", P.adm), other], ds, { live }), [ds[1]!], /./);
});

test("[F1-C5][F1-C2][F1-C3] cycle-3 verdict cases V-C1..V-C4 held, V-C5 (false-hold regression) released: 5/5", async () => {
  const expect: Record<string, RegExp> = { "V-C1": /transfer/, "V-C2": /program/, "V-C3": /maple school/, "V-C4": /maple school/ };
  let ok = 0;
  for (const c of corpus.verdictCases) {
    const evidence = c.uncited ? [source("policy", c.source), other] : [source("policy", c.source)];
    const r = await check(c.query, evidence, [draft(c.draft, "policy")]);
    if (c.expect === "held") assertWithheld(r, [draft(c.draft)], expect[c.id]!);
    else assertReleased(r, c.draft, ["policy"]);
    ok++;
  }
  assert.equal(ok, 5);
});

test("[F1-C5][F1-C1][F1-C3] engineering-review cases V-E1..V-E3 held by the condition gate; V-E4 (859-char quotation) held for review with a history row, not thrown: 4/4", async () => {
  const expect: Record<string, RegExp> = { "V-E1": /maple school/, "V-E2": /recruited athlete/, "V-E3": /only asks this question/, "V-E4": /800-character answer bound/ };
  let ok = 0;
  for (const c of corpus.engineeringCases) {
    const text: string = c.sourceRecipe ? c.sourceRecipe.head + c.sourceRecipe.repeat.repeat(c.sourceRecipe.times) + c.sourceRecipe.tail : c.source;
    if (c.sourceRecipe) assert.equal(text.length, 859);
    const d = draft(c.draftIsSource ? text : c.draft, "policy");
    const r = await check(c.query, [source("policy", text)], [d]);
    assertWithheld(r, [d], expect[c.id]!);
    if (c.id === "V-E4") assert.deepEqual(r.calls, ["ask.answer"], "held before grounding: one call");
    ok++;
  }
  assert.equal(ok, 4);
});

test("[F1-C2][F1-C3] deep mode: V-C4 and the 14-probe English waiver (whole turn) are held; the deep answer is withheld from history", async () => {
  const c4 = corpus.verdictCases.find((c: { id: string }) => c.id === "V-C4");
  const r = await check(c4.query, [source("policy", c4.source)], [draft(c4.draft, "policy")], { mode: "deep" });
  assertWithheld(r, [draft(c4.draft)], /maple school/);
  const w = await check(ENGLISH, [real, other], [draft(P.claims[5], "t042")], { mode: "deep", live: true });
  assertWithheld(w, [draft(P.claims[5])], /school/);
});

test("[F1-C2] paraphrased-condition answers are released (fast): the scope survives in other words", async () => {
  const c1 = corpus.verdictCases.find((c: { id: string }) => c.id === "V-C1"), c4 = corpus.verdictCases.find((c: { id: string }) => c.id === "V-C4");
  const p1 = "For transfer applicants, UC does not review SAT or ACT scores for admission or scholarships.";
  assertReleased(await check(c1.query, [source("policy", c1.source), other], [draft(p1, "policy")]), p1, ["policy"]);
  const p4 = "Only pupils from Maple School can apply without proof of English proficiency.";
  assertReleased(await check(c4.query, [source("policy", c4.source)], [draft(p4, "policy")]), p4, ["policy"]);
});

test("[F1-C1] a single turn over the 16 KiB turn cap is held, never truncated; the citation keeps its speaker and times", async () => {
  const big = "Every applicant must submit an official transcript. ".repeat(400);
  assert.ok(Buffer.byteLength(big) > 16 * 1024);
  const slice = big.slice(0, 1024);
  const row: Row = { _id: "fixture-big", tenantId: tenant, sessionId: session, speakerRef: "Presenter", tStart: 5, tEnd: 900, text: big };
  const ans = "Every applicant must submit an official transcript.";
  const r = await check(ENGLISH, [{ id: "big", text: slice, row }], [draft(ans, "big")], { live: true });
  assertWithheld(r, [draft(ans)], /over the 16384-byte turn cap/);
  assert.equal(norm(stripsOf(r, "big")), norm(slice), "over-cap turn keeps its hydrated excerpt as is; the cap never cuts text");
  assert.deepEqual(r.tuples, [["big", "fixture-big", "Presenter", 5, 900]]);
});

// ---- release gate (answer-evidence.ts): defense in depth behind the Ask gate ------------------------------------------------
const c4 = corpus.verdictCases.find((c: { id: string }) => c.id === "V-C4");
function candidate(answer: string, text: string, auditLog: AskV2Result["auditLog"] = []): AskV2Result {
  const q = { id: "policy", nodeId: "n1", sessionRef: "s1", turnId: "t1", speakerRef: "Presenter", tStart: 10, tEnd: 20, charStart: 0, charEnd: text.length, byteStart: 0,
    byteEnd: Buffer.byteLength(text), turnTextSHA256: sha(text), sliceSHA256: sha(text), quote: text, origin: "speech" };
  return { answer, verdict: "correct", reason: "fast path", scored: [], web_used: false, insufficient_coverage: false, auditLog,
    sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [q] } }], web: [] } } as unknown as AskV2Result;
}
function verifierDb(text: string) {
  const db = answerTestDb();
  db.rows("sessions").push({ _id: "s1", tenantId: "tenant-a", sourceId: "src1" });
  db.rows("sources").push({ _id: "src1", tenantId: "tenant-a", kind: "recording" });
  db.rows("turns").push({ _id: "t1", tenantId: "tenant-a", sessionId: "s1", speakerRef: "Presenter", tStart: 10, tEnd: 20, text });
  return createMongoEvidenceVerifier(db.db);
}

test("[F1-C2][F1-C3] release gate: a condition-dropping candidate Ask did not hold is marked, refused by the verifier on every read, and explained", async () => {
  const cand = candidate(c4.draft, c4.source);
  assert.match(conditionReleaseHold(cand) ?? "", /maple school/);
  const bindings = answerEvidence(cand);
  assert.match(String((bindings[0]!.source as { conditionHeld?: string }).conditionHeld), /maple school/);
  const verify = verifierDb(c4.source);
  assert.equal(await verify("tenant-a", bindings), false);
  assert.match(await whyUnverified("tenant-a", bindings, verify), /^Held: .*maple school.*withheld\.$/);
  assert.equal((await whyUnverified("tenant-a", bindings, verify)).includes(c4.draft), false);
});

test("[F1-C4][F1-I2] release gate leaves bindings and digests byte-identical for answers without a dropped condition, and for answers Ask already held", async () => {
  const plainShape = (r: AskV2Result) => r.sources.internal.map((s) => ({ id: `internal:${s.node_id}`, origin: "internal", fingerprint: digest(s), source: structuredClone(s),
    excerpt: (s.evidence!.sourceQuotes as { quote: string }[]).map((q) => q.quote).join("\n") }));
  const ok = candidate("Submitting TOEFL scores lowers the visa fee.", "Applicants who submit TOEFL scores pay a reduced visa fee.");
  assert.equal(conditionReleaseHold(ok), null);
  assert.deepEqual(answerEvidence(ok), plainShape(ok));
  assert.equal(await verifierDb("Applicants who submit TOEFL scores pay a reduced visa fee.")("tenant-a", answerEvidence(ok)), true);
  const askHeld = candidate(c4.draft, c4.source, [{ jobKind: "ask.condition_held", step: "condition_held: x" }]);
  assert.deepEqual(answerEvidence(askHeld), plainShape(askHeld), "Ask's own hold stays reviewable: no release marker");
});
