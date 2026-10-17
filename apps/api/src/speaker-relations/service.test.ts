import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeakerRelationshipService } from "./service.js";
import type { RelationshipAuthority, RelationshipContext, RelationshipProposal, RelationshipRow, RelationshipTransaction, SpeakerRelationshipStore } from "./types.js";

const context: RelationshipContext = { tenantId: "A", actorId: "human-reviewer", canPropose: true, canReview: true, reviewerKind: "human" };
const sha = "a".repeat(64); const revision = "b".repeat(64);
function fixture() {
  const evidence = (turnId: string, quote: string) => ({ sessionId: "s1", sessionTitle: "Fixture", turnId, quote, tStart: 0, tEnd: 2 });
  const authority: RelationshipAuthority = { view: { tenantId: "A", personId: "person:example", identityStatus: "human-confirmed", ambiguity: null, revision,
    nodes: [], edges: [], statements: [{ id: "c1", text: "First claim", topicIds: [], evidence: [evidence("t1", "First exact quote")] }, { id: "c2", text: "Second claim", topicIds: [], evidence: [evidence("t2", "Second exact quote")] }], withheldRelationships: 0 }, transcriptHashes: { s1: sha } };
  const rows = new Map<string, RelationshipRow>(); let nextAuthority: RelationshipAuthority | null = authority; let failCAS = false;
  const tx: RelationshipTransaction = {
    async get(id) { return structuredClone(rows.get(id) ?? null); },
    async insert(row) { if (rows.has(row._id)) throw new Error("duplicate"); rows.set(row._id, structuredClone(row)); },
    async replaceCAS(id, base, row) { if (failCAS || rows.get(id)?.revision !== base) return false; rows.set(id, structuredClone(row)); return true; },
    async list(person, status) { return [...rows.values()].filter(r => r.from.personId === person && r.status === status).map(r => structuredClone(r)); },
    async authority() { return nextAuthority; },
  };
  let tail = Promise.resolve();
  const store: SpeakerRelationshipStore = { transaction: async <T>(_tenant: string, run: (t: RelationshipTransaction) => Promise<T>): Promise<T> => {
    const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await prior;
    try { return await run(tx); } finally { release(); }
  } };
  const proposal: RelationshipProposal = { id: "proposal-key", personId: "person:example", fromClaimId: "c1", toClaimId: "c2", type: "contradicts", evidence: [{ sessionId: "s1", turnId: "t2", quote: "Second exact quote", transcriptHash: sha }], sourceRevisionDigest: revision };
  return { service: createSpeakerRelationshipService(store, () => "2026-10-15T12:00:00Z"), proposal, authority, rows, setAuthority(value: RelationshipAuthority | null) { nextAuthority = value; }, failCAS() { failCAS = true; } };
}
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, { message: `speaker_relationship_${code}` });

test("proposal is durable suggested only; explicit human review makes current same-speaker relation available", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  assert.equal(created.status, "suggested"); assert.equal(created.revision, 1); assert.match(created.id, /^rel:[a-f0-9]{64}$/);
  assert.deepEqual(await f.service.accepted(context, "person:example"), []);
  assert.equal((await f.service.propose(context, f.proposal)).replayed, true);
  await f.service.review(context, { id: created.id, baseRevision: 1, requestId: "approve-1", decision: "accept" });
  const accepted = await f.service.accepted(context, "person:example");
  assert.equal(accepted.length, 1); assert.equal(accepted[0]!.type, "contradicts"); assert.equal(accepted[0]!.evidence[0]!.quote, "Second exact quote");
});

test("automation cannot review; no actor can turn suggested or deterministic identity into confirmed", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  await rejects(f.service.review({ ...context, reviewerKind: "automation" }, { id: created.id, baseRevision: 1, requestId: "bad", decision: "accept" }), "forbidden");
  for (const identityStatus of ["unresolved", "deterministic"] as const) {
    f.authority.view.identityStatus = identityStatus;
    await rejects(f.service.propose(context, { ...f.proposal, id: identityStatus }), "unavailable");
  }
  assert.equal(f.rows.size, 1);
});

