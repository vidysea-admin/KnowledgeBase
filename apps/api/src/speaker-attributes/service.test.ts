import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedSpeakerAttributes, createSpeakerAttributeService } from "./service.js";
import type { AttributeAuthority, AttributeContext, AttributeProposal, AttributeRow, AttributeTransaction, SpeakerAttributeStore } from "./types.js";

const human: AttributeContext = { tenantId: "A", actorId: "user:reviewer", canPropose: true, canReview: true, reviewerKind: "human" };
function fixture() {
  const authority: AttributeAuthority = { view: { tenantId: "A", personId: "person:priya", identityStatus: "human-confirmed", ambiguity: null, revision: "a".repeat(64), nodes: [], edges: [], statements: [], withheldRelationships: 0 },
    transcriptHashes: { s1: "b".repeat(64) }, attributedTurns: [{ sessionId: "s1", turnId: "t1", text: "I work at Example as a counsellor.", speakerRef: "spk:1", startTurnIndex: 3, endTurnIndex: 5 }] };
  const proposal: AttributeProposal = { id: "proposal:org", personId: "person:priya", field: "org", value: "Example", sourceRevisionDigest: authority.view.revision,
    evidence: [{ sessionId: "s1", turnId: "t1", quote: "I work at Example as a counsellor.", transcriptHash: "b".repeat(64), speakerRef: "spk:1", startTurnIndex: 3, endTurnIndex: 5 }] };
  const rows = new Map<string, AttributeRow>(); let current: AttributeAuthority | null = authority; let cas = true;
  const tx: AttributeTransaction = { async get(id) { return structuredClone(rows.get(id) ?? null); }, async insert(row) { if (rows.has(row._id)) throw Error("duplicate"); rows.set(row._id, structuredClone(row)); },
    async replaceCAS(id, revision, row) { if (!cas || rows.get(id)?.revision !== revision) return false; rows.set(id, structuredClone(row)); return true; },
    async list(personId, status) { return [...rows.values()].filter(r => r.personId === personId && r.status === status).map(r => structuredClone(r)); }, async authority() { return current; } };
  let tail = Promise.resolve();
  const store: SpeakerAttributeStore = { async transaction<T>(_tenant: string, run: (tx: AttributeTransaction) => Promise<T>): Promise<T> { const before = tail; let release!: () => void; tail = new Promise<void>(r => { release = r; }); await before; try { return await run(tx); } finally { release(); } } };
  return { authority, proposal, rows, tx, service: createSpeakerAttributeService(store, () => "2026-10-15T12:00:00Z"), withdraw() { current = null; }, failCAS() { cas = false; } };
}
const refuses = (p: Promise<unknown>, code: string) => assert.rejects(p, { message: `speaker_attribute_${code}` });
async function accept(f: ReturnType<typeof fixture>, proposal = f.proposal) { const r = await f.service.propose(human, proposal); await f.service.review(human, { id: r.id, baseRevision: 1, requestId: `accept:${proposal.id}`, decision: "accept" }); return r; }

