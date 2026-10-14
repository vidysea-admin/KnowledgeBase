import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryAnswerPolicyStore } from "./store.js";
import { createAnswerPolicyService, PolicyServiceError } from "./service.js";
import { detectConflicts } from "./conflicts.js";
import { evaluatePolicy } from "./evaluate.js";
import { parseSave, PolicyInputError } from "./rules.js";
import type { AskV2Result } from "../../../../packages/ask/src/ask-shared.js";

const A = { actor: "api-key:tenant-a" }, B = { actor: "api-key:tenant-b" };
const body = (over: Record<string, unknown> = {}) => ({ questionClass: "Fees", mode: "internal-only", style: "concise", onInsufficient: "review", note: "initial", ...over });
function setup() {
  let n = 0; const store = createInMemoryAnswerPolicyStore();
  return { store, svc: createAnswerPolicyService(store, () => new Date(Date.UTC(2026, 9, 14, 12, 0, n++))) };
}
const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => (e instanceof PolicyServiceError || e instanceof PolicyInputError) && e.code === code);

test("versioned history records who, what and when; earlier rows never change", async () => {
  const { svc } = setup();
  const v1 = (await svc.save("tenant-a", "fees-policy", body({ claimedBy: "Priya" }), A)).revision;
  assert.equal(v1.version, 1); assert.equal(v1.questionClass, "fees"); assert.equal(v1.changedBy.actor, "api-key:tenant-a"); assert.equal(v1.changedBy.claimedBy, "Priya");
  const v2 = (await svc.save("tenant-a", "fees-policy", body({ style: "detailed", note: "longer", expectedVersion: 1 }), A)).revision;
  assert.equal(v2.version, 2); assert.equal(v2.previousVersion, 1);
  const hist = await svc.history("tenant-a", "fees-policy");
  assert.deepEqual(hist.map((h) => [h.version, h.style, h.note]), [[1, "concise", "initial"], [2, "detailed", "longer"]]);
  assert.ok(hist[0]!.changedAt < hist[1]!.changedAt);
  const copy = await svc.history("tenant-a", "fees-policy"); copy[0]!.style = "detailed";
  assert.equal((await svc.history("tenant-a", "fees-policy"))[0]!.style, "concise", "returned rows are detached copies");
});
test("stale or missing expectedVersion is refused, never silently overwritten", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "p1", body(), A);
  await rejects(svc.save("tenant-a", "p1", body({ note: "x" }), A), "version_conflict");
  await rejects(svc.save("tenant-a", "p1", body({ expectedVersion: 5 }), A), "version_conflict");
  await rejects(svc.save("tenant-a", "new", body({ expectedVersion: 1 }), A), "version_conflict");
  assert.equal((await svc.history("tenant-a", "p1")).length, 1);
});
test("concurrent saves of the same version: exactly one wins", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "p1", body(), A);
  const r = await Promise.allSettled([1, 2, 3].map((i) => svc.save("tenant-a", "p1", body({ expectedVersion: 1, note: `n${i}` }), A)));
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await svc.history("tenant-a", "p1")).length, 2);
});
test("policies cannot override grounded evidence: citation/evidence/source fields are refused", async () => {
  const { svc } = setup();
  for (const extra of [{ citations: "optional" }, { citations: false }, { requireCitations: false }, { allowUncited: true }, { evidenceOverride: "x" }, { groundingRequired: false }, { sourceRequired: false }]) {
    await rejects(svc.save("tenant-a", "p1", body(extra), A), "policy_cannot_override_evidence");
  }
  await rejects(svc.save("tenant-a", "p1", body({ bogus: 1 }), A), "invalid_policy");
  assert.equal((await svc.list("tenant-a")).length, 0);
  assert.equal((await svc.save("tenant-a", "p1", body({ citations: "required" }), A)).revision.citations, "required");
});
test("input validation", async () => {
  const { svc } = setup();
  for (const bad of [null, [], body({ questionClass: "" }), body({ questionClass: "<x>" }), body({ mode: "web-only" }), body({ style: "x" }), body({ onInsufficient: "allow" }), body({ note: " " }), body({ note: "x".repeat(501) }), body({ expectedVersion: 0 })])
    await rejects(svc.save("tenant-a", "p1", bad, A), "invalid_policy");
  await rejects(Promise.resolve().then(() => parseSave(body({ claimedBy: "" }))), "invalid_policy");
});
test("conflict detector explains contradictions for the same question class only", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "p1", body(), A);
  const r = await svc.save("tenant-a", "p2", body({ questionClass: " FEES ", mode: "internal-and-web", style: "detailed" }), A);
  assert.deepEqual(r.conflicts.map((c) => c.dimension).sort(), ["mode", "style"]);
  const mode = r.conflicts.find((c) => c.dimension === "mode")!;
  assert.equal(mode.severity, "high"); assert.match(mode.explanation, /p1 says internal-only but p2 says internal-and-web/);
  await svc.save("tenant-a", "p3", body({ questionClass: "admissions", mode: "internal-and-web" }), A);
  assert.equal((await svc.conflicts("tenant-a")).length, 2, "different class does not conflict");
  assert.deepEqual(detectConflicts([]), []);
});
test("retired policies leave conflicts; open conflict items are superseded, resolved ones keep their record", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "p1", body(), A);
  await svc.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A);
  const open = await svc.queue("tenant-a", "open");
  assert.equal(open.filter((i) => i.kind === "conflict").length, 1);
  await svc.retire("tenant-a", "p2", { note: "drop", expectedVersion: 1 }, A);
  assert.equal((await svc.conflicts("tenant-a")).length, 0);
  const conflictItem = (await svc.queue("tenant-a")).find((i) => i.kind === "conflict")!;
  assert.equal(conflictItem.status, "superseded"); assert.equal(conflictItem.resolution?.by.actor, "system");
  await rejects(svc.retire("tenant-a", "p2", { note: "again", expectedVersion: 2 }, A), "invalid_state");
  await rejects(svc.retire("tenant-a", "missing", { note: "x", expectedVersion: 1 }, A), "not_found");
  await rejects(svc.retire("tenant-a", "p1", { note: "x" }, A), "invalid_policy");
});
test("review queue: every change and conflict is queued, deduped, and resolvable once with a note", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "p1", body(), A);
  await svc.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A);
  await svc.save("tenant-a", "p2", body({ mode: "internal-and-web", style: "detailed", expectedVersion: 1, note: "style" }), A);
  const q = await svc.queue("tenant-a");
  assert.equal(q.filter((i) => i.kind === "change").length, 3);
  assert.deepEqual(q.find((i) => i.key === "p2@2")!.change?.changedFields, ["style"]);
  const conflicts = q.filter((i) => i.kind === "conflict");
  assert.equal(new Set(conflicts.map((c) => c.key)).size, conflicts.length, "no duplicate conflict items");
  const change = q.find((i) => i.kind === "change")!;
  await rejects(svc.resolve("tenant-a", change.id, { decision: "acknowledged", note: "n" }, A), "invalid_policy");
  await rejects(svc.resolve("tenant-a", change.id, { decision: "approved", note: "" }, A), "invalid_policy");
  const done = await svc.resolve("tenant-a", change.id, { decision: "approved", note: "ok", claimedBy: "Umesh" }, A);
  assert.equal(done.status, "approved"); assert.equal(done.resolution?.by.claimedBy, "Umesh");
  await rejects(svc.resolve("tenant-a", change.id, { decision: "rejected", note: "again" }, A), "invalid_state");
  await rejects(svc.resolve("tenant-a", "nope", { decision: "approved", note: "n" }, A), "not_found");
  const c = conflicts.find((x) => x.status === "open")!;
  assert.equal((await svc.resolve("tenant-a", c.id, { decision: "acknowledged", note: "known" }, A)).status, "acknowledged");
});
test("tenant isolation: history, list, conflicts, queue and resolve never cross tenants", async () => {
  const { svc } = setup();
  await svc.save("tenant-a", "shared-id", body(), A);
  await svc.save("tenant-a", "p2", body({ mode: "internal-and-web" }), A);
  const itemA = (await svc.queue("tenant-a"))[0]!;
  await svc.save("tenant-b", "shared-id", body({ style: "detailed" }), B);
  assert.equal((await svc.history("tenant-b", "shared-id")).length, 1, "same policy id is independent per tenant");
  assert.equal((await svc.history("tenant-b", "shared-id"))[0]!.style, "detailed");
  assert.deepEqual((await svc.list("tenant-b")).map((p) => p.policyId), ["shared-id"]);
  assert.equal((await svc.conflicts("tenant-b")).length, 0, "tenant A's contradictory pair is invisible and not merged with B");
  assert.ok((await svc.queue("tenant-b")).every((i) => i.tenantId === "tenant-b"));
  await rejects(svc.resolve("tenant-b", itemA.id, { decision: "approved", note: "steal" }, B), "not_found");
  assert.equal((await svc.queue("tenant-a", "open")).find((i) => i.id === itemA.id)?.status, "open");
  await rejects(svc.retire("tenant-b", "p2", { note: "x", expectedVersion: 1 }, B), "not_found");
  assert.equal((await svc.list("tenant-a")).find((p) => p.policyId === "p2")?.retired, false);
});
test("store refuses rows whose tenant differs from the call tenant", async () => {
  const { store, svc } = setup();
  const rev = (await svc.save("tenant-a", "p1", body(), A)).revision;
  await assert.rejects(store.appendRevision("tenant-b", { ...rev, version: 2 }, 1), /tenant mismatch/);
});