test("stale, invisible, foreign, forged and missing endpoint evidence fails closed", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => f.setAuthority(null),
    (f: ReturnType<typeof fixture>) => { f.authority.view.tenantId = "B"; },
    (f: ReturnType<typeof fixture>) => { f.authority.view.personId = "person:other"; },
    (f: ReturnType<typeof fixture>) => { f.authority.view.revision = "c".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.authority.transcriptHashes = {}; },
    (f: ReturnType<typeof fixture>) => { f.authority.view.statements.pop(); },
    (f: ReturnType<typeof fixture>) => { f.proposal.evidence[0]!.quote = "Not actually spoken"; },
    (f: ReturnType<typeof fixture>) => { f.proposal.evidence[0]!.turnId = "moderator"; },
  ]) {
    const f = fixture(); change(f); await rejects(f.service.propose(context, f.proposal), "unavailable"); assert.equal(f.rows.size, 0);
  }
});

test("cross-person persisted endpoints and revoked/corrected source snapshots never enter accepted reader", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  await f.service.review(context, { id: created.id, baseRevision: 1, requestId: "approve", decision: "accept" });
  const row = f.rows.get(created.id)!; row.to.personId = "person:other";
  assert.deepEqual(await f.service.accepted(context, "person:example"), []);
  row.to.personId = "person:example"; f.setAuthority(null);
  assert.deepEqual(await f.service.accepted(context, "person:example"), []);
});

test("review CAS has one winner; mismatched keys and stale expected revisions conflict", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  const results = await Promise.allSettled(["accept", "reject"].map((decision, index) => f.service.review(context, { id: created.id, baseRevision: 1, requestId: `race-${index}`, decision: decision as "accept" | "reject" })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected").length, 1);
  await rejects(f.service.review(context, { id: created.id, baseRevision: 1, requestId: "race-0", decision: "reject" }), "conflict");
  await rejects(f.service.propose(context, { ...f.proposal, type: "agrees_with" }), "conflict");
});

test("idempotent review receipt survives later revocation without reopening the relationship", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  const command = { id: created.id, baseRevision: 1, requestId: "accept-token", decision: "accept" as const };
  const accepted = await f.service.review(context, command);
  await f.service.review(context, { id: created.id, baseRevision: 2, requestId: "revoke-token", decision: "revoke" });
  const replay = await f.service.review(context, command);
  assert.deepEqual(replay, { ...accepted, replayed: true });
  assert.equal(f.rows.get(created.id)!.status, "revoked"); assert.deepEqual(await f.service.accepted(context, "person:example"), []);
  await rejects(f.service.review(context, { ...command, baseRevision: 3, requestId: "reopen" }), "conflict");
  await rejects(f.service.review({ ...context, actorId: "another-human" }, command), "conflict");
});

test("source changes between proposal and review refuse writes; storage CAS failure refuses receipt", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal);
  f.authority.view.revision = "c".repeat(64);
  await rejects(f.service.review(context, { id: created.id, baseRevision: 1, requestId: "stale", decision: "accept" }), "unavailable");
  assert.equal(f.rows.get(created.id)!.revision, 1);
  f.authority.view.revision = revision; f.failCAS();
  await rejects(f.service.review(context, { id: created.id, baseRevision: 1, requestId: "cas-fail", decision: "accept" }), "conflict");
});

test("all tenant-bound operations refuse foreign persisted rows and invalid/unbounded input", async () => {
  const f = fixture(); const created = await f.service.propose(context, f.proposal); f.rows.get(created.id)!.tenantId = "B";
  assert.deepEqual(await f.service.list(context, "person:example", "suggested"), []);
  await rejects(f.service.review(context, { id: created.id, baseRevision: 1, requestId: "foreign", decision: "accept" }), "not_found");
  await rejects(f.service.propose(context, { ...f.proposal, evidence: Array.from({ length: 21 }, () => f.proposal.evidence[0]!) as RelationshipProposal["evidence"] }), "invalid");
  await rejects(f.service.propose({ ...context, canPropose: false }, f.proposal), "forbidden");
});

test("identical caller proposal keys produce separate Mongo identities across tenants", async () => {
  const a = fixture(); const b = fixture(); b.authority.view.tenantId = "B";
  const first = await a.service.propose(context, a.proposal);
  const second = await b.service.propose({ ...context, tenantId: "B" }, b.proposal);
  assert.notEqual(first.id, second.id);
});
