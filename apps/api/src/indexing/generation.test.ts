import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claims, SessionPages, TreeIndexNode, TreeIndexRootDocument, Turns } from "@lkb/core";
import { connectorFixture } from "../connector-workflow/fixtures.js";
import { acquireIndexAttempt, enterIndexWrites, failIndexAttempt, verifyIndexGeneration, persistIndexTree,
  indexTurnDigest, validatePreservedIndexClaims, bindIndexTree, type IndexAttempt } from "./generation.js";

test("accepted session routing summaries are source-derived and truncated on UTF8 codepoint boundaries", () => {
  const binding = { version: 1 as const, generation: "00000000-0000-4000-8000-000000000000", sessionId: "session", sourceId: "source", turnDigest: "a".repeat(64) };
  const summary = "करियर 🧠 ".repeat(200);
  const page: SessionPages = { _id: "page", tenantId: "tenant-a", sessionId: "session", summary,
    keyInsights: [], decisions: [], actionItems: [], evidence: [{ sessionId: "session", turnId: "turn" }], indexArtifact: binding };
  const node = (id: string, session: string, text: string): TreeIndexNode => ({ node_id: id, title: id, level: "session", summary: text,
    evidence: { sessionRef: session, routingSummary: "untrusted inherited routing text" }, children: [] });
  const root: TreeIndexRootDocument = { tenantId: "tenant-a", node_id: "tenant:tenant-a", title: "Tenant", level: "tenant", summary: "",
    children: [node("accepted", "session", summary), node("missing", "missing", summary), node("mismatched", "session", "Different summary")] };
  const result = bindIndexTree(root, binding, [page]);
  const routing = result.children[0]!.evidence!.routingSummary as string;
  assert.ok(routing.length > 0); assert.ok(Buffer.byteLength(routing, "utf8") <= 768);
  assert.ok(summary.startsWith(routing)); assert.ok(!routing.includes("\uFFFD"));
  assert.equal(Buffer.from(routing).toString("utf8"), routing);
  assert.equal(result.children[1]!.evidence!.routingSummary, undefined);
  assert.equal(result.children[2]!.evidence!.routingSummary, undefined);
  assert.ok((result.evidence!.routingSummary as string).includes("accepted:"));
  assert.ok(!(result.evidence!.routingSummary as string).includes("untrusted inherited"));
  assert.ok(Buffer.byteLength(result.evidence!.routingSummary as string, "utf8") <= 768);
  assert.equal(root.children[0]!.evidence!.routingSummary, "untrusted inherited routing text");
  assert.equal(bindIndexTree(root, binding, [{ ...page, tenantId: "foreign" }]).children[0]!.evidence!.routingSummary, undefined);
  const nested = bindIndexTree({ ...root, children: [{ node_id: "year", title: "2026", level: "year", summary: "unsupported ancestor summary",
    children: [{ node_id: "month", title: "October", level: "month", summary: "unsupported ancestor summary", children: [root.children[0]!] }] }] }, binding, [page]);
  for (const container of [nested, nested.children[0]!, nested.children[0]!.children[0]!]) {
    const text = container.evidence!.routingSummary as string;
    assert.ok(Buffer.byteLength(text, "utf8") <= 768); assert.ok(text.includes("करियर"));
    assert.ok(!text.includes("unsupported ancestor summary"));
  }
});

