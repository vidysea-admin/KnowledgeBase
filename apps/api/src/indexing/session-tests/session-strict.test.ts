/** Strict-mode indexSession persistence tests, split from session.test.ts (pure relocation). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexSession } from "../session.js";
import { fakeDb, completeWith, embedOk } from "../testutils.js";

test("ISS-WEBINARRELEASE-002 strict provider/parser/embedding degradation preserves prior knowledge", async () => {
  for (const failure of ["summary-rejected", "summary-invalid", "claims-rejected", "claims-invalid", "embedding-rejected", "embedding-missing", "uncited-legacy-output"]) {
    const {db,calls}=fakeDb({existingSessionPage:{_id:"prior",tenantId:"t",sessionId:"s1",summary:"Prior valid page"}});
    const base=completeWith({summarizeFails:failure==="summary-rejected",claimsFails:failure==="claims-rejected"});
    const complete=async(job: Parameters<typeof base>[0])=>{
      if((failure==="summary-invalid"&&job.kind==="summarize")||(failure==="claims-invalid"&&job.kind==="claims")){
        return {text:"not-json",usage:{inputTokens:0,outputTokens:0},provider:"fixture",model:"fixture",costUsd:0};
      }return base(job);
    };
    const embed=failure==="embedding-missing"?undefined:failure==="embedding-rejected"?async()=>{throw new Error("fixture outage");}:embedOk;
    await assert.rejects(indexSession("t","s1",{ retrievalMode: "vector",db,complete:complete as never,embed,strictWebinar:true}),/strict webinar index incomplete/,failure);
    assert.ok(!calls.some((call)=>["session_pages","claims","chunks","tree_index"].includes(call.coll)&&["deleteMany","insertOne","insertMany","replaceOne"].includes(call.op)),failure);
    assert.ok(!calls.some((call)=>JSON.stringify(call.update ?? {}).includes('"status.index":"done"')),failure);
  }
});

function runtimeIndexerComplete(fault = "none") {
  return async (job: { messages: { content: string }[]; kind: string }) => {
    const p = JSON.parse(job.messages[1]!.content), s = p.spans[0];
    const evidence = [{ turnId: s.turnId, sessionId: s.sessionId, quote: s.text }];
    const claim = { text: s.text, origin: s.origin, verification: "unverified", evidence };
    let result;
    if (p.phase === "extract-summary") result = { processed: p.inventory, items: [{ ...claim, kind: "insight" }], qa: [] };
    else if (p.phase === "extract-claims") result = { processed: p.inventory, claims: [claim] };
    else result = { processed: p.inventory, complete: true, noContent: false, verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: fault !== "unsupported", categoryCorrect: true, answerRelevant: true })) };
    if (fault === "coverage" && p.phase === "extract-summary") result.processed = [];
    if (fault === "quote" && p.phase === "extract-claims") claim.evidence[0]!.quote = "Unsupported invented quote";
    return { text: JSON.stringify(result), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
}
test("strict index persists validated item and claim quotations plus real candidate session tree", async () => {
  const { db, calls } = fakeDb();
  const result = await indexSession("t", "s1", { retrievalMode: "vector", db, complete: runtimeIndexerComplete(), embed: embedOk, strictWebinar: true });
  assert.ok(result.completion); assert.equal(result.completion.complete, true);
  const page = calls.find((c) => c.coll === "session_pages" && c.op === "insertOne")!.docs![0]!;
  assert.deepEqual(page.coveredTurnIds, ["t1"]); assert.deepEqual(page.qa, []);
  assert.equal((page.citedItems as { evidence: { quote: string }[] }[])[0]!.evidence[0]!.quote, "A real sentence.");
  const claim = calls.find((c) => c.coll === "claims" && c.op === "insertMany")!.docs![0]!;
  assert.equal((claim.evidence as { quote: string }[])[0]!.quote, "A real sentence."); assert.equal(claim.verification, "unverified");
  assert.ok(JSON.stringify(calls.find((c) => c.coll === "tree_index" && c.op === "replaceOne")!.docs).includes(page.summary as string));
});
test("strict preflight never replaces prior knowledge for source, coverage, support, context or missing-session root failures", async () => {
  for (const fault of ["quote", "coverage", "unsupported", "huge-context", "missing-session", "generic-root"]) {
    const { db, calls } = fakeDb({ existingSessionPage: { _id: "old", tenantId: "t", sessionId: "s1", summary: "Keep prior" } });
    if (["huge-context", "missing-session", "generic-root"].includes(fault)) {
      const collection = db.collection.bind(db);
      db.collection = ((name: string) => {
        const c = collection(name);
        if (name === "turns" && fault === "huge-context") return { ...c, find: () => ({ toArray: async () => [{ _id: "t1", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "X".repeat(50000) }] }) };
        if (name === "sessions" && fault !== "huge-context") return { ...c, find: () => ({ toArray: async () => [] }) };
        if (name === "tree_index" && fault === "generic-root") return { ...c, findOne: async () => ({ node_id: "tenant:t", level: "tenant", title: "Old generic root", summary: "", children: [] }) };
        return c;
      }) as typeof db.collection;
    }
    await assert.rejects(indexSession("t", "s1", { retrievalMode: "vector", db, complete: runtimeIndexerComplete(fault), embed: embedOk, strictWebinar: true }), /strict webinar index incomplete/, fault);
    assert.ok(!calls.some((c) => ["session_pages", "claims", "chunks", "tree_index"].includes(c.coll) && ["deleteMany", "insertOne", "insertMany", "replaceOne"].includes(c.op)), fault);
    assert.ok(!calls.some((c) => JSON.stringify(c.update ?? {}).includes('"status.index":"done"')), fault);
  }
});

test("strict nonempty question/answer and screen citations survive the persistence boundary", async () => {
  const { db, calls } = fakeDb(), collection = db.collection.bind(db);
  const turns = [
    { _id: "q", tenantId: "t", sessionId: "s1", speakerRef: "spk:0", tStart: 0, tEnd: 1, text: "When is registration?" },
    { _id: "a", tenantId: "t", sessionId: "s1", speakerRef: "spk:1", tStart: 2, tEnd: 3, text: "Registration is Friday." },
    { _id: "screen", tenantId: "t", sessionId: "s1", speakerRef: "screen", tStart: 4, tEnd: 5, text: "[Screen OCR; unverified] Cost:100.", screenEvidence: { frameId: "f", file: "frames/f.png", hash: "a".repeat(64), tStart: 4 } },
  ];
  db.collection = ((name: string) => name === "turns" ? { ...collection(name), find: () => ({ toArray: async () => turns }) } : collection(name)) as typeof db.collection;
  const complete = async (job: { messages: { content: string }[] }) => {
    const p = JSON.parse(job.messages[1]!.content);
    const ev = (t: typeof turns[number]) => [{ turnId: t._id, sessionId: t.sessionId, quote: t.text }];
    const claims = turns.slice(1).map((t) => ({ text: t.text, evidence: ev(t), origin: t.speakerRef === "screen" ? "screen-ocr" : "speaker-statement", verification: "unverified" }));
    const qa = [{ question: turns[0]!.text, questionEvidence: ev(turns[0]!), answer: turns[1]!.text, answerEvidence: ev(turns[1]!), status: "answered" }];
    const result = p.phase === "extract-summary" ? { processed: p.inventory, items: claims.map((c) => ({ ...c, kind: "insight" })), qa } : p.phase === "extract-claims" ? { processed: p.inventory, claims } :
      { processed: p.inventory, complete: true, noContent: false, verdicts: p.items.map((i: { id: string }) => ({ id: i.id, supported: true, categoryCorrect: true, answerRelevant: true })) };
    return { text: JSON.stringify(result), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
  await indexSession("t", "s1", { retrievalMode: "vector", db, complete, embed: embedOk, strictWebinar: true });
  const page = calls.find((c) => c.coll === "session_pages" && c.op === "insertOne")!.docs![0]!;
  const qa = (page.qa as { questionEvidence: { turnId: string }[]; answerEvidence: { turnId: string }[] }[])[0]!;
  assert.equal(qa.questionEvidence[0]!.turnId, "q"); assert.equal(qa.answerEvidence[0]!.turnId, "a");
  assert.ok((page.citedItems as { origin: string }[]).some((i) => i.origin === "screen-ocr")); assert.deepEqual(page.coveredTurnIds, ["q", "a", "screen"]);
});