const result = (over: Record<string, unknown> = {}) => ({ answer: "ok", verdict: "correct", web_used: false, insufficient_coverage: false,
  sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1" } }], web: [] }, ...over }) as unknown as AskV2Result;
test("evaluation: citations stay mandatory whatever the policy says; policies only tighten", async () => {
  const { svc } = setup();
  const web = (await svc.save("tenant-a", "web", body({ mode: "internal-and-web", onInsufficient: "review" }), A)).revision;
  const strict = (await svc.save("tenant-a", "strict", body({ questionClass: "other", onInsufficient: "refuse" }), A)).revision;
  assert.equal(evaluatePolicy("tenant-a", web, result()).decision, "allow");
  const noSources = result({ sources: { internal: [], web: [] } });
  for (const p of [web, strict]) assert.equal(evaluatePolicy("tenant-a", p, noSources).decision, "refuse", "no citations => refuse under any policy");
  assert.equal(evaluatePolicy("tenant-a", web, result({ sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "" } }], web: [] } })).decision, "review");
  assert.equal(evaluatePolicy("tenant-a", strict, result({ sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "" } }], web: [] } })).decision, "refuse");
  assert.equal(evaluatePolicy("tenant-a", strict, result()).citationsRequired, true);
  assert.throws(() => evaluatePolicy("tenant-b", web, result()), /tenant mismatch/);
  const retired = (await svc.retire("tenant-a", "web", { note: "x", expectedVersion: 1 }, A)).revision;
  assert.throws(() => evaluatePolicy("tenant-a", retired, result()), /retired/);
});
