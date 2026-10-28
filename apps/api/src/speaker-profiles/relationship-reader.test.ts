import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import type { RelationshipAuthority, RelationshipRow } from "../speaker-relations/types.js";
import { readAcceptedSpeakerRelationships } from "./relationship-reader.js";

const hash = "a".repeat(64), revision = "b".repeat(64);
function fixture() {
  const quote = "Exact source quotation";
  const evidence = { sessionId: "s", sessionTitle: "Session", turnId: "t", tStart: 0, tEnd: 1, quote };
  const authority: RelationshipAuthority = { view: { tenantId: "A", personId: "person:priya", identityStatus: "human-confirmed", ambiguity: null, revision, nodes: [], edges: [], statements: ["c1", "c2"].map(id => ({ id, text: id, topicIds: [], evidence: [evidence] })), withheldRelationships: 0 }, transcriptHashes: { s: hash } };
  const row: RelationshipRow = { _id: "rel:fixture", tenantId: "A", revision: 2, status: "accepted", type: "contradicts", from: { personId: "person:priya", claimId: "c1" }, to: { personId: "person:priya", claimId: "c2" }, evidence: [{ sessionId: "s", turnId: "t", quote, transcriptHash: hash }], sourceRevisionDigest: revision, createdBy: "proposer",
    review: { actorId: "reviewer", decision: "accepted", at: "2026-10-15T10:00:00Z", baseRevision: 1 }, reviewHistory: [{ requestId: "accept", requestHash: hash, actorId: "reviewer", decision: "accept", at: "2026-10-15T10:00:00Z", baseRevision: 1, resultRevision: 2 }] };
  let rows = [row]; let reads = 0;
  const db = { collection(name: string) {
    assert.equal(name, "speaker_relationships");
    return { find(filter: Record<string, unknown>) {
      reads++; assert.deepEqual(filter, { tenantId: "A", "from.personId": "person:priya", "to.personId": "person:priya", status: "accepted" });
      return { sort() { return { limit(n: number) { assert.equal(n, 101); return { async toArray() { return structuredClone(rows.slice(0, n)); } }; } }; } };
    } };
  } } as unknown as Pick<Db, "collection">;
  return { authority, row, db, setRows(value: RelationshipRow[]) { rows = value; }, reads: () => reads };
}

test("snapshot accepted reader reuses canonical validator and excludes stale foreign unreviewed terminal rows", async () => {
  const f = fixture();
  assert.equal((await readAcceptedSpeakerRelationships(f.db, "A", "person:priya", f.authority)).length, 1);
  for (const mutate of [
    (r: RelationshipRow) => { r.status = "suggested"; },
    (r: RelationshipRow) => { r.status = "rejected"; },
    (r: RelationshipRow) => { r.status = "revoked"; },
    (r: RelationshipRow) => { r.tenantId = "B"; },
    (r: RelationshipRow) => { r.to.personId = "person:foreign"; },
    (r: RelationshipRow) => { r.sourceRevisionDigest = "c".repeat(64); },
    (r: RelationshipRow) => { r.evidence[0].transcriptHash = "c".repeat(64); },
    (r: RelationshipRow) => { r.evidence[0].quote = "Forged"; },
    (r: RelationshipRow) => { r.reviewHistory = []; },
  ]) {
    const row = structuredClone(f.row); mutate(row); f.setRows([row]);
    assert.deepEqual(await readAcceptedSpeakerRelationships(f.db, "A", "person:priya", f.authority), []);
  }
});

test("accepted reader refuses oversized inventory and identity/tenant mismatches without nested capability", async () => {
  const f = fixture();
  f.authority.view.identityStatus = "deterministic";
  assert.deepEqual(await readAcceptedSpeakerRelationships(f.db, "A", "person:priya", f.authority), []); assert.equal(f.reads(), 0);
  await assert.rejects(readAcceptedSpeakerRelationships(f.db, "B", "person:priya", f.authority), /Invalid speaker authority/);
  f.authority.view.identityStatus = "human-confirmed"; f.setRows(Array.from({ length: 101 }, () => structuredClone(f.row)));
  await assert.rejects(readAcceptedSpeakerRelationships(f.db, "A", "person:priya", f.authority), /inventory limit/);
});