test("org proposal remains suggested until human accept; exact own-block evidence reaches consumer", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal); assert.equal(r.status, "suggested"); assert.equal((await f.service.propose(human, f.proposal)).replayed, true);
  assert.deepEqual((await f.service.accepted(human, "person:priya")).fields, {});
  await f.service.review(human, { id: r.id, baseRevision: 1, requestId: "review:1", decision: "accept" });
  assert.deepEqual((await acceptedSpeakerAttributes(f.tx, "A", "person:priya")).fields.org, { value: "Example", evidence: f.proposal.evidence });
});
test("automation/permission refusal and unresolved/deterministic/ambiguous identity cannot finalize", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal);
  for (const c of [{ ...human, reviewerKind: "automation" as const }, { ...human, canReview: false }]) await refuses(f.service.review(c, { id: r.id, baseRevision: 1, requestId: "bad", decision: "accept" }), "forbidden");
  await refuses(f.service.propose({ ...human, canPropose: false }, f.proposal), "forbidden");
  for (const status of ["unresolved", "deterministic"] as const) { f.authority.view.identityStatus = status; await refuses(f.service.propose(human, { ...f.proposal, id: status }), "unavailable"); }
  f.authority.view.identityStatus = "human-confirmed"; f.authority.view.ambiguity = { kind: "same-name-cross-session", sessionIds: ["s1", "s2"] };
  await refuses(f.service.propose(human, { ...f.proposal, id: "ambiguous" }), "unavailable");
});
test("stale tenant/person/hash/quote/window/label and duplicate turn authority refuse", async () => {
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [f => f.withdraw(), f => { f.authority.view.tenantId = "B"; }, f => { f.authority.view.personId = "person:other"; },
    f => { f.authority.view.revision = "c".repeat(64); }, f => { f.authority.transcriptHashes = { ...f.authority.transcriptHashes, s1: "c".repeat(64) }; }, f => { f.authority.attributedTurns[0]!.text = "Someone mentioned Example"; },
    f => { f.authority.attributedTurns[0]!.startTurnIndex = 2; }, f => { f.authority.attributedTurns[0]!.speakerRef = "spk:2"; }, f => { f.authority.attributedTurns.push({ ...f.authority.attributedTurns[0]! }); }];
  for (const change of changes) { const f = fixture(); change(f); await refuses(f.service.propose(human, f.proposal), "unavailable"); assert.equal(f.rows.size, 0); }
});
test("invalid evidence and unsupported value refuse before write", async () => {
  for (const change of [(p: AttributeProposal) => { p.value = "Invented"; }, (p: AttributeProposal) => { p.evidence[0]!.startTurnIndex = -1; },
    (p: AttributeProposal) => { p.evidence[0]!.endTurnIndex = 2; }, (p: AttributeProposal) => { p.evidence.push({ ...p.evidence[0]! }); }, (p: AttributeProposal) => { p.value = " Example"; }]) {
    const f = fixture(); change(f.proposal); await refuses(f.service.propose(human, f.proposal), "invalid"); assert.equal(f.rows.size, 0);
  }
});
test("actor-bound replay survives revocation and deletion without reopening; changed command conflicts", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal); const command = { id: r.id, baseRevision: 1, requestId: "accept:1", decision: "accept" as const };
  const accepted = await f.service.review(human, command); const revision = (await f.service.accepted(human, "person:priya")).revision;
  f.withdraw(); await f.service.review(human, { id: r.id, baseRevision: 2, requestId: "revoke:1", decision: "revoke" });
  assert.deepEqual(await f.service.review(human, command), { ...accepted, replayed: true }); assert.equal(f.rows.get(r.id)!.status, "revoked");
  const projection = await f.service.accepted(human, "person:priya"); assert.deepEqual(projection.fields, {}); assert.notEqual(projection.revision, revision);
  await refuses(f.service.review({ ...human, actorId: "user:other" }, command), "conflict");
  await refuses(f.service.review(human, { ...command, decision: "reject" }), "conflict");
});
test("source deletion refuses acceptance but permits durable rejection", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal); f.withdraw();
  await refuses(f.service.review(human, { id: r.id, baseRevision: 1, requestId: "accept", decision: "accept" }), "unavailable");
  assert.equal((await f.service.review(human, { id: r.id, baseRevision: 1, requestId: "reject", decision: "reject" })).status, "rejected");
});
test("concurrent accept/reject has one winner and failed CAS never accepts", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal);
  const outcomes = await Promise.allSettled(["accept", "reject"].map(decision => f.service.review(human, { id: r.id, baseRevision: 1, requestId: decision, decision: decision as "accept" | "reject" })));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const g = fixture(); const next = await g.service.propose(human, g.proposal); g.failCAS(); await refuses(g.service.review(human, { id: next.id, baseRevision: 1, requestId: "accept", decision: "accept" }), "conflict");
  assert.equal(g.rows.get(next.id)!.status, "suggested");
});
test("conflicting accepted values withheld; same-value and independent role survive", async () => {
  const f = fixture(); await accept(f); await accept(f, { ...f.proposal, id: "same" });
  await accept(f, { ...f.proposal, id: "role", field: "role", value: "counsellor" });
  assert.equal((await f.service.accepted(human, "person:priya")).fields.org!.value, "Example");
  await accept(f, { ...f.proposal, id: "other", value: "work" });
  const fields = await f.service.accepted(human, "person:priya"); assert.equal(fields.fields.org, undefined); assert.equal(fields.fields.role!.value, "counsellor"); assert.deepEqual(fields.withheldFields, ["org"]);
});
test("forged accepted rows lacking valid review receipt and stale accepted source excluded", async () => {
  const f = fixture(); const r = await accept(f); const original = structuredClone(f.rows.get(r.id)!);
  for (const mutate of [(row: AttributeRow) => { row.reviewHistory = []; }, (row: AttributeRow) => { row.review!.actorId = "other"; }, (row: AttributeRow) => { row.reviewHistory![0]!.requestHash = "a".repeat(64); }, (row: AttributeRow) => { row.tenantId = "B"; }]) {
    const row = structuredClone(original); mutate(row); f.rows.set(r.id, row); assert.deepEqual((await f.service.accepted(human, "person:priya")).fields, {});
  }
  f.rows.set(r.id, original); f.authority.attributedTurns = []; assert.deepEqual((await f.service.accepted(human, "person:priya")).fields, {});
});
test("proposal keys are tenant isolated and immutable including actor/value", async () => {
  const f = fixture(); const r = await f.service.propose(human, f.proposal);
  await refuses(f.service.propose({ ...human, actorId: "other" }, f.proposal), "conflict");
  await refuses(f.service.propose(human, { ...f.proposal, value: "work" }), "conflict");
  f.authority.view.tenantId = "B"; const second = await f.service.propose({ ...human, tenantId: "B" }, f.proposal); assert.notEqual(r.id, second.id);
});
