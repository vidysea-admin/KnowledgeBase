import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, SessionPages, Sessions } from "@lkb/core";
import { buildIndexer } from "../composition/production.js";
import { createGroundedContentDeps } from "../grounded-content/reader.js";
import { composeGroundedPostProcessing, readGroundedJudgeCostLimit } from "./composition.js";
import { fixture, QUESTION, ANSWER, FACT, ACTION, turns } from "./fixture.testsupport.js";

test("actual buildIndexer grounded opt-in produces and persists cited summary/facts/Q&A/actions without a separate strict option", async () => {
  const state = fixture();
  const index = buildIndexer(state.routing, { groundedNotes: true, db: state.db });
  const result = await index("t", "s1");
  assert.equal(result.completion?.strict, true); assert.equal(result.completion?.complete, true);
  const page = state.rows("session_pages")[0] as SessionPages;
  const claims = state.rows("claims") as Claims[];
  assert.ok(page.summary.includes(FACT)); assert.deepEqual(page.actionItems, [ACTION]);
  assert.equal(page.citedItems!.find((item) => item.kind === "insight")!.text, FACT);
  assert.equal(page.qa![0]!.answer, ANSWER); assert.equal(claims[0]!.text, FACT);
  // D-173: buildIndexer is vectorless; active ingestion never requests embeddings (lexical chunks are still persisted).
  assert.ok(state.kinds.includes("note-judge")); assert.ok(!state.kinds.includes("embedding"));
  assert.ok(state.jobs.length > 0 && state.jobs.every((job) => job.tenantId === "t"), "real router ledger remains tenant-bound");
  for (const name of ["session_pages", "claims", "chunks", "tree_index"]) {
    assert.ok(state.rows(name).length > 0, `${name} must actually be persisted`);
    for (const row of state.rows(name)) assert.equal(row.tenantId, "t");
  }
  const reader = createGroundedContentDeps({ getSessionDetail: async () => ({
    session: { _id: "s1", tenantId: "t" } as Sessions, page, claims, turns,
  }) });
  const content = (await reader.getGroundedContent("t", "s1"))!;
  assert.equal(content.notes.find((item) => item.kind === "action")!.text, ACTION);
  assert.deepEqual(content.qa[0]!.questionEvidence[0], {
    turnId: "turn-0", sessionId: "s1", quote: QUESTION, available: true, tStart: 0, tEnd: 2, speaker: "speaker:attendee",
  });
  assert.equal(content.qa[0]!.answerEvidence[0]!.tStart, 3);
  assert.equal(content.claims[0]!.evidence[0]!.tStart, 6);
  assert.equal(await reader.getGroundedContent("foreign", "s1"), null);
});

test("actual buildIndexer environment flag alone enables grounded production; explicit false preserves legacy", async () => {
  const previous = process.env.KB_GROUNDED_NOTES;
  process.env.KB_GROUNDED_NOTES = "1";
  try {
    const on = fixture();
    const result = await buildIndexer(on.routing, { db: on.db })("t", "s1");
    assert.equal(result.completion?.strict, true); assert.ok(on.kinds.includes("note-judge"));
    const off = fixture();
    const legacy = await buildIndexer(off.routing, { groundedNotes: false, db: off.db })("t", "s1");
    assert.equal(legacy.completion?.strict, false); assert.equal("groundedNotes" in legacy, false);
    assert.equal(off.kinds.includes("note-judge"), false);
    const page = off.rows("session_pages")[0]!;
    assert.equal(page.summary, "Legacy summary"); assert.equal("qa" in page, false);
  } finally { if (previous === undefined) delete process.env.KB_GROUNDED_NOTES; else process.env.KB_GROUNDED_NOTES = previous; }
});

test("actual configured judge failure refuses strict completion before knowledge replacement", async () => {
  const state = fixture({ judgeFails: true });
  await assert.rejects(buildIndexer(state.routing, { groundedNotes: true, db: state.db })("t", "s1"), /strict webinar index incomplete/);
  assert.ok(!state.calls.some((call) => ["session_pages", "claims", "chunks", "tree_index"].includes(call.collection) &&
    ["deleteMany", "insertOne", "insertMany", "replaceOne"].includes(call.method)));
  assert.ok(state.jobs.some((job) => job.kind === "note-judge" && job.status === "failed"));
});

test("composition preserves OFF strict choice and a grounded opt-in cannot silently select legacy", () => {
  const never = async () => { throw new Error("not invoked during composition"); };
  assert.deepEqual(composeGroundedPostProcessing(never, { groundedNotes: false }), { strictWebinar: undefined });
  assert.deepEqual(composeGroundedPostProcessing(never, { groundedNotes: false, strictWebinar: true }), { strictWebinar: true });
  const on = composeGroundedPostProcessing(never, { groundedNotes: true, strictWebinar: false, judgeMaxCostUsd: 0.5 });
  assert.equal(on.strictWebinar, true); assert.equal(on.dropUnverified, true); assert.equal(on.judgeMaxCostUsd, 0.5);
  assert.equal(readGroundedJudgeCostLimit({ KB_NOTE_JUDGE_MAX_USD: "0.5" }), 0.5);
  for (const value of [undefined, "", "-1", "Infinity", "not-a-price"]) assert.equal(readGroundedJudgeCostLimit({ KB_NOTE_JUDGE_MAX_USD: value }), undefined);
});

test("actual grounded factory rejects foreign transcript scope before model or knowledge writes", async () => {
  const state = fixture();
  await assert.rejects(buildIndexer(state.routing, { groundedNotes: true, db: state.db })("foreign", "s1"), /Session is unavailable for aggregate indexing/);
  assert.equal(state.kinds.length, 0);
  assert.ok(!state.calls.some((call) => ["session_pages", "claims", "chunks", "tree_index"].includes(call.collection) &&
    ["deleteMany", "insertOne", "insertMany", "replaceOne"].includes(call.method)));
});