const URL = "https://zoom.us/rec/share/AbCdEfGh12345678";
async function consumed() {
  const fixture = connectorFixture(); fixture.useHostedRecording(true);
  const result = await fixture.call("POST", "/connector-workflow/intake", { url: URL });
  assert.equal(result.status, 201);
  const sessionId = String(result.body.sessionId), sourceId = String(result.body.sourceId);
  const generation = String(fixture.rows("sessions")[0]!.indexAttempt.generation);
  return { fixture, sessionId, sourceId, generation };
}
test("actual strict caller publishes only the persisted attempt and all generated artifacts carry its source generation", async () => {
  const { fixture: f, sessionId, sourceId, generation } = await consumed();
  const before = f.writes.length;
  const proof = await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation);
  assert.deepEqual(proof, { generation, sourceId, sessionId, strict: true, turnCount: 1, chunkCount: 1 });
  assert.equal(f.writes.length, before); assert.equal(f.counters().indexes, 1);
  assert.equal(f.rows("sources")[0]!.sourceMeta.connectorIndex.generation, generation);
  for (const name of ["session_pages", "claims", "chunks"]) for (const row of f.rows(name)) {
    assert.equal(row.indexArtifact.generation, generation); assert.equal(row.indexArtifact.sourceId, sourceId); assert.equal(row.indexArtifact.sessionId, sessionId);
  }
  assert.equal(f.rows("sessions")[0]!.indexAttempt.state, "complete"); assert.equal(f.rows("sessions")[0]!.status.index, "done");
  assert.equal(f.rows("tree_index")[0]!.indexRevision, 1);
  assert.equal(await verifyIndexGeneration(f.db, "tenant-b", sessionId, generation), null);
});
test("stale, foreign, missing and mixed artifact generation cannot survive a physically complete cached receipt", async () => {
  const { fixture: f, sessionId, sourceId, generation } = await consumed();
  for (const name of ["session_pages", "claims", "chunks"]) {
    const row = f.rows(name)[0]!; const binding = structuredClone(row.indexArtifact);
    for (const key of ["generation", "sourceId", "turnDigest"]) {
      row.indexArtifact = { ...binding, [key]: key === "generation" ? "00000000-0000-4000-8000-000000000000" : "foreign" };
      assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null, `${name}/${key}`);
      assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), false);
    }
    delete row.indexArtifact;
    assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null, `${name}/missing`);
    row.indexArtifact = binding;
  }
  const original = f.rows("turns")[0]!.text; f.rows("turns")[0]!.text += " Changed after indexing.";
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null);
  f.rows("turns")[0]!.text = original;
  assert.ok(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation));
});
test("removing only the exact session tree artifact refuses cached consumption while unrelated nodes remain", async () => {
  const { fixture: f, sessionId, sourceId, generation } = await consumed();
  const root = f.rows("tree_index")[0]!, saved = structuredClone(root);
  const remove = (node: TreeIndexNode): void => {
    node.children = node.children.filter(child => !(child.level === "session" && child.evidence?.sessionRef === sessionId));
    node.children.forEach(remove);
  };
  root.children.push({ node_id: "tenant-a/unrelated", title: "Other", level: "session", summary: "Other source", evidence: { sessionRef: "other-session" }, children: [] });
  remove(root as TreeIndexNode);
  assert.ok(root.children.some((node: TreeIndexNode) => node.evidence?.sessionRef === "other-session"));
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null);
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), false);
  assert.equal(f.counters().indexes, 1);
  f.rows("tree_index").splice(0, 1, saved);
  assert.ok(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation));
});
test("durable session CAS admits one same-session owner, allows preflight retry, and never takes over uncertain writes", async () => {
  const f = connectorFixture(); const materialized = await f.deps.sourceIntake!.intake({ tenantId: "tenant-a", url: "https://public.example/visa" });
  const turns = f.rows("turns") as Turns[];
  const race = await Promise.allSettled([acquireIndexAttempt(f.db, "tenant-a", materialized.sessionId, turns, true), acquireIndexAttempt(f.db, "tenant-a", materialized.sessionId, turns, true)]);
  const winners = race.filter((result): result is PromiseFulfilledResult<IndexAttempt> => result.status === "fulfilled");
  assert.equal(winners.length, 1); assert.equal(f.counters().indexes, 0);
  const first = winners[0]!.value;
  await failIndexAttempt(f.db, "tenant-a", first);
  assert.equal(f.rows("sessions")[0]!.indexAttempt.state, "failed");
  const second = await acquireIndexAttempt(f.db, "tenant-a", materialized.sessionId, turns, true);
  assert.notEqual(first.generation, second.generation);
  await enterIndexWrites(f.db, "tenant-a", second); await failIndexAttempt(f.db, "tenant-a", second);
  assert.equal(f.rows("sessions")[0]!.indexAttempt.state, "uncertain");
  f.setClock("2099-10-14T00:00:00.000Z");
  await assert.rejects(acquireIndexAttempt(f.db, "tenant-a", materialized.sessionId, turns, true), /index_attempt_requires_recovery/);
  await failIndexAttempt(f.db, "tenant-a", first); // stale owner's cleanup cannot alter the second attempt.
  assert.equal(f.rows("sessions")[0]!.indexAttempt.generation, second.generation);
});
test("tree revision CAS preserves a legacy root id and refuses a stale expected root without upsert", async () => {
  const f = connectorFixture(); const materialized = await f.deps.sourceIntake!.intake({ tenantId: "tenant-a", url: "https://public.example/visa" });
  const attempt = await acquireIndexAttempt(f.db, "tenant-a", materialized.sessionId, f.rows("turns") as Turns[], true);
  await enterIndexWrites(f.db, "tenant-a", attempt);
  const base: TreeIndexRootDocument & { _id: string } = { _id: "legacy-root-id", tenantId: "tenant-a", node_id: "tenant:tenant-a", level: "tenant", title: "Tenant", summary: "", children: [] };
  f.rows("tree_index").push(structuredClone(base));
  assert.equal(await persistIndexTree(f.db, "tenant-a", attempt, base, base), 1);
  assert.equal(f.rows("tree_index")[0]!._id, "legacy-root-id");
  await assert.rejects(persistIndexTree(f.db, "tenant-a", attempt, base, base), /index_tree_cas_unconfirmed/);
  assert.equal(f.rows("tree_index").length, 1); assert.equal(f.rows("tree_index")[0]!.indexRevision, 1);
});
test("strict preflight failure leaves prior artifacts intact and cannot return their generation as fresh", async () => {
  const { fixture: f, sessionId, generation } = await consumed();
  const snapshots = Object.fromEntries(["session_pages", "claims", "chunks", "tree_index"].map(name => [name, structuredClone(f.rows(name))]));
  f.rows("turns")[0]!.speakerRef = "";
  await assert.rejects(f.deps.indexSession!("tenant-a", sessionId), /strict webinar index incomplete/);
  for (const [name, rows] of Object.entries(snapshots)) assert.deepEqual(f.rows(name), rows);
  assert.equal(f.rows("sessions")[0]!.indexAttempt.state, "failed"); assert.equal(f.rows("sessions")[0]!.indexAttempt.phase, "preflight");
  assert.equal(await verifyIndexGeneration(f.db, "tenant-a", sessionId, generation), null);
});
test("canonical reviewed paraphrase retains exact current source evidence and immutable review digest without acquiring generated status", async () => {
  // Synthetic policy compatibility fixture, not an authentic human approval or human gold.
  // Exact accepted synthetic T040 floor: scripts/qa/t040-acceptance.test.mjs:69.
  // That inspector passes provenance with a semantic-unverified warning and full HOLD.
  const fee = "The fee is 5000 rupees.";
  const turns: Turns[] = [{ _id: "t1", tenantId: "tenant-a", sessionId: "session-a", speakerRef: "person:rao", speakerLabel: "Dr Rao",
    tStart: 12, tEnd: 24, text: "The fee is 5000 rupees. Applications close in March. Please submit the form." }];
  const claim: Claims = { _id: "claim1", tenantId: "tenant-a", text: "Tuition costs five thousand rupees.", status: "verified",
    evidence: [{ turnId: "t1", sessionId: "session-a", quote: fee }] };
  const before = structuredClone(claim);
  assert.notEqual(claim.text, fee);
  const [first] = validatePreservedIndexClaims([claim], turns);
  assert.deepEqual(claim, before); // no text, review status, evidence or generation stamp rewritten.
  const [changed] = validatePreservedIndexClaims([{ ...claim, status: "conflicting" }], turns);
  assert.notEqual(first!.digest, changed!.digest);
  for (const quote of ["invented quote", "Invented unsupported text."]) {
    assert.throws(() => validatePreservedIndexClaims([{ ...claim, evidence: [{ ...claim.evidence[0]!, quote }] }], turns));
  }
  assert.throws(() => validatePreservedIndexClaims([{ ...claim, evidence: [{ turnId: "t1", sessionId: "session-a" }] }], turns));
  assert.throws(() => validatePreservedIndexClaims([{ ...claim, tenantId: "tenant-b" }], turns));
  assert.throws(() => validatePreservedIndexClaims([{ ...claim, evidence: [{ ...claim.evidence[0]!, sessionId: "other-session" }] }], turns));
  assert.throws(() => validatePreservedIndexClaims([{ ...claim, evidence: [{ ...claim.evidence[0]!, turnId: "other-turn" }] }], turns));
  assert.throws(() => validatePreservedIndexClaims([{ ...claim, status: "needs-review" }], turns));
  assert.equal(indexTurnDigest(turns), indexTurnDigest(structuredClone(turns)));
  // Actual strict grounded writer/manifest readback over a synthetic stored review row.
  // This models existing review policy; it does not record genuine human approval or gold.
  const f = connectorFixture(); f.useHostedRecording(true, true);
  const created = await f.call("POST", "/connector-workflow/intake", { url: URL });
  assert.equal(created.status, 201);
  const sourceTurn = f.rows("turns")[0]!;
  const reviewed: Claims = { _id: "preserved-policy-fixture", tenantId: "tenant-a", status: "verified",
    text: "UK student visa guidance is confirmed by this fixture recording.",
    evidence: [{ turnId: sourceTurn._id, sessionId: created.body.sessionId, quote: sourceTurn.text }] };
  f.rows("claims").push(structuredClone(reviewed));
  const reindexed = await f.deps.indexSession!("tenant-a", created.body.sessionId);
  assert.equal(reindexed.completion!.complete, true); assert.equal(reindexed.completion!.strict, true);
  assert.equal(reindexed.groundedNotes!.claims!.preserved, 1);
  const stored = f.rows("claims").find(row => row._id === reviewed._id)!;
  assert.equal(stored.status, reviewed.status); assert.equal(stored.text, reviewed.text); assert.deepEqual(stored.evidence, reviewed.evidence);
  assert.equal(stored.indexArtifact, undefined); // existing review is never stamped as newly generated.
  const proof = await verifyIndexGeneration(f.db, "tenant-a", created.body.sessionId, reindexed.completion!.generation);
  assert.ok(proof);
  assert.ok(f.rows("sessions")[0]!.indexAttempt.manifest.preservedClaims.some((ref: { id: string }) => ref.id === reviewed._id));
});
