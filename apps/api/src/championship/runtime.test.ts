import { test } from "node:test";
import assert from "node:assert/strict";
import type { EvalRuns } from "@lkb/core";
import { createChampionshipEvent, championshipBankDigest } from "./model.js";
import { freezeChampionship, addChampionshipTrial, championshipReport } from "./runtime.js";

const plan = { title: "Proposed event", questions: [{ id: "q1", text: "Real source question?", source: { kind: "toc", reference: "session:one/turn:3" } }],
  counsellors: [{ id: "c1", name: "Proposed counsellor", evidenceReference: "pending-human-confirmation" }], judges: [],
  rubric: { version: "draft", reference: "pending-panel" }, reviewReference: "unverified-operator-assertion" };
const createdAt = "2026-10-14T00:00:00.000Z", frozenAt = "2026-10-14T00:01:00.000Z", capturedAt = "2026-10-14T00:03:00.000Z";
function event() { const e = createChampionshipEvent("tenant-a", plan, createdAt); return freezeChampionship(e, e.bankDigest, frozenAt); }
function run(): EvalRuns { return { _id: "run-1", tenantId: "tenant-a", question: plan.questions[0]!.text, counsellor: { name: plan.counsellors[0]!.name },
  aiAnswer: { text: "Original cited response", sources: { internal: [{ sessionId: "one", speaker: "Speaker", timestamp: 42 }], web: [] } },
  counsellorAnswer: { text: "Original human response" }, score: { ai: 4, counsellor: 3, notes: "operator score" }, credibility: "internal", createdAt: "2026-10-14T00:02:00.000Z" }; }
test("source snapshot preserves exact digest/answers/citations and downstream report denominator", () => {
  const e = event(), r = run(), snapshot = addChampionshipTrial(e, "q1", "c1", r, capturedAt);
  const report = championshipReport(snapshot);
  assert.equal(report.bankDigest, championshipBankDigest(e.questions)); assert.equal(report.status, "internal-evidence-complete");
  assert.equal(report.plannedPairs, 1); assert.equal(report.recordedPairs, 1); assert.equal(report.publicResult, false);
  assert.deepEqual(report.trials[0]!.aiAnswer, r.aiAnswer); assert.deepEqual(report.counsellors[0]!.observedScoreTotals, { ai: 4, counsellor: 3 });
  r.aiAnswer!.text = "later mutated"; assert.equal((snapshot.trials[0]!.aiAnswer as {text: string}).text, "Original cited response");
  assert.ok(report.unresolvedGates.some(g => g.includes("Q3"))); assert.match(report.notice, /unverified/);
  assert.deepEqual(JSON.parse(JSON.stringify(report)).trials, report.trials);
});
test("incomplete scheduled pairs remain visible without inventing wins", () => {
  const report = championshipReport(event()); assert.equal(report.status, "incomplete"); assert.equal(report.plannedPairs, 1);
  assert.deepEqual(report.counsellors[0]!.missingQuestionIds, ["q1"]); assert.deepEqual(report.counsellors[0]!.observedScoreTotals, { ai: 0, counsellor: 0 });
});
test("malformed bank, unsupported source, duplicated identity/text and forged approval refuse or remain unverified", () => {
  for (const p of [{ ...plan, questions: [] }, { ...plan, questions: [...plan.questions, ...plan.questions] },
    { ...plan, questions: [{ ...plan.questions[0], source: { kind: "synthetic", reference: "made-up" } }] },
    { ...plan, counsellors: [...plan.counsellors, { ...plan.counsellors[0], id: "c2" }] }, { ...plan, title: "\ud800" }]) assert.throws(() => createChampionshipEvent("tenant-a", p, createdAt));
  const e = createChampionshipEvent("tenant-a", { ...plan, tenantId: "evil", publicResult: true, humanApproved: true, credibility: "independent-human" }, createdAt);
  assert.equal(e.tenantId, "tenant-a"); assert.equal(e.evidenceStatus, "operator-supplied-unverified"); assert.equal("humanApproved" in e, false);
});
test("frozen bank drift, duplicate trial, wrong pair and pre-freeze eval timestamps refuse", () => {
  const e = event(); assert.throws(() => freezeChampionship(e, e.bankDigest, capturedAt));
  assert.throws(() => addChampionshipTrial({ ...e, questions: [{ ...e.questions[0]!, text: "changed" }] }, "q1", "c1", run(), capturedAt));
  const populated = addChampionshipTrial(e, "q1", "c1", run(), capturedAt);
  assert.throws(() => addChampionshipTrial(populated, "q1", "c1", run(), capturedAt));
  for (const patch of [{ tenantId: "tenant-b" }, { question: "different" }, { counsellor: { name: "different" } }, { credibility: "independent-human" },
    { createdAt }, { createdAt: "2026-10-14T01:00:00Z" }, { createdAt: "invalid" }, { counsellorAnswer: { text: "" } }, { aiAnswer: { text: "" } }, { score: { ai: 6, counsellor: 3 } }, { score: { ai: NaN, counsellor: 3 } }, { score: { ai: "4", counsellor: 3 } }]) {
    assert.throws(() => addChampionshipTrial(e, "q1", "c1", { ...run(), ...patch } as EvalRuns, capturedAt));
  }
});
test("reloaded corrupted snapshots refuse aggregation; missing source arrays are disclosed", () => {
  const e = addChampionshipTrial(event(), "q1", "c1", run(), capturedAt);
  for (const patch of [{ counsellorAnswer: { text: "" } }, { aiAnswer: { text: "" } }, { evalCreatedAt: createdAt }, { capturedAt: "invalid" }, { evalRunId: "" }]) {
    assert.throws(() => championshipReport({ ...e, trials: [{ ...e.trials[0]!, ...patch }] }));
  }
  const noSources = run(); noSources.aiAnswer!.sources = {};
  assert.deepEqual(championshipReport(addChampionshipTrial(event(), "q1", "c1", noSources, capturedAt)).missingSourceEvidenceRunIds, ["run-1"]);
});
