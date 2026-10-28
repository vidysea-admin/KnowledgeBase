import test from "node:test";
import assert from "node:assert/strict";
import { planTranscriptReview, ReviewPlanningError, type ReviewSnapshot } from "./planner.js";
const trusted = { tenantId: "tenant-a", sessionId: "s1", actorRef: "key:verified", reviewedAt: "2026-10-14T10:00:00Z" };
const snapshot = (): ReviewSnapshot => ({ tenantId: "tenant-a", sessionId: "s1", revision: "revision-1", turns: [
  { _id: "t1", tenantId: "tenant-a", sessionId: "s1", tStart: 0, tEnd: 10, text: "Original one", speakerRef: "spk:0" },
  { _id: "t2", tenantId: "tenant-a", sessionId: "s1", tStart: 10, tEnd: 20, text: "Original two", speakerRef: "spk:0" },
  { _id: "t3", tenantId: "tenant-a", sessionId: "s1", tStart: 20, tEnd: 30, text: "Another person", speakerRef: "spk:1" },
  { _id: "t4", tenantId: "tenant-a", sessionId: "s1", tStart: 30, tEnd: 40, text: "Repeated label", speakerRef: "spk:0" },
] });
const request = () => ({ expectedRevision: "revision-1", reason: "Reviewed against recording", corrections: [{ turnId: "t1", text: "Corrected one" }] });
const refuses = (value: unknown, code = "invalid", s = snapshot(), auth = trusted) => assert.throws(() => planTranscriptReview(s, value, auth),
  (e: unknown) => e instanceof ReviewPlanningError && e.code === code);
test("immutable correction plan carries exact before/after audit and pending downstream revision", () => {
  const s = snapshot(), bytes = JSON.stringify(s);
  const plan = planTranscriptReview(s, request(), trusted);
  assert.equal(JSON.stringify(s), bytes);
  assert.equal(plan.nextTurns[0]!.text, "Corrected one");
  assert.equal(plan.nextTurns[0]!.tStart, 0);
  assert.deepEqual(plan.audit, { ...trusted, reason: "Reviewed against recording", changes: [{ turnId: "t1", before: { text: "Original one", speakerRef: "spk:0" }, after: { text: "Corrected one", speakerRef: "spk:0" } }] });
  assert.equal(plan.expectedRevision, "revision-1");
  assert.match(plan.nextRevision, /^[a-f0-9]{64}$/);
  assert.equal(plan.refresh.status, "pending");
  assert.equal(plan.refresh.revision, plan.nextRevision);
  assert.deepEqual(plan.refresh.targets, ["claims", "session-page", "chunks", "tree", "graph"]);
});
test("explicit contiguous speaker block changes only named turns, including simultaneous correction", () => {
  const plan = planTranscriptReview(snapshot(), { ...request(), mapping: { turnIds: ["t2", "t1"], speakerRef: "person:priya", speakerLabel: "Priya" } }, trusted);
  assert.deepEqual(plan.nextTurns.map((t) => t.speakerRef), ["person:priya", "person:priya", "spk:1", "spk:0"]);
  assert.equal(plan.nextTurns[0]!.text, "Corrected one"); assert.equal(plan.audit.changes.length, 2);
});
test("revision and trusted scope preconditions refuse before producing writes", () => {
  refuses({ ...request(), expectedRevision: "stale" }, "conflict");
  refuses(request(), "scope", snapshot(), { ...trusted, tenantId: "tenant-b" });
  const s = snapshot(); s.turns[0]!.tenantId = "tenant-b"; refuses(request(), "scope", s);
  refuses(request(), "scope", snapshot(), { ...trusted, sessionId: "s2" });
});
test("missing, duplicate, noncontiguous and mixed-label mapping cannot widen identity", () => {
  for (const turnIds of [["foreign"], ["t1", "t1"], ["t1", "t4"], ["t2", "t3"]])
    refuses({ ...request(), mapping: { turnIds, speakerRef: "person:x", speakerLabel: "X" } });
  refuses({ ...request(), corrections: [{ turnId: "foreign", text: "x" }] });
  refuses({ ...request(), corrections: [{ turnId: "t1", text: "x" }, { turnId: "t1", text: "y" }] });
});
test("client cannot inject tenant, actor, timing, provenance or unknown request fields", () => {
  for (const key of ["tenantId", "actorRef", "reviewedAt", "sessionId"]) refuses({ ...request(), [key]: "spoof" });
  refuses({ ...request(), corrections: [{ turnId: "t1", text: "x", tStart: 999 }] });
  refuses({ ...request(), mapping: { turnIds: ["t1"], speakerRef: "x", speakerLabel: "X", provenance: "automatic" } });
});
test("invalid reason/text/corpus/order and empty changes refuse", () => {
  refuses({ ...request(), reason: " " });
  refuses({ ...request(), corrections: [{ turnId: "t1", text: "" }] });
  refuses({ ...request(), corrections: [{ turnId: "t1", text: "x".repeat(20001) }] });
  refuses({ ...request(), corrections: Array.from({ length: 101 }, () => ({ turnId: "t1", text: "x" })) });
  refuses({ ...request(), corrections: [] }, "no_changes");
  refuses({ ...request(), corrections: [{ turnId: "t1", text: "Original one" }] }, "no_changes");
  const duplicate = snapshot(); duplicate.turns[1]!._id = "t1"; refuses(request(), "invalid", duplicate);
  const bad = snapshot(); bad.turns[1]!.tEnd = -1; refuses(request(), "invalid", bad);
  const order = snapshot(); order.turns[1]!.tStart = -1; refuses(request(), "invalid", order);
});
