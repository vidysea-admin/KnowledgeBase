import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { planTranscriptReview, ReviewPlanningError, type ReviewTurn } from "../../../apps/api/src/transcript-review/planner.js";
const loadTurns = () => JSON.parse(readFileSync(new URL("../../../data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json", import.meta.url), "utf8")) as ReviewTurn[];
test("full retained corpus with invalid source timings is refused without silent normalization", () => {
  const turns = loadTurns(), first = turns[0]!;
  assert.equal(turns.length, 291); assert.equal(turns[140]!.tStart, 2008); assert.equal(turns[140]!.tEnd, 213);
  assert.equal(turns[141]!.tStart, 213);
  const snapshot = { tenantId: first.tenantId, sessionId: first.sessionId, revision: "retained-sample-r1", turns };
  const original = JSON.stringify(snapshot);
  assert.throws(() => planTranscriptReview(snapshot,
    { expectedRevision: snapshot.revision, reason: "Independent offline probe", corrections: [{ turnId: first._id, text: "Probe" }] },
    { tenantId: first.tenantId, sessionId: first.sessionId, actorRef: "checker:offline", reviewedAt: "2026-10-14T09:00:00Z" }),
    (error: unknown) => error instanceof ReviewPlanningError && error.code === "invalid");
  assert.equal(JSON.stringify(snapshot), original);
});
test("retained TOC sample plans exact correction and detached audit without mutating inputs", () => {
const turns = loadTurns().slice(0, 100);
const first = turns[0]!;
const snapshot = { tenantId: first.tenantId, sessionId: first.sessionId, revision: "retained-sample-r1", turns };
const original = JSON.stringify(snapshot);
const request = { expectedRevision: snapshot.revision, reason: "Independent offline sample probe", corrections: [{ turnId: first._id, text: `${first.text} [offline correction probe]` }] };
const plan = planTranscriptReview(snapshot, request, { tenantId: first.tenantId, sessionId: first.sessionId, actorRef: "checker:offline", reviewedAt: "2026-10-14T09:00:00Z" });
assert.equal(JSON.stringify(snapshot), original);
assert.equal(plan.audit.changes.length, 1);
assert.equal(plan.nextTurns.length, turns.length);
assert.deepEqual(plan.nextTurns.slice(1), turns.slice(1));
const audit = JSON.stringify(plan.audit);
first.text = "Mutable caller changed its source";
plan.nextTurns[0]!.text = "Mutable consumer changed planned turn";
request.corrections[0]!.text = "Mutable caller changed its request";
assert.equal(JSON.stringify(plan.audit), audit);
assert.equal(plan.refresh.status, "pending");
console.log(JSON.stringify({ sample: snapshot.sessionId, sourceTurns: 291, literalPrefixTurns: turns.length, changedTurns: plan.audit.changes.length, inputPreserved: true, auditDetached: true, refresh: plan.refresh.status }));
});
